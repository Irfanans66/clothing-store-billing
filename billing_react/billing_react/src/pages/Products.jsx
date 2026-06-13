import React, { useState, useEffect } from 'react'
import { Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col, Select, InputNumber, message, Switch } from 'antd'
import { SearchOutlined, PlusOutlined } from '@ant-design/icons'
import { getProducts, createProduct, updateProduct, adjustStock } from '../api/client'

const { Title, Text } = Typography
const SIZE_OPTIONS = ['XS','S','M','L','XL','XXL','XXXL','28','30','32','34','36','38','40','2Y','4Y','6Y','8Y','10Y','12Y','Free Size']
const CATEGORIES = ['Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga','Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const GST_RATES = [0,5,12,18,28]

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [stockModal, setStockModal] = useState(null)
  const [stockDelta, setStockDelta] = useState(0)
  const [form] = Form.useForm()

  async function load() {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (category) params.category = category
      if (lowOnly) params.low_stock = true
      setProducts(await getProducts(params) || [])
    } catch { setProducts([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [lowOnly])

  async function handleAdd(values) {
    try {
      await createProduct(values)
      message.success('Product added!')
      setAddModal(false); form.resetFields(); load()
    } catch (err) { message.error(err.message) }
  }

  async function handleAdjustStock() {
    if (!stockDelta) return
    try {
      await adjustStock(stockModal.item_id, stockDelta)
      message.success('Stock updated!'); setStockModal(null); setStockDelta(0); load()
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    { title: 'ID', dataIndex: 'item_id', key: 'item_id', width: 90 },
    { title: 'Product', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'Category', dataIndex: 'category', key: 'category',
      render: (v) => v ? <Tag>{v}</Tag> : '-' },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 60 },
    { title: 'MRP', dataIndex: 'mrp', key: 'mrp', render: (v) => `₹${v}` },
    { title: 'Sell Price', dataIndex: 'selling_price', key: 'selling_price',
      render: (v) => <Text strong>₹{v}</Text> },
    { title: 'GST%', dataIndex: 'gst_pct', key: 'gst_pct', width: 60 },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock_qty', width: 70,
      render: (v, r) => (
        <Tag color={v <= r.min_stock ? 'red' : 'green'}>{v}</Tag>
      )},
    { title: '', key: 'action', width: 80,
      render: (_, r) => (
        <Button size="small" onClick={() => { setStockModal(r); setStockDelta(0) }}>Stock</Button>
      ),
    },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>👔 Products</Title>
      <Card style={{ borderRadius: 12 }}>
        <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            <Input
              placeholder="Search product" value={search}
              onChange={(e) => setSearch(e.target.value)}
              onPressEnter={load} prefix={<SearchOutlined />} style={{ width: 220 }}
            />
            <Select placeholder="Category" value={category || undefined}
              onChange={setCategory} allowClear style={{ width: 160 }}>
              {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
            </Select>
            <Space>
              <Switch checked={lowOnly} onChange={setLowOnly} size="small" />
              <Text type="secondary" style={{ fontSize: 13 }}>Low stock only</Text>
            </Space>
            <Button type="primary" onClick={load} icon={<SearchOutlined />}>Search</Button>
          </Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)}>
            Add Product
          </Button>
        </Space>
        <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
          {products.length} product(s)
        </Text>
        <Table
          dataSource={products} columns={columns} rowKey="item_id"
          loading={loading} size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
        />
      </Card>

      {/* Add Product Modal */}
      <Modal title="Add Product" open={addModal} onCancel={() => setAddModal(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="product_name" label="Product Name *" rules={[{ required: true }]}><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="category" label="Category">
              <Select>{CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}</Select>
            </Form.Item></Col>
            <Col span={12}><Form.Item name="brand" label="Brand"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="color" label="Color"><Input /></Form.Item></Col>
            <Col span={12}><Form.Item name="size" label="Size" initialValue="M">
              <Select>{SIZE_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}</Select>
            </Form.Item></Col>
            <Col span={12}><Form.Item name="material" label="Material"><Input /></Form.Item></Col>
            <Col span={8}><Form.Item name="mrp" label="MRP (₹) *" rules={[{ required: true }]}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="selling_price" label="Selling Price *" rules={[{ required: true }]}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="gst_pct" label="GST %" initialValue={5}>
              <Select>{GST_RATES.map((g) => <Select.Option key={g} value={g}>{g}%</Select.Option>)}</Select>
            </Form.Item></Col>
            <Col span={8}><Form.Item name="stock_qty" label="Stock Qty" initialValue={0}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="min_stock" label="Min Stock" initialValue={5}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={8}><Form.Item name="hsn_code" label="HSN Code"><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="description" label="Description"><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          <Button type="primary" htmlType="submit" block>Save Product</Button>
        </Form>
      </Modal>

      {/* Stock Adjust Modal */}
      <Modal
        title={`Adjust Stock — ${stockModal?.product_name}`}
        open={!!stockModal} onCancel={() => setStockModal(null)}
        onOk={handleAdjustStock} okText="Update"
      >
        {stockModal && (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text>Current stock: <Text strong>{stockModal.stock_qty}</Text></Text>
            <InputNumber
              value={stockDelta} onChange={setStockDelta} style={{ width: '100%' }}
              placeholder="+ to restock, - for adjustment"
              formatter={(v) => v > 0 ? `+${v}` : v}
            />
          </Space>
        )}
      </Modal>
    </div>
  )
}