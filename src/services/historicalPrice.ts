import { callGeminiResearchAPI } from './geminiAi';
import type { Transaction } from '../types/portfolio';

export interface HistoricalPriceLookupOptions {
  geminiApiKey?: string;
  finnhubApiKey?: string;
  resolveTicker?: (t: string) => string;
  transactions?: Transaction[];
  marketPrices?: Record<string, number>;
  customTransferPrices?: Record<string, number>;
}

export async function fetchHistoricalStockPrice(
  ticker: string,
  date: string,
  options?: HistoricalPriceLookupOptions
): Promise<number | null> {
  const resolved = options?.resolveTicker ? options.resolveTicker(ticker) : ticker;
  const transferKey = `${resolved}_${date}`;

  // 1. Check custom / saved transfer prices first
  if (options?.customTransferPrices && options.customTransferPrices[transferKey] && options.customTransferPrices[transferKey] > 0) {
    return options.customTransferPrices[transferKey];
  }
  const saved = localStorage.getItem('custom_transfer_prices');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed[transferKey] && parsed[transferKey] > 0) {
        return parsed[transferKey];
      }
    } catch {}
  }

  // 2. Query Google Gemini AI if geminiApiKey is configured
  if (options?.geminiApiKey && options.geminiApiKey.trim() !== '') {
    try {
      const prompt = `You are a financial assistant. What was the market closing price of US stock "${resolved}" on ${date}?
If the stock split after that date, give the accurate unadjusted historical closing price on that date.
Respond with ONLY a JSON object: {"symbol": "${resolved}", "date": "${date}", "closePrice": 123.45}.
No markdown fences or commentary outside the JSON.`;
      const res = await callGeminiResearchAPI(prompt, options.geminiApiKey, true);
      if (res && res.text) {
        const clean = res.text.replace(/```json/gi, '').replace(/```/g, '').trim();
        const jsonMatch = clean.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          const price = parseFloat(parsed.closePrice || parsed.price || parsed.close);
          if (!isNaN(price) && price > 0) {
            return Math.round(price * 100) / 100;
          }
        }
      }
    } catch (err) {
      console.warn(`Gemini historical fetch failed for ${resolved} on ${date}:`, err);
    }
  }

  // 3. Query Finnhub API if apiKey is configured
  if (options?.finnhubApiKey && options.finnhubApiKey.trim() !== '') {
    try {
      const targetTime = Math.floor(new Date(date + 'T16:00:00Z').getTime() / 1000);
      const from = targetTime - 86400 * 5; // 5 days prior to bridge weekends / holidays
      const to = targetTime + 86400 * 3;
      const token = options.finnhubApiKey.trim();
      const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(resolved)}&resolution=D&from=${from}&to=${to}&token=${token}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.s === 'ok' && Array.isArray(data.c) && data.c.length > 0 && Array.isArray(data.t)) {
          let bestIdx = 0;
          let minDiff = Infinity;
          for (let i = 0; i < data.t.length; i++) {
            const diff = Math.abs(data.t[i] - targetTime);
            if (diff < minDiff) {
              minDiff = diff;
              bestIdx = i;
            }
          }
          const fetchedPrice = Math.round(data.c[bestIdx] * 100) / 100;
          if (fetchedPrice > 0) return fetchedPrice;
        }
      }
    } catch (err) {
      console.warn(`Finnhub historical candle fetch failed for ${resolved} on ${date}:`, err);
    }
  }

  // 4. Fallback: Prior buy transactions for this ticker in existing ledger
  if (options?.transactions) {
    const priorTx = options.transactions.find(
      t => t.assetType === 'Stock' &&
      (options.resolveTicker ? options.resolveTicker(t.ticker) : t.ticker) === resolved &&
      t.price > 0 &&
      new Date(t.date) <= new Date(date)
    );
    if (priorTx) {
      return priorTx.price;
    }
  }

  // 5. Fallback: Current market price if available
  if (options?.marketPrices && options.marketPrices[resolved] && options.marketPrices[resolved] > 0) {
    return options.marketPrices[resolved];
  }

  return null;
}

