import { compareChronologicalAscending, resolveTicker } from '../engine/sorting';
import { DEFAULT_EXCHANGE_RATES } from '../services/fx';
import type { Transaction } from '../types/portfolio';
import type { DetectedTransfer } from './schwabParser';

export interface IbkrParseResult {
    fileName: string;
    account: string;
    baseCurrency: string;
    fromDate: string;
    toDate: string;
    transactions: Transaction[];
    detectedTransfers: DetectedTransfer[];
    skipped: any[];
    skippedBreakdown: Record<string, number>;
    stockCount: number;
    optionCount: number;
    fxConvertedCount: number;
    aliasMappedCount: number;
    stats: {
        total: number;
        trades: number;
        stocks: number;
        options: number;
        transfers: number;
        aliasMapped: number;
        fxConverted: number;
        assignedOptions: number;
        skipped: number;
    };
}

export function parseIbkrContent(
    content: string,
    fileName: string,
    options: {
        customFxRates?: Record<string, number>;
        customTransferPrices?: Record<string, number>;
        resolveTickerFn?: (t: string) => string;
    } = {}
): IbkrParseResult {
    const {
        customFxRates = {},
        customTransferPrices = {},
        resolveTickerFn = resolveTicker
    } = options;

    if (!content || (!content.includes('tblTransactions_') && !content.includes('Activity Statement'))) {
        throw new Error('Unsupported file format. Please upload an Interactive Brokers (IBKR) Activity Statement HTML report.');
    }

    // Metadata extraction
    let fromDate = '';
    let toDate = '';
    const dateRangeMatch = content.match(/class="text-title"[^>]*>Activity Statement<br><span>([^<]+)<\/span>/i) ||
        content.match(/<title>[^<]*Activity Statement\s+([A-Za-z0-9,\s]+?)\s*-\s*([A-Za-z0-9,\s]+?)\s*-\s*Interactive Brokers<\/title>/i);

    if (dateRangeMatch) {
        if (dateRangeMatch[2]) {
            fromDate = dateRangeMatch[1].trim();
            toDate = dateRangeMatch[2].trim();
        } else {
            const parts = dateRangeMatch[1].split(' - ');
            if (parts.length === 2) {
                fromDate = parts[0].trim();
                toDate = parts[1].trim();
            }
        }
    }

    const accMatch = content.match(/<td>Account<\/td>\s*<td>([^<]+)<\/td>/i);
    const account = accMatch ? accMatch[1].trim() : '';

    const baseCurrMatch = content.match(/<td>Base Currency<\/td>\s*<td>([^<]+)<\/td>/i);
    const baseCurrency = baseCurrMatch ? baseCurrMatch[1].trim() : 'USD';

    const getFxRateToUsd = (curr: string) => {
        if (!curr || curr.toUpperCase() === 'USD') return 1.0;
        const c = curr.trim().toUpperCase();
        if (customFxRates[c] && !isNaN(customFxRates[c])) return parseFloat(String(customFxRates[c]));
        if (DEFAULT_EXCHANGE_RATES[c] && !isNaN(DEFAULT_EXCHANGE_RATES[c])) return parseFloat(String(DEFAULT_EXCHANGE_RATES[c]));
        const fallbackRates: Record<string, number> = { HKD: 7.82, SGD: 1.28, EUR: 0.87, GBP: 0.76, JPY: 155.0, CAD: 1.36, AUD: 1.52, CNY: 7.15 };
        return fallbackRates[c] || 1.0;
    };

    const monthMap: Record<string, string> = {
        JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
        JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12'
    };
    const optRegex = /^([A-Z0-9\.\s]+?)\s+(\d{2})([A-Z]{3})(\d{2})\s+([\d\.]+)\s+([CP])$/;

    const parsed: Transaction[] = [];
    const skipped: any[] = [];
    let aliasMappedCount = 0;
    let fxConvertedCount = 0;
    let rawIdx = 0;

    // Parse Trades
    const transStart = content.indexOf('tblTransactions_');
    const transEnd = content.indexOf('secTransactionsTax_');
    if (transStart !== -1 && transEnd !== -1) {
        const transSection = content.slice(transStart, transEnd);
        const tbodies = transSection.split('<tbody>');

        let currentAsset = '';
        let currentCurrency = '';

        for (const tbody of tbodies) {
            if (tbody.includes('header-asset')) {
                const match = tbody.match(/class="header-asset"[^>]*>([^<]+)/);
                if (match) currentAsset = match[1].trim();
            }
            if (tbody.includes('header-currency')) {
                const match = tbody.match(/class="header-currency"[^>]*>([^<]+)/);
                if (match) currentCurrency = match[1].trim();
            }

            if (tbody.includes('<tr') && !tbody.includes('header-asset') && !tbody.includes('header-currency') && !tbody.includes('subtotal') && !tbody.includes('total')) {
                const tds: string[] = [];
                const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
                let m;
                while ((m = tdRegex.exec(tbody)) !== null) {
                    tds.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
                }

                if (tds.length < 7) continue;

                const symbol = tds[0];
                const dateTime = tds[1];
                const rawQty = parseFloat((tds[2] || '0').replace(/,/g, '')) || 0;
                const price = parseFloat((tds[3] || '0').replace(/,/g, '')) || 0;
                const fee = Math.abs(parseFloat((tds[6] || '0').replace(/,/g, '')) || 0);
                const code = tds[10] || '';
                const codes = code.split(';').map(c => c.trim()).filter(Boolean);

                const [datePart, timePart] = dateTime.split(', ');
                const date = (datePart || '').trim();
                const time = (timePart || '').trim();
                const qty = Math.abs(rawQty);

                const tradeCurr = (currentCurrency || 'USD').trim().toUpperCase();
                const fxRate = getFxRateToUsd(tradeCurr);
                const isNonUsd = tradeCurr !== 'USD' && fxRate > 0 && fxRate !== 1.0;

                if (currentAsset === 'Equity and Index Options') {
                    const optMatch = symbol.match(optRegex);
                    if (!optMatch) {
                        skipped.push({ asset: currentAsset, symbol, dateTime, reason: 'Unrecognized option format' });
                        continue;
                    }

                    const rawTicker = optMatch[1].trim();
                    const ticker = resolveTickerFn(rawTicker);
                    if (rawTicker !== ticker) aliasMappedCount++;

                    const expDay = optMatch[2];
                    const expMonth = monthMap[optMatch[3].toUpperCase()] || '01';
                    const expYear = `20${optMatch[4]}`;
                    const expiration = `${expYear}-${expMonth}-${expDay}`;
                    const strike = parseFloat(optMatch[5]);
                    const optionType = optMatch[6] === 'C' ? 'Call' : 'Put';

                    let action: any = '';
                    let effPrice = price;

                    if (codes.includes('A')) {
                        action = 'Assigned';
                        effPrice = 0;
                    } else if (codes.includes('Ex') || codes.includes('AEx') || codes.includes('MEx')) {
                        action = 'Exchange or Exercise';
                        effPrice = 0;
                    } else if (codes.includes('Ep')) {
                        action = 'Expire';
                        effPrice = 0;
                    } else if (codes.includes('O')) {
                        action = rawQty > 0 ? 'Buy to Open' : 'Sell to Open';
                    } else if (codes.includes('C')) {
                        action = rawQty > 0 ? 'Buy to Close' : 'Sell to Close';
                    } else if (price === 0) {
                        action = 'Expire';
                        effPrice = 0;
                    } else {
                        action = rawQty > 0 ? 'Buy to Open' : 'Sell to Open';
                    }

                    let optPriceUsd = effPrice;
                    let optFeeUsd = fee;
                    if (isNonUsd && effPrice > 0) {
                        optPriceUsd = Math.round((effPrice / fxRate) * 10000) / 10000;
                        optFeeUsd = Math.round((fee / fxRate) * 100) / 100;
                        fxConvertedCount++;
                    }

                    const gross = qty * optPriceUsd * 100;
                    const totalValue = ['Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(action)
                        ? (gross + optFeeUsd)
                        : (gross - optFeeUsd);

                    parsed.push({
                        rawIndex: rawIdx,
                        id: `ibkr_${date.replace(/-/g, '')}_${rawIdx++}`,
                        date,
                        time,
                        assetType: 'Option',
                        ticker,
                        action,
                        originalAction: `IBKR Option (${code || 'Trade'})`,
                        quantity: qty,
                        price: optPriceUsd,
                        fee: optFeeUsd,
                        optionType,
                        strike,
                        expiration,
                        strategyName: '',
                        totalValue
                    });
                } else if (currentAsset === 'Stocks') {
                    const rawStockTicker = symbol.trim().toUpperCase();
                    const ticker = resolveTickerFn(rawStockTicker);
                    if (rawStockTicker !== ticker) aliasMappedCount++;

                    let action: any = rawQty > 0 ? 'Buy' : 'Sell';
                    let effPrice = price;
                    let stockOrigAction = `IBKR Stock (${code || (rawQty > 0 ? 'Buy' : 'Sell')})`;

                    if (codes.includes('A')) {
                        stockOrigAction = 'Option Assignment / Exercise';
                    }

                    let stockPriceUsd = effPrice;
                    let stockFeeUsd = fee;
                    if (isNonUsd && effPrice > 0) {
                        stockPriceUsd = Math.round((effPrice / fxRate) * 10000) / 10000;
                        stockFeeUsd = Math.round((fee / fxRate) * 100) / 100;
                        fxConvertedCount++;
                    }

                    const gross = qty * stockPriceUsd;
                    const totalValue = action === 'Buy' ? (gross + stockFeeUsd) : (gross - stockFeeUsd);

                    parsed.push({
                        rawIndex: rawIdx,
                        id: `ibkr_${date.replace(/-/g, '')}_${rawIdx++}`,
                        date,
                        time,
                        assetType: 'Stock',
                        ticker,
                        action,
                        originalAction: stockOrigAction,
                        quantity: qty,
                        price: stockPriceUsd,
                        fee: stockFeeUsd,
                        optionType: 'Call',
                        strike: null,
                        expiration: '',
                        strategyName: '',
                        totalValue
                    });
                } else {
                    skipped.push({ asset: currentAsset, symbol, dateTime });
                }
            }
        }
    }

    // Inbound Transfers Section
    const detectedTransfers: DetectedTransfer[] = [];
    const transSecStart = content.indexOf('secAccountTransfers_');
    const transSecEnd = content.indexOf('secCombDepWith_');
    if (transSecStart !== -1 && transSecEnd !== -1) {
        const xferHtml = content.slice(transSecStart, transSecEnd);
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let trMatch;
        while ((trMatch = trRegex.exec(xferHtml)) !== null) {
            const tr = trMatch[1];
            if (tr.includes('<th') || tr.includes('header-asset') || tr.includes('subtotal') || tr.includes('total')) continue;
            const tds: string[] = [];
            const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
            let tdMatch;
            while ((tdMatch = tdRegex.exec(tr)) !== null) {
                tds.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
            }
            if (tds.length >= 7) {
                const sym = tds[0];
                const date = tds[1];
                const dir = tds[3];
                const rawQty = parseFloat((tds[6] || '0').replace(/,/g, '')) || 0;
                const mktVal = parseFloat((tds[8] || '0').replace(/,/g, '')) || 0;

                if (dir === 'In' && rawQty !== 0) {
                    const optMatch = sym.match(optRegex);
                    const isOption = !!optMatch;
                    const ticker = isOption ? resolveTickerFn(optMatch[1].trim()) : resolveTickerFn(sym.trim().toUpperCase());
                    const transferKey = `${ticker}_${date}`;

                    let optionDetails = '';
                    let optionType: 'Call' | 'Put' = 'Call';
                    let strike: number | null = null;
                    let expiration = '';

                    if (isOption) {
                        const expDay = optMatch[2];
                        const expMonth = monthMap[optMatch[3].toUpperCase()] || '01';
                        const expYear = `20${optMatch[4]}`;
                        expiration = `${expYear}-${expMonth}-${expDay}`;
                        strike = parseFloat(optMatch[5]);
                        optionType = optMatch[6] === 'C' ? 'Call' : 'Put';
                        optionDetails = `${optionType} $${strike} Exp ${expiration}`;
                    }

                    const qty = Math.abs(rawQty);
                    let effPrice = 0.00;
                    let sourceLabel = 'Pending Input';

                    if (customTransferPrices[transferKey] !== undefined) {
                        effPrice = Number(customTransferPrices[transferKey]) || 0;
                        sourceLabel = 'Saved / Custom';
                    }

                    const action = isOption ? (rawQty > 0 ? 'Buy to Open' : 'Sell to Open') : (rawQty > 0 ? 'Buy' : 'Sell');
                    const gross = qty * effPrice * (isOption ? 100 : 1);
                    const totalValue = ['Buy', 'Buy to Open'].includes(action) ? gross : -gross;

                    detectedTransfers.push({
                        key: transferKey,
                        ticker,
                        date,
                        assetType: isOption ? 'Option' : 'Stock',
                        optionDetails,
                        quantity: qty,
                        price: effPrice,
                        marketValue: mktVal,
                        sourceLabel,
                        status: 'ready'
                    });

                    parsed.push({
                        rawIndex: rawIdx,
                        id: `ibkr_${date.replace(/-/g, '')}_xfer_${rawIdx++}`,
                        date,
                        time: '00:00:00',
                        assetType: isOption ? 'Option' : 'Stock',
                        ticker,
                        action: action as any,
                        originalAction: 'Security Transfer',
                        quantity: qty,
                        price: effPrice,
                        fee: 0,
                        optionType,
                        strike,
                        expiration,
                        strategyName: '',
                        totalValue
                    });
                }
            }
        }
    }

    // Corporate Actions / Stock Splits
    const corpStart = content.indexOf('secCorporateActions_');
    const corpEnd = content.indexOf('secCodes_');
    if (corpStart !== -1 && corpEnd !== -1) {
        const corpChunk = content.slice(corpStart, corpEnd);
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
        let trMatch;
        while ((trMatch = trRegex.exec(corpChunk)) !== null) {
            const tr = trMatch[1];
            if (tr.includes('<th') || tr.includes('subtotal') || tr.includes('total')) continue;
            const tds: string[] = [];
            const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
            let tdMatch;
            while ((tdMatch = tdRegex.exec(tr)) !== null) {
                tds.push(tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
            }
            if (tds.length >= 4) {
                const rowStr = tds.join(' ').toLowerCase();
                if (rowStr.includes('split') || rowStr.includes('forward split') || rowStr.includes('distribution')) {
                    const rawSym = tds[0];
                    const sym = resolveTickerFn(rawSym.trim().toUpperCase());
                    const date = (tds[1] || '').split(',')[0].trim();
                    const qty = Math.abs(parseFloat((tds[4] || tds[3] || '0').replace(/,/g, '')) || 0);
                    if (sym && date && qty > 0) {
                        parsed.push({
                            rawIndex: rawIdx,
                            id: `ibkr_${date.replace(/-/g, '')}_split_${rawIdx++}`,
                            date,
                            time: '00:00:00',
                            assetType: 'Stock',
                            ticker: sym,
                            action: 'Buy',
                            originalAction: 'Stock Split',
                            quantity: qty,
                            price: 0,
                            fee: 0,
                            optionType: 'Call',
                            strike: null,
                            expiration: '',
                            strategyName: '',
                            totalValue: 0
                        });
                    }
                }
            }
        }
    }

    // Skipped breakdown summary
    const skippedBreakdown: Record<string, number> = {};
    const countSectionRows = (startId: string, endId: string) => {
        const s = content.indexOf(startId);
        const e = content.indexOf(endId);
        if (s === -1 || e === -1) return 0;
        const block = content.slice(s, e);
        const m = block.match(/<tr[^>]*>[\s\S]*?<\/tr>/g);
        if (!m) return 0;
        return m.filter(r => !r.includes('<th') && !r.includes('total') && !r.includes('subtotal') && r.includes('<td')).length;
    };

    const divCount = countSectionRows('secDividends_', 'secWithholdingTax_');
    if (divCount > 0) skippedBreakdown['Dividends'] = divCount;
    const taxCount = countSectionRows('secWithholdingTax_', 'secCombInt_');
    if (taxCount > 0) skippedBreakdown['Withholding Tax'] = taxCount;
    const depWithCount = countSectionRows('secCombDepWith_', 'secCombFees_');
    if (depWithCount > 0) skippedBreakdown['Deposits & Withdrawals'] = depWithCount;
    if (skipped.length > 0) {
        skippedBreakdown['Forex & Other'] = skipped.length;
    }

    parsed.sort(compareChronologicalAscending);

    let stockCount = 0;
    let optionCount = 0;
    parsed.forEach(p => {
        if (p.assetType === 'Stock') stockCount++;
        else if (p.assetType === 'Option') optionCount++;
    });

    const totalSkippedCount = skipped.length + Object.values(skippedBreakdown).reduce((a, b) => a + b, 0);

    return {
        fileName,
        account,
        baseCurrency,
        fromDate,
        toDate,
        transactions: parsed,
        detectedTransfers,
        skipped,
        skippedBreakdown,
        stockCount,
        optionCount,
        fxConvertedCount,
        aliasMappedCount,
        stats: {
            total: parsed.length + totalSkippedCount,
            trades: parsed.length,
            stocks: stockCount,
            options: optionCount,
            transfers: detectedTransfers.length,
            aliasMapped: aliasMappedCount,
            fxConverted: fxConvertedCount,
            assignedOptions: parsed.filter(t => t.assetType === 'Option' && t.action === 'Assigned').length,
            skipped: totalSkippedCount
        }
    };
}
