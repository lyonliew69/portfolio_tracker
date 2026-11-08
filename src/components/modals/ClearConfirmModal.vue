<script setup lang="ts">
import { usePortfolioStore } from '../../stores/portfolio';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();

async function handleClear() {
  await store.clearAllData();
  emit('close');
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
  >
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-sm w-full shadow-2xl space-y-4">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 rounded-lg bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </div>
        <div>
          <h3 class="text-lg font-bold text-rose-400">Clear Ledger</h3>
          <p class="text-xs text-gray-400">Permanent data deletion</p>
        </div>
      </div>

      <p class="text-xs text-gray-300 leading-relaxed">
        Are you sure you want to delete all transaction history? This action cannot be undone.
      </p>

      <div class="flex justify-end gap-2.5 pt-2">
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 bg-gray-700 hover:bg-gray-650 text-white text-xs font-semibold rounded-lg transition"
        >
          Cancel
        </button>
        <button
          type="button"
          @click="handleClear"
          class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-rose-950/40"
        >
          Yes, Clear Data
        </button>
      </div>
    </div>
  </div>
</template>
