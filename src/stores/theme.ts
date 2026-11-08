import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ThemeMode = 'dark' | 'oled' | 'light';

function getLocal(key: string): string | null {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            return window.localStorage.getItem(key);
        }
    } catch {
        // ignore
    }
    return null;
}

function setLocal(key: string, val: string): void {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(key, val);
        }
    } catch {
        // ignore
    }
}

export const useThemeStore = defineStore('theme', () => {
    const themeMode = ref<ThemeMode>((getLocal('theme_mode') as ThemeMode) || 'dark');

    function applyThemeToDom(mode: ThemeMode) {
        if (typeof document === 'undefined') return;
        document.documentElement.classList.remove('theme-oled', 'theme-light');
        if (document.body) {
            document.body.classList.remove('theme-oled', 'theme-light');
        }

        if (mode === 'oled') {
            document.documentElement.classList.add('theme-oled');
            if (document.body) document.body.classList.add('theme-oled');
        } else if (mode === 'light') {
            document.documentElement.classList.add('theme-light');
            if (document.body) document.body.classList.add('theme-light');
        }
    }

    function setThemeMode(mode: ThemeMode) {
        if (['dark', 'oled', 'light'].includes(mode)) {
            themeMode.value = mode;
            setLocal('theme_mode', mode);
            applyThemeToDom(mode);
        }
    }

    function initTheme() {
        applyThemeToDom(themeMode.value);
    }

    return {
        themeMode,
        setThemeMode,
        initTheme
    };
});
