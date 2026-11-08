<script setup lang="ts">
import { ref, watch } from 'vue';
import { SUPPORTED_CURRENCIES } from '../../services/fx';
import { useCurrencyStore } from '../../stores/currency';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const currencyStore = useCurrencyStore();
const customRateInput = ref<string>('');

watch(
  () => [props.show, currencyStore.selectedCurrency],
  () => {
    if (currencyStore.customFxRates[currencyStore.selectedCurrency]) {
      customRateInput.value = String(currencyStore.customFxRates[currencyStore.selectedCurrency]);
    } else {
      customRateInput.value = (currencyStore.exchangeRates[currencyStore.selectedCurrency] || 1).toString();
    }
  },
  { immediate: true }
);

function handleApplyCustomRate() {
  const parsed = parseFloat(customRateInput.value);
  if (!isNaN(parsed) && parsed > 0) {
    currencyStore.saveCustomFxRate(currencyStore.selectedCurrency, parsed);
  }
}

function handleResetRate() {
  currencyStore.resetCustomFxRate(currencyStore.selectedCurrency);
  customRateInput.value = (currencyStore.exchangeRates[currencyStore.selectedCurrency] || 1).toString();
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
  >
    <div class="bg-gray-900 border border-gray-700/90 rounded-2xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 my-auto flex flex-col">
      <!-- Modal Header -->
      <div class="flex justify-between items-center border-b border-gray-800 pb-3">
        <div class="flex items-center gap-2.5">
          <span class="p-2 bg-emerald-950/70 border border-emerald-800/80 rounded-xl text-emerald-400 font-bold font-mono text-base">
            {{ currencyStore.currencySymbol }}
          </span>
          <div>
            <h2 class="text-lg font-bold text-white">Currency & FX Settings</h2>
            <p class="text-xs text-gray-400">Configure display currency and conversion exchange rates</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-white text-xl font-bold px-2 py-1 rounded-lg hover:bg-gray-800 transition"
        >
          ✕
        </button>
      </div>

      <!-- Currency Picker Grid -->
      <div class="space-y-2">
        <label class="text-xs font-semibold text-gray-300">Select Display Currency</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="c in SUPPORTED_CURRENCIES"
            :key="c.code"
            @click="currencyStore.selectCurrency(c.code)"
            class="p-2.5 rounded-xl border text-left transition flex items-center gap-2 cursor-pointer"
            :class="currencyStore.selectedCurrency === c.code ? 'bg-emerald-950/70 border-emerald-500 text-white shadow-md' : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-750 hover:text-white'"
          >
            <span class="text-xl">{{ c.flag }}</span>
            <div class="min-w-0">
              <div class="font-bold text-xs flex items-center gap-1">
                <span>{{ c.code }}</span>
                <span class="text-[10px] text-gray-400 font-normal">({{ c.symbol }})</span>
              </div>
              <div class="text-[9.5px] text-gray-400 truncate">{{ c.name }}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Live vs Custom Rate for Active Currency -->
      <div v-if="currencyStore.selectedCurrency !== 'USD'" class="bg-gray-850 border border-gray-800 rounded-xl p-3.5 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              <span>1 USD = {{ currencyStore.activeFxRate.toFixed(currencyStore.selectedCurrency === 'JPY' ? 1 : 4) }} {{ currencyStore.selectedCurrency }}</span>
              <span
                v-if="currencyStore.customFxRates[currencyStore.selectedCurrency]"
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-950 text-amber-300 border border-amber-800"
              >
                Custom Override
              </span>
              <span
                v-else
                class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800"
              >
                Live Rate
              </span>
            </div>
            <div class="text-[10px] text-gray-400 mt-0.5">
              Market Mid-Rate: 1 USD = {{ (currencyStore.exchangeRates[currencyStore.selectedCurrency] || 1).toFixed(4) }} {{ currencyStore.selectedCurrency }}
              <span v-if="currencyStore.fxLastUpdated">({{ currencyStore.fxLastUpdated }})</span>
            </div>
          </div>
          <button
            @click="currencyStore.fetchExchangeRates(true)"
            :disabled="currencyStore.isFetchingFx"
            class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-750 border border-gray-700 text-gray-300 text-xs flex items-center gap-1 transition cursor-pointer"
          >
            <svg :class="{ 'animate-spin': currencyStore.isFetchingFx }" class="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24">
              <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>{{ currencyStore.isFetchingFx ? 'Fetching...' : 'Update Live' }}</span>
          </button>
        </div>

        <!-- Custom Rate Override Input -->
        <div class="pt-2 border-t border-gray-800/80">
          <label class="text-[11px] font-medium text-gray-300 block mb-1">
            Custom Bank / Exchange Rate Override (Optional):
          </label>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <span class="absolute left-2.5 top-2 text-xs text-gray-500 font-mono">1 USD =</span>
              <input
                type="number"
                step="0.0001"
                v-model="customRateInput"
                :placeholder="(currencyStore.exchangeRates[currencyStore.selectedCurrency] || 1).toString()"
                class="w-full bg-gray-800 border border-gray-700 rounded-lg pl-16 pr-12 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
              <span class="absolute right-2.5 top-2 text-xs text-gray-400 font-mono">{{ currencyStore.selectedCurrency }}</span>
            </div>
            <button
              @click="handleApplyCustomRate"
              class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition"
            >
              Apply
            </button>
            <button
              v-if="currencyStore.customFxRates[currencyStore.selectedCurrency]"
              @click="handleResetRate"
              class="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition border border-gray-700"
              title="Reset to live open market exchange rate"
            >
              Reset
            </button>
          </div>
        </div>

        <!-- Preview Conversion -->
        <div class="bg-gray-900/80 rounded-lg p-2.5 text-[11px] text-gray-300 flex items-center justify-between border border-gray-800">
          <span class="text-gray-400">Sample $1,000 USD portfolio:</span>
          <span class="font-mono font-bold text-emerald-400">{{ currencyStore.formatMoney(1000) }}</span>
        </div>
      </div>

      <div v-else class="bg-gray-850 border border-gray-800 rounded-xl p-3.5 text-xs text-gray-300">
        <div class="font-semibold text-white flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          USD is the native base currency (1.00)
        </div>
        <p class="text-[11px] text-gray-400 mt-1">
          All Schwab and IBKR broker transactions and live market quotes are imported and stored natively in USD.
        </p>
      </div>

      <div class="flex justify-end gap-2 pt-2 border-t border-gray-800">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 bg-gray-800 hover:bg-gray-750 text-white rounded-lg text-xs font-semibold transition border border-gray-700"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
