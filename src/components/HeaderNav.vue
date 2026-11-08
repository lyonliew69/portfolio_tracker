<script setup lang="ts">
import { computed, ref } from 'vue';
import { SUPPORTED_CURRENCIES } from '../services/fx';
import { showNotification } from '../services/notification';
import { useCurrencyStore } from '../stores/currency';
import { useMarketStore } from '../stores/market';
import { usePortfolioStore } from '../stores/portfolio';
import { useThemeStore } from '../stores/theme';
import type { CostBasisMethod } from '../types/portfolio';

const portfolioStore = usePortfolioStore();
const marketStore = useMarketStore();
const currencyStore = useCurrencyStore();
const themeStore = useThemeStore();

const showToolsDropdown = ref(false);
const schwabFileInput = ref<HTMLInputElement | null>(null);
const ibkrFileInput = ref<HTMLInputElement | null>(null);

const emit = defineEmits<{
  (e: 'open-ai-modal'): void;
  (e: 'open-storage-modal'): void;
  (e: 'open-schwab-import'): void;
  (e: 'select-schwab-file', file: File): void;
  (e: 'open-ibkr-import'): void;
  (e: 'select-ibkr-file', file: File): void;
  (e: 'open-aliases-modal'): void;
  (e: 'open-currency-modal'): void;
  (e: 'open-settings-modal'): void;
  (e: 'open-clear-confirm'): void;
}>();

const hasAiReport = computed(() => {
  if (typeof window === 'undefined') return false;
  try {
    return !!localStorage.getItem('deep_research_report');
  } catch {
    return false;
  }
});

async function handleManualSync() {
  if (!marketStore.finnhubApiKey && !marketStore.geminiApiKey) {
    emit('open-settings-modal');
    showNotification('Finnhub API key is required for accurate real-time market prices. Please enter your free key.', 'info');
    return;
  }
  await marketStore.syncPrices(portfolioStore.uniqueStockTickers, (sym, price) => {
    portfolioStore.setMarketPrices({ [sym]: price });
  }, false);
}

function handleIntervalChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const val = Math.max(1, Math.min(120, parseInt(target.value, 10) || 1));
  marketStore.setIntervalMinutes(val);
}

function handleToggleAutoSync() {
  if (!marketStore.finnhubApiKey && !marketStore.geminiApiKey) {
    emit('open-settings-modal');
    showNotification('Finnhub API key is required for accurate real-time market prices. Please enter your free key.', 'info');
    return;
  }
  marketStore.toggleAutoSync(
    () => portfolioStore.uniqueStockTickers,
    (sym, price) => {
      portfolioStore.setMarketPrices({ [sym]: price });
    }
  );
}

function triggerSchwabFileInput() {
  if (schwabFileInput.value) {
    schwabFileInput.value.click();
  }
}

function triggerIbkrFileInput() {
  if (ibkrFileInput.value) {
    ibkrFileInput.value.click();
  }
}

function handleSchwabFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  emit('select-schwab-file', file);
  if (target) target.value = '';
}

function handleIbkrFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  emit('select-ibkr-file', file);
  if (target) target.value = '';
}
</script>

<template>
  <header class="mb-8">
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-gray-800">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <span>Portfolio Ledger</span>
            <span class="text-xs px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 font-mono">
              v2.0 Modular
            </span>
          </h1>
        </div>
        <p class="text-xs text-gray-400 mt-1">Multi-Broker Stock & Options Tax Lot Accounting Hub</p>
      </div>

      <!-- Controls Right -->
      <div class="flex flex-wrap items-center gap-2.5">
        <!-- 1. Storage Status Pill (Click opens Storage & Cloud Hub) -->
        <button
          @click="emit('open-storage-modal')"
          class="px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-2 transition cursor-pointer"
          :class="portfolioStore.fileStatus === 'active' ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300 hover:bg-emerald-900/60' : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-750'"
          title="Click to manage file database & cloud sync"
        >
          <span
            class="w-2 h-2 rounded-full"
            :class="portfolioStore.fileStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"
          ></span>
          <span>{{ portfolioStore.fileName || 'Local Browser Storage' }}</span>
        </button>

        <!-- 2. AI Deep Research Button -->
        <button
          @click="emit('open-ai-modal')"
          class="px-2.5 py-2 bg-gradient-to-r from-indigo-900/60 to-purple-900/60 hover:from-indigo-800/80 hover:to-purple-800/80 text-indigo-200 hover:text-white text-xs font-semibold rounded border border-indigo-500/50 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
          title="Daily Market & Portfolio Deep Research powered by Google Gemini & Live Google Finance"
        >
          <svg class="w-3.5 h-3.5 text-indigo-300 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>AI Deep Research</span>
          <span
            v-if="hasAiReport"
            class="w-1.5 h-1.5 rounded-full bg-indigo-400"
            title="Daily Report Available"
          ></span>
        </button>

        <!-- 3. Finnhub Live Sync Controls -->
        <div class="flex items-center bg-gray-800 rounded-lg border border-gray-700 p-0.5 shadow-sm gap-1">
          <!-- Manual Sync Now Button -->
          <button
            @click="handleManualSync"
            :disabled="marketStore.isSyncing || marketStore.autoSyncEnabled"
            class="px-2.5 py-1.5 rounded-md text-xs font-semibold transition flex items-center gap-1.5"
            :class="marketStore.isSyncing || marketStore.autoSyncEnabled ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'"
          >
            <svg v-if="marketStore.isSyncing" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span v-if="marketStore.isSyncing">Syncing...</span>
            <span v-else>Sync Live Stocks</span>
          </button>

          <div class="h-4 w-px bg-gray-700 mx-0.5"></div>

          <!-- Auto-Sync Toggle & Interval -->
          <div class="flex items-center gap-1.5 px-1 py-0.5 text-xs">
            <!-- Toggle Button & Label -->
            <div
              @click="handleToggleAutoSync"
              class="flex items-center gap-1.5 cursor-pointer select-none group"
              title="Click to toggle auto refresh"
            >
              <button
                type="button"
                :disabled="!marketStore.finnhubApiKey && !marketStore.geminiApiKey"
                role="switch"
                :aria-checked="marketStore.autoSyncEnabled"
                :class="marketStore.autoSyncEnabled ? 'bg-emerald-600 ring-1 ring-emerald-400/50' : 'bg-gray-700 group-hover:bg-gray-650'"
                class="relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed items-center"
              >
                <span
                  :class="marketStore.autoSyncEnabled ? 'translate-x-3 bg-white shadow' : 'translate-x-0 bg-gray-300'"
                  class="pointer-events-none inline-block h-3 w-3 transform rounded-full transition duration-200 ease-in-out"
                ></span>
              </button>
              <span
                class="text-xs transition-colors"
                :class="marketStore.autoSyncEnabled ? 'text-emerald-400 font-semibold' : 'text-gray-400 group-hover:text-gray-200'"
              >Auto</span>
            </div>

            <!-- Interval Input Pill (in minutes) -->
            <div
              class="flex items-center rounded border px-2 py-0.5 transition-colors gap-1"
              :class="marketStore.autoSyncEnabled ? 'bg-emerald-950/30 border-emerald-600/50' : 'bg-gray-900 border-gray-700 focus-within:border-gray-500'"
              title="Auto refresh interval in minutes (minimum 1 min)"
            >
              <input
                type="number"
                min="1"
                max="120"
                step="1"
                :disabled="!marketStore.finnhubApiKey && !marketStore.geminiApiKey"
                :value="marketStore.autoSyncIntervalMinutes"
                @change="handleIntervalChange"
                class="w-9 sm:w-10 min-w-[2.25rem] bg-transparent text-xs text-center font-mono font-medium focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed p-0"
                :class="marketStore.autoSyncEnabled ? 'text-emerald-300 font-bold' : 'text-gray-300'"
              />
              <span class="text-[11px] text-gray-400 font-mono select-none">min</span>
            </div>

            <!-- Live Pulse Radar & Countdown Badge -->
            <div
              v-if="marketStore.autoSyncEnabled"
              class="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.25)]"
              :title="marketStore.isSyncing ? 'Syncing stock prices...' : ('Next sync in ' + marketStore.formattedCountdown + ' (interval: ' + marketStore.autoSyncIntervalMinutes + ' min)')"
            >
              <span v-if="marketStore.isSyncing" class="flex items-center gap-1">
                <svg class="w-2.5 h-2.5 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Syncing</span>
              </span>
              <span v-else class="flex items-center gap-1">
                <span class="relative flex h-1.5 w-1.5">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span class="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                </span>
                <span>{{ marketStore.formattedCountdown }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- 4. Tools & Actions Dropdown Menu -->
        <div class="relative">
          <button
            @click="showToolsDropdown = !showToolsDropdown"
            class="px-3 py-2 bg-gray-800 hover:bg-gray-750 text-gray-200 text-xs font-semibold rounded-lg border border-gray-700 hover:border-gray-600 transition flex items-center gap-2 shadow-sm cursor-pointer"
            :class="{ 'border-sky-500/60 bg-gray-750 text-sky-300': showToolsDropdown }"
            title="Actions, file tools, and configurations"
          >
            <svg class="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            <span>Tools</span>
            <span class="text-gray-400 text-[10px] transition-transform duration-200" :class="{ 'rotate-180': showToolsDropdown }">▼</span>
          </button>

          <!-- Transparent Click-Outside Overlay -->
          <div
            v-if="showToolsDropdown"
            @click="showToolsDropdown = false"
            class="fixed inset-0 z-40"
          ></div>

          <!-- Dropdown Menu Panel -->
          <div
            v-if="showToolsDropdown"
            class="absolute right-0 mt-2 w-72 bg-gray-850 rounded-xl border border-gray-750 shadow-2xl z-50 py-2 text-xs divide-y divide-gray-800"
          >
            <!-- Section: Data & Storage -->
            <div class="py-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                Data & Storage
              </div>

              <!-- Import Schwab -->
              <button
                @click="triggerSchwabFileInput(); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 hover:text-white flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-indigo-950/60 border border-indigo-800/50 flex items-center justify-center text-indigo-400 group-hover:text-indigo-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium">Import Schwab</div>
                  <div class="text-[10px] text-gray-400">JSON or XML export file</div>
                </div>
              </button>

              <!-- Import IBKR -->
              <button
                @click="triggerIbkrFileInput(); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 hover:text-white flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-red-950/60 border border-red-800/50 flex items-center justify-center text-red-400 group-hover:text-red-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium">Import IBKR</div>
                  <div class="text-[10px] text-gray-400">Activity Statement HTML report</div>
                </div>
              </button>

              <!-- Ticker Aliases -->
              <button
                @click="emit('open-aliases-modal'); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 hover:text-white flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-amber-950/60 border border-amber-800/50 flex items-center justify-center text-amber-400 group-hover:text-amber-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">Ticker Aliases</span>
                    <span
                      v-if="Object.keys(portfolioStore.tickerAliases).length > 0"
                      class="px-1.5 py-0.5 bg-amber-950 text-amber-300 border border-amber-800/60 rounded-full text-[10px] font-mono"
                    >
                      {{ Object.keys(portfolioStore.tickerAliases).length }}
                    </span>
                  </div>
                  <div class="text-[10px] text-gray-400">Symbol renames (e.g. SPLG)</div>
                </div>
              </button>

              <!-- Storage & Cloud Hub -->
              <button
                @click="emit('open-storage-modal'); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 hover:text-white flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-sky-950/60 border border-sky-800/50 flex items-center justify-center text-sky-400 group-hover:text-sky-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">Storage & Cloud Hub</span>
                    <span
                      v-if="portfolioStore.fileStatus === 'active' || portfolioStore.cloudWebhookUrl"
                      class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]"
                      title="Sync active"
                    ></span>
                  </div>
                  <div class="text-[10px] text-gray-400">Google Drive, OneDrive, Webhooks</div>
                </div>
              </button>

              <!-- Link Local File (if unlinked) -->
              <button
                v-if="portfolioStore.fileStatus === 'unlinked'"
                @click="portfolioStore.linkFile(); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-emerald-300 hover:text-emerald-200 flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-emerald-950/60 border border-emerald-800/50 flex items-center justify-center text-emerald-400 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium">Link Local File</div>
                  <div class="text-[10px] text-gray-400">Direct sync with file on disk</div>
                </div>
              </button>

              <!-- Unlink Local File (if linked) -->
              <button
                v-if="portfolioStore.fileStatus !== 'unlinked'"
                @click="portfolioStore.unlinkFile(); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-300 hover:text-gray-100 flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-gray-400 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium">Unlink Local File</div>
                  <div class="text-[10px] text-gray-400">Disconnect linked disk file</div>
                </div>
              </button>
            </div>

            <!-- Section: Appearance & Theme -->
            <div class="py-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                Appearance & Theme
              </div>
              <div class="px-3 py-2">
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-xs font-medium text-gray-200">Theme Mode</span>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-700 text-emerald-300 border border-gray-600 capitalize">
                    {{ themeStore.themeMode }}
                  </span>
                </div>
                <div class="grid grid-cols-3 gap-1 bg-gray-900/90 p-1 rounded-lg border border-gray-700/80">
                  <button
                    @click="themeStore.setThemeMode('dark')"
                    type="button"
                    class="py-1.5 text-[11px] font-semibold rounded text-center transition-all flex items-center justify-center gap-1 cursor-pointer"
                    :class="themeStore.themeMode === 'dark' ? 'bg-gray-700 text-emerald-400 font-bold shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80'"
                    title="Dark Slate (Default Emerald)"
                  >
                    <span>🌙</span>
                    <span>Dark</span>
                  </button>
                  <button
                    @click="themeStore.setThemeMode('oled')"
                    type="button"
                    class="py-1.5 text-[11px] font-semibold rounded text-center transition-all flex items-center justify-center gap-1 cursor-pointer"
                    :class="themeStore.themeMode === 'oled' ? 'bg-black text-emerald-400 font-bold border border-neutral-700 shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80'"
                    title="OLED Midnight (True pitch black)"
                  >
                    <span>⚡</span>
                    <span>OLED</span>
                  </button>
                  <button
                    @click="themeStore.setThemeMode('light')"
                    type="button"
                    class="py-1.5 text-[11px] font-semibold rounded text-center transition-all flex items-center justify-center gap-1 cursor-pointer"
                    :class="themeStore.themeMode === 'light' ? 'bg-white text-gray-900 font-bold shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80'"
                    title="Clean Light Mode"
                  >
                    <span>☀️</span>
                    <span>Light</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- Section: Configurations -->
            <div class="py-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400 select-none">
                Settings & Keys
              </div>

              <!-- Display Currency Selector -->
              <div class="px-3 py-2">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center text-emerald-400 text-xs font-mono font-bold">
                      {{ currencyStore.currencySymbol }}
                    </div>
                    <div>
                      <div class="text-xs font-medium text-gray-200">Display Currency</div>
                      <div class="text-[10px] text-gray-400">{{ currencyStore.activeCurrencyObj.name }}</div>
                    </div>
                  </div>
                  <button
                    @click="emit('open-currency-modal'); showToolsDropdown = false"
                    type="button"
                    class="px-2 py-0.5 rounded text-[10px] font-medium bg-gray-750 hover:bg-gray-700 text-emerald-300 border border-gray-650 transition cursor-pointer"
                    title="Configure live and custom exchange rates"
                  >
                    FX Settings ⚙
                  </button>
                </div>
                <div class="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    v-for="c in SUPPORTED_CURRENCIES"
                    :key="c.code"
                    @click="currencyStore.selectCurrency(c.code)"
                    type="button"
                    class="px-2 py-1 rounded text-[10.5px] font-mono font-semibold transition shrink-0 flex items-center gap-1 cursor-pointer"
                    :class="currencyStore.selectedCurrency === c.code ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-900 text-gray-300 hover:bg-gray-800 border border-gray-700/80'"
                  >
                    <span>{{ c.flag }}</span>
                    <span>{{ c.code }}</span>
                  </button>
                </div>
                <div v-if="currencyStore.selectedCurrency !== 'USD'" class="text-[9.5px] text-gray-400 mt-1 flex justify-between items-center font-mono">
                  <span>Rate: 1 USD = {{ currencyStore.activeFxRate.toFixed(currencyStore.selectedCurrency === 'JPY' ? 1 : 4) }} {{ currencyStore.selectedCurrency }}</span>
                  <span v-if="currencyStore.customFxRates[currencyStore.selectedCurrency]" class="text-amber-400 font-sans text-[9px]">(custom)</span>
                </div>
              </div>

              <!-- Cost Basis Method Switcher (FIFO, LIFO, HIFO, AVG) -->
              <div class="px-3 py-2">
                <div class="flex items-center justify-between mb-1.5">
                  <div class="flex items-center gap-2">
                    <div class="w-6 h-6 rounded bg-emerald-950/70 border border-emerald-800/60 flex items-center justify-center text-emerald-400 text-xs font-mono font-bold">
                      ∑
                    </div>
                    <div>
                      <div class="text-xs font-medium text-gray-200">Cost Basis Method</div>
                      <div class="text-[10px] text-gray-400">Stock accounting mode</div>
                    </div>
                  </div>
                  <span class="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-gray-700 text-emerald-300 border border-gray-600">
                    {{ portfolioStore.costBasisMethod }}
                  </span>
                </div>
                <div class="grid grid-cols-4 gap-1 bg-gray-900/90 p-1 rounded-lg border border-gray-700/80">
                  <button
                    v-for="m in (['FIFO', 'LIFO', 'HIFO', 'AVG'] as CostBasisMethod[])"
                    :key="m"
                    @click="portfolioStore.setCostBasisMethod(m)"
                    type="button"
                    class="py-1 text-[10px] font-semibold rounded text-center transition-all"
                    :class="portfolioStore.costBasisMethod === m ? 'bg-emerald-600 text-white shadow-sm font-bold' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/80'"
                  >
                    {{ m }}
                  </button>
                </div>
              </div>

              <!-- API & AI Settings -->
              <button
                @click="emit('open-settings-modal'); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-gray-800 text-gray-200 hover:text-white flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-purple-950/60 border border-purple-800/50 flex items-center justify-center text-purple-400 group-hover:text-purple-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">API & AI Settings</span>
                    <div class="flex items-center gap-1">
                      <span v-if="marketStore.geminiApiKey" class="w-1.5 h-1.5 rounded-full bg-indigo-400" title="Gemini Active"></span>
                      <span v-if="marketStore.finnhubApiKey" class="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Finnhub Active"></span>
                    </div>
                  </div>
                  <div class="text-[10px] text-gray-400">Gemini & Finnhub keys</div>
                </div>
              </button>
            </div>

            <!-- Section: Danger Zone -->
            <div class="py-1">
              <div class="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-400/80 select-none">
                Danger Zone
              </div>

              <!-- Clear Ledger -->
              <button
                @click="emit('open-clear-confirm'); showToolsDropdown = false"
                class="w-full text-left px-3 py-2 hover:bg-rose-950/40 text-rose-300 hover:text-rose-200 flex items-center gap-2.5 transition group cursor-pointer"
              >
                <div class="w-7 h-7 rounded-lg bg-rose-950/60 border border-rose-800/50 flex items-center justify-center text-rose-400 group-hover:text-rose-300 flex-shrink-0">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="font-medium">Clear Ledger</div>
                  <div class="text-[10px] text-rose-400/70">Wipe all ledger transactions</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden file inputs for Schwab and IBKR import -->
    <input
      type="file"
      ref="schwabFileInput"
      @change="handleSchwabFileSelect"
      accept=".json,.xml"
      class="hidden"
    />
    <input
      type="file"
      ref="ibkrFileInput"
      @change="handleIbkrFileSelect"
      accept=".html,.htm"
      class="hidden"
    />
  </header>
</template>
