import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { computeHeatmapMatrix, computeMonthlyPerformance } from '../src/engine/analytics';
import { computeRealizedOptionsRecords } from '../src/engine/optionsEngine';
import { computeRealizedStockRecords } from '../src/engine/taxLots';
import type { Transaction } from '../src/types/portfolio';

describe('Performance Analytics & Heatmap Matrix Engine', () => {
    const rawData = readFileSync(resolve(__dirname, '../portfolio.json'), 'utf-8');
    const transactions: Transaction[] = JSON.parse(rawData);

    const stockRecords = computeRealizedStockRecords(transactions, 'FIFO');
    const optionRecords = computeRealizedOptionsRecords(transactions);

    it('computes monthly cumulative equity curve matching combined realized P/L', () => {
        const perf = computeMonthlyPerformance(stockRecords, optionRecords, 'all', 'ALL');
        expect(perf.months.length).toBeGreaterThan(0);
        expect(Number(perf.stats.totalPL.toFixed(2))).toBe(12371.84);
        expect(perf.stats.activeMonths).toBeGreaterThan(0);
        expect(perf.stats.winRate).toBeGreaterThan(0);
    });

    it('computes 12-month heatmap matrix for every active year with win rate', () => {
        const years = Array.from(new Set([...stockRecords, ...optionRecords].map(r => r.year))).sort().reverse();
        const matrix = computeHeatmapMatrix(stockRecords, optionRecords, years);

        expect(matrix.length).toBe(years.length);
        matrix.forEach(row => {
            expect(row.months.length).toBe(12);
            expect(typeof row.winRate).toBe('number');
            expect(row.winRate).toBeGreaterThanOrEqual(0);
            expect(row.winRate).toBeLessThanOrEqual(100);
        });

        const totalAcrossYears = matrix.reduce((sum, r) => sum + r.totalPL, 0);
        expect(Number(totalAcrossYears.toFixed(2))).toBe(12371.84);
    });

    it('filters heatmap matrix by asset type (stocks vs options)', () => {
        const years = Array.from(new Set([...stockRecords, ...optionRecords].map(r => r.year))).sort().reverse();
        const stockMatrix = computeHeatmapMatrix(stockRecords, optionRecords, years, 'stock');
        const optionMatrix = computeHeatmapMatrix(stockRecords, optionRecords, years, 'option');
        const allMatrix = computeHeatmapMatrix(stockRecords, optionRecords, years, 'all');

        const stockTotal = stockMatrix.reduce((sum, r) => sum + r.totalPL, 0);
        const optionTotal = optionMatrix.reduce((sum, r) => sum + r.totalPL, 0);
        const allTotal = allMatrix.reduce((sum, r) => sum + r.totalPL, 0);

        expect(Number(stockTotal.toFixed(2))).toBe(4099.99);
        expect(Number(optionTotal.toFixed(2))).toBe(8271.85);
        expect(Number(allTotal.toFixed(2))).toBe(12371.84);
        expect(Number((stockTotal + optionTotal).toFixed(2))).toBe(Number(allTotal.toFixed(2)));
    });

    it('filters monthly performance by specific calendar year', () => {
        const currentYearStr = new Date().getFullYear().toString();
        const perf = computeMonthlyPerformance(stockRecords, optionRecords, 'all', currentYearStr);
        expect(perf.months.every(m => m.year === currentYearStr)).toBe(true);
    });
});
