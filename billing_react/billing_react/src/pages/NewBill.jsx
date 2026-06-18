import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Row, Col, Input, Button, InputNumber, Select, Table, Space, Tag,
  Typography, Divider, Radio, Statistic, Form, message, Checkbox, Modal,
  Spin, Alert, Grid, Tooltip, theme as antTheme, AutoComplete,
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

  const [discType, setDiscType]       = useState('%')
  const [discVal, setDiscVal]         = useState(0)
  const [payMode, setPayMode]         = useState('Cash')
  const [amountPaid, setAmountPaid]   = useState(0)
  const [creditAmount, setCreditAmount] = useState(0)
  const [splitPayMode, setSplitPayMode] = useState('Cash')
  const [notes, setNotes]             = useState('')
  const [upiConfirmed, setUpiConfirmed] = useState(false)

  const [billing, setBilling]     = useState(false)
  const [lastBill, setLastBill]   = useState(null)
  const [storeProfile, setStoreProfile] = useState(null)

  const itemInputRef = useRef(null)

  useEffect(() => {
    getStoreProfile().then(setStoreProfile).catch(() => {})
  }, [])

  // ── Customer Search ────────────────────────────────────────────────────────
  const searchCustomer = useCallback(async (val) => {
    const q = (val ?? custSearch).trim()
    if (!q) { setCustResults([]); return }
    setCustLoading(true)
    try {
      const res = await getCustomers({ search: q })
      setCustResults(res || [])
    } catch {
      message.error('Customer search failed')
    } finally {
      setCustLoading(false)
    }
  }, [custSearch])

  // debounce ref
  const custDebounceRef = useRef(null)
  function onCustSearchChange(val) {
    setCustSearch(val)
    if (custDebounceRef.current) clearTimeout(custDebounceRef.current)
    if (!val.trim()) { setCustResults([]); return }
    custDebounceRef.current = setTimeout(() => searchCustomer(val), 300)
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

  const { token } = antTheme.useToken()

  // ── Totals ─────────────────────────────────────────────────────────────────
  const rawSub = cart.reduce((s, i) => s + i.subtotal, 0)
  const rawGst = cart.reduce((s, i) => s + i.gst_amt, 0)
  const disc   = discType === '%'
    ? Math.round(rawSub * discVal / 100)
    : Math.min(discVal, rawSub)
  const adjSub = rawSub - disc
  const adjGst = rawSub > 0 ? Math.round(rawGst / rawSub * adjSub) : 0
  const grand  = Math.round(adjSub + adjGst)

  const isCredit     = payMode === 'Credit'
  // upfront = grand - creditAmount; partial = some amount collected now
  const upfront      = isCredit ? Math.max(0, grand - creditAmount) : amountPaid
  const isPartialCredit = isCredit && upfront > 0
  const change       = Math.round(upfront - grand) // negative = balance due

  // Sync amountPaid with grand for non-credit modes
  useEffect(() => {
    if (!isCredit) setAmountPaid(grand)
  }, [grand, isCredit])

  // When switching TO Credit, default to full credit (upfront = 0)
  useEffect(() => {
    if (isCredit) setCreditAmount(grand)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCredit])

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
        amount_paid: isCredit ? upfront : amountPaid,
        notes,
      }
      const res = await createBill(payload)
      setLastBill(res)
      setCart([]); setCustomer(null); setWalkIn(false)
      setCustSearch(''); setCustResults([])
      setDiscVal(0); setNotes(''); setCreditAmount(0)
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
        <div style={{ padding: '4px 0' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            {rec.product_name}
            {rec.item_id?.startsWith('CUSTOM') && <Tag color="orange" style={{ marginLeft: 4, fontSize: 10 }}>Custom</Tag>}
          </div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>{rec.size} · ₹{rec.selling_price} each</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <InputNumber min={1} value={rec.qty}
              style={{ width: 70 }} size="middle"
              onChange={(nv) => setCart((prev) => prev.map((it) =>
                it._key === rec._key
                  ? { ...it, qty: nv, subtotal: Math.round(it.selling_price * nv),
                      gst_amt: Math.round(Math.round(it.selling_price * nv) * it.gst_pct / 100),
                      item_total: Math.round(Math.round(it.selling_price * nv) * (1 + it.gst_pct / 100)) }
                  : it
              ))} />
            <InputNumber min={0} max={100} value={rec.item_disc_pct}
              style={{ width: 80 }} suffix="% off" size="middle"
              onChange={(nv) => setCart((prev) =>
                prev.map((it) => it._key === rec._key ? applyItemDisc(it, nv) : it)
              )} />
          </div>
        </div>
      ),
    },
    {
      title: 'Amt', key: 'amt', width: 80,
      render: (_, rec) => (
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: '#1A237E' }}>₹{Math.round(rec.subtotal)}</div>
          <Button type="text" danger icon={<DeleteOutlined />} style={{ marginTop: 4, padding: '4px 8px' }}
            onClick={() => setCart((p) => p.filter((i) => i._key !== rec._key))}>Del</Button>
        </div>
      ),
    },
  ]

  // ── Receipt ────────────────────────────────────────────────────────────────
  function ReceiptPreview({ bill }) {
    const { token: tk } = antTheme.useToken()
    const upiId = storeProfile?.upi_id
    const qrUrl = upiId
      ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${Math.round(bill.grand_total)}&cu=INR&tn=Bill%20${bill.bill_no}`
      : null

    const row = (label, value, opts = {}) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', ...opts.wrapStyle }}>
        <span style={{ color: opts.labelColor || tk.colorTextSecondary, fontSize: opts.labelSize || 13 }}>{label}</span>
        <span style={{ color: opts.valueColor || tk.colorText, fontWeight: opts.bold ? 700 : 500, fontSize: opts.valueSize || 13 }}>{value}</span>
      </div>
    )

    return (
      <div style={{
        maxWidth: 330, margin: '0 auto',
        borderRadius: 16, overflow: 'hidden',
        boxShadow: `0 4px 24px ${tk.colorBorder}`,
        border: `1px solid ${tk.colorBorderSecondary}`,
        fontFamily: "'Segoe UI', sans-serif",
      }}>

        {/* ── Header ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1A237E 0%, #3949AB 100%)',
          color: '#fff', padding: '20px 18px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.5 }}>👗 {storeName}</div>
          {storeProfile?.address && (
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>📍 {storeProfile.address}</div>
          )}
          {storeProfile?.phone && (
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>📞 {storeProfile.phone}</div>
          )}
          {storeProfile?.gstin && (
            <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>GST: {storeProfile.gstin}</div>
          )}
        </div>

        {/* ── Bill Info ── */}
        <div style={{ padding: '12px 18px', background: tk.colorBgElevated, borderBottom: `1px solid ${tk.colorBorderSecondary}` }}>
          {row('Bill No', bill.bill_no, { bold: true })}
          {row('Date', `${bill.bill_date} ${bill.bill_time}`)}
          {row('Customer', bill.customer_name || 'Walk-in', { bold: true })}
          {bill.phone && row('Phone', bill.phone)}
          {bill.status === 'Credit' && (
            <div style={{
              marginTop: 8, background: '#ffebee', color: '#c62828',
              borderRadius: 8, padding: '5px 12px', textAlign: 'center',
              fontWeight: 700, fontSize: 12, letterSpacing: 0.5,
            }}>⚠ CREDIT SALE</div>
          )}
        </div>

        {/* ── Items ── */}
        <div style={{ padding: '12px 18px', background: tk.colorBgContainer }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: tk.colorTextSecondary, textTransform: 'uppercase',
            borderBottom: `1px dashed ${tk.colorBorderSecondary}`, paddingBottom: 6, marginBottom: 8,
          }}>
            <span>Item</span><span>Amount</span>
          </div>
          {bill.items?.map((it, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: tk.colorText, fontWeight: 600, fontSize: 13 }}>
                  {String(it.product_name || '').slice(0, 22)}
                  <span style={{ color: tk.colorTextSecondary, fontWeight: 400 }}> ({it.size})</span>
                </span>
                <span style={{ color: tk.colorText, fontWeight: 700 }}>₹{Math.round(it.subtotal)}</span>
              </div>
              <div style={{ color: tk.colorTextSecondary, fontSize: 11 }}>
                {it.qty} × ₹{it.selling_price}
              </div>
            </div>
          ))}
        </div>

        {/* ── Totals ── */}
        <div style={{
          padding: '12px 18px', background: tk.colorBgElevated,
          borderTop: `1px solid ${tk.colorBorderSecondary}`,
        }}>
          {bill.discount > 0 && row('Discount', `-₹${Math.round(bill.discount)}`, { valueColor: '#2e7d32', bold: true })}
          {row('GST', `₹${Math.round(bill.gst_total)}`)}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTop: `2px solid ${tk.colorBorderSecondary}`, marginTop: 8, paddingTop: 8,
          }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: tk.colorText }}>GRAND TOTAL</span>
            <span style={{
              fontWeight: 800, fontSize: 20,
              background: 'linear-gradient(135deg, #1A237E, #3949AB)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>₹{Math.round(bill.grand_total)}</span>
          </div>
        </div>

        {/* ── Payment ── */}
        <div style={{ padding: '12px 18px', background: tk.colorBgContainer }}>
          {row('Payment Mode', bill.payment_mode, { bold: true })}
          {row('Amount Paid', `₹${Math.round(bill.amount_paid)}`, { bold: true })}
          {bill.change_amt > 0 && row('Change', `₹${Math.round(bill.change_amt)}`, { valueColor: '#2e7d32', bold: true })}
          {bill.change_amt < 0 && (
            <div style={{
              marginTop: 8, background: '#ffebee',
              borderRadius: 8, padding: '8px 12px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ color: '#c62828', fontWeight: 700 }}>Balance Due</span>
              <span style={{ color: '#c62828', fontWeight: 800, fontSize: 15 }}>₹{Math.round(Math.abs(bill.change_amt))}</span>
            </div>
          )}
        </div>

        {/* ── QR Code ── */}
        {qrUrl && (
          <div style={{
            padding: '16px 18px', textAlign: 'center',
            background: tk.colorBgElevated,
            borderTop: `1px solid ${tk.colorBorderSecondary}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: tk.colorText, marginBottom: 10 }}>
              📱 Scan & Pay via UPI
            </div>
            <div style={{
              display: 'inline-block',
              background: '#fff', padding: 8, borderRadius: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrUrl)}&bgcolor=ffffff&color=1A237E`}
                alt="UPI QR" width={140} height={140}
                style={{ display: 'block', borderRadius: 6 }}
              />
            </div>
            <div style={{ fontSize: 12, color: tk.colorTextSecondary, marginTop: 8, fontWeight: 600 }}>
              ₹{Math.round(bill.grand_total)} · {upiId}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          background: 'linear-gradient(135deg, #1A237E 0%, #3949AB 100%)',
          color: '#fff', padding: '14px 18px', textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>★ Thank You! Visit Again ★</div>
          <div style={{ fontSize: 11, opacity: 0.75, marginTop: 4 }}>Exchange within 7 days with receipt</div>
        </div>
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
    <div style={{ padding: contentPad, paddingBottom: isMobile && cart.length > 0 ? 80 : contentPad }}>
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
                <AutoComplete
                  style={{ flex: 1 }}
                  value={custSearch}
                  onSearch={onCustSearchChange}
                  onChange={onCustSearchChange}
                  onSelect={(val, opt) => {
                    const c = custResults.find(r => r.customer_id === opt.key)
                    if (c) { setCustomer(c); setCustSearch(c.name); setCustResults([]) }
                  }}
                  options={custResults.map((c) => ({
                    key: c.customer_id,
                    value: c.name,
                    label: (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text strong>{c.name}</Text>
                        {c.phone && <Text type="secondary" style={{ fontSize: 12 }}>{c.phone}</Text>}
                        <Tag color="blue" style={{ fontSize: 11, margin: 0 }}>{c.member_type}</Tag>
                        {c.credit_balance > 0 && (
                          <Tag color="red" style={{ fontSize: 11, margin: 0 }}>Due ₹{Math.round(c.credit_balance)}</Tag>
                        )}
                      </div>
                    ),
                  }))}
                  notFoundContent={custLoading ? <Spin size="small" /> : custSearch.trim() ? 'No customers found' : null}
                  placeholder="Search by name or phone..."
                  allowClear
                  onClear={() => { setCustSearch(''); setCustResults([]); setCustomer(null) }}
                >
                  <Input prefix={<SearchOutlined />} suffix={custLoading ? <Spin size="small" /> : null} />
                </AutoComplete>
                <Button icon={<UserAddOutlined />} onClick={() => setNewCustModal(true)} title="Add new customer" />
              </Space.Compact>
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
            {/* Search input */}
            <Input
              ref={itemInputRef}
              placeholder="Search by item ID or name..."
              value={itemId}
              onChange={(e) => {
                const val = e.target.value
                setItemId(val)
                setSearchHits([])
                if (isMobile && val.trim().length >= 2) {
                  clearTimeout(window._itemSearchTimer)
                  window._itemSearchTimer = setTimeout(async () => {
                    setAddingItem(true)
                    try {
                      const hits = await getProducts({ search: val.trim() })
                      if (hits?.length) setSearchHits(hits)
                    } catch {} finally { setAddingItem(false) }
                  }, 350)
                }
              }}
              onPressEnter={handleItemEnter}
              prefix={<SearchOutlined />}
              suffix={addingItem ? <Spin size="small" /> : null}
              size="large"
              autoFocus={!isMobile}
              style={{ marginBottom: 10 }}
            />

            {/* Qty +/- and Size — phone-friendly layout */}
            {isMobile ? (
              <div>
                {/* Qty row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <Text type="secondary" style={{ fontSize: 13, minWidth: 28 }}>Qty</Text>
                  <Button size="large" style={{ width: 44, fontWeight: 700, fontSize: 18 }}
                    onClick={() => setQty(q => Math.max(1, q - 1))}>−</Button>
                  <div style={{
                    width: 52, textAlign: 'center', fontSize: 20, fontWeight: 700,
                    border: '1px solid #d9d9d9', borderRadius: 6, padding: '4px 0',
                  }}>{qty}</div>
                  <Button size="large" type="primary" style={{ width: 44, fontWeight: 700, fontSize: 18 }}
                    onClick={() => setQty(q => q + 1)}>+</Button>
                </div>
                {/* Size buttons — scrollable row */}
                <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                  <div style={{ display: 'flex', gap: 6, width: 'max-content' }}>
                    {SIZE_OPTIONS.map((s) => (
                      <Button
                        key={s} size="middle"
                        type={size === s ? 'primary' : 'default'}
                        onClick={() => setSize(s)}
                        style={{ minWidth: 44, fontWeight: size === s ? 700 : 400 }}
                      >{s}</Button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Row gutter={8} align="middle" style={{ marginBottom: 8 }}>
                <Col sm="auto">
                  <InputNumber
                    min={1} max={500} value={qty} onChange={setQty}
                    style={{ width: 110 }} size="large" addonBefore="Qty"
                  />
                </Col>
                <Col sm="auto">
                  <Select value={size} onChange={setSize} style={{ minWidth: 90 }} size="large">
                    {SIZE_OPTIONS.map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
                  </Select>
                </Col>
              </Row>
            )}

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
              <div style={{ marginTop: 12, border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '8px 14px', background: '#f0f4ff', fontWeight: 600, fontSize: 13, borderBottom: '1px solid #e0e0e0' }}>
                  {searchHits.length} match{searchHits.length > 1 ? 'es' : ''} — tap to add
                </div>
                {searchHits.slice(0, 10).map((p) => (
                  <div
                    key={p.item_id}
                    onClick={() => pushToCart(p)}
                    style={{
                      padding: isMobile ? '14px 14px' : '10px 12px',
                      cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#fff', activeOpacity: 0.7,
                    }}
                  >
                    <div>
                      <div>
                        <Text strong style={{ fontSize: isMobile ? 15 : 13 }}>{p.product_name}</Text>
                        {p.size && <Tag style={{ marginLeft: 6 }}>{p.size}</Tag>}
                        {p.color && <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>{p.color}</Text>}
                      </div>
                      <Text code style={{ fontSize: 11 }}>{p.item_id}</Text>
                      {p.stock_qty <= 2 && <Tag color="red" style={{ marginLeft: 6, fontSize: 10 }}>Low Stock</Tag>}
                    </div>
                    <Tag color="blue" style={{ fontSize: isMobile ? 14 : 12, padding: '2px 8px' }}>₹{p.selling_price}</Tag>
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
                {/* Payment Mode */}
                <Col xs={24} sm={isCredit ? 12 : 8}>
                  <div style={{ marginBottom: 4 }}><Text type="secondary">Payment Mode</Text></div>
                  <Select value={payMode} onChange={(v) => { setPayMode(v); setUpiConfirmed(false) }} style={{ width: '100%' }}>
                    {PAYMENT_MODES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                  </Select>
                </Col>

                {/* Non-credit: Amount Paid */}
                {!isCredit && (
                  <Col xs={24} sm={8}>
                    <div style={{ marginBottom: 4 }}><Text type="secondary">Amount Paid (₹)</Text></div>
                    <InputNumber
                      value={amountPaid} onChange={setAmountPaid} min={0} max={grand}
                      style={{ width: '100%' }} size="large"
                    />
                  </Col>
                )}

                {/* Credit: Credit Amount input */}
                {isCredit && (
                  <Col xs={24} sm={12}>
                    <div style={{ marginBottom: 4 }}>
                      <Text type="secondary">Amount on Credit (₹)</Text>
                      <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>rest of money</Tag>
                    </div>
                    <InputNumber
                      value={creditAmount}
                      onChange={(v) => setCreditAmount(Math.min(grand, Math.max(0, v || 0)))}
                      min={0} max={grand}
                      style={{ width: '100%' }} size="large"
                      placeholder={`Max ₹${grand}`}
                    />
                  </Col>
                )}

                {/* Change / Balance display */}
                <Col xs={24} sm={isCredit ? 24 : 8}>
                  {isCredit ? (
                    <Row gutter={12}>
                      <Col xs={12}>
                        <div style={{
                          background: token.colorWarningBg,
                          border: `1px solid ${token.colorWarningBorder}`,
                          borderRadius: 10, padding: '10px 14px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>On Credit</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#e65100' }}>₹{creditAmount.toLocaleString()}</div>
                        </div>
                      </Col>
                      <Col xs={12}>
                        <div style={{
                          background: token.colorSuccessBg,
                          border: `1px solid ${token.colorSuccessBorder}`,
                          borderRadius: 10, padding: '10px 14px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 11, color: token.colorTextSecondary, marginBottom: 4 }}>Collected Now</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#2e7d32' }}>₹{upfront.toLocaleString()}</div>
                        </div>
                      </Col>
                    </Row>
                  ) : (
                    <Statistic
                      title="Change / Balance"
                      value={`₹${change.toLocaleString()}`}
                      styles={{ content: { color: change >= 0 ? '#2E7D32' : '#C62828' } }}
                    />
                  )}
                </Col>
              </Row>

              {/* Full credit alert */}
              {isCredit && !isPartialCredit && (
                <Alert
                  type="warning" showIcon
                  icon={<ExclamationCircleOutlined />}
                  message={`Full credit sale — ₹${creditAmount.toLocaleString()} will be added to customer's outstanding balance`}
                  style={{ marginTop: 12 }}
                />
              )}

              {/* Partial credit: choose how upfront is collected */}
              {isPartialCredit && (
                <div style={{
                  marginTop: 14, padding: '14px 16px',
                  background: token.colorWarningBg,
                  border: `1px solid ${token.colorWarningBorder}`,
                  borderRadius: 12,
                }}>
                  <Text strong style={{ color: token.colorText }}>
                    💰 How is ₹{upfront.toLocaleString()} being collected now?
                  </Text>
                  <div style={{ marginTop: 10 }}>
                    <Radio.Group
                      value={splitPayMode}
                      onChange={(e) => setSplitPayMode(e.target.value)}
                      buttonStyle="solid"
                    >
                      <Radio.Button value="Cash">💵 Cash</Radio.Button>
                      <Radio.Button value="UPI">📱 UPI</Radio.Button>
                      <Radio.Button value="Credit Card">💳 Credit Card</Radio.Button>
                      <Radio.Button value="Debit Card">🏧 Debit</Radio.Button>
                    </Radio.Group>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: token.colorTextSecondary }}>
                    ✅ <Text strong>₹{upfront.toLocaleString()}</Text> via <Text strong>{splitPayMode}</Text>
                    &nbsp;+&nbsp;
                    <Text strong style={{ color: '#e65100' }}>₹{creditAmount.toLocaleString()}</Text> on credit
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

              {/* UPI Payment Confirmation */}
              {payMode === 'UPI' && storeProfile?.upi_id && (
                <div style={{
                  marginTop: 14, borderRadius: 12, overflow: 'hidden',
                  border: upiConfirmed ? '2px solid #52c41a' : '2px solid #fa8c16',
                }}>
                  {!upiConfirmed ? (
                    <div style={{ padding: '14px 16px', background: '#fff7e6' }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: '#d46b08', marginBottom: 10 }}>
                        📱 Ask customer to scan & pay
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                        <div style={{ background: '#fff', padding: 6, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.15)', flexShrink: 0 }}>
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(`upi://pay?pa=${storeProfile.upi_id}&pn=${encodeURIComponent(storeName)}&am=${grand}&cu=INR`)}&bgcolor=ffffff&color=1A237E`}
                            alt="UPI QR" width={100} height={100}
                            style={{ display: 'block', borderRadius: 4 }}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>
                            UPI ID: <strong>{storeProfile.upi_id}</strong>
                          </div>
                          <div style={{ fontSize: 18, fontWeight: 800, color: '#1A237E', marginBottom: 10 }}>
                            ₹{grand.toLocaleString()}
                          </div>
                          <Button
                            type="primary" size="large"
                            style={{ background: '#52c41a', borderColor: '#52c41a', fontWeight: 700, fontSize: 15 }}
                            onClick={() => setUpiConfirmed(true)}
                          >
                            ✅ Payment Received
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '12px 16px', background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ fontWeight: 700, color: '#389e0d', fontSize: 15 }}>
                        ✅ UPI Payment Confirmed — ₹{grand.toLocaleString()}
                      </div>
                      <Button size="small" type="text" danger onClick={() => setUpiConfirmed(false)}>
                        Undo
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <Divider />
              <Button
                type="primary" size="large" block
                loading={billing} onClick={handleGenerateBill}
                icon={<PrinterOutlined />}
                style={{ height: 52, fontSize: 16 }}
                disabled={payMode === 'UPI' && storeProfile?.upi_id && !upiConfirmed}
              >
                {payMode === 'UPI' && storeProfile?.upi_id && !upiConfirmed
                  ? '⬆ Confirm UPI Payment First'
                  : 'Generate Bill'}
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
                        const paper = localStorage.getItem('receipt_paper_size') || '3inch'
                        await printPdfWithAuth(`/bills/${lastBill.bill_no}/receipt-pdf?paper=${paper}`)
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

      {/* ── Mobile sticky bottom bar ─────────────────────────────────────── */}
      {isMobile && cart.length > 0 && !lastBill && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999,
          background: '#fff', borderTop: '2px solid #1A237E',
          padding: '10px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, color: '#888' }}>{cart.length} item{cart.length > 1 ? 's' : ''} · Grand Total</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1A237E', lineHeight: 1.2 }}>
              ₹{grand.toLocaleString()}
            </div>
          </div>
          <Button
            type="primary" size="large" loading={billing}
            onClick={handleGenerateBill} icon={<PrinterOutlined />}
            style={{ height: 50, fontSize: 15, minWidth: 150, borderRadius: 10 }}
          >
            Generate Bill
          </Button>
        </div>
      )}
    </div>
  )
}