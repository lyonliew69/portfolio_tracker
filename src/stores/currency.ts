import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    DEFAULT_EXCHANGE_RATES,
    SUPPORTED_CURRENCIES,
    type Currency
} from '../services/fx';
import { showNotification } from '../services/notification';

function getLocal(key: string): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        // ignore
    }
    return null;
}

function setLocal(key: string, val: string): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, val);
        }
    } catch {
        // ignore
    }
}

export const useCurrencyStore = defineStore('currency', () => {
    const selectedCurrency = ref<string>(getLocal('selected_currency') || 'USD');
    const isFetchingFx = ref<boolean>(false);
    const fxLastUpdated = ref<string>(getLocal('fx_last_updated_time') || '');

    const exchangeRates = ref<Record<string, number>>({ ...DEFAULT_EXCHANGE_RATES });
    try {
        const cached = getLocal('exchange_rates');
        if (cached) exchangeRates.value = { ...DEFAULT_EXCHANGE_RATES, ...JSON.parse(cached) };
    } catch {
        // ignore
    }

    const customFxRates = ref<Record<string, number>>({});
    try {
        const cachedCustom = getLocal('custom_fx_rates');
        if (cachedCustom) customFxRates.value = JSON.parse(cachedCustom);
    } catch {
        // ignore
    }

    const activeCurrencyObj = computed<Currency>(() => {
        return (
            SUPPORTED_CURRENCIES.find(c => c.code === selectedCurrency.value) ||
            SUPPORTED_CURRENCIES[0]
        );
    });

    const currencySymbol = computed<string>(() => {
        return activeCurrencyObj.value.symbol;
    });

    const activeFxRate = computed<number>(() => {
        if (selectedCurrency.value === 'USD') return 1.0;
        if (customFxRates.value[selectedCurrency.value]) {
            return customFxRates.value[selectedCurrency.value];
        }
        return exchangeRates.value[selectedCurrency.value] || 1.0;
    });

    function selectCurrency(code: string) {
        selectedCurrency.value = code;
        setLocal('selected_currency', code);
    }

    async function fetchExchangeRates(force = false) {
        isFetchingFx.value = true;
        try {
            const res = await fetch('https://open.er-api.com/v6/latest/USD');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (data && data.rates) {
                const nextRates = { ...DEFAULT_EXCHANGE_RATES };
                SUPPORTED_CURRENCIES.forEach(c => {
                    if (data.rates[c.code]) {
                        nextRates[c.code] = parseFloat(data.rates[c.code]);
                    }
                });
                exchangeRates.value = nextRates;
                setLocal('exchange_rates', JSON.stringify(nextRates));
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                fxLastUpdated.value = timeStr;
                setLocal('fx_last_updated_time', timeStr);
                setLocal('fx_last_updated_epoch', Date.now().toString());
                if (force) showNotification('Live exchange rates updated successfully!', 'success');
            }
        } catch (err) {
            console.warn('FX fetch failed:', err);
            if (force) showNotification('Could not fetch live rates. Using cached rates.', 'warning');
        } finally {
            isFetchingFx.value = false;
        }
    }

    function saveCustomFxRate(code: string, rate: number) {
        if (code === 'USD') {
            showNotification('USD is the base currency (1.00) and cannot be overridden.', 'error');
            return;
        }
        if (!rate || isNaN(rate) || rate <= 0) {
            showNotification('Please enter a valid positive exchange rate.', 'error');
            return;
        }
        customFxRates.value = { ...customFxRates.value, [code]: rate };
        setLocal('custom_fx_rates', JSON.stringify(customFxRates.value));
        showNotification(`Saved custom FX rate for ${code}: 1 USD = ${rate}`, 'success');
    }

    function resetCustomFxRate(code: string) {
        const next = { ...customFxRates.value };
        delete next[code];
        customFxRates.value = next;
        setLocal('custom_fx_rates', JSON.stringify(next));
        showNotification(`Reset ${code} to live market exchange rate`, 'info');
    }

    function formatMoney(
        usdNum: number | undefined | null,
        options: { sign?: boolean; showSymbol?: boolean; decimals?: number } = {}
    ): string {
        const { sign = false, showSymbol = true } = options;
        const num = usdNum !== undefined && usdNum !== null && !isNaN(usdNum) ? Number(usdNum) : 0;
        const val = num * (activeFxRate.value || 1);
        const isNeg = val < -0.0001;
        const isPos = val > 0.0001;
        const absVal = Math.abs(val);
        const decimals = options.decimals !== undefined ? options.decimals : (selectedCurrency.value === 'JPY' ? 0 : 2);

        const formattedNum = absVal.toLocaleString(undefined, {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        });

        const sym = showSymbol
            ? currencySymbol.value
                ? currencySymbol.value + (['RM', 'S$', 'HK$', 'CA$', 'A$'].includes(currencySymbol.value) ? ' ' : '')
                : '$'
            : '';

        if (sign) {
            if (isNeg) return `-${sym}${formattedNum}`;
            if (isPos) return `+${sym}${formattedNum}`;
            return `${sym}${formattedNum}`;
        }
        return isNeg ? `-${sym}${formattedNum}` : `${sym}${formattedNum}`;
    }

    return {
        selectedCurrency,
        isFetchingFx,
        fxLastUpdated,
        exchangeRates,
        customFxRates,
        activeCurrencyObj,
        currencySymbol,
        activeFxRate,
        selectCurrency,
        fetchExchangeRates,
        saveCustomFxRate,
        resetCustomFxRate,
        formatMoney
    };
});
