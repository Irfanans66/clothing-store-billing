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
  { value: '25x50', label: '25×50 mm (Portrait)' },
  { value: '40x30', label: '40×30 mm (Medium)' },
  { value: '38x25', label: '38×25 mm (Small)' },
  { value: '60x40', label: '60×40 mm (Large)' },
  { value: '100x50', label: '100×50 mm (XL)' },
]

// 203 DPI — standard thermal label printer resolution
const DPI = 203
const MM_PER_INCH = 25.4

function mmToPx(mm) {
  return Math.round((mm / MM_PER_INCH) * DPI)
}

async function drawLabel(product, W_mm, H_mm, storeName) {
  const W = mmToPx(W_mm)
  const H = mmToPx(H_mm)
  // For landscape labels (W > H), rotate canvas to portrait so printer won't auto-rotate
  const isLandscape = W > H
  const canvas = document.createElement('canvas')
  canvas.width  = isLandscape ? H : W
  canvas.height = isLandscape ? W : H
  const ctx = canvas.getContext('2d')
  if (isLandscape) {
    ctx.translate(0, W)
    ctx.rotate(-Math.PI / 2)
  }

  const hdrH = Math.round(H * 0.22)
  const ftrH = Math.round(H * 0.22)
  const bodyH = H - hdrH - ftrH
  const pad = Math.round(W * 0.025)

  // White background
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

  // Separator line
  ctx.strokeStyle = '#cccccc'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(pad * 2, nameY + nameSize + 2)
  ctx.lineTo(W - pad * 2, nameY + nameSize + 2)
  ctx.stroke()

  // Barcode SVG → Image → Canvas
  const bc = (product.barcode || product.item_id || '').toString()
  const barH = Math.round(bodyH * 0.50)
  const barY = nameY + nameSize + Math.round(bodyH * 0.04)

  try {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svgEl, bc, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      width: 2,
      height: barH,
    })
    const svgBlob = new Blob([svgEl.outerHTML], { type: 'image/svg+xml' })
    const svgUrl = URL.createObjectURL(svgBlob)
    await new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const barW = Math.min(W - pad * 4, img.naturalWidth || (W - pad * 4))
        ctx.drawImage(img, (W - barW) / 2, barY, barW, barH)
        URL.revokeObjectURL(svgUrl)
        resolve()
      }
      img.onerror = resolve
      img.src = svgUrl
    })
  } catch { /* skip barcode on error */ }

  // Barcode text
  ctx.fillStyle = '#555555'
  const bcTextSize = Math.round(bodyH * 0.14)
  ctx.font = `${bcTextSize}px Arial`
  ctx.textBaseline = 'top'
  ctx.fillText(bc, W / 2, barY + barH + 2)

  // Gray footer
  ctx.fillStyle = '#f0f0f0'
  ctx.fillRect(0, H - ftrH, W, ftrH)
  ctx.fillStyle = '#1A237E'
  ctx.font = `bold ${Math.round(ftrH * 0.55)}px Arial`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`MRP: Rs. ${Math.round(product.mrp || 0).toLocaleString()}`, W / 2, H - ftrH / 2)

  // Border
  ctx.strokeStyle = '#1A237E'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  return canvas.toDataURL('image/png')
}

async function printLabels(products, copies, labelSize, storeName) {
  const [wStr, hStr] = labelSize.split('x')
  const W_mm = parseInt(wStr)
  const H_mm = parseInt(hStr)
  // For landscape labels, the canvas is stored as portrait (H_mm × W_mm)
  const isLandscape = W_mm > H_mm
  const pageW = isLandscape ? H_mm : W_mm
  const pageH = isLandscape ? W_mm : H_mm
  const imgW  = isLandscape ? H_mm : W_mm
  const imgH  = isLandscape ? W_mm : H_mm

  const pngList = []
  for (const p of products) {
    const dataUrl = await drawLabel(p, W_mm, H_mm, storeName)
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

export default function BarcodeLabels() {
  const [products, setProducts]   = useState([])
  const [category, setCategory]   = useState('All')
  const [selected, setSelected]   = useState([])
  const [copies, setCopies]       = useState(2)
  const [labelSize, setLabelSize] = useState('50x25')
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
      await printLabels(sel, copies, labelSize, storeName)
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