<script setup lang="ts">
import { ref, watch } from 'vue';
import { showNotification } from '../../services/notification';
import { useMarketStore } from '../../stores/market';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const marketStore = useMarketStore();

const geminiApiKey = ref(marketStore.geminiApiKey);
const apiKey = ref(marketStore.finnhubApiKey);
const priceProvider = ref<'finnhub' | 'gemini' | 'auto'>(marketStore.priceProvider);

const isTestingGemini = ref(false);
const isTestingFinnhub = ref(false);

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      geminiApiKey.value = marketStore.geminiApiKey;
      apiKey.value = marketStore.finnhubApiKey;
      priceProvider.value = marketStore.priceProvider;
    }
  }
);

function saveGeminiApiKey() {
  marketStore.setGeminiKey(geminiApiKey.value);
}

function saveApiKey() {
  marketStore.setFinnhubKey(apiKey.value);
}

function savePriceProvider() {
  marketStore.setPriceProvider(priceProvider.value);
}

async function testGeminiKey() {
  if (!geminiApiKey.value || !geminiApiKey.value.trim()) {
    showNotification('Please enter a Gemini API Key first.', 'error');
    return;
  }
  isTestingGemini.value = true;
  try {
    const key = geminiApiKey.value.trim();
    const candidateModels = ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-flash-latest', 'gemini-3.7-flash'];
    let success = false;
    let lastError = '';

    for (const model of candidateModels) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: 'Test connection. Respond with JSON: {"status": "ok"}' }] }] })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text && text.includes('ok')) {
            saveGeminiApiKey();
            showNotification('Google Gemini API Key is valid and working!', 'success');
            success = true;
            break;
          }
        } else {
          lastError = data?.error?.message || `HTTP ${res.status}`;
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!success) {
      showNotification(`Gemini test failed: ${lastError || 'Invalid response'}`, 'error');
    }
  } catch (e: any) {
    showNotification(`Gemini test failed: ${e.message}`, 'error');
  } finally {
    isTestingGemini.value = false;
  }
}

async function testFinnhubKey() {
  if (!apiKey.value || !apiKey.value.trim()) {
    showNotification('Please enter a Finnhub API Key first.', 'error');
    return;
  }
  isTestingFinnhub.value = true;
  try {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=AAPL&token=${apiKey.value.trim()}`);
    if (res.status === 401 || res.status === 403) {
      showNotification('Invalid Finnhub API key.', 'error');
    } else if (res.ok) {
      const d = await res.json();
      if (d && typeof d.c === 'number') {
        saveApiKey();
        showNotification(`Finnhub connected! (AAPL: $${d.c})`, 'success');
      } else {
        showNotification('Connected to Finnhub, but no quote data returned.', 'info');
      }
    } else {
      showNotification(`Finnhub returned HTTP status ${res.status}`, 'error');
    }
  } catch (e: any) {
    showNotification(`Finnhub test failed: ${e.message}`, 'error');
  } finally {
    isTestingFinnhub.value = false;
  }
}

function handleDone() {
  saveGeminiApiKey();
  saveApiKey();
  savePriceProvider();
  emit('close');
}
</script>

<template>
  <!-- API & AI Configuration Modal -->
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
  >
    <div class="bg-gray-800 border border-gray-700 rounded-xl p-6 max-w-lg w-full shadow-2xl space-y-5 my-8">
      <!-- Header -->
      <div class="flex justify-between items-start border-b border-gray-700 pb-3">
        <div>
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <span class="p-1.5 bg-indigo-600/30 border border-indigo-500/50 rounded-lg text-indigo-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </span>
            API & AI Configuration
          </h3>
          <p class="text-xs text-gray-400 mt-0.5">
            Configure Google Gemini AI and Finnhub providers for real-time quotes and historical pricing.
          </p>
        </div>
        <button @click="emit('close')" class="text-gray-400 hover:text-white text-lg font-bold cursor-pointer">✕</button>
      </div>

      <!-- Google Gemini Section -->
      <div class="bg-gray-900/60 border border-indigo-500/30 rounded-lg p-4 space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full"
              :class="geminiApiKey ? 'bg-indigo-400 animate-pulse' : 'bg-gray-600'"
            ></span>
            <span class="text-sm font-semibold text-white">Google Gemini AI</span>
            <span
              class="text-[10px] px-2 py-0.5 rounded bg-indigo-950/60 border border-indigo-800 text-indigo-300"
            >
              Fast Batch & Historical
            </span>
          </div>
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[11px] text-indigo-400 hover:text-indigo-300 underline flex items-center gap-1"
          >
            Get Free Key ↗
          </a>
        </div>
        <p class="text-xs text-gray-400">
          Enables single-call batch quote syncing (all stocks in 1–2 seconds) and intelligent historical transfer cost basis resolution.
        </p>
        <div class="flex gap-2">
          <input
            type="password"
            v-model="geminiApiKey"
            @change="saveGeminiApiKey"
            placeholder="Enter Gemini API Key (AIzaSy...)"
            class="flex-1 bg-gray-800 border border-gray-600 focus:border-indigo-500 rounded p-2 text-xs text-white focus:outline-none font-mono"
          />
          <button
            type="button"
            @click="testGeminiKey"
            :disabled="isTestingGemini || !geminiApiKey"
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded text-xs font-semibold transition whitespace-nowrap cursor-pointer"
          >
            {{ isTestingGemini ? 'Testing...' : 'Test Key' }}
          </button>
        </div>
      </div>

      <!-- Finnhub Section -->
      <div class="bg-gray-900/60 border border-gray-700/70 rounded-lg p-4 space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span
              class="w-2.5 h-2.5 rounded-full"
              :class="apiKey ? 'bg-emerald-400' : 'bg-gray-600'"
            ></span>
            <span class="text-sm font-semibold text-white">Finnhub Stock API</span>
            <span
              class="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-800 text-emerald-300"
            >
              Market Quotes
            </span>
          </div>
          <a
            href="https://finnhub.io/"
            target="_blank"
            rel="noopener noreferrer"
            class="text-[11px] text-emerald-400 hover:text-emerald-300 underline flex items-center gap-1"
          >
            Get Free Key ↗
          </a>
        </div>
        <p class="text-xs text-gray-400">
          Provides official real-time US exchange quotes. Free tier permits 60 calls/minute.
        </p>
        <div class="flex gap-2">
          <input
            type="password"
            v-model="apiKey"
            @change="saveApiKey"
            placeholder="Enter Finnhub API Key"
            class="flex-1 bg-gray-800 border border-gray-600 focus:border-emerald-500 rounded p-2 text-xs text-white focus:outline-none font-mono"
          />
          <button
            type="button"
            @click="testFinnhubKey"
            :disabled="isTestingFinnhub || !apiKey"
            class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:opacity-50 text-white rounded text-xs font-semibold transition whitespace-nowrap cursor-pointer"
          >
            {{ isTestingFinnhub ? 'Testing...' : 'Test Key' }}
          </button>
        </div>
      </div>

      <!-- Provider Selector -->
      <div class="space-y-2">
        <label class="block text-xs font-semibold text-gray-300 uppercase">
          Live Quote Provider Preference
        </label>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <label
            :class="priceProvider === 'finnhub' ? 'border-emerald-500 bg-emerald-950/40 ring-1 ring-emerald-500' : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'"
            class="p-2.5 border rounded-lg cursor-pointer flex items-center gap-2 text-xs text-gray-200 transition"
          >
            <input
              type="radio"
              v-model="priceProvider"
              value="finnhub"
              @change="savePriceProvider"
              class="text-emerald-600"
            />
            <div>
              <strong class="block text-white">Finnhub (Default)</strong>
              <span class="text-[10px] text-emerald-400">100% Accurate Live Quotes</span>
            </div>
          </label>
          <label
            :class="priceProvider === 'auto' ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500' : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'"
            class="p-2.5 border rounded-lg cursor-pointer flex items-center gap-2 text-xs text-gray-200 transition"
          >
            <input
              type="radio"
              v-model="priceProvider"
              value="auto"
              @change="savePriceProvider"
              class="text-indigo-600"
            />
            <div>
              <strong class="block text-white">Auto (Hybrid)</strong>
              <span class="text-[10px] text-gray-400">Finnhub + Gemini History</span>
            </div>
          </label>
          <label
            :class="priceProvider === 'gemini' ? 'border-indigo-500 bg-indigo-950/30 ring-1 ring-indigo-500' : 'border-gray-700 bg-gray-800/60 hover:border-gray-600'"
            class="p-2.5 border rounded-lg cursor-pointer flex items-center gap-2 text-xs text-gray-200 transition"
          >
            <input
              type="radio"
              v-model="priceProvider"
              value="gemini"
              @change="savePriceProvider"
              class="text-indigo-600"
            />
            <div>
              <strong class="block text-white">Gemini AI</strong>
              <span class="text-[10px] text-gray-400">Experimental Batch</span>
            </div>
          </label>
        </div>
      </div>

      <!-- Action Button -->
      <div class="flex justify-end gap-2 pt-3 border-t border-gray-700">
        <button
          type="button"
          @click="handleDone"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  </div>
</template>
