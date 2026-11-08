import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
    computeOpenOptionsSummary,
    computeOptionHoldings,
    computeRealizedOptionsRecords
} from '../engine/optionsEngine';
import {
    computeRealizedStockRecords,
    computeStockHoldings
} from '../engine/taxLots';
import { showNotification } from '../services/notification';
import {
    getStoredFileHandle,
    loadFromLocalStorage,
    pickLocalFile,
    readFile,
    removeStoredFileHandle,
    saveToLocalStorage,
    setStoredFileHandle,
    verifyPermission,
    writeFile
} from '../services/storage';
import { useMarketStore } from './market';
import type {
    CostBasisMethod,
    OpenOptionsSummary,
    OptionHolding,
    RealizedOptionRecord,
    RealizedStockRecord,
    StockHolding,
    Transaction
} from '../types/portfolio';

function getLocalItem(key: string): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        // ignore
    }
    return null;
}

function setLocalItem(key: string, value: string): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, value);
        }
    } catch {
        // ignore
    }
}

export const usePortfolioStore = defineStore('portfolio', () => {
    // Core State
    const transactions = ref<Transaction[]>([]);
    const marketPrices = ref<Record<string, number>>({});
    try {
        const savedPrices = getLocalItem('tx_market_prices');
        if (savedPrices) marketPrices.value = JSON.parse(savedPrices);
    } catch {
        // ignore
    }

    function savePrices() {
        setLocalItem('tx_market_prices', JSON.stringify(marketPrices.value));
    }
    const costBasisMethod = ref<CostBasisMethod>(
        (getLocalItem('cost_basis_method') as CostBasisMethod) || 'FIFO'
    );
    const tickerAliases = ref<Record<string, string>>({});
    try {
        const savedAliases = getLocalItem('tx_ticker_aliases');
        if (savedAliases) tickerAliases.value = JSON.parse(savedAliases);
    } catch {
        // ignore
    }

    // Storage status
    const fileHandle = ref<FileSystemFileHandle | null>(null);
    const fileName = ref<string>('');
    const fileStatus = ref<'active' | 'locked' | 'unlinked'>('unlinked');
    const isLoading = ref<boolean>(false);

    // Cloud Webhook Sync State
    const cloudWebhookUrl = ref<string>(getLocalItem('cloud_webhook_url') || '');
    const cloudAutoSync = ref<boolean>(getLocalItem('cloud_auto_sync') === 'true');
    const cloudAutoPullOnLoad = ref<boolean>(getLocalItem('cloud_auto_pull_on_load') === 'true');
    const lastCloudSyncTime = ref<string>(getLocalItem('cloud_last_sync') || '');
    const isSyncingCloud = ref<boolean>(false);

    // Roll & Record Transaction State
    const showRecordTransaction = ref<boolean>(
        getLocalItem('show_record_transaction') !== 'false'
    );
    const isRolling = ref<boolean>(false);
    const rollStep = ref<1 | 2>(1);
    const rollSourceHolding = ref<OptionHolding | null>(null);

    // Helpers
    function resolveTicker(ticker?: string | null): string {
        const raw = (ticker || '').trim().toUpperCase();
        return tickerAliases.value[raw] || raw;
    }

    function setCostBasisMethod(method: CostBasisMethod) {
        costBasisMethod.value = method;
        setLocalItem('cost_basis_method', method);
    }

    function toggleRecordTransaction() {
        showRecordTransaction.value = !showRecordTransaction.value;
        setLocalItem('show_record_transaction', String(showRecordTransaction.value));
    }

    function addTickerAlias(from: string, to: string) {
        const cleanFrom = from.trim().toUpperCase();
        const cleanTo = to.trim().toUpperCase();
        if (!cleanFrom || !cleanTo || cleanFrom === cleanTo) return;
        tickerAliases.value = { ...tickerAliases.value, [cleanFrom]: cleanTo };
        setLocalItem('tx_ticker_aliases', JSON.stringify(tickerAliases.value));
        applyTickerAliasesToLedger(true);
        showNotification(`Added ticker mapping: ${cleanFrom} → ${cleanTo}`, 'success');
    }

    function removeTickerAlias(from: string) {
        const cleanFrom = from.trim().toUpperCase();
        const next = { ...tickerAliases.value };
        delete next[cleanFrom];
        tickerAliases.value = next;
        setLocalItem('tx_ticker_aliases', JSON.stringify(next));
        showNotification(`Removed ticker mapping for ${cleanFrom}`, 'info');
    }

    function applyTickerAliasesToLedger(showNotice = true) {
        let changed = 0;
        const next = transactions.value.map(tx => {
            const resolved = resolveTicker(tx.ticker);
            if (resolved !== tx.ticker) {
                if (marketPrices.value[tx.ticker] !== undefined && marketPrices.value[resolved] === undefined) {
                    marketPrices.value[resolved] = marketPrices.value[tx.ticker];
                }
                changed++;
                return { ...tx, ticker: resolved };
            }
            return tx;
        });

        if (changed > 0) {
            saveTransactions(next);
            if (showNotice) {
                showNotification(`Updated ${changed} transaction(s) to new ticker symbols in ledger.`, 'success');
            }
        } else if (showNotice) {
            showNotification('All transactions already use the latest ticker symbols.', 'info');
        }
    }

    // Computeds using Pure TypeScript Accounting Engine
    const stockHoldings = computed<StockHolding[]>(() => {
        return computeStockHoldings(transactions.value, marketPrices.value, costBasisMethod.value, resolveTicker);
    });

    const uniqueStockTickers = computed<string[]>(() => {
        const list = new Set<string>();
        const activeTickers = new Set(stockHoldings.value.map(h => h.symbol));
        const marketStore = useMarketStore();

        marketStore.manualWatchlistTickers.forEach(t => list.add(resolveTicker(t)));

        transactions.value.forEach(tx => {
            if (tx.assetType === 'Stock') {
                list.add(resolveTicker(tx.ticker));
            }
        });

        return Array.from(list)
            .filter(t => activeTickers.has(t) || !marketStore.hiddenTickers.includes(t))
            .sort((a, b) => a.localeCompare(b));
    });

    const optionHoldings = computed<OptionHolding[]>(() => {
        return computeOptionHoldings(transactions.value, resolveTicker);
    });

    const openOptionsSummary = computed<OpenOptionsSummary>(() => {
        return computeOpenOptionsSummary(optionHoldings.value);
    });

    const realizedStockRecords = computed<RealizedStockRecord[]>(() => {
        return computeRealizedStockRecords(transactions.value, costBasisMethod.value, resolveTicker);
    });

    const realizedOptionsRecords = computed<RealizedOptionRecord[]>(() => {
        return computeRealizedOptionsRecords(transactions.value, resolveTicker);
    });

    const realizedStockPL = computed<number>(() => {
        return realizedStockRecords.value.reduce((sum, r) => sum + r.profit, 0);
    });

    const realizedOptionsPL = computed<number>(() => {
        return realizedOptionsRecords.value.reduce((sum, r) => sum + r.profit, 0);
    });

    const totalRealizedPL = computed<number>(() => {
        return realizedStockPL.value + realizedOptionsPL.value;
    });

    const stockPortfolioValue = computed<number>(() => {
        return stockHoldings.value.reduce((sum, h) => sum + h.marketValue, 0);
    });

    const stockCostBasis = computed<number>(() => {
        return stockHoldings.value.reduce((sum, h) => sum + h.totalCost, 0);
    });

    const stockUnrealizedPL = computed<number>(() => {
        return stockPortfolioValue.value - stockCostBasis.value;
    });

    const totalPortfolioNetPL = computed<number>(() => {
        return totalRealizedPL.value + stockUnrealizedPL.value;
    });

    // CRUD Actions
    async function addTransaction(tx: Omit<Transaction, 'id'>) {
        const id = `tx_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const mult = tx.assetType === 'Stock' ? 1 : 100;
        const gross = (tx.quantity || 0) * (tx.price || 0) * mult;
        const fee = tx.fee || 0;
        const isInbound = ['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(tx.action);
        const totalValue = isInbound ? (gross + fee) : (gross - fee);

        const resolved = resolveTicker(tx.ticker);
        const newTx: Transaction = {
            ...tx,
            id,
            ticker: resolved,
            totalValue: Number(totalValue.toFixed(2))
        };

        const updated = [...transactions.value, newTx];
        await saveTransactions(updated);

        if (newTx.assetType === 'Stock' && !marketPrices.value[newTx.ticker]) {
            marketPrices.value[newTx.ticker] = newTx.price;
        }

        showNotification(`Recorded ${newTx.action} ${newTx.quantity} ${newTx.ticker}`, 'success');
        return newTx;
    }

    async function updateTransaction(updatedTx: Transaction) {
        const mult = updatedTx.assetType === 'Stock' ? 1 : 100;
        const gross = (updatedTx.quantity || 0) * (updatedTx.price || 0) * mult;
        const fee = updatedTx.fee || 0;
        const isInbound = ['Buy', 'Buy to Open', 'Buy to Close', 'Expire', 'Expired', 'Assigned', 'Exchange or Exercise'].includes(updatedTx.action);
        const totalValue = isInbound ? (gross + fee) : (gross - fee);

        const idx = transactions.value.findIndex(t => t.id === updatedTx.id);
        if (idx !== -1) {
            const next = [...transactions.value];
            next[idx] = {
                ...updatedTx,
                ticker: resolveTicker(updatedTx.ticker),
                totalValue: Number(totalValue.toFixed(2))
            };
            await saveTransactions(next);
            showNotification(`Updated transaction ${next[idx].ticker}`, 'success');
        }
    }

    async function deleteTransaction(id: string | number) {
        const target = transactions.value.find(t => t.id === id);
        const next = transactions.value.filter(t => t.id !== id);
        await saveTransactions(next);
        if (target) {
            showNotification(`Deleted transaction ${target.ticker}`, 'info');
        }
    }

    async function clearAllData() {
        await saveTransactions([]);
        marketPrices.value = {};
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('tx_market_prices');
        }
        showNotification('Cleared all transaction history.', 'warning');
    }

    // Roll State Actions
    function startRollOption(holding: OptionHolding) {
        isRolling.value = true;
        rollStep.value = 1;
        rollSourceHolding.value = holding;
        showRecordTransaction.value = true;
    }

    function cancelRoll() {
        isRolling.value = false;
        rollStep.value = 1;
        rollSourceHolding.value = null;
    }

    // Persistence Actions
    async function initStorage() {
        isLoading.value = true;
        try {
            const stored = await getStoredFileHandle();
            if (stored) {
                fileHandle.value = stored;
                fileName.value = stored.name;
                const ok = await verifyPermission(stored, false);
                if (ok) {
                    fileStatus.value = 'active';
                    transactions.value = await readFile(stored);
                } else {
                    fileStatus.value = 'locked';
                    transactions.value = loadFromLocalStorage();
                }
            } else {
                transactions.value = loadFromLocalStorage();
            }

            // Auto-pull from cloud on load if configured
            if (cloudWebhookUrl.value && cloudAutoPullOnLoad.value) {
                pullFromCloudWebhook(true);
            }
        } catch {
            transactions.value = loadFromLocalStorage();
        } finally {
            isLoading.value = false;
        }
    }

    async function linkFile() {
        try {
            const handle = await pickLocalFile();
            if (!handle) return;
            fileHandle.value = handle;
            fileName.value = handle.name;
            const ok = await verifyPermission(handle, true);
            if (ok) {
                fileStatus.value = 'active';
                await setStoredFileHandle(handle);
                transactions.value = await readFile(handle);
                showNotification(`Linked to ${handle.name}`, 'success');
            } else {
                fileStatus.value = 'locked';
                showNotification(`Please authorize access to ${handle.name}`, 'warning');
            }
        } catch (err) {
            console.warn('File link failed:', err);
            showNotification('Failed to link file or canceled.', 'error');
        }
    }

    async function authorizeFile() {
        if (!fileHandle.value) return;
        const ok = await verifyPermission(fileHandle.value, true);
        if (ok) {
            fileStatus.value = 'active';
            transactions.value = await readFile(fileHandle.value);
            showNotification(`Authorized file ${fileHandle.value.name}`, 'success');
        } else {
            showNotification('Permission denied. Continuing in browser memory.', 'error');
        }
    }

    async function unlinkFile() {
        await removeStoredFileHandle();
        fileHandle.value = null;
        fileName.value = '';
        fileStatus.value = 'unlinked';
        showNotification('File unlinked. Switched back to browser memory.', 'info');
    }

    async function loadFromFile() {
        if (!fileHandle.value) return;
        try {
            transactions.value = await readFile(fileHandle.value);
            showNotification(`Reloaded from ${fileHandle.value.name}`, 'success');
        } catch (err) {
            console.error('Failed to reload from file:', err);
            showNotification('Failed to reload file.', 'error');
        }
    }

    async function saveTransactions(newTxs: Transaction[]) {
        transactions.value = newTxs;
        saveToLocalStorage(newTxs);
        if (fileHandle.value && fileStatus.value === 'active') {
            try {
                await writeFile(fileHandle.value, newTxs);
            } catch (err) {
                console.error('Failed to write to file:', err);
            }
        }

        // Background sync to Cloud Webhook if configured and auto-sync is enabled
        if (cloudWebhookUrl.value && cloudAutoSync.value) {
            syncToCloudWebhook(true);
        }
    }

    function setTransactionsDirect(txs: Transaction[]) {
        transactions.value = txs;
    }

    function setMarketPrices(prices: Record<string, number>) {
        marketPrices.value = { ...marketPrices.value, ...prices };
        savePrices();
    }

    // Cloud Webhook Settings & Sync
    function saveCloudWebhookSettings(url: string, autoSync: boolean, autoPull: boolean) {
        cloudWebhookUrl.value = url.trim();
        cloudAutoSync.value = autoSync;
        cloudAutoPullOnLoad.value = autoPull;
        setLocalItem('cloud_webhook_url', cloudWebhookUrl.value);
        setLocalItem('cloud_auto_sync', String(autoSync));
        setLocalItem('cloud_auto_pull_on_load', String(autoPull));
        showNotification('Cloud storage settings saved.', 'success');
    }

    async function syncToCloudWebhook(silent = false) {
        if (!cloudWebhookUrl.value) {
            if (!silent) showNotification('Please enter a Cloud Webhook URL first.', 'error');
            return;
        }
        isSyncingCloud.value = true;
        try {
            await fetch(cloudWebhookUrl.value, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(transactions.value)
            });
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            lastCloudSyncTime.value = timeStr;
            setLocalItem('cloud_last_sync', timeStr);
            if (!silent) showNotification('Successfully synced transactions to Cloud!', 'success');
        } catch (err) {
            console.error(err);
            if (!silent) showNotification('Cloud sync failed. Check URL or internet.', 'error');
        } finally {
            isSyncingCloud.value = false;
        }
    }

    async function pullFromCloudWebhook(silent = false) {
        if (!cloudWebhookUrl.value) {
            if (!silent) showNotification('Please enter a Cloud Webhook URL first.', 'error');
            return;
        }
        isSyncingCloud.value = true;
        try {
            const res = await fetch(cloudWebhookUrl.value);
            const data = await res.json();
            if (Array.isArray(data)) {
                await saveTransactions(data);
                const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                lastCloudSyncTime.value = timeStr;
                setLocalItem('cloud_last_sync', timeStr);
                if (!silent) showNotification(`Loaded ${data.length} transactions from Cloud.`, 'success');
            } else {
                if (!silent) showNotification('Cloud response format invalid: expected an array.', 'error');
            }
        } catch (err) {
            console.error(err);
            if (!silent) showNotification('Failed to load records from Cloud.', 'error');
        } finally {
            isSyncingCloud.value = false;
        }
    }

    function downloadBackup() {
        const dataStr = JSON.stringify(transactions.value, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const date = new Date().toISOString().split('T')[0];
        a.href = url;
        a.download = `portfolio_backup_${date}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Backup file downloaded successfully.', 'success');
    }

    async function restoreBackup(jsonContent: string, fileNameHint = 'backup file') {
        try {
            const parsed = JSON.parse(jsonContent);
            if (Array.isArray(parsed)) {
                await saveTransactions(parsed);
                showNotification(`Restored ${parsed.length} transactions from ${fileNameHint}`, 'success');
            } else {
                showNotification('Invalid backup format: expected list of transactions.', 'error');
            }
        } catch (err) {
            console.error(err);
            showNotification('Failed to parse JSON backup file.', 'error');
        }
    }

    return {
        // State
        transactions,
        marketPrices,
        costBasisMethod,
        tickerAliases,
        fileHandle,
        fileName,
        fileStatus,
        isLoading,
        cloudWebhookUrl,
        cloudAutoSync,
        cloudAutoPullOnLoad,
        lastCloudSyncTime,
        isSyncingCloud,
        showRecordTransaction,
        isRolling,
        rollStep,
        rollSourceHolding,

        // Computeds
        stockHoldings,
        uniqueStockTickers,
        optionHoldings,
        openOptionsSummary,
        realizedStockRecords,
        realizedOptionsRecords,
        realizedStockPL,
        realizedOptionsPL,
        totalRealizedPL,
        stockPortfolioValue,
        stockCostBasis,
        stockUnrealizedPL,
        totalPortfolioNetPL,

        // Actions
        resolveTicker,
        setCostBasisMethod,
        toggleRecordTransaction,
        addTickerAlias,
        removeTickerAlias,
        applyTickerAliasesToLedger,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        clearAllData,
        startRollOption,
        cancelRoll,
        initStorage,
        linkFile,
        authorizeFile,
        unlinkFile,
        loadFromFile,
        saveTransactions,
        setTransactionsDirect,
        savePrices,
        setMarketPrices,
        saveCloudWebhookSettings,
        syncToCloudWebhook,
        pullFromCloudWebhook,
        downloadBackup,
        restoreBackup
    };
});
