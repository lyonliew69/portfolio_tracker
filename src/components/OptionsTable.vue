<script setup lang="ts">
import { computed } from 'vue';
import { useCurrencyStore } from '../stores/currency';
import { usePortfolioStore } from '../stores/portfolio';
import type { OptionHolding } from '../types/portfolio';

const store = usePortfolioStore();
const currencyStore = useCurrencyStore();

const optionsList = computed(() => store.optionHoldings);

function handleQuickClose(opt: OptionHolding) {
  store.startRollOption(opt);
  const el = document.getElementById('recordTransactionSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function handleStartRoll(opt: OptionHolding) {
  store.startRollOption(opt);
  const el = document.getElementById('recordTransactionSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}
</script>

<template>
  <div id="activeOptionsSection" class="bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden mb-6">
    <div class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-750 bg-gray-850">
      <div class="flex items-center gap-3">
        <span class="p-2 bg-purple-950/70 border border-purple-800/70 rounded-lg text-purple-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-lg font-bold text-white">Active Options & Spreads</h2>
            <span
              v-if="store.openOptionsSummary.totalContracts > 0"
              class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono font-semibold"
            >
              {{ store.openOptionsSummary.totalContracts }} {{ store.openOptionsSummary.totalContracts === 1 ? 'Contract' : 'Contracts' }}
            </span>
          </div>
          <p class="text-xs text-gray-400 mt-0.5">Close or expire position to realize ledger P/L</p>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="overflow-x-auto">
      <table class="w-full text-left border-collapse text-xs whitespace-nowrap">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 uppercase text-[10px] tracking-wider bg-gray-850/50">
            <th class="py-3 px-4 font-semibold">Underlying</th>
            <th class="py-3 px-4 font-semibold">Type</th>
            <th class="py-3 px-4 font-semibold text-right">Strike</th>
            <th class="py-3 px-4 font-semibold text-center">Expiration</th>
            <th class="py-3 px-4 font-semibold text-center">Side</th>
            <th class="py-3 px-4 font-semibold text-right">Contracts</th>
            <th class="py-3 px-4 font-semibold text-right">Avg Entry Premium</th>
            <th class="py-3 px-4 font-semibold text-right">Cost / Credit</th>
            <th class="py-3 px-4 font-semibold text-center">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-750">
          <tr v-if="optionsList.length === 0">
            <td colspan="9" class="text-center py-8 text-gray-500">No active option or spread positions.</td>
          </tr>
          <tr
            v-for="opt in optionsList"
            :key="opt.key"
            class="hover:bg-gray-750/50 transition-colors duration-150 font-mono"
          >
            <td class="py-3 px-4 font-bold text-white">{{ opt.symbol }}</td>
            <td class="py-3 px-4">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold border"
                :class="opt.optionType === 'Call' ? 'bg-blue-950/70 border-blue-800 text-blue-300' : 'bg-amber-950/70 border-amber-800 text-amber-300'"
              >
                {{ opt.optionType || 'Spread' }}
              </span>
            </td>
            <td class="py-3 px-4 text-right text-gray-200">${{ opt.strike }}</td>
            <td class="py-3 px-4 text-center text-gray-400">{{ opt.expiration }}</td>
            <td class="py-3 px-4 text-center">
              <span
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="opt.positionType === 'Short' ? 'bg-amber-950/70 text-amber-300 border border-amber-800' : 'bg-emerald-950/70 text-emerald-300 border border-emerald-800'"
              >
                {{ opt.positionType }}
              </span>
            </td>
            <td class="py-3 px-4 text-right font-bold text-white">{{ opt.quantity }}</td>
            <td class="py-3 px-4 text-right text-gray-300">{{ currencyStore.formatMoney(opt.avgCost) }}</td>
            <td class="py-3 px-4 text-right font-bold" :class="opt.positionType === 'Short' ? 'text-emerald-400' : 'text-rose-400'">
              <div class="text-[10px] font-normal uppercase font-sans text-gray-400">
                {{ opt.positionType === 'Long' ? 'Debit:' : 'Credit:' }}
              </div>
              {{ currencyStore.formatMoney(opt.totalCost) }}
            </td>
            <td class="py-3 px-4 text-center">
              <div class="flex items-center justify-center gap-1.5 font-sans">
                <button
                  @click="handleQuickClose(opt)"
                  class="px-2 py-1 bg-gray-700 hover:bg-gray-650 text-[11px] font-semibold rounded text-emerald-400 transition"
                  title="Close this option position"
                >
                  Close
                </button>
                <button
                  @click="handleStartRoll(opt)"
                  class="px-2 py-1 bg-gray-700 hover:bg-gray-650 text-[11px] font-semibold rounded text-amber-400 transition"
                  title="Roll this option position"
                >
                  Roll
                </button>
              </div>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="optionsList.length > 0" class="border-t-2 border-gray-700 bg-gray-900/60 text-xs font-semibold text-gray-300 font-mono">
          <tr>
            <td class="py-3 px-4 font-bold text-white">Total ({{ optionsList.length }})</td>
            <td colspan="4" class="py-3 px-4 text-gray-400">
              {{ store.openOptionsSummary.shortContracts }}S / {{ store.openOptionsSummary.longContracts }}L
            </td>
            <td class="py-3 px-4 text-right font-bold text-white">{{ store.openOptionsSummary.totalContracts }}</td>
            <td class="py-3 px-4 text-right text-gray-500">—</td>
            <td class="py-3 px-4 text-right font-bold" :class="store.openOptionsSummary.netPremium >= 0 ? 'text-emerald-400' : 'text-rose-400'">
              <div class="text-[10px] font-normal uppercase font-sans text-gray-400">Net Premium:</div>
              <div>{{ currencyStore.formatMoney(store.openOptionsSummary.netPremium, { sign: true }) }}</div>
            </td>
            <td class="py-3 px-4 text-center text-gray-500">—</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>
