// Barcode label rendering: every design draws in pure black & white so it prints
// sharply on thermal printers, uses ₹ with "(Incl. of all taxes)", shrinks text to
// fit instead of overlapping, and keeps blank margins around the barcode for scanners.
import JsBarcode from 'jsbarcode'

export const LABEL_SIZES = [
  { value: '50x25', label: '50 × 25 mm (standard)' },
  { value: '50x30', label: '50 × 30 mm' },
  { value: '38x25', label: '38 × 25 mm (small)' },
  { value: '40x30', label: '40 × 30 mm' },
  { value: '50.8x24.9', label: '50.8 × 24.9 mm' },
  { value: '60x40', label: '60 × 40 mm (large)' },
  { value: '100x50', label: '100 × 50 mm (XL)' },
  { value: '25x50', label: '25 × 50 mm (portrait)' },
]

export const LAYOUTS = [
  { value: 'roll', label: 'Label roll — 1 across' },
  { value: 'roll2', label: 'Label roll — 2 across' },
  { value: 'a4-65', label: 'A4 sheet — 65 labels (38.1 × 21.2 mm)' },
]

// A4 65-up sheet (5 × 13), e.g. Avery L7651 / generic 38.1 × 21.2 mm
export const A4_65 = { cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.7, gapX: 2.5, gapY: 0 }
const ROLL2_GAP = 2   // mm between the two labels on a 2-across roll

export const LABEL_DESIGNS = [
  { value: 'classic', label: 'Design 1 — Classic' },
  { value: 'modern', label: 'Design 2 — Size panel' },
  { value: 'bold', label: 'Design 3 — Bold price' },
  { value: 'size', label: 'Design 4 — Size first' },
]

export const DEFAULT_FIELDS = { store: true, category: true, color: true, size: true, offer: false, taxNote: true }

const FONT = 'Arial, "Noto Sans", "Segoe UI", sans-serif'
const BLACK = '#000000'
const WHITE = '#ffffff'

export function labelDims(sizeValue, layout) {
  if (layout === 'a4-65') return [A4_65.w, A4_65.h]
  const [w, h] = String(sizeValue).split('x').map(parseFloat)
  return [w, h]
}

const rupees = (v, sym) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`

// Largest font (≤ size) at which text fits maxW; returns the font size used
function fit(ctx, text, maxW, size, weight = '') {
  let s = Math.max(6, Math.round(size))
  ctx.font = `${weight} ${s}px ${FONT}`.trim()
  while (s > 6 && ctx.measureText(text).width > maxW) {
    s -= 1
    ctx.font = `${weight} ${s}px ${FONT}`.trim()
  }
  return s
}

function text(ctx, str, x, y, maxW, size, { weight = '', align = 'left', base = 'middle', color = BLACK } = {}) {
  if (!str) return 0
  const used = fit(ctx, str, maxW, size, weight)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = base
  ctx.fillText(str, x, y)
  return used
}

// Barcode drawn at a whole number of pixels per bar (no blurry scaling) and
// centred with a blank quiet zone either side
function drawBarcode(ctx, value, x, y, w, h, quiet) {
  if (!value) return
  try {
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(probe, value, { format: 'CODE128', displayValue: false, margin: 0, width: 1, height: 10 })
    const modules = parseFloat(probe.getAttribute('width')) || 1
    const avail = Math.max(10, w - quiet * 2)
    const mod = Math.max(1, Math.floor(avail / modules))
    const bw = modules * mod
    const scale = bw > avail ? avail / bw : 1        // only when even 1px bars don't fit
    const tmp = document.createElement('canvas')
    JsBarcode(tmp, value, { format: 'CODE128', displayValue: false, margin: 0, width: mod, height: h, background: WHITE, lineColor: BLACK })
    const drawW = Math.floor(bw * scale)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(tmp, 0, 0, tmp.width, tmp.height, Math.round(x + (w - drawW) / 2), Math.round(y), drawW, Math.round(h))
  } catch { /* invalid barcode text: leave blank */ }
}

function priceBlock(ctx, p, o, x, y, w, h, align) {
  // MRP (or offer price with MRP struck through) plus the tax note, inside the box x,y,w,h
  const { sym, fields } = o
  const offer = fields.offer && p.selling_price && p.selling_price < p.mrp
  const noteH = fields.taxNote ? h * 0.3 : 0
  const priceH = h - noteH
  const ax = align === 'center' ? x + w / 2 : x
  if (offer) {
    const big = rupees(p.selling_price, sym)
    const mrp = `MRP ${rupees(p.mrp, sym)}`
    const mrpSize = fit(ctx, mrp, w * 0.42, priceH * 0.42)
    const bigSize = fit(ctx, big, w * 0.55, priceH * 0.95, 'bold')
    const total = ctx.measureText(big).width + 8 + (() => { ctx.font = `${mrpSize}px ${FONT}`; return ctx.measureText(mrp).width })()
    let cx = align === 'center' ? x + (w - total) / 2 : x
    text(ctx, big, cx, y + priceH / 2, w, bigSize, { weight: 'bold', base: 'middle' })
    ctx.font = `bold ${bigSize}px ${FONT}`
    cx += ctx.measureText(big).width + 8
    text(ctx, mrp, cx, y + priceH / 2, w, mrpSize, { base: 'middle' })
    ctx.font = `${mrpSize}px ${FONT}`
    const mw = ctx.measureText(mrp).width
    ctx.fillRect(cx, Math.round(y + priceH / 2), mw, Math.max(1, Math.round(mrpSize / 10)))
  } else {
    text(ctx, `MRP ${rupees(p.mrp, sym)}`, ax, y + priceH / 2, w, priceH * 0.95, { weight: 'bold', align, base: 'middle' })
  }
  if (fields.taxNote) text(ctx, '(Incl. of all taxes)', ax, y + priceH + noteH / 2, w, noteH * 0.9, { align, base: 'middle' })
}

function codeLine(p) {
  const bc = String(p.barcode || p.item_id || '')
  return p.item_id && p.item_id !== bc ? `${bc}   ${p.item_id}` : bc
}

// ── Designs (all coordinates in px of the unrotated label, W × H) ─────────────
function designClassic(ctx, p, W, H, o) {
  const pad = W * 0.04
  const f = o.fields
  let y = H * 0.03
  if (f.store) {
    const hh = H * 0.17
    text(ctx, (o.storeName || '').toUpperCase(), W / 2, hh / 2, W - pad * 2, hh * 0.75, { weight: 'bold', align: 'center' })
    ctx.fillRect(pad, hh, W - pad * 2, Math.max(1, Math.round(H * 0.01)))
    y = hh + H * 0.02
  }
  const meta = [f.size && p.size, f.color && p.color].filter(Boolean).join(' · ')
  const nameH = H * 0.14
  text(ctx, `${p.product_name || ''}${meta ? `  (${meta})` : ''}`, W / 2, y + nameH / 2, W - pad * 2, nameH * 0.85, { weight: 'bold', align: 'center' })
  y += nameH
  if (f.category && p.category) {
    const ch = H * 0.09
    text(ctx, p.category, W / 2, y + ch / 2, W - pad * 2, ch * 0.9, { align: 'center' })
    y += ch
  }
  const priceH = H * 0.22
  const codeH = H * 0.08
  const barH = H - y - priceH - codeH - H * 0.04
  drawBarcode(ctx, String(p.barcode || p.item_id || ''), 0, y + H * 0.02, W, barH, o.quiet)
  y += H * 0.02 + barH
  text(ctx, codeLine(p), W / 2, y + codeH / 2, W - pad * 2, codeH * 0.95, { align: 'center' })
  priceBlock(ctx, p, o, pad, H - priceH, W - pad * 2, priceH, 'center')
}

function designModern(ctx, p, W, H, o) {
  // Outlined size panel on the left (reads the same way up as the rest — no rotated text)
  const f = o.fields
  const pad = W * 0.03
  const panelW = f.size ? Math.round(W * 0.22) : 0
  if (panelW) {
    const lw = Math.max(2, Math.round(H * 0.025))
    ctx.lineWidth = lw
    ctx.strokeStyle = BLACK
    ctx.strokeRect(pad + lw / 2, pad + lw / 2, panelW - lw, H - pad * 2 - lw)
    text(ctx, 'SIZE', pad + panelW / 2, pad + H * 0.14, panelW * 0.8, H * 0.09, { align: 'center' })
    text(ctx, p.size || '—', pad + panelW / 2, H * 0.55, panelW * 0.82, H * 0.4, { weight: 'bold', align: 'center' })
  }
  const x = pad + panelW + (panelW ? pad : 0)
  const w = W - x - pad
  let y = pad
  if (f.store) {
    text(ctx, (o.storeName || '').toUpperCase(), x, y + H * 0.06, w, H * 0.1, { weight: 'bold' })
    y += H * 0.13
  }
  text(ctx, p.product_name || '', x, y + H * 0.065, w, H * 0.12, { weight: 'bold' })
  y += H * 0.13
  const meta = [f.color && p.color, f.category && p.category].filter(Boolean).join(' · ')
  if (meta) { text(ctx, meta, x, y + H * 0.045, w, H * 0.085); y += H * 0.1 }
  const priceH = H * 0.24
  priceBlock(ctx, p, o, x, y, w, priceH, 'left')
  y += priceH + H * 0.02
  const codeH = H * 0.08
  const barH = Math.max(H * 0.12, H - pad - y - codeH)
  drawBarcode(ctx, String(p.barcode || p.item_id || ''), x - pad, y, w + pad * 2, barH, o.quiet)
  text(ctx, codeLine(p), x + w / 2, y + barH + codeH / 2, w, codeH * 0.95, { align: 'center' })
}

function designBold(ctx, p, W, H, o) {
  const f = o.fields
  const pad = W * 0.04
  let y = pad * 0.6
  const topH = H * 0.16
  const sizeW = f.size && p.size ? W * 0.2 : 0
  if (f.store) text(ctx, (o.storeName || '').toUpperCase(), pad, y + topH / 2, W - pad * 2 - sizeW - pad, topH * 0.85, { weight: 'bold' })
  if (sizeW) {
    const lw = Math.max(2, Math.round(H * 0.02))
    ctx.lineWidth = lw
    ctx.strokeStyle = BLACK
    ctx.strokeRect(W - pad - sizeW, y, sizeW, topH * 1.6)
    text(ctx, p.size, W - pad - sizeW / 2, y + topH * 0.8, sizeW * 0.85, topH * 1.25, { weight: 'bold', align: 'center' })
  }
  y += topH
  const meta = [p.product_name, f.color && p.color, f.category && p.category].filter(Boolean).join(' · ')
  text(ctx, meta, pad, y + H * 0.06, W - pad * 2 - sizeW - pad, H * 0.1)
  y += H * 0.13
  ctx.fillRect(pad, y, W - pad * 2, Math.max(2, Math.round(H * 0.018)))
  y += H * 0.03
  const priceH = H * 0.3
  priceBlock(ctx, p, o, pad, y, W - pad * 2, priceH, 'center')
  y += priceH + H * 0.02
  const codeH = H * 0.08
  const barH = H - y - codeH - pad * 0.4
  drawBarcode(ctx, String(p.barcode || p.item_id || ''), 0, y, W, barH, o.quiet)
  text(ctx, codeLine(p), W / 2, y + barH + codeH / 2, W - pad * 2, codeH * 0.95, { align: 'center' })
}

function designSizeFirst(ctx, p, W, H, o) {
  // Design 4: size in a big black box, large ₹ MRP, full-width barcode underneath
  const f = o.fields
  const pad = W * 0.035
  let y = pad * 0.6
  const topH = H * 0.14
  if (f.store) text(ctx, (o.storeName || '').toUpperCase(), pad, y + topH / 2, W * 0.6, topH * 0.9, { weight: 'bold' })
  if (f.category && p.category) text(ctx, p.category, W - pad, y + topH / 2, W * 0.35, topH * 0.7, { align: 'right' })
  y += topH + H * 0.02
  const boxH = H * 0.4
  const boxW = f.size ? Math.max(boxH * 0.9, W * 0.24) : 0
  if (boxW) {
    ctx.fillStyle = BLACK
    ctx.fillRect(pad, y, boxW, boxH)
    text(ctx, p.size || '—', pad + boxW / 2, y + boxH / 2, boxW * 0.86, boxH * 0.78, { weight: 'bold', align: 'center', color: WHITE })
  }
  const x = pad + boxW + (boxW ? pad : 0)
  const w = W - x - pad
  const meta = [p.product_name, f.color && p.color].filter(Boolean).join(' · ')
  text(ctx, meta, x, y + boxH * 0.17, w, boxH * 0.27, { weight: 'bold' })
  priceBlock(ctx, p, o, x, y + boxH * 0.34, w, boxH * 0.66, 'left')
  y += boxH + H * 0.03
  const codeH = H * 0.08
  const barH = H - y - codeH - pad * 0.3
  drawBarcode(ctx, String(p.barcode || p.item_id || ''), 0, y, W, barH, o.quiet)
  text(ctx, codeLine(p), W / 2, y + barH + codeH / 2, W - pad * 2, codeH * 0.95, { align: 'center' })
}

const DESIGNS = { classic: designClassic, modern: designModern, bold: designBold, size: designSizeFirst }

/**
 * Draw one label. Returns a canvas in the label's natural orientation (W × H mm at `dpi`).
 * Portrait labels use the Classic layout (side panels don't fit a narrow tag).
 */
export function renderLabel(product, { widthMm, heightMm, design = 'classic', fields = DEFAULT_FIELDS, storeName = '', sym = '₹', dpi = 203 }) {
  const W = Math.round((widthMm / 25.4) * dpi)
  const H = Math.round((heightMm / 25.4) * dpi)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = WHITE
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = BLACK
  const quiet = Math.round((2.5 / 25.4) * dpi)   // ≥ 2.5 mm blank space each side of the barcode
  const draw = H > W ? designClassic : (DESIGNS[design] || designClassic)
  draw(ctx, product, W, H, { fields: { ...DEFAULT_FIELDS, ...fields }, storeName, sym, quiet })
  return canvas
}

function rotated(canvas) {
  const c = document.createElement('canvas')
  c.width = canvas.height
  c.height = canvas.width
  const ctx = c.getContext('2d')
  ctx.translate(0, c.height)
  ctx.rotate(-Math.PI / 2)
  ctx.drawImage(canvas, 0, 0)
  return c
}

/**
 * Build the printable HTML for a list of { product, copies }.
 * roll: one label per page (optionally rotated for printers that feed labels sideways)
 * roll2: two labels side by side per page
 * a4-65: A4 sheets, starting at `startPos` (1-based) so a half-used sheet isn't wasted
 */
export function buildPrintHtml(jobs, { sizeValue, layout = 'roll', design, fields, storeName, sym, rotate = true, startPos = 1 }) {
  const [wMm, hMm] = labelDims(sizeValue, layout)
  const dpi = layout === 'a4-65' ? 300 : 203
  const cache = new Map()
  const imgs = []
  for (const { product, copies } of jobs) {
    if (!cache.has(product.item_id)) {
      let c = renderLabel(product, { widthMm: wMm, heightMm: hMm, design, fields, storeName, sym, dpi })
      if (layout === 'roll' && rotate && wMm > hMm) c = rotated(c)
      cache.set(product.item_id, c.toDataURL('image/png'))
    }
    for (let i = 0; i < copies; i++) imgs.push(cache.get(product.item_id))
  }

  let pageCss, body
  if (layout === 'a4-65') {
    const g = A4_65
    const per = g.cols * g.rows
    const cells = [...Array(Math.max(0, startPos - 1)).fill(null), ...imgs]
    const pages = []
    for (let i = 0; i < cells.length; i += per) pages.push(cells.slice(i, i + per))
    pageCss = '@page { size: A4; margin: 0; }'
    body = pages.map((pg) => `<div class="sheet">${pg.map((src, i) => {
      if (!src) return ''
      const col = i % g.cols, row = Math.floor(i / g.cols)
      const left = g.left + col * (g.w + g.gapX), top = g.top + row * (g.h + g.gapY)
      return `<img src="${src}" style="position:absolute;left:${left}mm;top:${top}mm;width:${g.w}mm;height:${g.h}mm">`
    }).join('')}</div>`).join('')
    body = `<style>.sheet{position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden}</style>${body}`
  } else if (layout === 'roll2') {
    const pw = wMm * 2 + ROLL2_GAP
    pageCss = `@page { size: ${pw}mm ${hMm}mm; margin: 0; }`
    const rows = []
    for (let i = 0; i < imgs.length; i += 2) rows.push(imgs.slice(i, i + 2))
    body = rows.map((r) => `<div style="display:flex;gap:${ROLL2_GAP}mm;width:${pw}mm;height:${hMm}mm;page-break-after:always">${r.map((src) => `<img src="${src}" style="width:${wMm}mm;height:${hMm}mm">`).join('')}</div>`).join('')
  } else {
    const turn = rotate && wMm > hMm
    const pw = turn ? hMm : wMm, ph = turn ? wMm : hMm
    pageCss = `@page { size: ${pw}mm ${ph}mm; margin: 0; }`
    body = imgs.map((src) => `<img src="${src}" style="width:${pw}mm;height:${ph}mm;display:block;page-break-after:always">`).join('')
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Labels</title><style>
* { margin: 0; padding: 0; box-sizing: border-box; }
${pageCss}
body { background: #fff; }
img { image-rendering: pixelated; }
@media screen { body { padding: 10px; background: #ddd; } img { box-shadow: 0 1px 4px #999; margin: 0 6px 6px 0; } .sheet { background: #fff; margin-bottom: 10px; } }
</style></head><body>${body}<script>window.onload = () => setTimeout(() => window.print(), 300)</script></body></html>`
}
