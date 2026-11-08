import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { fetchGeminiBatchPrices } from '../services/geminiAi';
import { syncFinnhubWatchlist } from '../services/marketData';
import { showNotification } from '../services/notification';

function getLocalItem(key: string): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        // ignore
    }
    return null;
}

function setLocalItem(key: string, value: string): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
        }
    } catch {
        // ignore
    }
}

export const useMarketStore = defineStore('market', () => {
    // API Keys & Provider Settings
    const finnhubApiKey = ref<string>(getLocalItem('finnhub_api_key') || getLocalItem('api_key') || '');
    const geminiApiKey = ref<string>(getLocalItem('gemini_api_key') || '');
    const priceProvider = ref<'finnhub' | 'gemini' | 'auto'>(
        (getLocalItem('price_provider') as any) || 'finnhub'
    );

    // Sync state
    const isSyncing = ref<boolean>(false);
    const autoSyncEnabled = ref<boolean>(false);
    const autoSyncIntervalMinutes = ref<number>(
        parseInt(getLocalItem('tx_auto_sync_interval_minutes') || '1', 10) || 1
    );
    const autoSyncCountdown = ref<number>(autoSyncIntervalMinutes.value * 60);
    const lastSyncTime = ref<string>(getLocalItem('tx_last_sync_time') || '');

    let countdownTimer: any = null;

    const formattedCountdown = computed(() => {
        if (autoSyncCountdown.value >= 60) {
            const m = Math.floor(autoSyncCountdown.value / 60);
            const s = autoSyncCountdown.value % 60;
            return s > 0 ? `${m}m ${s}s` : `${m}m`;
        }
        return `${autoSyncCountdown.value}s`;
    });

    // Watchlist & Hidden Tickers
    const hiddenTickers = ref<string[]>([]);
    try {
        const raw = getLocalItem('hiddenTickers');
        if (raw) hiddenTickers.value = JSON.parse(raw);
    } catch {
        // ignore
    }

    const manualWatchlistTickers = ref<string[]>([]);
    try {
        const raw = getLocalItem('manualWatchlistTickers');
        if (raw) manualWatchlistTickers.value = JSON.parse(raw);
    } catch {
        // ignore
    }

    function setFinnhubKey(key: string) {
        finnhubApiKey.value = key.trim();
        setLocalItem('finnhub_api_key', key.trim());
        setLocalItem('api_key', key.trim());
    }

    function setGeminiKey(key: string) {
        geminiApiKey.value = key.trim();
        setLocalItem('gemini_api_key', key.trim());
    }

    function setPriceProvider(provider: 'finnhub' | 'gemini' | 'auto') {
        priceProvider.value = provider;
        setLocalItem('price_provider', provider);
    }

    function setIntervalMinutes(mins: number) {
        const valid = Math.max(1, Math.min(120, mins));
        autoSyncIntervalMinutes.value = valid;
        setLocalItem('tx_auto_sync_interval_minutes', String(valid));
        autoSyncCountdown.value = valid * 60;
    }

    function hideTicker(ticker: string) {
        const t = ticker.toUpperCase().trim();
        if (manualWatchlistTickers.value.includes(t)) {
            manualWatchlistTickers.value = manualWatchlistTickers.value.filter(item => item !== t);
            setLocalItem('manualWatchlistTickers', JSON.stringify(manualWatchlistTickers.value));
        }
        if (!hiddenTickers.value.includes(t)) {
            hiddenTickers.value.push(t);
            setLocalItem('hiddenTickers', JSON.stringify(hiddenTickers.value));
        }
    }

    function unhideTicker(ticker: string) {
        const t = ticker.toUpperCase().trim();
        hiddenTickers.value = hiddenTickers.value.filter(item => item !== t);
        setLocalItem('hiddenTickers', JSON.stringify(hiddenTickers.value));
    }

    function addWatchlistTicker(ticker: string) {
        const t = ticker.toUpperCase().trim();
        if (!t) return;
        unhideTicker(t);
        if (!manualWatchlistTickers.value.includes(t)) {
            manualWatchlistTickers.value.push(t);
            setLocalItem('manualWatchlistTickers', JSON.stringify(manualWatchlistTickers.value));
        }
    }

    async function syncPrices(
        symbols: string[],
        onPrice: (symbol: string, price: number) => void,
        isAuto = false
    ) {
        if (symbols.length === 0) {
            if (!isAuto) {
                showNotification('No active stock tickers in portfolio to sync.', 'info');
            }
            return;
        }

        if (isSyncing.value) return;

        const useFinnhub = (priceProvider.value === 'finnhub') ||
            (priceProvider.value === 'auto') ||
            (finnhubApiKey.value && !geminiApiKey.value);

        if (useFinnhub) {
            if (!finnhubApiKey.value || !finnhubApiKey.value.trim()) {
                if (!isAuto) {
                    showNotification('Finnhub API key is required for accurate real-time market prices. Please enter your free key.', 'info');
                }
                return;
            }

            isSyncing.value = true;
            try {
                // Check market status
                let isMarketOpen = true;
                try {
                    const statusRes = await fetch(`https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${finnhubApiKey.value.trim()}`);
                    if (statusRes.status === 429) {
                        showNotification('Finnhub API rate limit exceeded. Please wait a minute and try again.', 'error');
                        return;
                    }
                    const statusData = await statusRes.json();
                    if (statusData && typeof statusData.isOpen !== 'undefined') {
                        isMarketOpen = statusData.isOpen;
                    }
                } catch (err) {
                    console.error('Failed to fetch market status:', err);
                }

                if (!isAuto) {
                    if (!isMarketOpen) {
                        showNotification('US Market is currently closed. Showing last closing prices.', 'error');
                    } else {
                        showNotification('Fetching live stock prices via Finnhub...', 'success');
                    }
                }

                let errors = 0;
                let rateLimited = false;

                for (let i = 0; i < symbols.length; i++) {
                    const symbol = symbols[i];
                    try {
                        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${finnhubApiKey.value.trim()}`);
                        if (response.status === 429) {
                            rateLimited = true;
                            break;
                        }
                        const data = await response.json();
                        if (data && typeof data.c === 'number' && data.c > 0) {
                            onPrice(symbol, data.c);
                        } else {
                            errors++;
                        }
                        if (i < symbols.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (err) {
                        console.error(`Failed to fetch ${symbol}:`, err);
                        errors++;
                    }
                }

                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                lastSyncTime.value = timeStr;
                setLocalItem('tx_last_sync_time', timeStr);

                if (rateLimited) {
                    showNotification('Finnhub rate limit reached. Partial prices synced.', 'error');
                } else if (errors > 0) {
                    if (!isAuto) {
                        showNotification(`Sync complete, but failed to fetch ${errors} stock(s).`, 'error');
                    }
                } else if (!isAuto && isMarketOpen) {
                    showNotification('Live stock prices updated via Finnhub.', 'success');
                }
            } finally {
                isSyncing.value = false;
            }
            return;
        }

        if (priceProvider.value === 'gemini') {
            if (!geminiApiKey.value || !geminiApiKey.value.trim()) {
                if (!isAuto) {
                    showNotification('Please enter your Gemini API Key in settings.', 'info');
                }
                return;
            }

            isSyncing.value = true;
            try {
                if (!isAuto) {
                    showNotification('Fetching stock prices via Google Gemini AI...', 'success');
                }
                const quotes = await fetchGeminiBatchPrices(symbols, geminiApiKey.value);
                let updated = 0;
                for (const sym of symbols) {
                    if (quotes[sym] !== undefined && quotes[sym] > 0) {
                        onPrice(sym, quotes[sym]);
                        updated++;
                    }
                }
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                lastSyncTime.value = timeStr;
                setLocalItem('tx_last_sync_time', timeStr);

                if (!isAuto) {
                    if (updated > 0) {
                        showNotification(`Updated ${updated} stock price(s) via Google Gemini AI.`, 'success');
                    } else {
                        showNotification('Could not retrieve new prices from Gemini. Check API connection.', 'error');
                    }
                }
            } catch (err: any) {
                showNotification(`Gemini sync error: ${err.message}`, 'error');
            } finally {
                isSyncing.value = false;
            }
        }
    }

    function startAutoSync(
        symbolsGetter: () => string[],
        onPrice: (symbol: string, price: number) => void
    ) {
        autoSyncEnabled.value = true;
        autoSyncCountdown.value = autoSyncIntervalMinutes.value * 60;

        if (countdownTimer) clearInterval(countdownTimer);

        countdownTimer = setInterval(async () => {
            if (!autoSyncEnabled.value) {
                clearInterval(countdownTimer);
                return;
            }

            if (!isSyncing.value) {
                if (autoSyncCountdown.value <= 1) {
                    autoSyncCountdown.value = autoSyncIntervalMinutes.value * 60;
                    await syncPrices(symbolsGetter(), onPrice, true);
                } else {
                    autoSyncCountdown.value--;
                }
            }
        }, 1000);
    }

    function stopAutoSync() {
        autoSyncEnabled.value = false;
        if (countdownTimer) {
            clearInterval(countdownTimer);
            countdownTimer = null;
        }
    }

    function toggleAutoSync(
        symbolsGetter: () => string[],
        onPrice: (symbol: string, price: number) => void
    ) {
        if (autoSyncEnabled.value) {
            stopAutoSync();
        } else {
            startAutoSync(symbolsGetter, onPrice);
        }
    }

    return {
        // State
        finnhubApiKey,
        geminiApiKey,
        priceProvider,
        isSyncing,
        autoSyncEnabled,
        autoSyncIntervalMinutes,
        autoSyncCountdown,
        formattedCountdown,
        lastSyncTime,
        hiddenTickers,
        manualWatchlistTickers,

        // Actions
        setFinnhubKey,
        setGeminiKey,
        setPriceProvider,
        setIntervalMinutes,
        hideTicker,
        unhideTicker,
        addWatchlistTicker,
        syncPrices,
        startAutoSync,
        stopAutoSync,
        toggleAutoSync
    };
});
