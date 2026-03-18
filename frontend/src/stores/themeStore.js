import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const applyThemeToDom = (theme, systemTheme) => {
  if (typeof document === 'undefined') return;

  const html = document.documentElement;
  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  html.classList.toggle('dark', resolvedTheme === 'dark');
  html.setAttribute('data-theme', resolvedTheme);
};

const detectSystemThemeValue = () => {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useThemeStore = create(
  persist(
    (set, get) => ({
      // State
      theme: 'dark', // dark | light | system
      systemTheme: detectSystemThemeValue(),

      // Actions
      setTheme: (newTheme) => {
        const nextSystemTheme = get().systemTheme || detectSystemThemeValue();
        set({ theme: newTheme, systemTheme: nextSystemTheme });
        applyThemeToDom(newTheme, nextSystemTheme);
      },

      toggleTheme: () => {
        const current = get().theme;
        const next = {
          dark: 'light',
          light: 'system',
          system: 'dark'
        }[current];
        get().setTheme(next);
      },

      detectSystemTheme: () => {
        const systemTheme = detectSystemThemeValue();
        set({ systemTheme });

        if (get().theme === 'system') {
          applyThemeToDom('system', systemTheme);
        }

        return systemTheme;
      },

      syncFromPreferences: async (preferences) => {
        if (preferences.theme) {
          get().setTheme(preferences.theme);
        }
      },

      // Listen to system changes
      initSystemListener: () => {
        if (typeof window === 'undefined') return () => {};

        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = () => {
          get().detectSystemTheme();
        };

        mql.addEventListener('change', updateTheme);
        return () => mql.removeEventListener('change', updateTheme);
      },

      initTheme: () => {
        const systemTheme = get().detectSystemTheme();
        applyThemeToDom(get().theme, systemTheme);
      },
    }),

    {
      name: 'mangavault-theme',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),

      // Rehydrate + sync con DB
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('ThemeStore rehydrate error:', error);

        state?.initTheme();
        state?.initSystemListener();
      }
    }
  )
);

// Hook conveniente para obtener effective theme
export const useEffectiveTheme = () => {
  const { theme, systemTheme } = useThemeStore();
  const effective = theme === 'system' ? systemTheme : theme;
  return effective;
};

// Hook para botón toggle
export const useThemeToggle = () => {
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const effectiveTheme = useEffectiveTheme();
  return { toggleTheme, effectiveTheme };
};
