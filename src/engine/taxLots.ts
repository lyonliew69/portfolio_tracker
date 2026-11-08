import type {
    CostBasisMethod,
    RealizedStockRecord,
    StockHolding,
    StockLot,
    Transaction
} from '../types/portfolio';
import { compareChronologicalAscending, resolveTicker } from './sorting';

export function computeStockHoldings(
    transactions: Transaction[],
    marketPrices: Record<string, number> = {},
    method: CostBasisMethod = 'FIFO',
    resolveTickerFn: (ticker: string) => string = resolveTicker
): StockHolding[] {
    const chronTransactions = [...transactions]
        .filter(tx => tx.assetType === 'Stock')
        .sort(compareChronologicalAscending);

    if (method === 'AVG') {
        const stockMap: Record<string, { symbol: string; quantity: number; totalCost: number; avgCost: number }> = {};
        chronTransactions.forEach(tx => {
            const ticker = resolveTickerFn(tx.ticker);
            if (!stockMap[ticker]) {
                stockMap[ticker] = { symbol: ticker, quantity: 0, totalCost: 0, avgCost: 0 };
            }
            const stock = stockMap[ticker];

            if (tx.action === 'Buy') {
                stock.quantity += tx.quantity;
                stock.totalCost += (tx.quantity * tx.price) + (tx.fee || 0);
                stock.avgCost = stock.quantity > 0 ? (stock.totalCost / stock.quantity) : 0;
            } else if (tx.action === 'Sell') {
                const costBasisSold = tx.quantity * stock.avgCost;
                stock.quantity -= tx.quantity;
                stock.totalCost -= costBasisSold;
                if (stock.quantity <= 0.0001) {
                    stock.quantity = 0;
                    stock.totalCost = 0;
                    stock.avgCost = 0;
                }
            }
        });

        return Object.values(stockMap)
            .filter(s => s.quantity > 0.0001)
            .map(s => {
                const currentPrice = marketPrices[s.symbol] ?? s.avgCost;
                const marketValue = s.quantity * currentPrice;
                const unrealizedPL = marketValue - s.totalCost;
                const unrealizedPercent = s.totalCost > 0 ? (unrealizedPL / s.totalCost) * 100 : 0;
                return {
                    ...s,
                    currentPrice,
                    marketValue,
                    unrealizedPL,
                    unrealizedPercent
                };
            });
    }

    // FIFO, LIFO, or HIFO Tax Lot Accounting
    const lotsMap: Record<string, StockLot[]> = {};
    chronTransactions.forEach(tx => {
        const ticker = resolveTickerFn(tx.ticker);
        if (!lotsMap[ticker]) lotsMap[ticker] = [];
        const lots = lotsMap[ticker];

        if (tx.action === 'Buy') {
            const isStockSplit = tx.originalAction === 'Stock Split' || (tx as any).action === 'Stock Split';
            if (isStockSplit) {
                const currentOpenShares = lots.reduce((sum, l) => sum + l.quantity, 0);
                if (currentOpenShares > 0.0001) {
                    const splitRatio = (currentOpenShares + tx.quantity) / currentOpenShares;
                    lots.forEach(lot => {
                        lot.quantity *= splitRatio;
                        lot.unitCost /= splitRatio;
                        lot.totalCost = lot.quantity * lot.unitCost;
                    });
                    return;
                }
            }

            const unitCost = tx.quantity > 0 ? (tx.price + ((tx.fee || 0) / tx.quantity)) : tx.price;
            lots.push({
                quantity: tx.quantity,
                unitCost: unitCost,
                totalCost: (tx.quantity * tx.price) + (tx.fee || 0),
                order: lots.length,
                date: tx.date
            });
        } else if (tx.action === 'Sell') {
            let needed = tx.quantity;
            if (method === 'HIFO') {
                lots.sort((a, b) => (b.unitCost - a.unitCost) || (a.order - b.order));
            }
            while (needed > 0.000001 && lots.length > 0) {
                const targetLot = (method === 'FIFO' || method === 'HIFO') ? lots[0] : lots[lots.length - 1];
                if (targetLot.quantity <= needed + 0.000001) {
                    needed -= targetLot.quantity;
                    if (method === 'FIFO' || method === 'HIFO') lots.shift();
                    else lots.pop();
                } else {
                    targetLot.quantity -= needed;
                    targetLot.totalCost = targetLot.quantity * targetLot.unitCost;
                    needed = 0;
                }
            }
        }
    });

    const holdings: StockHolding[] = [];
    Object.keys(lotsMap).forEach(ticker => {
        const lots = lotsMap[ticker];
        const quantity = lots.reduce((sum, l) => sum + l.quantity, 0);
        if (quantity > 0.0001) {
            const totalCost = lots.reduce((sum, l) => sum + l.totalCost, 0);
            const avgCost = quantity > 0 ? (totalCost / quantity) : 0;
            const currentPrice = marketPrices[ticker] ?? avgCost;
            const marketValue = quantity * currentPrice;
            const unrealizedPL = marketValue - totalCost;
            const unrealizedPercent = totalCost > 0 ? (unrealizedPL / totalCost) * 100 : 0;
            holdings.push({
                symbol: ticker,
                quantity,
                totalCost,
                avgCost,
                currentPrice,
                marketValue,
                unrealizedPL,
                unrealizedPercent
            });
        }
    });

    return holdings;
}

export function computeRealizedStockRecords(
    transactions: Transaction[],
    method: CostBasisMethod = 'FIFO',
    resolveTickerFn: (ticker: string) => string = resolveTicker
): RealizedStockRecord[] {
    const chronTransactions = [...transactions]
        .filter(tx => tx.assetType === 'Stock')
        .sort(compareChronologicalAscending);

    const records: RealizedStockRecord[] = [];

    if (method === 'AVG') {
        const stockMap: Record<string, { quantity: number; totalCost: number; avgCost: number }> = {};
        chronTransactions.forEach(tx => {
            const ticker = resolveTickerFn(tx.ticker);
            if (!stockMap[ticker]) stockMap[ticker] = { quantity: 0, totalCost: 0, avgCost: 0 };
            const stock = stockMap[ticker];

            if (tx.action === 'Buy') {
                stock.quantity += tx.quantity;
                stock.totalCost += (tx.quantity * tx.price) + (tx.fee || 0);
                stock.avgCost = stock.quantity > 0 ? (stock.totalCost / stock.quantity) : 0;
            } else if (tx.action === 'Sell') {
                const costBasisSold = tx.quantity * stock.avgCost;
                const proceeds = (tx.quantity * tx.price) - (tx.fee || 0);
                const profit = proceeds - costBasisSold;
                const entryCostPerShare = stock.avgCost;

                records.push({
                    id: tx.id || `stock_rec_${records.length}`,
                    date: tx.date,
                    year: tx.date ? tx.date.substring(0, 4) : '',
                    ticker: ticker,
                    quantity: tx.quantity,
                    entryPrice: entryCostPerShare,
                    closePrice: tx.price,
                    costBasis: costBasisSold,
                    proceeds: proceeds,
                    fee: tx.fee || 0,
                    profit: profit,
                    returnPct: costBasisSold > 0 ? (profit / costBasisSold) * 100 : 0
                });

                stock.quantity -= tx.quantity;
                stock.totalCost -= costBasisSold;
                if (stock.quantity <= 0.0001) {
                    stock.quantity = 0;
                    stock.totalCost = 0;
                    stock.avgCost = 0;
                } else {
                    stock.avgCost = stock.totalCost / stock.quantity;
                }
            }
        });
        return records;
    }

    // FIFO, LIFO, or HIFO
    const lotsMap: Record<string, StockLot[]> = {};
    chronTransactions.forEach(tx => {
        const ticker = resolveTickerFn(tx.ticker);
        if (!lotsMap[ticker]) lotsMap[ticker] = [];
        const lots = lotsMap[ticker];

        if (tx.action === 'Buy') {
            const isStockSplit = tx.originalAction === 'Stock Split' || (tx as any).action === 'Stock Split';
            if (isStockSplit) {
                const currentOpenShares = lots.reduce((sum, l) => sum + l.quantity, 0);
                if (currentOpenShares > 0.0001) {
                    const splitRatio = (currentOpenShares + tx.quantity) / currentOpenShares;
                    lots.forEach(lot => {
                        lot.quantity *= splitRatio;
                        lot.unitCost /= splitRatio;
                        lot.totalCost = lot.quantity * lot.unitCost;
                    });
                    return;
                }
            }

            const unitCost = tx.quantity > 0 ? (tx.price + ((tx.fee || 0) / tx.quantity)) : tx.price;
            lots.push({
                quantity: tx.quantity,
                unitCost: unitCost,
                totalCost: (tx.quantity * tx.price) + (tx.fee || 0),
                order: lots.length,
                date: tx.date
            });
        } else if (tx.action === 'Sell') {
            let needed = tx.quantity;
            let costBasisSold = 0;
            if (method === 'HIFO') {
                lots.sort((a, b) => (b.unitCost - a.unitCost) || (a.order - b.order));
            }
            while (needed > 0.000001 && lots.length > 0) {
                const targetLot = (method === 'FIFO' || method === 'HIFO') ? lots[0] : lots[lots.length - 1];
                if (targetLot.quantity <= needed + 0.000001) {
                    needed -= targetLot.quantity;
                    costBasisSold += targetLot.totalCost;
                    if (method === 'FIFO' || method === 'HIFO') lots.shift();
                    else lots.pop();
                } else {
                    const costChunk = needed * targetLot.unitCost;
                    costBasisSold += costChunk;
                    targetLot.quantity -= needed;
                    targetLot.totalCost -= costChunk;
                    needed = 0;
                }
            }

            const proceeds = (tx.quantity * tx.price) - (tx.fee || 0);
            const profit = proceeds - costBasisSold;
            const entryCostPerShare = tx.quantity > 0 ? (costBasisSold / tx.quantity) : 0;
            records.push({
                id: tx.id || `stock_rec_${records.length}`,
                date: tx.date,
                year: tx.date ? tx.date.substring(0, 4) : '',
                ticker: ticker,
                quantity: tx.quantity,
                entryPrice: entryCostPerShare,
                closePrice: tx.price,
                costBasis: costBasisSold,
                proceeds: proceeds,
                fee: tx.fee || 0,
                profit: profit,
                returnPct: costBasisSold > 0 ? (profit / costBasisSold) * 100 : 0
            });
        }
    });

    return records;
}
