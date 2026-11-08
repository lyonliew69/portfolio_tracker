<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatPercent } from '../../services/fx';
import { useCurrencyStore } from '../../stores/currency';
import { usePortfolioStore } from '../../stores/portfolio';
import type { RealizedOptionRecord } from '../../types/portfolio';

defineProps<{
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
const outcomeFilter = ref<string>('ALL');
const searchQuery = ref('');
const sortKey = ref<keyof RealizedOptionRecord>('date');
const sortAsc = ref(false);
const page = ref(1);
const perPage = ref(25);

const availableYears = computed(() => {
  const years = new Set(store.realizedOptionsRecords.map(r => r.year).filter(Boolean));
  years.add(currentYear);
  return Array.from(years).sort().reverse();
});

const availableTickers = computed(() => {
  const tickers = new Set(store.realizedOptionsRecords.map(r => r.ticker).filter(Boolean));
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
  let list = [...store.realizedOptionsRecords];

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
  if (outcomeFilter.value !== 'ALL') {
    if (outcomeFilter.value === 'EXPIRED') {
      list = list.filter(r => r.closingType === 'Expired');
    } else if (outcomeFilter.value === 'ASSIGNED') {
      list = list.filter(r => r.closingType === 'Assigned');
    } else if (outcomeFilter.value === 'CLOSED') {
      list = list.filter(r => r.closingType === 'Close');
    } else if (outcomeFilter.value === 'WIN') {
      list = list.filter(r => r.profit > 0.001);
    } else if (outcomeFilter.value === 'LOSS') {
      list = list.filter(r => r.profit < -0.001);
    }
  }
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(r =>
      r.ticker.toLowerCase().includes(q) ||
      (r.strike && String(r.strike).includes(q)) ||
      r.date.includes(q)
    );
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
  let expirePL = 0;
  let assignPL = 0;
  let closePL = 0;
  let totalFees = 0;

  list.forEach(r => {
    totalPL += r.profit;
    totalFees += (r.fee || 0);
    if (r.profit > 0.001) wins++;
    else if (r.profit < -0.001) losses++;
    else breakeven++;

    if (r.closingType === 'Expired') expirePL += r.profit;
    else if (r.closingType === 'Assigned') assignPL += r.profit;
    else closePL += r.profit;
  });

  const totalTrades = list.length;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses)) * 100 : 0;

  return { totalPL, wins, losses, breakeven, expirePL, assignPL, closePL, totalFees, totalTrades, winRate };
});

const optionsYearlySummary = computed(() => {
  const byYear: Record<string, {
    year: string;
    totalPL: number;
    wins: number;
    losses: number;
    trades: number;
    expirePL: number;
    assignPL: number;
    closePL: number;
    tickerPL: Record<string, number>;
  }> = {};

  store.realizedOptionsRecords.forEach(r => {
    const y = r.year || 'Unknown';
    if (!byYear[y]) {
      byYear[y] = {
        year: y,
        totalPL: 0,
        wins: 0,
        losses: 0,
        trades: 0,
        expirePL: 0,
        assignPL: 0,
        closePL: 0,
        tickerPL: {}
      };
    }
    const o = byYear[y];
    o.totalPL += r.profit;
    o.trades++;
    if (r.profit > 0.001) o.wins++;
    else if (r.profit < -0.001) o.losses++;

    if (r.closingType === 'Expired') o.expirePL += r.profit;
    else if (r.closingType === 'Assigned') o.assignPL += r.profit;
    else o.closePL += r.profit;

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

function toggleSort(key: keyof RealizedOptionRecord) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = false;
  }
}
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
    <div class="bg-gray-900 border border-gray-700/90 rounded-2xl max-w-6xl w-full min-w-0 max-h-[95vh] flex flex-col overflow-hidden shadow-2xl my-auto">
      <!-- Modal Header -->
      <div class="flex-shrink-0 p-4 sm:p-5 border-b border-gray-800 flex items-center justify-between bg-gray-850">
        <div class="flex items-center gap-3">
          <span class="p-2 bg-purple-950/70 border border-purple-800/80 rounded-xl text-purple-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-lg sm:text-xl font-bold text-white">Realized Options P/L History</h2>
              <span class="text-xs px-2 py-0.5 rounded-full bg-purple-950 border border-purple-800 text-purple-300 font-mono">
                {{ filteredRecords.length }} Trades
              </span>
            </div>
            <p class="text-xs text-gray-400">Complete historical closed options trades, expirations, and assignments</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="text-right hidden sm:block font-mono">
            <div class="text-[10px] text-gray-400 uppercase">Filtered Options P/L</div>
            <div class="text-lg font-bold" :class="summaryStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              {{ currencyStore.formatMoney(summaryStats.totalPL, { sign: true }) }}
            </div>
          </div>
          <button @click="emit('close')" class="text-gray-400 hover:text-white text-xl px-2 py-1 rounded-lg hover:bg-gray-800 transition">
            ✕
          </button>
        </div>
      </div>

      <!-- Unified Scrollable Modal Body -->
      <div class="overflow-y-auto flex-1 min-w-0 w-full p-4 sm:p-6 space-y-4 pr-2">
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
                :class="yearFilter === 'ALL' && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'"
                class="px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer"
              >
                All Years
              </button>
              <button
                v-for="y in availableYears"
                :key="y"
                type="button"
                @click="setYear(y)"
                :class="yearFilter === y && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-750 hover:text-white border border-gray-700'"
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
                class="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500 text-xs cursor-pointer"
              >
                <option value="ALL">All Underlying Tickers</option>
                <option v-for="t in availableTickers" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <!-- Closing Action / Outcome Filter -->
            <div class="relative">
              <select
                v-model="outcomeFilter"
                @change="page = 1"
                class="w-full bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 text-gray-200 focus:outline-none focus:border-emerald-500 text-xs cursor-pointer"
              >
                <option value="ALL">All Closing Actions</option>
                <option value="EXPIRED">Expired OTM</option>
                <option value="ASSIGNED">Assigned ITM</option>
                <option value="CLOSED">Early Closed / Rolled</option>
                <option value="WIN">Profitable Only (+)</option>
                <option value="LOSS">Losses Only (-)</option>
              </select>
            </div>

            <!-- Search Query -->
            <div class="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700 rounded-lg px-2.5 py-1.5 focus-within:border-emerald-500">
              <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                v-model="searchQuery"
                @input="page = 1"
                placeholder="Search ticker or strike..."
                class="bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none w-full text-xs"
              />
              <button v-if="searchQuery" @click="searchQuery = ''; page = 1" class="text-gray-400 hover:text-white">✕</button>
            </div>
          </div>
        </div>

        <!-- KPI Summary Cards Grid (4 Cards) -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- 1. Realized P/L in Selection -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Filtered Realized P/L</div>
            <div
              class="text-lg sm:text-xl font-bold font-mono mt-1"
              :class="summaryStats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
            >
              {{ currencyStore.formatMoney(summaryStats.totalPL, { sign: true }) }}
            </div>
            <div class="text-[11px] text-gray-400 mt-1 flex items-center justify-between">
              <span>{{ summaryStats.totalTrades }} closed</span>
              <span class="text-emerald-400 font-medium">{{ summaryStats.winRate.toFixed(1) }}% win</span>
            </div>
          </div>

          <!-- 2. Win / Loss Record -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Win / Loss Record</div>
            <div class="text-lg sm:text-xl font-bold font-mono mt-1 text-white flex items-baseline gap-1.5">
              <span class="text-emerald-400">{{ summaryStats.wins }}W</span>
              <span class="text-gray-500 text-sm">/</span>
              <span class="text-rose-400">{{ summaryStats.losses }}L</span>
              <span v-if="summaryStats.breakeven > 0" class="text-gray-400 text-xs font-normal">({{ summaryStats.breakeven }})</span>
            </div>
            <div class="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden mt-2 flex">
              <div class="bg-emerald-500 h-full" :style="{ width: summaryStats.winRate + '%' }"></div>
              <div class="bg-rose-500 h-full" :style="{ width: (100 - summaryStats.winRate) + '%' }"></div>
            </div>
          </div>

          <!-- 3. Strategy Category Breakdown -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Strategy Breakdown</div>
            <div class="space-y-0.5 mt-1 text-[11px]">
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Expired:</span>
                <span class="font-mono font-semibold text-emerald-400">+{{ currencyStore.formatMoney(summaryStats.expirePL) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Assigned:</span>
                <span class="font-mono font-semibold text-indigo-300">+{{ currencyStore.formatMoney(summaryStats.assignPL) }}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-gray-400">Closed:</span>
                <span class="font-mono font-semibold" :class="summaryStats.closePL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                  {{ currencyStore.formatMoney(summaryStats.closePL, { sign: true }) }}
                </span>
              </div>
            </div>
          </div>

          <!-- 4. Total Net Fees -->
          <div class="bg-gray-850 border border-gray-800 rounded-xl p-3">
            <div class="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Commissions & Fees</div>
            <div class="text-lg sm:text-xl font-bold font-mono mt-1 text-amber-400">
              {{ currencyStore.formatMoney(summaryStats.totalFees) }}
            </div>
            <div class="text-[10px] text-gray-400 mt-1">
              Regulatory & contract fees deducted
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
              <span>Closed Trades ({{ filteredRecords.length }})</span>
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

          <!-- Per Page Selector for Trades -->
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

        <!-- TAB 1: Trades Table -->
        <div v-if="activeTab === 'trades'" class="border border-gray-800 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono whitespace-nowrap min-w-[680px]">
              <thead>
                <tr class="bg-gray-850 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800 select-none">
                  <th @click="toggleSort('date')" class="py-3 px-3 cursor-pointer hover:text-white transition">
                    Date {{ sortKey === 'date' ? (sortAsc ? '↑' : '↓') : '' }}
                  </th>
                  <th @click="toggleSort('ticker')" class="py-3 px-3 cursor-pointer hover:text-white transition">
                    Underlying {{ sortKey === 'ticker' ? (sortAsc ? '↑' : '↓') : '' }}
                  </th>
                  <th class="py-3 px-3">Contract Details</th>
                  <th class="py-3 px-3">Closing Action</th>
                  <th @click="toggleSort('quantity')" class="py-3 px-3 text-center cursor-pointer hover:text-white transition">
                    Qty {{ sortKey === 'quantity' ? (sortAsc ? '↑' : '↓') : '' }}
                  </th>
                  <th class="py-3 px-3 text-right">Entry Basis</th>
                  <th class="py-3 px-3 text-right">Exit Price</th>
                  <th class="py-3 px-3 text-right">Fee</th>
                  <th @click="toggleSort('profit')" class="py-3 px-3 text-right cursor-pointer hover:text-white transition">
                    Realized P/L {{ sortKey === 'profit' ? (sortAsc ? '↑' : '↓') : '' }}
                  </th>
                  <th class="py-3 px-3 text-right">Return %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800 bg-gray-900/60 text-gray-200">
                <tr v-if="paginatedRecords.length === 0">
                  <td colspan="10" class="text-center py-8 text-gray-500">No option records match your filter criteria.</td>
                </tr>
                <tr v-for="r in paginatedRecords" :key="r.id" class="hover:bg-gray-800/50 transition">
                  <td class="py-2.5 px-3 font-mono text-gray-400 whitespace-nowrap">{{ r.date }}</td>
                  <td class="py-2.5 px-3 font-bold text-white whitespace-nowrap">{{ r.ticker }}</td>
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span :class="r.optionType === 'Call' ? 'text-emerald-400' : 'text-amber-400'" class="font-semibold">
                      {{ r.optionType }}
                    </span>
                    <span class="font-mono text-gray-300 ml-1.5">${{ r.strike }}</span>
                    <span class="text-gray-500 text-[11px] ml-1.5">Exp: {{ r.expiration }}</span>
                  </td>
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span
                      v-if="r.closingType === 'Expired'"
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 border border-emerald-800 text-emerald-300"
                    >
                      Expired (OTM)
                    </span>
                    <span
                      v-else-if="r.closingType === 'Assigned'"
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-950/80 border border-indigo-800 text-indigo-300"
                    >
                      Assigned (ITM)
                    </span>
                    <span
                      v-else
                      class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 border border-gray-700 text-gray-300"
                    >
                      {{ r.action || 'Close' }}
                    </span>
                  </td>
                  <td class="py-2.5 px-3 text-center font-mono font-semibold text-gray-300">{{ r.quantity }}x</td>
                  <td class="py-2.5 px-3 text-right font-mono text-gray-300">{{ currencyStore.formatMoney(r.entryPrice) }}</td>
                  <td class="py-2.5 px-3 text-right font-mono text-gray-300">{{ currencyStore.formatMoney(r.closePrice) }}</td>
                  <td class="py-2.5 px-3 text-right font-mono text-gray-400">{{ currencyStore.formatMoney(r.fee) }}</td>
                  <td
                    class="py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap"
                    :class="r.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                  >
                    {{ currencyStore.formatMoney(r.profit, { sign: true }) }}
                  </td>
                  <td
                    class="py-2.5 px-3 text-right font-mono text-[11px] whitespace-nowrap"
                    :class="r.returnPct >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                  >
                    {{ formatPercent(r.returnPct) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Footer Pagination -->
          <div
            v-if="perPage !== -1 && totalPages > 1"
            class="p-3 bg-gray-850 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400"
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
                class="px-2.5 py-1 rounded border border-gray-700 bg-gray-800 disabled:opacity-40"
              >
                Previous
              </button>
              <span class="px-2 font-mono">Page {{ page }} of {{ totalPages }}</span>
              <button
                @click="page = Math.min(totalPages, page + 1)"
                :disabled="page >= totalPages"
                class="px-2.5 py-1 rounded border border-gray-700 bg-gray-800 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <!-- TAB 2: Yearly Breakdown Table -->
        <div v-if="activeTab === 'yearly'" class="border border-gray-800 rounded-xl overflow-hidden">
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs font-mono whitespace-nowrap">
              <thead class="bg-gray-850 text-gray-400 uppercase text-[10px] tracking-wider border-b border-gray-800">
                <tr>
                  <th class="py-3 px-4">Year</th>
                  <th class="py-3 px-4 text-right">Realized P/L</th>
                  <th class="py-3 px-4 text-center">Win Rate</th>
                  <th class="py-3 px-4 text-center">Closed Trades</th>
                  <th class="py-3 px-4 text-right">Expired OTM</th>
                  <th class="py-3 px-4 text-right">Assigned ITM</th>
                  <th class="py-3 px-4 text-right">Closed Early</th>
                  <th class="py-3 px-4">Top Underlying</th>
                  <th class="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800 bg-gray-900/60">
                <tr v-for="y in optionsYearlySummary" :key="y.year" class="hover:bg-gray-800/40">
                  <td class="py-3 px-4 font-bold text-white text-sm">{{ y.year }}</td>
                  <td class="py-3 px-4 text-right font-bold text-sm" :class="y.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ currencyStore.formatMoney(y.totalPL, { sign: true }) }}
                  </td>
                  <td class="py-3 px-4 text-center text-emerald-400 font-semibold">{{ y.winRate.toFixed(1) }}%</td>
                  <td class="py-3 px-4 text-center text-gray-300">
                    <span class="text-emerald-400">{{ y.wins }}W</span> /
                    <span class="text-rose-400">{{ y.losses }}L</span>
                    <span class="text-gray-500 text-[11px] ml-1">({{ y.trades }})</span>
                  </td>
                  <td class="py-3 px-4 text-right font-mono text-emerald-400">+{{ currencyStore.formatMoney(y.expirePL) }}</td>
                  <td class="py-3 px-4 text-right font-mono text-indigo-300">+{{ currencyStore.formatMoney(y.assignPL) }}</td>
                  <td class="py-3 px-4 text-right font-mono" :class="y.closePL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ currencyStore.formatMoney(y.closePL, { sign: true }) }}
                  </td>
                  <td class="py-3 px-4 text-gray-200 font-sans font-medium">{{ y.topTicker }}</td>
                  <td class="py-3 px-4 text-center font-sans">
                    <button
                      @click="setYear(y.year); activeTab = 'trades'"
                      class="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 text-xs font-semibold transition"
                    >
                      View {{ y.year }} Trades →
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex-shrink-0 p-4 border-t border-gray-800 flex flex-col sm:flex-row justify-between items-center gap-2 bg-gray-850 text-xs text-gray-400">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
          Includes single contracts, rolls, multi-leg spreads, assignments, and expirations.
        </span>
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition border border-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>
