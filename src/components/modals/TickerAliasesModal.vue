<script setup lang="ts">
import { ref } from 'vue';
import { usePortfolioStore } from '../../stores/portfolio';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();

const newAliasFrom = ref('');
const newAliasTo = ref('');

function handleAddAlias() {
  if (!newAliasFrom.value || !newAliasTo.value) return;
  store.addTickerAlias(newAliasFrom.value, newAliasTo.value);
  newAliasFrom.value = '';
  newAliasTo.value = '';
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
  >
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-5 sm:p-6 max-w-lg w-full shadow-2xl space-y-4 my-auto">
      <!-- Modal Header -->
      <div class="flex justify-between items-start border-b border-gray-700 pb-3">
        <div>
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <svg class="w-5 h-5 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
            </svg>
            <span>Ticker Symbol Aliases</span>
          </h3>
          <p class="text-xs text-gray-400 mt-1">
            Map changed or rebranded stock tickers to unify your holdings and P/L (e.g. SPLG → SPYM).
          </p>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-gray-700 transition"
        >
          ✕
        </button>
      </div>

      <!-- Add New Alias Form -->
      <form
        @submit.prevent="handleAddAlias"
        class="bg-gray-900/70 p-3.5 rounded-xl border border-gray-700/70 space-y-2.5"
      >
        <div class="text-xs font-semibold uppercase text-gray-300 flex items-center justify-between">
          <span>Add Ticker Mapping</span>
          <span class="text-[10px] text-gray-500 font-normal">e.g. Old Ticker → New Ticker</span>
        </div>
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div class="flex items-center gap-2 flex-1 min-w-0">
            <input
              type="text"
              v-model="newAliasFrom"
              placeholder="Old (e.g. SPLG)"
              required
              class="w-full min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white uppercase placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
            <span class="text-gray-400 font-bold shrink-0">→</span>
            <input
              type="text"
              v-model="newAliasTo"
              placeholder="New (e.g. SPYM)"
              required
              class="w-full min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs text-white uppercase placeholder-gray-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            class="px-4 py-2 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-white text-xs font-bold rounded-lg transition shrink-0 shadow-sm flex items-center justify-center gap-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add</span>
          </button>
        </div>
      </form>

      <!-- Current Mappings List -->
      <div>
        <div class="text-xs font-semibold uppercase text-gray-400 mb-2">Active Mappings</div>
        <div class="space-y-2 max-h-48 overflow-y-auto pr-1">
          <div
            v-for="(to, from) in store.tickerAliases"
            :key="from"
            class="flex justify-between items-center bg-gray-700/40 p-2.5 rounded-lg border border-gray-700"
          >
            <div class="flex items-center gap-2 min-w-0">
              <span class="font-bold text-sm text-gray-200 font-mono">{{ from }}</span>
              <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
              <span class="font-bold text-sm text-amber-400 font-mono">{{ to }}</span>
            </div>
            <button
              @click="store.removeTickerAlias(String(from))"
              class="text-rose-400 hover:text-rose-300 p-1 hover:bg-gray-700 rounded transition shrink-0"
              title="Remove alias"
            >
              ✕
            </button>
          </div>
          <div
            v-if="Object.keys(store.tickerAliases).length === 0"
            class="text-xs text-gray-500 text-center py-4"
          >
            No active ticker aliases configured.
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2 pt-3 border-t border-gray-700">
        <button
          @click="store.applyTickerAliasesToLedger(true)"
          class="px-3.5 py-2 bg-gray-700 hover:bg-gray-650 text-xs font-semibold text-gray-200 hover:text-white rounded-lg border border-gray-600 transition text-center"
          title="Update all existing ledger transactions to their new symbols"
        >
          Apply to Current Ledger
        </button>
        <button
          @click="emit('close')"
          class="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition text-center"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
