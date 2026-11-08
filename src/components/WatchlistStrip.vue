<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMarketStore } from '../stores/market';
import { usePortfolioStore } from '../stores/portfolio';

const portfolioStore = usePortfolioStore();
const marketStore = useMarketStore();

const showManualPrices = ref<boolean>(localStorage.getItem('show_manual_prices') === 'true');
const newWatchlistTicker = ref<string>('');

function toggleShowManualPrices() {
  showManualPrices.value = !showManualPrices.value;
  localStorage.setItem('show_manual_prices', String(showManualPrices.value));
}

const uniqueStockTickers = computed(() => portfolioStore.uniqueStockTickers);

function isTickerInHoldings(ticker: string): boolean {
  return portfolioStore.stockHoldings.some(h => h.symbol === ticker);
}

function savePrices() {
  portfolioStore.savePrices();
}

function hideTicker(ticker: string) {
  marketStore.hideTicker(ticker);
}

function addWatchlistTicker() {
  const ticker = newWatchlistTicker.value.toUpperCase().trim();
  if (!ticker) return;

  marketStore.unhideTicker(ticker);
  marketStore.addWatchlistTicker(ticker);

  if (portfolioStore.marketPrices[ticker] === undefined) {
    portfolioStore.marketPrices[ticker] = 0.00;
  }
  savePrices();

  newWatchlistTicker.value = '';
}
</script>

<template>
  <!-- Stock Price Manual Updates -->
  <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
    <h2
      @click="toggleShowManualPrices"
      class="text-lg font-semibold mb-2 text-emerald-400 cursor-pointer flex justify-between items-center select-none"
    >
      <span>Stock Price Manual Updates</span>
      <svg
        :class="{ 'rotate-180': showManualPrices }"
        class="w-5 h-5 transition-transform"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </h2>

    <div v-show="showManualPrices">
      <p class="text-xs text-gray-400 mb-4 flex items-center justify-between flex-wrap gap-1">
        <span>Values update automatically with Stock API, or can be adjusted here manually.</span>
        <span
          v-if="marketStore.lastSyncTime"
          class="text-emerald-400 font-mono text-[11px] bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800/40"
        >
          Last synced: {{ marketStore.lastSyncTime }}
        </span>
      </p>

      <div class="space-y-3 max-h-60 overflow-y-auto pr-1">
        <div
          v-for="ticker in uniqueStockTickers"
          :key="ticker"
          class="flex justify-between items-center bg-gray-700/40 p-2 rounded"
        >
          <span class="font-bold text-sm text-gray-300">{{ ticker }}</span>
          <div class="flex items-center space-x-2">
            <span class="text-xs text-gray-400">$</span>
            <input
              type="number"
              step="any"
              v-model.number="portfolioStore.marketPrices[ticker]"
              @input="savePrices"
              class="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-right text-white"
            />
            <button
              v-if="!isTickerInHoldings(ticker)"
              @click="hideTicker(ticker)"
              title="Remove from tracking"
              class="text-rose-400 hover:text-rose-300 p-1 bg-gray-800 rounded border border-gray-600 hover:border-rose-400 transition flex items-center justify-center"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div v-if="uniqueStockTickers.length === 0" class="text-xs text-gray-500 text-center py-4">
          No stock assets tracked yet.
        </div>
      </div>

      <!-- Add Manual Watchlist Ticker -->
      <div class="mt-4 pt-3 border-t border-gray-700/50 flex space-x-2 items-center">
        <input
          type="text"
          v-model="newWatchlistTicker"
          placeholder="e.g. MSFT"
          @keyup.enter="addWatchlistTicker"
          class="flex-1 bg-gray-700 border border-gray-600 rounded p-1.5 text-xs text-white uppercase placeholder-gray-500 focus:outline-none focus:border-emerald-500"
        />
        <button
          @click="addWatchlistTicker"
          class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-emerald-400 text-xs font-semibold rounded border border-gray-600 hover:border-emerald-500 transition whitespace-nowrap"
        >
          Add to Watchlist
        </button>
      </div>
    </div>
  </div>
</template>
