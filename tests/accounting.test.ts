import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { computeOptionHoldings, computeRealizedOptionsRecords } from '../src/engine/optionsEngine';
import { computeRealizedStockRecords, computeStockHoldings } from '../src/engine/taxLots';
import type { Transaction } from '../src/types/portfolio';

describe('Golden Master Benchmark Accounting Engine', () => {
    const rawData = readFileSync(resolve(__dirname, '../portfolio.json'), 'utf-8');
    const transactions: Transaction[] = JSON.parse(rawData);

    it('loads 761 transactions from portfolio.json', () => {
        expect(transactions.length).toBe(761);
    });

    it('calculates Realized Stock P/L matching benchmark ($4,099.99 across 33 closed trades)', () => {
        const records = computeRealizedStockRecords(transactions, 'FIFO');
        expect(records.length).toBe(33);

        const totalPL = records.reduce((sum, r) => sum + r.profit, 0);
        expect(Number(totalPL.toFixed(2))).toBe(4099.99);
    });

    it('calculates Realized Options P/L matching benchmark ($8,271.85 across 307 closing contracts)', () => {
        const records = computeRealizedOptionsRecords(transactions);
        expect(records.length).toBe(307);

        const totalPL = records.reduce((sum, r) => sum + r.profit, 0);
        expect(Number(totalPL.toFixed(2))).toBe(8271.85);
    });

    it('calculates Combined Realized P/L ($12,371.84)', () => {
        const stockRecords = computeRealizedStockRecords(transactions, 'FIFO');
        const optRecords = computeRealizedOptionsRecords(transactions);
        const stockPL = stockRecords.reduce((sum, r) => sum + r.profit, 0);
        const optPL = optRecords.reduce((sum, r) => sum + r.profit, 0);

        expect(Number((stockPL + optPL).toFixed(2))).toBe(12371.84);
    });

    it('correctly tracks active stock holdings with 10:1 split dilution for NVDA', () => {
        const holdings = computeStockHoldings(transactions, {}, 'FIFO');
        expect(holdings.length).toBe(11);

        const nvda = holdings.find(h => h.symbol === 'NVDA');
        expect(nvda).toBeDefined();
        expect(nvda!.quantity).toBe(65);
        expect(Number(nvda!.totalCost.toFixed(2))).toBe(11572.40);

        const googl = holdings.find(h => h.symbol === 'GOOGL');
        expect(googl).toBeDefined();
        expect(googl!.quantity).toBe(22);
        expect(Number(googl!.totalCost.toFixed(2))).toBe(4052.10);

        const sofi = holdings.find(h => h.symbol === 'SOFI');
        expect(sofi).toBeDefined();
        expect(sofi!.quantity).toBe(500);
        expect(Number(sofi!.totalCost.toFixed(2))).toBe(11830.00);
    });

    it('correctly tracks active open option positions', () => {
        const holdings = computeOptionHoldings(transactions);
        expect(holdings.length).toBe(2);

        const sofiOpt = holdings.find(h => h.symbol === 'SOFI');
        expect(sofiOpt).toBeDefined();
        expect(sofiOpt!.quantity).toBe(2);
        expect(sofiOpt!.positionType).toBe('Short');
        expect(Number(sofiOpt!.avgCost.toFixed(2))).toBe(0.85);

        const lmndOpt = holdings.find(h => h.symbol === 'LMND');
        expect(lmndOpt).toBeDefined();
        expect(lmndOpt!.quantity).toBe(1);
        expect(lmndOpt!.positionType).toBe('Short');
        expect(Number(lmndOpt!.avgCost.toFixed(2))).toBe(5.01);
    });
});
