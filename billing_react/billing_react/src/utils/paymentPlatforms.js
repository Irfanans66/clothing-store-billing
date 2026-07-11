const IS_ANDROID = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)

export const PLATFORMS = {
  gpay: {
    key: 'gpay',
    label: 'GPay Business',
    webUrl: 'https://pay.google.com/business/console/',
    androidPackage: 'com.google.android.apps.nbu.paisa.merchant',
    emoji: '🇬',
    color: '#4285F4',
    desc: 'Google Pay for Business dashboard',
  },
  phonepe: {
    key: 'phonepe',
    label: 'PhonePe Business',
    webUrl: 'https://business.phonepe.com/',
    androidPackage: 'com.phonepe.business.merchant',
    emoji: '💜',
    color: '#5f259f',
    desc: 'PhonePe Business dashboard',
  },
  both: {
    key: 'both',
    label: 'GPay + PhonePe',
    webUrl: null,
    androidPackage: null,
    emoji: '💳',
    color: '#82B8D4',
    desc: 'Open both dashboards side by side',
  },
}

const popupRefs = { gpay: null, phonepe: null }

function launchSingle(key) {
  const p = PLATFORMS[key]
  if (!p || !p.webUrl) return

  if (IS_ANDROID && p.androidPackage) {
    // Try the native app first; fall back to the web dashboard if not installed.
    const fallback = encodeURIComponent(p.webUrl)
    window.location.href = `intent://#Intent;package=${p.androidPackage};S.browser_fallback_url=${fallback};end`
    return
  }

  // Desktop: open dashboard in a positioned popup, focus existing if already open.
  const w = 420
  const h = Math.min(700, screen.height - 100)
  const left = Math.max(0, screen.width - w - 20)
  const opts = `width=${w},height=${h},left=${left},top=50,resizable=yes,scrollbars=yes,toolbar=no,menubar=no`

  if (popupRefs[key] && !popupRefs[key].closed) {
    popupRefs[key].focus()
  } else {
    popupRefs[key] = window.open(p.webUrl, `${key}-monitor`, opts)
  }
}

export function openPaymentDashboard(key) {
  if (key === 'both') {
    if (IS_ANDROID) {
      // Two Android apps can't easily open side-by-side. Launch GPay; user
      // can switch to PhonePe from the FAB menu.
      launchSingle('gpay')
      return
    }
    // Desktop: side-by-side popups.
    const halfW = Math.floor(screen.width * 0.45)
    const h = Math.min(700, screen.height - 100)
    const gOpts = `width=${halfW},height=${h},left=${screen.width - halfW * 2 - 20},top=50,resizable=yes,scrollbars=yes`
    const pOpts = `width=${halfW},height=${h},left=${screen.width - halfW - 10},top=50,resizable=yes,scrollbars=yes`

    if (popupRefs.gpay && !popupRefs.gpay.closed) popupRefs.gpay.focus()
    else popupRefs.gpay = window.open(PLATFORMS.gpay.webUrl, 'gpay-monitor', gOpts)

    setTimeout(() => {
      if (popupRefs.phonepe && !popupRefs.phonepe.closed) popupRefs.phonepe.focus()
      else popupRefs.phonepe = window.open(PLATFORMS.phonepe.webUrl, 'phonepe-monitor', pOpts)
    }, 300)
    return
  }
  launchSingle(key)
}