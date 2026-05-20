import React, { useState, useEffect } from 'react'
import { Card, Select, InputNumber, Button, Table, Typography, Space, message, Alert } from 'antd'
import { BarcodeOutlined } from '@ant-design/icons'
import { getProducts } from '../api/client'
import { openPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const CATEGORIES = ['All','Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga','Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const LABEL_SIZES = [
  { value: '50x25', label: '50×25 mm (Standard)' },
  { value: '40x30', label: '40×30 mm (Medium)' },
  { value: '38x25', label: '38×25 mm (Small)' },
  { value: '60x40', label: '60×40 mm (Large)' },
  { value: '100x50', label: '100×50 mm (XL)' },
]

export default function BarcodeLabels() {
  const [products, setProducts] = useState([])
  const [category, setCategory] = useState('All')
  const [selected, setSelected] = useState([])
  const [copies, setCopies] = useState(2)
  const [labelSize, setLabelSize] = useState('50x25')
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = category !== 'All' ? { category } : {}
      setProducts(await getProducts(params) || [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [category])

  async function generateLabels() {
    if (!selected.length) return
    setGenerating(true)
    try {
      const ids = selected.join(',')
      await openPdfWithAuth(
        `/products/labels?ids=${ids}&copies=${copies}&size=${labelSize}`,
        `Labels_${labelSize}.pdf`
      )
    } catch (err) {
      message.error('Label PDF failed: ' + err.message)
    } finally {
      setGenerating(false)
    }
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
            <Text>Copies per product:</Text>
            <InputNumber min={1} max={200} value={copies} onChange={setCopies} style={{ width: 80 }} />
          </Space>
          <Button
            type="primary" icon={<BarcodeOutlined />}
            disabled={!selected.length}
            loading={generating}
            onClick={generateLabels}
          >
            Generate Labels ({selected.length} selected)
          </Button>
        </Space>
      </Card>

      <Alert
        type="info" showIcon style={{ marginBottom: 12 }}
        message="Select products from the table, choose label size and copies, then click Generate Labels."
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