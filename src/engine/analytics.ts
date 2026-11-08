import type { RealizedOptionRecord, RealizedStockRecord } from '../types/portfolio';

export interface PerformanceMonth {
    key: string; // "YYYY-MM"
    year: string;
    monthIndex: number; // 0-11
    label: string;
    shortMonth: string;
    profit: number;
    trades: number;
    cumulative: number;
}

export interface HeatmapMatrixRow {
    year: string;
    months: {
        monthIndex: number;
        monthName: string;
        profit: number;
        trades: number;
        hasActivity: boolean;
    }[];
    totalPL: number;
    trades: number;
    winRate: number;
}

export interface AnalyticsStats {
    totalPL: number;
    bestMonth: PerformanceMonth | null;
    worstMonth: PerformanceMonth | null;
    winMonths: number;
    activeMonths: number;
    winRate: number;
}

export function computeMonthlyPerformance(
    stockRecords: RealizedStockRecord[],
    optionRecords: RealizedOptionRecord[],
    assetFilter: 'all' | 'stock' | 'option' = 'all',
    yearFilter: string = 'ALL'
): { months: PerformanceMonth[]; stats: AnalyticsStats } {
    let records: { date: string; year: string; profit: number }[] = [];
    if (assetFilter === 'all' || assetFilter === 'stock') {
        records = records.concat(stockRecords);
    }
    if (assetFilter === 'all' || assetFilter === 'option') {
        records = records.concat(optionRecords);
    }

    if (records.length === 0) {
        return {
            months: [],
            stats: { totalPL: 0, bestMonth: null, worstMonth: null, winMonths: 0, activeMonths: 0, winRate: 0 }
        };
    }

    const filteredRecords = yearFilter === 'ALL'
        ? records
        : records.filter(r => r.year === yearFilter);

    const monthMap: Record<string, PerformanceMonth> = {};
    const years = Array.from(new Set(records.map(r => r.year).filter(Boolean))).sort();

    let startYear = years.length > 0 ? parseInt(years[0], 10) : new Date().getFullYear();
    let endYear = years.length > 0 ? parseInt(years[years.length - 1], 10) : new Date().getFullYear();

    if (yearFilter !== 'ALL') {
        startYear = parseInt(yearFilter, 10);
        endYear = parseInt(yearFilter, 10);
    }

    for (let y = startYear; y <= endYear; y++) {
        const maxM = (y === new Date().getFullYear()) ? (new Date().getMonth() + 1) : 12;
        for (let m = 1; m <= maxM; m++) {
            const key = `${y}-${String(m).padStart(2, '0')}`;
            const dateObj = new Date(y, m - 1, 1);
            monthMap[key] = {
                key,
                year: String(y),
                monthIndex: m - 1,
                label: dateObj.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                shortMonth: dateObj.toLocaleDateString(undefined, { month: 'short' }),
                profit: 0,
                trades: 0,
                cumulative: 0
            };
        }
    }

    filteredRecords.forEach(r => {
        if (!r.date) return;
        const key = r.date.substring(0, 7);
        if (!monthMap[key]) {
            const [yStr, mStr] = key.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10);
            const dateObj = new Date(y, m - 1, 1);
            monthMap[key] = {
                key,
                year: yStr,
                monthIndex: m - 1,
                label: dateObj.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
                shortMonth: dateObj.toLocaleDateString(undefined, { month: 'short' }),
                profit: 0,
                trades: 0,
                cumulative: 0
            };
        }
        monthMap[key].profit += r.profit;
        monthMap[key].trades += 1;
    });

    const monthList = Object.values(monthMap).sort((a, b) => a.key.localeCompare(b.key));

    let runningTotal = 0;
    let bestMonth: PerformanceMonth | null = null;
    let worstMonth: PerformanceMonth | null = null;
    let winMonths = 0;
    let activeMonths = 0;

    monthList.forEach(m => {
        runningTotal += m.profit;
        m.cumulative = runningTotal;

        if (m.trades > 0) {
            activeMonths++;
            if (m.profit > 0) winMonths++;
            if (!bestMonth || m.profit > bestMonth.profit) bestMonth = m;
            if (!worstMonth || m.profit < worstMonth.profit) worstMonth = m;
        }
    });

    return {
        months: monthList,
        stats: {
            totalPL: runningTotal,
            bestMonth,
            worstMonth,
            winMonths,
            activeMonths,
            winRate: activeMonths > 0 ? (winMonths / activeMonths) * 100 : 0
        }
    };
}

export function computeHeatmapMatrix(
    stockRecords: RealizedStockRecord[],
    optionRecords: RealizedOptionRecord[],
    availableYears: string[],
    assetFilter: 'all' | 'stock' | 'option' = 'all'
): HeatmapMatrixRow[] {
    let records: (RealizedStockRecord | RealizedOptionRecord)[] = [];
    if (assetFilter === 'all' || assetFilter === 'stock') {
        records = records.concat(stockRecords);
    }
    if (assetFilter === 'all' || assetFilter === 'option') {
        records = records.concat(optionRecords);
    }
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const matrix: HeatmapMatrixRow[] = [];

    availableYears.forEach(y => {
        const yearRecords = records.filter(r => r.year === y);
        const months = [];
        let yearTotal = 0;
        let yearWins = 0;
        let activeMonthsCount = 0;
        let yearTrades = 0;

        for (let m = 0; m < 12; m++) {
            const mKey = `${y}-${String(m + 1).padStart(2, '0')}`;
            const mRecords = yearRecords.filter(r => r.date && r.date.startsWith(mKey));
            const mProfit = mRecords.reduce((sum, r) => sum + r.profit, 0);
            const mTrades = mRecords.length;

            if (mTrades > 0) {
                yearTrades += mTrades;
                activeMonthsCount++;
                if (mProfit > 0) yearWins++;
            }
            yearTotal += mProfit;

            months.push({
                monthIndex: m,
                monthName: monthNames[m],
                profit: mProfit,
                trades: mTrades,
                hasActivity: mTrades > 0
            });
        }

        matrix.push({
            year: y,
            months,
            totalPL: yearTotal,
            trades: yearTrades,
            winRate: activeMonthsCount > 0 ? (yearWins / activeMonthsCount) * 100 : 0
        });
    });

    return matrix;
}
