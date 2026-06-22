const BASE = (import.meta.env.VITE_API_URL || '') + '/api/v1'
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

async function _fetchPdfBlob(path) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`)
  return res.blob()
}

export async function openPdfWithAuth(path, filename = 'receipt.pdf') {
  const blob = await _fetchPdfBlob(path)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.target = '_blank'
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

export async function printPdfWithAuth(path) {
  const blob = await _fetchPdfBlob(path)

  // Mobile: use Web Share API → OS hands off to system print dialog,
  // which lists any connected Bluetooth / WiFi printer the device knows about.
  if (IS_MOBILE && 'share' in navigator) {
    const file = new File([blob], 'receipt.pdf', { type: 'application/pdf' })
    const canShareFile = navigator.canShare?.({ files: [file] }) ?? true
    if (canShareFile) {
      try {
        await navigator.share({ files: [file], title: 'Receipt' })
        return
      } catch (e) {
        if (e.name === 'AbortError') return   // user dismissed the sheet
        // share failed — fall through to open-in-tab
      }
    }
  }

  // Mobile without Share API, or share failed: open PDF in new tab.
  // On Android the Chrome menu has "Print"; on iOS tap share → Print.
  if (IS_MOBILE) {
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
    return
  }

  // Desktop: hidden iframe → contentWindow.print()
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;'
  iframe.src = url
  document.body.appendChild(iframe)

  iframe.onload = () => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch {
      window.open(url, '_blank')
    }
    setTimeout(() => {
      document.body.removeChild(iframe)
      URL.revokeObjectURL(url)
    }, 60000)
  }
}