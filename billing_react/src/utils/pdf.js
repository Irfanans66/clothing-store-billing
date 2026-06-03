const BASE = (import.meta.env.VITE_API_URL || 'https://clothing.up.railway.app') + '/api/v1'

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
      // fallback: open in new tab if iframe print is blocked
      window.open(url, '_blank')
    }
    setTimeout(() => {
      document.body.removeChild(iframe)
      URL.revokeObjectURL(url)
    }, 60000)
  }
}