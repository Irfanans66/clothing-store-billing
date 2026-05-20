import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Row, Col, Input, Button, InputNumber, Select, Table, Space, Tag,
  Typography, Divider, Radio, Statistic, Form, message, Checkbox, Modal,
  Spin, Alert,
} from 'antd'
import {
  SearchOutlined, DeleteOutlined, PlusOutlined, PrinterOutlined,
  WhatsAppOutlined, ClearOutlined, UserAddOutlined,
} from '@ant-design/icons'
import { getCustomers, createCustomer, getProduct, getProducts, createBill, getStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { printPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const SIZE_OPTIONS = ['XS','S','M','L','XL','XXL','XXXL','28','30','32','34','36','38','40',
  '2Y','4Y','6Y','8Y','10Y','12Y','Free Size']
const PAYMENT_MODES = ['Cash','UPI','Credit Card','Debit Card','Net Banking']
const MEMBER_TYPES = ['Regular','Silver','Gold','Platinum']
const CATEGORIES = ['Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga',
  'Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const GST_RATES = [0,5,12,18,28]

function buildUpiQrUrl(upiId, storeName, amount, billNo) {
  return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount}&cu=INR&tn=Bill%20${billNo}`
}

function buildWhatsAppMsg(bill, storeName, storeProfile) {
  const { phone = '', address = '', gstin = '', upi_id = '' } = storeProfile || {}
  const sep = '─'.repeat(28)
  let items = bill.items.map(it =>
    `  ${it.product_name.slice(0,20)} (${it.size}) ×${it.qty} = ₹${it.subtotal}`
  ).join('\n')

  let msg = `🧾 *Receipt — ${storeName}*\n${sep}\n`
  if (address) msg += `📍 ${address}\n`
  if (phone)   msg += `📞 ${phone}${gstin ? `  |  GST: ${gstin}` : ''}\n`
  msg += `${sep}\n📄 *Bill No:* ${bill.bill_no}\n📅 Date: ${bill.bill_date}  ${bill.bill_time}\n👤 Cust: ${bill.customer_name || 'Walk-in'}\n${sep}\n*ITEMS:*\n${items}\n${sep}\n  Subtotal : ₹${Math.round(bill.subtotal)}\n`
  if (bill.discount > 0) msg += `  Discount : -₹${Math.round(bill.discount)}\n`
  msg += `  GST      : ₹${Math.round(bill.gst_total)}\n  *TOTAL   : ₹${Math.round(bill.grand_total)}*\n${sep}\n  Payment  : ${bill.payment_mode}\n  Paid     : ₹${Math.round(bill.amount_paid)}\n`
  if (bill.change_amt > 0) msg += `  Change   : ₹${Math.round(bill.change_amt)}\n`
  if (upi_id) {
    msg += `\n${sep}\n💳 *Pay via UPI:*\n  UPI ID : ${upi_id}\n  Amount : ₹${Math.round(bill.grand_total)}\n  Ref    : ${bill.bill_no}\n`
  }
  msg += `\n${sep}\n🙏 *Thank you! Visit again.*\n_Exchange within 7 days with receipt_`
  return msg
}

export default function NewBill() {
  const { storeName } = useAuthStore()

  // ── State ──────────────────────────────────────────────────────────────────
  const [customer, setCustomer] = useState(null)
  const [walkIn, setWalkIn] = useState(false)
  const [custSearch, setCustSearch] = useState('')
  const [custResults, setCustResults] = useState([])
  const [newCustModal, setNewCustModal] = useState(false)
  const [custLoading, setCustLoading] = useState(false)

  const [cart, setCart] = useState([])
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState(1)
  const [size, setSize] = useState('M')
  const [searchHits, setSearchHits] = useState([])
  const [addingItem, setAddingItem] = useState(false)

  const [discType, setDiscType] = useState('%')
  const [discVal, setDiscVal] = useState(0)
  const [payMode, setPayMode] = useState('Cash')
  const [amountPaid, setAmountPaid] = useState(0)
  const [notes, setNotes] = useState('')

  const [billing, setBilling] = useState(false)
  const [lastBill, setLastBill] = useState(null)
  const [storeProfile, setStoreProfile] = useState(null)

  const itemInputRef = useRef(null)

  useEffect(() => {
    getStoreProfile().then(setStoreProfile).catch(() => {})
  }, [])

  // ── Customer Search ────────────────────────────────────────────────────────
  async function searchCustomer() {
    if (!custSearch.trim()) return
    setCustLoading(true)
    try {
      const res = await getCustomers({ search: custSearch.trim() })
      setCustResults(res || [])
    } catch {
      message.error('Customer search failed')
    } finally {
      setCustLoading(false)
    }
  }

  // ── Add to Cart ────────────────────────────────────────────────────────────
  function pushToCart(prod, q = qty, sz = size, priceOverride = null) {
    const sp  = priceOverride ?? prod.selling_price ?? prod.mrp ?? 0
    const mrp = prod.mrp ?? sp
    const gst = prod.gst_pct ?? 5
    const disc = mrp > 0 ? Math.round((1 - sp / mrp) * 1000) / 10 : 0
    const sub  = Math.round(sp * q)
    const gamt = Math.round(sub * gst / 100)
    const key  = `${prod.item_id}__${sz}`

    setCart((prev) => {
      const idx = prev.findIndex((it) => it._key === key)
      if (idx >= 0) {
        const updated = [...prev]
        const ex = updated[idx]
        const newQ = ex.qty + q
        updated[idx] = {
          ...ex, qty: newQ,
          subtotal: Math.round(ex.selling_price * newQ),
          gst_amt:  Math.round(Math.round(ex.selling_price * newQ) * gst / 100),
          item_total: Math.round(Math.round(ex.selling_price * newQ) * (1 + gst / 100)),
        }
        return updated
      }
      return [...prev, {
        _key: key, item_id: prod.item_id, product_name: prod.product_name,
        category: prod.category || '', size: sz, color: prod.color || '',
        qty: q, mrp, selling_price: sp, discount_pct: disc,
        subtotal: sub, gst_pct: gst, gst_amt: gamt, item_total: sub + gamt,
      }]
    })
    message.success(`Added ${prod.product_name} ×${q}`, 1.5)
    setSearchHits([])
    setItemId('')
    setQty(1)
    setTimeout(() => itemInputRef.current?.focus(), 50)
  }

  async function handleItemEnter(e) {
    const val = e.target.value.trim()
    if (!val) return
    setAddingItem(true)
    try {
      // Try exact match
      const exact = await getProduct(val.toUpperCase()).catch(() =>
        val !== val.toUpperCase() ? getProduct(val).catch(() => null) : null
      )
      if (exact) { pushToCart(exact); return }

      // Fall back to search
      const hits = await getProducts({ search: val })
      if (!hits?.length) { message.warning(`No product found for "${val}"`); setItemId(''); return }
      if (hits.length === 1) { pushToCart(hits[0]); return }
      setSearchHits(hits)
    } catch {
      message.error('Product lookup failed')
    } finally {
      setAddingItem(false)
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const rawSub = cart.reduce((s, i) => s + i.subtotal, 0)
  const rawGst = cart.reduce((s, i) => s + i.gst_amt, 0)
  const disc   = discType === '%'
    ? Math.round(rawSub * discVal / 100)
    : Math.min(discVal, rawSub)
  const adjSub = rawSub - disc
  const adjGst = rawSub > 0 ? Math.round(rawGst / rawSub * adjSub) : 0
  const grand  = Math.round(adjSub + adjGst)
  const change = Math.round(amountPaid - grand)

  useEffect(() => { setAmountPaid(grand) }, [grand])

  // ── Generate Bill ──────────────────────────────────────────────────────────
  async function handleGenerateBill() {
    if (!customer) { message.error('Select a customer first'); return }
    if (!cart.length) { message.error('Add at least one item'); return }
    if (amountPaid < grand) { message.error('Amount paid is less than total'); return }

    setBilling(true)
    try {
      const payload = {
        customer_id:   customer.customer_id,
        customer_name: customer.name,
        phone:         customer.phone || '',
        items: cart.map(({ _key, item_total, ...it }) => it),
        discount: disc, discount_type: discType,
        payment_mode: payMode,
        amount_paid: amountPaid,
        notes,
      }
      const res = await createBill(payload)
      setLastBill(res)
      setCart([]); setCustomer(null); setWalkIn(false)
      setCustSearch(''); setCustResults([])
      setDiscVal(0); setNotes('')
      message.success(`Bill ${res.bill_no} generated!`)
    } catch (err) {
      message.error(err.message)
    } finally {
      setBilling(false)
    }
  }

  // ── Cart columns ──────────────────────────────────────────────────────────
  const cartCols = [
    { title: 'Item', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 70 },
    { title: 'Qty',  dataIndex: 'qty', key: 'qty', width: 60,
      render: (v, rec) => (
        <InputNumber min={1} value={v} size="small" style={{ width: 60 }}
          onChange={(nv) => setCart((prev) => prev.map((it) =>
            it._key === rec._key
              ? { ...it, qty: nv, subtotal: Math.round(it.selling_price * nv),
                  gst_amt: Math.round(Math.round(it.selling_price * nv) * it.gst_pct / 100),
                  item_total: Math.round(Math.round(it.selling_price * nv) * (1 + it.gst_pct / 100)) }
              : it
          ))} />
      ),
    },
    { title: 'Price', dataIndex: 'selling_price', key: 'selling_price', width: 80,
      render: (v) => `₹${v}` },
    { title: 'Sub', dataIndex: 'subtotal', key: 'subtotal', width: 80,
      render: (v) => `₹${Math.round(v)}` },
    { title: '', key: 'del', width: 40,
      render: (_, rec) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => setCart((p) => p.filter((i) => i._key !== rec._key))} />
      ),
    },
  ]

  // ── Receipt ────────────────────────────────────────────────────────────────
  function ReceiptPreview({ bill }) {
    const upiId = storeProfile?.upi_id
    const qrUrl = upiId ? buildUpiQrUrl(upiId, storeName, Math.round(bill.grand_total), bill.bill_no) : null

    return (
      <div style={{ fontFamily: 'Courier New, monospace', fontSize: 13, maxWidth: 310, margin: '0 auto',
        background: '#fff', border: '1px dashed #aaa', borderRadius: 6, padding: '20px 14px' }}>
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: 15 }}>★ {storeName} ★</div>
        {storeProfile?.address && <div style={{ textAlign: 'center', fontSize: 10 }}>{storeProfile.address}</div>}
        {storeProfile?.phone && <div style={{ textAlign: 'center', fontSize: 9 }}>Ph: {storeProfile.phone}{storeProfile.gstin ? `  GSTIN: ${storeProfile.gstin}` : ''}</div>}
        <Divider dashed style={{ margin: '8px 0' }} />
        <div><b>Bill # :</b> {bill.bill_no}</div>
        <div>Date   : {bill.bill_date}  {bill.bill_time}</div>
        <div>Cust   : {bill.customer_name || 'Walk-in'}</div>
        <div>Phone  : {bill.phone || '-'}</div>
        <Divider dashed style={{ margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
          <span>Item</span><span>Amt</span>
        </div>
        <Divider dashed style={{ margin: '4px 0' }} />
        {bill.items?.map((it, i) => (
          <div key={i}>
            <div>{String(it.product_name || '').slice(0,22)} ({it.size})</div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{it.qty}×₹{it.selling_price}</span>
              <span>₹{Math.round(it.subtotal)}</span>
            </div>
          </div>
        ))}
        <Divider dashed style={{ margin: '8px 0' }} />
        {bill.discount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Discount ({bill.discount_type})</span>
            <span>-₹{Math.round(bill.discount)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>GST</span><span>₹{Math.round(bill.gst_total)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15 }}>
          <span>TOTAL</span><span>₹{Math.round(bill.grand_total)}</span>
        </div>
        <Divider dashed style={{ margin: '8px 0' }} />
        <div>Payment : {bill.payment_mode}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Paid</span><span>₹{Math.round(bill.amount_paid)}</span>
        </div>
        {bill.change_amt > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Change</span><span>₹{Math.round(bill.change_amt)}</span>
          </div>
        )}
        {qrUrl && (
          <>
            <Divider dashed style={{ margin: '8px 0' }} />
            <div style={{ textAlign: 'center' }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=130x130&data=${encodeURIComponent(qrUrl)}`}
                alt="UPI QR" width={130} height={130}
                style={{ border: '1px solid #eee', borderRadius: 6 }}
              />
              <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Scan & Pay ₹{Math.round(bill.grand_total)}</div>
              <div style={{ fontSize: 9, color: '#888' }}>{upiId}</div>
            </div>
          </>
        )}
        <Divider dashed style={{ margin: '8px 0' }} />
        <div style={{ textAlign: 'center', fontWeight: 700 }}>★ Thank You! Visit Again ★</div>
        <div style={{ textAlign: 'center', fontSize: 10 }}>Exchange within 7 days with receipt</div>
      </div>
    )
  }

  // ── Add Customer Modal ─────────────────────────────────────────────────────
  const [custForm] = Form.useForm()
  async function handleAddCustomer(values) {
    try {
      const res = await createCustomer({ ...values })
      setCustomer(res)
      setNewCustModal(false)
      custForm.resetFields()
      message.success(`Customer ${values.name} added!`)
    } catch (err) {
      message.error(err.message)
    }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>🛒 New Bill</Title>

      <Row gutter={[16, 16]}>
        {/* Left Column: Bill Building */}
        <Col xs={24} lg={14}>

          {/* Step 1: Customer */}
          <Card
            title="👤 Step 1 — Customer"
            style={{ marginBottom: 16, borderRadius: 12 }}
            extra={
              <Checkbox checked={walkIn} onChange={(e) => {
                setWalkIn(e.target.checked)
                if (e.target.checked) setCustomer({ customer_id: 'WALKIN', name: 'Walk-in', phone: '' })
                else setCustomer(null)
              }}>Walk-in</Checkbox>
            }
          >
            {!walkIn && (
              <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
                <Input
                  placeholder="Search by phone number..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  onPressEnter={searchCustomer}
                  prefix={<SearchOutlined />}
                />
                <Button type="primary" onClick={searchCustomer} loading={custLoading}>
                  Search
                </Button>
                <Button icon={<UserAddOutlined />} onClick={() => setNewCustModal(true)}>
                  New
                </Button>
              </Space.Compact>
            )}

            {custResults.length > 0 && !walkIn && (
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                {custResults.map((c) => (
                  <div
                    key={c.customer_id}
                    onClick={() => { setCustomer(c); setCustResults([]) }}
                    style={{
                      padding: '8px 12px', cursor: 'pointer',
                      background: customer?.customer_id === c.customer_id ? '#e8eaf6' : '#fff',
                      borderBottom: '1px solid #f5f5f5',
                    }}
                  >
                    <Text strong>{c.name}</Text>
                    <Text type="secondary" style={{ marginLeft: 8 }}>{c.phone}</Text>
                    <Tag color="blue" style={{ marginLeft: 8, fontSize: 11 }}>{c.member_type}</Tag>
                  </div>
                ))}
              </div>
            )}

            {customer && (
              <Alert
                type="success" showIcon
                message={
                  <span>
                    <b>{customer.name}</b>
                    {customer.phone && <Text type="secondary" style={{ marginLeft: 8 }}>📞 {customer.phone}</Text>}
                    <Tag style={{ marginLeft: 8 }}>{customer.member_type || 'Walk-in'}</Tag>
                  </span>
                }
              />
            )}
          </Card>

          {/* Step 2: Add Items */}
          <Card title="🛍️ Step 2 — Add Items" style={{ marginBottom: 16, borderRadius: 12 }}>
            <Row gutter={8} align="middle">
              <Col flex="auto">
                <Input
                  ref={itemInputRef}
                  placeholder="Item ID or name — press Enter to add"
                  value={itemId}
                  onChange={(e) => { setItemId(e.target.value); setSearchHits([]) }}
                  onPressEnter={handleItemEnter}
                  prefix={<SearchOutlined />}
                  suffix={addingItem ? <Spin size="small" /> : null}
                  size="large"
                  autoFocus
                />
              </Col>
              <Col>
                <InputNumber
                  min={1} max={500} value={qty} onChange={setQty}
                  style={{ width: 70 }} size="large" placeholder="Qty"
                />
              </Col>
              <Col>
                <Select value={size} onChange={setSize} style={{ width: 90 }} size="large">
                  {SIZE_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
              </Col>
            </Row>

            {/* Multiple match results */}
            {searchHits.length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', background: '#fafafa', fontWeight: 600, fontSize: 13 }}>
                  {searchHits.length} matches — click to add:
                </div>
                {searchHits.slice(0,10).map((p) => (
                  <div
                    key={p.item_id}
                    onClick={() => pushToCart(p)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span>
                      <Text code>{p.item_id}</Text>
                      <Text strong style={{ marginLeft: 8 }}>{p.product_name}</Text>
                      <Text type="secondary" style={{ marginLeft: 6 }}>({p.size})</Text>
                    </span>
                    <Tag color="blue">₹{p.selling_price}</Tag>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Step 3: Cart */}
          {cart.length > 0 && (
            <Card
              title={`🛒 Cart (${cart.length} item${cart.length > 1 ? 's' : ''})`}
              style={{ marginBottom: 16, borderRadius: 12 }}
              extra={
                <Button danger size="small" icon={<ClearOutlined />}
                  onClick={() => setCart([])}>Clear All</Button>
              }
            >
              <Table
                dataSource={cart} columns={cartCols} rowKey="_key"
                pagination={false} size="small" scroll={{ y: 250 }}
              />

              <Divider />
              <div style={{ background: '#fffde7', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 16px' }}>
                <Text strong>🏷️ Discount</Text>
                <Row gutter={16} style={{ marginTop: 8 }}>
                  <Col>
                    <Radio.Group value={discType} onChange={(e) => setDiscType(e.target.value)} buttonStyle="solid">
                      <Radio.Button value="%">% Percent</Radio.Button>
                      <Radio.Button value="Rs.">₹ Flat</Radio.Button>
                    </Radio.Group>
                  </Col>
                  <Col>
                    <InputNumber
                      min={0} value={discVal} onChange={setDiscVal}
                      prefix={discType === '%' ? '%' : '₹'} style={{ width: 120 }}
                    />
                  </Col>
                </Row>
              </div>

              <Row gutter={16} style={{ marginTop: 16 }}>
                {[
                  ['Subtotal', `₹${rawSub.toLocaleString()}`],
                  ['Discount', `-₹${disc.toLocaleString()}`],
                  ['GST', `₹${adjGst.toLocaleString()}`],
                  ['Grand Total', `₹${grand.toLocaleString()}`],
                ].map(([label, val]) => (
                  <Col span={6} key={label}>
                    <Statistic
                      title={label} value={val}
                      valueStyle={label === 'Grand Total' ? { color: '#1A237E', fontWeight: 700, fontSize: 20 } : {}}
                    />
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* Step 4: Payment */}
          {cart.length > 0 && (
            <Card title="💳 Step 4 — Payment" style={{ borderRadius: 12 }}>
              <Row gutter={16}>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary">Payment Mode</Text></div>
                  <Select value={payMode} onChange={setPayMode} style={{ width: '100%' }}>
                    {PAYMENT_MODES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                  </Select>
                </Col>
                <Col span={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary">Amount Paid (₹)</Text></div>
                  <InputNumber
                    value={amountPaid} onChange={setAmountPaid} min={0}
                    style={{ width: '100%' }} size="large"
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Change / Balance"
                    value={`₹${change.toLocaleString()}`}
                    valueStyle={{ color: change >= 0 ? '#2E7D32' : '#C62828' }}
                  />
                </Col>
              </Row>
              <div style={{ marginTop: 12 }}>
                <Input
                  placeholder="Notes (optional)"
                  value={notes} onChange={(e) => setNotes(e.target.value)}
                  prefix="📝"
                />
              </div>
              <Divider />
              <Button
                type="primary" size="large" block
                loading={billing} onClick={handleGenerateBill}
                icon={<PrinterOutlined />}
                style={{ height: 48, fontSize: 16 }}
              >
                Generate Bill
              </Button>
            </Card>
          )}
        </Col>

        {/* Right Column: Receipt */}
        <Col xs={24} lg={10}>
          {lastBill ? (
            <Card
              title="🧾 Receipt"
              style={{ borderRadius: 12, position: 'sticky', top: 88 }}
              extra={
                <Space>
                  <Button
                    icon={<PrinterOutlined />}
                    type="primary"
                    onClick={async () => {
                      try {
                        await printPdfWithAuth(`/bills/${lastBill.bill_no}/receipt-pdf`)
                      } catch (err) {
                        message.error('Could not print PDF: ' + err.message)
                      }
                    }}
                  >
                    Print PDF
                  </Button>
                  {lastBill.phone && (
                    <Button
                      icon={<WhatsAppOutlined />}
                      style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }}
                      href={`https://wa.me/${lastBill.phone.replace(/\D/g,'').length === 10 ? '91' + lastBill.phone.replace(/\D/g,'') : lastBill.phone.replace(/\D/g,'')}?text=${encodeURIComponent(buildWhatsAppMsg(lastBill, storeName, storeProfile))}`}
                      target="_blank"
                    >
                      WhatsApp
                    </Button>
                  )}
                </Space>
              }
            >
              <ReceiptPreview bill={lastBill} />
              <Divider />
              <Button block onClick={() => setLastBill(null)}>Start New Bill</Button>
            </Card>
          ) : (
            <Card style={{ borderRadius: 12, background: '#fafafa', textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🧾</div>
              <div style={{ color: '#aaa', marginTop: 8 }}>Receipt will appear here after billing</div>
            </Card>
          )}
        </Col>
      </Row>

      {/* Add Customer Modal */}
      <Modal
        title="➕ Add New Customer"
        open={newCustModal}
        onCancel={() => setNewCustModal(false)}
        footer={null}
        width={560}
      >
        <Form form={custForm} layout="vertical" onFinish={handleAddCustomer} style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="name" label="Full Name *" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Phone *" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="email" label="Email"><Input /></Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="member_type" label="Member Type" initialValue="Regular">
                <Select>
                  {MEMBER_TYPES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="address" label="Address"><Input /></Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block>Save Customer</Button>
        </Form>
      </Modal>
    </div>
  )
}