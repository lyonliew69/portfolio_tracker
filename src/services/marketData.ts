export interface MarketStatus {
    isOpen: boolean;
    session?: string;
    holiday?: string | null;
}

export async function checkFinnhubMarketStatus(apiKey: string): Promise<boolean> {
    try {
        const res = await fetch(`https://finnhub.io/api/v1/stock/market-status?exchange=US&token=${apiKey.trim()}`);
        if (!res.ok) return true;
        const data = await res.json();
        return typeof data.isOpen !== 'undefined' ? data.isOpen : true;
    } catch {
        return true;
    }
}

export async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<number | null> {
    const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey.trim()}`);
    if (res.status === 429) {
        throw new Error('Finnhub rate limit exceeded.');
    }
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.c === 'number' && data.c > 0 ? data.c : null;
}

export async function syncFinnhubWatchlist(
    symbols: string[],
    apiKey: string,
    onPrice: (symbol: string, price: number) => void,
    onProgress?: (current: number, total: number) => void
): Promise<{ updated: number; errors: number; rateLimited: boolean }> {
    let updated = 0;
    let errors = 0;
    let rateLimited = false;

    for (let i = 0; i < symbols.length; i++) {
        const symbol = symbols[i];
        if (onProgress) onProgress(i + 1, symbols.length);

        try {
            const price = await fetchFinnhubQuote(symbol, apiKey);
            if (price !== null) {
                onPrice(symbol, price);
                updated++;
            } else {
                errors++;
            }
            // 1s delay to respect 60 req/min free tier rate limits
            if (i < symbols.length - 1) {
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err: any) {
            if (err.message?.includes('rate limit')) {
                rateLimited = true;
                break;
            }
            errors++;
        }
    }

    return { updated, errors, rateLimited };
}
