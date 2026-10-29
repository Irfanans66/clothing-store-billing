import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card, Table, Input, Select, Button, Tag, Typography, DatePicker, Tooltip, Dropdown, Badge,
  Modal, Drawer, Divider, message, InputNumber, Alert, Spin, Grid, Radio,
} from 'antd'
import {
  SearchOutlined, PrinterOutlined, RollbackOutlined, FileSearchOutlined, MoreOutlined,
  DownloadOutlined, WhatsAppOutlined, FilterOutlined, StopOutlined, DollarOutlined, EyeOutlined,
  FileExcelOutlined, FilePdfOutlined, CloseOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getBills, getBill, getBillsSummary, returnBillItems, voidBill, recordCreditPayment,
  getPublicReceiptUrl, getStoreProfile,
} from '../api/client'
import { printPdfWithAuth, openPdfWithAuth } from '../utils/pdf'
import { useCurrency } from '../utils/currency'
import { useAuthStore } from '../store/authStore'
import { whatsappNumber } from '../utils/phone'

const { Title } = Typography
const { useBreakpoint } = Grid
const { RangePicker } = DatePicker

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const GOOD    = '#1E8449'
const BAD     = '#C0392B'

const STATUS_COLORS = {
  Paid: 'green', Credit: 'orange', Void: 'default',
  Returned: 'purple', 'Partial Return': 'geekblue',
}
const STATUS_LABEL = { Void: 'Cancelled', Credit: 'Credit (due)' }
const PAY_CHIPS = [['', 'All'], ['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card'], ['credit', 'Credit'], ['split', 'Split']]
const COLLECT_MODES = ['Cash', 'UPI', 'Card', 'Net Banking']
const ISO = 'YYYY-MM-DD'
const PAGE = 20
const SWIPE = 132   // px revealed by swiping a phone card left

const startOfWeek = (d) => d.subtract((d.day() + 6) % 7, 'day')   // Monday
const DATE_PRESETS = () => {
  const t = dayjs()
  return [
    { key: 'today', label: 'Today', value: [t, t] },
    { key: 'yesterday', label: 'Yesterday', value: [t.subtract(1, 'day'), t.subtract(1, 'day')] },
    { key: 'week', label: 'This week', value: [startOfWeek(t), t] },
    { key: 'month', label: 'This month', value: [t.startOf('month'), t] },
    { key: 'lastmonth', label: 'Last month', value: [t.subtract(1, 'month').startOf('month'), t.subtract(1, 'month').endOf('month')] },
  ]
}

const CSS = `
.bh-bar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; background: var(--bg); border-radius: 14px;
  box-shadow: var(--neu-sm); padding: 12px 16px; margin-bottom: 12px; font-size: 13.5px; color: ${SUB}; }
.bh-bar b { color: ${TEXT}; }
.bh-chips { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
.bh-chips::-webkit-scrollbar { display: none; }
.bh-chip { flex: 0 0 auto; border: 1px solid rgba(47,102,144,0.35); background: transparent; color: ${PRIMARY};
  border-radius: 16px; padding: 4px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.bh-chip-on { background: ${PRIMARY}; color: #fff; border-color: ${PRIMARY}; }
.bh-chip-due.bh-chip-on { background: ${BAD}; border-color: ${BAD}; }
.bh-sep { flex: 0 0 1px; background: rgba(0,0,0,0.15); margin: 4px 2px; }
.bh-tools { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1.2fr) 200px; gap: 10px; }
.bh-table .ant-table-row { cursor: pointer; }
.bh-void td { color: #8A837D !important; }
.bh-void .bh-strike { text-decoration: line-through; }
.bh-day { display: flex; justify-content: space-between; font-size: 12.5px; font-weight: 700; color: ${SUB};
  text-transform: uppercase; letter-spacing: 0.4px; margin: 14px 4px 6px; }
.bh-swipe { position: relative; margin-bottom: 10px; }
.bh-swipe-actions { position: absolute; inset: 0 0 0 auto; width: ${SWIPE + 14}px; display: flex; border-radius: 14px; overflow: hidden; }
.bh-swipe-actions button:first-child { padding-left: 14px; }
.bh-swipe-actions button { flex: 1; border: none; color: #fff; font-family: inherit; font-size: 12px; font-weight: 600;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; cursor: pointer; }
.bh-card { position: relative; background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 14px; cursor: pointer;
  touch-action: pan-y; transition: transform 0.2s; }
.bh-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; color: ${SUB}; }
.bh-row b { color: ${TEXT}; }
@media (max-width: 991px) { .bh-tools { grid-template-columns: 1fr 1fr; } }
`

const fmtDay  = (d) => (d ? dayjs(d).format('D MMM YYYY') : '—')
const fmtWhen = (d, t) => [fmtDay(d), t ? t.replace(/^0/, '') : ''].filter(Boolean).join(', ')
const dayLabel = (d) => {
  const x = dayjs(d)
  if (x.isSame(dayjs(), 'day')) return 'Today'
  if (x.isSame(dayjs().subtract(1, 'day'), 'day')) return 'Yesterday'
  return x.format('ddd, D MMM YYYY')
}

function apiParams(f) {
  const p = {}
  if (f.q) p.q = f.q
  if (f.from) p.date_from = f.from
  if (f.to) p.date_to = f.to
  if (f.pay) p.pay = f.pay
  if (f.payment_mode) p.payment_mode = f.payment_mode
  if (f.dueOnly) p.due_only = true
  if (f.cashier) p.cashier = f.cashier
  if (f.category != null) p.category = f.category
  return p
}

// Phone card that reveals WhatsApp / Print when swiped left
function SwipeCard({ open, onOpenChange, actions, onTap, children }) {
  const start = useRef(null)
  const [dx, setDx] = useState(null)
  const offset = dx ?? (open ? -SWIPE : 0)
  return (
    <div className="bh-swipe">
      {offset < 0 && <div className="bh-swipe-actions">{actions}</div>}
      <div
        className="bh-card"
        role="button" tabIndex={0}
        style={{ transform: `translateX(${offset}px)`, transition: dx == null ? 'transform 0.2s' : 'none' }}
        onTouchStart={(e) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, base: open ? -SWIPE : 0, horiz: null } }}
        onTouchMove={(e) => {
          const s = start.current
          if (!s) return
          const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y
          if (s.horiz == null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.horiz = Math.abs(mx) > Math.abs(my)
          if (s.horiz) setDx(Math.max(-SWIPE, Math.min(0, s.base + mx)))
        }}
        onTouchEnd={() => {
          const s = start.current
          start.current = null
          if (dx != null && s?.horiz) { onOpenChange(dx < -SWIPE / 2); setDx(null) }
          else setDx(null)
        }}
        onClick={() => (open ? onOpenChange(false) : onTap())}
        onKeyDown={(e) => { if (e.key === 'Enter') onTap() }}
      >
        {children}
      </div>
    </div>
  )
}

export default function BillHistory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { role, storeName } = useAuthStore()
  const india = (useAuthStore((s) => s.country) || 'India') === 'India'
  const isAdmin = role === 'Admin'
  const screens  = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()

  const [filters, setFilters] = useState(() => {
    const day = searchParams.get('date')
    return {
      q: searchParams.get('customer') || searchParams.get('q') || '',
      from: searchParams.get('from') || day || '',
      to: searchParams.get('to') || day || '',
      pay: '',
      payment_mode: searchParams.get('payment_mode') || '',
      dueOnly: searchParams.get('due') === '1',
      cashier: '',
      category: searchParams.get('category'),
      categoryLabel: searchParams.get('category_label') || searchParams.get('category'),
    }
  })
  const [sort, setSort]         = useState('-date')
  const [page, setPage]         = useState(1)
  const [bills, setBills]       = useState([])
  const [summary, setSummary]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore]   = useState(false)
  const [selected, setSelected] = useState([])
  const [swiped, setSwiped]     = useState(null)
  const [showFilters, setShowFilters] = useState(false)
  const [storeProfile, setStoreProfile] = useState(null)
  const reqId = useRef(0)
  const searchTimer = useRef(null)
  const sentinel = useRef(null)

  // detail drawer
  const [detailBill, setDetailBill] = useState(null)
  const [detailOpen, setDetailOpen] = useState(false)
  // return modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnQtys, setReturnQtys] = useState({})   // bill_item_id -> qty
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)
  // void + collect payment
  const [voidOpen, setVoidOpen]     = useState(false)
  const [voidReason, setVoidReason] = useState('')
  const [voiding, setVoiding]       = useState(false)
  const [payOpen, setPayOpen]       = useState(false)
  const [payAmount, setPayAmount]   = useState(0)
  const [payMode, setPayMode]       = useState('Cash')
  const [paying, setPaying]         = useState(false)

  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const compact = (v) => {
    const n = Number(v) || 0
    if (india && n >= 1e7) return `${sym}${(n / 1e7).toFixed(2).replace(/\.?0+$/, '')}Cr`
    if (india && n >= 1e5) return `${sym}${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`
    return money(n)
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  async function fetchData({ f = filters, s = sort, p = 1, append = false, initial = false } = {}) {
    const id = ++reqId.current
    if (append) setLoadingMore(true); else if (!initial) setLoading(true)
    try {
      const params = apiParams(f)
      const [rows, sum] = await Promise.all([
        getBills({ ...params, sort: s, skip: (p - 1) * PAGE, limit: PAGE }),
        append ? Promise.resolve(null) : getBillsSummary(params),
      ])
      if (id !== reqId.current) return
      setBills((prev) => (append ? [...prev, ...(rows || [])] : rows || []))
      setHasMore((rows || []).length === PAGE)
      setPage(p)
      if (sum) setSummary(sum)
    } catch (err) {
      if (id === reqId.current) message.error(err.message)
    } finally {
      if (id === reqId.current) { setLoading(false); setLoadingMore(false) }
    }
  }

  function applyFilters(patch) {
    const next = { ...filters, ...patch }
    setFilters(next)
    setSelected([])
    fetchData({ f: next })
  }

  // Phone: keep loading as the user scrolls
  useEffect(() => {
    if (!isMobile || !hasMore || !sentinel.current) return
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loadingMore && !loading) fetchData({ p: page + 1, append: true })
    }, { rootMargin: '300px' })
    obs.observe(sentinel.current)
    return () => obs.disconnect()
  })

  function onSearch(val) {
    setFilters((f) => ({ ...f, q: val }))
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => applyFilters({ q: val.trim() }), 300)
  }

  function clearAll() {
    setSearchParams({}, { replace: true })
    applyFilters({ q: '', from: '', to: '', pay: '', payment_mode: '', dueOnly: false, cashier: '', category: null, categoryLabel: null })
  }

  // ── Bill actions ───────────────────────────────────────────────────────────
  async function openDetail(billNo) {
    try {
      setDetailBill(await getBill(billNo))
      setDetailOpen(true)
    } catch (err) { message.error(`Bill ${billNo}: ${err.message}`) }
  }
  useEffect(() => {
    // initial: true → no synchronous setState; state is only set once the request resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData({ initial: true })
    getStoreProfile().then(setStoreProfile).catch(() => {})
    // ?bill=BILL0042 (New Bill → Return / Exchange): open that bill straight away
    const billNo = searchParams.get('bill')
    if (billNo) openDetail(billNo.trim().toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const paper = () => localStorage.getItem('receipt_paper_size') || '3inch'
  async function printBill(billNo) {
    try { await printPdfWithAuth(`/bills/${billNo}/receipt-pdf?paper=${paper()}`) }
    catch (err) { message.error('Print failed: ' + err.message) }
  }
  async function downloadBill(billNo) {
    try { await openPdfWithAuth(`/bills/${billNo}/receipt-pdf?paper=${paper()}`, `Receipt_${billNo}.pdf`) }
    catch (err) { message.error('Download failed: ' + err.message) }
  }
  function whatsappBill(b) {
    if (!b.phone) { message.warning('No phone number on this bill'); return }
    const url = b.share_token ? getPublicReceiptUrl(b.share_token) : ''
    const due = b.change_amt < 0 ? `\nBalance due: ${money(-b.change_amt)}` : ''
    const msg = `Hi ${b.customer_name || ''}, thank you for shopping at ${storeName}!\n` +
      `Bill ${b.bill_no} · ${fmtWhen(b.bill_date, b.bill_time)}\nTotal: ${money(b.grand_total)}${due}` +
      (url ? `\nReceipt: ${url}` : '') +
      (due && storeProfile?.upi_id ? `\nPay by UPI: ${storeProfile.upi_id}` : '')
    window.open(`https://wa.me/${whatsappNumber(b.phone)}?text=${encodeURIComponent(msg)}`, '_blank')
  }
  const rowMenu = (b) => ({
    items: [
      { key: 'view', icon: <EyeOutlined />, label: 'Open bill' },
      { key: 'print', icon: <PrinterOutlined />, label: 'Print receipt' },
      { key: 'pdf', icon: <DownloadOutlined />, label: 'Download PDF' },
      { key: 'wa', icon: <WhatsAppOutlined />, label: 'Share on WhatsApp', disabled: !b.phone },
    ],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation()
      if (key === 'view') openDetail(b.bill_no)
      if (key === 'print') printBill(b.bill_no)
      if (key === 'pdf') downloadBill(b.bill_no)
      if (key === 'wa') whatsappBill(b)
    },
  })

  async function doVoid() {
    setVoiding(true)
    try {
      await voidBill(detailBill.bill_no, voidReason.trim())
      message.success(`Bill ${detailBill.bill_no} cancelled`)
      setVoidOpen(false); setVoidReason('')
      setDetailBill(await getBill(detailBill.bill_no))
      fetchData({ p: 1 })
    } catch (err) { message.error(err.message) }
    finally { setVoiding(false) }
  }

  async function doCollect() {
    if (!payAmount || payAmount <= 0) { message.error('Enter the amount received'); return }
    setPaying(true)
    try {
      await recordCreditPayment(detailBill.customer_id, payAmount, payMode, `Against bill ${detailBill.bill_no}`)
      message.success(`${money(payAmount)} recorded for ${detailBill.customer_name}`)
      setPayOpen(false)
    } catch (err) { message.error(err.message) }
    finally { setPaying(false) }
  }

  // ── Returns (unchanged logic) ──────────────────────────────────────────────
  function openReturnModal() {
    const init = {}
    detailBill.items.forEach((item) => { init[item.id] = 0 })
    setReturnQtys(init)
    setRefundMethod('Cash')
    setReturnNotes('')
    setReturnOpen(true)
  }
  function maxReturnable(item) {
    if (!detailBill?.returns?.length) return item.qty
    const alreadyReturned = detailBill.returns
      .flatMap((r) => r.return_items)
      .filter((ri) => ri.bill_item_id === item.id)
      .reduce((sum, ri) => sum + ri.return_qty, 0)
    return item.qty - alreadyReturned
  }
  function calcRefundTotal() {
    if (!detailBill) return 0
    return detailBill.items.reduce((sum, item) => {
      const qty = returnQtys[item.id] || 0
      if (qty <= 0) return sum
      const perItem = item.qty > 0 ? item.total / item.qty : 0
      return sum + Math.round(perItem * qty)
    }, 0)
  }
  async function submitReturn() {
    const items = Object.entries(returnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([bill_item_id, return_qty]) => ({ bill_item_id: Number(bill_item_id), return_qty }))
    if (items.length === 0) { message.warning('Please enter at least one return quantity.'); return }
    setReturnLoading(true)
    try {
      await returnBillItems(detailBill.bill_no, { items, refund_method: refundMethod, notes: returnNotes })
      message.success('Return processed successfully!')
      setReturnOpen(false)
      setDetailBill(await getBill(detailBill.bill_no))
      fetchData({ p: 1 })
    } catch (err) {
      message.error(err.message || 'Return failed')
    } finally {
      setReturnLoading(false)
    }
  }

  // ── Export ─────────────────────────────────────────────────────────────────
  async function exportRows(onlySelected) {
    if (onlySelected) return bills.filter((b) => selected.includes(b.bill_no))
    return (await getBills({ ...apiParams(filters), sort, limit: 5000 })) || []
  }
  const exportCols = [
    ['Bill no', (b) => b.bill_no], ['Date', (b) => b.bill_date], ['Time', (b) => b.bill_time || ''],
    ['Customer', (b) => b.customer_name || ''], ['Phone', (b) => b.phone || ''], ['Billed by', (b) => b.cashier || ''],
    ['Payment', (b) => b.payment_mode || ''], ['Status', (b) => STATUS_LABEL[b.status] || b.status],
    ['Total', (b) => Math.round(b.grand_total)], ['Paid', (b) => Math.round(b.amount_paid)],
    ['Due', (b) => (b.change_amt < 0 ? Math.round(-b.change_amt) : 0)], ['Cancel reason', (b) => b.void_reason || ''],
  ]
  async function exportCsv(onlySelected = false) {
    try {
      const rows = await exportRows(onlySelected)
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
      const csv = [exportCols.map(([h]) => esc(h)).join(','), ...rows.map((b) => exportCols.map(([, f]) => esc(f(b))).join(','))].join('\r\n')
      const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `bills_${filters.from || 'all'}_${filters.to || dayjs().format(ISO)}.csv`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      message.success(`Exported ${rows.length} bills`)
    } catch (err) { message.error('Export failed: ' + err.message) }
  }
  async function exportPdf(onlySelected = false) {
    const win = window.open('', '_blank')   // open now, before the await, so pop-up blockers allow it
    if (!win) { message.error('Allow pop-ups for this site to export a PDF'); return }
    win.document.write('<p style="font-family:sans-serif">Preparing…</p>')
    try {
      const rows = await exportRows(onlySelected)
      const live = rows.filter((b) => b.status !== 'Void')
      const total = live.reduce((s, b) => s + b.grand_total, 0)
      const due = live.reduce((s, b) => s + (b.change_amt < 0 ? -b.change_amt : 0), 0)
      const esc = (v) => String(v ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      win.document.open()
      win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Bills — ${esc(storeName)}</title>
<style>body{font-family:Arial,sans-serif;font-size:11px;color:#222;margin:24px}h1{font-size:18px;margin:0}
p{margin:4px 0 12px;color:#555}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #ddd;padding:5px 6px;text-align:left}
th{background:#f2f2f2}td.n,th.n{text-align:right}tr.v td{color:#999;text-decoration:line-through}</style></head><body>
<h1>${esc(storeName)} — Bills</h1>
<p>${esc(rangeLabel)}${onlySelected ? ' · selected bills' : ''} · ${live.length} bills · Total ${esc(money(total))} · Due ${esc(money(due))} · Printed ${esc(dayjs().format('D MMM YYYY, h:mm A'))}</p>
<table><thead><tr>${exportCols.slice(0, 11).map(([h], i) => `<th class="${i >= 8 ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>
${rows.map((b) => `<tr class="${b.status === 'Void' ? 'v' : ''}">${exportCols.slice(0, 11).map(([, f], i) => `<td class="${i >= 8 ? 'n' : ''}">${esc(i >= 8 ? money(f(b)) : f(b))}</td>`).join('')}</tr>`).join('')}
</tbody></table><script>window.onload=()=>window.print()</script></body></html>`)
      win.document.close()
    } catch (err) { win.close(); message.error('Export failed: ' + err.message) }
  }
  const exportMenu = {
    items: [
      { key: 'csv', icon: <FileExcelOutlined />, label: 'Excel (CSV)' },
      { key: 'pdf', icon: <FilePdfOutlined />, label: 'PDF / print' },
    ],
    onClick: ({ key }) => (key === 'csv' ? exportCsv() : exportPdf()),
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const presetKey = DATE_PRESETS().find((p) => p.value[0].format(ISO) === filters.from && p.value[1].format(ISO) === filters.to)?.key
  const rangeLabel = !filters.from ? 'All dates'
    : presetKey ? DATE_PRESETS().find((p) => p.key === presetKey).label
      : filters.from === filters.to ? fmtDay(filters.from) : `${fmtDay(filters.from)} – ${fmtDay(filters.to)}`
  const setPreset = (key) => {
    const p = DATE_PRESETS().find((x) => x.key === key)
    applyFilters(p && presetKey !== key ? { from: p.value[0].format(ISO), to: p.value[1].format(ISO) } : { from: '', to: '' })
  }
  const extraFilterCount = (filters.from ? 1 : 0) + (filters.cashier ? 1 : 0)
  const hasFilters = filters.q || filters.from || filters.pay || filters.payment_mode || filters.dueOnly || filters.cashier || filters.category != null
  const totalRows = summary ? summary.count + summary.voided : 0
  const statusTag = (st) => <Tag color={STATUS_COLORS[st] || 'default'} style={{ margin: 0 }}>{STATUS_LABEL[st] || st}</Tag>
  const isVoid = (b) => b.status === 'Void'

  const chips = (
    <div className="bh-chips">
      {isMobile && (
        <>
          {[['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(([k, l]) => (
            <button key={k} type="button" className={`bh-chip${presetKey === k ? ' bh-chip-on' : ''}`} onClick={() => setPreset(k)}>{l}</button>
          ))}
          <span className="bh-sep" />
        </>
      )}
      {PAY_CHIPS.map(([k, l]) => (
        <button key={k || 'all'} type="button" className={`bh-chip${filters.pay === k && !filters.payment_mode ? ' bh-chip-on' : ''}`}
          onClick={() => applyFilters({ pay: k, payment_mode: '' })}>{l}</button>
      ))}
      <span className="bh-sep" />
      <button type="button" className={`bh-chip bh-chip-due${filters.dueOnly ? ' bh-chip-on' : ''}`}
        onClick={() => applyFilters({ dueOnly: !filters.dueOnly })}>Due only</button>
    </div>
  )

  const summaryBar = summary && (
    <div className="bh-bar">
      <span><b>{rangeLabel}:</b> <b>{summary.count}</b> bill{summary.count === 1 ? '' : 's'} · <b>{compact(summary.total)}</b></span>
      {Object.entries(summary.by_mode).map(([k, v]) => <span key={k}>{k} <b>{compact(v)}</b></span>)}
      <span>Due <b style={{ color: summary.due > 0 ? BAD : TEXT }}>{money(summary.due)}</b></span>
      {summary.voided > 0 && <span>{summary.voided} cancelled</span>}
    </div>
  )

  const columns = [
    {
      title: 'Bill', dataIndex: 'bill_no', key: 'bill_no', width: 110,
      render: (v, b) => <b className="bh-strike" style={{ color: isVoid(b) ? undefined : PRIMARY }}>{v}</b>,
    },
    {
      title: 'Date & time', dataIndex: 'bill_date', key: 'date', width: 180, sorter: true,
      sortOrder: sort.endsWith('date') ? (sort.startsWith('-') ? 'descend' : 'ascend') : null,
      render: (v, b) => <span style={{ whiteSpace: 'nowrap' }}>{fmtWhen(v, b.bill_time)}</span>,
    },
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'customer_name', ellipsis: true,
      render: (v, b) => (
        <div style={{ minWidth: 0 }}>
          <div className="bh-strike" style={{ color: isVoid(b) ? undefined : TEXT, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
          {b.phone && <div style={{ fontSize: 12, color: SUB }}>{b.phone}</div>}
        </div>
      ),
    },
    { title: 'Billed by', dataIndex: 'cashier', key: 'cashier', width: 110, render: (v) => v || '—' },
    { title: 'Payment', dataIndex: 'payment_mode', key: 'payment_mode', width: 120, render: (v) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: statusTag },
    {
      title: 'Total', dataIndex: 'grand_total', key: 'total', sortDirections: ['descend', 'ascend'], width: 110, align: 'right', sorter: true,
      sortOrder: sort.endsWith('total') ? (sort.startsWith('-') ? 'descend' : 'ascend') : null,
      render: (v, b) => <b className="bh-strike" style={{ color: isVoid(b) ? undefined : TEXT, whiteSpace: 'nowrap' }}>{money(v)}</b>,
    },
    {
      title: 'Due', dataIndex: 'change_amt', key: 'due', sortDirections: ['descend', 'ascend'], width: 100, align: 'right', sorter: true,
      sortOrder: sort.endsWith('due') ? (sort.startsWith('-') ? 'descend' : 'ascend') : null,
      render: (v, b) => (v < 0 && !isVoid(b) ? <b style={{ color: BAD, whiteSpace: 'nowrap' }}>{money(-v)}</b> : <span style={{ color: SUB }}>—</span>),
    },
    {
      title: '', key: 'action', width: 84, align: 'right',
      render: (_, b) => (
        <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="Print receipt">
            <Button size="small" icon={<PrinterOutlined />} onClick={() => printBill(b.bill_no)} aria-label={`Print ${b.bill_no}`} style={{ color: PRIMARY }} />
          </Tooltip>
          <Dropdown menu={rowMenu(b)} trigger={['click']}>
            <Button size="small" icon={<MoreOutlined />} aria-label={`More actions for ${b.bill_no}`} />
          </Dropdown>
        </span>
      ),
    },
  ]

  const empty = (
    <div style={{ textAlign: 'center', padding: '40px 12px', color: SUB }}>
      <FileSearchOutlined style={{ fontSize: 34, color: PRIMARY, opacity: 0.6 }} />
      <div style={{ marginTop: 8, fontSize: 14 }}>No bills match these filters</div>
      {hasFilters && <Button type="link" onClick={clearAll} style={{ color: PRIMARY }}>Clear filters</Button>}
    </div>
  )

  // Phone: bills grouped by day with a daily total
  const groups = []
  for (const b of bills) {
    let g = groups[groups.length - 1]
    if (!g || g.date !== b.bill_date) { g = { date: b.bill_date, rows: [], total: 0, count: 0 }; groups.push(g) }
    g.rows.push(b)
    if (!isVoid(b)) { g.total += b.grand_total; g.count += 1 }
  }
  const groupedBySort = sort === '-date' || sort === 'date'

  const d = detailBill
  const gst = d?.gst_total || 0
  const dDue = d && d.change_amt < 0 && d.status !== 'Void' ? -d.change_amt : 0
  const canReturn = d && !['Void', 'Returned'].includes(d.status)
  const canVoid = d && isAdmin && ['Paid', 'Credit', 'Partial Return'].includes(d.status)

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>Bill history</Title>
        <Dropdown menu={exportMenu} trigger={['click']}>
          <Button icon={<DownloadOutlined />}>{isMobile ? 'Export' : 'Export list'}</Button>
        </Dropdown>
      </div>

      {/* Search + filters */}
      <Card style={{ borderRadius: 14, marginBottom: 12 }} styles={{ body: { padding: isMobile ? 12 : 14 } }}>
        {isMobile ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input placeholder="Bill no, customer or phone" prefix={<SearchOutlined />} allowClear
              value={filters.q} onChange={(e) => onSearch(e.target.value)} />
            <Badge count={extraFilterCount} size="small" color={PRIMARY}>
              <Button icon={<FilterOutlined />} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>Filters</Button>
            </Badge>
          </div>
        ) : (
          <div className="bh-tools">
            <Input placeholder="Search bill no, customer or phone" prefix={<SearchOutlined />} allowClear
              value={filters.q} onChange={(e) => onSearch(e.target.value)} />
            <RangePicker
              value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
              onChange={(v) => applyFilters(v ? { from: v[0].format(ISO), to: v[1].format(ISO) } : { from: '', to: '' })}
              format="D MMM YYYY" placeholder={['From date', 'To date']}
              disabledDate={(day) => day.isAfter(dayjs(), 'day')}
              presets={DATE_PRESETS().map(({ label, value }) => ({ label, value }))}
              style={{ width: '100%' }}
            />
            <Select placeholder="Billed by (all)" allowClear value={filters.cashier || undefined}
              onChange={(v) => applyFilters({ cashier: v || '' })}
              options={(summary?.cashiers || []).map((c) => ({ value: c, label: c }))} />
          </div>
        )}
        {isMobile && showFilters && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <RangePicker
              value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
              onChange={(v) => applyFilters(v ? { from: v[0].format(ISO), to: v[1].format(ISO) } : { from: '', to: '' })}
              format="D MMM YY" placeholder={['From', 'To']} inputReadOnly
              disabledDate={(day) => day.isAfter(dayjs(), 'day')}
              presets={DATE_PRESETS().map(({ label, value }) => ({ label, value }))}
              style={{ width: '100%' }}
            />
            <Select placeholder="Billed by (all)" allowClear value={filters.cashier || undefined}
              onChange={(v) => applyFilters({ cashier: v || '' })}
              options={(summary?.cashiers || []).map((c) => ({ value: c, label: c }))} />
          </div>
        )}
        <div style={{ marginTop: 10 }}>{chips}</div>
        {(filters.category != null || filters.payment_mode || hasFilters) && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            {filters.category != null && (
              <Tag closable onClose={() => { setSearchParams({}, { replace: true }); applyFilters({ category: null, categoryLabel: null }) }} color="blue">
                Category: {filters.categoryLabel}
              </Tag>
            )}
            {filters.payment_mode && (
              <Tag closable onClose={() => applyFilters({ payment_mode: '' })} color="blue">Payment: {filters.payment_mode}</Tag>
            )}
            {hasFilters && <Button type="link" size="small" onClick={clearAll} style={{ color: PRIMARY, padding: 0 }}>Clear all filters</Button>}
          </div>
        )}
      </Card>

      {summaryBar}

      {/* Bulk actions */}
      {!isMobile && selected.length > 0 && (
        <div className="bh-bar" style={{ alignItems: 'center' }}>
          <b>{selected.length} selected</b>
          <Button size="small" icon={<FileExcelOutlined />} onClick={() => exportCsv(true)}>Export CSV</Button>
          <Button size="small" icon={<FilePdfOutlined />} onClick={() => exportPdf(true)}>Export PDF</Button>
          <Button size="small" type="text" icon={<CloseOutlined />} onClick={() => setSelected([])}>Clear</Button>
        </div>
      )}

      {isMobile ? (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : bills.length === 0 ? empty : (
          <div>
            {(groupedBySort ? groups : [{ date: null, rows: bills }]).map((g) => (
              <div key={g.date || 'all'}>
                {g.date && (
                  <div className="bh-day">
                    <span>{dayLabel(g.date)}</span>
                    <span>{g.count} bill{g.count === 1 ? '' : 's'} · {money(g.total)}</span>
                  </div>
                )}
                {g.rows.map((b) => (
                  <SwipeCard
                    key={b.bill_no}
                    open={swiped === b.bill_no}
                    onOpenChange={(o) => setSwiped(o ? b.bill_no : null)}
                    onTap={() => openDetail(b.bill_no)}
                    actions={[
                      <button key="wa" type="button" style={{ background: '#128C4B', opacity: b.phone ? 1 : 0.45 }}
                        onClick={() => { setSwiped(null); whatsappBill(b) }}><WhatsAppOutlined style={{ fontSize: 18 }} />WhatsApp</button>,
                      <button key="pr" type="button" style={{ background: PRIMARY }}
                        onClick={() => { setSwiped(null); printBill(b.bill_no) }}><PrinterOutlined style={{ fontSize: 18 }} />Print</button>,
                    ]}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, opacity: isVoid(b) ? 0.6 : 1 }}>
                      <div style={{ minWidth: 0 }}>
                        <div className={isVoid(b) ? 'bh-strike' : ''} style={{ fontWeight: 700, color: TEXT, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isVoid(b) ? 'line-through' : 'none' }}>
                          {b.customer_name}
                        </div>
                        <div style={{ fontSize: 12.5, color: SUB }}>
                          {b.bill_no} · {groupedBySort ? (b.bill_time || '').replace(/^0/, '') : fmtWhen(b.bill_date, b.bill_time)}
                          {b.cashier ? ` · ${b.cashier}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: 17, color: TEXT, whiteSpace: 'nowrap', textDecoration: isVoid(b) ? 'line-through' : 'none' }}>{money(b.grand_total)}</div>
                        {b.change_amt < 0 && !isVoid(b) && <div style={{ fontSize: 12.5, color: BAD, fontWeight: 700 }}>Due {money(-b.change_amt)}</div>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <Tag style={{ margin: 0 }}>{b.payment_mode}</Tag>
                      {statusTag(b.status)}
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, color: SUB }}>← swipe</span>
                    </div>
                  </SwipeCard>
                ))}
              </div>
            ))}
            <div ref={sentinel} style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              {loadingMore ? <Spin /> : hasMore
                ? <Button onClick={() => fetchData({ p: page + 1, append: true })}>Load more</Button>
                : <span style={{ fontSize: 12.5, color: SUB }}>All {bills.length} bills shown</span>}
            </div>
          </div>
        )
      ) : (
        <Card style={{ borderRadius: 14 }} styles={{ body: { padding: 8 } }}>
          <Table
            className="bh-table"
            dataSource={bills} columns={columns} rowKey="bill_no"
            loading={loading} size="middle"
            locale={{ emptyText: empty }}
            rowClassName={(b) => (isVoid(b) ? 'bh-void' : '')}
            rowSelection={{ selectedRowKeys: selected, onChange: setSelected, preserveSelectedRowKeys: true }}
            onRow={(b) => ({ onClick: () => openDetail(b.bill_no) })}
            onChange={(pg, _f, sorter, extra) => {
              if (extra.action === 'sort') {
                const key = sorter.order ? sorter.columnKey : 'date'
                const next = sorter.order === 'ascend' ? key : `-${key}`
                setSort(next)
                fetchData({ s: next, p: 1 })
              } else if (extra.action === 'paginate') {
                fetchData({ p: pg.current })
              }
            }}
            pagination={{ current: page, pageSize: PAGE, total: totalRows, showSizeChanger: false, hideOnSinglePage: true,
              showTotal: (t, [a, b]) => `${a}–${b} of ${t}` }}
            scroll={{ x: 1000 }}
          />
        </Card>
      )}

      {/* ── Bill detail: side panel on desktop, full screen on phone ───────── */}
      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={isMobile ? '100%' : 520}
        title={d ? <span>Bill {d.bill_no} <span style={{ marginLeft: 6 }}>{statusTag(d.status)}</span></span> : ''}
        footer={d && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <Button type="primary" icon={<PrinterOutlined />} onClick={() => printBill(d.bill_no)}>Print</Button>
            <Button icon={<DownloadOutlined />} onClick={() => downloadBill(d.bill_no)}>PDF</Button>
            <Button icon={<WhatsAppOutlined />} disabled={!d.phone} onClick={() => whatsappBill(d)} style={d.phone ? { color: '#128C4B' } : undefined}>WhatsApp</Button>
            {canReturn && <Button icon={<RollbackOutlined />} onClick={openReturnModal}>Return / Exchange</Button>}
            {dDue > 0 && d.customer_id !== 'WALKIN' && (
              <Button icon={<DollarOutlined />} onClick={() => { setPayAmount(Math.round(dDue)); setPayMode('Cash'); setPayOpen(true) }}>Collect {money(dDue)}</Button>
            )}
            {canVoid && <Button danger icon={<StopOutlined />} onClick={() => { setVoidReason(''); setVoidOpen(true) }}>Cancel bill</Button>}
          </div>
        )}
      >
        {d && (
          <>
            {d.status === 'Void' && (
              <Alert type="error" showIcon style={{ marginBottom: 12 }}
                message={`Cancelled${d.voided_by ? ` by ${d.voided_by}` : ''}${d.voided_at ? ` on ${dayjs(d.voided_at).format('D MMM YYYY')}` : ''}`}
                description={d.void_reason || undefined} />
            )}
            <div className="bh-row"><span>Customer</span><b>{d.customer_name || 'Walk-in'}</b></div>
            {d.phone && <div className="bh-row"><span>Phone</span><b>{d.phone}</b></div>}
            <div className="bh-row"><span>Date</span><b>{fmtWhen(d.bill_date, d.bill_time)}</b></div>
            <div className="bh-row"><span>Billed by</span><b>{d.cashier || '—'}</b></div>

            <Divider style={{ margin: '12px 0' }} />
            {d.items.map((it) => {
              const off = it.mrp > it.selling_price ? Math.round((1 - it.selling_price / it.mrp) * 100) : 0
              return (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600 }}>{it.product_name}</div>
                    <div style={{ fontSize: 12.5, color: SUB }}>
                      {[it.size, it.color].filter(Boolean).join(' · ')}{(it.size || it.color) ? ' · ' : ''}
                      {it.qty} × {off > 0 && <s style={{ marginRight: 4 }}>{money(it.mrp)}</s>}{money(it.selling_price)}
                      {off > 0 && <span style={{ color: GOOD, fontWeight: 600 }}> ({off}% off)</span>}
                    </div>
                  </div>
                  <b style={{ color: TEXT, whiteSpace: 'nowrap' }}>{money(it.qty * it.selling_price)}</b>
                </div>
              )
            })}

            <div style={{ marginTop: 10 }}>
              <div className="bh-row"><span>Subtotal</span><b>{money(d.subtotal)}</b></div>
              {d.discount > 0 && <div className="bh-row"><span>Bill discount{d.loyalty_redeemed_pts > 0 ? ' & points' : ''}</span><b style={{ color: GOOD }}>-{money(d.discount)}</b></div>}
              {india ? (
                <>
                  <div className="bh-row"><span>CGST</span><b>{money(gst / 2)}</b></div>
                  <div className="bh-row"><span>SGST</span><b>{money(gst - Math.round(gst / 2))}</b></div>
                </>
              ) : <div className="bh-row"><span>Tax</span><b>{money(gst)}</b></div>}
              <div className="bh-row" style={{ borderTop: '2px solid rgba(0,0,0,0.1)', marginTop: 4, paddingTop: 8 }}>
                <b style={{ fontSize: 15 }}>Grand total</b>
                <b style={{ fontSize: 22, color: PRIMARY }}>{money(d.grand_total)}</b>
              </div>
              <div className="bh-row"><span>Payment</span><b>{d.payment_mode}</b></div>
              <div className="bh-row"><span>Paid</span><b>{money(d.amount_paid)}</b></div>
              {d.change_amt > 0 && <div className="bh-row"><span>Change given</span><b>{money(d.change_amt)}</b></div>}
              {dDue > 0 && <div className="bh-row"><span style={{ color: BAD, fontWeight: 600 }}>Balance due</span><b style={{ color: BAD, fontSize: 16 }}>{money(dDue)}</b></div>}
              {d.loyalty_earned_pts > 0 && <div className="bh-row"><span>Points earned</span><b>{d.loyalty_earned_pts}</b></div>}
            </div>
            {d.notes && <div style={{ marginTop: 10, fontSize: 13, color: SUB }}>Note: {d.notes}</div>}

            {d.returns?.length > 0 && (
              <>
                <Divider titlePlacement="start" style={{ margin: '16px 0 10px' }}>Returns &amp; exchanges</Divider>
                {d.returns.map((ret) => (
                  <div key={ret.id} style={{ background: 'rgba(185,119,14,0.08)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ color: TEXT }}>Return #{ret.id}</b>
                      <span style={{ color: SUB, fontSize: 12.5 }}>{fmtWhen(ret.return_date, ret.return_time)}</span>
                    </div>
                    {ret.return_items.map((ri) => (
                      <div key={ri.id} style={{ fontSize: 13, color: SUB }}>{ri.product_name} × {ri.return_qty} — {money(ri.refund_subtotal)}</div>
                    ))}
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      Refund <b style={{ color: '#B9770E' }}>{money(ret.refund_amount)}</b> <span style={{ color: SUB }}>by {ret.refund_method}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </Drawer>

      {/* ── Cancel (void) bill ─────────────────────────────────────── */}
      <Modal
        title={`Cancel bill ${d?.bill_no}?`}
        open={voidOpen}
        onCancel={() => setVoidOpen(false)}
        onOk={doVoid}
        okText="Cancel bill" cancelText="Keep bill"
        okButtonProps={{ danger: true, loading: voiding, disabled: voidReason.trim().length < 3 }}
      >
        <p style={{ color: SUB, marginTop: 0 }}>
          The bill stays in history, struck through, but is removed from sales reports.
          {d?.status !== 'Void' && ' Items go back into stock, and the customer’s spend, dues and points are reversed.'}
        </p>
        <Input.TextArea autoFocus rows={3} maxLength={300} showCount value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)} placeholder="Reason (required), e.g. test bill, wrong amount, duplicate" />
      </Modal>

      {/* ── Collect payment for a credit bill ──────────────────────── */}
      <Modal
        title={`Collect payment — ${d?.customer_name}`}
        open={payOpen}
        onCancel={() => setPayOpen(false)}
        onOk={doCollect}
        okText="Record payment"
        okButtonProps={{ loading: paying }}
        width={420}
      >
        <p style={{ color: SUB, marginTop: 0 }}>Bill {d?.bill_no} has {money(dDue)} due. The payment is added to the customer’s account.</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <InputNumber size="large" min={1} value={payAmount} onChange={setPayAmount} prefix={sym} style={{ width: '100%' }} aria-label="Amount received" />
          <Radio.Group value={payMode} onChange={(e) => setPayMode(e.target.value)}>
            {COLLECT_MODES.map((m) => <Radio key={m} value={m}>{m}</Radio>)}
          </Radio.Group>
        </div>
      </Modal>

      {/* ── Return Items Modal ────────────────────────────────────── */}
      <Modal
        title={`Return items — ${d?.bill_no}`}
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={submitReturn}
        okText="Process return"
        okButtonProps={{ loading: returnLoading, danger: true, disabled: calcRefundTotal() === 0 }}
        width={560}
      >
        {d && (
          <>
            <p style={{ color: SUB, marginTop: 0 }}>
              Choose how many of each item the customer is returning. For an exchange, process the return,
              then bill the new size on a new bill.
            </p>
            {d.items.map((item) => {
              const max = maxReturnable(item)
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600 }}>{item.product_name}{item.size ? ` · ${item.size}` : ''}</div>
                    <div style={{ fontSize: 12.5, color: SUB }}>
                      Bought {item.qty}{max < item.qty ? ` · ${max} can still be returned` : ''}
                    </div>
                  </div>
                  <InputNumber
                    min={0} max={max} value={returnQtys[item.id] || 0}
                    onChange={(v) => setReturnQtys({ ...returnQtys, [item.id]: v || 0 })}
                    style={{ width: 80 }} disabled={max === 0} aria-label={`Return quantity for ${item.product_name}`}
                  />
                </div>
              )
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 10px', flexWrap: 'wrap' }}>
              <span style={{ color: TEXT, fontWeight: 600 }}>Refund as</span>
              <Radio.Group value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                <Radio value="Cash">Cash</Radio>
                <Radio value="Store Credit">Store credit</Radio>
              </Radio.Group>
            </div>
            <Input.TextArea placeholder="Notes (optional)" value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} rows={2} style={{ marginBottom: 12 }} />
            <div style={{ background: 'rgba(30,132,73,0.1)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: TEXT, fontWeight: 600 }}>Refund {refundMethod === 'Cash' ? 'in cash' : 'as store credit'}</span>
              <b style={{ fontSize: 20, color: GOOD }}>{money(calcRefundTotal())}</b>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
