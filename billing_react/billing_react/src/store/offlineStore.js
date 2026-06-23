import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useOfflineStore = create(
  persist(
    (set) => ({
      isOnline: navigator.onLine,
      cachedProducts: [],
      cachedCustomers: [],
      pendingBills: [],           // [{ id, payload, queuedAt }]

      setOnline: (v) => set({ isOnline: v }),
      cacheProducts: (products) => set({ cachedProducts: products }),
      cacheCustomers: (customers) => set({ cachedCustomers: customers }),

      addPendingBill: (payload) =>
        set((s) => ({
          pendingBills: [
            ...s.pendingBills,
            { id: `OFFLINE-${Date.now()}`, payload, queuedAt: new Date().toISOString() },
          ],
        })),

      removePendingBill: (id) =>
        set((s) => ({ pendingBills: s.pendingBills.filter((b) => b.id !== id) })),
    }),
    {
      name: 'billing-offline',
      partialize: (s) => ({
        cachedProducts: s.cachedProducts,
        cachedCustomers: s.cachedCustomers,
        pendingBills: s.pendingBills,
      }),
    }
  )
)