import React, { useState, useEffect, useRef } from 'react'
import {
  Card, Table, Input, Button, Space, Typography, Modal, Form, Row, Col, Select, message,
  InputNumber, Alert, Grid, Tooltip, Dropdown, Drawer, DatePicker, Spin, Radio, Divider,
} from 'antd'
import {
  SearchOutlined, UserAddOutlined, WhatsAppOutlined, DollarOutlined, PhoneOutlined, GiftOutlined,
  TeamOutlined, WalletOutlined, WarningOutlined, MoreOutlined, EditOutlined, DeleteOutlined,
  ShoppingCartOutlined, FileTextOutlined, ImportOutlined, ExportOutlined, MergeCellsOutlined,
  LinkOutlined, CalendarOutlined, CrownFilled,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import {
  getCustomers, createCustomer, updateCustomer, deleteCustomer, recordCreditPayment, getLoyaltyProgram,
  resendWalletLink, getCustomerProfile, getDuplicateCustomers, mergeCustomers, getUnlinkedDues,
  linkBillCustomer, importCustomers,
} from '../api/client'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useCurrency } from '../utils/currency'
import { normalizeIndianMobile, whatsappNumber, indianMobileRule } from '../utils/phone'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const GOOD    = '#1E8449'
const BAD     = '#C0392B'

const MEMBER_TYPES = ['Regular', 'Silver', 'Gold', 'Platinum']
const TIER_STYLE = {
  Platinum: { color: '#5B3E96', bg: 'rgba(91,62,150,0.12)' },
  Gold:     { color: '#9A6B00', bg: 'rgba(212,160,23,0.18)' },
  Silver:   { color: '#55606B', bg: 'rgba(120,130,140,0.16)' },
  Regular:  { color: SUB, bg: 'rgba(0,0,0,0.05)' },
}
const TIER_RULES = 'Tiers upgrade automatically: Silver from ₹10,000 spent, Gold from ₹25,000, Platinum from ₹50,000.'
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Net Banking']
const INACTIVE_DAYS = 60
const BIRTHDAY_OFFER = '10% off'
const CSV_FIELDS = ['name', 'phone', 'email', 'city', 'state', 'pincode', 'address', 'member_type', 'birthday', 'anniversary', 'preferences', 'notes', 'gst_no']

const CSS = `
.cu-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.cu-stat { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 12px 16px; text-align: left; border: none; font-family: inherit; }
button.cu-stat { cursor: pointer; }
.cu-stat-on { box-shadow: var(--neu-inset); }
.cu-card { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 14px; cursor: pointer; margin-bottom: 10px; }
.cu-card:active { box-shadow: var(--neu-inset); }
.cu-chips { display: flex; gap: 6px; overflow-x: auto; padding: 2px 2px 6px; scrollbar-width: none; }
.cu-chips::-webkit-scrollbar { display: none; }
.cu-chip { flex: 0 0 auto; border: 1px solid rgba(47,102,144,0.35); background: transparent; color: ${PRIMARY};
  border-radius: 16px; padding: 4px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.cu-chip-on { background: ${PRIMARY}; color: #fff; border-color: ${PRIMARY}; }
.cu-table .ant-table-row { cursor: pointer; }
.cu-hl { background: rgba(212,160,23,0.35); color: inherit; border-radius: 2px; padding: 0 1px; }
.cu-tier { display: inline-flex; align-items: center; gap: 4px; border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: 700; white-space: nowrap; }
.cu-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; color: ${SUB}; }
.cu-row b { color: ${TEXT}; text-align: right; }
.cu-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 12px 0; }
.cu-kpi { background: rgba(47,102,144,0.07); border-radius: 10px; padding: 8px 12px; }
.cu-banner { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border-radius: 12px; padding: 10px 14px; margin-bottom: 10px; font-size: 13.5px; }
@media (max-width: 767px) { .cu-strip { gap: 8px; } .cu-stat { padding: 10px 12px; } }
`

// Wraps the matching part of the text in <mark> for live search
function highlight(text, q) {
  const s = String(text ?? '')
  const needle = (q || '').trim()
  if (!needle) return s
  const digits = needle.replace(/\D/g, '')
  const isPhoneSearch = digits.length >= 3 && digits.length === needle.replace(/[\s+-]/g, '').length
  if (isPhoneSearch) {
    // Highlight digits even when the stored number has spaces / +91
    const map = []
    let plain = ''
    for (let i = 0; i < s.length; i++) if (/\d/.test(s[i])) { map.push(i); plain += s[i] }
    const at = plain.indexOf(digits)
    if (at < 0) return s
    const a = map[at], b = map[at + digits.length - 1] + 1
    return <>{s.slice(0, a)}<mark className="cu-hl">{s.slice(a, b)}</mark>{s.slice(b)}</>
  }
  const at = s.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return s
  return <>{s.slice(0, at)}<mark className="cu-hl">{s.slice(at, at + needle.length)}</mark>{s.slice(at + needle.length)}</>
}

function matches(c, q) {
  const needle = (q || '').trim().toLowerCase()
  if (!needle) return true
  const digits = needle.replace(/\D/g, '')
  return (c.name || '').toLowerCase().includes(needle)
    || (c.customer_id || '').toLowerCase().includes(needle)
    || (c.city || '').toLowerCase().includes(needle)
    || (digits.length >= 3 && (c.phone || '').replace(/\D/g, '').includes(digits))
}

// Days until the next occurrence (this year or next) of a YYYY-MM-DD date
function daysUntil(dateStr, today) {
  if (!dateStr) return null
  const d = dayjs(dateStr)
  if (!d.isValid()) return null
  const start = today.startOf('day')
  let next = d.year(start.year())
  if (next.isBefore(start)) next = next.add(1, 'year')
  return next.diff(start, 'day')
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export default function Customers() {
  const [customers, setCustomers]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [searchParams]                = useSearchParams()
  const [chip, setChip]               = useState(searchParams.get('dues') === '1' ? 'dues' : 'all')
  const [sortBy, setSortBy]           = useState(null)   // { key, order }
  const [formOpen, setFormOpen]       = useState(searchParams.get('add') === '1')
  const [editTarget, setEditTarget]   = useState(null)
  const [saving, setSaving]           = useState(false)
  const [payTarget, setPayTarget]     = useState(null)
  const [payAmount, setPayAmount]     = useState(0)
  const [payMode, setPayMode]         = useState('Cash')
  const [payLoading, setPayLoading]   = useState(false)
  const [profileId, setProfileId]     = useState(null)
  const [profile, setProfile]         = useState(null)
  const [dupes, setDupes]             = useState([])
  const [mergeOpen, setMergeOpen]     = useState(false)
  const [unlinked, setUnlinked]       = useState([])
  const [linkOpen, setLinkOpen]       = useState(false)
  const [linkChoice, setLinkChoice]   = useState({})
  const [importPreview, setImportPreview] = useState(null)
  const [importing, setImporting]     = useState(false)
  const [today]                       = useState(() => dayjs())
  const [form] = Form.useForm()
  const [loyaltyProgram, setLoyaltyProgram] = useState(null)
  const fileRef = useRef(null)
  const navigate = useNavigate()
  const { storeName, country, role } = useAuthStore()
  const india = (country || 'India') === 'India'
  const isAdmin = role === 'Admin'
  const screens  = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()
  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`

  function refreshAll() {
    return Promise.all([
      getCustomers({ limit: 2000 }).then((res) => setCustomers(res || [])).catch(() => setCustomers([])),
      getDuplicateCustomers().then(setDupes).catch(() => setDupes([])),
      getUnlinkedDues().then(setUnlinked).catch(() => setUnlinked([])),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => {
    getLoyaltyProgram().then(setLoyaltyProgram).catch(() => {})
    refreshAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function openProfile(c) {
    setProfileId(c.customer_id)
    setProfile(null)
    try { setProfile(await getCustomerProfile(c.customer_id)) }
    catch (err) { message.error(err.message); setProfileId(null) }
  }

  // ── Add / edit ─────────────────────────────────────────────────────────────
  function openForm(c = null) {
    setEditTarget(c)
    form.resetFields()
    if (c) {
      form.setFieldsValue({
        ...c,
        birthday: c.birthday ? dayjs(c.birthday) : null,
        anniversary: c.anniversary ? dayjs(c.anniversary) : null,
      })
    }
    setFormOpen(true)
  }

  async function saveCustomer(values) {
    const payload = {
      ...values,
      phone: india && normalizeIndianMobile(values.phone) ? normalizeIndianMobile(values.phone) : values.phone,
      birthday: values.birthday ? values.birthday.format('YYYY-MM-DD') : '',
      anniversary: values.anniversary ? values.anniversary.format('YYYY-MM-DD') : '',
    }
    setSaving(true)
    try {
      if (editTarget) await updateCustomer(editTarget.customer_id, payload)
      else await createCustomer(payload)
      message.success(editTarget ? 'Customer updated' : 'Customer added')
      setFormOpen(false)
      await refreshAll()
      if (editTarget && profileId === editTarget.customer_id) openProfile(editTarget)
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  // Warn (without blocking) when the number already belongs to someone else
  const phoneOwner = (phone) => {
    const key = normalizeIndianMobile(phone) || String(phone || '').replace(/\D/g, '')
    if (key.length < 6) return null
    return customers.find((c) => c.customer_id !== editTarget?.customer_id
      && (normalizeIndianMobile(c.phone) || String(c.phone || '').replace(/\D/g, '')) === key)
  }

  function confirmDelete(c) {
    Modal.confirm({
      title: `Delete ${c.name}?`,
      content: 'This removes the customer permanently. Customers with bills can’t be deleted — edit or merge them instead.',
      okText: 'Delete', okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await deleteCustomer(c.customer_id)
          message.success(`${c.name} deleted`)
          setProfileId(null)
          refreshAll()
        } catch (err) { message.error(err.message) }
      },
    })
  }

  // ── Payments, WhatsApp, wallet ─────────────────────────────────────────────
  function openPay(c) {
    setPayTarget(c)
    setPayAmount(Math.round(c.credit_balance))
    setPayMode('Cash')
  }
  async function handleRecordPayment() {
    if (!payAmount || payAmount <= 0) { message.error('Enter a valid amount'); return }
    setPayLoading(true)
    try {
      await recordCreditPayment(payTarget.customer_id, payAmount, payMode)
      message.success(`${money(payAmount)} received from ${payTarget.name}`)
      setPayTarget(null)
      await refreshAll()
      if (profileId) openProfile({ customer_id: profileId })
    } catch (err) { message.error(err.message) }
    finally { setPayLoading(false) }
  }

  const waTemplates = (c) => [
    { key: 'thanks', label: 'Thank you', text: `Hi ${c.name}, thank you for shopping at ${storeName}! We hope you love your new clothes. See you again soon 🙏` },
    { key: 'stock', label: 'New stock arrived', text: `Hi ${c.name}, new stock has just arrived at ${storeName}! Drop by to see the latest collection 🛍️` },
    ...(c.credit_balance > 0 ? [{ key: 'due', label: `Due reminder (${money(c.credit_balance)})`, text: `Dear ${c.name},\n\nThis is a friendly reminder from *${storeName}*. You have a balance of *${money(c.credit_balance)}* due.\n\nKindly visit us or pay at your earliest convenience. Thank you! 🙏` }] : []),
    ...(c.birthday ? [{ key: 'bday', label: 'Birthday wishes + offer', text: `Happy birthday, ${c.name}! 🎉 Enjoy ${BIRTHDAY_OFFER} on your next purchase at ${storeName} this month. Show this message at the counter.` }] : []),
    ...(c.anniversary ? [{ key: 'anniv', label: 'Anniversary wishes + offer', text: `Happy anniversary, ${c.name}! 💐 Celebrate with ${BIRTHDAY_OFFER} on your next visit to ${storeName} this month.` }] : []),
    { key: 'blank', label: 'Open chat', text: '' },
  ]
  function sendWhatsApp(c, text) {
    if (!c.phone) { message.warning('No phone number for this customer'); return }
    window.open(`https://wa.me/${whatsappNumber(c.phone)}${text ? `?text=${encodeURIComponent(text)}` : ''}`, '_blank')
  }
  const waMenu = (c) => ({
    items: waTemplates(c).map(({ key, label }) => ({ key, label })),
    onClick: ({ key, domEvent }) => { domEvent.stopPropagation(); sendWhatsApp(c, waTemplates(c).find((t) => t.key === key).text) },
  })

  async function handleResendWallet(cust) {
    try {
      const res = await resendWalletLink(cust.customer_id)
      if (res?.wallet_link) {
        const msg = `Hi ${cust.name}! 🎁 Add your ${storeName} loyalty card to Google Wallet:\n${res.wallet_link}`
        if (cust.phone) sendWhatsApp(cust, msg)
        else message.success('Wallet link generated — no phone on file to send.')
      }
    } catch (err) {
      message.error(err.message || 'Google Wallet not configured yet')
    }
  }

  // ── Merge, link, import, export ────────────────────────────────────────────
  async function doMerge(keep, dup) {
    try {
      const res = await mergeCustomers(keep.customer_id, dup.customer_id)
      message.success(res.message)
      await refreshAll()
    } catch (err) { message.error(err.message) }
  }
  async function keepOnly(group, keep) {
    for (const o of group.filter((x) => x.customer_id !== keep.customer_id)) await doMerge(keep, o)
    const left = await getDuplicateCustomers().catch(() => [])
    setDupes(left)
    if (!left.length) setMergeOpen(false)
  }
  async function doLink(bill) {
    const cid = linkChoice[bill.bill_no]
    if (!cid) { message.warning('Choose a customer first'); return }
    try {
      const res = await linkBillCustomer(bill.bill_no, cid)
      message.success(res.message)
      await refreshAll()
    } catch (err) { message.error(err.message) }
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const cols = [...CSV_FIELDS, 'customer_id', 'total_purchase', 'credit_balance', 'loyalty_pts', 'visits', 'last_visit']
    const csv = [cols.join(','), ...customers.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\r\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url; a.download = `customers_${dayjs().format('YYYY-MM-DD')}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  function onImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    file.text().then((text) => {
      const rows = parseCsv(text.replace(/^\ufeff/, ''))
      if (rows.length < 2) { message.error('The file has no customer rows'); return }
      const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
      if (!header.includes('name') || !header.includes('phone')) { message.error('The first row must include "name" and "phone" columns'); return }
      const out = rows.slice(1).map((r) => {
        const o = {}
        header.forEach((h, i) => { if (CSV_FIELDS.includes(h)) o[h] = (r[i] || '').trim() })
        if (!MEMBER_TYPES.includes(o.member_type)) o.member_type = 'Regular'
        for (const d of ['birthday', 'anniversary']) {
          const p = o[d] ? dayjs(o[d]) : null
          o[d] = p && p.isValid() ? p.format('YYYY-MM-DD') : null
        }
        return o
      })
      setImportPreview(out)
    })
  }
  async function doImport() {
    setImporting(true)
    try {
      const res = await importCustomers(importPreview)
      Modal.info({
        title: `Imported ${res.created} customer${res.created === 1 ? '' : 's'}`,
        content: res.skipped.length ? (
          <div>
            <p>{res.skipped.length} row{res.skipped.length > 1 ? 's were' : ' was'} skipped:</p>
            <ul style={{ paddingLeft: 18, maxHeight: 200, overflow: 'auto' }}>
              {res.skipped.map((s, i) => <li key={i}>{s.name || '(no name)'} {s.phone} — {s.reason}</li>)}
            </ul>
          </div>
        ) : 'All rows were added.',
      })
      setImportPreview(null)
      refreshAll()
    } catch (err) { message.error(err.message) }
    finally { setImporting(false) }
  }

  // ── Derived lists ──────────────────────────────────────────────────────────
  const isInactive = (c) => {
    const last = c.last_visit || c.member_since
    return !last || today.diff(dayjs(last), 'day') >= INACTIVE_DAYS
  }
  const birthdayThisMonth = (c) => [c.birthday, c.anniversary].some((d) => d && dayjs(d).month() === today.month())
  const upcoming = customers
    .flatMap((c) => [['birthday', c.birthday], ['anniversary', c.anniversary]]
      .map(([kind, d]) => ({ c, kind, days: daysUntil(d, today) })))
    .filter((x) => x.days != null && x.days <= 7)
    .sort((a, b) => a.days - b.days)

  const CHIPS = [
    ['all', 'All', () => true],
    ['regular', 'Regular', (c) => (c.member_type || 'Regular') === 'Regular'],
    ['vip', 'VIP (Gold & Platinum)', (c) => ['Gold', 'Platinum'].includes(c.member_type)],
    ['dues', 'With dues', (c) => c.credit_balance > 0],
    ['inactive', `Inactive ${INACTIVE_DAYS}+ days`, isInactive],
    ['bday', 'Birthdays this month', birthdayThisMonth],
  ]
  const chipFn = CHIPS.find(([k]) => k === chip)?.[2] || (() => true)
  let shown = customers.filter((c) => chipFn(c) && matches(c, search))
  if (sortBy?.order) {
    const dir = sortBy.order === 'ascend' ? 1 : -1
    const val = (c) => (sortBy.key === 'last_visit' ? (c.last_visit || '') : (c[sortBy.key] || 0))
    shown = [...shown].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0))
  } else if (chip === 'dues') {
    shown = [...shown].sort((a, b) => b.credit_balance - a.credit_balance)
  }

  const totalOutstanding = customers.reduce((s, c) => s + (c.credit_balance || 0), 0)
  const withDues = customers.filter((c) => c.credit_balance > 0).length
  const unlinkedTotal = unlinked.reduce((s, b) => s + b.due, 0)
  const fmtDay = (d) => (d ? dayjs(d).format('D MMM YYYY') : '—')
  const lastVisitText = (d) => {
    if (!d) return 'Never'
    const n = today.startOf('day').diff(dayjs(d), 'day')
    return n <= 0 ? 'Today' : n === 1 ? 'Yesterday' : n < 30 ? `${n} days ago` : fmtDay(d)
  }

  const tierBadge = (t) => {
    const st = TIER_STYLE[t] || TIER_STYLE.Regular
    return (
      <span className="cu-tier" style={{ color: st.color, background: st.bg }}>
        {t && t !== 'Regular' && <CrownFilled />}{t || 'Regular'}
      </span>
    )
  }
  const sortOrder = (key) => (sortBy?.key === key ? sortBy.order : null)

  const actionsFor = (r) => (
    <Space size={6} onClick={(e) => e.stopPropagation()}>
      {r.credit_balance > 0 && (
        <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPay(r)}>Collect</Button>
      )}
      <Dropdown menu={waMenu(r)} trigger={['click']} disabled={!r.phone}>
        <Tooltip title={r.phone ? 'WhatsApp message' : 'No phone number'}>
          <Button size="small" icon={<WhatsAppOutlined />} style={{ color: r.phone ? '#128C4B' : undefined }} aria-label={`WhatsApp ${r.name}`} />
        </Tooltip>
      </Dropdown>
      <Dropdown trigger={['click']} menu={{
        items: [
          { key: 'bill', icon: <ShoppingCartOutlined />, label: 'New bill' },
          { key: 'bills', icon: <FileTextOutlined />, label: 'View bills' },
          { key: 'edit', icon: <EditOutlined />, label: 'Edit' },
          ...(loyaltyProgram?.enabled && loyaltyProgram?.wallet_configured ? [{ key: 'wallet', icon: <GiftOutlined />, label: 'Send wallet card' }] : []),
          ...(isAdmin ? [{ type: 'divider' }, { key: 'delete', icon: <DeleteOutlined />, label: 'Delete', danger: true }] : []),
        ],
        onClick: ({ key, domEvent }) => {
          domEvent.stopPropagation()
          if (key === 'bill') navigate(`/new-bill?customer=${r.customer_id}`)
          if (key === 'bills') navigate(`/bill-history?customer=${encodeURIComponent(r.name)}`)
          if (key === 'edit') openForm(r)
          if (key === 'wallet') handleResendWallet(r)
          if (key === 'delete') confirmDelete(r)
        },
      }}>
        <Button size="small" icon={<MoreOutlined />} aria-label={`More actions for ${r.name}`} />
      </Dropdown>
    </Space>
  )

  const columns = [
    {
      title: 'Customer', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ color: TEXT, fontWeight: 600 }}>{highlight(v, search)}</div>
          <div style={{ fontSize: 12.5, color: SUB }}>
            {r.phone ? highlight(r.phone, search) : 'No phone'}{r.city ? <> · {highlight(r.city, search)}</> : ''}
          </div>
        </div>
      ),
    },
    { title: 'Tier', dataIndex: 'member_type', key: 'member_type', width: 108, render: tierBadge },
    {
      title: 'Last visit', dataIndex: 'last_visit', key: 'last_visit', width: 118, sorter: true, sortOrder: sortOrder('last_visit'),
      sortDirections: ['descend', 'ascend'],
      render: (v, r) => <span style={{ color: isInactive(r) ? BAD : TEXT, whiteSpace: 'nowrap' }}>{lastVisitText(v)}</span>,
    },
    {
      title: 'Spent', dataIndex: 'total_purchase', key: 'total_purchase', width: 104, align: 'right', sorter: true,
      sortOrder: sortOrder('total_purchase'), sortDirections: ['descend', 'ascend'],
      render: (v, r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          <b style={{ color: TEXT }}>{money(v)}</b>
          <div style={{ fontSize: 12, color: SUB }}>{r.visits} visit{r.visits === 1 ? '' : 's'}</div>
        </div>
      ),
    },
    {
      title: 'Owes', dataIndex: 'credit_balance', key: 'credit_balance', width: 92, align: 'right', sorter: true,
      sortOrder: sortOrder('credit_balance'), sortDirections: ['descend', 'ascend'],
      render: (v, r) => (
        <div style={{ whiteSpace: 'nowrap' }}>
          {v > 0 ? <b style={{ color: BAD }}>{money(v)}</b> : <span style={{ color: SUB }}>—</span>}
          {r.store_credit > 0 && <Tooltip title="Store credit the customer can spend"><div style={{ fontSize: 12, color: GOOD }}>+{money(r.store_credit)} credit</div></Tooltip>}
        </div>
      ),
    },
    ...(loyaltyProgram?.enabled ? [{
      title: 'Points', dataIndex: 'loyalty_pts', key: 'loyalty_pts', width: 80, align: 'right', sorter: true,
      sortOrder: sortOrder('loyalty_pts'), sortDirections: ['descend', 'ascend'],
      render: (v) => <span style={{ color: TEXT }}>{v || 0}</span>,
    }] : []),
    { title: '', key: 'action', width: 150, align: 'right', render: (_, r) => actionsFor(r) },
  ]

  const p = profile
  const pc = p?.customer

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>Customers</Title>
        <Space>
          <Dropdown trigger={['click']} menu={{
            items: [
              { key: 'import', icon: <ImportOutlined />, label: 'Import from Excel / CSV' },
              { key: 'export', icon: <ExportOutlined />, label: 'Export to Excel / CSV' },
            ],
            onClick: ({ key }) => (key === 'import' ? fileRef.current?.click() : exportCsv()),
          }}>
            <Button aria-label="Import or export customers">{isMobile ? <ExportOutlined /> : 'Import / Export'}</Button>
          </Dropdown>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => openForm()}>
            {isMobile ? 'Add' : 'Add customer'}
          </Button>
        </Space>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} style={{ display: 'none' }} />
      </div>

      {/* Things that need attention */}
      {unlinked.length > 0 && (
        <div className="cu-banner" style={{ background: 'rgba(192,57,43,0.08)' }}>
          <LinkOutlined style={{ color: BAD }} />
          <span style={{ flex: 1, color: TEXT, minWidth: 200 }}>
            <b>{money(unlinkedTotal)}</b> is due on {unlinked.length} bill{unlinked.length > 1 ? 's' : ''} whose customer isn’t in this list, so it isn’t counted below.
          </span>
          <Button size="small" onClick={() => setLinkOpen(true)}>Link to customers</Button>
        </div>
      )}
      {dupes.length > 0 && (
        <div className="cu-banner" style={{ background: 'rgba(185,119,14,0.1)' }}>
          <MergeCellsOutlined style={{ color: '#B9770E' }} />
          <span style={{ flex: 1, color: TEXT, minWidth: 200 }}>{dupes.length} phone number{dupes.length > 1 ? 's are' : ' is'} used by more than one customer.</span>
          <Button size="small" onClick={() => setMergeOpen(true)}>Review &amp; merge</Button>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className="cu-banner" style={{ background: 'rgba(47,102,144,0.08)' }}>
          <CalendarOutlined style={{ color: PRIMARY }} />
          <span style={{ flex: 1, color: TEXT, minWidth: 200 }}>
            Coming up:{' '}
            {upcoming.slice(0, 4).map(({ c, kind, days }, i) => (
              <span key={c.customer_id + kind}>
                {i > 0 && ', '}
                <a onClick={() => openProfile(c)} style={{ color: PRIMARY, fontWeight: 600 }}>{c.name}</a>’s {kind} {days === 0 ? 'today 🎉' : days === 1 ? 'tomorrow' : `in ${days} days`}
              </span>
            ))}
            {upcoming.length > 4 && ` and ${upcoming.length - 4} more`}. Send wishes with {BIRTHDAY_OFFER} from their WhatsApp menu.
          </span>
        </div>
      )}

      {/* Summary */}
      <div className="cu-strip">
        <button type="button" className={`cu-stat${chip === 'all' ? ' cu-stat-on' : ''}`} onClick={() => setChip('all')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: SUB, fontWeight: 600 }}>
            Customers <TeamOutlined style={{ color: PRIMARY }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{customers.length}</div>
        </button>
        <button type="button" className={`cu-stat${chip === 'dues' ? ' cu-stat-on' : ''}`} onClick={() => setChip('dues')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: SUB, fontWeight: 600 }}>
            {isMobile ? 'Owed to you' : 'Customers owe you'} <WalletOutlined style={{ color: '#B9770E' }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: totalOutstanding > 0 ? BAD : TEXT }}>{money(totalOutstanding)}</div>
        </button>
        <button type="button" className={`cu-stat${chip === 'dues' ? ' cu-stat-on' : ''}`} onClick={() => setChip('dues')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: SUB, fontWeight: 600 }}>
            With dues <WarningOutlined style={{ color: withDues ? BAD : SUB }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{withDues}</div>
        </button>
      </div>

      {/* Search + chips */}
      <Input
        placeholder="Search name, phone, city or ID"
        value={search} onChange={(e) => setSearch(e.target.value)}
        prefix={<SearchOutlined />} allowClear
        style={{ marginBottom: 10 }}
      />
      <div className="cu-chips" style={{ marginBottom: 6 }}>
        {CHIPS.map(([k, label, fn]) => (
          <button key={k} type="button" className={`cu-chip${chip === k ? ' cu-chip-on' : ''}`} onClick={() => setChip(k)}>
            {label}{k !== 'all' ? ` (${customers.filter(fn).length})` : ''}
          </button>
        ))}
      </div>
      <Text style={{ marginBottom: 8, display: 'block', fontSize: 12.5, color: SUB }}>
        {shown.length} customer{shown.length === 1 ? '' : 's'}{chip === 'dues' && !sortBy?.order ? ', highest due first' : ''}
        {chip === 'vip' && <> · <Tooltip title={TIER_RULES}><a style={{ color: PRIMARY }}>How tiers work</a></Tooltip></>}
      </Text>

      {/* Mobile: cards | Desktop: table */}
      {isMobile ? (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: SUB, fontSize: 14 }}>
            {chip === 'dues' ? 'No customers owe you money 🎉' : 'No customers found'}
          </div>
        ) : shown.map((c) => (
          <div key={c.customer_id} className="cu-card" role="button" tabIndex={0}
            onClick={() => openProfile(c)} onKeyDown={(e) => { if (e.key === 'Enter') openProfile(c) }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{highlight(c.name, search)}</div>
                <div style={{ fontSize: 12.5, color: SUB }}>
                  {c.phone ? highlight(c.phone, search) : 'No phone'}{c.city ? ` · ${c.city}` : ''}
                </div>
              </div>
              {tierBadge(c.member_type)}
            </div>
            <div style={{ display: 'flex', gap: '4px 14px', flexWrap: 'wrap', margin: '8px 0 10px', fontSize: 13, color: SUB }}>
              <span>Spent <b style={{ color: TEXT }}>{money(c.total_purchase)}</b></span>
              {c.credit_balance > 0 && <span>Owes <b style={{ color: BAD }}>{money(c.credit_balance)}</b></span>}
              {c.store_credit > 0 && <span>Store credit <b style={{ color: GOOD }}>{money(c.store_credit)}</b></span>}
              {loyaltyProgram?.enabled && <span><b style={{ color: TEXT }}>{c.loyalty_pts || 0}</b> pts</span>}
              <span style={{ color: isInactive(c) ? BAD : SUB }}>Last visit {lastVisitText(c.last_visit).toLowerCase()}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
              <Button size="small" icon={<PhoneOutlined />} href={c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : undefined} disabled={!c.phone}>Call</Button>
              <Dropdown menu={waMenu(c)} trigger={['click']} disabled={!c.phone}>
                <Button size="small" icon={<WhatsAppOutlined />} style={{ color: c.phone ? '#128C4B' : undefined }}>WhatsApp</Button>
              </Dropdown>
              {c.credit_balance > 0
                ? <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPay(c)}>Collect</Button>
                : <Button size="small" icon={<FileTextOutlined />} onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(c.name)}`)}>Bills</Button>}
            </div>
          </div>
        ))
      ) : (
        <Card style={{ borderRadius: 14 }} styles={{ body: { padding: 8 } }}>
          <Table
            className="cu-table"
            dataSource={shown} columns={columns} rowKey="customer_id"
            loading={loading} size="middle"
            locale={{ emptyText: chip === 'dues' ? 'No customers owe you money 🎉' : 'No customers found' }}
            onRow={(r) => ({ onClick: () => openProfile(r) })}
            onChange={(_p, _f, sorter, extra) => {
              if (extra.action === 'sort') setSortBy(sorter.order ? { key: sorter.columnKey, order: sorter.order } : null)
            }}
            pagination={{ pageSize: 20, showSizeChanger: true, hideOnSinglePage: true }}
            scroll={{ x: 760 }}
          />
        </Card>
      )}

      {/* ── Customer profile ─────────────────────────────────────── */}
      <Drawer
        open={!!profileId}
        onClose={() => setProfileId(null)}
        width={isMobile ? '100%' : 520}
        title={pc ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>{pc.name} {tierBadge(pc.member_type)}</span> : 'Customer'}
        footer={pc && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
            <Button type="primary" icon={<ShoppingCartOutlined />} onClick={() => navigate(`/new-bill?customer=${pc.customer_id}`)}>New bill</Button>
            {pc.credit_balance > 0
              ? <Button icon={<DollarOutlined />} onClick={() => openPay(pc)}>Collect {money(pc.credit_balance)}</Button>
              : <Button icon={<FileTextOutlined />} onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(pc.name)}`)}>All bills</Button>}
            <Dropdown menu={waMenu(pc)} trigger={['click']} disabled={!pc.phone}>
              <Button icon={<WhatsAppOutlined />} style={{ color: pc.phone ? '#128C4B' : undefined }}>WhatsApp</Button>
            </Dropdown>
            <Button icon={<EditOutlined />} onClick={() => openForm(pc)}>Edit</Button>
            {isAdmin && (
              <Button danger icon={<DeleteOutlined />} onClick={() => confirmDelete(pc)} style={{ gridColumn: '1 / -1' }}
                disabled={p.stats.visits > 0 || p.bills.length > 0}>
                {p.bills.length > 0 ? 'Has bills — can’t delete' : 'Delete customer'}
              </Button>
            )}
          </div>
        )}
      >
        {!p ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
          <>
            <div className="cu-row"><span>Phone</span>
              <b>{pc.phone ? <a href={`tel:${pc.phone.replace(/[^\d+]/g, '')}`} style={{ color: PRIMARY }}>{pc.phone}</a> : '—'}</b>
            </div>
            {india && pc.phone && !normalizeIndianMobile(pc.phone) && (
              <Alert type="warning" showIcon style={{ margin: '4px 0 8px' }} message="This phone number looks wrong. Tap Edit to fix it." />
            )}
            {pc.city && <div className="cu-row"><span>City</span><b>{pc.city}</b></div>}
            <div className="cu-row"><span>Customer since</span><b>{fmtDay(pc.member_since)}</b></div>
            {pc.birthday && <div className="cu-row"><span>Birthday</span><b>{dayjs(pc.birthday).format('D MMMM')}</b></div>}
            {pc.anniversary && <div className="cu-row"><span>Anniversary</span><b>{dayjs(pc.anniversary).format('D MMMM')}</b></div>}

            <div className="cu-kpis">
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Total spent</div><b style={{ fontSize: 18, color: TEXT }}>{money(pc.total_purchase)}</b></div>
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Visits</div><b style={{ fontSize: 18, color: TEXT }}>{p.stats.visits}</b></div>
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Average bill</div><b style={{ fontSize: 18, color: TEXT }}>{money(p.stats.avg_bill)}</b></div>
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Last visit</div><b style={{ fontSize: 18, color: TEXT }}>{lastVisitText(p.stats.last_visit)}</b></div>
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Owes</div><b style={{ fontSize: 18, color: pc.credit_balance > 0 ? BAD : TEXT }}>{money(pc.credit_balance)}</b></div>
              <div className="cu-kpi"><div style={{ fontSize: 12, color: SUB }}>Points</div><b style={{ fontSize: 18, color: TEXT }}>{pc.loyalty_pts || 0}</b></div>
              {pc.store_credit > 0 && (
                <div className="cu-kpi" style={{ gridColumn: '1 / -1', background: 'rgba(30,132,73,0.1)' }}>
                  <div style={{ fontSize: 12, color: SUB }}>Store credit (from returns, spend on a new bill)</div>
                  <b style={{ fontSize: 18, color: GOOD }}>{money(pc.store_credit)}</b>
                </div>
              )}
            </div>
            {p.next_tier && (
              <div style={{ fontSize: 12.5, color: SUB, marginBottom: 8 }}>
                {money(p.next_tier.remaining)} more spending to reach <b style={{ color: TEXT }}>{p.next_tier.name}</b>.
              </div>
            )}

            {(p.favourites.categories.length > 0 || pc.preferences) && (
              <>
                <Divider titlePlacement="start" style={{ margin: '12px 0 8px' }}>Likes</Divider>
                {p.favourites.categories.length > 0 && <div className="cu-row"><span>Favourite categories</span><b>{p.favourites.categories.join(', ')}</b></div>}
                {p.favourites.sizes.length > 0 && <div className="cu-row"><span>Usual sizes</span><b>{p.favourites.sizes.join(', ')}</b></div>}
                {p.favourites.colors.length > 0 && <div className="cu-row"><span>Colours</span><b>{p.favourites.colors.join(', ')}</b></div>}
                {pc.preferences && <div style={{ fontSize: 13.5, color: TEXT, marginTop: 4, whiteSpace: 'pre-wrap' }}>📝 {pc.preferences}</div>}
              </>
            )}

            <Divider titlePlacement="start" style={{ margin: '14px 0 6px' }}>Bills &amp; points</Divider>
            {p.bills.length === 0 ? <div style={{ color: SUB, fontSize: 13 }}>No bills yet.</div> : p.bills.map((b) => (
              <div key={b.bill_no} role="button" tabIndex={0}
                onClick={() => navigate(`/bill-history?bill=${b.bill_no}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/bill-history?bill=${b.bill_no}`) }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', cursor: 'pointer', opacity: b.status === 'Void' ? 0.55 : 1 }}>
                <div>
                  <div style={{ color: TEXT, fontWeight: 600, textDecoration: b.status === 'Void' ? 'line-through' : 'none' }}>{b.bill_no}</div>
                  <div style={{ fontSize: 12, color: SUB }}>
                    {fmtDay(b.bill_date)} · {b.payment_mode}{b.status === 'Void' ? ' · cancelled' : ''}
                    {(b.points_earned > 0 || b.points_redeemed > 0) && (
                      <> · {b.points_earned > 0 && <span style={{ color: GOOD }}>+{b.points_earned} pts</span>}
                        {b.points_redeemed > 0 && <span style={{ color: '#B9770E' }}> −{b.points_redeemed} pts</span>}</>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <b style={{ color: TEXT }}>{money(b.grand_total)}</b>
                  {b.due > 0 && <div style={{ fontSize: 12, color: BAD, fontWeight: 700 }}>Due {money(b.due)}</div>}
                </div>
              </div>
            ))}
          </>
        )}
      </Drawer>

      {/* ── Add / edit customer ──────────────────────────────────── */}
      <Modal
        title={editTarget ? `Edit ${editTarget.name}` : 'Add customer'}
        open={formOpen}
        onCancel={() => setFormOpen(false)}
        width={600}
        destroyOnHidden
        footer={[
          <Button key="cancel" onClick={() => setFormOpen(false)}>Cancel</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>{editTarget ? 'Save changes' : 'Add customer'}</Button>,
        ]}
      >
        <Form form={form} layout="vertical" onFinish={saveCustomer} initialValues={{ member_type: 'Regular' }}>
          <Row gutter={12}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Enter the customer name' }]}>
                <Input autoFocus />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Mobile number" rules={[
                { required: true, message: 'Enter the mobile number' },
                ...(india ? [indianMobileRule] : []),
                { warningOnly: true, validator: (_, v) => {
                  const owner = phoneOwner(v)
                  return owner ? Promise.reject(new Error(`This number already belongs to ${owner.name}`)) : Promise.resolve()
                } },
              ]}>
                <Input type="tel" inputMode="numeric" maxLength={16} prefix={india ? '+91' : undefined} placeholder={india ? '98765 43210' : ''} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="birthday" label="Birthday">
                <DatePicker format="D MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs())} inputReadOnly={isMobile} />
              </Form.Item>
            </Col>
            <Col xs={12} sm={12}>
              <Form.Item name="anniversary" label="Anniversary">
                <DatePicker format="D MMM YYYY" style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs())} inputReadOnly={isMobile} />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item name="preferences" label="Sizes & preferences" extra="e.g. Kurta M, jeans 32, prefers cotton, likes pastel colours">
                <Input.TextArea rows={2} maxLength={300} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
            <Col xs={24} sm={12}>
              <Form.Item name="member_type" label="Tier" extra={TIER_RULES}>
                <Select options={MEMBER_TYPES.map((m) => ({ value: m, label: m }))} />
              </Form.Item>
            </Col>
            <Col span={24}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
            <Col xs={12} sm={8}><Form.Item name="pincode" label="Pincode"><Input inputMode="numeric" maxLength={6} /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="gst_no" label="GSTIN"><Input /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="notes" label="Notes"><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>

      {/* ── Collect payment ──────────────────────────────────────── */}
      <Modal
        title={`Collect payment — ${payTarget?.name}`}
        open={!!payTarget}
        onCancel={() => setPayTarget(null)}
        onOk={handleRecordPayment}
        okText="Record payment"
        okButtonProps={{ loading: payLoading }}
        width={420}
      >
        {payTarget && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Alert type="warning" showIcon message={`Due: ${money(payTarget.credit_balance)}`} />
            <InputNumber size="large" style={{ width: '100%' }} prefix={sym}
              min={1} max={Math.round(payTarget.credit_balance)} value={payAmount} onChange={setPayAmount} aria-label="Amount received" />
            <Radio.Group value={payMode} onChange={(e) => setPayMode(e.target.value)}>
              {PAYMENT_MODES.map((m) => <Radio key={m} value={m}>{m}</Radio>)}
            </Radio.Group>
          </div>
        )}
      </Modal>

      {/* ── Merge duplicates ─────────────────────────────────────── */}
      <Modal title="Same phone, more than one customer" open={mergeOpen} onCancel={() => setMergeOpen(false)} footer={null} width={600}>
        <p style={{ color: SUB, marginTop: 0 }}>Merging moves the duplicate’s bills, spend, dues and points into the customer you keep, then removes the duplicate.</p>
        {dupes.map((group) => (
          <div key={group[0].customer_id} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 12, padding: 12, marginBottom: 10 }}>
            {group.map((c) => (
              <div key={c.customer_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ color: TEXT }}>{c.name}</b> <span style={{ color: SUB, fontSize: 12.5 }}>{c.customer_id} · {c.phone}</span>
                  <div style={{ fontSize: 12.5, color: SUB }}>{c.visits} visits · spent {money(c.total_purchase)}{c.credit_balance > 0 ? ` · owes ${money(c.credit_balance)}` : ''}</div>
                </div>
                <Button size="small" type="primary" onClick={() => keepOnly(group, c)}>Keep this one</Button>
              </div>
            ))}
          </div>
        ))}
      </Modal>

      {/* ── Link bills whose customer is missing ─────────────────── */}
      <Modal title="Link dues to customers" open={linkOpen} onCancel={() => setLinkOpen(false)} footer={null} width={600}>
        <p style={{ color: SUB, marginTop: 0 }}>
          These credit bills name a customer who isn’t in your list (for example from an import or a deleted record), so their dues aren’t tracked.
          Choose who each one belongs to — the due is added to that customer’s balance.
        </p>
        {unlinked.length === 0 ? <div style={{ color: SUB }}>All dues are linked. ✅</div> : unlinked.map((b) => (
          <div key={b.bill_no} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <b style={{ color: TEXT }}>{b.bill_no}</b> <span style={{ color: SUB, fontSize: 12.5 }}>{fmtDay(b.bill_date)}</span>
              <div style={{ fontSize: 12.5, color: SUB }}>“{b.customer_name}”{b.phone ? ` · ${b.phone}` : ''} · due <b style={{ color: BAD }}>{money(b.due)}</b></div>
            </div>
            <Select showSearch placeholder="Choose customer" style={{ width: 200 }}
              value={linkChoice[b.bill_no]} onChange={(v) => setLinkChoice((m) => ({ ...m, [b.bill_no]: v }))}
              optionFilterProp="label"
              options={customers.map((c) => ({ value: c.customer_id, label: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` }))} />
            <Button size="small" type="primary" onClick={() => doLink(b)}>Link</Button>
          </div>
        ))}
        <div style={{ marginTop: 10, fontSize: 12.5, color: SUB }}>
          Customer not in the list? <a onClick={() => { setLinkOpen(false); openForm() }} style={{ color: PRIMARY }}>Add them first</a>.
        </div>
      </Modal>

      {/* ── Import preview ───────────────────────────────────────── */}
      <Modal
        title="Import customers"
        open={!!importPreview}
        onCancel={() => setImportPreview(null)}
        onOk={doImport}
        okText={`Import ${importPreview?.length || 0} customers`}
        okButtonProps={{ loading: importing }}
        width={640}
      >
        <p style={{ color: SUB, marginTop: 0 }}>Rows whose phone number already exists are skipped. Preview of the first rows:</p>
        <Table size="small" pagination={false} rowKey={(r) => `${r.name}-${r.phone}`} scroll={{ x: 520 }}
          dataSource={(importPreview || []).slice(0, 8)}
          columns={['name', 'phone', 'city', 'birthday', 'member_type'].map((k) => ({ title: k.replace('_', ' '), dataIndex: k, key: k }))} />
        <p style={{ color: SUB, fontSize: 12.5, marginTop: 10, marginBottom: 0 }}>
          Columns understood: {CSV_FIELDS.join(', ')}. Tip: export first to get a ready-made template.
        </p>
      </Modal>
    </div>
  )
}
