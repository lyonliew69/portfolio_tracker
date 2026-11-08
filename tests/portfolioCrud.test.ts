import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePortfolioStore } from '../src/stores/portfolio';

describe('Pinia Portfolio CRUD & Option Roll Actions', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('adds a new stock transaction and recalculates holdings', async () => {
        const store = usePortfolioStore();
        expect(store.transactions.length).toBe(0);

        await store.addTransaction({
            date: '2026-01-15',
            assetType: 'Stock',
            ticker: 'AAPL',
            action: 'Buy',
            quantity: 10,
            price: 150,
            fee: 1.0
        });

        expect(store.transactions.length).toBe(1);
        expect(store.transactions[0].ticker).toBe('AAPL');
        expect(store.transactions[0].totalValue).toBe(1501.0); // 1500 + 1 fee

        expect(store.stockHoldings.length).toBe(1);
        expect(store.stockHoldings[0].symbol).toBe('AAPL');
        expect(store.stockHoldings[0].quantity).toBe(10);
        expect(store.marketPrices['AAPL']).toBe(150);
    });

    it('updates an existing transaction and recalculates totalValue and P/L', async () => {
        const store = usePortfolioStore();
        const tx = await store.addTransaction({
            date: '2026-01-15',
            assetType: 'Stock',
            ticker: 'AAPL',
            action: 'Buy',
            quantity: 10,
            price: 150,
            fee: 0
        });

        await store.updateTransaction({
            ...tx,
            quantity: 20,
            price: 160
        });

        expect(store.transactions[0].quantity).toBe(20);
        expect(store.transactions[0].price).toBe(160);
        expect(store.transactions[0].totalValue).toBe(3200);
        expect(store.stockHoldings[0].quantity).toBe(20);
        expect(store.stockHoldings[0].totalCost).toBe(3200);
    });

    it('deletes a transaction from ledger', async () => {
        const store = usePortfolioStore();
        const tx = await store.addTransaction({
            date: '2026-01-15',
            assetType: 'Stock',
            ticker: 'AAPL',
            action: 'Buy',
            quantity: 10,
            price: 150,
            fee: 0
        });

        expect(store.transactions.length).toBe(1);
        await store.deleteTransaction(tx.id);
        expect(store.transactions.length).toBe(0);
        expect(store.stockHoldings.length).toBe(0);
    });

    it('handles Option Roll state machine initialization and cancellation', () => {
        const store = usePortfolioStore();
        const mockOption: any = {
            key: 'NVDA_OPT_CALL_150_2026-06-19',
            symbol: 'NVDA',
            assetType: 'Option',
            optionType: 'Call',
            strike: 150,
            expiration: '2026-06-19',
            quantity: 1,
            totalCost: 500,
            avgCost: 5.0,
            positionType: 'Short'
        };

        store.startRollOption(mockOption);
        expect(store.isRolling).toBe(true);
        expect(store.rollStep).toBe(1);
        expect(store.rollSourceHolding).toEqual(mockOption);
        expect(store.showRecordTransaction).toBe(true);

        store.cancelRoll();
        expect(store.isRolling).toBe(false);
        expect(store.rollSourceHolding).toBeNull();
    });
});
