import React, { useState, useEffect } from 'react'
import { Tooltip } from 'antd'
import { PLATFORMS, openPaymentDashboard } from '../utils/paymentPlatforms'

export default function PaymentMonitor() {
  const [platform, setPlatform] = useState(() => localStorage.getItem('payment_monitor_platform') || null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('#payment-monitor-fab')) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!platform) return null

  const p = PLATFORMS[platform]

  return (
    <div id="payment-monitor-fab" style={{ position: 'fixed', bottom: 90, right: 20, zIndex: 1200 }}>

      {/* Mini menu */}
      {open && (
        <div style={{
          position: 'absolute', bottom: 68, right: 0,
          background: '#EDE8E2',
          borderRadius: 16,
          boxShadow: '6px 6px 18px rgba(163,155,140,0.55), -6px -6px 18px rgba(255,255,255,0.92)',
          padding: '10px 8px',
          minWidth: 200,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 11, color: '#9A9490', fontWeight: 600, padding: '0 8px 4px', letterSpacing: 0.5 }}>
            OPEN PAYMENT DASHBOARD
          </div>
          {['gpay','phonepe','both'].map((key) => (
            <button key={key} onClick={() => { openPaymentDashboard(key); setOpen(false) }} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', border: 'none', borderRadius: 12,
              background: platform === key ? 'rgba(130,184,212,0.15)' : 'transparent',
              cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
              fontSize: 13, color: '#3A3530', fontWeight: 500,
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,184,212,0.12)'}
              onMouseLeave={e => e.currentTarget.style.background = platform === key ? 'rgba(130,184,212,0.15)' : 'transparent'}
            >
              <span style={{ fontSize: 16 }}>{PLATFORMS[key].emoji}</span>
              <span>{PLATFORMS[key].label}</span>
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <Tooltip title={`Open ${p.label}`} placement="left">
        <button
          onClick={() => {
            if (open) { setOpen(false); return }
            if (platform === 'both') { setOpen(true); return }
            openPaymentDashboard(platform)
          }}
          style={{
            width: 56, height: 56, borderRadius: 18,
            background: 'linear-gradient(135deg, #82B8D4, #5E9AB8)',
            border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 2,
            boxShadow: '6px 6px 18px rgba(163,155,140,0.55), -3px -3px 10px rgba(255,255,255,0.92)',
            color: '#fff', fontSize: 22,
            transition: 'transform 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '8px 8px 24px rgba(163,155,140,0.6), -4px -4px 12px rgba(255,255,255,0.95)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '6px 6px 18px rgba(163,155,140,0.55), -3px -3px 10px rgba(255,255,255,0.92)' }}
        >
          💳
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.3 }}>PAY</span>
        </button>
      </Tooltip>
    </div>
  )
}