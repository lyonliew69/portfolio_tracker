import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCurrencyStore } from '../src/stores/currency';
import { useThemeStore } from '../src/stores/theme';

describe('Currency & Theme Stores', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('formats money in USD by default', () => {
        const store = useCurrencyStore();
        expect(store.selectedCurrency).toBe('USD');
        expect(store.formatMoney(100)).toBe('$100.00');
        expect(store.formatMoney(-50.5, { sign: true })).toBe('-$50.50');
        expect(store.formatMoney(25.5, { sign: true })).toBe('+$25.50');
    });

    it('converts and formats for SGD and JPY', () => {
        const store = useCurrencyStore();
        store.selectCurrency('SGD');
        expect(store.selectedCurrency).toBe('SGD');
        // default SGD rate is 1.28
        expect(store.formatMoney(100)).toContain('S$ 128.00');

        store.selectCurrency('JPY');
        // JPY decimals = 0, default 155.0
        expect(store.formatMoney(100)).toContain('¥15,500');
    });

    it('supports custom FX rate overrides and resets', () => {
        const store = useCurrencyStore();
        store.selectCurrency('SGD');
        store.saveCustomFxRate('SGD', 1.35);
        expect(store.activeFxRate).toBe(1.35);
        expect(store.formatMoney(100)).toContain('S$ 135.00');

        store.resetCustomFxRate('SGD');
        expect(store.activeFxRate).toBe(1.28);
    });

    it('manages theme modes', () => {
        const theme = useThemeStore();
        expect(theme.themeMode).toBe('dark');

        theme.setThemeMode('oled');
        expect(theme.themeMode).toBe('oled');

        theme.setThemeMode('light');
        expect(theme.themeMode).toBe('light');

        theme.setThemeMode('dark');
        expect(theme.themeMode).toBe('dark');
    });
});
