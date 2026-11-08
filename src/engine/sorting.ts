import type { Transaction, TransactionAction } from '../types/portfolio';

export function resolveTicker(ticker?: string | null): string {
    return (ticker || '').trim().toUpperCase();
}

export function getActionPriority(act: TransactionAction | string): number {
    // Inbound / Opening actions must precede Outbound / Closing actions on the same day
    if (['Buy', 'Buy to Open', 'Sell to Open', 'Security Transfer', 'Stock Split'].includes(act)) {
        return 1;
    }
    if (['Sell', 'Sell to Close', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(act)) {
        return 2;
    }
    return 3;
}

export function compareChronologicalAscending(a: Transaction, b: Transaction): number {
    const dDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
    if (dDiff !== 0) return dDiff;

    if (a.time && b.time) {
        const tDiff = a.time.localeCompare(b.time);
        if (tDiff !== 0) return tDiff;
    }

    if (a.rawIndex !== undefined && b.rawIndex !== undefined) {
        return b.rawIndex - a.rawIndex;
    }

    const matchA = typeof a.id === 'string' ? a.id.match(/_(\d+)$/) : null;
    const matchB = typeof b.id === 'string' ? b.id.match(/_(\d+)$/) : null;
    if (matchA && matchB) {
        return parseInt(matchB[1], 10) - parseInt(matchA[1], 10);
    }

    const pDiff = getActionPriority(a.action) - getActionPriority(b.action);
    if (pDiff !== 0) return pDiff;

    if (typeof a.id === 'number' && typeof b.id === 'number') {
        return a.id - b.id;
    }

    return 0;
}
