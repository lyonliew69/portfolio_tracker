<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { formatPercent } from '../../services/fx';
import { useCurrencyStore } from '../../stores/currency';
import { usePortfolioStore } from '../../stores/portfolio';
import type { RealizedStockRecord } from '../../types/portfolio';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const currentYear = new Date().getFullYear().toString();
const activeTab = ref<'trades' | 'yearly'>('trades');
const yearFilter = ref(currentYear);
const dateFrom = ref('');
const dateTo = ref('');
const tickerFilter = ref('ALL');
const outcomeFilter = ref<'ALL' | 'WIN' | 'LOSS'>('ALL');
const searchQuery = ref('');
const sortKey = ref<keyof RealizedStockRecord>('date');
const sortAsc = ref(false);
const page = ref(1);
const perPage = ref(25);

const availableYears = computed(() => {
  const years = new Set(store.realizedStockRecords.map(r => r.year).filter(Boolean));
  years.add(currentYear);
  return Array.from(years).sort().reverse();
});

const availableTickers = computed(() => {
  const tickers = new Set(store.realizedStockRecords.map(r => r.ticker).filter(Boolean));
  return Array.from(tickers).sort();
});

function setYear(y: string) {
  yearFilter.value = y;
  dateFrom.value = '';
  dateTo.value = '';
  page.value = 1;
}

function resetFilters() {
  yearFilter.value = currentYear;
  dateFrom.value = '';
  dateTo.value = '';
  tickerFilter.value = 'ALL';
  outcomeFilter.value = 'ALL';
  searchQuery.value = '';
  page.value = 1;
}

const filteredRecords = computed(() => {
  let list = [...store.realizedStockRecords];

  if (yearFilter.value !== 'ALL' && !dateFrom.value && !dateTo.value) {
    list = list.filter(r => r.year === yearFilter.value);
  }
  if (dateFrom.value) {
    list = list.filter(r => r.date >= dateFrom.value);
  }
  if (dateTo.value) {
    list = list.filter(r => r.date <= dateTo.value);
  }
  if (tickerFilter.value !== 'ALL') {
    list = list.filter(r => r.ticker === tickerFilter.value);
  }
  if (outcomeFilter.value === 'WIN') {
    list = list.filter(r => r.profit > 0.001);
  } else if (outcomeFilter.value === 'LOSS') {
    list = list.filter(r => r.profit < -0.001);
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(r => r.ticker.toLowerCase().includes(q) || r.date.includes(q));
  }

  list.sort((a, b) => {
    let valA: any = a[sortKey.value];
    let valB: any = b[sortKey.value];
    if (sortKey.value === 'date') {
      valA = new Date(valA).getTime();
      valB = new Date(valB).getTime();
    }
    if (valA < valB) return sortAsc.value ? -1 : 1;
    if (valA > valB) return sortAsc.value ? 1 : -1;
    return 0;
  });

  return list;
});

const summaryStats = computed(() => {
  const list = filteredRecords.value;
  let totalPL = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let totalProceeds = 0;
  let totalCost = 0;
  let totalFees = 0;

  list.forEach(r => {
    totalPL += r.profit;
    totalProceeds += r.proceeds;
    totalCost += r.costBasis;
    totalFees += (r.fee || 0);
    if (r.profit > 0.001) wins++;
    else if (r.profit < -0.001) losses++;
    else breakeven++;
  });

  const totalTrades = list.length;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  return { totalPL, wins, losses, breakeven, totalProceeds, totalCost, totalFees, totalTrades, winRate };
});

const stockYearlySummary = computed(() => {
  const byYear: Record<string, {
    year: string;
    totalPL: number;
    wins: number;
    losses: number;
    trades: number;
    totalProceeds: number;
    tickerPL: Record<string, number>;
  }> = {};

  store.realizedStockRecords.forEach(r => {
    const y = r.year || 'Unknown';
    if (!byYear[y]) {
      byYear[y] = {
        year: y,
        totalPL: 0,
        wins: 0,
        losses: 0,
        trades: 0,
        totalProceeds: 0,
        tickerPL: {}
      };
    }
    const o = byYear[y];
    o.totalPL += r.profit;
    o.trades++;
    o.totalProceeds += r.proceeds;
    if (r.profit > 0.001) o.wins++;
    else if (r.profit < -0.001) o.losses++;

    o.tickerPL[r.ticker] = (o.tickerPL[r.ticker] || 0) + r.profit;
  });

  return Object.values(byYear).map(yData => {
    let topTicker = '-';
    let topTickerVal = -Infinity;
    Object.entries(yData.tickerPL).forEach(([t, p]) => {
      if (p > topTickerVal) {
        topTickerVal = p;
        topTicker = t;
      }
    });
    const winRate = (yData.wins + yData.losses) > 0 ? (yData.wins / (yData.wins + yData.losses)) * 100 : 0;
    return {
      ...yData,
      winRate,
      topTicker: topTickerVal > 0 ? `${topTicker} (+${currencyStore.formatMoney(topTickerVal)})` : topTicker
    };
  }).sort((a, b) => b.year.localeCompare(a.year));
});

const paginatedRecords = computed(() => {
  if (perPage.value === -1) return filteredRecords.value;
  const start = (page.value - 1) * perPage.value;
  return filteredRecords.value.slice(start, start + perPage.value);
});

const totalPages = computed(() => {
  if (perPage.value === -1) return 1;
  return Math.ceil(filteredRecords.value.length / perPage.value) || 1;
});

function toggleSort(key: keyof RealizedStockRecord) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
    <div
      @click.stop
      class="bg-gray-900 border border-gray-700/90 rounded-2xl p-3 sm:p-6 max-w-6xl w-full min-w-0 shadow-2xl space-y-4 my-auto max-h-[95vh] flex flex-col overflow-hidden"
    >
      <!-- Modal Header (Fixed at top) -->
      <div class="flex-shrink-0 flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-gray-800 pb-4">
        <div class="flex items-center gap-3">
          <span class="p-2 bg-emerald-950/70 border border-emerald-800/80 rounded-xl text-emerald-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          </span>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-xl font-bold text-white">Realized Stock P/L History</h2>
              <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono font-semibold">
                {{ filteredRecords.length }} Records
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">
              Performance breakdown of closed stock sales, cost basis, and net capital returned across all years.
            </p>
          </div>
        </div>

        <div class="flex items-center gap-3">
          <div class="text-right hidden sm:block">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Filtered Realized P/L</div>
            <div
              class="text-lg font-bold font-mono"
              :class="summaryStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ currencyStore.formatMoney(summaryStats.totalPL, { sign: true }) }}
            </div>
          </div>
          <button
            @click="emit('close')"
            class="text-gray-400 hover:text-white text-xl font-bold px-2 py-1 rounded-lg hover:bg-gray-800 transition cursor-pointer"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Unified Scrollable Modal Body (Filters + KPIs + Records) -->
      <div class="overflow-y-auto flex-1 min-w-0 w-full space-y-4 pr-1">
        <!-- Multi-Dimensional Filter Controls Bar -->
        <div class="bg-gray-850 border border-gray-800 rounded-xl p-3.5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2.5">
            <!-- Year Pills -->
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-semibold text-gray-400 mr-1 flex items-center gap-1">
                <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Year:
              </span>
              <button
                type="button"
                @click="setYear('ALL')"
                :class="yearFilter === 'ALL' && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/40' : 'bg-gray-800 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'"
                class="px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer"
              >
                All Years
              </button>
              <button
                v-for="y in availableYears"
                :key="y"
                type="button"
                @click="setYear(y)"
                :class="yearFilter === y && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow-md shadow-emerald-950/40' : 'bg-gray-800 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'"
                class="px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer"
              >
                {{ y }}
              </button>
            </div>

            <!-- Reset Filters -->
            <button
              @click="resetFilters"
              class="text-xs text-gray-400 hover:text-emerald-400 flex items-center gap-1 transition px-2 py-1 rounded bg-gray-800/80 hover:bg-gray-800 border border-gray-700 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset Filters
            </button>
          </div>

          <!-- Secondary Filter Controls: Date Range, Ticker, Outcome, Search -->
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 pt-1 text-xs">
            <!-- Date From -->
            <div class="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 overflow-hidden">
              <span class="text-gray-400 whitespace-nowrap text-[11px] shrink-0">From:</span>
              <input
                type="date"
                v-model="dateFrom"
                @change="yearFilter = 'CUSTOM'; page = 1"
                class="bg-transparent text-gray-200 focus:outline-none w-full min-w-0 text-xs [color-scheme:dark] cursor-pointer"
              />
            </div>

            <!-- Date To -->
            <div class="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 overflow-hidden">
              <span class="text-gray-400 whitespace-nowrap text-[11px] shrink-0">To:</span>
              <input
                type="date"
                v-model="dateTo"
                @change="yearFilter = 'CUSTOM'; page = 1"
                class="bg-transparent text-gray-200 focus:outline-none w-full min-w-0 text-xs [color-scheme:dark] cursor-pointer"
              />
            </div>

            <!-- Ticker Filter -->
            <div class="relative">
              <select
                v-model="tickerFilter"
                @change="page = 1"
                class="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500 text-xs appearance-none cursor-pointer"
              >
                <option value="ALL">All Tickers</option>
                <option v-for="t in availableTickers" :key="t" :value="t">{{ t }}</option>
              </select>
              <span class="absolute right-2.5 top-2 text-gray-400 pointer-events-none text-[10px]">▼</span>
            </div>

            <!-- Outcome Filter -->
            <div class="relative">
              <select
                v-model="outcomeFilter"
                @change="page = 1"
                class="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500 text-xs appearance-none cursor-pointer"
              >
                <option value="ALL">All Outcomes</option>
                <option value="WIN">Winners (Profit > 0)</option>
                <option value="LOSS">Losers (Profit &lt; 0)</option>
              </select>
              <span class="absolute right-2.5 top-2 text-gray-400 pointer-events-none text-[10px]">▼</span>
            </div>

            <!-- Search -->
            <div class="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 focus-within:border-emerald-500">
              <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                v-model="searchQuery"
                @input="page = 1"
                placeholder="Search ticker or date..."
                class="bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none w-full text-xs"
              />
              <button v-if="searchQuery" @click="searchQuery = ''; page = 1" class="text-gray-400 hover:text-white cursor-pointer">✕</button>
            </div>
          </div>
        </div>

        <!-- KPI Summary Cards Grid (4 Cards) -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- 1. Realized P/L in Selection -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Filtered Realized P/L</div>
            <div
              class="text-xl font-bold font-mono mt-1"
              :class="summaryStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ currencyStore.formatMoney(summaryStats.totalPL, { sign: true }) }}
            </div>
            <div class="text-[11px] text-gray-400 mt-1 flex items-center justify-between">
              <span>{{ summaryStats.totalTrades }} closed sells</span>
              <span class="text-emerald-400 font-medium">{{ summaryStats.winRate.toFixed(1) }}% win rate</span>
            </div>
          </div>

          <!-- 2. Win / Loss Record -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Win / Loss Record</div>
            <div class="text-xl font-bold font-mono mt-1 text-white flex items-baseline gap-2">
              <span class="text-emerald-400">{{ summaryStats.wins }}W</span>
              <span class="text-gray-500 text-sm">/</span>
              <span class="text-rose-400">{{ summaryStats.losses }}L</span>
              <span v-if="summaryStats.breakeven > 0" class="text-gray-400 text-xs font-normal">({{ summaryStats.breakeven }} Even)</span>
            </div>
            <!-- Mini Win Bar -->
            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-2 flex">
              <div class="bg-emerald-500 h-full" :style="{ width: summaryStats.winRate + '%' }"></div>
              <div class="bg-rose-500 h-full" :style="{ width: (100 - summaryStats.winRate) + '%' }"></div>
            </div>
          </div>

          <!-- 3. Capital Returned & Cost Sold -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Proceeds & Basis</div>
            <div class="space-y-1 mt-1 text-[11px]">
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Total Proceeds:</span>
                <span class="font-mono font-semibold text-gray-200">{{ currencyStore.formatMoney(summaryStats.totalProceeds) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Cost Basis Sold:</span>
                <span class="font-mono font-semibold text-gray-400">{{ currencyStore.formatMoney(summaryStats.totalCost) }}</span>
              </div>
            </div>
          </div>

          <!-- 4. Commissions & Regulatory Fees -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Commissions & Fees</div>
            <div class="text-xl font-bold font-mono mt-1 text-amber-400">
              {{ currencyStore.formatMoney(summaryStats.totalFees) }}
            </div>
            <div class="text-[11px] text-gray-400 mt-1">
              Schwab & SEC regulatory transaction fees
            </div>
          </div>
        </div>

        <!-- Tabs: Trades vs Yearly Breakdown -->
        <div class="flex items-center justify-between border-b border-gray-800 pt-1">
          <div class="flex gap-2">
            <button
              @click="activeTab = 'trades'"
              :class="activeTab === 'trades' ? 'border-emerald-500 text-emerald-400 font-semibold' : 'border-transparent text-gray-400 hover:text-white'"
              class="pb-2 px-1 text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Closed Stock Sells ({{ filteredRecords.length }})</span>
            </button>
            <button
              @click="activeTab = 'yearly'"
              :class="activeTab === 'yearly' ? 'border-emerald-500 text-emerald-400 font-semibold' : 'border-transparent text-gray-400 hover:text-white'"
              class="pb-2 px-1 text-xs border-b-2 transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Yearly Breakdown</span>
            </button>
          </div>

          <!-- Per Page Selector -->
          <div v-if="activeTab === 'trades'" class="flex items-center gap-2 text-xs text-gray-400 pb-2">
            <span>Show:</span>
            <select
              v-model.number="perPage"
              @change="page = 1"
              class="bg-gray-800 border border-gray-700 text-gray-200 rounded px-2 py-0.5 text-xs cursor-pointer"
            >
              <option :value="15">15</option>
              <option :value="25">25</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
              <option :value="-1">All</option>
            </select>
          </div>
        </div>

        <!-- TAB 1: Detailed Stock Sells Ledger -->
        <div v-if="activeTab === 'trades'" class="space-y-3">
          <div v-if="filteredRecords.length === 0" class="text-center py-12 text-gray-400 text-xs">
            No stock sell records found matching the active filters.
            <button @click="resetFilters" class="block mx-auto mt-2 text-emerald-400 underline cursor-pointer">
              Reset all filters
            </button>
          </div>
          <div v-else>
            <!-- Mobile Card View for Stock Sells (sm:hidden) -->
            <div class="sm:hidden space-y-2.5">
              <div
                v-for="rec in paginatedRecords"
                :key="rec.id"
                class="bg-gray-850 border border-gray-800 rounded-xl p-3 space-y-2 hover:border-gray-700 transition"
              >
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="font-bold text-white text-base leading-none">{{ rec.ticker }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 font-mono font-semibold">
                        {{ rec.quantity }} shs
                      </span>
                    </div>
                    <div class="text-[10px] text-gray-500 font-mono mt-1">
                      Sold: {{ rec.date }}
                    </div>
                  </div>
                  <div class="text-right shrink-0">
                    <div
                      class="text-sm font-bold font-mono"
                      :class="rec.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                    >
                      {{ currencyStore.formatMoney(rec.profit, { sign: true }) }}
                    </div>
                    <div
                      class="text-[10px] font-mono mt-0.5"
                      :class="rec.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                    >
                      {{ formatPercent(rec.returnPct) }}
                    </div>
                  </div>
                </div>

                <!-- Price & Basis details -->
                <div class="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800/80 text-xs font-mono">
                  <div class="bg-gray-800/40 rounded p-1.5">
                    <div class="text-[10px] text-gray-400 uppercase font-sans">Avg Cost → Sold At</div>
                    <div class="text-gray-200 text-[11px] truncate">
                      {{ currencyStore.formatMoney(rec.entryPrice) }} → {{ currencyStore.formatMoney(rec.closePrice) }}
                    </div>
                  </div>
                  <div class="bg-gray-800/40 rounded p-1.5 text-right">
                    <div class="text-[10px] text-gray-400 uppercase font-sans">Basis / Proceeds</div>
                    <div class="text-gray-200 text-[11px] truncate">
                      {{ currencyStore.formatMoney(rec.costBasis) }} / {{ currencyStore.formatMoney(rec.proceeds) }}
                    </div>
                  </div>
                </div>

                <div v-if="rec.fee > 0" class="text-right text-[10px] text-gray-500 font-mono">
                  Fee: {{ currencyStore.formatMoney(rec.fee) }}
                </div>
              </div>
            </div>

            <!-- Desktop Table View for Stock Sells (hidden sm:block) -->
            <div class="hidden sm:block overflow-x-auto w-full max-w-full scrollbar-thin border border-gray-800 rounded-xl overflow-hidden">
              <table class="min-w-[700px] w-full text-left text-xs border-collapse font-mono">
                <thead class="bg-gray-800/80 text-gray-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-gray-700 select-none">
                  <tr>
                    <th @click="toggleSort('date')" class="p-2.5 cursor-pointer hover:text-white transition">
                      Date {{ sortKey === 'date' ? (sortAsc ? '↑' : '↓') : '' }}
                    </th>
                    <th @click="toggleSort('ticker')" class="p-2.5 cursor-pointer hover:text-white transition">
                      Symbol {{ sortKey === 'ticker' ? (sortAsc ? '↑' : '↓') : '' }}
                    </th>
                    <th class="p-2.5 text-center">Shares</th>
                    <th class="p-2.5 text-right">Avg Cost / Sh</th>
                    <th class="p-2.5 text-right">Sale Price / Sh</th>
                    <th class="p-2.5 text-right">Total Cost Basis</th>
                    <th class="p-2.5 text-right">Net Proceeds</th>
                    <th class="p-2.5 text-right">Fee</th>
                    <th @click="toggleSort('profit')" class="p-2.5 text-right cursor-pointer hover:text-white transition">
                      Realized P/L {{ sortKey === 'profit' ? (sortAsc ? '↑' : '↓') : '' }}
                    </th>
                    <th @click="toggleSort('returnPct')" class="p-2.5 text-right cursor-pointer hover:text-white transition">
                      Return % {{ sortKey === 'returnPct' ? (sortAsc ? '↑' : '↓') : '' }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-800 text-gray-200 bg-gray-900/60">
                  <tr v-for="rec in paginatedRecords" :key="rec.id" class="hover:bg-gray-800/50 transition">
                    <td class="p-2.5 font-mono text-gray-400 whitespace-nowrap">{{ rec.date }}</td>
                    <td class="p-2.5 font-bold text-white whitespace-nowrap">{{ rec.ticker }}</td>
                    <td class="p-2.5 text-center font-mono font-semibold text-gray-300">{{ rec.quantity }}</td>
                    <td class="p-2.5 text-right font-mono text-gray-300">{{ currencyStore.formatMoney(rec.entryPrice) }}</td>
                    <td class="p-2.5 text-right font-mono text-gray-300">{{ currencyStore.formatMoney(rec.closePrice) }}</td>
                    <td class="p-2.5 text-right font-mono text-gray-400">{{ currencyStore.formatMoney(rec.costBasis) }}</td>
                    <td class="p-2.5 text-right font-mono text-gray-200">{{ currencyStore.formatMoney(rec.proceeds) }}</td>
                    <td class="p-2.5 text-right font-mono text-gray-400">{{ currencyStore.formatMoney(rec.fee) }}</td>
                    <td
                      class="p-2.5 text-right font-mono font-bold whitespace-nowrap"
                      :class="rec.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                    >
                      {{ currencyStore.formatMoney(rec.profit, { sign: true }) }}
                    </td>
                    <td
                      class="p-2.5 text-right font-mono text-[11px] whitespace-nowrap"
                      :class="rec.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                    >
                      {{ formatPercent(rec.returnPct) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Pagination Controls -->
          <div
            v-if="perPage !== -1 && totalPages > 1"
            class="flex flex-col sm:flex-row items-center justify-between border-t border-gray-800 pt-3 mt-2 text-xs text-gray-400 gap-2"
          >
            <div>
              Showing {{ (page - 1) * perPage + 1 }} -
              {{ Math.min(page * perPage, filteredRecords.length) }}
              of {{ filteredRecords.length }} records
            </div>
            <div class="flex items-center gap-1.5">
              <button
                @click="page = Math.max(1, page - 1)"
                :disabled="page === 1"
                class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-750 disabled:opacity-40 disabled:hover:bg-gray-800 border border-gray-700 transition cursor-pointer"
              >
                Previous
              </button>
              <span class="px-2 font-mono text-gray-300">Page {{ page }} of {{ totalPages }}</span>
              <button
                @click="page = Math.min(totalPages, page + 1)"
                :disabled="page === totalPages"
                class="px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-750 disabled:opacity-40 disabled:hover:bg-gray-800 border border-gray-700 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <!-- TAB 2: Yearly Performance Breakdown Table -->
        <div v-if="activeTab === 'yearly'" class="space-y-4">
          <!-- Mobile Card View for Yearly Breakdown (sm:hidden) -->
          <div class="sm:hidden space-y-2.5">
            <div v-for="y in stockYearlySummary" :key="y.year" class="bg-gray-850 border border-gray-800 rounded-xl p-3 space-y-2.5">
              <div class="flex items-center justify-between">
                <span class="font-mono font-bold text-white text-base">{{ y.year }}</span>
                <div class="text-right">
                  <div class="text-sm font-bold font-mono" :class="y.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ currencyStore.formatMoney(y.totalPL, { sign: true }) }}
                  </div>
                  <div class="text-[10px] text-emerald-400 font-mono">
                    {{ y.winRate.toFixed(1) }}% win rate
                  </div>
                </div>
              </div>
              <div class="grid grid-cols-2 gap-2 text-xs font-mono bg-gray-800/40 rounded-lg p-2">
                <div>
                  <span class="text-gray-400">Record:</span>
                  <span class="text-emerald-400 ml-1">{{ y.wins }}W</span> / <span class="text-rose-400">{{ y.losses }}L</span>
                </div>
                <div class="text-right">
                  <span class="text-gray-400">Proceeds:</span>
                  <span class="text-gray-200 ml-1">{{ currencyStore.formatMoney(y.totalProceeds) }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-gray-800 text-xs">
                <span class="text-gray-400 text-[11px]">Top: <strong class="text-white">{{ y.topTicker }}</strong></span>
                <button
                  @click="setYear(y.year); activeTab = 'trades'"
                  class="px-2 py-0.5 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-[11px] font-semibold cursor-pointer"
                >
                  View {{ y.year }} Sells →
                </button>
              </div>
            </div>
          </div>

          <!-- Desktop Table View for Yearly (hidden sm:block) -->
          <div class="hidden sm:block overflow-x-auto w-full max-w-full scrollbar-thin border border-gray-800 rounded-xl overflow-hidden">
            <table class="min-w-[650px] w-full text-left text-xs border-collapse">
              <thead class="bg-gray-850 text-gray-400 uppercase text-[10px] font-semibold border-b border-gray-750">
                <tr>
                  <th class="p-3">Year</th>
                  <th class="p-3 text-right">Realized P/L</th>
                  <th class="p-3 text-center">Win Rate</th>
                  <th class="p-3 text-center">Closed Sells</th>
                  <th class="p-3 text-right">Total Proceeds</th>
                  <th class="p-3">Top Profitable Stock</th>
                  <th class="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800 text-gray-200 bg-gray-900/60 font-mono">
                <tr v-for="y in stockYearlySummary" :key="y.year" class="hover:bg-gray-800/50 transition">
                  <td class="p-3 font-mono font-bold text-white text-sm">{{ y.year }}</td>
                  <td class="p-3 text-right font-mono font-bold text-sm" :class="y.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ currencyStore.formatMoney(y.totalPL, { sign: true }) }}
                  </td>
                  <td class="p-3 text-center font-mono font-semibold text-emerald-400">
                    {{ y.winRate.toFixed(1) }}%
                  </td>
                  <td class="p-3 text-center font-mono text-gray-300">
                    <span class="text-emerald-400">{{ y.wins }}W</span> /
                    <span class="text-rose-400">{{ y.losses }}L</span>
                    <span class="text-gray-500 text-[11px] ml-1">({{ y.trades }})</span>
                  </td>
                  <td class="p-3 text-right font-mono text-gray-200">
                    {{ currencyStore.formatMoney(y.totalProceeds) }}
                  </td>
                  <td class="p-3 font-semibold text-gray-200 font-sans">
                    {{ y.topTicker }}
                  </td>
                  <td class="p-3 text-center font-sans">
                    <button
                      @click="setYear(y.year); activeTab = 'trades'"
                      class="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 hover:text-white transition text-xs font-semibold cursor-pointer"
                    >
                      View {{ y.year }} Sells →
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Footer (Fixed at bottom) -->
      <div class="flex-shrink-0 flex flex-col sm:flex-row justify-between items-center gap-2 pt-3 border-t border-gray-800 text-xs text-gray-400">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          Uses chronological cost basis matching across all stock purchases and sales.
        </span>
        <button
          type="button"
          @click="emit('close')"
          class="w-full sm:w-auto px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition border border-gray-700 cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
