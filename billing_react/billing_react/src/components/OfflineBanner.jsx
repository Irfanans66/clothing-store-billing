import React, { useEffect, useRef, useState } from 'react'
import { Alert, Space, Spin } from 'antd'
import { useOfflineStore } from '../store/offlineStore'
import { createBill } from '../api/client'
import { useT } from '../i18n'

export default function OfflineBanner() {
  const t = useT()
  const { isOnline, pendingBills, removePendingBill } = useOfflineStore()
  const [syncing, setSyncing] = useState(false)
  const [syncedCount, setSyncedCount] = useState(0)
  const syncedRef = useRef(false)

  // Auto-sync pending bills when coming back online
  useEffect(() => {
    if (!isOnline || pendingBills.length === 0 || syncedRef.current) return
    syncedRef.current = true

    async function syncAll() {
      setSyncing(true)
      let count = 0
      for (const bill of [...pendingBills]) {
        try {
          await createBill(bill.payload)
          removePendingBill(bill.id)
          count++
        } catch {
          // keep failed bills in queue, retry next reconnect
        }
      }
      setSyncedCount(count)
      setSyncing(false)
      syncedRef.current = false
    }
    syncAll()
  }, [isOnline, pendingBills.length])

  if (!isOnline) {
    return (
      <Alert
        type="warning"
        showIcon
        banner
        message={
          <span>
            <strong>{t('You are offline.')}</strong> {t('Bills will be saved on your device and automatically synced when internet returns.')}
            {pendingBills.length > 0 && ` (${t(pendingBills.length > 1 ? '{n} bills queued' : '{n} bill queued', { n: pendingBills.length })})`}
          </span>
        }
        style={{ borderRadius: 0 }}
      />
    )
  }

  if (syncing) {
    return (
      <Alert
        type="info"
        showIcon
        banner
        message={
          <Space>
            <Spin size="small" />
            <span>{t('Syncing offline bills to server…')}</span>
          </Space>
        }
        style={{ borderRadius: 0 }}
      />
    )
  }

  if (syncedCount > 0) {
    return (
      <Alert
        type="success"
        showIcon
        banner
        closable
        message={t(syncedCount > 1 ? '{n} offline bills synced successfully!' : '{n} offline bill synced successfully!', { n: syncedCount })}
        style={{ borderRadius: 0 }}
        afterClose={() => setSyncedCount(0)}
      />
    )
  }

  if (pendingBills.length > 0) {
    return (
      <Alert
        type="warning"
        showIcon
        banner
        message={t(pendingBills.length > 1 ? '{n} offline bills pending sync.' : '{n} offline bill pending sync.', { n: pendingBills.length })}
        style={{ borderRadius: 0 }}
      />
    )
  }

  return null
}