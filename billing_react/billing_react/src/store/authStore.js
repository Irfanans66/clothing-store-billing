import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      token: null,
      role: null,
      storeCode: null,
      storeName: null,
      username: null,
      darkMode: false,

      setAuth: (payload) => set({ ...payload }),
      toggleDarkMode: () => set((s) => ({ darkMode: !s.darkMode })),
      logout: () => {
        set({ token: null, role: null, storeCode: null, storeName: null, username: null })
        localStorage.removeItem('token')
      },
    }),
    {
      name: 'billing-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.token) localStorage.setItem('token', state.token)
      },
    }
  )
)