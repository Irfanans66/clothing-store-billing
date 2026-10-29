import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  Card, Row, Col, Input, Button, InputNumber, Select, Tag, Segmented,
  Typography, Divider, Radio, Form, message, Checkbox, Modal,
  Spin, Alert, Grid, Tooltip, AutoComplete, Dropdown,
} from 'antd'
import {
  SearchOutlined, DeleteOutlined, PlusOutlined, MinusOutlined, PrinterOutlined,
  WhatsAppOutlined, ClearOutlined, UserAddOutlined, LinkOutlined, CameraOutlined,
  ExclamationCircleOutlined, PauseCircleOutlined, DownloadOutlined, SwapOutlined,
  ArrowRightOutlined, ShoppingCartOutlined, HistoryOutlined,
} from '@ant-design/icons'
import { QRCodeSVG } from 'qrcode.react'
import {
  getCustomers, getCustomer, createCustomer, getProduct, getProducts, getBills,
  createBill, getStoreProfile, getPublicReceiptUrl,
  getLoyaltyProgram, getCustomerLoyalty,
} from '../api/client'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useOfflineStore } from '../store/offlineStore'
import { useCurrency } from '../utils/currency'
import { printPdfWithAuth, openPdfWithAuth } from '../utils/pdf'
import GPayButton from '../components/GPayButton'
import CameraScanner from '../components/CameraScanner'
import { normalizeIndianMobile, whatsappNumber, indianMobileRule } from '../utils/phone'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const GOOD    = '#1E8449'
const BAD     = '#C0392B'

const SIZE_OPTIONS = ['XS','S','M','L','XL','XXL','XXXL','28','30','32','34','36','38','40',
  '2Y','4Y','6Y','8Y','10Y','12Y','Free Size']
const PAY_TABS   = ['Cash', 'UPI', 'Card', 'Split', 'Credit']
const CARD_MODES = ['Debit Card', 'Credit Card', 'Net Banking']
const SPLIT_MODES = ['Cash', 'UPI', 'Debit Card', 'Credit Card']
const MEMBER_TYPES  = ['Regular','Silver','Gold','Platinum']
const CATEGORIES    = ['Shirts','T-Shirts','Jeans','Trousers','Kurtis','Sarees','Lehenga',
  'Jackets','Sweaters','Suits','Kids Wear','Accessories','Other']
const GST_RATES     = [0, 5, 12, 18, 28]
const QUICK_DISCOUNTS = [['%', 5], ['%', 10], ['Rs.', 50], ['Rs.', 100]]
const CASH_NOTES = [500, 1000, 2000]

function readStore(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback } catch { return fallback }
}
function writeStore(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage unavailable */ }
}

// Same rounding as the backend: GST per line to the paisa, grand total half-up to the rupee
function lineFor(item, qty) {
  const sub  = Math.round(item.selling_price * qty)
  const gamt = Math.round(sub * item.gst_pct) / 100
  return { ...item, qty, subtotal: sub, gst_amt: gamt, item_total: sub + gamt }
}

function buildWhatsAppMsg(bill, storeName, storeProfile, receiptUrl, sym = '₹') {
  const { phone = '', address = '', gstin = '', upi_id = '' } = storeProfile || {}
  const sep = '─'.repeat(26)
  let msg = `🧾 *${storeName}*\n${sep}\n`
  if (address) msg += `📍 ${address}\n`
  if (phone)   msg += `📞 ${phone}${gstin ? `  GST: ${gstin}` : ''}\n`
  msg += `${sep}\n📄 Bill: *${bill.bill_no}*  |  ${sym}${Math.round(bill.grand_total)}\n`
  msg += `📅 ${bill.bill_date}  ${bill.bill_time}\n`
  if (receiptUrl) {
    msg += `${sep}\n📥 *View/Download Receipt:*\n${receiptUrl}\n`
  }
  if (bill.loyalty_earned_pts > 0) {
    msg += `${sep}\n🎁 You earned *${bill.loyalty_earned_pts}* loyalty points!\n`
  }
  if (bill.wallet_link) {
    msg += `${sep}\n🎁 *Save your loyalty card to Google Wallet:*\n${bill.wallet_link}\n`
  }
  if (upi_id) {
    msg += `${sep}\n💳 Pay via UPI: *${upi_id}*\nAmount: ${sym}${Math.round(bill.grand_total)}\n`
  }
  msg += `${sep}\n🙏 *Thank you! Visit again.*\n_Exchange within 7 days with receipt_`
  return msg
}

const CSS = `
.nb-line { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto auto; gap: 12px; align-items: center;
  padding: 12px 4px; border-bottom: 1px solid rgba(0,0,0,0.07); }
.nb-line:last-child { border-bottom: none; }
.nb-hit { display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.06); }
.nb-hit:last-child { border-bottom: none; }
.nb-hit:hover, .nb-hit-active { background: rgba(47,102,144,0.08); }
.nb-sum-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; font-size: 14px; color: ${SUB}; }
.nb-sum-row b { color: ${TEXT}; font-weight: 600; }
.nb-chip { border: 1px solid rgba(47,102,144,0.35) !important; background: transparent !important; box-shadow: none !important; color: ${PRIMARY} !important; }
.nb-chip-on { background: ${PRIMARY} !important; color: #fff !important; }
.nb-page .ant-segmented-item-selected { background: ${PRIMARY} !important; color: #fff !important; }
.nb-page .ant-segmented-item:not(.ant-segmented-item-selected) { color: ${TEXT}; }
.nb-kbd { display: inline-block; padding: 0 5px; border-radius: 4px; border: 1px solid rgba(0,0,0,0.2); font-size: 11px; font-family: monospace; color: ${TEXT}; background: rgba(255,255,255,0.5); }
.nb-mobile-bar { position: fixed; left: 0; right: 0; bottom: calc(64px + env(safe-area-inset-bottom)); z-index: 999;
  background: var(--bg); box-shadow: 0 -4px 16px rgba(0,0,0,0.15); padding: 10px 14px;
  display: flex; align-items: center; justify-content: space-between; gap: 12px; }
@media (max-width: 767px) {
  .nb-line { grid-template-columns: minmax(0, 1fr) auto; row-gap: 8px; }
  .nb-line-ctrls { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
}
@media (min-width: 768px) { .nb-line-ctrls { display: contents; } }
`

export default function NewBill() {
  const { storeName, storeCode, country } = useAuthStore()
  const { isOnline, cachedProducts, cachedCustomers, cacheProducts, cacheCustomers, addPendingBill } = useOfflineStore()
  const screens = useBreakpoint()
  const { sym } = useCurrency()
  const isMobile = !screens.md
  const india = (country || 'India') === 'India'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const scanMode = searchParams.get('scan') === '1'

  const DRAFT_KEY = `newbill_draft_${storeCode || 'store'}`
  const HELD_KEY  = `newbill_held_${storeCode || 'store'}`
  const [draft] = useState(() => readStore(DRAFT_KEY, null))

  // ── State ──────────────────────────────────────────────────────────────────
  const [customer, setCustomer]         = useState(draft?.customer ?? null)
  const [walkIn, setWalkIn]             = useState(draft?.walkIn ?? false)
  const [custSearch, setCustSearch]     = useState(draft?.customer && !draft?.walkIn ? draft.customer.name : '')
  const [custResults, setCustResults]   = useState([])
  const [newCustModal, setNewCustModal] = useState(false)
  const [custLoading, setCustLoading]   = useState(false)
  const [custLastVisit, setCustLastVisit] = useState(null)
  const [moreCustFields, setMoreCustFields] = useState(false)

  const [cart, setCart]           = useState(draft?.cart ?? [])
  const [itemId, setItemId]       = useState('')
  const [searchHits, setSearchHits] = useState([])
  const [hitIndex, setHitIndex]   = useState(0)
  const [addingItem, setAddingItem] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)

  // Custom item modal
  const [customModal, setCustomModal] = useState(false)
  const [customForm] = Form.useForm()

  const [discType, setDiscType]       = useState(draft?.discType ?? '%')
  const [discVal, setDiscVal]         = useState(draft?.discVal ?? 0)
  const [payTab, setPayTab]           = useState('Cash')
  const [cardMode, setCardMode]       = useState('Debit Card')
  const [cashGiven, setCashGiven]     = useState(null)        // null = exact amount
  const [creditAmount, setCreditAmount] = useState(0)
  const [splitPayMode, setSplitPayMode] = useState('Cash')    // how the upfront part of a credit sale is paid
  const [splitA, setSplitA]           = useState({ mode: 'Cash', amount: 0 })
  const [splitB, setSplitB]           = useState('UPI')
  const [notes, setNotes]             = useState(draft?.notes ?? '')
  const [upiConfirmed, setUpiConfirmed] = useState(false)

  const [billing, setBilling]     = useState(false)
  const [lastBill, setLastBill]   = useState(null)
  const [storeProfile, setStoreProfile] = useState(null)
  const [held, setHeld]           = useState(() => readStore(HELD_KEY, []))
  const [returnModal, setReturnModal] = useState(false)
  const [returnBillNo, setReturnBillNo] = useState('')

  // Loyalty state
  const [loyaltyProgram, setLoyaltyProgram] = useState(null)
  const [custLoyalty, setCustLoyalty]       = useState(null)
  const [redeemPts, setRedeemPts]           = useState(0)
  const [creditUse, setCreditUse]           = useState(0)   // store credit applied to this bill

  const itemInputRef = useRef(null)
  const custInputRef = useRef(null)
  const searchTimer  = useRef(null)

  useEffect(() => {
    const preselect = searchParams.get('customer')
    if (preselect) {
      getCustomer(preselect)
        .then((c) => { setCustomer(c); setWalkIn(false); setCustSearch(c.name) })
        .catch(() => message.error('Could not load that customer'))
    }
    getStoreProfile().then(setStoreProfile).catch(() => {})
    getLoyaltyProgram().then(setLoyaltyProgram).catch(() => {})
    // Pre-load products and customers into offline cache
    if (isOnline) {
      getProducts({ limit: 200 }).then((list) => { if (list?.length) cacheProducts(list) }).catch(() => {})
      getCustomers({ limit: 200 }).then((list) => { if (list?.length) cacheCustomers(list) }).catch(() => {})
    }
  }, [])

  // Keep the cart through a page refresh
  useEffect(() => {
    if (cart.length || customer) writeStore(DRAFT_KEY, { customer, walkIn, cart, discType, discVal, notes })
    else { try { localStorage.removeItem(DRAFT_KEY) } catch { /* ignore */ } }
  }, [DRAFT_KEY, customer, walkIn, cart, discType, discVal, notes])

  useEffect(() => { writeStore(HELD_KEY, held) }, [HELD_KEY, held])

  // Fetch customer loyalty balance + last visit whenever customer changes
  useEffect(() => {
    if (!customer || customer.customer_id === 'WALKIN' || !isOnline) {
      setCustLoyalty(null); setRedeemPts(0); setCustLastVisit(null); setCreditUse(0); return
    }
    setCreditUse(0)
    getCustomerLoyalty(customer.customer_id)
      .then(setCustLoyalty)
      .catch(() => setCustLoyalty(null))
    getBills({ customer_id: customer.customer_id, limit: 1 })
      .then((rows) => setCustLastVisit(rows?.[0]?.bill_date || ''))
      .catch(() => setCustLastVisit(null))
    setRedeemPts(0)
  }, [customer, isOnline])

  // ── Customer Search ────────────────────────────────────────────────────────
  const searchCustomer = useCallback(async (val) => {
    const q = (val ?? custSearch).trim().toLowerCase()
    if (!q) { setCustResults([]); return }
    setCustLoading(true)
    try {
      if (!isOnline) {
        const results = cachedCustomers.filter((c) =>
          c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
        )
        setCustResults(results)
        return
      }
      const res = await getCustomers({ search: q })
      const list = res || []
      setCustResults(list)
      if (list.length) cacheCustomers(list)
    } catch {
      // fallback to cache on network error
      const results = cachedCustomers.filter((c) =>
        c.name?.toLowerCase().includes(q) || c.phone?.includes(q)
      )
      setCustResults(results)
    } finally {
      setCustLoading(false)
    }
  }, [custSearch, isOnline, cachedCustomers, cacheCustomers])

  const custDebounceRef = useRef(null)
  function onCustSearchChange(val) {
    setCustSearch(val)
    if (custDebounceRef.current) clearTimeout(custDebounceRef.current)
    if (!val.trim()) { setCustResults([]); return }
    custDebounceRef.current = setTimeout(() => searchCustomer(val), 300)
  }

  // ── Add to Cart ────────────────────────────────────────────────────────────
  function pushToCart(prod, q = 1, sz = null, priceOverride = null) {
    const sp   = Math.round(priceOverride ?? prod.selling_price ?? prod.mrp ?? 0)
    const mrp  = prod.mrp ?? sp
    const gst  = prod.gst_pct ?? 5
    const disc = mrp > 0 ? Math.round((1 - sp / mrp) * 1000) / 10 : 0
    const size = sz ?? prod.size ?? ''
    const key  = `${prod.item_id}__${size}__${Date.now()}`

    setCart((prev) => {
      // Merge only if same item_id + size + no extra per-item disc
      const idx = prev.findIndex(
        (it) => it.item_id === prod.item_id && it.size === size && it.item_disc_pct === 0
      )
      if (idx >= 0 && !priceOverride) {
        const updated = [...prev]
        updated[idx] = lineFor(updated[idx], updated[idx].qty + q)
        return updated
      }
      return [...prev, lineFor({
        _key: key, item_id: prod.item_id, product_name: prod.product_name,
        category: prod.category || '', size, color: prod.color || '',
        stock_qty: prod.stock_qty,
        mrp, base_price: sp, selling_price: sp,
        item_disc_pct: 0, item_disc_type: '%', item_disc_val: 0,
        discount_pct: disc, gst_pct: gst,
      }, q)]
    })
    if (prod.stock_qty != null && prod.stock_qty <= 0 && !String(prod.item_id).startsWith('CUSTOM')) {
      message.warning(`${prod.product_name} shows 0 in stock — added anyway`, 2.5)
    } else {
      message.success(`Added ${prod.product_name}`, 1.2)
    }
    clearTimeout(searchTimer.current)
    setSearchHits([])
    setItemId('')
    setTimeout(() => itemInputRef.current?.focus(), 50)
  }

  function applyItemDisc(item, val, type = '%') {
    // Normalise ₹-per-unit or % to an effective percent; prices stay in whole rupees
    const v = Math.max(0, val || 0)
    let effPct
    if (type === 'Rs.') {
      const rsOffPerUnit = Math.min(item.base_price || item.mrp || 0, v)
      effPct = item.base_price > 0 ? (rsOffPerUnit / item.base_price) * 100 : 0
    } else {
      effPct = Math.min(100, v)
    }
    const sp = Math.round(item.base_price * (1 - effPct / 100))
    return lineFor({
      ...item,
      item_disc_type: type,
      item_disc_val:  v,
      item_disc_pct:  Math.round(effPct * 10) / 10,
      selling_price:  sp,
    }, item.qty)
  }

  const updateLine = (key, fn) => setCart((prev) => prev.map((it) => (it._key === key ? fn(it) : it)))

  function removeLine(key) {
    const idx = cart.findIndex((i) => i._key === key)
    if (idx < 0) return
    const removed = cart[idx]
    setCart((p) => p.filter((i) => i._key !== key))
    message.open({
      key: 'undo-remove', type: 'info', duration: 5,
      content: (
        <span>
          Removed {removed.product_name}.{' '}
          <a style={{ fontWeight: 700, color: PRIMARY }} onClick={() => {
            setCart((p) => [...p.slice(0, idx), removed, ...p.slice(idx)])
            message.destroy('undo-remove')
          }}>Undo</a>
        </span>
      ),
    })
  }

  function openCustomModal(name = '') {
    setCustomModal(true)
    customForm.setFieldsValue({ product_name: name, gst_pct: 5, qty: 1 })
  }

  async function lookupItem(raw) {
    const val = (raw || '').trim()
    if (!val) return
    setAddingItem(true)
    try {
      if (!isOnline) {
        const q = val.toLowerCase()
        const hits = cachedProducts.filter((p) =>
          p.item_id?.toLowerCase() === q || p.barcode?.toLowerCase() === q ||
          p.product_name?.toLowerCase().includes(q)
        )
        if (!hits.length) { openCustomModal(val); setItemId(''); return }
        if (hits.length === 1) { pushToCart(hits[0]); return }
        setSearchHits(hits); setHitIndex(0); return
      }

      const exact = await getProduct(val.toUpperCase()).catch(() =>
        val !== val.toUpperCase() ? getProduct(val).catch(() => null) : null
      )
      if (exact) { pushToCart(exact); return }

      const hits = await getProducts({ search: val })
      if (hits?.length) cacheProducts([...cachedProducts, ...hits].filter(
        (p, i, arr) => arr.findIndex((x) => x.item_id === p.item_id) === i
      ))
      // A scanned label matches one product by its barcode
      const byBarcode = hits?.find((p) => p.barcode && p.barcode.toUpperCase() === val.toUpperCase())
      if (byBarcode) { pushToCart(byBarcode); return }
      if (!hits?.length) { openCustomModal(val); setItemId(''); return }
      if (hits.length === 1) { pushToCart(hits[0]); return }
      setSearchHits(hits); setHitIndex(0)
    } catch {
      message.error('Product lookup failed')
    } finally {
      setAddingItem(false)
    }
  }

  function onItemTyping(val) {
    setItemId(val)
    clearTimeout(searchTimer.current)
    if (val.trim().length < 2) { setSearchHits([]); return }
    searchTimer.current = setTimeout(async () => {
      try {
        const q = val.trim()
        const hits = isOnline
          ? await getProducts({ search: q })
          : cachedProducts.filter((p) => p.product_name?.toLowerCase().includes(q.toLowerCase()) || p.item_id?.toLowerCase().includes(q.toLowerCase()))
        setSearchHits(hits || []); setHitIndex(0)
      } catch { /* keep typing */ }
    }, 300)
  }

  function onItemKeyDown(e) {
    if (e.key === 'ArrowDown' && searchHits.length) { e.preventDefault(); setHitIndex((i) => Math.min(i + 1, Math.min(searchHits.length, 10) - 1)) }
    else if (e.key === 'ArrowUp' && searchHits.length) { e.preventDefault(); setHitIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      // Arrow-selected suggestion wins; otherwise treat input as ID / barcode (scanners end with Enter)
      if (searchHits.length && hitIndex > 0) pushToCart(searchHits[hitIndex])
      else lookupItem(itemId)
    }
  }

  const onScanned = useCallback((text) => {
    setScannerOpen(false)
    lookupItem(text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline, cachedProducts])

  function handleAddCustomItem(values) {
    const prod = {
      item_id: `CUSTOM-${Date.now()}`,
      product_name: values.product_name,
      category: values.category || 'Other',
      color: '',
      mrp: values.mrp || values.selling_price,
      selling_price: values.selling_price,
      gst_pct: values.gst_pct ?? 5,
    }
    pushToCart(prod, values.qty || 1, values.size || '')
    setCustomModal(false)
    customForm.resetFields()
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const itemCount  = cart.reduce((s, i) => s + i.qty, 0)
  const grossItems = cart.reduce((s, i) => s + Math.round(i.base_price * i.qty), 0)
  const rawSub = cart.reduce((s, i) => s + i.subtotal, 0)
  const rawGst = cart.reduce((s, i) => s + i.gst_amt, 0)
  const itemDisc = grossItems - rawSub
  const disc   = discType === '%'
    ? Math.round(rawSub * discVal / 100)
    : Math.min(discVal, rawSub)
  // Loyalty redemption: 1 point = ₹1, capped by program max_redeem_percent and remaining subtotal
  const maxRedeemPct  = loyaltyProgram?.max_redeem_percent ?? 100
  const maxRedeemPts  = Math.max(0, Math.min(
    custLoyalty?.loyalty_pts ?? 0,
    Math.floor(rawSub * maxRedeemPct / 100 - disc),
  ))
  const effRedeemPts  = Math.max(0, Math.min(redeemPts, maxRedeemPts))
  const loyDisc       = effRedeemPts
  const adjSub = rawSub - disc - loyDisc
  const adjGst = rawSub > 0 ? Math.round(rawGst / rawSub * adjSub * 100) / 100 : 0
  const grand  = Math.round(adjSub + adjGst)
  const realCustomer = customer && customer.customer_id !== 'WALKIN'
  const earnPts = loyaltyProgram?.enabled
    ? Math.floor(Math.max(0, rawSub - loyDisc) * (loyaltyProgram.points_per_rupee || 0))
    : 0

  // Store credit (from earlier returns) pays first; everything below works on what's left to pay
  const creditAvail = realCustomer ? Math.floor(customer.store_credit || 0) : 0
  const creditUsed  = Math.min(creditUse || 0, creditAvail, grand)
  const payable     = grand - creditUsed
  const toPay       = payable > 0

  const isCredit  = toPay && payTab === 'Credit'
  const isSplit   = toPay && payTab === 'Split'
  const payMode   = payTab === 'Card' ? cardMode : payTab
  const upfront   = isCredit ? Math.max(0, payable - creditAmount) : payable
  const isPartialCredit = isCredit && upfront > 0
  const tendered  = payTab === 'Cash' ? (cashGiven ?? payable) : payable
  const change    = Math.round(tendered - payable)
  const splitAAmt = Math.min(Math.max(0, splitA.amount || 0), payable)
  const splitBAmt = payable - splitAAmt
  const upiId     = storeProfile?.upi_id?.trim()
  const needsUpiConfirm = toPay && payTab === 'UPI' && !!upiId && !upiConfirmed
  const shortCash = toPay && payTab === 'Cash' && change < 0
  const splitInvalid = isSplit && (splitAAmt <= 0 || splitAAmt >= payable || splitA.mode === splitB)

  // When switching TO Credit, default to full credit (upfront = 0)
  useEffect(() => {
    if (isCredit) setCreditAmount(payable)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCredit])

  function resetBill() {
    setCart([]); setCustomer(null); setWalkIn(false)
    setCustSearch(''); setCustResults([])
    setDiscVal(0); setNotes(''); setCreditAmount(0); setRedeemPts(0)
    setCashGiven(null); setUpiConfirmed(false); setPayTab('Cash'); setCreditUse(0)
    setSplitA({ mode: 'Cash', amount: 0 })
  }

  function confirmClear() {
    if (!cart.length) return
    Modal.confirm({
      title: 'Clear this bill?',
      content: `All ${cart.length} item${cart.length > 1 ? 's' : ''} and the customer will be removed.`,
      okText: 'Clear bill', okButtonProps: { danger: true }, cancelText: 'Keep',
      onOk: resetBill,
    })
  }

  // ── Hold / park ────────────────────────────────────────────────────────────
  function holdBill() {
    if (!cart.length) return
    const label = realCustomer ? customer.name : `Walk-in ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    setHeld((h) => [...h, { id: Date.now(), label, at: new Date().toISOString(), customer, walkIn, cart, discType, discVal, notes, total: grand }])
    resetBill()
    message.success(`Bill held for ${label}. Resume it from "Held bills".`)
  }

  function resumeHeld(id) {
    const h = held.find((x) => x.id === id)
    if (!h) return
    const rest = held.filter((x) => x.id !== id)
    if (cart.length) {
      const label = realCustomer ? customer.name : 'Walk-in (swapped)'
      rest.push({ id: Date.now(), label, at: new Date().toISOString(), customer, walkIn, cart, discType, discVal, notes, total: grand })
      message.info('Current bill was held so you can switch back to it')
    }
    setHeld(rest)
    setCart(h.cart); setCustomer(h.customer); setWalkIn(h.walkIn)
    setCustSearch(h.customer && !h.walkIn ? h.customer.name : '')
    setDiscType(h.discType); setDiscVal(h.discVal); setNotes(h.notes || '')
    setLastBill(null)
  }

  // ── Generate Bill ──────────────────────────────────────────────────────────
  async function handleGenerateBill() {
    if (!cart.length) { message.error('Add at least one item'); return }
    if (shortCash) { message.error(`Cash received is ${sym}${-change} short`); return }
    if (needsUpiConfirm) { message.warning('Confirm the UPI payment first'); return }
    if (splitInvalid) { message.error('Enter how much is paid by the first mode (less than the total), using two different modes'); return }
    if (effRedeemPts > 0 && effRedeemPts < (loyaltyProgram?.min_redeem_points || 0)) {
      message.error(`Minimum ${loyaltyProgram.min_redeem_points} points required to redeem`); return
    }
    const cust = customer || { customer_id: 'WALKIN', name: 'Walk-in', phone: '' }
    const splitNote = isSplit ? `Split: ${splitA.mode} ${sym}${splitAAmt} + ${splitB} ${sym}${splitBAmt}` : ''
    const creditNote = creditUsed > 0 ? `Store credit used ${sym}${creditUsed}` : ''

    setBilling(true)
    try {
      const payload = {
        customer_id:   cust.customer_id,
        customer_name: cust.name,
        phone:         cust.phone || '',
        items: cart.map((it) => ({
          item_id: it.item_id, product_name: it.product_name, category: it.category,
          size: it.size, color: it.color, qty: it.qty, mrp: it.mrp,
          selling_price: it.selling_price, gst_pct: it.gst_pct,
        })),
        discount: disc, discount_type: discType,
        payment_mode: !toPay ? 'Store Credit' : isPartialCredit ? `${splitPayMode}+Credit` : isSplit ? `${splitA.mode}+${splitB}` : payMode,
        amount_paid: !toPay ? 0 : isCredit ? upfront : tendered,
        store_credit_used: creditUsed,
        notes: [creditNote, splitNote, notes].filter(Boolean).join(' · '),
        points_redeemed: effRedeemPts,
      }

      if (!isOnline) {
        addPendingBill(payload)
        resetBill()
        message.success('Bill saved offline! Will sync when internet returns.')
        return
      }

      const res = await createBill(payload)
      setLastBill(res)
      resetBill()
      message.success(`Bill ${res.bill_no} generated!`)
      if (isMobile) window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      message.error(err.message)
    } finally {
      setBilling(false)
    }
  }

  // ── Keyboard shortcuts (desktop) ───────────────────────────────────────────
  const generateRef = useRef(handleGenerateBill)
  useEffect(() => { generateRef.current = handleGenerateBill })
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'F2') { e.preventDefault(); itemInputRef.current?.focus() }
      else if (e.key === 'F4') { e.preventDefault(); custInputRef.current?.focus() }
      else if (e.key === 'F9' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); generateRef.current() }
      else if (e.key === 'Escape' && !document.querySelector('.ant-modal-wrap')) {
        clearTimeout(searchTimer.current)
        setItemId(''); setSearchHits([])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── After billing ──────────────────────────────────────────────────────────
  async function printLast() {
    try {
      await printPdfWithAuth(`/bills/${lastBill.bill_no}/receipt-pdf`)
    } catch (err) { message.error('Print failed: ' + err.message) }
  }
  async function downloadLast() {
    try {
      await openPdfWithAuth(`/bills/${lastBill.bill_no}/receipt-pdf`, `Receipt_${lastBill.bill_no}.pdf`)
    } catch (err) { message.error('Download failed: ' + err.message) }
  }
  function whatsappLast() {
    const receiptUrl = lastBill.share_token ? getPublicReceiptUrl(lastBill.share_token) : null
    const msg = buildWhatsAppMsg(lastBill, storeName, storeProfile, receiptUrl, sym)
    window.open(`https://wa.me/${whatsappNumber(lastBill.phone)}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  // ── Add Customer Modal ─────────────────────────────────────────────────────
  const [custForm] = Form.useForm()
  async function handleAddCustomer(values) {
    try {
      const phone = india ? normalizeIndianMobile(values.phone) : values.phone
      const res = await createCustomer({ ...values, phone })
      setCustomer(res); setWalkIn(false); setCustSearch(res.name)
      setNewCustModal(false); setMoreCustFields(false)
      custForm.resetFields()
      message.success(`Customer ${values.name} added!`)
    } catch (err) {
      message.error(err.message)
    }
  }

  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const custPhoneBad = realCustomer && india && customer.phone && !normalizeIndianMobile(customer.phone)

  // ── UI pieces ──────────────────────────────────────────────────────────────
  const kbd = (k) => !isMobile && <span className="nb-kbd" style={{ marginLeft: 6 }}>{k}</span>

  const customerCard = (
    <Card
      title={<span>Customer{kbd('F4')}</span>}
      size={isMobile ? 'small' : undefined}
      style={{ marginBottom: 12, borderRadius: 12 }}
      extra={
        <Checkbox checked={walkIn} onChange={(e) => {
          setWalkIn(e.target.checked)
          if (e.target.checked) { setCustomer({ customer_id: 'WALKIN', name: 'Walk-in', phone: '' }); setCustSearch('') }
          else setCustomer(null)
        }}>Walk-in</Checkbox>
      }
    >
      {!walkIn && (
        <div style={{ display: 'flex', gap: 8, marginBottom: customer ? 10 : 0 }}>
          <AutoComplete
            ref={custInputRef}
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
                  {c.credit_balance > 0 && <Tag color="red" style={{ fontSize: 11, margin: 0 }}>Due {money(c.credit_balance)}</Tag>}
                </div>
              ),
            }))}
            notFoundContent={custLoading ? <Spin size="small" /> : custSearch.trim() ? 'No customers found' : null}
            allowClear
            onClear={() => { setCustSearch(''); setCustResults([]); setCustomer(null) }}
          >
            <Input placeholder="Search by name or phone (optional)" prefix={<SearchOutlined />} suffix={custLoading ? <Spin size="small" /> : null} />
          </AutoComplete>
          <Button icon={<UserAddOutlined />} onClick={() => setNewCustModal(true)}>{!isMobile && 'New'}</Button>
        </div>
      )}

      {realCustomer && (
        <div style={{ background: 'rgba(47,102,144,0.07)', borderRadius: 10, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <b style={{ color: TEXT }}>{customer.name}</b>
            {customer.phone && <span style={{ color: SUB, fontSize: 13 }}>{customer.phone}</span>}
            {custPhoneBad && <Tag color="red" style={{ margin: 0 }}>Phone number looks wrong</Tag>}
            {customer.member_type && <Tag style={{ margin: 0 }}>{customer.member_type}</Tag>}
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: SUB, marginTop: 4 }}>
            <span>Last visit: <b style={{ color: TEXT }}>{custLastVisit ? new Date(custLastVisit + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : custLastVisit === '' ? 'First visit' : '—'}</b></span>
            <span>Total spend: <b style={{ color: TEXT }}>{money(customer.total_purchase)}</b></span>
            {customer.credit_balance > 0 && <span style={{ color: BAD }}>Owes: <b>{money(customer.credit_balance)}</b></span>}
            {loyaltyProgram?.enabled && custLoyalty && <span>Points: <b style={{ color: TEXT }}>{custLoyalty.loyalty_pts || 0}</b></span>}
            {customer.store_credit > 0 && <span style={{ color: GOOD }}>Store credit: <b>{money(customer.store_credit)}</b></span>}
          </div>
        </div>
      )}
    </Card>
  )

  const hitsList = searchHits.length > 0 && (
    <div style={{ marginTop: 8, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg)' }}>
      <div style={{ padding: '6px 12px', fontSize: 12, color: SUB, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        {searchHits.length} match{searchHits.length > 1 ? 'es' : ''} — {isMobile ? 'tap' : 'click or use ↑ ↓ Enter'} to add
      </div>
      {searchHits.slice(0, 10).map((p, i) => {
        const out = p.stock_qty != null && p.stock_qty <= 0
        return (
          <div key={p.item_id} className={`nb-hit${i === hitIndex && !isMobile ? ' nb-hit-active' : ''}`}
            onMouseEnter={() => setHitIndex(i)} onClick={() => pushToCart(p)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>
                {p.product_name}{p.size ? ` · ${p.size}` : ''}{p.color ? ` · ${p.color}` : ''}
              </div>
              <div style={{ fontSize: 12, color: SUB }}>
                {p.item_id} ·{' '}
                <span style={{ color: out ? BAD : p.stock_qty <= (p.min_stock ?? 5) ? '#B9770E' : GOOD, fontWeight: 600 }}>
                  {out ? 'Out of stock' : `${p.stock_qty} left`}
                </span>
              </div>
            </div>
            <b style={{ color: TEXT }}>{money(p.selling_price)}</b>
          </div>
        )
      })}
    </div>
  )

  const itemsCard = (
    <Card
      title={<span>Add items{kbd('F2')}</span>}
      size={isMobile ? 'small' : undefined}
      style={{ marginBottom: 12, borderRadius: 12 }}
      extra={<Button size="small" type="link" icon={<PlusOutlined />} onClick={() => openCustomModal(itemId)} style={{ color: PRIMARY }}>Custom item</Button>}
    >
      <div style={{ display: 'flex', gap: 8 }}>
        <Input
          ref={itemInputRef}
          placeholder={isMobile ? 'Search item name or ID' : 'Scan barcode, or type item name / ID and press Enter'}
          value={itemId}
          onChange={(e) => onItemTyping(e.target.value)}
          onKeyDown={onItemKeyDown}
          prefix={<SearchOutlined />}
          suffix={addingItem ? <Spin size="small" /> : null}
          size="large"
          autoFocus={!isMobile || scanMode}
          autoComplete="off"
          enterKeyHint="search"
        />
        {isMobile && (
          <Button size="large" icon={<CameraOutlined />} onClick={() => setScannerOpen(true)} aria-label="Scan barcode with camera" />
        )}
      </div>
      {hitsList}
    </Card>
  )

  const cartCard = cart.length > 0 && (
    <Card
      title={`Cart · ${itemCount} item${itemCount > 1 ? 's' : ''}`}
      size={isMobile ? 'small' : undefined}
      style={{ marginBottom: 12, borderRadius: 12 }}
      extra={<Button danger size="small" icon={<ClearOutlined />} onClick={confirmClear}>Clear</Button>}
    >
      {cart.map((it) => {
        const discounted = it.selling_price < it.base_price
        return (
          <div key={it._key} className="nb-line">
            <div style={{ minWidth: 0 }}>
              <div style={{ color: TEXT, fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>
                {it.product_name}
                {it.item_id?.startsWith('CUSTOM') && <Tag color="orange" style={{ marginLeft: 6, fontSize: 10 }}>Custom</Tag>}
              </div>
              <div style={{ fontSize: 12.5, color: SUB }}>
                {[it.size, it.color].filter(Boolean).join(' · ') || 'No size'} ·{' '}
                {discounted && <s style={{ marginRight: 4 }}>{money(it.base_price)}</s>}
                <b style={{ color: discounted ? GOOD : TEXT }}>{money(it.selling_price)}</b> each
              </div>
            </div>
            {isMobile && <b style={{ color: TEXT, fontSize: 15 }}>{money(it.subtotal)}</b>}
            <div className="nb-line-ctrls">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Button size="small" icon={<MinusOutlined />} aria-label="Decrease quantity"
                  disabled={it.qty <= 1} onClick={() => updateLine(it._key, (x) => lineFor(x, x.qty - 1))} />
                <InputNumber size="small" min={1} value={it.qty} controls={false} style={{ width: 46, textAlign: 'center' }}
                  onChange={(v) => v && updateLine(it._key, (x) => lineFor(x, v))} aria-label="Quantity" />
                <Button size="small" icon={<PlusOutlined />} aria-label="Increase quantity"
                  onClick={() => updateLine(it._key, (x) => lineFor(x, x.qty + 1))} />
              </div>
              <Tooltip title={`Discount on this item — % or ${sym} off each`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Segmented size="small" value={it.item_disc_type || '%'}
                    options={[{ label: '%', value: '%' }, { label: sym, value: 'Rs.' }]}
                    onChange={(t) => updateLine(it._key, (x) => applyItemDisc(x, 0, t))} />
                  <InputNumber size="small" min={0} placeholder="Disc" style={{ width: 64 }}
                    max={(it.item_disc_type || '%') === 'Rs.' ? (it.base_price || 100000) : 100}
                    value={it.item_disc_val || null}
                    onChange={(v) => updateLine(it._key, (x) => applyItemDisc(x, v, x.item_disc_type || '%'))} />
                </div>
              </Tooltip>
              {!isMobile && <b style={{ color: TEXT, fontSize: 15, minWidth: 72, textAlign: 'right' }}>{money(it.subtotal)}</b>}
              <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeLine(it._key)} aria-label={`Remove ${it.product_name}`} />
            </div>
          </div>
        )
      })}
    </Card>
  )

  const heldMenu = held.length > 0 && (
    <Dropdown trigger={['click']} menu={{
      items: held.map((h) => ({
        key: String(h.id),
        label: <span>{h.label} · {money(h.total)} · {h.cart.length} item{h.cart.length > 1 ? 's' : ''}</span>,
      })),
      onClick: ({ key }) => resumeHeld(Number(key)),
    }}>
      <Button icon={<HistoryOutlined />}>Held bills ({held.length})</Button>
    </Dropdown>
  )

  const summaryCard = (
    <Card
      title="Bill summary"
      size={isMobile ? 'small' : undefined}
      style={{ borderRadius: 12, marginBottom: 12 }}
      styles={{ body: { padding: isMobile ? 12 : 18 } }}
      extra={cart.length > 0 && <Button size="small" icon={<PauseCircleOutlined />} onClick={holdBill}>Hold</Button>}
    >
      {cart.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 8px', color: SUB }}>
          <ShoppingCartOutlined style={{ fontSize: 34, color: PRIMARY, opacity: 0.6 }} />
          <div style={{ marginTop: 8, fontSize: 14 }}>Scan or search an item to start the bill</div>
          {!isMobile && (
            <div style={{ marginTop: 14, fontSize: 12.5, lineHeight: 2 }}>
              <span className="nb-kbd">F2</span> item search · <span className="nb-kbd">F4</span> customer ·{' '}
              <span className="nb-kbd">F9</span> / <span className="nb-kbd">Ctrl+Enter</span> generate bill · <span className="nb-kbd">Esc</span> clear search
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Totals */}
          <div className="nb-sum-row"><span>Items total ({itemCount})</span><b>{money(grossItems)}</b></div>
          {itemDisc > 0 && <div className="nb-sum-row"><span>Item discounts</span><b style={{ color: GOOD }}>-{money(itemDisc)}</b></div>}

          {/* Bill discount */}
          <div style={{ margin: '8px 0', padding: '10px 0', borderTop: '1px dashed rgba(0,0,0,0.12)', borderBottom: '1px dashed rgba(0,0,0,0.12)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13.5, color: TEXT, fontWeight: 600, marginRight: 'auto' }}>Bill discount</span>
              <Segmented size="small" value={discType} onChange={(t) => { setDiscType(t); setDiscVal(0) }}
                options={[{ label: '%', value: '%' }, { label: sym, value: 'Rs.' }]} />
              <InputNumber size="small" min={0} max={discType === '%' ? 100 : rawSub} value={discVal || null}
                placeholder="0" onChange={(v) => setDiscVal(v || 0)} style={{ width: 80 }} aria-label="Bill discount" />
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {QUICK_DISCOUNTS.map(([t, v]) => {
                const on = discType === t && discVal === v
                return (
                  <Button key={t + v} size="small" className={`nb-chip${on ? ' nb-chip-on' : ''}`}
                    onClick={() => { if (on) setDiscVal(0); else { setDiscType(t); setDiscVal(v) } }}>
                    {t === '%' ? `${v}%` : `${sym}${v}`}
                  </Button>
                )
              })}
            </div>
            {disc > 0 && <div className="nb-sum-row" style={{ marginTop: 6 }}><span>{discType === '%' ? `${discVal}% off` : 'Flat off'}</span><b style={{ color: GOOD }}>-{money(disc)}</b></div>}
          </div>

          {/* Loyalty points redemption */}
          {loyaltyProgram?.enabled && realCustomer && custLoyalty && maxRedeemPts > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 13.5, color: TEXT, marginRight: 'auto' }}>Redeem points <span style={{ color: SUB, fontSize: 12 }}>({custLoyalty.loyalty_pts} available)</span></span>
              <InputNumber size="small" min={0} max={maxRedeemPts} value={redeemPts || null} placeholder="0"
                onChange={(v) => setRedeemPts(Math.max(0, Math.min(maxRedeemPts, v || 0)))} style={{ width: 80 }} />
              <Button size="small" onClick={() => setRedeemPts(maxRedeemPts)}>Max</Button>
            </div>
          )}
          {effRedeemPts > 0 && effRedeemPts < (loyaltyProgram?.min_redeem_points || 0) && (
            <Text type="danger" style={{ fontSize: 12 }}>Minimum {loyaltyProgram.min_redeem_points} points required to redeem.</Text>
          )}
          {loyDisc > 0 && <div className="nb-sum-row"><span>Points redeemed</span><b style={{ color: GOOD }}>-{money(loyDisc)}</b></div>}

          <div className="nb-sum-row"><span>Taxable value</span><b>{money(adjSub)}</b></div>
          {india ? (
            <>
              <div className="nb-sum-row"><span>CGST</span><b>{money(adjGst / 2)}</b></div>
              <div className="nb-sum-row"><span>SGST</span><b>{money(adjGst - Math.round(adjGst / 2))}</b></div>
            </>
          ) : (
            <div className="nb-sum-row"><span>Tax</span><b>{money(adjGst)}</b></div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 8, borderTop: '2px solid rgba(0,0,0,0.1)' }}>
            <span style={{ fontWeight: 800, color: TEXT, fontSize: 15 }}>Grand total</span>
            <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 26 }}>{money(grand)}</span>
          </div>
          {(itemDisc + disc + loyDisc) > 0 && (
            <div style={{ textAlign: 'right', fontSize: 12.5, color: GOOD, fontWeight: 600 }}>Customer saves {money(itemDisc + disc + loyDisc)}</div>
          )}
          {earnPts > 0 && (
            <div style={{ textAlign: 'right', fontSize: 12.5, color: '#9A7B1C', marginTop: 2 }}>
              {realCustomer
                ? <>This bill earns <b>{earnPts}</b> loyalty pts for {customer.name}</>
                : <>Add a customer to earn <b>{earnPts}</b> loyalty pts</>}
            </div>
          )}

          {creditAvail > 0 && (
            <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(30,132,73,0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13.5, color: TEXT, marginRight: 'auto' }}>
                  Use store credit <span style={{ color: SUB, fontSize: 12 }}>({money(creditAvail)} available)</span>
                </span>
                <InputNumber size="small" min={0} max={Math.min(creditAvail, grand)} value={creditUse || null} placeholder="0"
                  prefix={sym} onChange={(v) => { setCreditUse(v || 0); setCashGiven(null); setUpiConfirmed(false) }} style={{ width: 100 }}
                  aria-label="Store credit to use" />
                <Button size="small" onClick={() => { setCreditUse(Math.min(creditAvail, grand)); setCashGiven(null); setUpiConfirmed(false) }}>Use max</Button>
              </div>
              {creditUsed > 0 && (
                <div className="nb-sum-row" style={{ marginTop: 6 }}>
                  <span>Paid from store credit</span><b style={{ color: GOOD }}>-{money(creditUsed)}</b>
                </div>
              )}
            </div>
          )}
          {creditUsed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}>
              <span style={{ fontWeight: 700, color: TEXT }}>Left to pay</span>
              <span style={{ fontWeight: 800, color: PRIMARY, fontSize: 20 }}>{money(payable)}</span>
            </div>
          )}

          {/* Payment */}
          <Divider style={{ margin: '14px 0 10px' }} />
          {!toPay ? (
            <Alert type="success" showIcon message={`Fully paid from store credit (${money(creditUsed)})`} />
          ) : (
          <div style={{ overflowX: 'auto' }}>
            <Segmented block value={payTab} onChange={(v) => { setPayTab(v); setUpiConfirmed(false); setCashGiven(null) }}
              options={PAY_TABS.map((t) => ({ value: t, label: t === 'Credit' ? (isMobile ? 'Later' : 'Pay later') : t }))} />
          </div>
          )}

          {toPay && payTab === 'Cash' && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: SUB, marginRight: 4 }}>Cash received</span>
                <Button size="small" className={`nb-chip${cashGiven == null ? ' nb-chip-on' : ''}`} onClick={() => setCashGiven(null)}>Exact</Button>
                {CASH_NOTES.filter((n) => n >= payable).slice(0, 3).concat(CASH_NOTES.every((n) => n < payable) ? [Math.ceil(payable / 500) * 500] : []).map((n) => (
                  <Button key={n} size="small" className={`nb-chip${cashGiven === n ? ' nb-chip-on' : ''}`} onClick={() => setCashGiven(n)}>{money(n)}</Button>
                ))}
                <InputNumber size="small" min={0} placeholder="Other" value={cashGiven != null && !CASH_NOTES.includes(cashGiven) ? cashGiven : null}
                  onChange={(v) => setCashGiven(v == null ? null : v)} style={{ width: 90 }} aria-label="Cash received" />
              </div>
              <div style={{
                marginTop: 10, borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: change < 0 ? 'rgba(192,57,43,0.1)' : 'rgba(30,132,73,0.1)',
              }}>
                <span style={{ fontWeight: 600, color: change < 0 ? BAD : GOOD }}>{change < 0 ? 'Short by' : 'Give back change'}</span>
                <span style={{ fontWeight: 800, fontSize: 24, color: change < 0 ? BAD : GOOD }}>{money(Math.abs(change))}</span>
              </div>
            </div>
          )}

          {toPay && payTab === 'Card' && (
            <Radio.Group value={cardMode} onChange={(e) => setCardMode(e.target.value)} style={{ marginTop: 10 }}>
              {CARD_MODES.map((m) => <Radio key={m} value={m}>{m}</Radio>)}
            </Radio.Group>
          )}

          {toPay && payTab === 'UPI' && (
            upiId ? (
              <div style={{ marginTop: 10, borderRadius: 12, padding: 12, border: `2px solid ${upiConfirmed ? GOOD : '#E0A030'}`, textAlign: 'center' }}>
                {!upiConfirmed ? (
                  <>
                    <div style={{ display: 'inline-block', background: '#fff', padding: 8, borderRadius: 10 }}>
                      <QRCodeSVG size={isMobile ? 150 : 170} level="M"
                        value={`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName || '')}&am=${payable}&cu=INR`} />
                    </div>
                    <div style={{ fontSize: 13, color: SUB, margin: '6px 0 10px' }}>Scan to pay <b style={{ color: TEXT }}>{money(payable)}</b> · {upiId}</div>
                    <Button type="primary" block onClick={() => setUpiConfirmed(true)} style={{ background: GOOD }}>Payment received</Button>
                  </>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <b style={{ color: GOOD }}>UPI payment of {money(payable)} confirmed</b>
                    <Button size="small" type="text" danger onClick={() => setUpiConfirmed(false)}>Undo</Button>
                  </div>
                )}
              </div>
            ) : (
              <Alert style={{ marginTop: 10 }} type="info" showIcon message="Add your UPI ID in Settings to show a payment QR code here." />
            )
          )}

          {isSplit && (
            <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select size="small" value={splitA.mode} onChange={(m) => setSplitA((s) => ({ ...s, mode: m }))} options={SPLIT_MODES.map((m) => ({ value: m, label: m }))} style={{ width: 120 }} />
                <InputNumber size="small" min={1} max={payable - 1} value={splitA.amount || null} placeholder="Amount"
                  onChange={(v) => setSplitA((s) => ({ ...s, amount: v || 0 }))} prefix={sym} style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select size="small" value={splitB} onChange={setSplitB} options={SPLIT_MODES.map((m) => ({ value: m, label: m }))} style={{ width: 120 }} />
                <span style={{ flex: 1, fontWeight: 700, color: TEXT }}>{money(splitBAmt)} <span style={{ color: SUB, fontWeight: 400, fontSize: 12 }}>(the rest)</span></span>
              </div>
              {splitA.mode === splitB && <Text type="danger" style={{ fontSize: 12 }}>Choose two different payment modes.</Text>}
            </div>
          )}

          {isCredit && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: SUB, flex: 1 }}>Amount on credit</span>
                <InputNumber size="small" value={creditAmount} min={0} max={payable}
                  onChange={(v) => setCreditAmount(Math.min(payable, Math.max(0, v || 0)))} prefix={sym} style={{ width: 120 }} />
              </div>
              {!realCustomer && <Alert style={{ marginTop: 8 }} type="warning" showIcon message="Select a customer — credit is added to their account." />}
              {isPartialCredit ? (
                <div style={{ marginTop: 8, fontSize: 13, color: SUB }}>
                  Collect {money(upfront)} now by{' '}
                  <Select size="small" value={splitPayMode} onChange={setSplitPayMode} style={{ width: 120 }}
                    options={SPLIT_MODES.map((m) => ({ value: m, label: m }))} />
                </div>
              ) : (
                <Alert style={{ marginTop: 8 }} type="warning" showIcon icon={<ExclamationCircleOutlined />}
                  message={`Full credit — ${money(creditAmount)} will be added to the customer's balance`} />
              )}
            </div>
          )}

          <Input style={{ marginTop: 12 }} placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />

          {!isMobile && (
            <Button
              type="primary" size="large" block loading={billing} onClick={handleGenerateBill}
              icon={<PrinterOutlined />} style={{ height: 52, fontSize: 16, marginTop: 12 }}
              disabled={needsUpiConfirm || shortCash || splitInvalid || (isCredit && !realCustomer)}
            >
              {needsUpiConfirm ? 'Confirm UPI payment first' : shortCash ? `Short by ${money(-change)}` : <>Generate bill · {money(grand)} <span className="nb-kbd" style={{ marginLeft: 8, color: '#fff', borderColor: 'rgba(255,255,255,0.5)', background: 'transparent' }}>F9</span></>}
            </Button>
          )}
        </>
      )}
    </Card>
  )

  const receiptCard = lastBill && (
    <Card
      title={<span style={{ color: GOOD }}>Bill {lastBill.bill_no} saved</span>}
      style={{ borderRadius: 12, marginBottom: 12 }}
      size={isMobile ? 'small' : undefined}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, marginBottom: 14 }}>
        <Button type="primary" icon={<PrinterOutlined />} onClick={printLast}>Print</Button>
        <Button icon={<WhatsAppOutlined />} disabled={!lastBill.phone} onClick={whatsappLast}
          style={lastBill.phone ? { color: '#128C4B' } : undefined}>WhatsApp</Button>
        <Button icon={<DownloadOutlined />} onClick={downloadLast}>Download PDF</Button>
        {lastBill.share_token ? (
          <Button icon={<LinkOutlined />} onClick={() => {
            const url = getPublicReceiptUrl(lastBill.share_token)
            navigator.clipboard?.writeText(url).then(() => message.success('Receipt link copied!')).catch(() => window.open(url, '_blank'))
          }}>Copy link</Button>
        ) : <span />}
        <Button block size="large" type="primary" icon={<PlusOutlined />} style={{ gridColumn: '1 / -1' }}
          onClick={() => { setLastBill(null); setTimeout(() => itemInputRef.current?.focus(), 50) }}>
          New bill
        </Button>
      </div>
      {upiId && lastBill.status === 'Credit' && (
        <div style={{ marginBottom: 12 }}><GPayButton bill={lastBill} storeProfile={storeProfile} storeName={storeName} size="middle" /></div>
      )}
      <ReceiptPreview bill={lastBill} />
    </Card>
  )

  // ── Receipt preview ────────────────────────────────────────────────────────
  function ReceiptPreview({ bill }) {
    const row = (label, value, opts = {}) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 13 }}>
        <span style={{ color: SUB }}>{label}</span>
        <span style={{ color: opts.color || TEXT, fontWeight: opts.bold ? 700 : 500 }}>{value}</span>
      </div>
    )
    return (
      <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(0,0,0,0.1)', background: '#fffdf9' }}>
        <div style={{ background: PRIMARY, color: '#fff', padding: '16px 18px', textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{storeName}</div>
          {storeProfile?.address && <div style={{ fontSize: 11.5, opacity: 0.9, marginTop: 2 }}>{storeProfile.address}</div>}
          {storeProfile?.phone && <div style={{ fontSize: 11.5, opacity: 0.9 }}>{storeProfile.phone}</div>}
          {storeProfile?.gstin && <div style={{ fontSize: 11, opacity: 0.85 }}>GSTIN: {storeProfile.gstin}</div>}
        </div>
        <div style={{ padding: '10px 18px', borderBottom: '1px dashed rgba(0,0,0,0.15)' }}>
          {row('Bill no', bill.bill_no, { bold: true })}
          {row('Date', `${bill.bill_date} ${bill.bill_time}`)}
          {row('Customer', bill.customer_name || 'Walk-in', { bold: true })}
          {bill.phone && row('Phone', bill.phone)}
          {bill.status === 'Credit' && <Tag color="red" style={{ marginTop: 6 }}>CREDIT SALE</Tag>}
        </div>
        <div style={{ padding: '10px 18px', borderBottom: '1px dashed rgba(0,0,0,0.15)' }}>
          {bill.items?.map((it, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ color: TEXT, fontWeight: 600, fontSize: 13 }}>
                  {it.product_name}{it.size ? <span style={{ color: SUB, fontWeight: 400 }}> ({it.size})</span> : null}
                </span>
                <span style={{ color: TEXT, fontWeight: 700 }}>{money(it.qty * it.selling_price)}</span>
              </div>
              <div style={{ color: SUB, fontSize: 11.5 }}>{it.qty} × {money(it.selling_price)}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: '10px 18px' }}>
          {bill.discount > 0 && row('Discount', `-${money(bill.discount)}`, { color: GOOD, bold: true })}
          {bill.loyalty_redeemed_pts > 0 && row('Points redeemed', `-${bill.loyalty_redeemed_pts} pts`, { color: GOOD })}
          {india ? (
            <>
              {row('CGST', money(bill.gst_total / 2))}
              {row('SGST', money(bill.gst_total - Math.round(bill.gst_total / 2)))}
            </>
          ) : row('Tax', money(bill.gst_total))}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid rgba(0,0,0,0.1)', marginTop: 6, paddingTop: 6 }}>
            <b style={{ color: TEXT }}>GRAND TOTAL</b>
            <b style={{ color: PRIMARY, fontSize: 20 }}>{money(bill.grand_total)}</b>
          </div>
          {row('Payment', bill.payment_mode, { bold: true })}
          {row('Paid', money(bill.amount_paid))}
          {bill.change_amt > 0 && row('Change', money(bill.change_amt), { color: GOOD, bold: true })}
          {bill.change_amt < 0 && row('Balance due', money(Math.abs(bill.change_amt)), { color: BAD, bold: true })}
          {bill.loyalty_earned_pts > 0 && <div style={{ fontSize: 12, color: '#9A7B1C', textAlign: 'center', marginTop: 6 }}>Earned {bill.loyalty_earned_pts} loyalty points</div>}
        </div>
        <div style={{ background: 'rgba(47,102,144,0.08)', padding: '10px 18px', textAlign: 'center', fontSize: 12, color: SUB }}>
          Thank you! Visit again · Exchange within 7 days with receipt
        </div>
      </div>
    )
  }

  const showReceipt = lastBill && cart.length === 0

  return (
    <div className="nb-page" style={{ padding: isMobile ? '0 2px' : 0, paddingBottom: isMobile && cart.length > 0 ? 80 : 0 }}>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>New bill</Title>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {heldMenu}
          <Button icon={<SwapOutlined />} onClick={() => setReturnModal(true)}>Return / Exchange</Button>
        </div>
      </div>

      {isMobile ? (
        <>
          {showReceipt && receiptCard}
          {customerCard}
          {itemsCard}
          {cartCard}
          {cart.length > 0 && summaryCard}
        </>
      ) : (
        <Row gutter={16} align="top">
          <Col span={14}>
            {customerCard}
            {itemsCard}
            {cartCard}
          </Col>
          <Col span={10}>
            <div style={{ position: 'sticky', top: 72, maxHeight: 'calc(100vh - 88px)', overflowY: 'auto', paddingBottom: 4 }}>
              {showReceipt ? receiptCard : summaryCard}
            </div>
          </Col>
        </Row>
      )}

      {/* Quick add customer */}
      <Modal
        title="Add customer"
        open={newCustModal}
        onCancel={() => { setNewCustModal(false); setMoreCustFields(false) }}
        footer={null}
        width={isMobile ? '95%' : 460}
        destroyOnHidden
      >
        <Form form={custForm} layout="vertical" onFinish={handleAddCustomer} style={{ marginTop: 12 }}>
          <Form.Item name="name" label="Name" rules={[{ required: true, message: 'Enter the customer name' }]}>
            <Input autoFocus />
          </Form.Item>
          <Form.Item name="phone" label="Mobile number" rules={[
            { required: true, message: 'Enter the mobile number' },
            ...(india ? [indianMobileRule] : []),
          ]}>
            <Input type="tel" inputMode="numeric" prefix={india ? '+91' : undefined} maxLength={india ? 16 : 20} placeholder={india ? '98765 43210' : ''} />
          </Form.Item>
          {moreCustFields ? (
            <>
              <Form.Item name="email" label="Email"><Input type="email" /></Form.Item>
              <Form.Item name="member_type" label="Member type" initialValue="Regular">
                <Select options={MEMBER_TYPES.map((m) => ({ value: m, label: m }))} />
              </Form.Item>
              <Form.Item name="address" label="Address"><Input /></Form.Item>
            </>
          ) : (
            <Button type="link" style={{ padding: 0, marginBottom: 12, color: PRIMARY }} onClick={() => setMoreCustFields(true)}>+ More details (email, address)</Button>
          )}
          <Button type="primary" htmlType="submit" block size="large">Save &amp; use for this bill</Button>
        </Form>
      </Modal>

      {/* Custom Item Modal */}
      <Modal
        title="Add custom / unlisted item"
        open={customModal}
        onCancel={() => { setCustomModal(false); customForm.resetFields() }}
        footer={null}
        width={isMobile ? '95%' : 480}
      >
        <Alert type="info" showIcon message="Item not in your product list. It is added to this bill only." style={{ marginBottom: 16 }} />
        <Form form={customForm} layout="vertical" onFinish={handleAddCustomItem}>
          <Row gutter={12}>
            <Col span={24}>
              <Form.Item name="product_name" label="Item name" rules={[{ required: true }]}>
                <Input placeholder="e.g. Blue Denim Jacket" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="selling_price" label={`Selling price (${sym})`} rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="mrp" label={`MRP (${sym})`}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="qty" label="Qty" initialValue={1}>
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="size" label="Size">
                <Select allowClear options={SIZE_OPTIONS.map((s) => ({ value: s, label: s }))} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="gst_pct" label="GST %" initialValue={5}>
                <Select options={GST_RATES.map((r) => ({ value: r, label: `${r}%` }))} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="category" label="Category" initialValue="Other">
                <Select options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
              </Form.Item>
            </Col>
          </Row>
          <Button type="primary" htmlType="submit" block size="large">Add to cart</Button>
        </Form>
      </Modal>

      {/* Return / exchange lookup */}
      <Modal
        title="Return or exchange"
        open={returnModal}
        onCancel={() => setReturnModal(false)}
        okText="Open bill"
        okButtonProps={{ disabled: !returnBillNo.trim() }}
        onOk={() => { setReturnModal(false); navigate(`/bill-history?bill=${encodeURIComponent(returnBillNo.trim())}`) }}
        destroyOnHidden
      >
        <p style={{ color: SUB }}>
          Enter the bill number from the customer's receipt. You can return items from it there; for an exchange
          (e.g. a different size), process the return and then add the new size on a new bill.
        </p>
        <Input autoFocus placeholder="e.g. BILL0042" value={returnBillNo} onChange={(e) => setReturnBillNo(e.target.value)}
          onPressEnter={() => { if (returnBillNo.trim()) { setReturnModal(false); navigate(`/bill-history?bill=${encodeURIComponent(returnBillNo.trim())}`) } }} />
      </Modal>

      <CameraScanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={onScanned} />

      {/* ── Mobile: total + Generate Bill, fixed above the bottom menu ───────── */}
      {isMobile && cart.length > 0 && (
        <div className="nb-mobile-bar">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, lineHeight: 1.1 }}>{money(grand)}</div>
            <div style={{ fontSize: 12, color: SUB }}>{itemCount} item{itemCount > 1 ? 's' : ''} · {payTab === 'Credit' ? 'Pay later' : payTab}</div>
          </div>
          <Button
            type="primary" size="large" loading={billing} onClick={handleGenerateBill}
            disabled={needsUpiConfirm || shortCash || splitInvalid || (isCredit && !realCustomer)}
            style={{ height: 48, fontSize: 15, borderRadius: 12 }}
          >
            {needsUpiConfirm ? 'Confirm UPI first' : shortCash ? `Short ${money(-change)}` : <>Generate Bill <ArrowRightOutlined /></>}
          </Button>
        </div>
      )}
    </div>
  )
}
