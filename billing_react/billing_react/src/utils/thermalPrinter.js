// Direct printing to Bluetooth thermal printers (ESC/POS), no print dialog.
//
// Most cheap receipt printers use Classic Bluetooth (SPP / RFCOMM), not BLE, so Web
// Bluetooth can't reach them. Chrome on Android (138+) and desktop Chrome reach them
// through the Web Serial API instead. The Android app is a Trusted Web Activity, so it is
// Chrome and gets this too, with no native code.
//
// The receipt is printed as an image: the same PDF the preview shows is drawn at the
// printer's width (58 mm roll = 384 dots, 80 mm = 576) and sent as ESC/POS raster, so
// the logo, UPI QR, ₹ and Hindi all print exactly as previewed.
import { useSyncExternalStore } from 'react'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { translate as t } from '../i18n'

export const PRINTER_SUPPORTED = typeof navigator !== 'undefined' && 'serial' in navigator
const OPEN_TIMEOUT_MS = 12000

// status: unsupported | none | connecting | ready | offline | printing
let state = { status: PRINTER_SUPPORTED ? 'connecting' : 'unsupported' }
const listeners = new Set()
function setState(patch) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}
function subscribe(l) {
  listeners.add(l)
  ensureInit()
  return () => listeners.delete(l)
}
export function usePrinter() {
  return useSyncExternalStore(subscribe, () => state)
}
/** True once a printer has been set up on this device (waits for the first look-up). */
export async function hasSavedPrinter() {
  if (!PRINTER_SUPPORTED) return false
  await ensureInit()
  return !!port
}

let port = null     // the remembered printer (Chrome keeps the permission between visits)
let isOpen = false
let busy = null     // the job in progress, so prints don't interleave

export class PrinterError extends Error {}
const OFF_MSG = 'Printer is off or too far. Turn it on, bring it close and tap Retry.'   // translated when shown

function friendly(err) {
  if (err instanceof PrinterError) return err
  const n = err?.name
  if (n === 'SecurityError' || n === 'NotAllowedError')
    return new PrinterError(t('Bluetooth permission is off. Allow "Nearby devices" for Chrome in phone Settings → Apps, then try again.'))
  return new PrinterError(t(OFF_MSG))
}

// ── Connection ───────────────────────────────────────────────────────────────
let initPromise = null
function ensureInit() {
  if (!PRINTER_SUPPORTED) return Promise.resolve()
  if (initPromise) return initPromise
  initPromise = (async () => {
    try {
      const ports = await navigator.serial.getPorts()
      port = ports[ports.length - 1] || null
    } catch { port = null }
    if (!port) setState({ status: 'none' })
    else reconnectPrinter().catch(() => {})
  })()
  navigator.serial.addEventListener?.('disconnect', (e) => {
    if (e.target === port) { isOpen = false; setState({ status: 'offline' }) }
  })
  // Phones drop the Bluetooth link when the app sleeps: try again when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && port && state.status === 'offline') reconnectPrinter().catch(() => {})
  })
  return initPromise
}

function withTimeout(p, ms) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new PrinterError(t(OFF_MSG))), ms))])
}

async function closePort() {
  isOpen = false
  try { await port?.close() } catch { /* already closed */ }
}

async function openPort() {
  if (isOpen && port?.writable) return
  try {
    await withTimeout(port.open({ baudRate: 9600 }), OPEN_TIMEOUT_MS)   // baud is ignored over Bluetooth
  } catch (err) {
    if (err?.name !== 'InvalidStateError') throw err                     // InvalidStateError = already open
  }
  isOpen = true
}

/** Reconnect to the saved printer (app start, coming back to the app, "Tap to reconnect"). */
export async function reconnectPrinter() {
  if (!port) { setState({ status: 'none' }); throw new PrinterError(t('No printer set up yet.')) }
  if (busy) return busy
  setState({ status: 'connecting' })
  try {
    await openPort()
    setState({ status: 'ready' })
  } catch (err) {
    await closePort()
    setState({ status: 'offline' })
    throw friendly(err)
  }
}

/**
 * Show Chrome's list of paired Bluetooth printers and connect to the one picked.
 * Must be called straight from a tap (no await before it). Returns false if the
 * shopkeeper closed the list without choosing.
 */
export async function choosePrinter() {
  let picked
  try {
    picked = await navigator.serial.requestPort()
  } catch (err) {
    if (err?.name === 'NotFoundError') return false   // closed the list
    throw friendly(err)
  }
  if (port && port !== picked) { await closePort(); try { await port.forget?.() } catch { /* */ } }
  // Keep exactly one remembered printer
  try {
    for (const p of await navigator.serial.getPorts()) if (p !== picked) await p.forget?.()
  } catch { /* forget() is optional */ }
  port = picked
  isOpen = false
  await reconnectPrinter()
  return true
}

export async function forgetPrinter() {
  await closePort()
  try { await port?.forget?.() } catch { /* */ }
  port = null
  setState({ status: 'none' })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function writeAll(bytes) {
  const writer = port.writable.getWriter()
  try {
    // Small chunks with a short pause: cheap printers have tiny buffers
    for (let i = 0; i < bytes.length; i += 1024) {
      await writer.write(bytes.subarray(i, i + 1024))
      await sleep(8)
    }
  } finally {
    writer.releaseLock()
  }
}

/** Send raw ESC/POS bytes, reconnecting once if the link dropped. */
async function send(bytes) {
  if (!port) throw new PrinterError(t('No printer set up yet.'))
  const job = (async () => {
    setState({ status: 'printing' })
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await openPort()
          await writeAll(bytes)
          break
        } catch (err) {
          await closePort()
          if (attempt >= 1) throw err
        }
      }
      setState({ status: 'ready' })
    } catch (err) {
      setState({ status: 'offline' })
      throw friendly(err)
    }
  })()
  busy = job
  try { await job } finally { busy = null }
}

// ── Image → ESC/POS raster ───────────────────────────────────────────────────
export const dotsForDesign = (design) => (design === '2inch' ? 384 : 576)

// Canvas → 1-bit rows (1 = black), trailing white rows trimmed
function canvasToBits(canvas) {
  const { width, height } = canvas
  const px = canvas.getContext('2d').getImageData(0, 0, width, height).data
  const bpr = width >> 3
  const bits = new Uint8Array(bpr * height)
  let lastInk = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]
      if (lum < 170) { bits[y * bpr + (x >> 3)] |= 0x80 >> (x & 7); lastInk = y }
    }
  }
  return { bpr, height: Math.min(height, lastInk + 8), bits }
}

function rasterJob(images, { cut }) {
  const out = [0x1b, 0x40]                      // ESC @ : reset
  const chunks = []
  for (const { bpr, height, bits } of images) {
    for (let y = 0; y < height; y += 128) {     // bands: some printers choke on one tall image
      const h = Math.min(128, height - y)
      chunks.push(Uint8Array.of(0x1d, 0x76, 0x30, 0x00, bpr & 0xff, bpr >> 8, h & 0xff, h >> 8))  // GS v 0
      chunks.push(bits.subarray(y * bpr, (y + h) * bpr))
    }
  }
  const tail = [0x1b, 0x64, 0x04]               // feed 4 lines so the tear bar clears the text
  if (cut) tail.push(0x1d, 0x56, 0x42, 0x00)    // GS V : feed and cut (80 mm printers with a cutter)
  const total = out.length + chunks.reduce((s, c) => s + c.length, 0) + tail.length
  const bytes = new Uint8Array(total)
  let o = 0
  bytes.set(out, o); o += out.length
  for (const c of chunks) { bytes.set(c, o); o += c.length }
  bytes.set(tail, o)
  return bytes
}

async function pdfToCanvases(blob) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
  try {
    const canvases = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const base = page.getViewport({ scale: 1 })
      // The receipt PDF is as wide as the paper chosen in Settings: under 70 mm (198 pt) = 58 mm roll
      const dots = base.width < 198 ? 384 : 576
      const vp = page.getViewport({ scale: dots / base.width })
      const canvas = document.createElement('canvas')
      canvas.width = dots
      canvas.height = Math.ceil(vp.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      canvases.push(canvas)
    }
    return canvases
  } finally {
    doc.destroy()
  }
}

/** Print a receipt PDF on the saved printer. Throws PrinterError with a plain-words message. */
export async function printPdfDirect(blob) {
  let canvases
  try { canvases = await pdfToCanvases(blob) }
  catch { throw new PrinterError(t('Could not prepare the receipt for printing.')) }
  await send(rasterJob(canvases.map(canvasToBits), { cut: canvases[0]?.width === 576 }))
}

/** A short test slip: proves the link works and that ₹ and Hindi print. */
export async function printTestPage({ dots = 384, storeName = '' } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = dots
  canvas.height = 300
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, dots, 300)
  ctx.fillStyle = '#000'
  ctx.textAlign = 'center'
  const mid = dots / 2
  ctx.font = 'bold 30px sans-serif'
  ctx.fillText(t('Printer connected ✓'), mid, 44, dots - 16)
  ctx.font = '22px sans-serif'
  if (storeName) ctx.fillText(storeName, mid, 84, dots - 16)
  ctx.fillText(`${dots === 384 ? '58' : '80'} mm · ₹ 1,234.00`, mid, 124, dots - 16)
  ctx.fillText(t('Thank you! Visit again'), mid, 164, dots - 16)
  ctx.fillRect(8, 190, dots - 16, 3)
  ctx.font = '18px sans-serif'
  ctx.fillText(new Date().toLocaleString('en-IN'), mid, 226, dots - 16)
  await send(rasterJob([canvasToBits(canvas)], { cut: dots === 576 }))
}
