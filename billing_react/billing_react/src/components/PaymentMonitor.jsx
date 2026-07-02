import React, { useState, useEffect } from 'react'
import { Tooltip, Badge } from 'antd'

const PLATFORMS = {
  gpay:    { label: 'GPay Business',    url: 'https://business.google.com/',   emoji: '🇬',  color: '#4285F4' },
  phonepe: { label: 'PhonePe Business', url: 'https://business.phonepe.com/',  emoji: '💜', color: '#5f259f' },
  both:    { label: 'GPay + PhonePe',   url: null,                             emoji: '💳', color: '#82B8D4' },
}

let popupRef = { gpay: null, phonepe: null }

function openPopup(platform) {
  const w = 420, h = Math.min(700, screen.height - 100)
  const left = Math.max(0, screen.width - w - 20)
  const top  = 50
  const opts = `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no`

  if (platform === 'both') {
    // Open both side by side
    const halfW = Math.floor((screen.width * 0.45))
    const gOpts = `width=${halfW},height=${h},left=${screen.width - halfW * 2 - 20},top=${top},resizable=yes,scrollbars=yes`
    const pOpts = `width=${halfW},height=${h},left=${screen.width - halfW - 10},top=${top},resizable=yes,scrollbars=yes`
    if (!popupRef.gpay || popupRef.gpay.closed)
      popupRef.gpay = window.open(PLATFORMS.gpay.url, 'gpay-monitor', gOpts)
    else popupRef.gpay.focus()
    setTimeout(() => {
      if (!popupRef.phonepe || popupRef.phonepe.closed)
        popupRef.phonepe = window.open(PLATFORMS.phonepe.url, 'phonepe-monitor', pOpts)
      else popupRef.phonepe.focus()
    }, 300)
    return
  }

  const key = platform
  if (!popupRef[key] || popupRef[key].closed)
    popupRef[key] = window.open(PLATFORMS[platform].url, `${platform}-monitor`, opts)
  else popupRef[key].focus()
}

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
            <button key={key} onClick={() => { openPopup(key); setOpen(false) }} style={{
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
            openPopup(platform)
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