import { compareChronologicalAscending, resolveTicker } from '../engine/sorting';
import type { Transaction } from '../types/portfolio';

export interface DetectedTransfer {
    key: string;
    ticker: string;
    date: string;
    assetType: 'Stock' | 'Option';
    optionDetails: string;
    quantity: number;
    price: number;
    marketValue?: number;
    sourceLabel: string;
    status: 'ready' | 'searching';
}

export interface SchwabParseResult {
    fileName: string;
    fromDate: string;
    toDate: string;
    transactions: Transaction[];
    skipped: any[];
    skippedBreakdown: Record<string, number>;
    detectedTransfers: DetectedTransfer[];
    stockCount: number;
    optionCount: number;
    aliasMappedCount: number;
    stats: {
        total: number;
        trades: number;
        stocks: number;
        options: number;
        transfers: number;
        skipped: number;
        aliasMapped: number;
    };
}

export function parseSchwabContent(
    content: string,
    fileName: string,
    options: {
        customTransferPrices?: Record<string, number>;
        resolveTickerFn?: (t: string) => string;
    } = {}
): SchwabParseResult {
    const { customTransferPrices = {}, resolveTickerFn = resolveTicker } = options;
    const isJson = fileName.toLowerCase().endsWith('.json') || content.trim().startsWith('{');
    const isXml = fileName.toLowerCase().endsWith('.xml') || content.trim().startsWith('<');

    if (!isJson && !isXml) {
        throw new Error('Unsupported file format. Please upload a Schwab JSON or XML report.');
    }

    let fromDate = '';
    let toDate = '';
    let rawTransactions: any[] = [];

    if (isJson) {
        const data = JSON.parse(content);
        fromDate = data.FromDate || '';
        toDate = data.ToDate || '';
        rawTransactions = Array.isArray(data.BrokerageTransactions) ? data.BrokerageTransactions : [];
    } else {
        // Universal XML extraction
        const fromMatch = content.match(/<FromDate>([^<]+)<\/FromDate>/i);
        const toMatch = content.match(/<ToDate>([^<]+)<\/ToDate>/i);
        fromDate = fromMatch ? fromMatch[1].trim() : '';
        toDate = toMatch ? toMatch[1].trim() : '';

        const txBlockRegex = /<BrokerageTransaction>([\s\S]*?)<\/BrokerageTransaction>/gi;
        let match;
        while ((match = txBlockRegex.exec(content)) !== null) {
            const block = match[1];
            const getTag = (tag: string) => {
                const m = block.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`, 'i'));
                return m ? m[1].trim() : '';
            };
            rawTransactions.push({
                Date: getTag('Date'),
                Action: getTag('Action'),
                Symbol: getTag('Symbol'),
                Description: getTag('Description'),
                Quantity: getTag('Quantity'),
                Price: getTag('Price'),
                FeesAndCommission: getTag('FeesAndCommission') || getTag('FeesAndComm'),
                Amount: getTag('Amount')
            });
        }
    }

    const optRegex = /^([A-Z0-9\.]+)\s+(\d{2}\/\d{2}\/\d{4})\s+([\d\.]+)\s+([CP])$/;
    const detectedTransfersMap: Record<string, DetectedTransfer> = {};
    const parsed: Transaction[] = [];
    const skipped: any[] = [];
    const skippedBreakdown: Record<string, number> = {};
    let aliasMappedCount = 0;

    for (let i = 0; i < rawTransactions.length; i++) {
        const raw = rawTransactions[i];
        const rawDate = (raw.Date || '').trim();
        const effDate = rawDate.includes('as of') ? rawDate.split('as of')[1].trim() : rawDate;
        const [m, d, y] = effDate.split('/');
        const date = (m && d && y) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : effDate;

        const action = (raw.Action || '').trim();
        const rawSymbol = (raw.Symbol || '').trim();
        const qty = Math.abs(parseFloat((raw.Quantity || '0').replace(/[^0-9.-]+/g, '')) || 0);
        const price = parseFloat((raw.Price || '0').replace(/[^0-9.-]+/g, '')) || 0;
        const fee = parseFloat((raw['Fees & Comm'] || raw.FeesAndCommission || '0').replace(/[^0-9.-]+/g, '')) || 0;

        if (optRegex.test(rawSymbol)) {
            const match = rawSymbol.match(optRegex)!;
            const rawOptTicker = match[1].toUpperCase();
            const ticker = resolveTickerFn(rawOptTicker);
            if (rawOptTicker !== ticker) aliasMappedCount++;

            const [expM, expD, expY] = match[2].split('/');
            const expiration = `${expY}-${expM.padStart(2, '0')}-${expD.padStart(2, '0')}`;
            const strike = parseFloat(match[3]);
            const optionType = match[4] === 'C' ? 'Call' : 'Put';

            let mappedAction = action;
            let effPrice = price;
            const transferKey = `${ticker}_${date}`;

            if (['Expired', 'Assigned', 'Exchange or Exercise'].includes(action)) {
                mappedAction = 'Expire';
            } else if (action === 'Security Transfer') {
                mappedAction = 'Buy to Open';
                let sourceLabel = 'Pending Input';
                if (effPrice === 0) {
                    if (customTransferPrices[transferKey] !== undefined) {
                        effPrice = Number(customTransferPrices[transferKey]) || 0;
                        sourceLabel = 'Saved / Custom';
                    }
                } else {
                    sourceLabel = 'Statement Price';
                }

                if (!detectedTransfersMap[transferKey]) {
                    detectedTransfersMap[transferKey] = {
                        key: transferKey,
                        ticker,
                        date,
                        assetType: 'Option',
                        optionDetails: `${optionType} $${strike} Exp ${expiration}`,
                        quantity: qty,
                        price: effPrice,
                        sourceLabel,
                        status: 'ready'
                    };
                } else {
                    detectedTransfersMap[transferKey].quantity += qty;
                }
            }

            const gross = qty * effPrice * 100;
            const totalValue = ['Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(mappedAction)
                ? (gross + fee)
                : (gross - fee);

            parsed.push({
                rawIndex: i,
                id: `schwab_${date.replace(/-/g, '')}_${i}`,
                date,
                assetType: 'Option',
                ticker,
                action: mappedAction as any,
                originalAction: action,
                quantity: qty,
                price: effPrice,
                fee,
                optionType,
                strike,
                expiration,
                strategyName: '',
                totalValue
            });
        } else if (action === 'Buy' || action === 'Sell' || ((action === 'Security Transfer' || action === 'Stock Split') && rawSymbol && qty > 0)) {
            const rawStockTicker = rawSymbol.toUpperCase();
            const ticker = resolveTickerFn(rawStockTicker);
            if (rawStockTicker !== ticker) aliasMappedCount++;

            let mappedAction = action;
            let effPrice = price;
            const transferKey = `${ticker}_${date}`;

            if (action === 'Security Transfer') {
                mappedAction = 'Buy';
                let sourceLabel = 'Pending Input';
                if (effPrice === 0) {
                    if (customTransferPrices[transferKey] !== undefined) {
                        effPrice = Number(customTransferPrices[transferKey]) || 0;
                        sourceLabel = 'Saved / Custom';
                    }
                } else {
                    sourceLabel = 'Statement Price';
                }

                if (!detectedTransfersMap[transferKey]) {
                    detectedTransfersMap[transferKey] = {
                        key: transferKey,
                        ticker,
                        date,
                        assetType: 'Stock',
                        optionDetails: '',
                        quantity: qty,
                        price: effPrice,
                        sourceLabel,
                        status: 'ready'
                    };
                } else {
                    detectedTransfersMap[transferKey].quantity += qty;
                }
            } else if (action === 'Stock Split') {
                mappedAction = 'Buy';
                effPrice = 0.00;
            }

            const gross = qty * effPrice;
            const totalValue = mappedAction === 'Buy' ? (gross + fee) : (gross - fee);

            parsed.push({
                rawIndex: i,
                id: `schwab_${date.replace(/-/g, '')}_${i}`,
                date,
                assetType: 'Stock',
                ticker,
                action: mappedAction as any,
                originalAction: action,
                quantity: qty,
                price: effPrice,
                fee,
                optionType: 'Call',
                strike: null,
                expiration: '',
                strategyName: '',
                totalValue
            });
        } else {
            skipped.push(raw);
            skippedBreakdown[action] = (skippedBreakdown[action] || 0) + 1;
        }
    }

    parsed.sort(compareChronologicalAscending);

    let stockCount = 0;
    let optionCount = 0;
    parsed.forEach(p => {
        if (p.assetType === 'Stock') stockCount++;
        else if (p.assetType === 'Option') optionCount++;
    });

    const detectedTransfers = Object.values(detectedTransfersMap);

    return {
        fileName,
        fromDate,
        toDate,
        transactions: parsed,
        skipped,
        skippedBreakdown,
        detectedTransfers,
        stockCount,
        optionCount,
        aliasMappedCount,
        stats: {
            total: rawTransactions.length,
            trades: parsed.length,
            stocks: stockCount,
            options: optionCount,
            transfers: detectedTransfers.length,
            skipped: skipped.length,
            aliasMapped: aliasMappedCount
        }
    };
}
