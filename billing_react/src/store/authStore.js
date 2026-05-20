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

      setAuth: (payload) => set({ ...payload }),
      logout: () => {
        set({ token: null, role: null, storeCode: null, storeName: null, username: null })
        localStorage.removeItem('token')
      },
    }),
    {
      name: 'billing-auth',
      onRehydrateStorage: () => (state) => {
        // Keep localStorage token in sync with axios interceptor
        if (state?.token) localStorage.setItem('token', state.token)
      },
    }
  )
)