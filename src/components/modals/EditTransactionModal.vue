<script setup lang="ts">
import { reactive, watch } from 'vue';
import { usePortfolioStore } from '../../stores/portfolio';
import type { OptionType, Transaction, TransactionAction } from '../../types/portfolio';

const props = defineProps<{
  show: boolean;
  transaction: Transaction | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();

const form = reactive<{
  id: string | number;
  date: string;
  ticker: string;
  action: TransactionAction;
  quantity: number;
  price: number;
  fee: number;
  assetType: 'Stock' | 'Option' | 'Spread';
  optionType: OptionType | null;
  strike: number | null;
  expiration: string | null;
  strategyName: string | null;
}>({
  id: '',
  date: '',
  ticker: '',
  action: 'Buy',
  quantity: 0,
  price: 0,
  fee: 0,
  assetType: 'Stock',
  optionType: null,
  strike: null,
  expiration: null,
  strategyName: null
});

watch(
  () => props.transaction,
  (tx) => {
    if (tx) {
      form.id = tx.id;
      form.date = tx.date;
      form.ticker = tx.ticker;
      form.action = tx.action;
      form.quantity = tx.quantity;
      form.price = tx.price;
      form.fee = tx.fee || 0;
      form.assetType = tx.assetType;
      form.optionType = tx.optionType || null;
      form.strike = typeof tx.strike === 'number' ? tx.strike : (parseFloat(String(tx.strike)) || null);
      form.expiration = tx.expiration || null;
      form.strategyName = tx.strategyName || null;
    }
  },
  { immediate: true }
);

async function handleSave() {
  if (!form.id) return;
  await store.updateTransaction({
    id: form.id,
    date: form.date,
    ticker: form.ticker.trim().toUpperCase(),
    action: form.action,
    quantity: form.quantity,
    price: form.price,
    fee: form.fee,
    assetType: form.assetType,
    optionType: form.optionType,
    strike: form.strike,
    expiration: form.expiration,
    strategyName: form.strategyName
  });
  emit('close');
}
</script>

<template>
  <div v-if="show && transaction" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4 text-xs">
      <!-- Header -->
      <div class="flex justify-between items-start border-b border-gray-700 pb-3">
        <div>
          <h3 class="text-base font-bold text-white flex items-center gap-2">
            <svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit Transaction
          </h3>
          <p class="text-gray-400 mt-0.5">Modify date, quantity, price, or fee for this trade.</p>
        </div>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-lg font-bold">✕</button>
      </div>

      <form @submit.prevent="handleSave" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-gray-400 mb-1">Date</label>
            <input type="date" v-model="form.date" required class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-mono" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Ticker</label>
            <input type="text" v-model="form.ticker" required class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white uppercase font-mono" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-gray-400 mb-1">Action</label>
            <select v-model="form.action" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
              <option value="Buy">Buy</option>
              <option value="Sell">Sell</option>
              <option value="Buy to Open">Buy to Open</option>
              <option value="Sell to Open">Sell to Open</option>
              <option value="Buy to Close">Buy to Close</option>
              <option value="Sell to Close">Sell to Close</option>
              <option value="Expire">Expire</option>
              <option value="Assigned">Assigned</option>
            </select>
          </div>
          <div>
            <label class="block text-gray-400 mb-1">{{ form.assetType === 'Stock' ? 'Shares' : 'Contracts' }}</label>
            <input type="number" step="any" v-model.number="form.quantity" required min="0" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-mono" />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-gray-400 mb-1">Price ($)</label>
            <input type="number" step="any" v-model.number="form.price" required min="0" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-mono" />
          </div>
          <div>
            <label class="block text-gray-400 mb-1">Fee ($)</label>
            <input type="number" step="any" v-model.number="form.fee" required min="0" class="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-mono" />
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-3 border-t border-gray-700">
          <button type="button" @click="emit('close')" class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded font-semibold transition">
            Cancel
          </button>
          <button type="submit" class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-semibold transition shadow">
            Save Changes
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
