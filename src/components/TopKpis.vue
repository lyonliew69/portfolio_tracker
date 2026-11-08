<script setup lang="ts">
import { formatPercent } from '../services/fx';
import { useCurrencyStore } from '../stores/currency';
import { usePortfolioStore } from '../stores/portfolio';

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const emit = defineEmits<{
  (e: 'open-stock-history'): void;
  (e: 'open-options-history'): void;
  (e: 'scroll-to-stocks'): void;
  (e: 'scroll-to-options'): void;
}>();
</script>

<template>
  <!-- Top Stats Grid -->
  <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
    <!-- 1. Total Portfolio Net Profit -->
    <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm relative overflow-hidden group">
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">Total Net Profit</div>
        <span
          class="text-[10px] px-1.5 py-0.5 rounded font-medium border"
          :class="store.totalPortfolioNetPL >= 0 ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border-rose-800 text-rose-300'"
        >
          Realized + Unrealized
        </span>
      </div>
      <div
        class="text-2xl font-bold mt-1 font-mono"
        :class="store.totalPortfolioNetPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ currencyStore.formatMoney(store.totalPortfolioNetPL, { sign: true }) }}
      </div>
      <div class="text-[11px] text-gray-400 mt-0.5 flex items-center justify-between">
        <span>Realized: <strong :class="(store.realizedStockPL + store.realizedOptionsPL) >= 0 ? 'text-emerald-400' : 'text-rose-400'">{{ currencyStore.formatMoney(store.realizedStockPL + store.realizedOptionsPL) }}</strong></span>
        <span>Unreal: <strong :class="store.stockUnrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">{{ currencyStore.formatMoney(store.stockUnrealizedPL) }}</strong></span>
      </div>
    </div>

    <!-- 2. Active Stocks Value -->
    <div class="bg-gray-800 p-4 rounded-lg border border-gray-700 shadow-sm">
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">Active Stocks Value</div>
        <span class="text-[10px] text-gray-400 bg-gray-700/60 border border-gray-600 px-1.5 py-0.5 rounded">
          {{ store.stockHoldings.length }} Holdings
        </span>
      </div>
      <div class="text-2xl font-bold mt-1 text-white font-mono">
        {{ currencyStore.formatMoney(store.stockPortfolioValue) }}
      </div>
      <div class="text-[11px] text-gray-400 mt-0.5">
        Cost Basis: {{ currencyStore.formatMoney(store.stockCostBasis) }}
      </div>
    </div>

    <!-- 3. Unrealized Stock P/L -->
    <div
      @click="emit('scroll-to-stocks')"
      class="bg-gray-800 hover:bg-gray-750 p-4 rounded-lg border border-gray-700 hover:border-emerald-500/60 cursor-pointer transition-all duration-200 group relative shadow-sm hover:shadow-emerald-950/20"
      title="Click to jump to Current Stock Holdings"
    >
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">UNREALIZED STOCK</div>
        <span
          class="text-[10px] px-1.5 py-0.5 rounded font-medium border font-mono"
          :class="store.stockUnrealizedPL >= 0 ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border-rose-800 text-rose-300'"
        >
          {{ formatPercent(store.stockCostBasis > 0 ? (store.stockUnrealizedPL / store.stockCostBasis * 100) : 0) }}
        </span>
      </div>
      <div
        class="text-2xl font-bold mt-1 font-mono"
        :class="store.stockUnrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ currencyStore.formatMoney(store.stockUnrealizedPL, { sign: true }) }}
      </div>
      <div class="text-[11px] text-gray-400 mt-0.5 flex items-center justify-between">
        <span>Market value vs cost</span>
        <span class="text-[10px] text-gray-400 group-hover:text-emerald-400 transition">View stocks &darr;</span>
      </div>
    </div>

    <!-- 4. Unrealized Options (Open Premium) -->
    <div
      @click="emit('scroll-to-options')"
      class="bg-gray-800 hover:bg-gray-750 p-4 rounded-lg border border-gray-700 hover:border-emerald-500/60 cursor-pointer transition-all duration-200 group relative shadow-sm hover:shadow-emerald-950/20"
      title="Click to jump to Active Options & Spreads"
    >
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">Unrealized Options</div>
        <span
          class="text-[10px] px-1.5 py-0.5 rounded font-medium border"
          :class="store.openOptionsSummary.totalContracts > 0 ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300' : 'bg-gray-700/60 border-gray-600 text-gray-400'"
        >
          {{ store.openOptionsSummary.totalContracts }} {{ store.openOptionsSummary.totalContracts === 1 ? 'Contract' : 'Contracts' }}
        </span>
      </div>
      <div
        class="text-2xl font-bold mt-1 font-mono"
        :class="store.openOptionsSummary.netPremium >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ currencyStore.formatMoney(store.openOptionsSummary.netPremium, { sign: true }) }}
      </div>
      <div class="text-[11px] text-gray-400 mt-0.5 flex items-center justify-between">
        <span v-if="store.openOptionsSummary.totalContracts > 0">
          {{ store.openOptionsSummary.shortContracts > 0 && store.openOptionsSummary.longContracts > 0 ? 'Net pending premium' : (store.openOptionsSummary.shortContracts > 0 ? 'Net credit at stake' : 'Net debit paid') }}
        </span>
        <span v-else class="text-gray-500">No active contracts</span>
        <span class="text-[10px] text-gray-400 group-hover:text-emerald-400 transition">View active &darr;</span>
      </div>
    </div>

    <!-- 5. Realized Stock P/L -->
    <div
      @click="emit('open-stock-history')"
      class="bg-gray-800 hover:bg-gray-750 p-4 rounded-lg border border-gray-700 hover:border-emerald-500/60 cursor-pointer transition-all duration-200 group relative shadow-sm hover:shadow-emerald-950/20"
      title="Click to view full Stock Realized History & Filter by Year/Date"
    >
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">Realized Stocks</div>
        <span
          class="text-[10px] text-emerald-400/90 bg-emerald-950/70 border border-emerald-800/70 px-1.5 py-0.5 rounded font-medium group-hover:border-emerald-500 group-hover:bg-emerald-900/60 transition flex items-center gap-1"
        >
          History &nearr;
        </span>
      </div>
      <div
        class="text-2xl font-bold mt-1 font-mono"
        :class="store.realizedStockPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ currencyStore.formatMoney(store.realizedStockPL, { sign: true }) }}
      </div>
      <div class="text-[11px] text-gray-500 group-hover:text-gray-300 transition mt-0.5 flex items-center justify-between">
        <span>Click to view breakdown</span>
        <span class="text-[10px] text-gray-400 group-hover:text-emerald-400 transition">Filter by year</span>
      </div>
    </div>

    <!-- 6. Realized Options P/L -->
    <div
      @click="emit('open-options-history')"
      class="bg-gray-800 hover:bg-gray-750 p-4 rounded-lg border border-gray-700 hover:border-emerald-500/60 cursor-pointer transition-all duration-200 group relative shadow-sm hover:shadow-emerald-950/20"
      title="Click to view full Options Realized History & Filter by Year/Date"
    >
      <div class="flex items-center justify-between min-h-[32px]">
        <div class="text-gray-400 text-xs uppercase font-semibold">Realized Options</div>
        <span
          class="text-[10px] text-emerald-400/90 bg-emerald-950/70 border border-emerald-800/70 px-1.5 py-0.5 rounded font-medium group-hover:border-emerald-500 group-hover:bg-emerald-900/60 transition flex items-center gap-1"
        >
          History &nearr;
        </span>
      </div>
      <div
        class="text-2xl font-bold mt-1 font-mono"
        :class="store.realizedOptionsPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ currencyStore.formatMoney(store.realizedOptionsPL, { sign: true }) }}
      </div>
      <div class="text-[11px] text-gray-500 group-hover:text-gray-300 transition mt-0.5 flex items-center justify-between">
        <span>Click to view breakdown</span>
        <span class="text-[10px] text-gray-400 group-hover:text-emerald-400 transition">Filter by year</span>
      </div>
    </div>
  </div>
</template>
