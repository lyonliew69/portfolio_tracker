<script setup lang="ts">
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { computeHeatmapMatrix, computeMonthlyPerformance } from '../engine/analytics';
import { useCurrencyStore } from '../stores/currency';
import { usePortfolioStore } from '../stores/portfolio';

Chart.register(...registerables);

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const showAnalyticsHub = ref(true);
const activeTab = ref<'chart' | 'matrix'>('chart');
const chartMode = ref<'cumulative' | 'monthly'>('cumulative');
const assetFilter = ref<'all' | 'stock' | 'option'>('all');
const currentYear = new Date().getFullYear().toString();
const yearFilter = ref(currentYear);

const availableYears = computed(() => {
  const yearSet = new Set<string>();
  yearSet.add(currentYear);
  store.realizedStockRecords.forEach(r => { if (r.year) yearSet.add(r.year); });
  store.realizedOptionsRecords.forEach(r => { if (r.year) yearSet.add(r.year); });
  return Array.from(yearSet).sort().reverse();
});

const perfData = computed(() => {
  return computeMonthlyPerformance(
    store.realizedStockRecords,
    store.realizedOptionsRecords,
    assetFilter.value,
    yearFilter.value
  );
});

const heatmapMatrix = computed(() => {
  return computeHeatmapMatrix(
    store.realizedStockRecords,
    store.realizedOptionsRecords,
    availableYears.value,
    assetFilter.value
  );
});

let perfChartInstance: Chart | null = null;

function renderPerformanceChart() {
  nextTick(() => {
    const canvas = document.getElementById('performanceChartCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;

    const months = perfData.value.months;
    const isMonthly = chartMode.value === 'monthly';
    const labels = months.map(m => (yearFilter.value === 'ALL' ? m.label : m.shortMonth) || m.label);
    const values = months.map(m => isMonthly ? m.profit : m.cumulative);
    const barColors = months.map(m => m.profit >= 0 ? '#10b981' : '#f43f5e');

    if (perfChartInstance) {
      perfChartInstance.destroy();
      perfChartInstance = null;
    }

    const ctx = canvas.getContext('2d');
    let gradient: any = 'rgba(16, 185, 129, 0.15)';
    if (ctx) {
      gradient = ctx.createLinearGradient(0, 0, 0, 320);
      gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
      gradient.addColorStop(1, 'rgba(16, 185, 129, 0.0)');
    }

    const config: ChartConfiguration = {
      type: isMonthly ? 'bar' : 'line',
      data: {
        labels,
        datasets: [
          {
            label: isMonthly ? 'Monthly Net P/L' : 'Cumulative Net P/L',
            data: values,
            borderColor: isMonthly ? undefined : '#10b981',
            backgroundColor: isMonthly ? barColors : gradient,
            fill: !isMonthly,
            tension: 0.35,
            borderWidth: 2,
            pointRadius: months.length > 24 ? 2 : 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#10b981'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1f2937',
            borderColor: '#374151',
            borderWidth: 1,
            titleColor: '#f9fafb',
            bodyColor: '#e5e7eb',
            padding: 10,
            callbacks: {
              label: (context) => {
                const val = Number(context.raw) || 0;
                const monthItem = months[context.dataIndex];
                const lines = [
                  `${isMonthly ? 'Monthly P/L' : 'Cumulative P/L'}: ${currencyStore.formatMoney(val, { sign: true })}`
                ];
                if (!isMonthly && monthItem) {
                  lines.push(`Month Net: ${currencyStore.formatMoney(monthItem.profit, { sign: true })} (${monthItem.trades} trades)`);
                }
                return lines;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(55, 65, 81, 0.3)' },
            ticks: { color: '#9ca3af', font: { size: 10 }, maxRotation: 45 }
          },
          y: {
            grid: { color: 'rgba(55, 65, 81, 0.4)' },
            ticks: {
              color: '#9ca3af',
              font: { size: 10 },
              callback: (value) => currencyStore.formatMoney(Number(value))
            }
          }
        }
      }
    };
    perfChartInstance = new Chart(canvas, config);
  });
}

watch([showAnalyticsHub, activeTab, chartMode, assetFilter, yearFilter, perfData], () => {
  if (showAnalyticsHub.value && activeTab.value === 'chart') {
    renderPerformanceChart();
  }
});

onMounted(() => {
  if (activeTab.value === 'chart') {
    renderPerformanceChart();
  }
});

onBeforeUnmount(() => {
  if (perfChartInstance) {
    perfChartInstance.destroy();
    perfChartInstance = null;
  }
});
</script>

<template>
  <div class="bg-gray-800 rounded-xl border border-gray-700 mb-8 shadow-sm overflow-hidden transition-all">
    <!-- Card Header & Top Controls -->
    <div class="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-750 bg-gray-850">
      <div
        class="flex items-center justify-between cursor-pointer select-none flex-1"
        @click="showAnalyticsHub = !showAnalyticsHub"
      >
        <div class="flex items-center gap-3">
          <span class="p-2 bg-emerald-950/70 border border-emerald-800/70 rounded-lg text-emerald-400">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
            </svg>
          </span>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-base sm:text-lg font-bold text-white">Performance Analytics</h2>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono">
                {{ perfData.stats.activeMonths }} Active Months
              </span>
            </div>
            <p class="text-xs text-gray-400 mt-0.5">Historical cumulative equity growth & monthly returns matrix</p>
          </div>
        </div>
      </div>

      <!-- Right Controls: Tabs, Asset Filter & Chevron -->
      <div class="flex items-center justify-between lg:justify-end gap-3">
        <div v-show="showAnalyticsHub" class="flex flex-wrap items-center gap-2.5">
          <!-- Tab Switcher: Chart vs Matrix -->
          <div class="flex bg-gray-900/80 p-1 rounded-lg border border-gray-700 text-xs">
            <button
              type="button"
              @click="activeTab = 'chart'"
              :class="activeTab === 'chart' ? 'bg-emerald-600 text-white font-semibold shadow' : 'text-gray-400 hover:text-white'"
              class="px-3 py-1 rounded transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span>Chart View</span>
            </button>
            <button
              type="button"
              @click="activeTab = 'matrix'"
              :class="activeTab === 'matrix' ? 'bg-emerald-600 text-white font-semibold shadow' : 'text-gray-400 hover:text-white'"
              class="px-3 py-1 rounded transition flex items-center gap-1.5 cursor-pointer"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Monthly Heatmap</span>
            </button>
          </div>

          <!-- Asset Filter: All / Stocks / Options -->
          <div class="flex bg-gray-900/80 p-1 rounded-lg border border-gray-700 text-xs">
            <button
              type="button"
              @click="assetFilter = 'all'"
              :class="assetFilter === 'all' ? 'bg-gray-700 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-gray-200'"
              class="px-2.5 py-1 rounded transition cursor-pointer"
            >
              All
            </button>
            <button
              type="button"
              @click="assetFilter = 'stock'"
              :class="assetFilter === 'stock' ? 'bg-gray-700 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-gray-200'"
              class="px-2.5 py-1 rounded transition cursor-pointer"
            >
              Stocks
            </button>
            <button
              type="button"
              @click="assetFilter = 'option'"
              :class="assetFilter === 'option' ? 'bg-gray-700 text-emerald-400 font-semibold' : 'text-gray-400 hover:text-gray-200'"
              class="px-2.5 py-1 rounded transition cursor-pointer"
            >
              Options
            </button>
          </div>
        </div>

        <!-- Chevron Toggle -->
        <button
          type="button"
          @click="showAnalyticsHub = !showAnalyticsHub"
          class="text-emerald-400 hover:text-emerald-300 p-1 transition cursor-pointer"
          title="Toggle Performance Analytics"
        >
          <svg :class="{ 'rotate-180': showAnalyticsHub }" class="w-5 h-5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Card Body -->
    <div v-show="showAnalyticsHub" class="p-4 sm:p-6 space-y-4">
      <!-- Sub-toolbar for Chart Tab (View Mode & Year Filter) -->
      <div
        v-if="activeTab === 'chart'"
        class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-gray-700/60"
      >
        <!-- Display Mode: Cumulative Line vs Monthly Bars -->
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-gray-400 mr-1">Display:</span>
          <button
            type="button"
            @click="chartMode = 'cumulative'"
            :class="chartMode === 'cumulative' ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-semibold' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'"
            class="px-3 py-1 rounded-lg border text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>Cumulative P/L Curve</span>
          </button>
          <button
            type="button"
            @click="chartMode = 'monthly'"
            :class="chartMode === 'monthly' ? 'bg-emerald-950 border-emerald-700 text-emerald-300 font-semibold' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'"
            class="px-3 py-1 rounded-lg border text-xs transition flex items-center gap-1.5 cursor-pointer"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            <span>Monthly P/L Bars</span>
          </button>
        </div>

        <!-- Period (Year Filter) -->
        <div class="flex items-center gap-1.5 flex-wrap">
          <span class="text-xs text-gray-400 mr-1">Period:</span>
          <button
            type="button"
            @click="yearFilter = 'ALL'"
            :class="yearFilter === 'ALL' ? 'bg-emerald-600 text-white font-semibold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'"
            class="px-2.5 py-1 text-xs rounded-lg transition cursor-pointer"
          >
            All Time
          </button>
          <button
            v-for="y in availableYears"
            :key="y"
            type="button"
            @click="yearFilter = y"
            :class="yearFilter === y ? 'bg-emerald-600 text-white font-semibold shadow' : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'"
            class="px-2.5 py-1 text-xs rounded-lg transition cursor-pointer"
          >
            {{ y }}
          </button>
        </div>
      </div>

      <!-- KPI Mini Stats Strip (4 Cards) -->
      <div v-if="activeTab === 'chart'" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-750">
          <div class="text-[10px] uppercase font-semibold text-gray-400">Period Realized P/L</div>
          <div
            class="text-lg font-bold font-mono mt-0.5"
            :class="perfData.stats.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'"
          >
            {{ currencyStore.formatMoney(perfData.stats.totalPL, { sign: true }) }}
          </div>
        </div>

        <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-750">
          <div class="text-[10px] uppercase font-semibold text-gray-400">Profitable Months</div>
          <div class="text-lg font-bold font-mono mt-0.5 text-white">
            {{ perfData.stats.winMonths }} <span class="text-xs text-gray-400 font-normal">/ {{ perfData.stats.activeMonths }} ({{ perfData.stats.winRate.toFixed(1) }}%)</span>
          </div>
        </div>

        <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-750">
          <div class="text-[10px] uppercase font-semibold text-gray-400">Best Month</div>
          <div class="text-lg font-bold font-mono mt-0.5 text-emerald-400">
            <span v-if="perfData.stats.bestMonth">{{ currencyStore.formatMoney(perfData.stats.bestMonth.profit, { sign: true }) }}</span>
            <span v-else class="text-gray-500">—</span>
            <span v-if="perfData.stats.bestMonth" class="text-[11px] text-gray-400 font-normal block">
              {{ perfData.stats.bestMonth.label }}
            </span>
          </div>
        </div>

        <div class="bg-gray-900/60 p-3 rounded-lg border border-gray-750">
          <div class="text-[10px] uppercase font-semibold text-gray-400">Worst Month</div>
          <div class="text-lg font-bold font-mono mt-0.5 text-rose-400">
            <span v-if="perfData.stats.worstMonth">{{ currencyStore.formatMoney(perfData.stats.worstMonth.profit, { sign: true }) }}</span>
            <span v-else class="text-gray-500">—</span>
            <span v-if="perfData.stats.worstMonth" class="text-[11px] text-gray-400 font-normal block">
              {{ perfData.stats.worstMonth.label }}
            </span>
          </div>
        </div>
      </div>

      <!-- Chart Canvas Container -->
      <div
        v-show="activeTab === 'chart'"
        class="relative w-full h-72 sm:h-80 bg-gray-900/40 p-2 sm:p-4 rounded-xl border border-gray-750"
      >
        <canvas id="performanceChartCanvas"></canvas>
        <div
          v-if="perfData.months.length === 0"
          class="absolute inset-0 flex items-center justify-center text-gray-500 text-xs"
        >
          No realized performance data found for the selected period.
        </div>
      </div>

      <!-- Monthly Heatmap Matrix -->
      <div v-show="activeTab === 'matrix'" class="space-y-3">
        <div class="flex items-center justify-between text-xs text-gray-400">
          <span>Net realized return per calendar month across all active trading years.</span>
          <div class="flex items-center gap-2">
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-emerald-500/80"></span> Profit</span>
            <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded bg-rose-500/80"></span> Loss</span>
          </div>
        </div>

        <div class="overflow-x-auto border border-gray-700/80 rounded-xl bg-gray-900/60">
          <table class="w-full text-center text-xs whitespace-nowrap border-collapse min-w-[780px] font-mono">
            <thead class="bg-gray-850 text-gray-400 border-b border-gray-750 font-semibold uppercase text-[10px]">
              <tr>
                <th class="p-2.5 text-left pl-3.5">Year</th>
                <th v-for="m in ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']" :key="m" class="p-2">
                  {{ m }}
                </th>
                <th class="p-2.5 text-right font-bold text-white pr-3">YTD Total</th>
                <th class="p-2.5 text-right font-semibold text-gray-300 pr-3.5">Win Rate</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800 text-xs font-mono">
              <tr v-for="row in heatmapMatrix" :key="row.year" class="hover:bg-gray-800/40 transition">
                <td class="p-2.5 text-left font-bold text-white pl-3.5">{{ row.year }}</td>
                <td
                  v-for="cell in row.months"
                  :key="cell.monthIndex"
                  class="p-1.5"
                >
                  <div
                    v-if="cell.hasActivity"
                    class="py-1 px-1.5 rounded text-[11px] font-semibold"
                    :class="cell.profit > 0 ? (cell.profit >= 1000 ? 'bg-emerald-900/70 text-emerald-300 border border-emerald-700/60 font-bold' : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50') : (cell.profit < 0 ? 'bg-rose-950/70 text-rose-300 border border-rose-800/50' : 'bg-gray-800 text-gray-400 border border-gray-700')"
                    :title="`${cell.monthName} ${row.year}: ${currencyStore.formatMoney(cell.profit, { sign: true, decimals: 2 })} (${cell.trades} trades)`"
                  >
                    {{ currencyStore.formatMoney(cell.profit, { sign: true, decimals: 2 }) }}
                  </div>
                  <div v-else class="text-gray-600 text-[11px] py-1">—</div>
                </td>
                <td class="p-2.5 text-right font-bold pr-3" :class="row.totalPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                  {{ currencyStore.formatMoney(row.totalPL, { sign: true, decimals: 2 }) }}
                </td>
                <td class="p-2.5 text-right text-gray-300 font-semibold pr-3.5">
                  {{ row.winRate.toFixed(0) }}%
                </td>
              </tr>
              <tr v-if="heatmapMatrix.length === 0">
                <td colspan="15" class="py-6 text-center text-gray-500 text-xs">
                  No historical closed trades found to generate heatmap.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
