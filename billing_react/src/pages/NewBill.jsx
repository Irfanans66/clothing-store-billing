import React, { useState, useRef, useEffect } from 'react'
import {
  Card, Row, Col, Input, Button, InputNumber, Select, Table, Space, Tag,
  Typography, Divider, Radio, Statistic, Form, message, Checkbox, Modal,
  Spin, Alert, Grid, Tooltip,
} from 'antd'
import {
  SearchOutlined, DeleteOutlined, PlusOutlined, PrinterOutlined,
  WhatsAppOutlined, ClearOutlined, UserAddOutlined, LinkOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons'
import {
  getCustomers, createCustomer, getProduct, getProducts,
  createBill, getStoreProfile, getPublicReceiptUrl,
} from '../api/client'
import { useAuthStore } from '../store/authStore'
import { printPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const SIZE_OPTIONS = ['XS','S','M','L','XL','XXL','XXXL','28','30','32','34','36','38','40',
  '2Y','4Y','6Y','8Y','10Y','12Y','Free Size']
const PAYMENT_MODES = ['Cash','UPI','Credit','Credit Card','Debit Card','Net Banking']
const MEMBER_TYPES  = ['Regular','Silver','Gold','Platinum']
const CATEGORIES    = ['Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga',
  'Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const GST_RATES     = [0, 5, 12, 18, 28]

function buildWhatsAppMsg(bill, storeName, storeProfile, receiptUrl) {
  const { phone = '', address = '', gstin = '', upi_id = '' } = storeProfile || {}
  const sep = '─'.repeat(26)
  let msg = `🧾 *${storeName}*\n${sep}\n`
  if (address) msg += `📍 ${address}\n`
  if (phone)   msg += `📞 ${phone}${gstin ? `  GST: ${gstin}` : ''}\n`
  msg += `${sep}\n📄 Bill: *${bill.bill_no}*  |  ₹${Math.round(bill.grand_total)}\n`
  msg += `📅 ${bill.bill_date}  ${bill.bill_time}\n`
  if (receiptUrl) {
    msg += `${sep}\n📥 *View/Download Receipt:*\n${receiptUrl}\n`
  }
  if (upi_id) {
    msg += `${sep}\n💳 Pay via UPI: *${upi_id}*\nAmount: ₹${Math.round(bill.grand_total)}\n`
  }
  msg += `${sep}\n🙏 *Thank you! Visit again.*\n_Exchange within 7 days with receipt_`
  return msg
}

export default function NewBill() {
  const { storeName } = useAuthStore()
  const screens = useBreakpoint()
  const isMobile = !screens.md

  // ── State ──────────────────────────────────────────────────────────────────
  const [customer, setCustomer]         = useState(null)
  const [walkIn, setWalkIn]             = useState(false)
  const [custSearch, setCustSearch]     = useState('')
  const [custResults, setCustResults]   = useState([])
  const [newCustModal, setNewCustModal] = useState(false)
  const [custLoading, setCustLoading]   = useState(false)

  const [cart, setCart]           = useState([])
  const [itemId, setItemId]       = useState('')
  const [qty, setQty]             = useState(1)
  const [size, setSize]           = useState('M')
  const [searchHits, setSearchHits] = useState([])
  const [addingItem, setAddingItem] = useState(false)

  // Custom item modal
  const [customModal, setCustomModal] = useState(false)
  const [customName, setCustomName]   = useState('')
  const [customForm] = Form.useForm()

  const [discType, setDiscType]   = useState('%')
  const [discVal, setDiscVal]     = useState(0)
  const [payMode, setPayMode]     = useState('Cash')
  const [amountPaid, setAmountPaid] = useState(0)
  const [splitPayMode, setSplitPayMode] = useState('Cash')
  const [notes, setNotes]         = useState('')

  const [billing, setBilling]     = useState(false)
  const [lastBill, setLastBill]   = useState(null)
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
    const sp   = priceOverride ?? prod.selling_price ?? prod.mrp ?? 0
    const mrp  = prod.mrp ?? sp
    const gst  = prod.gst_pct ?? 5
    const disc = mrp > 0 ? Math.round((1 - sp / mrp) * 1000) / 10 : 0
    const sub  = Math.round(sp * q)
    const gamt = Math.round(sub * gst / 100)
    const key  = `${prod.item_id}__${sz}__${Date.now()}`

    setCart((prev) => {
      // Merge only if same item_id + size + no extra per-item disc
      const idx = prev.findIndex(
        (it) => it.item_id === prod.item_id && it.size === sz && it.item_disc_pct === 0
      )
      if (idx >= 0 && !priceOverride) {
        const updated = [...prev]
        const ex = updated[idx]
        const newQ = ex.qty + q
        updated[idx] = {
          ...ex, qty: newQ,
          subtotal:   Math.round(ex.selling_price * newQ),
          gst_amt:    Math.round(Math.round(ex.selling_price * newQ) * gst / 100),
          item_total: Math.round(Math.round(ex.selling_price * newQ) * (1 + gst / 100)),
        }
        return updated
      }
      return [...prev, {
        _key: key, item_id: prod.item_id, product_name: prod.product_name,
        category: prod.category || '', size: sz, color: prod.color || '',
        qty: q, mrp, base_price: sp, selling_price: sp,
        item_disc_pct: 0,
        discount_pct: disc, subtotal: sub, gst_pct: gst, gst_amt: gamt,
        item_total: sub + gamt,
      }]
    })
    message.success(`Added ${prod.product_name} ×${q}`, 1.5)
    setSearchHits([])
    setItemId('')
    setQty(1)
    setTimeout(() => itemInputRef.current?.focus(), 50)
  }

  function applyItemDisc(item, newDiscPct) {
    const d = Math.max(0, Math.min(100, newDiscPct || 0))
    const sp  = Math.round(item.base_price * (1 - d / 100) * 100) / 100
    const sub = Math.round(sp * item.qty)
    const gamt = Math.round(sub * item.gst_pct / 100)
    return { ...item, item_disc_pct: d, selling_price: sp, subtotal: sub, gst_amt: gamt, item_total: sub + gamt }
  }

  async function handleItemEnter(e) {
    const val = e.target.value.trim()
    if (!val) return
    setAddingItem(true)
    try {
      const exact = await getProduct(val.toUpperCase()).catch(() =>
        val !== val.toUpperCase() ? getProduct(val).catch(() => null) : null
      )
      if (exact) { pushToCart(exact); return }

      const hits = await getProducts({ search: val })
      if (!hits?.length) {
        // Offer custom item
        setCustomName(val)
        setCustomModal(true)
        customForm.setFieldsValue({ product_name: val, gst_pct: 5, size })
        setItemId('')
        return
      }
      if (hits.length === 1) { pushToCart(hits[0]); return }
      setSearchHits(hits)
    } catch {
      message.error('Product lookup failed')
    } finally {
      setAddingItem(false)
    }
  }

  function handleAddCustomItem(values) {
    const fakeId = `CUSTOM-${Date.now()}`
    const prod = {
      item_id: fakeId,
      product_name: values.product_name,
      category: values.category || 'Other',
      color: '',
      mrp: values.mrp || values.selling_price,
      selling_price: values.selling_price,
      gst_pct: values.gst_pct ?? 5,
    }
    pushToCart(prod, values.qty || 1, values.size || size)
    setCustomModal(false)
    customForm.resetFields()
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
  const isCredit = payMode === 'Credit'
  const isPartialCredit = isCredit && amountPaid > 0 && amountPaid < grand
  const change   = Math.round(amountPaid - grand)

  useEffect(() => {
    if (!isCredit) setAmountPaid(grand)
  }, [grand, isCredit])

  // ── Generate Bill ──────────────────────────────────────────────────────────
  async function handleGenerateBill() {
    if (!customer) { message.error('Select a customer first'); return }
    if (!cart.length) { message.error('Add at least one item'); return }
    if (!isCredit && amountPaid < grand) {
      message.error('Amount paid is less than total'); return
    }

    setBilling(true)
    try {
      const payload = {
        customer_id:   customer.customer_id,
        customer_name: customer.name,
        phone:         customer.phone || '',
        items: cart.map(({ _key, item_total, base_price, item_disc_pct, ...it }) => it),
        discount: disc, discount_type: discType,
        payment_mode: isPartialCredit ? `${splitPayMode}+Credit` : payMode,
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
    {
      title: 'Item', dataIndex: 'product_name', key: 'n', ellipsis: true,
      render: (v, rec) => (
        <span>
          <span style={{ fontSize: 12 }}>{v}</span>
          {rec.item_id?.startsWith('CUSTOM') && (
            <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>Custom</Tag>
          )}
        </span>
      ),
    },
    { title: 'Size', dataIndex: 'size', key: 's', width: 60 },
    {
      title: 'Qty', dataIndex: 'qty', key: 'q', width: 70,
      render: (v, rec) => (
        <InputNumber min={1} value={v} size="small" style={{ width: 60 }}
          onChange={(nv) => setCart((prev) => prev.map((it) =>
            it._key === rec._key
              ? { ...it, qty: nv,
                  subtotal:   Math.round(it.selling_price * nv),
                  gst_amt:    Math.round(Math.round(it.selling_price * nv) * it.gst_pct / 100),
                  item_total: Math.round(Math.round(it.selling_price * nv) * (1 + it.gst_pct / 100)) }
              : it
          ))} />
      ),
    },
    {
      title: 'Disc%', dataIndex: 'item_disc_pct', key: 'd', width: 75,
      render: (v, rec) => (
        <Tooltip title="Extra discount for this item">
          <InputNumber
            min={0} max={100} value={v} size="small"
            style={{ width: 65 }} suffix="%"
            onChange={(nv) => setCart((prev) =>
              prev.map((it) => it._key === rec._key ? applyItemDisc(it, nv) : it)
            )}
          />
        </Tooltip>
      ),
    },
    {
      title: 'Price', dataIndex: 'selling_price', key: 'p', width: 70,
      render: (v) => `₹${v}`,
    },
    {
      title: 'Sub', dataIndex: 'subtotal', key: 'sub', width: 75,
      render: (v) => `₹${Math.round(v)}`,
    },
    {
      title: '', key: 'del', width: 36,
      render: (_, rec) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />}
          onClick={() => setCart((p) => p.filter((i) => i._key !== rec._key))} />
      ),
    },
  ]

  // Simplified columns for mobile
  const mobileCartCols = [
    {
      title: 'Item', key: 'item', render: (_, rec) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 13 }}>
            {rec.product_name}
            {rec.item_id?.startsWith('CUSTOM') && <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>Custom</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#666' }}>{rec.size} | ₹{rec.selling_price} ×{rec.qty}</div>
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <InputNumber min={1} value={rec.qty} size="small" style={{ width: 60 }}
              onChange={(nv) => setCart((prev) => prev.map((it) =>
                it._key === rec._key
                  ? { ...it, qty: nv, subtotal: Math.round(it.selling_price * nv),
                      gst_amt: Math.round(Math.round(it.selling_price * nv) * it.gst_pct / 100),
                      item_total: Math.round(Math.round(it.selling_price * nv) * (1 + it.gst_pct / 100)) }
                  : it
              ))} />
            <InputNumber min={0} max={100} value={rec.item_disc_pct} size="small"
              style={{ width: 70 }} suffix="% off"
              onChange={(nv) => setCart((prev) =>
                prev.map((it) => it._key === rec._key ? applyItemDisc(it, nv) : it)
              )} />
          </div>
        </div>
      ),
    },
    {
      title: 'Amt', key: 'amt', width: 70,
      render: (_, rec) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>₹{Math.round(rec.subtotal)}</div>
          <Button type="text" danger size="small" icon={<DeleteOutlined />}
            onClick={() => setCart((p) => p.filter((i) => i._key !== rec._key))} />
        </div>
      ),
    },
  ]

  // ── Receipt ────────────────────────────────────────────────────────────────
  function ReceiptPreview({ bill }) {
    const upiId = storeProfile?.upi_id
    const qrUrl = upiId
      ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${Math.round(bill.grand_total)}&cu=INR&tn=Bill%20${bill.bill_no}`
      : null

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
        {bill.status === 'Credit' && (
          <div style={{ color: '#C62828', fontWeight: 700 }}>⚠ CREDIT SALE</div>
        )}
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
            <span>Discount</span><span>-₹{Math.round(bill.discount)}</span>
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
        {bill.change_amt < 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#C62828', fontWeight: 700 }}>
            <span>Balance Due</span><span>₹{Math.round(Math.abs(bill.change_amt))}</span>
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

  const contentPad = isMobile ? '0 8px' : '0'

  return (
    <div style={{ padding: contentPad }}>
      <Title level={isMobile ? 4 : 3} style={{ marginBottom: 12 }}>🛒 New Bill</Title>

      <Row gutter={[12, 12]}>
        {/* Left Column: Bill Building */}
        <Col xs={24} lg={14}>

          {/* Step 1: Customer */}
          <Card
            title="👤 Customer"
            size={isMobile ? 'small' : 'default'}
            style={{ marginBottom: 12, borderRadius: 12 }}
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
                  placeholder="Search by name or phone..."
                  value={custSearch}
                  onChange={(e) => setCustSearch(e.target.value)}
                  onPressEnter={searchCustomer}
                  prefix={<SearchOutlined />}
                />
                <Button type="primary" onClick={searchCustomer} loading={custLoading}>Search</Button>
                <Button icon={<UserAddOutlined />} onClick={() => setNewCustModal(true)} />
              </Space.Compact>
            )}

            {custResults.length > 0 && !walkIn && (
              <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden', maxHeight: 200, overflowY: 'auto' }}>
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
                    {(c.credit_balance > 0) && (
                      <Tag color="red" style={{ marginLeft: 4, fontSize: 11 }}>
                        Due: ₹{Math.round(c.credit_balance)}
                      </Tag>
                    )}
                  </div>
                ))}
              </div>
            )}

            {customer && (
              <Alert
                type={customer.credit_balance > 0 ? 'warning' : 'success'}
                showIcon
                message={
                  <span>
                    <b>{customer.name}</b>
                    {customer.phone && <Text type="secondary" style={{ marginLeft: 8 }}>📞 {customer.phone}</Text>}
                    <Tag style={{ marginLeft: 8 }}>{customer.member_type || 'Walk-in'}</Tag>
                    {(customer.credit_balance > 0) && (
                      <Tag color="red" style={{ marginLeft: 4 }}>
                        Outstanding: ₹{Math.round(customer.credit_balance)}
                      </Tag>
                    )}
                  </span>
                }
              />
            )}
          </Card>

          {/* Step 2: Add Items */}
          <Card
            title="🛍️ Add Items"
            size={isMobile ? 'small' : 'default'}
            style={{ marginBottom: 12, borderRadius: 12 }}
          >
            <Row gutter={8} align="middle" wrap>
              <Col xs={24} sm flex="auto" style={{ marginBottom: isMobile ? 8 : 0 }}>
                <Input
                  ref={itemInputRef}
                  placeholder="Item ID / name — Enter to add"
                  value={itemId}
                  onChange={(e) => { setItemId(e.target.value); setSearchHits([]) }}
                  onPressEnter={handleItemEnter}
                  prefix={<SearchOutlined />}
                  suffix={addingItem ? <Spin size="small" /> : null}
                  size="large"
                  autoFocus
                />
              </Col>
              <Col xs={12} sm="auto">
                <InputNumber
                  min={1} max={500} value={qty} onChange={setQty}
                  style={{ width: '100%' }} size="large" placeholder="Qty"
                  addonBefore="Qty"
                />
              </Col>
              <Col xs={12} sm="auto">
                <Select value={size} onChange={setSize} style={{ width: '100%', minWidth: 90 }} size="large">
                  {SIZE_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
              </Col>
            </Row>

            <div style={{ marginTop: 8 }}>
              <Button
                type="dashed" icon={<PlusOutlined />}
                onClick={() => {
                  setCustomName(itemId || '')
                  setCustomModal(true)
                  customForm.setFieldsValue({ product_name: itemId || '', gst_pct: 5, size, qty })
                }}
                size="small"
              >
                Add Custom / Unlisted Item
              </Button>
            </div>

            {searchHits.length > 0 && (
              <div style={{ marginTop: 12, border: '1px solid #f0f0f0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '6px 12px', background: '#fafafa', fontWeight: 600, fontSize: 13 }}>
                  {searchHits.length} matches — tap to add:
                </div>
                {searchHits.slice(0,10).map((p) => (
                  <div
                    key={p.item_id}
                    onClick={() => pushToCart(p)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                  >
                    <span>
                      <Text code style={{ fontSize: 11 }}>{p.item_id}</Text>
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
              size={isMobile ? 'small' : 'default'}
              style={{ marginBottom: 12, borderRadius: 12 }}
              extra={
                <Button danger size="small" icon={<ClearOutlined />}
                  onClick={() => setCart([])}>Clear</Button>
              }
            >
              <Table
                dataSource={cart}
                columns={isMobile ? mobileCartCols : cartCols}
                rowKey="_key"
                pagination={false}
                size="small"
                scroll={{ x: isMobile ? undefined : 520, y: 260 }}
              />

              <Divider />
              {/* Bill-level discount */}
              <div style={{ background: '#fffde7', border: '1px solid #ffe082', borderRadius: 8, padding: '12px 14px' }}>
                <Text strong>🏷️ Bill Discount</Text>
                <Row gutter={12} style={{ marginTop: 8 }} align="middle">
                  <Col xs={24} sm="auto" style={{ marginBottom: isMobile ? 8 : 0 }}>
                    <Radio.Group value={discType} onChange={(e) => setDiscType(e.target.value)} buttonStyle="solid" size="small">
                      <Radio.Button value="%">% Percent</Radio.Button>
                      <Radio.Button value="Rs.">₹ Flat</Radio.Button>
                    </Radio.Group>
                  </Col>
                  <Col xs={24} sm="auto">
                    <InputNumber
                      min={0} value={discVal} onChange={setDiscVal}
                      prefix={discType === '%' ? '%' : '₹'} style={{ width: 140 }}
                    />
                  </Col>
                </Row>
              </div>

              <Row gutter={[8, 8]} style={{ marginTop: 14 }}>
                {[
                  ['Subtotal', `₹${rawSub.toLocaleString()}`],
                  ['Discount', `-₹${disc.toLocaleString()}`],
                  ['GST', `₹${adjGst.toLocaleString()}`],
                  ['Grand Total', `₹${grand.toLocaleString()}`],
                ].map(([label, val]) => (
                  <Col xs={12} sm={6} key={label}>
                    <Statistic
                      title={label} value={val}
                      valueStyle={label === 'Grand Total' ? { color: '#1A237E', fontWeight: 700, fontSize: isMobile ? 16 : 20 } : { fontSize: isMobile ? 14 : 16 }}
                    />
                  </Col>
                ))}
              </Row>
            </Card>
          )}

          {/* Step 4: Payment */}
          {cart.length > 0 && (
            <Card
              title="💳 Payment"
              size={isMobile ? 'small' : 'default'}
              style={{ borderRadius: 12 }}
            >
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary">Payment Mode</Text></div>
                  <Select value={payMode} onChange={(v) => {
                    setPayMode(v)
                    if (v !== 'Credit') setAmountPaid(grand)
                    else setAmountPaid(0)
                  }} style={{ width: '100%' }}>
                    {PAYMENT_MODES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                  </Select>
                </Col>
                <Col xs={24} sm={8}>
                  <div style={{ marginBottom: 4 }}>
                    <Text type="secondary">Amount Paid (₹)</Text>
                    {isCredit && <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>Partial OK</Tag>}
                  </div>
                  <InputNumber
                    value={amountPaid} onChange={setAmountPaid} min={0} max={isCredit ? undefined : grand}
                    style={{ width: '100%' }} size="large"
                  />
                </Col>
                <Col xs={24} sm={8}>
                  {isCredit ? (
                    <Statistic
                      title="Balance Due (Credit)"
                      value={`₹${Math.abs(Math.min(change, 0)).toLocaleString()}`}
                      valueStyle={{ color: change < 0 ? '#C62828' : '#2E7D32', fontWeight: 700 }}
                    />
                  ) : (
                    <Statistic
                      title="Change / Balance"
                      value={`₹${change.toLocaleString()}`}
                      valueStyle={{ color: change >= 0 ? '#2E7D32' : '#C62828' }}
                    />
                  )}
                </Col>
              </Row>

              {isCredit && !isPartialCredit && (
                <Alert
                  type="warning"
                  showIcon
                  icon={<ExclamationCircleOutlined />}
                  message={`Credit sale — ₹${Math.abs(Math.min(change, 0)).toLocaleString()} will be added to customer's balance`}
                  style={{ marginTop: 12 }}
                />
              )}

              {isPartialCredit && (
                <div style={{
                  marginTop: 12, padding: '14px 16px',
                  background: '#fff8e1', border: '1px solid #ffe082', borderRadius: 10,
                }}>
                  <div style={{ marginBottom: 10 }}>
                    <Text strong style={{ color: '#e65100' }}>
                      💰 Partial Payment — How is customer paying ₹{amountPaid.toLocaleString()} now?
                    </Text>
                  </div>
                  <Radio.Group
                    value={splitPayMode}
                    onChange={(e) => setSplitPayMode(e.target.value)}
                    buttonStyle="solid"
                  >
                    <Radio.Button value="Cash">💵 Cash</Radio.Button>
                    <Radio.Button value="UPI">📱 UPI</Radio.Button>
                    <Radio.Button value="Credit Card">💳 Credit Card</Radio.Button>
                    <Radio.Button value="Debit Card">🏧 Debit Card</Radio.Button>
                  </Radio.Group>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#795548' }}>
                    ✅ <b>₹{amountPaid.toLocaleString()}</b> collected via <b>{splitPayMode}</b>
                    &nbsp;+&nbsp;
                    <b>₹{(grand - amountPaid).toLocaleString()}</b> on credit (added to balance)
                  </div>
                </div>
              )}

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
                style={{ height: 52, fontSize: 16 }}
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
              style={{ borderRadius: 12, position: isMobile ? 'static' : 'sticky', top: 88 }}
              size={isMobile ? 'small' : 'default'}
              extra={
                <Space wrap>
                  <Button
                    icon={<PrinterOutlined />}
                    type="primary"
                    size={isMobile ? 'small' : 'middle'}
                    onClick={async () => {
                      try {
                        await printPdfWithAuth(`/bills/${lastBill.bill_no}/receipt-pdf`)
                      } catch (err) {
                        message.error('Print failed: ' + err.message)
                      }
                    }}
                  >
                    {isMobile ? 'Print' : 'Print PDF'}
                  </Button>

                  {lastBill.share_token && (
                    <Button
                      icon={<LinkOutlined />}
                      size={isMobile ? 'small' : 'middle'}
                      onClick={() => {
                        const url = getPublicReceiptUrl(lastBill.share_token)
                        navigator.clipboard?.writeText(url).then(() =>
                          message.success('Receipt link copied!')
                        ).catch(() => window.open(url, '_blank'))
                      }}
                    >
                      Copy Link
                    </Button>
                  )}

                  {lastBill.phone && (
                    <Button
                      icon={<WhatsAppOutlined />}
                      size={isMobile ? 'small' : 'middle'}
                      style={{ background: '#25D366', color: '#fff', borderColor: '#25D366' }}
                      onClick={() => {
                        const receiptUrl = lastBill.share_token
                          ? getPublicReceiptUrl(lastBill.share_token)
                          : null
                        const msg = buildWhatsAppMsg(lastBill, storeName, storeProfile, receiptUrl)
                        const phone = lastBill.phone.replace(/\D/g, '')
                        const waPhone = phone.length === 10 ? '91' + phone : phone
                        window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank')
                      }}
                    >
                      WhatsApp
                    </Button>
                  )}
                </Space>
              }
            >
              <ReceiptPreview bill={lastBill} />
              {lastBill.share_token && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0f9ff', borderRadius: 8, fontSize: 11, color: '#555', wordBreak: 'break-all' }}>
                  🔗 Receipt link: <a href={getPublicReceiptUrl(lastBill.share_token)} target="_blank" rel="noreferrer">
                    {getPublicReceiptUrl(lastBill.share_token)}
                  </a>
                </div>
              )}
              <Divider />
              <Button block onClick={() => setLastBill(null)}>Start New Bill</Button>
            </Card>
          ) : (
            !isMobile && (
              <Card style={{ borderRadius: 12, background: '#fafafa', textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 48, opacity: 0.3 }}>🧾</div>
                <div style={{ color: '#aaa', marginTop: 8 }}>Receipt appears here after billing</div>
              </Card>
            )
          )}
        </Col>
      </Row>

      {/* Add Customer Modal */}
      <Modal
        title="➕ New Customer"
        open={newCustModal}
        onCancel={() => setNewCustModal(false)}
        footer={null}
        width={isMobile ? '95%' : 560}
      >
        <Form form={custForm} layout="vertical" onFinish={handleAddCustomer} style={{ marginTop: 16 }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="Full Name *" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Phone *" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="email" label="Email"><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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

      {/* Custom Item Modal */}
      <Modal
        title="➕ Add Custom / Unlisted Item"
        open={customModal}
        onCancel={() => { setCustomModal(false); customForm.resetFields() }}
        footer={null}
        width={isMobile ? '95%' : 480}
      >
        <Alert
          type="info" showIcon
          message="Item not in product catalog. Fill details to add it to this bill only."
          style={{ marginBottom: 16 }}
        />
        <Form form={customForm} layout="vertical" onFinish={handleAddCustomItem}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="product_name" label="Item Name *" rules={[{ required: true }]}>
                <Input placeholder="e.g. Blue Denim Jacket" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="selling_price" label="Selling Price ₹ *" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="mrp" label="MRP ₹">
                <InputNumber min={0} style={{ width: '100%' }} prefix="₹" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="qty" label="Qty" initialValue={qty}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="size" label="Size" initialValue={size}>
                <Select>
                  {SIZE_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="gst_pct" label="GST %" initialValue={5}>
                <Select>
                  {GST_RATES.map((r) => <Select.Option key={r} value={r}>{r}%</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="category" label="Category" initialValue="Other">
                <Select>
                  {CATEGORIES.map((c) => <Select.Option key={c} value={c}>{c}</Select.Option>)}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large">
            Add to Cart
          </Button>
        </Form>
      </Modal>
    </div>
  )
}