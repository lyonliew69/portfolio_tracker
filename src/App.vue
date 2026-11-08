<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AllocationCard from './components/AllocationCard.vue';
import AnalyticsHub from './components/AnalyticsHub.vue';
import HeaderNav from './components/HeaderNav.vue';
import HoldingsTable from './components/HoldingsTable.vue';
import LedgerTable from './components/LedgerTable.vue';
import AiResearchModal from './components/modals/AiResearchModal.vue';
import AllocationModal from './components/modals/AllocationModal.vue';
import ClearConfirmModal from './components/modals/ClearConfirmModal.vue';
import CurrencyModal from './components/modals/CurrencyModal.vue';
import EditTransactionModal from './components/modals/EditTransactionModal.vue';
import IbkrImportModal from './components/modals/IbkrImportModal.vue';
import OptionsHistoryModal from './components/modals/OptionsHistoryModal.vue';
import SchwabImportModal from './components/modals/SchwabImportModal.vue';
import SettingsModal from './components/modals/SettingsModal.vue';
import StockHistoryModal from './components/modals/StockHistoryModal.vue';
import StorageHubModal from './components/modals/StorageHubModal.vue';
import TickerAliasesModal from './components/modals/TickerAliasesModal.vue';
import OptionsTable from './components/OptionsTable.vue';
import RecordTransactionForm from './components/RecordTransactionForm.vue';
import TopKpis from './components/TopKpis.vue';
import WatchlistStrip from './components/WatchlistStrip.vue';
import { clearNotification, notification } from './services/notification';
import { useCurrencyStore } from './stores/currency';
import { usePortfolioStore } from './stores/portfolio';
import { useThemeStore } from './stores/theme';
import type { Transaction } from './types/portfolio';

const store = usePortfolioStore();
const themeStore = useThemeStore();
const currencyStore = useCurrencyStore();

const showStockHistory = ref(false);
const showOptionsHistory = ref(false);
const showSchwabImport = ref(false);
const showIbkrImport = ref(false);
const schwabFile = ref<File | null>(null);
const ibkrFile = ref<File | null>(null);
const showEditModal = ref(false);
const showAllocationModal = ref(false);
const showAiModal = ref(false);
const showSettingsModal = ref(false);
const showStorageModal = ref(false);
const showAliasesModal = ref(false);
const showCurrencyModal = ref(false);
const showClearConfirm = ref(false);

const editingTx = ref<Transaction | null>(null);

onMounted(async () => {
  themeStore.initTheme();
  await store.initStorage();
  await currencyStore.fetchExchangeRates(false);
});

function scrollToStocks() {
  const el = document.getElementById('stockHoldingsSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function scrollToOptions() {
  const el = document.getElementById('activeOptionsSection');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

function handleEditTransaction(tx: Transaction) {
  editingTx.value = tx;
  showEditModal.value = true;
}

function handleSelectSchwabFile(file: File) {
  schwabFile.value = file;
  showSchwabImport.value = true;
}

function handleSelectIbkrFile(file: File) {
  ibkrFile.value = file;
  showIbkrImport.value = true;
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-gray-100 font-sans p-4 sm:p-6 lg:p-8">
    <div class="max-w-7xl mx-auto">
      <!-- Header with Navigation and Tools -->
      <HeaderNav
        @open-ai-modal="showAiModal = true"
        @open-storage-modal="showStorageModal = true"
        @open-schwab-import="schwabFile = null; showSchwabImport = true"
        @select-schwab-file="handleSelectSchwabFile"
        @open-ibkr-import="ibkrFile = null; showIbkrImport = true"
        @select-ibkr-file="handleSelectIbkrFile"
        @open-aliases-modal="showAliasesModal = true"
        @open-currency-modal="showCurrencyModal = true"
        @open-settings-modal="showSettingsModal = true"
        @open-clear-confirm="showClearConfirm = true"
      />

      <!-- Top KPI Mini Cards (6 cards across) -->
      <TopKpis
        @scroll-to-stocks="scrollToStocks"
        @scroll-to-options="scrollToOptions"
        @open-stock-history="showStockHistory = true"
        @open-options-history="showOptionsHistory = true"
      />

      <!-- Performance Analytics Hub (Full Width across the screen) -->
      <AnalyticsHub />

      <!-- Main Responsive 1/3 vs 2/3 Grid Layout -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <!-- Left Side: Add Transaction Form, Allocation & Watchlist -->
        <div class="lg:col-span-1 space-y-6">
          <!-- Record Transaction Form & Option Roll Engine -->
          <div id="recordTransactionSection">
            <RecordTransactionForm />
          </div>

          <!-- Portfolio Allocation Chart Card -->
          <AllocationCard @open-enlarge-modal="showAllocationModal = true" />

          <!-- Stock Price Manual Updates -->
          <WatchlistStrip />
        </div>

        <!-- Right Side: Stock Holdings, Active Options & Transaction Ledger -->
        <div class="lg:col-span-2 space-y-6">
          <!-- Current Stock Holdings Table -->
          <HoldingsTable />

          <!-- Active Options & Spreads Table -->
          <OptionsTable />

          <!-- Full Transaction Ledger Table -->
          <LedgerTable @edit-transaction="handleEditTransaction" />
        </div>
      </div>

      <!-- Modals -->
      <StockHistoryModal
        :show="showStockHistory"
        @close="showStockHistory = false"
      />
      <OptionsHistoryModal
        :show="showOptionsHistory"
        @close="showOptionsHistory = false"
      />
      <SchwabImportModal
        :show="showSchwabImport"
        :initial-file="schwabFile"
        @close="showSchwabImport = false; schwabFile = null"
        @open-aliases="showSchwabImport = false; showAliasesModal = true"
      />
      <IbkrImportModal
        :show="showIbkrImport"
        :initial-file="ibkrFile"
        @close="showIbkrImport = false; ibkrFile = null"
        @open-aliases="showIbkrImport = false; showAliasesModal = true"
      />
      <EditTransactionModal
        :show="showEditModal"
        :transaction="editingTx"
        @close="showEditModal = false; editingTx = null"
      />
      <AllocationModal
        :show="showAllocationModal"
        @close="showAllocationModal = false"
      />
      <AiResearchModal
        :show="showAiModal"
        @close="showAiModal = false"
        @open-settings="showAiModal = false; showSettingsModal = true"
      />
      <SettingsModal
        :show="showSettingsModal"
        @close="showSettingsModal = false"
      />
      <StorageHubModal
        :show="showStorageModal"
        @close="showStorageModal = false"
      />
      <TickerAliasesModal
        :show="showAliasesModal"
        @close="showAliasesModal = false"
      />
      <CurrencyModal
        :show="showCurrencyModal"
        @close="showCurrencyModal = false"
      />
      <ClearConfirmModal
        :show="showClearConfirm"
        @close="showClearConfirm = false"
      />

      <!-- Floating Notification Toast -->
      <div
        v-if="notification.message"
        :class="notification.type === 'error' ? 'bg-rose-950/95 border-rose-700 text-rose-200 shadow-rose-950/50' : (notification.type === 'warning' ? 'bg-amber-950/95 border-amber-700 text-amber-200 shadow-amber-950/50' : (notification.type === 'info' ? 'bg-sky-950/95 border-sky-700 text-sky-200 shadow-sky-950/50' : 'bg-emerald-950/95 border-emerald-700 text-emerald-200 shadow-emerald-950/50'))"
        class="fixed bottom-6 right-6 z-[9999] max-w-md p-3.5 rounded-xl border text-xs sm:text-sm shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 transition-all"
      >
        <div class="flex items-center gap-2">
          <span>{{ notification.message }}</span>
        </div>
        <button
          @click="clearNotification"
          class="text-xs font-bold text-gray-400 hover:text-white p-1 cursor-pointer"
        >
          ✕
        </button>
      </div>
    </div>
  </div>
</template>
