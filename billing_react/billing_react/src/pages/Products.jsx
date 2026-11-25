import React, { useState, useEffect } from 'react'
import {
  Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col, Select, InputNumber, message, Grid,
  Dropdown, Checkbox, Spin, Empty,
} from 'antd'
import {
  SearchOutlined, PlusOutlined, BarcodeOutlined, MoreOutlined, EditOutlined, PrinterOutlined,
  InboxOutlined, CloseOutlined,
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getProducts, createProduct, updateProduct, adjustStock } from '../api/client'
import { useCurrency } from '../utils/currency'
import { useT } from '../i18n'

const { useBreakpoint } = Grid
const { Title, Text } = Typography

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const BAD     = '#C0392B'

const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']
const WAIST_SIZES  = ['26', '28', '30', '32', '34', '36', '38', '40', '42']
const KIDS_SIZES   = ['0-6M', '6-12M', '1Y', '2Y', '3Y', '4Y', '6Y', '8Y', '10Y', '12Y', '14Y']
const CATEGORIES = ['Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Kurtis', 'Sarees', 'Lehenga', 'Jackets', 'Sweaters', 'Suits', 'Kids Wear', 'Accessories', 'Other']
const GST_RATES = [0, 5, 12, 18, 28]

// Size choices that make sense for the category (waist sizes for jeans, ages for kids…)
function sizeOptionsFor(category) {
  if (['Jeans', 'Trousers'].includes(category)) return [...WAIST_SIZES, ...LETTER_SIZES, 'Free Size']
  if (category === 'Kids Wear') return [...KIDS_SIZES, ...LETTER_SIZES]
  if (['Sarees', 'Accessories'].includes(category)) return ['Free Size', ...LETTER_SIZES]
  return [...LETTER_SIZES, ...WAIST_SIZES, 'Free Size']
}

const CSS = `
.pr-card { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 12px 14px; margin-bottom: 10px; }
.pr-bar { position: sticky; bottom: 12px; z-index: 20; display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  background: var(--bg); border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,0.18); padding: 10px 14px; margin-top: 12px; }
.pr-table .ant-table-row { cursor: pointer; }
@media (max-width: 767px) { .pr-bar { position: fixed; left: 10px; right: 10px; bottom: calc(72px + env(safe-area-inset-bottom)); margin: 0; z-index: 990; } }
`

export default function Products() {
  const t = useT()
  // Dashboard links: ?low=1 (low stock), ?add=1 (open Add Product), ?search=ITM001
  const [searchParams] = useSearchParams()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(searchParams.get('search') || '')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly] = useState(searchParams.get('low') === '1')
  const [formOpen, setFormOpen] = useState(searchParams.get('add') === '1')
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [stockModal, setStockModal] = useState(null)
  const [stockDelta, setStockDelta] = useState(0)
  const [selected, setSelected] = useState([])
  const [form] = Form.useForm()
  const formCategory = Form.useWatch('category', form)
  const navigate = useNavigate()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()
  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`

  function fetchList(next = { search, category, lowOnly }) {
    const params = { limit: 2000 }
    if (next.search) params.search = next.search
    if (next.category) params.category = next.category
    if (next.lowOnly) params.low_stock = true
    return getProducts(params).then((list) => setProducts(list || [])).catch(() => setProducts([]))
  }
  function reload(patch = {}) {
    setLoading(true)
    fetchList({ search, category, lowOnly, ...patch }).finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchList().finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const goLabels = (ids, copies) => navigate(`/barcode-labels?items=${ids.join(',')}${copies ? `&copies=${copies}` : ''}`)

  // Offer to print labels right after new stock arrives
  function offerLabels(product, count) {
    if (!count || count <= 0) return
    Modal.confirm({
      title: t(count > 1 ? 'Print {n} labels for {name}?' : 'Print {n} label for {name}?', { n: count, name: product.product_name }),
      content: t('One label for each new piece, ready to tag.'),
      okText: t(count > 1 ? 'Print {n} labels' : 'Print {n} label', { n: count }), cancelText: t('Not now'),
      icon: <PrinterOutlined style={{ color: PRIMARY }} />,
      onOk: () => goLabels([product.item_id], count),
    })
  }

  // ── Add / edit ─────────────────────────────────────────────────────────────
  function openForm(p = null) {
    setEditing(p)
    form.resetFields()
    if (p) form.setFieldsValue(p)
    setFormOpen(true)
  }
  async function saveProduct(values) {
    setSaving(true)
    try {
      if (editing) {
        await updateProduct(editing.item_id, values)
        message.success(t('Product updated'))
        setFormOpen(false)
        reload()
      } else {
        const created = await createProduct(values)
        setFormOpen(false)
        reload()
        if ((created?.stock_qty || 0) > 0) offerLabels(created, created.stock_qty)
        else message.success(t('Product added'))
      }
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  async function handleAdjustStock() {
    if (!stockDelta) return
    try {
      const updated = await adjustStock(stockModal.item_id, stockDelta)
      setStockModal(null)
      reload()
      if (stockDelta > 0) offerLabels(updated || stockModal, stockDelta)
      else message.success(t('Stock updated'))
      setStockDelta(0)
    } catch (err) { message.error(err.message) }
  }

  const rowMenu = (p) => ({
    items: [
      { key: 'edit', icon: <EditOutlined />, label: t('Edit') },
      { key: 'stock', icon: <InboxOutlined />, label: t('Adjust stock') },
      { key: 'labels', icon: <PrinterOutlined />, label: t('Print labels') },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'edit') openForm(p)
      if (key === 'stock') { setStockModal(p); setStockDelta(0) }
      if (key === 'labels') goLabels([p.item_id], 'stock')
    },
  })

  const stockCell = (p) => (
    p.stock_qty <= 0 ? <Tag color="red" style={{ margin: 0 }}>{t('Out of stock')}</Tag>
      : <Tag color={p.stock_qty <= p.min_stock ? 'orange' : 'green'} style={{ margin: 0 }}>{p.stock_qty}</Tag>
  )

  const columns = [
    {
      title: t('Product'), dataIndex: 'product_name', key: 'product_name',
      render: (v, p) => (
        <div>
          <div style={{ color: TEXT, fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 12.5, color: SUB }}>{p.item_id}{p.brand ? ` · ${p.brand}` : ''}</div>
        </div>
      ),
    },
    { title: t('Category'), dataIndex: 'category', key: 'category', width: 120, render: (v) => (v ? t(v) : '—') },
    {
      title: t('Size · Colour'), key: 'sc', width: 130,
      render: (_, p) => <span style={{ color: TEXT }}>{[p.size, p.color].filter(Boolean).join(' · ') || '—'}</span>,
    },
    {
      title: t('Price'), key: 'price', width: 120, align: 'right',
      render: (_, p) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <b style={{ color: TEXT }}>{money(p.selling_price)}</b>
          {p.mrp > p.selling_price && <div style={{ fontSize: 12, color: SUB }}><s>{t('MRP {amount}', { amount: money(p.mrp) })}</s></div>}
        </div>
      ),
    },
    { title: 'GST', dataIndex: 'gst_pct', key: 'gst_pct', width: 64, align: 'right', render: (v) => `${v}%` },
    { title: t('Stock'), dataIndex: 'stock_qty', key: 'stock_qty', width: 100, align: 'right', render: (_, p) => stockCell(p) },
    {
      title: '', key: 'action', width: 120, align: 'right',
      render: (_, p) => (
        <Space size={6} onClick={(e) => e.stopPropagation()}>
          <Button size="small" onClick={() => { setStockModal(p); setStockDelta(0) }}>{t('Stock')}</Button>
          <Dropdown menu={rowMenu(p)} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} aria-label={t('More actions for {name}', { name: p.product_name })} />
          </Dropdown>
        </Space>
      ),
    },
  ]

  const sizeOpts = sizeOptionsFor(formCategory)

  return (
    <div style={{ paddingBottom: isMobile && selected.length ? 80 : 0 }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>{t('Products')}</Title>
        <Space>
          <Button icon={<BarcodeOutlined />} onClick={() => navigate('/barcode-labels')}
            style={{ borderColor: PRIMARY, color: PRIMARY, fontWeight: 600 }}>
            {isMobile ? t('Labels') : t('Barcode labels')}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>{isMobile ? t('Add') : t('Add product')}</Button>
        </Space>
      </div>

      <Card style={{ borderRadius: 14 }} styles={{ body: { padding: isMobile ? 10 : 14 } }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Input placeholder={t('Search name, ID or barcode')} value={search} prefix={<SearchOutlined />} allowClear
            onChange={(e) => { setSearch(e.target.value); if (!e.target.value) reload({ search: '' }) }}
            onPressEnter={() => reload()} style={{ flex: '2 1 220px' }} />
          <Select placeholder={t('All categories')} value={category || undefined} allowClear style={{ flex: '1 1 150px' }}
            onChange={(v) => { setCategory(v || ''); reload({ category: v || '' }) }}
            options={CATEGORIES.map((c) => ({ value: c, label: t(c) }))} />
          <Checkbox checked={lowOnly} onChange={(e) => { setLowOnly(e.target.checked); reload({ lowOnly: e.target.checked }) }}
            style={{ alignSelf: 'center' }}>{t('Low stock only')}</Checkbox>
          {!isMobile && <Button onClick={() => reload()} icon={<SearchOutlined />}>{t('Search')}</Button>}
        </div>
        <Text style={{ marginBottom: 8, display: 'block', fontSize: 12.5, color: SUB }}>
          {t(products.length === 1 ? '{n} product · tick products to print their labels together' : '{n} products · tick products to print their labels together', { n: products.length })}
        </Text>

        {isMobile ? (
          loading ? <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
            : products.length === 0 ? <Empty description={t('No products found')} />
              : products.map((p) => {
                const on = selected.includes(p.item_id)
                return (
                  <div key={p.item_id} className="pr-card">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <Checkbox checked={on} style={{ marginTop: 3 }} aria-label={t('Select {name}', { name: p.product_name })}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.item_id] : s.filter((x) => x !== p.item_id)))} />
                      <div style={{ flex: 1, minWidth: 0 }} role="button" tabIndex={0} onClick={() => openForm(p)}
                        onKeyDown={(e) => { if (e.key === 'Enter') openForm(p) }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <b style={{ color: TEXT }}>{p.product_name}</b>
                          <b style={{ color: TEXT, whiteSpace: 'nowrap' }}>{money(p.selling_price)}</b>
                        </div>
                        <div style={{ fontSize: 12.5, color: SUB }}>
                          {p.item_id}{[p.size, p.color, p.category && t(p.category)].filter(Boolean).map((x) => ` · ${x}`).join('')}
                          {p.mrp > p.selling_price && <> · <s>{t('MRP {amount}', { amount: money(p.mrp) })}</s></>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, paddingLeft: 26 }}>
                      {stockCell(p)}
                      <span style={{ marginLeft: 'auto' }} />
                      <Button size="small" onClick={() => { setStockModal(p); setStockDelta(0) }}>{t('Stock')}</Button>
                      <Button size="small" icon={<PrinterOutlined />} onClick={() => goLabels([p.item_id], 'stock')}>{t('Labels')}</Button>
                    </div>
                  </div>
                )
              })
        ) : (
          <Table
            className="pr-table"
            dataSource={products} columns={columns} rowKey="item_id"
            loading={loading} size="middle" pagination={{ pageSize: 20, hideOnSinglePage: true }}
            rowSelection={{ selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true }}
            onRow={(p) => ({ onClick: () => openForm(p) })}
            locale={{ emptyText: t('No products found') }}
            scroll={{ x: 820 }}
          />
        )}
      </Card>

      {selected.length > 0 && (
        <div className="pr-bar">
          <b style={{ color: TEXT, marginRight: 'auto' }}>{t('{n} selected', { n: selected.length })}</b>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setSelected([])}>{t('Clear')}</Button>
          <Button type="primary" icon={<PrinterOutlined />} onClick={() => goLabels(selected)}>
            {t('Print labels ({n})', { n: selected.length })}
          </Button>
        </div>
      )}

      {/* Add / edit product */}
      <Modal
        title={editing ? t('Edit {name}', { name: editing.product_name }) : t('Add product')}
        open={formOpen} onCancel={() => setFormOpen(false)} width={640} destroyOnHidden
        footer={[
          ...(editing ? [<Button key="labels" icon={<PrinterOutlined />} style={{ float: 'left' }}
            onClick={() => { setFormOpen(false); goLabels([editing.item_id], 'stock') }}>{t('Print labels')}</Button>] : []),
          <Button key="cancel" onClick={() => setFormOpen(false)}>{t('Cancel')}</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>{editing ? t('Save changes') : t('Add product')}</Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={saveProduct} initialValues={{ gst_pct: 5, stock_qty: 0, min_stock: 5 }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}><Form.Item name="product_name" label={t('Product name')} rules={[{ required: true, message: t('Enter the product name') }]}><Input autoFocus /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="category" label={t('Category')}>
              <Select allowClear options={CATEGORIES.map((c) => ({ value: c, label: t(c) }))} />
            </Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="size" label={t('Size')}>
              <Select allowClear showSearch placeholder={['Jeans', 'Trousers'].includes(formCategory) ? t('e.g. 32') : t('e.g. M')}
                options={sizeOpts.map((s) => ({ value: s, label: s === 'Free Size' ? t('Free Size') : s }))} />
            </Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="color" label={t('Colour')}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="brand" label={t('Brand')}><Input /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="mrp" label={t('MRP ({sym})', { sym })} rules={[{ required: true, message: t('Enter the MRP') }]}
              extra={t('Printed on the label')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="selling_price" label={t('Selling price ({sym})', { sym })} dependencies={['mrp']}
              rules={[{ required: true, message: t('Enter the selling price') }, ({ getFieldValue }) => ({
                validator: (_, v) => (!v || !getFieldValue('mrp') || v <= getFieldValue('mrp')
                  ? Promise.resolve() : Promise.reject(new Error(t('Can’t be more than the MRP')))),
              })]}
              extra={t('Charged in New Bill')}><InputNumber min={0.01} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="gst_pct" label={t('GST %')}>
              <Select options={GST_RATES.map((g) => ({ value: g, label: `${g}%` }))} />
            </Form.Item></Col>
            {!editing && (
              <Col xs={12} sm={8}><Form.Item name="stock_qty" label={t('Opening stock')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            )}
            <Col xs={12} sm={8}><Form.Item name="min_stock" label={t('Low-stock alert at')}><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="material" label={t('Material')}><Input /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="hsn_code" label={t('HSN code')}><Input /></Form.Item></Col>
            <Col span={24}><Form.Item name="description" label={t('Description')}><Input.TextArea rows={2} /></Form.Item></Col>
          </Row>
          {editing && <Text style={{ color: SUB, fontSize: 12.5 }}>{t('Change stock with “Adjust stock” so the change is counted correctly.')}</Text>}
        </Form>
      </Modal>

      {/* Adjust stock */}
      <Modal
        title={t('Adjust stock — {name}', { name: stockModal?.product_name })}
        open={!!stockModal} onCancel={() => setStockModal(null)}
        onOk={handleAdjustStock} okText={t('Update stock')} okButtonProps={{ disabled: !stockDelta }}
      >
        {stockModal && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Text>{t('Current stock:')} <Text strong>{stockModal.stock_qty}</Text></Text>
            <InputNumber
              value={stockDelta} onChange={(v) => setStockDelta(v || 0)} style={{ width: '100%' }} size="large"
              placeholder={t('+10 for new stock, −2 to correct')}
              formatter={(v) => (v > 0 ? `+${v}` : v)} autoFocus
            />
            {stockDelta !== 0 && (
              <Text style={{ color: stockDelta < 0 && stockModal.stock_qty + stockDelta < 0 ? BAD : SUB }}>
                {t('New stock:')} <b>{stockModal.stock_qty + stockDelta}</b>
                {stockDelta > 0 && ` · ${t('you’ll be offered labels for the new pieces')}`}
              </Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
