export type AssetType = 'Stock' | 'Option' | 'Spread';

export type TransactionAction =
    | 'Buy'
    | 'Sell'
    | 'Buy to Open'
    | 'Sell to Open'
    | 'Buy to Close'
    | 'Sell to Close'
    | 'Expire'
    | 'Expired'
    | 'Assigned'
    | 'Exchange or Exercise'
    | 'Stock Split'
    | 'Security Transfer';

export type OptionType = 'Call' | 'Put';

export interface Transaction {
    id: string | number;
    date: string;
    time?: string;
    rawIndex?: number;
    assetType: AssetType;
    ticker: string;
    action: TransactionAction;
    originalAction?: string;
    quantity: number;
    price: number;
    fee?: number;
    optionType?: OptionType | null;
    strike?: number | string | null;
    expiration?: string | null;
    strategyName?: string | null;
    totalValue?: number;
    notes?: string;
}

export type CostBasisMethod = 'FIFO' | 'LIFO' | 'HIFO' | 'AVG';

export interface StockLot {
    quantity: number;
    unitCost: number;
    totalCost: number;
    order: number;
    date?: string;
}

export interface StockHolding {
    symbol: string;
    quantity: number;
    totalCost: number;
    avgCost: number;
    currentPrice: number;
    marketValue: number;
    unrealizedPL: number;
    unrealizedPercent: number;
}

export interface RealizedStockRecord {
    id: string | number;
    date: string;
    year: string;
    ticker: string;
    quantity: number;
    entryPrice: number;
    closePrice: number;
    costBasis: number;
    proceeds: number;
    fee: number;
    profit: number;
    returnPct: number;
}

export interface OptionHolding {
    key: string;
    symbol: string;
    assetType: AssetType;
    optionType: OptionType | null;
    strike: number | string | null;
    expiration: string | null;
    strategyName: string | null;
    quantity: number;
    totalCost: number;
    avgCost: number;
    positionType: 'Long' | 'Short';
}

export interface RealizedOptionRecord {
    id: string | number;
    date: string;
    year: string;
    ticker: string;
    assetType: AssetType;
    optionType: OptionType | '';
    strike?: number | string | null;
    expiration?: string | null;
    strategyName?: string | null;
    positionType: 'Long' | 'Short';
    action: TransactionAction;
    originalAction?: string;
    closingType: 'Close' | 'Expired' | 'Assigned';
    quantity: number;
    entryPrice: number;
    closePrice: number;
    fee: number;
    profit: number;
    returnPct: number;
}

export interface OpenOptionsSummary {
    count: number;
    totalContracts: number;
    shortContracts: number;
    longContracts: number;
    netPremium: number;
    shortPremium: number;
    longDebit: number;
}

export interface MonthlyHeatmapCell {
    year: number;
    month: number; // 0-11
    realizedPL: number;
    percentage?: number;
}
