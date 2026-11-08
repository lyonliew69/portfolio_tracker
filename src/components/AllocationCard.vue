<script setup lang="ts">
import { Chart, type ChartConfiguration, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePortfolioStore } from '../stores/portfolio';

Chart.register(...registerables);

const emit = defineEmits<{
  (e: 'open-enlarge-modal'): void;
}>();

const store = usePortfolioStore();

const showAllocation = ref<boolean>(localStorage.getItem('show_allocation') === 'true');
const allocationViewTab = ref<'donut' | 'bars'>(
  (localStorage.getItem('tx_allocation_view_tab') as 'donut' | 'bars') || 'donut'
);
const allocationGroupSmall = ref<boolean>(
  localStorage.getItem('tx_allocation_group_small') !== 'false'
);
const hoveredAllocationItem = ref<any>(null);

const coolFinancialColors = [
  '#38bdf8', // Sky Blue
  '#6366f1', // Indigo
  '#a855f7', // Purple
  '#06b6d4', // Cyan
  '#f59e0b', // Warm Amber
  '#3b82f6', // Cobalt Blue
  '#c084fc', // Violet
  '#0ea5e9', // Ocean Blue
  '#818cf8', // Periwinkle
  '#14b8a6', // Deep Teal
  '#fbbf24', // Sun Gold
  '#93c5fd', // Soft Blue
  '#e879f9', // Orchid
  '#2dd4bf', // Teal Accent
  '#f472b6', // Pink Accent
  '#64748b'  // Slate Steel (Reserved for Other <1%)
];

function getHoldingColor(idx: number): string {
  return coolFinancialColors[idx % (coolFinancialColors.length - 1)];
}

function formatNumber(num?: number | null): string {
  if (num === undefined || num === null || isNaN(num)) return '0.00';
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toggleShowAllocation() {
  showAllocation.value = !showAllocation.value;
  localStorage.setItem('show_allocation', String(showAllocation.value));
}

function setAllocationViewTab(tab: 'donut' | 'bars') {
  allocationViewTab.value = tab;
  localStorage.setItem('tx_allocation_view_tab', tab);
  if (tab === 'donut') {
    renderChart();
  }
}

function toggleAllocationGroupSmall() {
  allocationGroupSmall.value = !allocationGroupSmall.value;
  localStorage.setItem('tx_allocation_group_small', allocationGroupSmall.value ? 'true' : 'false');
  renderChart();
}

function openAllocationModal() {
  emit('open-enlarge-modal');
}

const hasNoStockHoldings = computed(() => {
  return store.stockHoldings.length === 0;
});

const rankedHoldingsForAllocation = computed(() => {
  const totalVal = store.stockPortfolioValue;
  return store.stockHoldings
    .map((h, idx) => {
      const weightPercent = totalVal > 0 ? (h.marketValue / totalVal) * 100 : 0;
      return {
        ...h,
        weightPercent,
        color: getHoldingColor(idx)
      };
    })
    .sort((a, b) => b.marketValue - a.marketValue);
});

const allocationDonutData = computed(() => {
  const holdings = rankedHoldingsForAllocation.value;
  const totalVal = store.stockPortfolioValue;
  if (holdings.length === 0 || totalVal <= 0) {
    return { labels: [] as string[], values: [] as number[], colors: [] as string[], items: [] as any[] };
  }

  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];
  const items: any[] = [];

  const otherItems: any[] = [];
  let otherValue = 0;

  holdings.forEach((h, index) => {
    if (allocationGroupSmall.value && h.weightPercent < 1.0) {
      otherItems.push(h);
      otherValue += h.marketValue;
    } else {
      const color = getHoldingColor(index);
      labels.push(h.symbol);
      values.push(h.marketValue);
      colors.push(color);
      items.push({
        symbol: h.symbol,
        quantity: h.quantity,
        marketValue: h.marketValue,
        weightPercent: h.weightPercent,
        color: color,
        isOther: false
      });
    }
  });

  if (otherItems.length > 0) {
    const otherWeight = totalVal > 0 ? (otherValue / totalVal) * 100 : 0;
    labels.push(`Other (<1%) [${otherItems.length}]`);
    values.push(otherValue);
    const otherColor = '#64748b'; // Slate Steel
    colors.push(otherColor);
    items.push({
      symbol: 'Other (<1%)',
      marketValue: otherValue,
      weightPercent: otherWeight,
      color: otherColor,
      isOther: true,
      subItems: otherItems,
      count: otherItems.length
    });
  }

  return { labels, values, colors, items };
});

let chartInstance: Chart | null = null;

function renderChart() {
  nextTick(() => {
    const canvas = document.getElementById('allocationChart') as HTMLCanvasElement | null;
    if (!canvas) return;

    const donutData = allocationDonutData.value;
    const labels = donutData.labels;
    const values = donutData.values;
    const colors = donutData.colors;

    if (labels.length === 0) {
      if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
      }
      return;
    }

    if (chartInstance && chartInstance.canvas !== canvas) {
      chartInstance.destroy();
      chartInstance = null;
    }
    const existingChart = Chart.getChart(canvas);
    if (existingChart && existingChart !== chartInstance) {
      existingChart.destroy();
    }

    if (chartInstance) {
      chartInstance.data.labels = labels;
      chartInstance.data.datasets[0].data = values;
      chartInstance.data.datasets[0].backgroundColor = colors;
      chartInstance.update();
    } else {
      const config: ChartConfiguration<'doughnut'> = {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: '#1f2937', // gray-800
              borderRadius: 3,
              spacing: 1.5
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          onHover: (_, activeElements) => {
            if (activeElements && activeElements.length > 0) {
              const idx = activeElements[0].index;
              const item = allocationDonutData.value.items[idx];
              if (item) {
                hoveredAllocationItem.value = item;
              }
            } else {
              hoveredAllocationItem.value = null;
            }
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#f3f4f6',
              bodyColor: '#e5e7eb',
              borderColor: '#374151',
              borderWidth: 1,
              padding: 10,
              boxPadding: 4,
              usePointStyle: true,
              callbacks: {
                label: (context) => {
                  const val = Number(context.raw) || 0;
                  const total = (context.dataset.data as number[]).reduce((a, b) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(2) : '0';
                  const item = allocationDonutData.value.items[context.dataIndex];
                  if (item && item.isOther) {
                    return ` ${item.symbol}: $${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%) - ${item.count} holdings`;
                  }
                  return ` ${context.label}: $${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${pct}%)`;
                }
              }
            }
          }
        }
      };
      chartInstance = new Chart(canvas, config);
    }
  });
}

watch([rankedHoldingsForAllocation, allocationViewTab, allocationGroupSmall], () => {
  if (showAllocation.value && allocationViewTab.value === 'donut') {
    renderChart();
  }
});

watch(showAllocation, (val) => {
  if (val && allocationViewTab.value === 'donut') {
    renderChart();
  }
});

onMounted(() => {
  if (showAllocation.value && allocationViewTab.value === 'donut') {
    renderChart();
  }
});

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
});
</script>

<template>
  <!-- Portfolio Allocation Chart Card -->
  <div class="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-sm">
    <h2
      @click="toggleShowAllocation"
      class="text-lg font-semibold text-emerald-400 cursor-pointer flex justify-between items-center select-none"
      :class="showAllocation ? 'mb-3' : 'mb-0'"
    >
      <span>Stock Allocation</span>
      <svg
        :class="{ 'rotate-180': showAllocation }"
        class="w-5 h-5 transition-transform"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </h2>

    <div v-show="showAllocation">
      <!-- Toolbar & Subtitle row -->
      <div class="flex items-center justify-between gap-2 mb-3">
        <p class="text-xs text-gray-400">
          <span>Capital distribution by Ticker</span>
          <span v-if="allocationViewTab === 'bars'" class="text-[11px] text-gray-500 font-mono ml-1">
            ({{ rankedHoldingsForAllocation.length }})
          </span>
        </p>

        <!-- Card Toolbar: View Switcher (Option 2) & Enlarge Button (Option 4) -->
        <div class="flex items-center gap-1.5">
          <!-- Donut vs Bars Switcher -->
          <div class="flex bg-gray-900/90 p-0.5 rounded-lg border border-gray-700 text-xs">
            <button
              type="button"
              @click="setAllocationViewTab('donut')"
              :class="allocationViewTab === 'donut' ? 'bg-emerald-600 text-white font-semibold shadow-sm' : 'text-gray-400 hover:text-white'"
              class="px-2 py-0.5 rounded transition flex items-center gap-1"
              title="Donut Chart View"
            >
              <span>🍩</span>
              <span class="text-[11px]">Donut</span>
            </button>
            <button
              type="button"
              @click="setAllocationViewTab('bars')"
              :class="allocationViewTab === 'bars' ? 'bg-emerald-600 text-white font-semibold shadow-sm' : 'text-gray-400 hover:text-white'"
              class="px-2 py-0.5 rounded transition flex items-center gap-1"
              title="Ranked Allocation Bars View"
            >
              <span>📊</span>
              <span class="text-[11px]">Bars</span>
            </button>
          </div>

          <!-- Group < 1% Toggle (Option 1) -->
          <button
            v-if="allocationViewTab === 'donut'"
            type="button"
            @click="toggleAllocationGroupSmall"
            :class="allocationGroupSmall ? 'bg-emerald-950/80 border-emerald-700/80 text-emerald-300' : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-gray-200'"
            class="px-2 py-0.5 rounded-lg border text-[11px] font-mono transition flex items-center gap-1"
            :title="allocationGroupSmall ? 'Currently grouping holdings < 1% into Other. Click to show all raw slices.' : 'Currently showing all raw slices. Click to group < 1% holdings.'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="allocationGroupSmall ? 'bg-emerald-400' : 'bg-gray-500'"></span>
            <span>&lt;1%</span>
          </button>

          <!-- Enlarge / Popout Modal (Option 4) -->
          <button
            type="button"
            @click="openAllocationModal"
            class="p-1 bg-gray-900/80 hover:bg-gray-750 text-gray-400 hover:text-emerald-300 rounded-lg border border-gray-700 hover:border-emerald-500/50 transition cursor-pointer"
            title="Enlarge Allocation View (Full Screen Breakdown)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>

      <!-- VIEW A: Thicker Donut with Interactive Center Inspection -->
      <div v-show="allocationViewTab === 'donut'" class="relative flex items-center justify-center min-h-[290px]">
        <canvas id="allocationChart" class="w-full max-w-[280px] max-h-[280px]"></canvas>

        <!-- Center Total / Hover Stats Display for Doughnut -->
        <div
          v-if="!hasNoStockHoldings && store.stockHoldings.length > 0"
          class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-7 transition-all duration-150"
        >
          <template v-if="hoveredAllocationItem">
            <span class="text-[11px] font-bold text-sky-400 tracking-wider flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full shadow-sm" :style="{ backgroundColor: hoveredAllocationItem.color }"></span>
              <span>{{ hoveredAllocationItem.symbol }}</span>
            </span>
            <span class="text-base font-extrabold text-white font-mono mt-0.5">
              ${{ formatNumber(hoveredAllocationItem.marketValue) }}
            </span>
            <span class="text-xs font-semibold text-emerald-400 font-mono">
              {{ hoveredAllocationItem.weightPercent.toFixed(2) }}%
            </span>
            <span v-if="hoveredAllocationItem.isOther" class="text-[9px] text-gray-400 font-mono">
              {{ hoveredAllocationItem.count }} micro-holdings
            </span>
          </template>
          <template v-else>
            <span class="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Total Value</span>
            <span class="text-base font-extrabold text-white font-mono mt-0.5">
              ${{ formatNumber(store.stockPortfolioValue) }}
            </span>
            <span class="text-[10px] text-gray-400 font-mono">
              {{ store.stockHoldings.length }} Holdings
            </span>
          </template>
        </div>

        <div
          v-if="hasNoStockHoldings"
          class="absolute inset-0 flex items-center justify-center bg-gray-800/90 text-xs text-gray-500 text-center px-4"
        >
          No active stock positions to display allocation.
        </div>
      </div>

      <!-- Donut Legend Pill Strip (Option 1) -->
      <div
        v-if="allocationViewTab === 'donut' && !hasNoStockHoldings"
        class="flex flex-wrap items-center justify-center gap-1.5 mt-2 pt-2 border-t border-gray-700/60 max-h-24 overflow-y-auto pr-1"
      >
        <button
          v-for="item in allocationDonutData.items"
          :key="item.symbol"
          type="button"
          @mouseenter="hoveredAllocationItem = item"
          @mouseleave="hoveredAllocationItem = null"
          class="px-2 py-0.5 rounded-full text-[10px] font-mono flex items-center gap-1.5 transition border cursor-pointer"
          :class="(hoveredAllocationItem && hoveredAllocationItem.symbol === item.symbol) ? 'bg-gray-700 border-gray-500 text-white' : 'bg-gray-900/70 border-gray-800 text-gray-300 hover:border-gray-600'"
        >
          <span class="w-1.5 h-1.5 rounded-full" :style="{ backgroundColor: item.color }"></span>
          <span class="font-semibold">{{ item.symbol }}</span>
          <span class="text-gray-400">{{ item.weightPercent.toFixed(1) }}%</span>
        </button>
      </div>

      <!-- VIEW B: Ranked Allocation Bars (Option 2 - Perfect for < 1% Holdings) -->
      <div v-show="allocationViewTab === 'bars'" class="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        <div v-if="hasNoStockHoldings" class="text-center py-8 text-xs text-gray-500">
          No active stock positions.
        </div>
        <div
          v-for="(holding, idx) in rankedHoldingsForAllocation"
          :key="holding.symbol"
          @mouseenter="hoveredAllocationItem = { ...holding, color: getHoldingColor(idx) }"
          @mouseleave="hoveredAllocationItem = null"
          class="bg-gray-900/50 hover:bg-gray-750 p-2 rounded-lg border border-gray-750 hover:border-gray-600 transition group"
        >
          <div class="flex items-center justify-between mb-1 text-xs">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: getHoldingColor(idx) }"></span>
              <span class="font-bold text-white group-hover:text-emerald-300 transition">{{ holding.symbol }}</span>
              <span class="text-[10px] text-gray-400 font-mono truncate">({{ holding.quantity }} shs)</span>
            </div>
            <div class="flex items-center gap-2 font-mono flex-shrink-0">
              <span class="text-xs text-gray-200 font-semibold">${{ formatNumber(holding.marketValue) }}</span>
              <span
                class="text-[11px] px-1.5 py-0.2 rounded font-bold"
                :class="holding.weightPercent >= 1 ? 'bg-gray-800 text-sky-300 border border-gray-700' : 'bg-amber-950/70 text-amber-300 border border-amber-800/70'"
                :title="holding.weightPercent < 1 ? 'Micro position (< 1%)' : ''"
              >
                {{ holding.weightPercent.toFixed(2) }}%
              </span>
            </div>
          </div>
          <!-- Proportional Bar -->
          <div class="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-300"
              :style="{ width: Math.max(1.5, Math.min(100, holding.weightPercent)) + '%', backgroundColor: getHoldingColor(idx) }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
