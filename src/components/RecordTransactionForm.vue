<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { usePortfolioStore } from '../stores/portfolio';
import type { AssetType, OptionType, TransactionAction } from '../types/portfolio';

const store = usePortfolioStore();

const today = new Date().toISOString().split('T')[0];

const form = reactive<{
  assetType: AssetType;
  action: TransactionAction;
  ticker: string;
  quantity: number | null;
  price: number | null;
  fee: number;
  date: string;
  optionType: OptionType;
  strike: number | null;
  expiration: string;
  strategyName: string;
}>({
  assetType: 'Stock',
  action: 'Buy',
  ticker: '',
  quantity: null,
  price: null,
  fee: 0.0,
  date: today,
  optionType: 'Call',
  strike: null,
  expiration: '',
  strategyName: ''
});

const availableActions = computed(() => {
  if (form.assetType === 'Stock') {
    return [
      { value: 'Buy', label: 'Buy' },
      { value: 'Sell', label: 'Sell' }
    ];
  }
  return [
    { value: 'Buy to Open', label: 'Buy to Open (Long)' },
    { value: 'Sell to Open', label: 'Sell to Open (Short / Credit)' },
    { value: 'Buy to Close', label: 'Buy to Close' },
    { value: 'Sell to Close', label: 'Sell to Close' },
    { value: 'Expire', label: 'Expire / Expired' },
    { value: 'Assigned', label: 'Assigned / Exercised' }
  ];
});

function setAssetType(type: AssetType) {
  if (store.isRolling) return;
  form.assetType = type;
  form.action = type === 'Stock' ? 'Buy' : 'Buy to Open';
}

// Watch roll state changes to automatically populate form fields
watch(
  () => store.isRolling,
  (rolling) => {
    if (rolling && store.rollSourceHolding) {
      const h = store.rollSourceHolding;
      form.assetType = h.assetType;
      form.ticker = h.symbol;
      form.quantity = h.quantity;
      form.optionType = h.optionType || 'Call';
      form.strike = typeof h.strike === 'number' ? h.strike : (parseFloat(String(h.strike)) || null);
      form.expiration = h.expiration || '';
      form.action = h.positionType === 'Long' ? 'Sell to Close' : 'Buy to Close';
      form.price = null;
      form.fee = 0.0;
    }
  }
);

async function handleSubmit() {
  if (!form.ticker.trim() || !form.quantity || form.price === null) return;

  const txData = {
    date: form.date,
    assetType: form.assetType,
    ticker: form.ticker.trim().toUpperCase(),
    action: form.action,
    quantity: form.quantity,
    price: form.price,
    fee: form.fee || 0,
    optionType: form.assetType === 'Option' ? form.optionType : null,
    strike: form.assetType === 'Option' ? form.strike : null,
    expiration: form.assetType === 'Option' ? form.expiration : null,
    strategyName: form.strategyName || null
  };

  await store.addTransaction(txData);

  // Handle Roll transitions
  if (store.isRolling) {
    if (store.rollStep === 1) {
      store.rollStep = 2;
      form.action = store.rollSourceHolding?.positionType === 'Long' ? 'Buy to Open' : 'Sell to Open';
      form.price = null;
      return;
    } else {
      store.cancelRoll();
    }
  }

  // Reset form fields
  form.quantity = null;
  form.price = null;
  form.fee = 0.0;
  form.strategyName = '';
}
</script>

<template>
  <div class="bg-gray-800 rounded-xl border border-gray-700 p-4 sm:p-6 mb-8 shadow-sm">
    <!-- Header Toggle -->
    <h2
      @click="store.toggleRecordTransaction"
      class="text-base sm:text-lg font-semibold text-emerald-400 cursor-pointer flex justify-between items-center select-none"
      :class="store.showRecordTransaction ? 'mb-4' : 'mb-0'"
    >
      <span class="flex items-center gap-2">
        <svg class="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Record Transaction
      </span>
      <svg
        :class="{ 'rotate-180': store.showRecordTransaction }"
        class="w-5 h-5 transition-transform"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </h2>

    <div v-show="store.showRecordTransaction">
      <!-- Roll State Banner -->
      <div
        v-if="store.isRolling"
        class="mb-4 p-3 bg-amber-950/60 border border-amber-800/80 rounded-lg flex items-center justify-between text-xs"
      >
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 rounded bg-amber-600 text-white font-bold font-mono">
            ROLL STEP {{ store.rollStep }} OF 2
          </span>
          <span class="text-amber-200">
            {{ store.rollStep === 1 ? `Closing ${store.rollSourceHolding?.symbol} contract...` : 'Opening new replacement contract...' }}
          </span>
        </div>
        <button
          type="button"
          @click="store.cancelRoll"
          class="text-amber-400 hover:text-white underline"
        >
          Cancel Roll
        </button>
      </div>

      <form @submit.prevent="handleSubmit" class="space-y-4 text-xs">
        <!-- Asset Type Selector -->
        <div>
          <label class="block text-gray-400 mb-1">Asset Type</label>
          <div class="flex space-x-2">
            <button
              type="button"
              :disabled="store.isRolling"
              @click="setAssetType('Stock')"
              :class="[form.assetType === 'Stock' ? 'bg-emerald-600 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-650', store.isRolling ? 'opacity-40 cursor-not-allowed' : '']"
              class="flex-1 py-2 rounded-lg transition"
            >
              Stock
            </button>
            <button
              type="button"
              :disabled="store.isRolling"
              @click="setAssetType('Option')"
              :class="[form.assetType === 'Option' ? 'bg-emerald-600 text-white font-semibold' : 'bg-gray-700 text-gray-300 hover:bg-gray-650', store.isRolling ? 'opacity-40 cursor-not-allowed' : '']"
              class="flex-1 py-2 rounded-lg transition"
            >
              Option
            </button>
          </div>
        </div>

        <!-- Action & Ticker -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-gray-400 mb-1">Action</label>
            <select
              v-model="form.action"
              :disabled="store.isRolling && store.rollStep === 1"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              <option v-for="action in availableActions" :key="action.value" :value="action.value">
                {{ action.label }}
              </option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Ticker Symbol</label>
            <input
              type="text"
              v-model="form.ticker"
              :disabled="store.isRolling"
              placeholder="e.g. NVDA"
              required
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white placeholder-gray-500 uppercase font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
        </div>

        <!-- Option Specific Fields -->
        <div
          v-if="form.assetType === 'Option'"
          class="space-y-3 p-3.5 bg-gray-750/50 rounded-lg border border-gray-700"
        >
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="block text-gray-400 mb-1">Option Type</label>
              <select
                v-model="form.optionType"
                :disabled="store.isRolling && store.rollStep === 1"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white disabled:opacity-50"
              >
                <option value="Call">Call</option>
                <option value="Put">Put</option>
              </select>
            </div>
            <div>
              <label class="block text-gray-400 mb-1">Strike Price ($)</label>
              <input
                type="number"
                step="any"
                v-model.number="form.strike"
                placeholder="Strike"
                class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white font-mono"
              />
            </div>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Expiration Date</label>
            <input
              type="date"
              v-model="form.expiration"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white font-mono"
            />
          </div>
        </div>

        <!-- Quantity, Price, Fee -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-gray-400 mb-1 min-h-[2.25rem] flex items-end pb-0.5">
              {{ form.assetType === 'Stock' ? 'Shares' : 'Contracts' }}
            </label>
            <input
              type="number"
              step="any"
              v-model.number="form.quantity"
              :disabled="store.isRolling"
              required
              min="0.0001"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label class="block text-gray-400 mb-1 min-h-[2.25rem] flex items-end pb-0.5">
              Price per {{ form.assetType === 'Stock' ? 'Share ($)' : 'Contract ($)' }}
            </label>
            <input
              type="number"
              step="any"
              v-model.number="form.price"
              required
              min="0.00"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label class="block text-gray-400 mb-1 min-h-[2.25rem] flex items-end pb-0.5">Fee ($)</label>
            <input
              type="number"
              step="any"
              v-model.number="form.fee"
              min="0.00"
              class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
            />
          </div>
        </div>

        <!-- Date -->
        <div>
          <label class="block text-gray-400 mb-1">Transaction Date</label>
          <input
            type="date"
            v-model="form.date"
            required
            class="w-full bg-gray-700 border border-gray-600 rounded-lg p-2.5 text-white font-mono focus:outline-none focus:border-emerald-500"
          />
        </div>

        <!-- Submit Button -->
        <button
          type="submit"
          class="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg transition shadow-md"
        >
          <span v-if="!store.isRolling">Record Transaction</span>
          <span v-else-if="store.rollStep === 1">Complete Step 1: Close Position</span>
          <span v-else>Complete Step 2: Open New Contract</span>
        </button>
      </form>
    </div>
  </div>
</template>
