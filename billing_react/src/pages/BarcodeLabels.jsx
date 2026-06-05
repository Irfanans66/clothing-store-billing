import React, { useState, useEffect } from 'react'
import { Card, Select, InputNumber, Button, Table, Typography, Space, message, Alert } from 'antd'
import { BarcodeOutlined, PrinterOutlined } from '@ant-design/icons'
import { getProducts, getStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'
import JsBarcode from 'jsbarcode'

const { Title, Text } = Typography
const CATEGORIES = ['All','Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga','Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const LABEL_SIZES = [
  { value: '50x25', label: '50×25 mm (Standard)' },
  { value: '40x30', label: '40×30 mm (Medium)' },
  { value: '38x25', label: '38×25 mm (Small)' },
  { value: '60x40', label: '60×40 mm (Large)' },
  { value: '100x50', label: '100×50 mm (XL)' },
]

function makeBarcodesvg(code) {
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, code, {
      format: 'CODE128',
      displayValue: false,
      margin: 0,
      width: 1.5,
      height: 40,
    })
    return svg.outerHTML
  } catch {
    return ''
  }
}

function printLabels(products, copies, labelSize, storeName) {
  const [wStr, hStr] = labelSize.split('x')
  const W = parseInt(wStr), H = parseInt(hStr)

  const labels = []
  for (const p of products) {
    const bc = p.barcode || p.item_id
    const svgHtml = makeBarcodesvg(bc)
    for (let i = 0; i < copies; i++) {
      labels.push(`
        <div class="label">
          <div class="header">${(storeName || 'STORE').substring(0, 28)}</div>
          <div class="name">${(p.product_name || '').substring(0, 30)}</div>
          <div class="barcode">${svgHtml}</div>
          <div class="bc-text">${bc}</div>
          <div class="footer">MRP: Rs. ${Math.round(p.mrp || 0).toLocaleString()}</div>
        </div>
      `)
    }
  }

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page {
    size: ${W}mm ${H}mm;
    margin: 0;
  }
  body { background: #fff; }
  .label {
    width: ${W}mm;
    height: ${H}mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 1mm 1.5mm;
    border: 0.3mm solid #1A237E;
    page-break-after: always;
    overflow: hidden;
    font-family: Arial, sans-serif;
  }
  .header {
    background: #1A237E;
    color: #fff;
    width: 100%;
    text-align: center;
    font-size: ${Math.max(5, H * 0.18)}pt;
    font-weight: bold;
    padding: 0.5mm 0;
    border-radius: 0.5mm;
    letter-spacing: 0.3px;
  }
  .name {
    font-size: ${Math.max(4.5, H * 0.15)}pt;
    font-weight: bold;
    text-align: center;
    color: #111;
    width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .barcode {
    width: 100%;
    display: flex;
    justify-content: center;
  }
  .barcode svg {
    width: ${W - 4}mm;
    height: ${H * 0.40}mm;
  }
  .bc-text {
    font-size: ${Math.max(4, H * 0.12)}pt;
    color: #555;
    text-align: center;
    letter-spacing: 0.5px;
  }
  .footer {
    background: #f5f5f5;
    width: 100%;
    text-align: center;
    font-size: ${Math.max(5.5, H * 0.18)}pt;
    font-weight: bold;
    color: #1A237E;
    padding: 0.5mm 0;
    border-radius: 0.5mm;
  }
  @media print {
    .label { page-break-after: always; }
  }
</style>
</head>
<body>
${labels.join('')}
</body>
</html>`

  const win = window.open('', '_blank', 'width=400,height=300')
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 400)
}

export default function BarcodeLabels() {
  const [products, setProducts]   = useState([])
  const [category, setCategory]   = useState('All')
  const [selected, setSelected]   = useState([])
  const [copies, setCopies]       = useState(2)
  const [labelSize, setLabelSize] = useState('50x25')
  const [loading, setLoading]     = useState(false)
  const { storeName: authStoreName } = useAuthStore()
  const [storeName, setStoreName] = useState(authStoreName || '')

  useEffect(() => {
    if (!storeName) getStoreProfile().then(p => setStoreName(p?.store_name || '')).catch(() => {})
  }, [])

  async function load() {
    setLoading(true)
    try {
      const params = category !== 'All' ? { category } : {}
      setProducts(await getProducts(params) || [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [category])

  function handlePrint() {
    const selectedProducts = products.filter(p => selected.includes(p.item_id))
    if (!selectedProducts.length) { message.warning('Select at least one product'); return }
    printLabels(selectedProducts, copies, labelSize, storeName)
  }

  const columns = [
    { title: 'Item ID', dataIndex: 'item_id', key: 'item_id', width: 90 },
    { title: 'Product', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'category', width: 110 },
    { title: 'MRP', dataIndex: 'mrp', key: 'mrp', width: 80, render: (v) => `₹${v}` },
    { title: 'Barcode', dataIndex: 'barcode', key: 'barcode',
      render: (v) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock_qty', width: 70 },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Barcode Labels</Title>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space wrap>
          <Select value={category} onChange={setCategory} style={{ width: 160 }}>
            {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
          </Select>
          <Select value={labelSize} onChange={setLabelSize} style={{ width: 200 }}>
            {LABEL_SIZES.map((s) => (
              <Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>
            ))}
          </Select>
          <Space>
            <Text>Copies:</Text>
            <InputNumber min={1} max={200} value={copies} onChange={setCopies} style={{ width: 70 }} />
          </Space>
          <Button
            type="primary" icon={<PrinterOutlined />}
            disabled={!selected.length}
            onClick={handlePrint}
          >
            Print Labels ({selected.length} selected)
          </Button>
        </Space>
      </Card>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="Select products, choose label size and copies, then click Print Labels. A print dialog will open — select your Zenpert printer and click Print."
      />

      <Card style={{ borderRadius: 12 }}>
        <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
          {selected.length} of {products.length} selected
        </Text>
        <Table
          dataSource={products} columns={columns} rowKey="item_id"
          loading={loading} size="middle" pagination={{ pageSize: 30 }}
          rowSelection={{
            selectedRowKeys: selected,
            onChange: (keys) => setSelected(keys),
          }}
          scroll={{ x: 700 }}
        />
      </Card>
    </div>
  )
}