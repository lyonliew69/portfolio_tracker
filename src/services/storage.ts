import type { Transaction } from '../types/portfolio';

export interface StorageStatus {
    type: 'file' | 'local' | 'cloud';
    status: 'active' | 'locked' | 'unlinked' | 'synced' | 'syncing' | 'error';
    fileName?: string;
    lastSynced?: string;
}

const DB_NAME = 'ledger_fs_db';
const STORE_NAME = 'store';
const KEY_NAME = 'file_handle';

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function setStoredFileHandle(handle: FileSystemFileHandle): Promise<void> {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(handle, KEY_NAME);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function getStoredFileHandle(): Promise<FileSystemFileHandle | null> {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const req = tx.objectStore(STORE_NAME).get(KEY_NAME);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

export async function removeStoredFileHandle(): Promise<void> {
    try {
        const db = await getDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).delete(KEY_NAME);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // ignore
    }
}

export async function verifyPermission(handle: FileSystemFileHandle, readWrite = true): Promise<boolean> {
    const options: { mode?: 'read' | 'readwrite' } = {};
    if (readWrite) options.mode = 'readwrite';
    if ((await (handle as any).queryPermission(options)) === 'granted') return true;
    if ((await (handle as any).requestPermission(options)) === 'granted') return true;
    return false;
}

export async function pickLocalFile(): Promise<FileSystemFileHandle | null> {
    if (!('showOpenFilePicker' in window)) {
        throw new Error('File System Access API is not supported in this browser.');
    }
    const [handle] = await (window as any).showOpenFilePicker({
        types: [{
            description: 'JSON Database File',
            accept: { 'application/json': ['.json'] }
        }],
        multiple: false
    });
    return handle;
}

export async function createLocalFile(suggestedName = 'portfolio.json'): Promise<FileSystemFileHandle | null> {
    if (!('showSaveFilePicker' in window)) {
        throw new Error('File System Access API is not supported in this browser.');
    }
    const handle = await (window as any).showSaveFilePicker({
        suggestedName,
        types: [{
            description: 'JSON Database File',
            accept: { 'application/json': ['.json'] }
        }]
    });
    return handle;
}

export async function readFile(handle: FileSystemFileHandle): Promise<Transaction[]> {
    const file = await handle.getFile();
    const text = await file.text();
    if (!text.trim()) return [];
    return JSON.parse(text);
}

export async function writeFile(handle: FileSystemFileHandle, data: Transaction[]): Promise<void> {
    const writable = await (handle as any).createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
}

export function saveToLocalStorage(data: Transaction[], key = 'tx_portfolio_data'): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            localStorage.setItem(key, JSON.stringify(data));
            localStorage.setItem('tx_portfolio_last_updated', new Date().toISOString());
        }
    } catch (err) {
        console.warn('Failed to save to localStorage:', err);
    }
}

export function loadFromLocalStorage(key = 'tx_portfolio_data'): Transaction[] {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : [];
        }
        return [];
    } catch {
        return [];
    }
}
