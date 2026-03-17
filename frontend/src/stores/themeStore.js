import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { settingsApi } from '../services/api.js';
import { useAuthStore } from './authStore.js';

export const useThemeStore = create(
  persist(
    (set, get) => ({
      // State
      theme: 'dark', // dark | light | system
      systemTheme: 'dark', // detectado del OS
      
      // Actions

  setTheme: (newTheme) => {
    set({ theme: newTheme });
    
    // Apply immediately to DOM
    const html = document.documentElement;
    if (newTheme === 'system') {
      const systemPref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      html.classList.toggle('dark', systemPref === 'dark');
    } else {
      html.classList.toggle('dark', newTheme === 'dark');
    }
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
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const systemTheme = dark ? 'dark' : 'light';
        set({ systemTheme });
        return systemTheme;
      },

      syncFromPreferences: async (preferences) => {
        if (preferences.theme) {
          set({ theme: preferences.theme });
          get().setTheme(preferences.theme);
        }
      },

      // Listen to system changes
      initSystemListener: () => {
        const mql = window.matchMedia('(prefers-color-scheme: dark)');
        const updateTheme = (e) => {
          const currentTheme = get().theme;
          if (currentTheme === 'system') {
            get().setTheme('system');
          }
        };
        mql.addEventListener('change', updateTheme);
        return () => mql.removeEventListener('change', updateTheme);
      },
    }),
    
    {
      name: 'mangavault-theme',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ theme: state.theme }),
      
      // Rehydrate + sync con DB
      onRehydrateStorage: () => (state, error) => {
        if (error) console.error('ThemeStore rehydrate error:', error);
        
        // Detect system theme
        state?.detectSystemTheme();
        
        // Init system listener
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

