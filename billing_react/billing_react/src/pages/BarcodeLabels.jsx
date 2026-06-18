import React, { useState, useEffect } from 'react'
import { Card, Select, InputNumber, Button, Table, Typography, Space, Alert } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { getProducts, getStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'
import JsBarcode from 'jsbarcode'

const { Title, Text } = Typography
const CATEGORIES = ['All','Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga','Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const LABEL_SIZES = [
  { value: '50x25', label: '50×25 mm (Standard)' },
  { value: '50.8x24.9', label: '50.8×24.9 mm' },
  { value: '25x50', label: '25×50 mm (Portrait)' },
  { value: '40x30', label: '40×30 mm (Medium)' },
  { value: '38x25', label: '38×25 mm (Small)' },
  { value: '60x40', label: '60×40 mm (Large)' },
  { value: '100x50', label: '100×50 mm (XL)' },
]
const LABEL_DESIGNS = [
  { value: 'classic', label: 'Design 1 — Classic Blue' },
  { value: 'modern',  label: 'Design 2 — Modern Price Tag' },
  { value: 'bold',    label: 'Design 3 — Bold Price' },
]

const DPI = 203
const MM_PER_INCH = 25.4

function mmToPx(mm) {
  return Math.round((mm / MM_PER_INCH) * DPI)
}

// ── Shared: draw barcode SVG onto canvas ──────────────────────────────────────
async function drawBarcode(ctx, bc, x, y, w, h) {
  try {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svgEl, bc, { format: 'CODE128', displayValue: false, margin: 0, width: 2, height: h })
    const svgBlob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const bw = Math.min(w, img.naturalWidth || w)
        ctx.drawImage(img, x + (w - bw) / 2, y, bw, h)
        URL.revokeObjectURL(svgUrl)
        resolve()
      }
      img.onerror = resolve
      img.src = svgUrl
    })
  } catch { /* skip on error */ }
}

// ── Design 1: Classic Blue ────────────────────────────────────────────────────
async function drawLabelClassic(product, W_mm, H_mm, storeName) {
  const W = mmToPx(W_mm)
  const H = mmToPx(H_mm)
  const isLandscape = W > H
  const canvas = document.createElement('canvas')
  canvas.width  = isLandscape ? H : W
  canvas.height = isLandscape ? W : H
  const ctx = canvas.getContext('2d')
  if (isLandscape) { ctx.translate(0, W); ctx.rotate(-Math.PI / 2) }

  const hdrH = Math.round(H * 0.22)
  const ftrH = Math.round(H * 0.22)
  const bodyH = H - hdrH - ftrH
  const pad = Math.round(W * 0.025)

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Blue header
  ctx.fillStyle = '#1A237E'
  ctx.fillRect(0, 0, W, hdrH)
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${Math.round(hdrH * 0.55)}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText((storeName || 'STORE').substring(0, 26), W / 2, hdrH / 2)

  // Product name + size
  ctx.fillStyle = '#111111'
  const nameSize = Math.round(bodyH * 0.22)
  ctx.font = `bold ${nameSize}px Arial`
  ctx.textBaseline = 'top'
  const nameY = hdrH + Math.round(bodyH * 0.06)
  const nameText = (product.product_name || '').substring(0, 22)
  const sizeColor = [product.size, product.color].filter(Boolean).join(' / ')
  const sizeText = sizeColor ? ` (${sizeColor})` : ''
  ctx.fillText((nameText + sizeText).substring(0, 32), W / 2, nameY)

  // Category
  if (product.category) {
    ctx.fillStyle = '#555555'
    ctx.font = `${Math.round(bodyH * 0.16)}px Arial`
    ctx.fillText(product.category, W / 2, nameY + nameSize + Math.round(bodyH * 0.01))
  }
  const catH = product.category ? Math.round(bodyH * 0.18) : 0

  // Separator
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  const sepY = nameY + nameSize + catH + Math.round(bodyH * 0.02)
  ctx.beginPath(); ctx.moveTo(pad * 2, sepY); ctx.lineTo(W - pad * 2, sepY); ctx.stroke()

  // Barcode
  const bc = (product.barcode || product.item_id || '').toString()
  const barH = Math.round(bodyH * 0.28)
  const barY = sepY + Math.round(bodyH * 0.03)
  await drawBarcode(ctx, bc, pad * 2, barY, W - pad * 4, barH)

  // Footer — MRP + barcode number
  const bcLine = product.item_id ? `${bc}  |  ${product.item_id}` : bc
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, H - ftrH, W, ftrH)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#1A237E'
  ctx.font = `bold ${Math.round(ftrH * 0.38)}px Arial`
  ctx.fillText(`MRP: Rs. ${Math.round(product.mrp || 0).toLocaleString()}`, W / 2, H - ftrH + Math.round(ftrH * 0.33))

  ctx.fillStyle = '#333333'
  ctx.font = `${Math.round(ftrH * 0.24)}px Arial`
  ctx.fillText(bcLine, W / 2, H - ftrH + Math.round(ftrH * 0.72))

  // Border
  ctx.strokeStyle = '#1A237E'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  return canvas.toDataURL('image/png')
}

// ── Design 2: Modern Price Tag ────────────────────────────────────────────────
// Layout (landscape): left accent bar | product info + MRP big | barcode right
// Layout (portrait):  accent line at top | name | big MRP | barcode | bc number
async function drawLabelModern(product, W_mm, H_mm, storeName) {
  const W = mmToPx(W_mm)
  const H = mmToPx(H_mm)
  const isLandscape = W > H
  const canvas = document.createElement('canvas')
  canvas.width  = isLandscape ? H : W
  canvas.height = isLandscape ? W : H
  const ctx = canvas.getContext('2d')
  if (isLandscape) { ctx.translate(0, W); ctx.rotate(-Math.PI / 2) }

  const pad = Math.round(W * 0.03)
  const bc  = (product.barcode || product.item_id || '').toString()
  const bcLine = product.item_id ? `${bc}  |  ${product.item_id}` : bc
  const mrpText = `Rs. ${Math.round(product.mrp || 0).toLocaleString()}`

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Accent bar on left (14% width)
  const accentW = Math.round(W * 0.14)
  ctx.fillStyle = '#7C3AED'
  ctx.fillRect(0, 0, accentW, H)

  // Store name vertical on accent bar
  const storeNameStr = (storeName || 'STORE').substring(0, 16).toUpperCase()
  const storeFontSz = Math.round(Math.min(accentW * 0.55, H * 0.09))
  ctx.save()
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${storeFontSz}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(accentW / 2, H / 2)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(storeNameStr, 0, 0)
  ctx.restore()

  // Right content area
  const contentX = accentW + pad
  const contentW = W - accentW - pad * 2

  // Product name (top)
  const nameFontSz = Math.round(H * 0.13)
  ctx.fillStyle = '#1a1a1a'
  ctx.font = `bold ${nameFontSz}px Arial`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  const nameText = (product.product_name || '').substring(0, 24)
  ctx.fillText(nameText, contentX, Math.round(H * 0.05))

  // Size / Color / Category  (smaller, gray)
  const metaFontSz = Math.round(H * 0.09)
  ctx.fillStyle = '#666666'
  ctx.font = `${metaFontSz}px Arial`
  const sizeColor = [product.size, product.color, product.category].filter(Boolean).join(' · ')
  if (sizeColor) ctx.fillText(sizeColor.substring(0, 30), contentX, Math.round(H * 0.05) + nameFontSz + 2)

  // Divider line
  const divY = Math.round(H * 0.05) + nameFontSz + metaFontSz + Math.round(H * 0.04)
  ctx.strokeStyle = '#e0e0e0'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(contentX, divY)
  ctx.lineTo(W - pad, divY)
  ctx.stroke()

  // Big MRP
  const mrpFontSz = Math.round(H * 0.22)
  ctx.fillStyle = '#7C3AED'
  ctx.font = `bold ${mrpFontSz}px Arial`
  ctx.textBaseline = 'top'
  ctx.fillText(mrpText, contentX, divY + Math.round(H * 0.03))

  // "MRP" label small above the price
  ctx.fillStyle = '#999999'
  ctx.font = `${Math.round(H * 0.09)}px Arial`
  ctx.fillText('MRP', contentX, divY + Math.round(H * 0.03) + mrpFontSz + 1)

  // Barcode (bottom portion)
  const barY   = Math.round(H * 0.60)
  const barH   = Math.round(H * 0.25)
  const barX   = contentX
  const barW   = contentW
  await drawBarcode(ctx, bc, barX, barY, barW, barH)

  // Barcode number
  const bcFontSz = Math.round(H * 0.08)
  ctx.fillStyle = '#444444'
  ctx.font = `${bcFontSz}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(bcLine, contentX + contentW / 2, barY + barH + 2)

  // Outer border
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  return canvas.toDataURL('image/png')
}

// ── Design 3: Bold Price ──────────────────────────────────────────────────────
// Layout: thin orange left edge | top row (name + store) | thick orange rule |
//         huge MRP centered | size/color right | thin rule | barcode + number
async function drawLabelBold(product, W_mm, H_mm, storeName) {
  const W = mmToPx(W_mm)
  const H = mmToPx(H_mm)
  const isLandscape = W > H
  const canvas = document.createElement('canvas')
  canvas.width  = isLandscape ? H : W
  canvas.height = isLandscape ? W : H
  const ctx = canvas.getContext('2d')
  if (isLandscape) { ctx.translate(0, W); ctx.rotate(-Math.PI / 2) }

  const ORANGE = '#E65100'
  const DARK   = '#1a1a1a'
  const GRAY   = '#666666'
  const pad    = Math.round(W * 0.035)
  const accentW = Math.max(3, Math.round(W * 0.025))

  // White background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // Orange left accent strip
  ctx.fillStyle = ORANGE
  ctx.fillRect(0, 0, accentW, H)

  const cX = accentW + pad       // content left edge
  const cW = W - accentW - pad   // content width

  // ── TOP ROW: product name (left) + store name (right) ────────────────────
  const topH   = Math.round(H * 0.26)
  const nameSz = Math.round(topH * 0.48)
  const storeSz = Math.round(topH * 0.28)

  ctx.fillStyle = DARK
  ctx.font = `bold ${nameSz}px Arial`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  const nameStr = (product.product_name || '').substring(0, 22)
  ctx.fillText(nameStr, cX, Math.round(topH * 0.38))

  ctx.fillStyle = GRAY
  ctx.font = `${storeSz}px Arial`
  ctx.textAlign = 'right'
  const storeStr = (storeName || 'STORE').substring(0, 18).toUpperCase()
  ctx.fillText(storeStr, W - pad, Math.round(topH * 0.38))

  // Size / Color / Category (second line of top row)
  const metaSz  = Math.round(topH * 0.28)
  const metaParts = [product.size, product.color, product.category].filter(Boolean)
  if (metaParts.length) {
    ctx.fillStyle = GRAY
    ctx.font = `${metaSz}px Arial`
    ctx.textAlign = 'left'
    ctx.fillText(metaParts.join('  ·  ').substring(0, 34), cX, Math.round(topH * 0.78))
  }

  // ── THICK ORANGE RULE ─────────────────────────────────────────────────────
  const rule1Y = topH
  ctx.fillStyle = ORANGE
  ctx.fillRect(accentW, rule1Y, W - accentW, Math.max(2, Math.round(H * 0.025)))
  const afterRule1 = rule1Y + Math.max(2, Math.round(H * 0.025))

  // ── MRP ZONE (middle ~36% of H) ───────────────────────────────────────────
  const mrpZoneH = Math.round(H * 0.36)
  const mrpZoneMid = afterRule1 + Math.round(mrpZoneH / 2)

  // "MRP" tiny label
  const mrpLabelSz = Math.round(mrpZoneH * 0.18)
  ctx.fillStyle = GRAY
  ctx.font      = `${mrpLabelSz}px Arial`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('MRP', cX, afterRule1 + Math.round(mrpZoneH * 0.08))

  // Big price
  const priceSz = Math.round(mrpZoneH * 0.58)
  const priceStr = `Rs. ${Math.round(product.mrp || 0).toLocaleString()}`
  ctx.fillStyle   = DARK
  ctx.font        = `bold ${priceSz}px Arial`
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(priceStr, accentW + (W - accentW) / 2, mrpZoneMid + Math.round(mrpZoneH * 0.06))

  // ── THIN RULE ─────────────────────────────────────────────────────────────
  const rule2Y = afterRule1 + mrpZoneH
  ctx.strokeStyle = '#dddddd'
  ctx.lineWidth   = 1
  ctx.beginPath()
  ctx.moveTo(accentW + pad, rule2Y)
  ctx.lineTo(W - pad, rule2Y)
  ctx.stroke()
  const afterRule2 = rule2Y + 1

  // ── BARCODE ZONE (remaining height) ───────────────────────────────────────
  const barZoneH  = H - afterRule2
  const barH      = Math.round(barZoneH * 0.60)
  const barY      = afterRule2 + Math.round(barZoneH * 0.06)
  const bc        = (product.barcode || product.item_id || '').toString()
  await drawBarcode(ctx, bc, cX, barY, cW - pad, barH)

  // Barcode number
  const bcNumSz  = Math.round(barZoneH * 0.16)
  const bcLine   = product.item_id ? `${bc}  |  ${product.item_id}` : bc
  ctx.fillStyle  = '#333333'
  ctx.font       = `${bcNumSz}px Arial`
  ctx.textAlign  = 'center'
  ctx.textBaseline = 'top'
  ctx.fillText(bcLine, accentW + (W - accentW) / 2, barY + barH + 2)

  // Outer border
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth   = 1
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1)

  return canvas.toDataURL('image/png')
}

// ── Print orchestrator ────────────────────────────────────────────────────────
async function printLabels(products, copies, labelSize, storeName, design) {
  const [wStr, hStr] = labelSize.split('x')
  const W_mm = parseFloat(wStr)
  const H_mm = parseFloat(hStr)
  const isLandscape = W_mm > H_mm
  const pageW = isLandscape ? H_mm : W_mm
  const pageH = isLandscape ? W_mm : H_mm
  const imgW  = isLandscape ? H_mm : W_mm
  const imgH  = isLandscape ? W_mm : H_mm

  const drawFn = design === 'modern' ? drawLabelModern
               : design === 'bold'   ? drawLabelBold
               : drawLabelClassic

  const pngList = []
  for (const p of products) {
    const dataUrl = await drawFn(p, W_mm, H_mm, storeName)
    for (let i = 0; i < copies; i++) pngList.push(dataUrl)
  }

  const imgTags = pngList.map(src =>
    `<img src="${src}" style="width:${imgW}mm;height:${imgH}mm;display:block;page-break-after:always;" />`
  ).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  @page { size:${pageW}mm ${pageH}mm; margin:0; }
  body { background:#fff; }
  img { width:${imgW}mm; height:${imgH}mm; display:block; page-break-after:always; }
  @media screen {
    body { padding:10px; background:#eee; }
    img { box-shadow:0 2px 8px #aaa; margin-bottom:8px; }
  }
</style>
</head>
<body>${imgTags}</body>
</html>`

  const win = window.open('', '_blank', 'width=600,height=500')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 600)
}

// ── React component ───────────────────────────────────────────────────────────
export default function BarcodeLabels() {
  const [products, setProducts]   = useState([])
  const [category, setCategory]   = useState('All')
  const [selected, setSelected]   = useState([])
  const [copies, setCopies]       = useState(2)
  const [labelSize, setLabelSize] = useState('50x25')
  const [design, setDesign]       = useState('classic')
  const [loading, setLoading]     = useState(false)
  const [printing, setPrinting]   = useState(false)
  const [storeName, setStoreName] = useState('')
  const { storeName: authStoreName } = useAuthStore()

  useEffect(() => {
    const name = authStoreName || ''
    setStoreName(name)
    if (!name) getStoreProfile().then(p => setStoreName(p?.store_name || '')).catch(() => {})
  }, [authStoreName])

  async function load() {
    setLoading(true)
    try {
      const params = category !== 'All' ? { category } : {}
      setProducts(await getProducts(params) || [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [category])

  async function handlePrint() {
    const sel = products.filter(p => selected.includes(p.item_id))
    if (!sel.length) return
    setPrinting(true)
    try {
      await printLabels(sel, copies, labelSize, storeName, design)
    } catch (e) {
      console.error(e)
    } finally {
      setPrinting(false)
    }
  }

  const columns = [
    { title: 'Item ID', dataIndex: 'item_id', key: 'item_id', width: 90 },
    { title: 'Product', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 110 },
    { title: 'MRP', dataIndex: 'mrp', key: 'mrp', width: 80, render: v => `₹${v}` },
    { title: 'Barcode', dataIndex: 'barcode', key: 'barcode',
      render: v => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock_qty', width: 70 },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Barcode Labels</Title>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space wrap>
          <Select value={category} onChange={setCategory} style={{ width: 160 }}>
            {CATEGORIES.map(c => <Select.Option key={c} value={c}>{c}</Select.Option>)}
          </Select>
          <Select value={labelSize} onChange={setLabelSize} style={{ width: 200 }}>
            {LABEL_SIZES.map(s => <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>)}
          </Select>
          <Select value={design} onChange={setDesign} style={{ width: 220 }}>
            {LABEL_DESIGNS.map(d => <Select.Option key={d.value} value={d.value}>{d.label}</Select.Option>)}
          </Select>
          <Space>
            <Text>Copies:</Text>
            <InputNumber min={1} max={200} value={copies} onChange={setCopies} style={{ width: 70 }} />
          </Space>
          <Button
            type="primary" icon={<PrinterOutlined />}
            disabled={!selected.length} loading={printing}
            onClick={handlePrint}
          >
            Print Labels ({selected.length} selected)
          </Button>
        </Space>
      </Card>

      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        message='Select products → click Print Labels → in the print dialog: choose your Zenpert printer, set paper size to your label size, set Scale to "Actual size", then Print.' />

      <Card style={{ borderRadius: 12 }}>
        <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
          {selected.length} of {products.length} selected
        </Text>
        <Table
          dataSource={products} columns={columns} rowKey="item_id"
          loading={loading} size="middle" pagination={{ pageSize: 30 }}
          rowSelection={{ selectedRowKeys: selected, onChange: keys => setSelected(keys) }}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  )
}