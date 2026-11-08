<script setup lang="ts">
import { computed, ref } from 'vue';
import { useCurrencyStore } from '../stores/currency';
import { usePortfolioStore } from '../stores/portfolio';
import type { AssetType, Transaction } from '../types/portfolio';

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const emit = defineEmits<{
  (e: 'edit-transaction', tx: Transaction): void;
}>();

const showHistory = ref(true);
const searchQuery = ref('');
const assetFilter = ref<'ALL' | AssetType | 'Spread'>('ALL');
const actionFilter = ref<string>('ALL');
const currentYear = new Date().getFullYear().toString();
const yearFilter = ref<string>(currentYear);
const dateFrom = ref<string>('');
const dateTo = ref<string>('');
const page = ref(1);
const perPage = ref(25);

const availableYears = computed(() => {
  const set = new Set<string>();
  set.add(currentYear);
  store.transactions.forEach(t => {
    if (t.date && t.date.length >= 4) {
      set.add(t.date.substring(0, 4));
    }
  });
  return Array.from(set).sort().reverse();
});

const hasActiveFilters = computed(() => {
  return (
    searchQuery.value !== '' ||
    assetFilter.value !== 'ALL' ||
    actionFilter.value !== 'ALL' ||
    yearFilter.value !== currentYear ||
    dateFrom.value !== '' ||
    dateTo.value !== ''
  );
});

function resetFilters() {
  searchQuery.value = '';
  assetFilter.value = 'ALL';
  actionFilter.value = 'ALL';
  yearFilter.value = currentYear;
  dateFrom.value = '';
  dateTo.value = '';
  page.value = 1;
}

const filteredTransactions = computed(() => {
  let list = [...store.transactions];

  // Year filter
  if (yearFilter.value !== 'ALL' && !dateFrom.value && !dateTo.value) {
    list = list.filter(t => t.date && t.date.startsWith(yearFilter.value));
  }

  // Date range
  if (dateFrom.value) {
    list = list.filter(t => t.date >= dateFrom.value);
  }
  if (dateTo.value) {
    list = list.filter(t => t.date <= dateTo.value);
  }

  // Asset filter
  if (assetFilter.value !== 'ALL') {
    list = list.filter(t => t.assetType === assetFilter.value);
  }

  // Action filter
  if (actionFilter.value !== 'ALL') {
    if (actionFilter.value === 'Buy') {
      list = list.filter(t => t.action === 'Buy' || t.action === 'Buy to Open' || t.action === 'Buy to Close');
    } else if (actionFilter.value === 'Sell') {
      list = list.filter(t => t.action === 'Sell' || t.action === 'Sell to Open' || t.action === 'Sell to Close');
    } else if (actionFilter.value === 'Open') {
      list = list.filter(t => t.action === 'Buy to Open' || t.action === 'Sell to Open');
    } else if (actionFilter.value === 'Close') {
      list = list.filter(t => t.action === 'Buy to Close' || t.action === 'Sell to Close');
    } else if (actionFilter.value === 'Expire') {
      list = list.filter(t => ['Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(t.action));
    }
  }

  // Search query
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase();
    list = list.filter(t =>
      t.ticker.toLowerCase().includes(q) ||
      t.action.toLowerCase().includes(q) ||
      (t.strategyName && t.strategyName.toLowerCase().includes(q)) ||
      (t.date && t.date.includes(q))
    );
  }

  // Sort chronological descending
  return list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
});

const totalPages = computed(() => {
  if (perPage.value === -1) return 1;
  return Math.ceil(filteredTransactions.value.length / perPage.value) || 1;
});

const paginatedTransactions = computed(() => {
  if (perPage.value === -1) return filteredTransactions.value;
  const start = (page.value - 1) * perPage.value;
  return filteredTransactions.value.slice(start, start + perPage.value);
});

async function handleDelete(tx: Transaction) {
  if (confirm(`Are you sure you want to delete ${tx.action} ${tx.quantity} ${tx.ticker} on ${tx.date}?`)) {
    await store.deleteTransaction(tx.id);
  }
}
</script>

<template>
  <div class="bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden mb-12">
    <!-- Header -->
    <div class="p-4 sm:p-5 flex items-center justify-between gap-4 border-b border-gray-750 bg-gray-850">
      <div
        @click="showHistory = !showHistory"
        class="flex items-center gap-3 cursor-pointer select-none"
      >
        <span class="p-2 bg-gray-700/60 border border-gray-600 rounded-lg text-gray-300">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        </span>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-white">Transaction History</h2>
            <span class="text-xs px-2 py-0.5 rounded-full bg-gray-900 border border-gray-700 text-gray-300 font-mono">
              {{ filteredTransactions.length }} <span v-if="filteredTransactions.length !== store.transactions.length">of {{ store.transactions.length }}</span> Records
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">Complete historical trade records</p>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <!-- Per Page selector -->
        <div v-show="showHistory" class="flex items-center gap-1.5 text-xs">
          <span class="text-gray-400">Show:</span>
          <select
            v-model.number="perPage"
            @change="page = 1"
            class="bg-gray-700 border border-gray-600 text-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option :value="15">15</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
            <option :value="-1">All</option>
          </select>
        </div>

        <!-- Chevron Toggle -->
        <button
          @click="showHistory = !showHistory"
          class="text-emerald-400 hover:text-emerald-300 p-1 transition cursor-pointer"
          title="Toggle Transaction History"
        >
          <svg :class="{ 'rotate-180': showHistory }" class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Filter Controls Bar -->
    <div v-show="showHistory" class="p-4 bg-gray-850/60 border-b border-gray-750 space-y-3">
      <!-- Top Row: Year Pills & Reset Button -->
      <div class="flex flex-wrap items-center justify-between gap-2.5">
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs font-semibold text-gray-400 mr-1 flex items-center gap-1">
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Year:
          </span>
          <button
            type="button"
            @click="yearFilter = 'ALL'; dateFrom = ''; dateTo = ''; page = 1"
            :class="yearFilter === 'ALL' && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'"
            class="px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer"
          >
            All Years
          </button>
          <button
            v-for="y in availableYears"
            :key="y"
            type="button"
            @click="yearFilter = y; dateFrom = ''; dateTo = ''; page = 1"
            :class="yearFilter === y && !dateFrom && !dateTo ? 'bg-emerald-600 text-white font-bold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white border border-gray-700'"
            class="px-2.5 py-1 text-xs rounded-lg transition font-medium cursor-pointer"
          >
            {{ y }}
          </button>
        </div>

        <button
          v-if="hasActiveFilters"
          @click="resetFilters"
          class="text-xs text-gray-400 hover:text-emerald-400 flex items-center gap-1 transition px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 cursor-pointer"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset Filters
        </button>
      </div>

      <!-- Bottom Row: Date Range, Asset, Action, Search -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 text-xs">
        <!-- Date From -->
        <div class="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
          <span class="text-gray-400 text-[11px] shrink-0">From:</span>
          <input
            type="date"
            v-model="dateFrom"
            @change="yearFilter = 'CUSTOM'; page = 1"
            class="bg-transparent text-gray-200 focus:outline-none w-full text-xs [color-scheme:dark]"
          />
        </div>

        <!-- Date To -->
        <div class="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
          <span class="text-gray-400 text-[11px] shrink-0">To:</span>
          <input
            type="date"
            v-model="dateTo"
            @change="yearFilter = 'CUSTOM'; page = 1"
            class="bg-transparent text-gray-200 focus:outline-none w-full text-xs [color-scheme:dark]"
          />
        </div>

        <!-- Asset Filter -->
        <div class="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
          <span class="text-gray-400 text-[11px] shrink-0">Asset:</span>
          <select
            v-model="assetFilter"
            @change="page = 1"
            class="bg-transparent text-gray-200 focus:outline-none w-full text-xs cursor-pointer"
          >
            <option value="ALL">All Asset Types</option>
            <option value="Stock">Stocks Only</option>
            <option value="Option">Options Only</option>
            <option value="Spread">Spreads Only</option>
          </select>
        </div>

        <!-- Action Filter -->
        <div class="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1.5">
          <span class="text-gray-400 text-[11px] shrink-0">Action:</span>
          <select
            v-model="actionFilter"
            @change="page = 1"
            class="bg-transparent text-gray-200 focus:outline-none w-full text-xs cursor-pointer"
          >
            <option value="ALL">All Trade Actions</option>
            <option value="Buy">Buys</option>
            <option value="Sell">Sells</option>
            <option value="Open">Opens</option>
            <option value="Close">Closes</option>
            <option value="Expire">Expires / Assigned</option>
          </select>
        </div>
      </div>

      <!-- Search Input -->
      <div class="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
        <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          v-model="searchQuery"
          @input="page = 1"
          placeholder="Search ticker symbol, trade action, strategy name, or date..."
          class="bg-transparent text-gray-200 placeholder-gray-500 focus:outline-none w-full text-xs"
        />
        <button
          v-if="searchQuery"
          @click="searchQuery = ''; page = 1"
          class="text-gray-400 hover:text-white text-xs"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Table -->
    <div v-show="showHistory" class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs whitespace-nowrap">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 uppercase text-[10px] tracking-wider bg-gray-850/50">
            <th class="py-3 px-4 font-semibold">Date</th>
            <th class="py-3 px-4 font-semibold">Asset</th>
            <th class="py-3 px-4 font-semibold">Action</th>
            <th class="py-3 px-4 font-semibold text-right">Qty</th>
            <th class="py-3 px-4 font-semibold text-right">Price</th>
            <th class="py-3 px-4 font-semibold text-right">Fee</th>
            <th class="py-3 px-4 font-semibold text-right">Net Amount</th>
            <th class="py-3 px-4 font-semibold text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-750">
          <tr v-if="filteredTransactions.length === 0">
            <td colspan="8" class="text-center py-8 text-gray-500">
              <span v-if="hasActiveFilters">
                No transactions match active filters.
                <button @click="resetFilters" class="block mx-auto mt-2 text-emerald-400 underline text-xs">
                  Reset filters
                </button>
              </span>
              <span v-else>No transactions entered yet.</span>
            </td>
          </tr>
          <tr
            v-for="tx in paginatedTransactions"
            :key="tx.id"
            class="hover:bg-gray-750/50 transition-colors duration-150 font-mono"
          >
            <td class="py-3 px-4 text-gray-400">{{ tx.date }}</td>
            <td class="py-3 px-4">
              <div class="font-bold text-white">{{ tx.ticker }}</div>
              <div v-if="tx.assetType === 'Option'" class="text-[11px] text-gray-400 font-sans">
                {{ tx.optionType }} ${{ tx.strike }} Exp: {{ tx.expiration }}
              </div>
              <div v-else-if="tx.assetType === 'Spread'" class="text-[11px] text-amber-400 font-sans">
                {{ tx.strategyName }}
              </div>
            </td>
            <td class="py-3 px-4">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="['Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action) ? 'bg-gray-800 text-gray-300 border border-gray-600' : (['Buy', 'Buy to Open', 'Buy to Close'].includes(tx.action) ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800')"
              >
                {{ tx.action }}
              </span>
            </td>
            <td class="py-3 px-4 text-right text-white font-bold">{{ tx.quantity }}</td>
            <td class="py-3 px-4 text-right text-gray-300">{{ currencyStore.formatMoney(tx.price) }}</td>
            <td class="py-3 px-4 text-right text-gray-400">{{ currencyStore.formatMoney(tx.fee) }}</td>
            <td
              class="py-3 px-4 text-right font-bold"
              :class="['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action) ? 'text-rose-400' : 'text-emerald-400'"
            >
              {{ ['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action) ? '-' : '+' }}{{ currencyStore.formatMoney(tx.totalValue, { showSymbol: false }) }}
            </td>
            <td class="py-3 px-4 text-center font-sans">
              <button
                @click="emit('edit-transaction', tx)"
                class="text-indigo-400 hover:text-indigo-300 font-semibold mr-3 transition"
              >
                Edit
              </button>
              <button
                @click="handleDelete(tx)"
                class="text-rose-400 hover:text-rose-300 font-semibold transition"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination Controls -->
    <div
      v-show="showHistory && perPage !== -1 && totalPages > 1"
      class="p-4 border-t border-gray-750 flex items-center justify-between text-xs text-gray-400 bg-gray-850/40"
    >
      <div>
        Showing {{ (page - 1) * perPage + 1 }} -
        {{ Math.min(page * perPage, filteredTransactions.length) }}
        of {{ filteredTransactions.length }} transactions
      </div>
      <div class="flex items-center gap-1.5">
        <button
          @click="page = Math.max(1, page - 1)"
          :disabled="page === 1"
          class="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-650 disabled:opacity-40 disabled:hover:bg-gray-700 border border-gray-600 transition"
        >
          Previous
        </button>
        <span class="px-2 font-mono text-gray-300">Page {{ page }} of {{ totalPages }}</span>
        <button
          @click="page = Math.min(totalPages, page + 1)"
          :disabled="page === totalPages"
          class="px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-650 disabled:opacity-40 disabled:hover:bg-gray-700 border border-gray-600 transition"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>
