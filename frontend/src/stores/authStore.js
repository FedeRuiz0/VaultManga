import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '../services/api'; // <-- Usamos import nombrado

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: {
        id: 'demo-user',
        username: 'demo',
        email: 'demo@example.com'
      },
      token: null,
      isAuthenticated: true,
      isLoading: false,
      error: null,

      login: async (email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register({ email, password });
          // authApi.login ya devuelve JSON, asumimos { user, token }
          const { user, token } = response;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          const message = error.message || 'Login failed';
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      register: async (username, email, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authApi.register({ username, email, password });
          const { user, token } = response;

          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });

          return { success: true };
        } catch (error) {
          const message = error.message || 'Registration failed';
          set({ error: message, isLoading: false });
          return { success: false, error: message };
        }
      },

      logout: async () => {
        try {
          await authApi.logout();
        } catch (err) {
          // ignoramos error de logout
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
        });
      },

      clearError: () => {
        set({ error: null });
      },

      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData },
        }));
      },
    }),
    {
      name: 'mangavault-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);