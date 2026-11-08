import { readFileSync } from 'fs';
import { createPinia, setActivePinia } from 'pinia';
import { resolve } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useMarketStore } from '../src/stores/market';
import { usePortfolioStore } from '../src/stores/portfolio';
import type { Transaction } from '../src/types/portfolio';

describe('Pinia Portfolio Store Integration', () => {
    const rawData = readFileSync(resolve(__dirname, '../portfolio.json'), 'utf-8');
    const transactions: Transaction[] = JSON.parse(rawData);

    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('initializes store and reacts to transaction dataset', () => {
        const store = usePortfolioStore();
        store.setTransactionsDirect(transactions);

        expect(store.transactions.length).toBe(761);
        expect(Number(store.realizedStockPL.toFixed(2))).toBe(4099.99);
        expect(Number(store.realizedOptionsPL.toFixed(2))).toBe(8271.85);
        expect(Number(store.totalRealizedPL.toFixed(2))).toBe(12371.84);
        expect(store.stockHoldings.length).toBe(11);
        expect(store.optionHoldings.length).toBe(2);
    });

    it('dynamically recalculates when switching cost basis method', () => {
        const store = usePortfolioStore();
        store.setTransactionsDirect(transactions);

        // Switch to AVG
        store.setCostBasisMethod('AVG');
        expect(store.costBasisMethod).toBe('AVG');
        expect(store.stockHoldings.length).toBe(11);

        // Switch back to FIFO
        store.setCostBasisMethod('FIFO');
        expect(store.costBasisMethod).toBe('FIFO');
        expect(Number(store.realizedStockPL.toFixed(2))).toBe(4099.99);
    });

    it('updates unrealized P/L when market prices change', () => {
        const store = usePortfolioStore();
        store.setTransactionsDirect(transactions);

        const initialValue = store.stockPortfolioValue;
        store.setMarketPrices({ NVDA: 200, GOOGL: 200 });

        expect(store.stockPortfolioValue).not.toBe(initialValue);
        const nvda = store.stockHoldings.find(h => h.symbol === 'NVDA');
        expect(nvda?.currentPrice).toBe(200);
        expect(nvda?.marketValue).toBe(65 * 200);
    });

    it('includes watchlist tickers in uniqueStockTickers even if not currently held', () => {
        const store = usePortfolioStore();
        store.setTransactionsDirect(transactions);

        // Verify active holdings are in uniqueStockTickers
        expect(store.uniqueStockTickers).toContain('NVDA');
        expect(store.uniqueStockTickers).toContain('GOOGL');

        // Add a ticker not in holdings to manual watchlist
        const marketStore = useMarketStore();
        marketStore.addWatchlistTicker('TSLA');

        expect(store.uniqueStockTickers).toContain('TSLA');
    });
});
