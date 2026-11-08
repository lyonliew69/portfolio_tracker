import type { Transaction } from '../types/portfolio';

export function getTransactionSignature(t: Transaction): string {
    const qty = Number(t.quantity || 0).toFixed(4);
    const prc = Number(t.price || 0).toFixed(4);
    const ticker = (t.ticker || '').toUpperCase();

    if (t.assetType === 'Stock') {
        return `STOCK_${t.date}_${ticker}_${t.action}_${qty}_${prc}`;
    } else if (t.assetType === 'Option') {
        return `OPTION_${t.date}_${ticker}_${t.action}_${t.optionType}_${t.strike}_${t.expiration}_${qty}_${prc}`;
    } else {
        return `SPREAD_${t.date}_${ticker}_${t.action}_${(t.strategyName || '').toUpperCase()}_${qty}_${prc}`;
    }
}

export function mergeWithMultisetDeduplication(
    existing: Transaction[],
    incoming: Transaction[]
): {
    merged: Transaction[];
    added: Transaction[];
    duplicates: Transaction[];
    addedCount: number;
    duplicateCount: number;
} {
    const existingFreq = new Map<string, number>();
    existing.forEach(t => {
        const sig = getTransactionSignature(t);
        existingFreq.set(sig, (existingFreq.get(sig) || 0) + 1);
    });

    const added: Transaction[] = [];
    const duplicates: Transaction[] = [];

    incoming.forEach(t => {
        const sig = getTransactionSignature(t);
        const count = existingFreq.get(sig) || 0;
        if (count > 0) {
            existingFreq.set(sig, count - 1);
            duplicates.push(t);
        } else {
            added.push(t);
        }
    });

    return {
        merged: [...existing, ...added],
        added,
        duplicates,
        addedCount: added.length,
        duplicateCount: duplicates.length
    };
}
