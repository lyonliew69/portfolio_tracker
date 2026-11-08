import type {
    OpenOptionsSummary,
    OptionHolding,
    RealizedOptionRecord,
    Transaction
} from '../types/portfolio';
import { compareChronologicalAscending, resolveTicker } from './sorting';

export function getTrackingKey(
    tx: Transaction,
    resolveTickerFn: (t: string) => string = resolveTicker
): string {
    const ticker = resolveTickerFn(tx.ticker);
    if (tx.assetType === 'Stock') return ticker;
    if (tx.assetType === 'Option') {
        const strike = tx.strike !== null && tx.strike !== undefined && !isNaN(Number(tx.strike))
            ? parseFloat(String(tx.strike))
            : '';
        return `${ticker}_OPT_${(tx.optionType || '').toUpperCase()}_${strike}_${tx.expiration}`;
    }
    return `${ticker}_SPREAD_${(tx.strategyName || '').toUpperCase().trim()}`;
}

export function computeOptionHoldings(
    transactions: Transaction[],
    resolveTickerFn: (t: string) => string = resolveTicker
): OptionHolding[] {
    const optionMap: Record<string, OptionHolding> = {};
    const chronTransactions = [...transactions]
        .filter(tx => tx.assetType === 'Option' || tx.assetType === 'Spread')
        .sort(compareChronologicalAscending);

    chronTransactions.forEach(tx => {
        const key = getTrackingKey(tx, resolveTickerFn);
        if (!optionMap[key]) {
            optionMap[key] = {
                key,
                symbol: resolveTickerFn(tx.ticker),
                assetType: tx.assetType,
                optionType: tx.optionType || null,
                strike: tx.strike ?? null,
                expiration: tx.expiration ?? null,
                strategyName: tx.strategyName ?? null,
                quantity: 0,
                totalCost: 0,
                avgCost: 0,
                positionType: tx.action === 'Buy to Open' ? 'Long' : 'Short'
            };
        }
        const opt = optionMap[key];

        if (tx.action === 'Buy to Open') {
            opt.quantity += tx.quantity;
            opt.totalCost += (tx.quantity * tx.price * 100) + (tx.fee || 0);
            opt.avgCost = opt.quantity > 0 ? (opt.totalCost / (opt.quantity * 100)) : 0;
        } else if (['Sell to Close', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action)) {
            opt.quantity -= tx.quantity;
            opt.totalCost -= (tx.quantity * opt.avgCost * 100);
        } else if (tx.action === 'Sell to Open') {
            opt.quantity += tx.quantity;
            opt.totalCost += (tx.quantity * tx.price * 100) - (tx.fee || 0);
            opt.avgCost = opt.quantity > 0 ? (opt.totalCost / (opt.quantity * 100)) : 0;
        }

        if (opt.quantity <= 0.0001) {
            delete optionMap[key];
        }
    });

    return Object.values(optionMap);
}

export function computeOpenOptionsSummary(holdings: OptionHolding[]): OpenOptionsSummary {
    let netPremium = 0;       // Net credit (+) or debit (-) pending at expiration
    let shortPremium = 0;     // Total short option premium collected
    let longDebit = 0;        // Total long option debit paid
    let totalContracts = 0;   // Sum of all active contracts
    let shortContracts = 0;
    let longContracts = 0;

    holdings.forEach(opt => {
        const qty = opt.quantity || 0;
        totalContracts += qty;
        if (opt.positionType === 'Short') {
            shortContracts += qty;
            shortPremium += (opt.totalCost || 0);
            netPremium += (opt.totalCost || 0);
        } else {
            longContracts += qty;
            longDebit += (opt.totalCost || 0);
            netPremium -= (opt.totalCost || 0);
        }
    });

    return {
        count: holdings.length,
        totalContracts,
        shortContracts,
        longContracts,
        netPremium,
        shortPremium,
        longDebit
    };
}

export function computeRealizedOptionsRecords(
    transactions: Transaction[],
    resolveTickerFn: (t: string) => string = resolveTicker
): RealizedOptionRecord[] {
    const records: RealizedOptionRecord[] = [];
    const optMap: Record<string, { quantity: number; avgCost: number; positionType: 'Long' | 'Short' | null }> = {};
    const chronTransactions = [...transactions]
        .filter(tx => tx.assetType === 'Option' || tx.assetType === 'Spread')
        .sort(compareChronologicalAscending);

    chronTransactions.forEach(tx => {
        const key = getTrackingKey(tx, resolveTickerFn);
        if (!optMap[key]) {
            optMap[key] = { quantity: 0, avgCost: 0, positionType: null };
        }
        const h = optMap[key];

        if (tx.action === 'Buy to Open') {
            h.positionType = 'Long';
            h.quantity += tx.quantity;
            h.avgCost = ((h.quantity - tx.quantity) * h.avgCost * 100 + tx.quantity * tx.price * 100 + (tx.fee || 0)) / (h.quantity * 100);
        } else if (tx.action === 'Sell to Close') {
            const profit = (tx.price - h.avgCost) * tx.quantity * 100 - (tx.fee || 0);
            const entryCost = h.avgCost;
            records.push({
                id: tx.id || `rec_${records.length}`,
                date: tx.date,
                year: tx.date ? tx.date.substring(0, 4) : '',
                ticker: resolveTickerFn(tx.ticker),
                assetType: tx.assetType,
                optionType: (tx.optionType as any) || '',
                strike: tx.strike,
                expiration: tx.expiration,
                strategyName: tx.strategyName || '',
                positionType: 'Long',
                action: tx.action,
                originalAction: tx.originalAction || tx.action,
                closingType: 'Close',
                quantity: tx.quantity,
                entryPrice: entryCost,
                closePrice: tx.price,
                fee: tx.fee || 0,
                profit: profit,
                returnPct: entryCost > 0 ? ((tx.price - entryCost) / entryCost) * 100 : 0
            });
            h.quantity -= tx.quantity;
        } else if (tx.action === 'Sell to Open') {
            h.positionType = 'Short';
            h.quantity += tx.quantity;
            h.avgCost = ((h.quantity - tx.quantity) * h.avgCost * 100 + tx.quantity * tx.price * 100 - (tx.fee || 0)) / (h.quantity * 100);
        } else if (tx.action === 'Buy to Close') {
            const profit = (h.avgCost - tx.price) * tx.quantity * 100 - (tx.fee || 0);
            const entryCost = h.avgCost;
            records.push({
                id: tx.id || `rec_${records.length}`,
                date: tx.date,
                year: tx.date ? tx.date.substring(0, 4) : '',
                ticker: resolveTickerFn(tx.ticker),
                assetType: tx.assetType,
                optionType: (tx.optionType as any) || '',
                strike: tx.strike,
                expiration: tx.expiration,
                strategyName: tx.strategyName || '',
                positionType: 'Short',
                action: tx.action,
                originalAction: tx.originalAction || tx.action,
                closingType: 'Close',
                quantity: tx.quantity,
                entryPrice: entryCost,
                closePrice: tx.price,
                fee: tx.fee || 0,
                profit: profit,
                returnPct: entryCost > 0 ? ((entryCost - tx.price) / entryCost) * 100 : 0
            });
            h.quantity -= tx.quantity;
        } else if (['Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action)) {
            let profit = 0;
            const closePrice = tx.price || 0;
            const entryCost = h.avgCost;
            let retPct = 0;
            if (h.positionType === 'Long') {
                profit = (closePrice - entryCost) * tx.quantity * 100 - (tx.fee || 0);
                retPct = entryCost > 0 ? ((closePrice - entryCost) / entryCost) * 100 : -100;
            } else if (h.positionType === 'Short') {
                profit = (entryCost - closePrice) * tx.quantity * 100 - (tx.fee || 0);
                retPct = entryCost > 0 ? ((entryCost - closePrice) / entryCost) * 100 : 100;
            }

            const orig = (tx.originalAction || tx.action || '').toLowerCase();
            let cType: 'Close' | 'Expired' | 'Assigned' = 'Expired';
            if (orig.includes('assign') || orig.includes('exercise')) {
                cType = 'Assigned';
            }

            records.push({
                id: tx.id || `rec_${records.length}`,
                date: tx.date,
                year: tx.date ? tx.date.substring(0, 4) : '',
                ticker: resolveTickerFn(tx.ticker),
                assetType: tx.assetType,
                optionType: (tx.optionType as any) || '',
                strike: tx.strike,
                expiration: tx.expiration,
                strategyName: tx.strategyName || '',
                positionType: h.positionType || 'Short',
                action: tx.action,
                originalAction: tx.originalAction || tx.action,
                closingType: cType,
                quantity: tx.quantity,
                entryPrice: entryCost,
                closePrice: closePrice,
                fee: tx.fee || 0,
                profit: profit,
                returnPct: retPct
            });
            h.quantity -= tx.quantity;
        }
    });

    return records;
}
