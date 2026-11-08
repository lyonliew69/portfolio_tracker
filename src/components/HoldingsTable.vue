<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatPercent } from '../services/fx';
import { useCurrencyStore } from '../stores/currency';
import { usePortfolioStore } from '../stores/portfolio';
import type { StockHolding } from '../types/portfolio';

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const searchQuery = ref('');
const sortKey = ref<keyof StockHolding>('marketValue');
const sortAsc = ref(false);

const filteredHoldings = computed(() => {
  let list = [...store.stockHoldings];
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(h => h.symbol.toLowerCase().includes(q));
  }
  list.sort((a, b) => {
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];
    if (typeof valA === 'string' && typeof valB === 'string') {
      return sortAsc.value ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    const numA = Number(valA) || 0;
    const numB = Number(valB) || 0;
    return sortAsc.value ? numA - numB : numB - numA;
  });
  return list;
});

const holdingsTotals = computed(() => {
  const totalShares = filteredHoldings.value.reduce((acc, h) => acc + h.quantity, 0);
  const totalCost = filteredHoldings.value.reduce((acc, h) => acc + h.totalCost, 0);
  const totalValue = filteredHoldings.value.reduce((acc, h) => acc + h.marketValue, 0);
  const totalPL = totalValue - totalCost;
  const plPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  return {
    shares: totalShares,
    totalCost,
    marketValue: totalValue,
    unrealizedPL: totalPL,
    unrealizedPercent: plPercent
  };
});

function toggleSort(key: keyof StockHolding) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value;
  } else {
    sortKey.value = key;
    sortAsc.value = false;
  }
}
</script>

<template>
  <div id="stockHoldingsSection" class="bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden mb-6">
    <div class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-750 bg-gray-850">
      <div class="flex items-center gap-3">
        <span class="p-2 bg-blue-950/70 border border-blue-800/70 rounded-lg text-blue-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </span>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-white">Current Stock Holdings</h2>
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono">
              {{ filteredHoldings.length }} <span v-if="filteredHoldings.length !== store.stockHoldings.length">of {{ store.stockHoldings.length }}</span> Positions
            </span>
            <span class="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-750 border border-gray-650 text-emerald-300 font-mono">
              {{ store.costBasisMethod }}
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">Real-time valuation based on {{ store.costBasisMethod }} cost basis</p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <div class="relative w-full sm:w-44">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter symbol..."
            class="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-500 uppercase focus:outline-none focus:border-emerald-500"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2 top-1.5 text-gray-400 hover:text-white text-xs"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs whitespace-nowrap">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 uppercase text-[10px] tracking-wider bg-gray-850/50 select-none">
            <th @click="toggleSort('symbol')" class="py-3 px-4 font-semibold cursor-pointer hover:text-white transition">
              Symbol {{ sortKey === 'symbol' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th @click="toggleSort('quantity')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Shares {{ sortKey === 'quantity' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th @click="toggleSort('avgCost')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Avg Cost {{ sortKey === 'avgCost' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th @click="toggleSort('currentPrice')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Price {{ sortKey === 'currentPrice' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th @click="toggleSort('totalCost')" class="hidden md:table-cell py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Total Cost {{ sortKey === 'totalCost' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th @click="toggleSort('marketValue')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Market Value {{ sortKey === 'marketValue' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="hidden md:table-cell py-3 px-4 font-semibold text-right">Weight</th>
            <th @click="toggleSort('unrealizedPL')" class="py-3 px-4 font-semibold text-right cursor-pointer hover:text-white transition">
              Unrealized P/L {{ sortKey === 'unrealizedPL' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-750">
          <tr v-if="filteredHoldings.length === 0">
            <td colspan="8" class="text-center py-8 text-gray-500">
              <span v-if="searchQuery">No open stock positions matching "{{ searchQuery }}".</span>
              <span v-else>No open stock positions.</span>
            </td>
          </tr>
          <tr
            v-for="h in filteredHoldings"
            :key="h.symbol"
            class="hover:bg-gray-750/50 transition-colors duration-150 font-mono"
          >
            <td class="py-3 px-4 font-bold text-white">
              {{ h.symbol }}
            </td>
            <td class="py-3 px-4 text-right text-gray-200">{{ h.quantity }}</td>
            <td class="py-3 px-4 text-right text-gray-300">{{ currencyStore.formatMoney(h.avgCost) }}</td>
            <td class="py-3 px-4 text-right text-emerald-300 font-semibold">{{ currencyStore.formatMoney(h.currentPrice) }}</td>
            <td class="hidden md:table-cell py-3 px-4 text-right text-gray-400">{{ currencyStore.formatMoney(h.totalCost) }}</td>
            <td class="py-3 px-4 text-right text-white font-bold">{{ currencyStore.formatMoney(h.marketValue) }}</td>
            <td class="hidden md:table-cell py-3 px-4 text-right text-gray-400">
              {{ store.stockPortfolioValue > 0 ? (h.marketValue / store.stockPortfolioValue * 100).toFixed(1) + '%' : '0%' }}
            </td>
            <td class="py-3 px-4 text-right" :class="h.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              <div class="font-bold">{{ currencyStore.formatMoney(h.unrealizedPL, { sign: true }) }}</div>
              <div class="text-[10px]">{{ formatPercent(h.unrealizedPercent) }}</div>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="filteredHoldings.length > 0" class="border-t-2 border-gray-700 bg-gray-900/60 text-xs font-semibold text-gray-300 font-mono">
          <tr>
            <td class="py-3 px-4 font-bold text-white">Total ({{ filteredHoldings.length }})</td>
            <td class="py-3 px-4 text-right">{{ holdingsTotals.shares.toLocaleString() }}</td>
            <td class="py-3 px-4 text-right text-gray-500">—</td>
            <td class="py-3 px-4 text-right text-gray-500">—</td>
            <td class="hidden md:table-cell py-3 px-4 text-right text-gray-300">{{ currencyStore.formatMoney(holdingsTotals.totalCost) }}</td>
            <td class="py-3 px-4 text-right text-white font-bold">{{ currencyStore.formatMoney(holdingsTotals.marketValue) }}</td>
            <td class="hidden md:table-cell py-3 px-4 text-right text-gray-300">100%</td>
            <td class="py-3 px-4 text-right" :class="holdingsTotals.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              <div class="font-bold">{{ currencyStore.formatMoney(holdingsTotals.unrealizedPL, { sign: true }) }}</div>
              <div class="text-[10px] font-normal">({{ formatPercent(holdingsTotals.unrealizedPercent) }})</div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
