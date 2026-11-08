<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { mergeWithMultisetDeduplication } from '../../parsers/deduplicator';
import { parseSchwabContent, type SchwabParseResult, type DetectedTransfer } from '../../parsers/schwabParser';
import { fetchHistoricalStockPrice } from '../../services/historicalPrice';
import { showNotification } from '../../services/notification';
import { useMarketStore } from '../../stores/market';
import { usePortfolioStore } from '../../stores/portfolio';

const props = defineProps<{
  show: boolean;
  initialFile?: File | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'open-aliases'): void;
}>();

const store = usePortfolioStore();
const marketStore = useMarketStore();

const fileInput = ref<HTMLInputElement | null>(null);
const schwabImportData = ref<SchwabParseResult | null>(null);
const schwabImportMode = ref<'merge' | 'replace'>('merge');
const showSkippedDetails = ref(false);
const isSearchingTransferPrices = ref(false);
const customTransferPrices = ref<Record<string, number>>({});

onMounted(() => {
  loadCustomTransferPrices();
});

function loadCustomTransferPrices() {
  const saved = localStorage.getItem('custom_transfer_prices');
  if (saved) {
    try {
      customTransferPrices.value = JSON.parse(saved);
    } catch {
      customTransferPrices.value = {};
    }
  }
}

watch(
  () => [props.show, props.initialFile],
  async ([show, file]) => {
    if (show && file instanceof File) {
      await processFile(file);
    } else if (!show) {
      schwabImportData.value = null;
    }
  },
  { immediate: true }
);

async function processFile(file: File) {
  loadCustomTransferPrices();
  try {
    const text = await file.text();
    const result = parseSchwabContent(text, file.name, {
      customTransferPrices: customTransferPrices.value,
      resolveTickerFn: (s: string) => store.resolveTicker(s)
    });
    
    // Check saved transfer prices for detected transfers
    if (result.detectedTransfers) {
      result.detectedTransfers.forEach((item) => {
        const transferKey = `${store.resolveTicker(item.ticker)}_${item.date}`;
        if (customTransferPrices.value[transferKey] !== undefined && customTransferPrices.value[transferKey] > 0) {
          item.price = customTransferPrices.value[transferKey];
          item.sourceLabel = 'Saved / Custom';
        }
      });
    }

    schwabImportData.value = result;
  } catch (err: any) {
    console.error('Error reading Schwab file:', err);
    showNotification(`Failed to read file: ${err.message}`, 'error');
  }
}

function handleFileInputChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    processFile(file);
  }
  if (target) target.value = '';
}

function updateTransferPriceInImport(ticker: string, date: string, newPrice: number | string) {
  const prc = parseFloat(String(newPrice)) || 0;
  const resolved = store.resolveTicker(ticker);
  const transferKey = `${resolved}_${date}`;

  customTransferPrices.value[transferKey] = prc;

  if (schwabImportData.value && Array.isArray(schwabImportData.value.transactions)) {
    schwabImportData.value.transactions.forEach((tx) => {
      if (tx.originalAction === 'Security Transfer' && store.resolveTicker(tx.ticker) === resolved && tx.date === date) {
        tx.price = prc;
        const mult = tx.assetType === 'Stock' ? 1 : 100;
        const gross = tx.quantity * prc * mult;
        tx.totalValue = ['Buy', 'Buy to Open', 'Buy to Close'].includes(tx.action)
          ? gross + (tx.fee || 0)
          : gross - (tx.fee || 0);
      }
    });
  }

  if (schwabImportData.value && Array.isArray(schwabImportData.value.detectedTransfers)) {
    const item = schwabImportData.value.detectedTransfers.find(
      (d) => store.resolveTicker(d.ticker) === resolved && d.date === date
    );
    if (item) {
      item.price = prc;
      item.sourceLabel = prc > 0 ? 'User Specified' : 'Pending Input';
    }
  }
}

async function searchSingleTransferPrice(item: DetectedTransfer) {
  if (!item) return;
  item.status = 'searching';
  item.sourceLabel = 'Searching...';
  try {
    const found = await fetchHistoricalStockPrice(item.ticker, item.date, {
      geminiApiKey: marketStore.geminiApiKey,
      finnhubApiKey: marketStore.finnhubApiKey,
      resolveTicker: store.resolveTicker,
      transactions: store.transactions,
      marketPrices: store.marketPrices,
      customTransferPrices: customTransferPrices.value
    });
    if (found !== null && found > 0) {
      item.price = found;
      item.sourceLabel = 'Web / Suggested';
      updateTransferPriceInImport(item.ticker, item.date, found);
      showNotification(`Found suggested price for ${item.ticker}: $${found.toFixed(2)}`, 'success');
    } else {
      item.sourceLabel = 'Not Found';
      showNotification(`Could not auto-fetch price for ${item.ticker} on ${item.date}. Please enter manually.`, 'info');
    }
  } catch (err) {
    console.error('Error searching single transfer price:', err);
    item.sourceLabel = 'Error';
  } finally {
    item.status = 'ready';
  }
}

async function autoSearchAllTransferPrices() {
  if (!schwabImportData.value || !Array.isArray(schwabImportData.value.detectedTransfers)) return;
  isSearchingTransferPrices.value = true;
  let foundCount = 0;
  try {
    for (const item of schwabImportData.value.detectedTransfers) {
      item.status = 'searching';
      item.sourceLabel = 'Searching...';
      const found = await fetchHistoricalStockPrice(item.ticker, item.date, {
        geminiApiKey: marketStore.geminiApiKey,
        finnhubApiKey: marketStore.finnhubApiKey,
        resolveTicker: store.resolveTicker,
        transactions: store.transactions,
        marketPrices: store.marketPrices,
        customTransferPrices: customTransferPrices.value
      });
      if (found !== null && found > 0) {
        item.price = found;
        item.sourceLabel = 'Web / Suggested';
        updateTransferPriceInImport(item.ticker, item.date, found);
        foundCount++;
      } else if (!item.price || item.price <= 0) {
        item.sourceLabel = 'Pending Input';
      }
      item.status = 'ready';
    }
    showNotification(
      foundCount > 0
        ? `Auto-search updated prices for ${foundCount} transfer(s).`
        : 'Lookup complete. Review suggested or pending prices.',
      'info'
    );
  } catch (err) {
    console.error('Error during batch transfer price search:', err);
    showNotification('Failed to auto-search some transfer prices.', 'error');
  } finally {
    isSearchingTransferPrices.value = false;
  }
}

async function executeSchwabImport() {
  if (!schwabImportData.value) return;

  // Persist any reviewed/custom transfer prices to customTransferPrices and localStorage
  if (Array.isArray(schwabImportData.value.detectedTransfers)) {
    schwabImportData.value.detectedTransfers.forEach((item) => {
      if (item.price > 0) {
        customTransferPrices.value[item.key] = item.price;
      }
    });
    localStorage.setItem('custom_transfer_prices', JSON.stringify(customTransferPrices.value));
  }

  const newTrades = schwabImportData.value.transactions;
  let addedCount = 0;
  let duplicateCount = 0;

  if (schwabImportMode.value === 'replace') {
    await store.saveTransactions(newTrades);
    addedCount = newTrades.length;
  } else {
    const { merged, addedCount: added, duplicateCount: dupes } = mergeWithMultisetDeduplication(store.transactions, newTrades);
    await store.saveTransactions(merged);
    duplicateCount = dupes;
    addedCount = added;
  }

  // Auto-register stock tickers to marketPrices watchlist
  const priceUpdates: Record<string, number> = {};
  newTrades.forEach((t) => {
    if (t.assetType === 'Stock' && t.ticker) {
      if (store.marketPrices[t.ticker] === undefined) {
        priceUpdates[t.ticker] = t.price || 0;
      }
    }
  });
  if (Object.keys(priceUpdates).length > 0) {
    store.setMarketPrices(priceUpdates);
    store.savePrices();
  }

  const modeText = schwabImportMode.value === 'replace' ? 'replaced' : 'merged';
  showNotification(
    `Schwab report imported: ${addedCount} trades added${duplicateCount > 0 ? `, ${duplicateCount} duplicates skipped` : ''} (${modeText}).`,
    'success'
  );
  closeSchwabModal();
}

function closeSchwabModal() {
  schwabImportData.value = null;
  emit('close');
}

function formatNumber(val: number | string | undefined | null, decimals = 2): string {
  if (val === undefined || val === null || isNaN(Number(val))) return '0.00';
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
  >
    <div
      class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-2xl w-full shadow-2xl space-y-5 my-8 max-h-[92vh] overflow-y-auto"
    >
      <!-- Fallback Dropzone if no file loaded -->
      <div v-if="!schwabImportData" class="space-y-4">
        <div class="flex justify-between items-start border-b border-gray-700 pb-4">
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-indigo-900/60 border border-indigo-700 rounded text-indigo-300">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </span>
            <h3 class="text-lg font-bold text-white">Schwab Report Import</h3>
          </div>
          <button @click="closeSchwabModal" class="text-gray-400 hover:text-white text-lg font-bold px-2 py-1">✕</button>
        </div>

        <div
          @click="fileInput?.click()"
          class="border-2 border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-10 text-center cursor-pointer transition hover:bg-gray-750/40"
        >
          <input ref="fileInput" type="file" accept=".json,.xml" class="hidden" @change="handleFileInputChange" />
          <div class="space-y-3">
            <svg class="w-12 h-12 mx-auto text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <div class="text-base font-semibold text-white">Click or drag & drop Schwab export file</div>
            <div class="text-xs text-gray-400">Supports .json and .xml brokerage transaction reports</div>
          </div>
        </div>
      </div>

      <!-- Preview Modal Matching index.legacy.html lines 2025-2345 -->
      <template v-else>
        <!-- Modal Header -->
        <div class="flex justify-between items-start border-b border-gray-700 pb-4">
          <div>
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-indigo-900/60 border border-indigo-700 rounded text-indigo-300">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </span>
              <h3 class="text-lg font-bold text-white">Schwab Report Import</h3>
            </div>
            <p class="text-xs text-gray-400 mt-1">
              File: <span class="text-gray-200 font-mono">{{ schwabImportData.fileName }}</span>
              <span
                v-if="schwabImportData.fromDate && schwabImportData.toDate"
                class="ml-2 px-2 py-0.5 bg-gray-700 text-gray-300 rounded text-[11px]"
              >
                {{ schwabImportData.fromDate }} to {{ schwabImportData.toDate }}
              </span>
            </p>
          </div>
          <button @click="closeSchwabModal" class="text-gray-400 hover:text-white text-lg font-bold px-2 py-1">✕</button>
        </div>

        <!-- Summary Stats Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-700/60 text-center">
            <div class="text-[11px] text-gray-400 uppercase font-semibold">Total Records</div>
            <div class="text-xl font-bold text-white mt-1">{{ schwabImportData.stats.total }}</div>
          </div>
          <div class="bg-indigo-950/40 p-3 rounded-lg border border-indigo-800/40 text-center">
            <div class="text-[11px] text-indigo-400 uppercase font-semibold">Valid Trades</div>
            <div class="text-xl font-bold text-indigo-300 mt-1">{{ schwabImportData.stats.trades }}</div>
          </div>
          <div class="bg-emerald-950/40 p-3 rounded-lg border border-emerald-800/40 text-center">
            <div class="text-[11px] text-emerald-400 uppercase font-semibold">Stock Trades</div>
            <div class="text-xl font-bold text-emerald-300 mt-1">{{ schwabImportData.stats.stocks }}</div>
          </div>
          <div class="bg-amber-950/40 p-3 rounded-lg border border-amber-800/40 text-center">
            <div class="text-[11px] text-amber-400 uppercase font-semibold">Option Trades</div>
            <div class="text-xl font-bold text-amber-300 mt-1">{{ schwabImportData.stats.options }}</div>
          </div>
        </div>

        <!-- Ticker Aliases Active notice -->
        <div
          class="bg-indigo-950/30 border border-indigo-800/50 rounded-lg p-3 text-xs flex justify-between items-center"
        >
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <div>
              <span class="text-gray-200">
                Ticker Aliases:
                <strong v-for="(to, from) in store.tickerAliases" :key="from" class="text-amber-300 ml-1">
                  {{ from }} → {{ to }}
                </strong>
                <span v-if="Object.keys(store.tickerAliases).length === 0" class="text-gray-400 ml-1">None active</span>
              </span>
              <span v-if="schwabImportData.stats.aliasMapped > 0" class="text-indigo-300 ml-1.5 font-medium">
                ({{ schwabImportData.stats.aliasMapped }} trades unified)
              </span>
            </div>
          </div>
          <button
            type="button"
            @click="emit('open-aliases')"
            class="text-indigo-400 hover:text-indigo-300 text-[11px] font-semibold underline whitespace-nowrap ml-2"
          >
            Manage Aliases
          </button>
        </div>

        <!-- Non-trade entries note -->
        <div v-if="schwabImportData.stats.skipped > 0" class="bg-gray-900/40 border border-gray-700/60 rounded-lg p-3 text-xs">
          <div
            class="flex justify-between items-center cursor-pointer select-none"
            @click="showSkippedDetails = !showSkippedDetails"
          >
            <div class="flex items-center gap-2 text-gray-300">
              <span class="w-2 h-2 rounded-full bg-blue-400"></span>
              <span>
                <strong>{{ schwabImportData.stats.skipped }} non-trade records</strong> detected and skipped (dividends, cash interest, transfers).
              </span>
            </div>
            <span class="text-blue-400 hover:text-blue-300 text-[11px] underline">
              {{ showSkippedDetails ? 'Hide details' : 'View breakdown' }}
            </span>
          </div>
          <div v-show="showSkippedDetails" class="mt-2 pt-2 border-t border-gray-700/60 flex flex-wrap gap-1.5">
            <span
              v-for="(count, action) in schwabImportData.skippedBreakdown"
              :key="action"
              class="px-2 py-0.5 bg-gray-800 border border-gray-700 rounded text-[11px] text-gray-300"
            >
              {{ action }}: <strong class="text-white">{{ count }}</strong>
            </span>
          </div>
        </div>

        <!-- Inbound Transferred Securities Cost Basis Review Section -->
        <div
          v-if="schwabImportData.detectedTransfers && schwabImportData.detectedTransfers.length > 0"
          class="bg-indigo-950/30 border border-indigo-500/40 rounded-xl p-4 space-y-3"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-indigo-600/30 border border-indigo-500/50 rounded-lg text-indigo-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </span>
              <div>
                <h4 class="text-sm font-bold text-white flex items-center gap-2">
                  Inbound Transfers: Review Cost Basis
                  <span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-xs border border-indigo-500/30 font-mono">
                    {{ schwabImportData.detectedTransfers.length }} Transferred Positions
                  </span>
                </h4>
                <p class="text-xs text-gray-400">
                  Schwab cash exports do not include purchase prices for ACAT transferred positions. Review suggested prices or auto-search historical market close.
                </p>
              </div>
            </div>
            <button
              type="button"
              @click="autoSearchAllTransferPrices"
              :disabled="isSearchingTransferPrices"
              class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-xs font-semibold rounded-lg transition shadow flex items-center justify-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
            >
              <svg v-if="isSearchingTransferPrices" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>{{ isSearchingTransferPrices ? 'Searching Web...' : 'Auto-Search All from Web' }}</span>
            </button>
          </div>

          <div class="overflow-x-auto max-h-56 border border-gray-700/60 rounded-lg bg-gray-900/60">
            <table class="w-full text-left text-xs whitespace-nowrap">
              <thead class="bg-gray-900/90 text-gray-400 border-b border-gray-700 uppercase font-semibold">
                <tr>
                  <th class="p-2.5">Security / Symbol</th>
                  <th class="p-2.5">Transfer Date</th>
                  <th class="p-2.5 text-right">Shares / Qty</th>
                  <th class="p-2.5">Price Source & Status</th>
                  <th class="p-2.5 text-right w-36">Cost Basis ($ / share)</th>
                  <th class="p-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700/50">
                <tr v-for="item in schwabImportData.detectedTransfers" :key="item.key" class="hover:bg-gray-800/40">
                  <td class="p-2.5">
                    <span class="font-bold text-white text-sm">{{ item.ticker }}</span>
                    <span class="text-[11px] text-gray-400 block">
                      {{ item.assetType }} <span v-if="item.optionDetails" class="text-amber-400">({{ item.optionDetails }})</span>
                    </span>
                  </td>
                  <td class="p-2.5 font-mono text-gray-300">{{ item.date }}</td>
                  <td class="p-2.5 text-right font-mono font-medium text-white">{{ item.quantity }}</td>
                  <td class="p-2.5">
                    <span
                      :class="item.price > 0 ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50' : 'text-amber-400 bg-amber-950/40 border-amber-800/50'"
                      class="px-2 py-0.5 rounded text-[11px] font-medium border inline-flex items-center gap-1"
                    >
                      <span class="w-1.5 h-1.5 rounded-full" :class="item.price > 0 ? 'bg-emerald-400' : 'bg-amber-400'"></span>
                      {{ item.sourceLabel || (item.price > 0 ? 'Ready' : 'Pending Input') }}
                    </span>
                  </td>
                  <td class="p-2.5 text-right">
                    <div class="flex items-center justify-end gap-1">
                      <span class="text-gray-400 font-mono">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        v-model.number="item.price"
                        @input="updateTransferPriceInImport(item.ticker, item.date, item.price)"
                        placeholder="0.00"
                        class="w-24 bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded px-2 py-1 text-right text-white font-mono text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </td>
                  <td class="p-2.5 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        @click="searchSingleTransferPrice(item)"
                        :disabled="item.status === 'searching'"
                        class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded border border-gray-700 text-[11px] transition inline-flex items-center gap-1"
                        title="Fetch historical price on this transfer date via configured API / AI"
                      >
                        <svg class="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <span>Search</span>
                      </button>
                      <a
                        :href="'https://www.google.com/search?q=' + encodeURIComponent(item.ticker + ' stock price on ' + item.date)"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-emerald-400 rounded border border-gray-700 text-[11px] transition inline-flex items-center gap-1"
                        title="Look up historical market close on Google in a new tab (no API key required)"
                      >
                        <svg class="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        <span>Google</span>
                      </a>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Import Mode Selection -->
        <div>
          <label class="block text-xs font-semibold uppercase text-gray-400 mb-2">Select Import Mode</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label
              :class="schwabImportMode === 'merge' ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-700 bg-gray-700/20 hover:border-gray-600'"
              class="flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition"
            >
              <input
                type="radio"
                v-model="schwabImportMode"
                value="merge"
                class="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div class="text-sm font-semibold text-white">Merge & Deduplicate</div>
                <div class="text-xs text-gray-400 mt-0.5">
                  Append only new trades to your current ledger. Existing trades matching date, symbol & action will not be duplicated.
                </div>
              </div>
            </label>
            <label
              :class="schwabImportMode === 'replace' ? 'border-indigo-500 bg-indigo-950/20' : 'border-gray-700 bg-gray-700/20 hover:border-gray-600'"
              class="flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition"
            >
              <input
                type="radio"
                v-model="schwabImportMode"
                value="replace"
                class="mt-0.5 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div class="text-sm font-semibold text-white">Replace Entire Ledger</div>
                <div class="text-xs text-gray-400 mt-0.5">
                  Clear the current ledger and import this report as the complete record. Recommended for first full import.
                </div>
              </div>
            </label>
          </div>
        </div>

        <!-- Sample Trades Preview -->
        <div>
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-xs font-semibold uppercase text-gray-400">Sample Parsed Transactions (First 5)</span>
            <span class="text-[11px] text-gray-500">Total ready: {{ schwabImportData.transactions.length }}</span>
          </div>
          <div class="overflow-x-auto max-h-48 border border-gray-700/70 rounded-lg">
            <table class="w-full text-left text-xs whitespace-nowrap">
              <thead class="bg-gray-900 text-gray-400 border-b border-gray-700">
                <tr>
                  <th class="p-2">Date</th>
                  <th class="p-2">Type</th>
                  <th class="p-2">Asset / Contract</th>
                  <th class="p-2">Action</th>
                  <th class="p-2 text-right">Qty</th>
                  <th class="p-2 text-right">Price</th>
                  <th class="p-2 text-right">Net Value</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-700/40">
                <tr
                  v-for="t in schwabImportData.transactions.slice(0, 5)"
                  :key="t.id"
                  class="hover:bg-gray-700/20"
                >
                  <td class="p-2 text-gray-300 font-mono">{{ t.date }}</td>
                  <td class="p-2">
                    <span :class="t.assetType === 'Stock' ? 'text-blue-400' : 'text-purple-400'">{{ t.assetType }}</span>
                  </td>
                  <td class="p-2">
                    <span class="font-bold text-white">{{ t.ticker }}</span>
                    <span v-if="t.assetType === 'Option'" class="text-[10px] text-gray-400 block">
                      {{ t.optionType }} ${{ t.strike }} Exp {{ t.expiration }}
                    </span>
                  </td>
                  <td class="p-2">
                    <span
                      :class="['Buy', 'Buy to Open', 'Buy to Close'].includes(t.action) ? 'text-emerald-400' : (['Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(t.action) ? 'text-gray-400' : 'text-rose-400')"
                    >
                      {{ t.action }}
                    </span>
                  </td>
                  <td class="p-2 text-right font-mono">{{ t.quantity }}</td>
                  <td class="p-2 text-right font-mono">${{ formatNumber(t.price) }}</td>
                  <td
                    class="p-2 text-right font-mono font-medium"
                    :class="['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(t.action) ? 'text-rose-400' : 'text-emerald-400'"
                  >
                    {{ ['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(t.action) ? '-' : '+' }}${{ formatNumber(t.totalValue) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Modal Actions -->
        <div class="flex justify-between items-center pt-3 border-t border-gray-700">
          <button
            type="button"
            @click="schwabImportData = null"
            class="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition underline cursor-pointer"
          >
            Change File
          </button>
          <div class="flex items-center gap-3">
            <button
              @click="closeSchwabModal"
              class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              @click="executeSchwabImport"
              class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition shadow-lg shadow-indigo-900/30 flex items-center gap-2 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
              Confirm Import ({{ schwabImportData.transactions.length }} Trades)
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
