export interface Currency {
    code: string;
    name: string;
    symbol: string;
    flag: string;
}

export const SUPPORTED_CURRENCIES: Currency[] = [
    { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸' },
    { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', flag: '🇲🇾' },
    { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬' },
    { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺' },
    { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧' },
    { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', flag: '🇭🇰' },
    { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵' },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', flag: '🇨🇦' },
    { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺' }
];

export const DEFAULT_EXCHANGE_RATES: Record<string, number> = {
    USD: 1.0,
    MYR: 4.08,
    SGD: 1.28,
    EUR: 0.87,
    GBP: 0.76,
    HKD: 7.82,
    JPY: 155.0,
    CAD: 1.36,
    AUD: 1.52
};

export async function fetchLiveExchangeRates(force = false): Promise<Record<string, number> | null> {
    const lastUpdated = localStorage.getItem('fx_last_updated_epoch');
    const now = Date.now();
    // Cache for 6 hours unless forced
    if (!force && lastUpdated && (now - parseInt(lastUpdated, 10)) < 21600000) {
        const cached = localStorage.getItem('exchange_rates');
        return cached ? JSON.parse(cached) : null;
    }

    try {
        const res = await fetch('https://open.er-api.com/v6/latest/USD');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && data.rates) {
            const rates: Record<string, number> = { ...DEFAULT_EXCHANGE_RATES };
            SUPPORTED_CURRENCIES.forEach(c => {
                if (data.rates[c.code]) {
                    rates[c.code] = parseFloat(data.rates[c.code]);
                }
            });
            localStorage.setItem('exchange_rates', JSON.stringify(rates));
            localStorage.setItem('fx_last_updated_epoch', now.toString());
            return rates;
        }
    } catch (err) {
        console.warn('Failed to fetch live FX rates:', err);
    }
    return null;
}

export function formatMoney(
    amount: number,
    fxRate = 1.0,
    symbol = '$',
    options: { sign?: boolean; showSymbol?: boolean; decimals?: number } = {}
): string {
    const { sign = false, showSymbol = true, decimals = 2 } = options;
    const converted = (amount || 0) * fxRate;
    const isNegative = converted < 0;
    const absVal = Math.abs(converted);

    const formatted = absVal.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });

    const prefix = sign ? (converted > 0 ? '+' : (converted < 0 ? '-' : '')) : (isNegative ? '-' : '');
    const sym = showSymbol ? symbol : '';

    return `${prefix}${sym}${formatted}`;
}

export function formatPercent(val: number, options: { sign?: boolean; decimals?: number } = {}): string {
    const { sign = true, decimals = 2 } = options;
    const num = isNaN(val) ? 0 : val;
    const prefix = sign && num > 0 ? '+' : '';
    return `${prefix}${num.toFixed(decimals)}%`;
}
