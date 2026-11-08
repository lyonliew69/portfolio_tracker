import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
import { mergeWithMultisetDeduplication } from '../src/parsers/deduplicator';
import { parseIbkrContent } from '../src/parsers/ibkrParser';
import { parseSchwabContent } from '../src/parsers/schwabParser';

describe('Broker Statements Ingestion Parsers', () => {
    const schwabJsonPath = resolve(__dirname, '../Individual_XXX347_Transactions_20260905-005020.json');
    const schwabXmlPath = resolve(__dirname, '../Individual_XXX347_Transactions_20260905-005028.xml');
    const ibkrHtmlPath = resolve(__dirname, '../U13033365_20231013_20260927.htm.html');

    it('parses Charles Schwab JSON statement accurately', () => {
        if (!existsSync(schwabJsonPath)) return;
        const content = readFileSync(schwabJsonPath, 'utf-8');
        const result = parseSchwabContent(content, 'Individual_XXX347_Transactions_20260905-005020.json');

        expect(result.transactions.length).toBeGreaterThan(0);
        expect(result.stockCount + result.optionCount).toBe(result.transactions.length);
        expect(result.fromDate).toBeDefined();
        expect(result.toDate).toBeDefined();
    });

    it('parses Charles Schwab XML statement accurately and matches JSON count', () => {
        if (!existsSync(schwabXmlPath) || !existsSync(schwabJsonPath)) return;
        const xmlContent = readFileSync(schwabXmlPath, 'utf-8');
        const jsonContent = readFileSync(schwabJsonPath, 'utf-8');

        const xmlResult = parseSchwabContent(xmlContent, 'report.xml');
        const jsonResult = parseSchwabContent(jsonContent, 'report.json');

        expect(xmlResult.transactions.length).toBe(jsonResult.transactions.length);
        expect(xmlResult.stockCount).toBe(jsonResult.stockCount);
        expect(xmlResult.optionCount).toBe(jsonResult.optionCount);
    });

    it('parses Interactive Brokers HTML Activity Statement', () => {
        if (!existsSync(ibkrHtmlPath)) return;
        const content = readFileSync(ibkrHtmlPath, 'utf-8');
        const result = parseIbkrContent(content, 'U13033365_20231013_20260927.htm.html');

        expect(result.transactions.length).toBeGreaterThan(0);
        expect(result.account).toBe('U13033365');
        expect(result.baseCurrency).toBe('SGD');
    });

    it('deduplicates identical transactions correctly via multiset fingerprinting', () => {
        const t1: any = { date: '2024-01-01', ticker: 'NVDA', assetType: 'Stock', action: 'Buy', quantity: 10, price: 100 };
        const t2: any = { date: '2024-01-02', ticker: 'NVDA', assetType: 'Stock', action: 'Sell', quantity: 10, price: 120 };

        const existing = [t1];
        const incoming = [t1, t2];

        const { merged, addedCount, duplicateCount } = mergeWithMultisetDeduplication(existing, incoming);
        expect(addedCount).toBe(1);
        expect(duplicateCount).toBe(1);
        expect(merged.length).toBe(2);
    });
});
