<script setup lang="ts">
import { Chart, registerables } from 'chart.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useCurrencyStore } from '../../stores/currency';
import { usePortfolioStore } from '../../stores/portfolio';

Chart.register(...registerables);

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const modalAllocationSearch = ref('');
const hoveredAllocationItem = ref<any>(null);
const allocationGroupSmall = ref<boolean>(
  localStorage.getItem('tx_allocation_group_small') !== 'false'
);

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

function toggleAllocationGroupSmall() {
  allocationGroupSmall.value = !allocationGroupSmall.value;
  localStorage.setItem('tx_allocation_group_small', String(allocationGroupSmall.value));
  updateModalAllocationChart();
}

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

const modalFilteredHoldings = computed(() => {
  let list = rankedHoldingsForAllocation.value;
  if (modalAllocationSearch.value && modalAllocationSearch.value.trim()) {
    const q = modalAllocationSearch.value.trim().toUpperCase();
    list = list.filter(h => h.symbol.toUpperCase().includes(q));
  }
  return list;
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
        currentPrice: h.currentPrice,
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
      symbol: `Other (<1%)`,
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

let modalChartInstance: Chart | null = null;

function destroyModalChart() {
  if (modalChartInstance) {
    modalChartInstance.destroy();
    modalChartInstance = null;
  }
}

function updateModalAllocationChart() {
  nextTick(() => {
    const canvas = document.getElementById('modalAllocationChart') as HTMLCanvasElement | null;
    if (!canvas) return;

    // Safety: ensure chart instance is bound to the currently mounted canvas
    if (modalChartInstance && modalChartInstance.canvas !== canvas) {
      modalChartInstance.destroy();
      modalChartInstance = null;
    }
    const existingChart = Chart.getChart(canvas);
    if (existingChart && existingChart !== modalChartInstance) {
      existingChart.destroy();
    }

    const donutData = allocationDonutData.value;
    const labels = donutData.labels;
    const values = donutData.values;
    const colors = donutData.colors;

    if (labels.length === 0) {
      destroyModalChart();
      return;
    }

    if (modalChartInstance) {
      modalChartInstance.data.labels = labels;
      modalChartInstance.data.datasets[0].data = values;
      modalChartInstance.data.datasets[0].backgroundColor = colors;
      modalChartInstance.update();
    } else {
      modalChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: '#151d2a',
              borderRadius: 4,
              spacing: 2
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
            legend: { display: false },
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
                label: (context: any) => {
                  const val = context.raw || 0;
                  const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                  const pct = total > 0 ? ((val / total) * 100).toFixed(2) : '0.00';
                  const item = allocationDonutData.value.items[context.dataIndex];
                  if (item && item.isOther) {
                    return ` ${item.symbol}: ${currencyStore.formatMoney(val)} (${pct}%) - ${item.count} holdings`;
                  }
                  return ` ${context.label}: ${currencyStore.formatMoney(val)} (${pct}%)`;
                }
              }
            }
          }
        }
      });
    }
  });
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) {
    emit('close');
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
  if (props.show) {
    updateModalAllocationChart();
  }
});

watch(
  () => props.show,
  (val) => {
    if (val) {
      allocationGroupSmall.value = localStorage.getItem('tx_allocation_group_small') !== 'false';
      nextTick(() => updateModalAllocationChart());
    } else {
      destroyModalChart();
      modalAllocationSearch.value = '';
      hoveredAllocationItem.value = null;
    }
  }
);

watch(
  [rankedHoldingsForAllocation, allocationGroupSmall],
  () => {
    if (props.show) updateModalAllocationChart();
  }
);

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown);
  destroyModalChart();
});
</script>

<template>
  <!-- Stock Allocation Enlarge Modal (Option 4) -->
  <div
    v-if="show"
    class="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 z-50 animate-in fade-in duration-150"
  >
    <div
      @click.stop
      class="bg-gray-850 rounded-2xl border border-gray-750 shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Modal Header -->
      <div class="p-4 sm:p-5 border-b border-gray-750 flex items-center justify-between bg-gray-900/60">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-emerald-950/80 border border-emerald-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
          </div>
          <div>
            <h3 class="text-base sm:text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              <span>Stock Capital Allocation</span>
              <span class="text-xs px-2 py-0.5 rounded-full font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                {{ store.stockHoldings.length }} Positions
              </span>
            </h3>
            <p class="text-xs text-gray-400">Full capital distribution & portfolio weighting breakdown</p>
          </div>
        </div>

        <div class="flex items-center gap-4">
          <div class="hidden sm:flex flex-col items-end">
            <span class="text-[10px] uppercase font-bold text-gray-400">Total Market Value</span>
            <span class="text-sm font-extrabold text-white font-mono">{{ currencyStore.formatMoney(store.stockPortfolioValue) }}</span>
          </div>
          <button
            @click="emit('close')"
            class="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-gray-750 transition text-lg leading-none cursor-pointer"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Modal Body: Two-Column Responsive Layout -->
      <div class="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <!-- Left: Large Donut Chart & Controls (5 cols) -->
        <div class="lg:col-span-5 flex flex-col items-center justify-between bg-gray-900/40 p-4 rounded-xl border border-gray-750">
          <div class="w-full flex items-center justify-between mb-2">
            <span class="text-xs font-semibold text-gray-300">Donut Visualization</span>
            <button
              type="button"
              @click="toggleAllocationGroupSmall"
              :class="allocationGroupSmall ? 'bg-emerald-950 border-emerald-700 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200'"
              class="px-2.5 py-1 rounded-lg border text-xs font-mono transition flex items-center gap-1.5 cursor-pointer"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="allocationGroupSmall ? 'bg-emerald-400' : 'bg-gray-500'"></span>
              <span>Group &lt; 1%</span>
            </button>
          </div>

          <div class="relative flex items-center justify-center w-full min-h-[310px]">
            <canvas id="modalAllocationChart" class="w-full max-w-[320px] max-h-[320px]"></canvas>

            <!-- Interactive Center Stats in Modal -->
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-7 transition-all duration-150">
              <template v-if="hoveredAllocationItem">
                <span class="text-xs font-bold text-sky-400 tracking-wider flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full shadow-sm" :style="{ backgroundColor: hoveredAllocationItem.color }"></span>
                  <span>{{ hoveredAllocationItem.symbol }}</span>
                </span>
                <span class="text-xl font-extrabold text-white font-mono mt-0.5">
                  {{ currencyStore.formatMoney(hoveredAllocationItem.marketValue) }}
                </span>
                <span class="text-sm font-semibold text-emerald-400 font-mono">
                  {{ hoveredAllocationItem.weightPercent.toFixed(2) }}%
                </span>
                <span v-if="hoveredAllocationItem.isOther" class="text-[10px] text-gray-400 font-mono mt-0.5">
                  {{ hoveredAllocationItem.count }} micro-positions
                </span>
              </template>
              <template v-else>
                <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Total Value</span>
                <span class="text-xl font-extrabold text-white font-mono mt-0.5">
                  {{ currencyStore.formatMoney(store.stockPortfolioValue) }}
                </span>
                <span class="text-xs text-gray-400 font-mono">
                  {{ store.stockHoldings.length }} Active Stocks
                </span>
              </template>
            </div>
          </div>

          <div class="w-full text-center text-[11px] text-gray-400 mt-2">
            Hover over any chart segment or table row to inspect individual capital weight.
          </div>
        </div>

        <!-- Right: Detailed Ranked Breakdown Table (7 cols) -->
        <div class="lg:col-span-7 flex flex-col">
          <div class="flex items-center justify-between gap-3 mb-3">
            <div class="relative flex-1">
              <input
                type="text"
                v-model="modalAllocationSearch"
                placeholder="Filter ticker symbol..."
                class="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 uppercase"
              />
              <button
                v-if="modalAllocationSearch"
                @click="modalAllocationSearch = ''"
                class="absolute right-2.5 top-1.5 text-gray-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>
            <span class="text-xs text-gray-400 font-mono whitespace-nowrap">
              {{ modalFilteredHoldings.length }} of {{ rankedHoldingsForAllocation.length }}
            </span>
          </div>

          <div class="overflow-x-auto flex-1 max-h-[440px] overflow-y-auto border border-gray-750 rounded-xl bg-gray-900/40 pr-1">
            <table class="w-full text-left text-xs border-collapse">
              <thead class="bg-gray-850 text-gray-400 uppercase text-[10px] font-semibold sticky top-0 border-b border-gray-750 z-10">
                <tr>
                  <th class="p-2.5">Symbol</th>
                  <th class="p-2.5 text-right">Shares</th>
                  <th class="p-2.5 text-right">Price</th>
                  <th class="p-2.5 text-right">Market Value</th>
                  <th class="p-2.5 text-right">Unrealized P/L</th>
                  <th class="p-2.5 text-right">Weight %</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800 text-gray-200">
                <tr
                  v-for="(h, idx) in modalFilteredHoldings"
                  :key="h.symbol"
                  @mouseenter="hoveredAllocationItem = { ...h, color: getHoldingColor(idx) }"
                  @mouseleave="hoveredAllocationItem = null"
                  class="hover:bg-gray-800/60 transition group cursor-pointer"
                  :class="{ 'bg-gray-800/40': hoveredAllocationItem && hoveredAllocationItem.symbol === h.symbol }"
                >
                  <td class="p-2.5 font-bold text-white whitespace-nowrap flex items-center gap-2">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" :style="{ backgroundColor: getHoldingColor(idx) }"></span>
                    <span>{{ h.symbol }}</span>
                  </td>
                  <td class="p-2.5 text-right font-mono text-gray-300">{{ h.quantity }}</td>
                  <td class="p-2.5 text-right font-mono text-gray-300">{{ currencyStore.formatMoney(h.currentPrice) }}</td>
                  <td class="p-2.5 text-right font-mono font-bold text-white">{{ currencyStore.formatMoney(h.marketValue) }}</td>
                  <td class="p-2.5 text-right font-mono" :class="h.unrealizedPL >= 0 ? 'text-emerald-400' : 'text-rose-400'">
                    {{ currencyStore.formatMoney(h.unrealizedPL, { sign: true }) }}
                    <span class="text-[10px] text-gray-400">({{ h.unrealizedPercent.toFixed(1) }}%)</span>
                  </td>
                  <td class="p-2.5 text-right font-mono">
                    <div class="flex items-center justify-end gap-2">
                      <span
                        class="font-bold text-xs"
                        :class="h.weightPercent >= 1 ? 'text-sky-300' : 'text-amber-300'"
                      >
                        {{ h.weightPercent.toFixed(2) }}%
                      </span>
                      <div class="w-14 bg-gray-800 rounded-full h-1.5 overflow-hidden hidden sm:block">
                        <div
                          class="h-full rounded-full"
                          :style="{ width: Math.max(2, Math.min(100, h.weightPercent)) + '%', backgroundColor: getHoldingColor(idx) }"
                        ></div>
                      </div>
                    </div>
                  </td>
                </tr>
                <tr v-if="modalFilteredHoldings.length === 0">
                  <td colspan="6" class="p-8 text-center text-gray-500 font-mono">
                    No matching stock positions found.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="p-4 border-t border-gray-750 flex items-center justify-between bg-gray-900/60 text-xs text-gray-400">
        <span>Weights are calculated relative to active stock market value ({{ currencyStore.formatMoney(store.stockPortfolioValue) }}).</span>
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-semibold transition border border-gray-700 cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
