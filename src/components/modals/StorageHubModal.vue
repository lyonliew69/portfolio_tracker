<script setup lang="ts">
import { ref } from 'vue';
import { showNotification } from '../../services/notification';
import { usePortfolioStore } from '../../stores/portfolio';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const store = usePortfolioStore();

const showAdvancedCloud = ref(false);
const jsonFileInput = ref<HTMLInputElement | null>(null);

const tempWebhookUrl = ref(store.cloudWebhookUrl);
const tempAutoSync = ref(store.cloudAutoSync);
const tempAutoPull = ref(store.cloudAutoPullOnLoad);

function triggerJsonFileInput() {
  if (jsonFileInput.value) jsonFileInput.value.click();
}

function handleFileRestore(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const content = e.target?.result as string;
    if (content) {
      await store.restoreBackup(content, file.name);
    }
  };
  reader.readAsText(file);
  target.value = '';
}

function handleSaveCloudSettings() {
  store.saveCloudWebhookSettings(tempWebhookUrl.value, tempAutoSync.value, tempAutoPull.value);
}

function copyAppsScriptCode() {
  const scriptCode = `// Google Apps Script for Portfolio Tracker Cloud Sync
function doGet(e) {
  var files = DriveApp.getFilesByName('portfolio.json');
  if (files.hasNext()) {
    var content = files.next().getBlob().getDataAsString();
    return ContentService.createTextOutput(content).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput('[]').setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var data = e.postData.contents;
  var files = DriveApp.getFilesByName('portfolio.json');
  if (files.hasNext()) {
    files.next().setContent(data);
  } else {
    DriveApp.createFile('portfolio.json', data, MimeType.PLAIN_TEXT);
  }
  return ContentService.createTextOutput(JSON.stringify({status: 'ok'})).setMimeType(ContentService.MimeType.JSON);
}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(scriptCode).then(() => {
      showNotification('Google Apps Script code copied to clipboard!', 'success');
    }).catch(() => {
      showNotification('Failed to copy script to clipboard.', 'error');
    });
  } else {
    showNotification('Clipboard not supported in this browser.', 'error');
  }
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
  >
    <div class="bg-gray-900 border border-gray-700/90 rounded-2xl p-5 sm:p-6 max-w-2xl w-full shadow-2xl space-y-4 my-auto max-h-[92vh] flex flex-col">
      <!-- Modal Header -->
      <div class="flex justify-between items-start border-b border-gray-800 pb-3.5">
        <div class="flex items-center gap-3">
          <span class="p-2.5 bg-sky-950/70 border border-sky-800/80 rounded-xl text-sky-400">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
            </svg>
          </span>
          <div>
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              Storage & Cloud Hub
            </h3>
            <p class="text-xs text-gray-400 mt-0.5">
              Manage database storage, Google Drive / OneDrive sync, and backups.
            </p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="text-gray-400 hover:text-white text-lg font-bold p-1 rounded-lg hover:bg-gray-800 transition"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (scrollable) -->
      <div class="space-y-4 overflow-y-auto pr-1">
        <!-- Current Storage Status Banner -->
        <div
          class="p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          :class="store.fileStatus === 'active' ? 'bg-emerald-950/30 border-emerald-800/60' : (store.cloudWebhookUrl ? 'bg-sky-950/30 border-sky-800/60' : 'bg-gray-800/70 border-gray-700')"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              :class="store.fileStatus === 'active' ? 'bg-emerald-900/60 text-emerald-400' : (store.cloudWebhookUrl ? 'bg-sky-900/60 text-sky-400' : 'bg-blue-900/50 text-blue-400')"
            >
              <svg v-if="store.fileStatus === 'active'" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <svg v-else-if="store.cloudWebhookUrl" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 00-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
            <div>
              <div class="text-[11px] text-gray-400 uppercase tracking-wider font-semibold">Active Storage Target</div>
              <div class="text-sm font-semibold text-white flex flex-wrap items-center gap-2 mt-0.5">
                <span v-if="store.fileStatus === 'active'" class="text-emerald-400 font-mono">Linked: {{ store.fileName }}</span>
                <span v-else-if="store.fileStatus === 'locked'" class="text-amber-400">Locked File: {{ store.fileName }}</span>
                <span v-else-if="store.cloudWebhookUrl" class="text-sky-400">Cloud Webhook Connected</span>
                <span v-else class="text-blue-400">Browser Local Memory</span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300 font-mono font-medium">
                  {{ store.transactions.length }} transactions
                </span>
              </div>
              <div v-if="store.lastCloudSyncTime" class="text-[11px] text-gray-400 mt-1">
                Last Cloud Sync: <span class="text-gray-300 font-mono">{{ store.lastCloudSyncTime }}</span>
              </div>
            </div>
          </div>

          <!-- Quick actions for linked file -->
          <div class="flex items-center gap-2 self-end sm:self-center">
            <button
              v-if="store.fileStatus === 'locked'"
              @click="store.authorizeFile"
              class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-semibold transition animate-pulse"
            >
              Authorize File
            </button>
            <button
              v-if="store.fileStatus === 'active'"
              @click="store.loadFromFile"
              class="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-xs transition"
              title="Re-read the file from disk"
            >
              Reload File
            </button>
            <button
              v-if="store.fileStatus !== 'unlinked'"
              @click="store.unlinkFile"
              class="px-2.5 py-1.5 bg-red-950/60 border border-red-800/80 hover:bg-red-900 text-red-300 rounded text-xs transition"
            >
              Unlink File
            </button>
          </div>
        </div>

        <!-- Option 1: Desktop Cloud Sync (Google Drive / OneDrive) -->
        <div class="bg-gray-800/80 border border-emerald-700/60 rounded-xl p-4 sm:p-5 space-y-3.5 relative overflow-hidden">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span class="text-base font-bold text-white">1. Easy Cloud Sync (Google Drive / OneDrive)</span>
            <span class="px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-700 text-emerald-300 text-[11px] font-semibold flex items-center gap-1 w-fit">
              ⭐ Recommended (Zero Setup)
            </span>
          </div>

          <p class="text-xs text-gray-300 leading-relaxed">
            If you have <strong class="text-emerald-300">Google Drive for Desktop</strong> or <strong class="text-sky-300">Microsoft OneDrive</strong> installed on your PC, your cloud folders are already synced in Windows!
          </p>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5 py-1 text-xs">
            <div class="bg-gray-900/70 p-3 rounded-lg border border-gray-700/60 space-y-1">
              <div class="font-semibold text-emerald-400 flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-emerald-950 border border-emerald-700 flex items-center justify-center text-[10px]">1</span>
                Link Synced File
              </div>
              <p class="text-[11px] text-gray-400">Click below to pick or create your <code class="text-gray-200 font-mono">portfolio.json</code>.</p>
            </div>
            <div class="bg-gray-900/70 p-3 rounded-lg border border-gray-700/60 space-y-1">
              <div class="font-semibold text-sky-400 flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-sky-950 border border-sky-700 flex items-center justify-center text-[10px]">2</span>
                Choose Cloud Folder
              </div>
              <p class="text-[11px] text-gray-400">Select inside your <span class="text-emerald-300 font-medium">Google Drive</span> or <span class="text-sky-300 font-medium">OneDrive</span> folder.</p>
            </div>
            <div class="bg-gray-900/70 p-3 rounded-lg border border-gray-700/60 space-y-1">
              <div class="font-semibold text-amber-400 flex items-center gap-1.5">
                <span class="w-5 h-5 rounded-full bg-amber-950 border border-amber-700 flex items-center justify-center text-[10px]">3</span>
                Automatic Cloud Sync
              </div>
              <p class="text-[11px] text-gray-400">Every stock or option trade saved is automatically synced to the cloud!</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-1">
            <button
              v-if="store.fileStatus === 'unlinked'"
              @click="store.linkFile"
              class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-950/50"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              Link File in Google Drive / OneDrive
            </button>
            <span v-else class="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400"></span> Currently linked to {{ store.fileName }}
            </span>
          </div>
        </div>

        <!-- Option 2: 1-Click Backup & Restore -->
        <div class="bg-gray-800/80 border border-gray-700/70 rounded-xl p-4 sm:p-5 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-base font-bold text-white">2. Offline Backup & Restore</span>
            <span class="text-[11px] text-gray-400">Save a copy anytime</span>
          </div>
          <p class="text-xs text-gray-400">
            Download a full JSON snapshot of your ledger or restore your transactions from any previous backup file.
          </p>
          <div class="flex flex-wrap gap-2.5 pt-1">
            <button
              @click="store.downloadBackup"
              class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5 shadow-sm"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download JSON Backup
            </button>
            <button
              @click="triggerJsonFileInput"
              class="px-3.5 py-2 bg-gray-700 hover:bg-gray-650 text-gray-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Restore from Backup File
            </button>
            <input
              type="file"
              ref="jsonFileInput"
              @change="handleFileRestore"
              accept=".json"
              class="hidden"
            />
          </div>
        </div>

        <!-- Option 3: Advanced Cloud Webhook -->
        <div class="bg-gray-800/50 border border-gray-700/60 rounded-xl p-4 transition">
          <button
            type="button"
            @click="showAdvancedCloud = !showAdvancedCloud"
            class="w-full flex items-center justify-between text-left focus:outline-none"
          >
            <div class="flex items-center gap-2">
              <span class="p-1 rounded bg-gray-700/70 text-gray-300">
                <svg
                  class="w-4 h-4 transition-transform duration-200"
                  :class="showAdvancedCloud ? 'rotate-90' : ''"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                </svg>
              </span>
              <div>
                <span class="text-sm font-semibold text-gray-200">
                  3. Advanced: Direct Web Cloud Sync (Google Apps Script Webhook)
                </span>
                <p class="text-[11px] text-gray-400">
                  For syncing across devices without desktop sync clients.
                </p>
              </div>
            </div>
            <span
              class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded"
              :class="store.cloudWebhookUrl ? 'bg-sky-950 text-sky-400 border border-sky-800' : 'bg-gray-700 text-gray-400'"
            >
              {{ store.cloudWebhookUrl ? 'Configured' : 'Optional' }}
            </span>
          </button>

          <div v-if="showAdvancedCloud" class="mt-4 pt-4 border-t border-gray-700/60 space-y-3.5">
            <p class="text-xs text-gray-300 leading-relaxed">
              Deploy a private Google Apps Script on your Google account. It provides a webhook URL that reads and writes your <code class="font-mono text-sky-300">portfolio.json</code> directly inside your Google Drive from any browser.
            </p>

            <div class="space-y-1.5">
              <label class="block text-xs font-semibold text-gray-300">Google Apps Script Webhook URL</label>
              <div class="flex gap-2">
                <input
                  type="url"
                  v-model="tempWebhookUrl"
                  placeholder="https://script.google.com/macros/s/.../exec"
                  class="flex-1 bg-gray-900 border border-gray-700 focus:border-sky-500 rounded p-2 text-xs text-white focus:outline-none font-mono"
                />
                <button
                  type="button"
                  @click="handleSaveCloudSettings"
                  class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-xs font-semibold transition"
                >
                  Save
                </button>
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoPullCheckbox"
                  v-model="tempAutoPull"
                  @change="handleSaveCloudSettings"
                  class="rounded bg-gray-900 border-gray-700 text-sky-600 focus:ring-0"
                />
                <label for="autoPullCheckbox" class="text-xs text-gray-300 cursor-pointer font-medium">
                  Automatically pull latest transactions from cloud on page load or refresh
                </label>
              </div>
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoSyncCheckbox"
                  v-model="tempAutoSync"
                  @change="handleSaveCloudSettings"
                  class="rounded bg-gray-900 border-gray-700 text-sky-600 focus:ring-0"
                />
                <label for="autoSyncCheckbox" class="text-xs text-gray-300 cursor-pointer">
                  Automatically upload to cloud whenever I add, edit, or delete transactions
                </label>
              </div>
            </div>

            <div class="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                @click="store.syncToCloudWebhook(false)"
                :disabled="store.isSyncingCloud || !store.cloudWebhookUrl"
                class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-gray-700 text-white rounded text-xs font-semibold transition flex items-center gap-1.5"
              >
                <svg v-if="store.isSyncingCloud" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {{ store.isSyncingCloud ? 'Syncing...' : 'Upload Now to Cloud' }}
              </button>
              <button
                type="button"
                @click="store.pullFromCloudWebhook(false)"
                :disabled="store.isSyncingCloud || !store.cloudWebhookUrl"
                class="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-gray-200 rounded text-xs font-semibold transition flex items-center gap-1.5"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Pull / Load from Cloud
              </button>
              <button
                type="button"
                @click="copyAppsScriptCode"
                class="px-3 py-1.5 bg-gray-900 border border-gray-700 hover:border-gray-600 text-gray-300 rounded text-xs font-semibold transition flex items-center gap-1.5"
              >
                📋 Copy Google Apps Script Code
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Footer -->
      <div class="flex justify-between items-center pt-3 border-t border-gray-800">
        <span class="text-[11px] text-gray-500">All data stored safely in your personal accounts.</span>
        <button
          type="button"
          @click="emit('close')"
          class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
