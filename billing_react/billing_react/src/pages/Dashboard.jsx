import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Typography, Spin, Grid, Segmented, DatePicker, Button, Tag, Tabs,
  Modal, InputNumber, Tooltip as AntTooltip, message,
} from 'antd'
import {
  ShoppingCartOutlined, PlusOutlined, UserAddOutlined, ScanOutlined, ReloadOutlined,
  PrinterOutlined, WhatsAppOutlined, ArrowUpOutlined, ArrowDownOutlined, RightOutlined,
  TeamOutlined, ShopOutlined, WarningOutlined, WalletOutlined, BankOutlined,
  CheckCircleFilled, EditOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts'
import dayjs from 'dayjs'
import { getOverview, adjustStock, getPublicReceiptUrl } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useCurrency } from '../utils/currency'
import { printPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const { useBreakpoint } = Grid
const { RangePicker } = DatePicker

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const UP      = '#1E8449'
const DOWN    = '#C0392B'
const PALETTE = ['#2F6690', '#3A9D8F', '#E07A5F', '#8E6CB0', '#D4A017', '#5B8C5A', '#C05780', '#7A7470']

const PERIODS = [
  { label: 'Today',     value: 'today' },
  { label: '7 days',    value: 'week' },
  { label: '30 days',   value: 'month' },
  { label: 'This year', value: 'year' },
  { label: 'Custom',    value: 'custom' },
]
const COMPARE_LABEL = {
  today: 'vs yesterday', week: 'vs previous 7 days', month: 'vs previous 30 days',
  year: 'vs previous period', custom: 'vs previous period',
}
const CAN_BILL   = new Set(['Admin', 'Manager', 'Cashier'])
const CAN_STOCK  = new Set(['Admin', 'Manager'])

const ISO = 'YYYY-MM-DD'

function rangeFor(key, custom, t) {
  switch (key) {
    case 'today':  return [t, t]
    case 'month':  return [t.subtract(29, 'day'), t]
    case 'year':   return [t.startOf('year'), t]
    case 'custom': return custom || [t.subtract(6, 'day'), t]
    default:       return [t.subtract(6, 'day'), t]
  }
}

// ₹1.5L / ₹2.3Cr for India, K/M elsewhere
function compactMoney(v, sym, india) {
  const n = Number(v) || 0
  const abs = Math.abs(n)
  const trim = (x) => (Math.round(x * 10) / 10).toString().replace(/\.0$/, '')
  if (india) {
    if (abs >= 1e7) return `${sym}${trim(n / 1e7)}Cr`
    if (abs >= 1e5) return `${sym}${trim(n / 1e5)}L`
  } else {
    if (abs >= 1e6) return `${sym}${trim(n / 1e6)}M`
  }
  if (abs >= 1e3) return `${sym}${trim(n / 1e3)}K`
  return `${sym}${Math.round(n)}`
}

function pctChange(cur, prev) {
  if (!prev) return cur ? null : 0   // null = "new" (nothing to compare to)
  return Math.round(((cur - prev) / prev) * 100)
}

function greeting(now) {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function agoText(ts, now) {
  if (!ts) return ''
  const mins = Math.floor((now - ts) / 60000)
  if (mins < 1) return 'Updated just now'
  if (mins < 60) return `Updated ${mins} min ago`
  return `Updated ${Math.floor(mins / 60)} h ago`
}

const CSS = `
.db-grid { display: grid; gap: 12px; }
.db-grid-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.db-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.db-grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
.db-grid-3 { grid-template-columns: 1.2fr 1fr 1fr; align-items: start; }
.db-tile { cursor: pointer; transition: transform .15s, box-shadow .15s; }
.db-tile:hover { transform: translateY(-2px); }
.db-tile:focus-visible { outline: 2px solid ${PRIMARY}; outline-offset: 2px; }
.db-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px solid rgba(0,0,0,0.06); }
.db-row:last-child { border-bottom: none; }
.db-click { cursor: pointer; border-radius: 8px; }
.db-click:hover { background: rgba(47,102,144,0.07); }
.db-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.db-period .ant-segmented-item-selected { background: ${PRIMARY} !important; color: #fff !important; }
.db-period .ant-segmented-item:not(.ant-segmented-item-selected) { color: ${TEXT}; }
@media (max-width: 1199px) {
  .db-grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-grid-3 > :first-child { grid-column: 1 / -1; }
}
@media (max-width: 991px) {
  .db-grid-5 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .db-grid-2 { grid-template-columns: 1fr; }
}
@media (max-width: 767px) {
  .db-grid { gap: 10px; }
  .db-grid-5, .db-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-grid-5 > :last-child { grid-column: 1 / -1; }
  .db-grid-3 { grid-template-columns: 1fr; }
  .db-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .db-actions .ant-btn { width: 100%; }
}
`

// ── Small building blocks ─────────────────────────────────────────────────────
function Tile({ icon, label, value, sub, color = PRIMARY, onClick, isMobile }) {
  return (
    <Card
      className="db-tile"
      role="link" tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.() }}
      style={{ borderRadius: 14, height: '100%' }}
      styles={{ body: { padding: isMobile ? '12px' : '16px 18px' } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 12.5, color: SUB, fontWeight: 600 }}>{label}</span>
        <span style={{ color, fontSize: 16 }}>{icon}</span>
      </div>
      <div style={{ fontSize: isMobile ? 19 : 23, fontWeight: 700, color: TEXT, marginTop: 4, lineHeight: 1.25, wordBreak: 'break-word' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{sub}</div>}
    </Card>
  )
}

function Change({ cur, prev, label }) {
  const p = pctChange(cur, prev)
  if (p === null) return <span style={{ fontSize: 12, color: SUB }}>New · nothing to compare {label}</span>
  const up = p >= 0
  return (
    <span style={{ fontSize: 12, color: SUB }}>
      <span style={{ color: p === 0 ? SUB : up ? UP : DOWN, fontWeight: 700 }}>
        {p !== 0 && (up ? <ArrowUpOutlined /> : <ArrowDownOutlined />)} {Math.abs(p)}%
      </span>{' '}{label}
    </span>
  )
}

function SectionTitle({ children, extra }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>{children}</span>
      {extra}
    </div>
  )
}

function EmptyNote({ children }) {
  return <div style={{ color: SUB, textAlign: 'center', padding: '28px 8px', fontSize: 13.5 }}>{children}</div>
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate  = useNavigate()
  const { storeName, role, country } = useAuthStore()
  const { sym } = useCurrency()
  const india = (country || 'India') === 'India'
  const screens  = useBreakpoint()
  const isMobile = !screens.md

  const [period, setPeriod]   = useState('week')
  const [custom, setCustom]   = useState(null)
  const [data, setData]       = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [now, setNow]         = useState(() => Date.now())
  const [reloads, setReloads] = useState(0)
  const [loadedKey, setLoadedKey] = useState(null)
  const [restock, setRestock] = useState(null)
  const [restockQty, setRestockQty] = useState(10)

  const today = dayjs(now)
  const [start, end] = rangeFor(period, custom, today)
  const s = start.format(ISO), e = end.format(ISO)
  const requestKey = `${s}|${e}|${reloads}`
  const loading = loadedKey !== requestKey

  useEffect(() => {
    let alive = true
    getOverview(s, e)
      .then((d) => { if (alive) { setData(d); setUpdatedAt(Date.now()) } })
      .catch((err) => { if (alive) message.error(err.message) })
      .finally(() => { if (alive) setLoadedKey(requestKey) })
    return () => { alive = false }
  }, [s, e, requestKey])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  function load() {
    setNow(Date.now())
    setReloads((n) => n + 1)
  }

  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const compact = (v) => compactMoney(v, sym, india)
  const billsLink = (params) => navigate(`/bill-history?${new URLSearchParams(params)}`)
  const rangeParams = data ? { from: data.range.start, to: data.range.end } : {}

  async function doRestock() {
    if (!restockQty) return
    try {
      await adjustStock(restock.item_id, restockQty)
      message.success(`Added ${restockQty} to ${restock.product_name}`)
      setRestock(null)
      load()
    } catch (err) { message.error(err.message) }
  }

  function shareWhatsApp(b) {
    const phone = (b.phone || '').replace(/\D/g, '')
    const waPhone = phone.length === 10 ? '91' + phone : phone
    const url = b.share_token ? getPublicReceiptUrl(b.share_token) : ''
    const msg = `Hi ${b.customer_name || ''}, thank you for shopping at ${storeName}!\n` +
      `Bill ${b.bill_no}: ${money(b.grand_total)}` + (url ? `\nReceipt: ${url}` : '')
    window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  async function reprint(b) {
    try {
      const paper = localStorage.getItem('receipt_paper_size') || '3inch'
      await printPdfWithAuth(`/bills/${b.bill_no}/receipt-pdf?paper=${paper}`)
    } catch (err) { message.error(err.message) }
  }

  const quickActions = [
    CAN_BILL.has(role)  && { key: 'bill', label: 'New Bill', icon: <ShoppingCartOutlined />, to: '/new-bill', primary: true },
    CAN_STOCK.has(role) && { key: 'prod', label: 'Add Product', icon: <PlusOutlined />, to: '/products?add=1' },
    CAN_BILL.has(role)  && { key: 'cust', label: 'Add Customer', icon: <UserAddOutlined />, to: '/customers?add=1' },
    CAN_BILL.has(role)  && { key: 'scan', label: 'Scan Barcode', icon: <ScanOutlined />, to: '/new-bill?scan=1' },
  ].filter(Boolean)

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
      <div>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>
          {greeting(now)}, {storeName}
        </Title>
        <Text style={{ color: SUB, fontSize: 13 }}>
          {today.format('ddd, D MMM YYYY')}
          {updatedAt && <> · {agoText(updatedAt, now)}</>}
        </Text>
        <AntTooltip title="Refresh">
          <Button type="text" size="small" icon={<ReloadOutlined spin={loading} />} onClick={load}
            aria-label="Refresh dashboard" style={{ marginLeft: 4, color: PRIMARY }} />
        </AntTooltip>
      </div>
      {quickActions.length > 0 && (
        <div className="db-actions" style={isMobile ? { width: '100%' } : undefined}>
          {quickActions.map(a => (
            <Button key={a.key} type={a.primary ? 'primary' : 'default'} icon={a.icon} onClick={() => navigate(a.to)}
              style={a.primary ? { background: PRIMARY, borderColor: PRIMARY } : { color: TEXT }}>
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  )

  if (!data) {
    return (
      <div>
        <style>{CSS}</style>
        {header}
        <div style={{ textAlign: 'center', padding: 60 }}><Spin /></div>
      </div>
    )
  }

  const { totals, prev_totals: prev, today: todayStats, counts, credit, gst_month: gstMonth } = data

  // ── First-time store: friendly start screen instead of empty charts ────────
  if (counts.bills_all_time === 0) {
    const steps = [
      { done: counts.products > 0, title: 'Add your products', text: 'Add items with price, size and stock so billing is one tap.', action: CAN_STOCK.has(role) && ['Add Product', '/products?add=1'] },
      { done: false, title: 'Create your first bill', text: 'Search or scan an item, choose the payment mode and print or WhatsApp the receipt.', action: CAN_BILL.has(role) && ['Create your first bill →', '/new-bill'] },
    ]
    return (
      <div>
        <style>{CSS}</style>
        {header}
        <Card style={{ borderRadius: 16 }} styles={{ body: { padding: isMobile ? 18 : 32 } }}>
          <Title level={isMobile ? 4 : 3} style={{ marginTop: 0, color: TEXT }}>Welcome to Loacal Billing 👋</Title>
          <Text style={{ color: SUB, fontSize: 14 }}>Your dashboard fills up as soon as you make sales. Two quick steps to get started:</Text>
          <div style={{ marginTop: 20, display: 'grid', gap: 14 }}>
            {steps.map((st, i) => (
              <div key={st.title} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: st.done ? UP : PRIMARY, color: '#fff', fontWeight: 700,
                }}>
                  {st.done ? <CheckCircleFilled /> : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: TEXT, textDecoration: st.done ? 'line-through' : 'none' }}>{st.title}</div>
                  <div style={{ color: SUB, fontSize: 13, margin: '2px 0 8px' }}>{st.text}</div>
                  {st.action && !st.done && (
                    <Button type={i === 1 ? 'primary' : 'default'} onClick={() => navigate(st.action[1])}
                      style={i === 1 ? { background: PRIMARY, borderColor: PRIMARY } : undefined}>
                      {st.action[0]}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  const compareLabel = COMPARE_LABEL[period]
  const catTotal = data.by_category.reduce((a, c) => a + c.revenue, 0)
  const payTotal = data.by_payment.reduce((a, c) => a + c.revenue, 0)
  const todayParams = { from: today.format(ISO), to: today.format(ISO) }

  const chartTick = (v) => {
    if (data.range.granularity === 'month') return dayjs(v + '-01').format('MMM')
    return data.series.length > 14 ? dayjs(v).format('D') : dayjs(v).format(isMobile ? 'D/M' : 'ddd D')
  }
  const openSeriesBucket = (row) => {
    if (!row) return
    if (data.range.granularity === 'month') {
      const m = dayjs(row.date + '-01')
      billsLink({ from: m.format(ISO), to: m.endOf('month').format(ISO) })
    } else {
      billsLink({ from: row.date, to: row.date })
    }
  }

  return (
    <div>
      <style>{CSS}</style>
      {header}

      {/* Today at a glance */}
      <div style={{ fontSize: 13, fontWeight: 700, color: SUB, textTransform: 'uppercase', letterSpacing: 0.6, margin: '4px 0 8px' }}>
        Today at a glance
      </div>
      <div className="db-grid db-grid-4" style={{ marginBottom: 16 }}>
        <Tile isMobile={isMobile} label="Today's sales" value={money(todayStats.revenue)} icon={<WalletOutlined />} onClick={() => billsLink(todayParams)} />
        <Tile isMobile={isMobile} label="Bills today" value={todayStats.bills} icon={<ShoppingCartOutlined />} onClick={() => billsLink(todayParams)} />
        <Tile isMobile={isMobile} label="Average bill" value={money(todayStats.avg_bill)} icon={<BankOutlined />} onClick={() => billsLink(todayParams)} />
        <Tile isMobile={isMobile} label="Items sold" value={todayStats.items_sold} icon={<ShopOutlined />} onClick={() => billsLink(todayParams)} />
      </div>

      {/* Store-wide cards */}
      <div className="db-grid db-grid-5" style={{ marginBottom: 16 }}>
        <Tile isMobile={isMobile} label="Customers" value={counts.customers} icon={<TeamOutlined />} onClick={() => navigate('/customers')} />
        <Tile isMobile={isMobile} label="Products" value={counts.products} icon={<ShopOutlined />} onClick={() => navigate('/products')} />
        <Tile isMobile={isMobile} label="Low stock" value={counts.low_stock} color={counts.low_stock ? DOWN : UP}
          icon={<WarningOutlined />} sub={counts.low_stock ? 'Tap to see items' : 'All well stocked'} onClick={() => navigate('/products?low=1')} />
        <Tile isMobile={isMobile} label="Customers owe you" value={money(credit.outstanding)} color="#B9770E"
          icon={<WalletOutlined />} sub={credit.customers ? `${credit.customers} customer${credit.customers > 1 ? 's' : ''} on credit` : 'No pending credit'}
          onClick={() => navigate('/customers?dues=1')} />
        <Tile isMobile={isMobile} label={india ? 'GST collected' : 'Tax collected'} value={money(gstMonth.gst)}
          icon={<BankOutlined />} sub={`This month · ${gstMonth.month}`} onClick={() => navigate('/reports')} />
      </div>

      {/* Period: KPIs + trend */}
      <Card style={{ borderRadius: 14, marginBottom: 16 }} styles={{ body: { padding: isMobile ? 12 : 20 } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: TEXT }}>
            Sales · {start.isSame(end, 'day') ? start.format('D MMM') : `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`}
          </span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', maxWidth: '100%' }}>
            <div className="db-period" style={{ maxWidth: '100%', overflowX: 'auto' }}>
              <Segmented value={period} onChange={setPeriod} options={PERIODS} size={isMobile ? 'small' : 'middle'} />
            </div>
            {period === 'custom' && (
              <RangePicker
                value={custom || [start, end]}
                onChange={(v) => v && setCustom([v[0], v[1]])}
                disabledDate={(d) => d.isAfter(today, 'day')}
                format="D MMM YYYY" allowClear={false}
                size={isMobile ? 'small' : 'middle'}
                inputReadOnly={isMobile}
              />
            )}
          </div>
        </div>

        <div className="db-grid db-grid-4" style={{ marginBottom: 16 }}>
          {[
            ['Revenue', money(totals.revenue), totals.revenue, prev.revenue],
            ['Bills', totals.bills, totals.bills, prev.bills],
            ['Average bill', money(totals.avg_bill), totals.avg_bill, prev.avg_bill],
            ['Items sold', totals.items_sold, totals.items_sold, prev.items_sold],
          ].map(([label, shown, cur, before]) => (
            <div key={label} className="db-tile db-click" role="link" tabIndex={0}
              onClick={() => billsLink(rangeParams)} onKeyDown={(ev) => { if (ev.key === 'Enter') billsLink(rangeParams) }}
              style={{ background: 'rgba(47,102,144,0.07)', borderRadius: 12, padding: isMobile ? '10px 12px' : '12px 16px' }}>
              <div style={{ fontSize: 12.5, color: SUB, fontWeight: 600 }}>{label}</div>
              <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT, lineHeight: 1.3 }}>{shown}</div>
              <Change cur={cur} prev={before} label={compareLabel} />
            </div>
          ))}
        </div>

        {totals.bills === 0 ? (
          <EmptyNote>No sales in this period yet. Try a longer range, or <a onClick={() => navigate('/new-bill')} style={{ color: PRIMARY, fontWeight: 600 }}>create a bill</a>.</EmptyNote>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 260}>
              <BarChart data={data.series} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={chartTick} tick={{ fontSize: 11, fill: SUB }}
                  interval="preserveStartEnd" minTickGap={isMobile ? 6 : 10} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: SUB }} width={isMobile ? 46 : 56}
                  axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(47,102,144,0.08)' }}
                  contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}
                  labelFormatter={(l) => data.range.granularity === 'month' ? dayjs(l + '-01').format('MMMM YYYY') : dayjs(l).format('ddd, D MMM')}
                  formatter={(v, _n, item) => [`${money(v)} · ${item.payload.bills} bill${item.payload.bills === 1 ? '' : 's'}`, 'Sales']}
                />
                <Bar dataKey="revenue" fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={isMobile ? 22 : 36}
                  cursor="pointer" onClick={(bar) => openSeriesBucket(bar?.payload)} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: SUB, textAlign: 'center', marginTop: 4 }}>
              Tap a bar to see the bills for that {data.range.granularity === 'month' ? 'month' : 'day'}
            </div>
          </>
        )}
      </Card>

      {/* Category · Payment · Top sellers */}
      <div className="db-grid db-grid-3" style={{ marginBottom: 16 }}>
        <Card title={<SectionTitle>Sales by category</SectionTitle>} style={{ borderRadius: 14 }}>
          {data.by_category.length === 0 ? <EmptyNote>No category sales in this period</EmptyNote> : (
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
              <div style={{ width: isMobile ? 170 : 160, height: isMobile ? 170 : 160, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.by_category} dataKey="revenue" nameKey="category" innerRadius="58%" outerRadius="95%"
                      paddingAngle={1} stroke="none" cursor="pointer"
                      onClick={(c) => billsLink({ ...rangeParams, category: c.variants.join('|'), category_label: c.category })}>
                      {data.by_category.map((c, i) => <Cell key={c.category} fill={PALETTE[i % PALETTE.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [`${money(v)} (${Math.round(v / catTotal * 100)}%)`, n]}
                      contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
                {data.by_category.map((c, i) => (
                  <div key={c.category} className="db-row db-click" role="link" tabIndex={0}
                    onClick={() => billsLink({ ...rangeParams, category: c.variants.join('|'), category_label: c.category })}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                    <span style={{ flex: 1, color: TEXT, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category}</span>
                    <span style={{ color: SUB, fontSize: 12.5 }}>{Math.round(c.revenue / catTotal * 100)}%</span>
                    <span style={{ color: TEXT, fontSize: 13, fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{compact(c.revenue)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card title={<SectionTitle>Payment modes</SectionTitle>} style={{ borderRadius: 14 }}>
          {data.by_payment.length === 0 ? <EmptyNote>No payments in this period</EmptyNote> : (
            <>
              <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 6 }}>
                {data.by_payment.map((p, i) => (
                  <AntTooltip key={p.payment_mode} title={`${p.payment_mode}: ${money(p.revenue)}`}>
                    <div style={{ width: `${p.revenue / payTotal * 100}%`, background: PALETTE[i % PALETTE.length] }} />
                  </AntTooltip>
                ))}
              </div>
              <div style={{ fontSize: 13, color: SUB, marginBottom: 8 }}>
                {data.by_payment.map(p => `${p.payment_mode} ${Math.round(p.revenue / payTotal * 100)}%`).join(' · ')}
              </div>
              {data.by_payment.map((p, i) => (
                <div key={p.payment_mode} className="db-row db-click" role="link" tabIndex={0}
                  onClick={() => billsLink({ ...rangeParams, payment_mode: p.payment_mode })}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: PALETTE[i % PALETTE.length], flexShrink: 0 }} />
                  <span style={{ flex: 1, color: TEXT, fontSize: 13.5 }}>{p.payment_mode}</span>
                  <span style={{ color: SUB, fontSize: 12.5 }}>{p.bills} bill{p.bills === 1 ? '' : 's'}</span>
                  <span style={{ color: TEXT, fontSize: 13, fontWeight: 600, minWidth: 64, textAlign: 'right' }}>{compact(p.revenue)}</span>
                  <RightOutlined style={{ color: SUB, fontSize: 10 }} />
                </div>
              ))}
            </>
          )}
        </Card>

        <Card title={<SectionTitle>Top sellers</SectionTitle>} style={{ borderRadius: 14 }} styles={{ body: { paddingTop: 4 } }}>
          <Tabs size="small" items={[
            ['products', 'Products', data.top_products],
            ['sizes', 'Sizes', data.top_sizes],
            ['colors', 'Colours', data.top_colors],
          ].map(([key, label, rows]) => ({
            key, label,
            children: rows.length === 0 ? <EmptyNote>No sales in this period</EmptyNote> : rows.map((r, i) => (
              <div key={r.name} className="db-row">
                <span style={{ width: 20, color: SUB, fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: TEXT, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                  <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 4 }}>
                    <div style={{ width: `${r.qty / rows[0].qty * 100}%`, height: '100%', borderRadius: 2, background: PALETTE[1] }} />
                  </div>
                </div>
                <span style={{ color: TEXT, fontSize: 13, fontWeight: 600, minWidth: 54, textAlign: 'right' }}>{r.qty} sold</span>
              </div>
            )),
          }))} />
        </Card>
      </div>

      {/* Recent bills + Low stock */}
      <div className="db-grid db-grid-2">
        <Card style={{ borderRadius: 14 }}
          title={<SectionTitle extra={<a onClick={() => navigate('/bill-history')} style={{ fontSize: 13, color: PRIMARY, fontWeight: 600 }}>View all <RightOutlined style={{ fontSize: 10 }} /></a>}>Recent bills</SectionTitle>}>
          {data.recent_bills.map(b => (
            <div key={b.bill_no} className="db-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.customer_name || 'Walk-in'}
                </div>
                <div style={{ color: SUB, fontSize: 12 }}>
                  {b.bill_no} · {dayjs(b.bill_date).isSame(today, 'day') ? b.bill_time : dayjs(b.bill_date).format('D MMM')}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 700 }}>{money(b.grand_total)}</div>
                <Tag color={b.status === 'Paid' ? 'default' : b.status === 'Credit' ? 'orange' : 'red'} style={{ margin: 0, fontSize: 11 }}>
                  {b.status === 'Paid' ? b.payment_mode : b.status}
                </Tag>
              </div>
              <AntTooltip title="Reprint">
                <Button size="small" icon={<PrinterOutlined />} onClick={() => reprint(b)} aria-label={`Reprint ${b.bill_no}`} />
              </AntTooltip>
              <AntTooltip title={b.phone ? 'Share on WhatsApp' : 'No phone number on this bill'}>
                <Button size="small" icon={<WhatsAppOutlined />} disabled={!b.phone} onClick={() => shareWhatsApp(b)}
                  aria-label={`Share ${b.bill_no} on WhatsApp`} style={b.phone ? { color: '#128C4B' } : undefined} />
              </AntTooltip>
            </div>
          ))}
        </Card>

        <Card style={{ borderRadius: 14 }}
          title={<SectionTitle extra={counts.low_stock > 0 && <a onClick={() => navigate('/products?low=1')} style={{ fontSize: 13, color: PRIMARY, fontWeight: 600 }}>View all <RightOutlined style={{ fontSize: 10 }} /></a>}>Low stock</SectionTitle>}>
          {data.low_stock.length === 0 ? (
            <EmptyNote><CheckCircleFilled style={{ color: UP }} /> All products are well stocked</EmptyNote>
          ) : data.low_stock.slice(0, 8).map(p => {
            const out = p.stock_qty <= 0
            return (
              <div key={p.item_id} className="db-row" style={out ? { background: 'rgba(192,57,43,0.07)', borderRadius: 8, padding: '9px 8px' } : undefined}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: TEXT, fontSize: 13.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.product_name}{p.size ? ` · ${p.size}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: SUB }}>
                    {p.item_id} ·{' '}
                    <span style={{ color: out ? DOWN : '#B9770E', fontWeight: 700 }}>
                      {out ? 'Out of stock' : `${p.stock_qty} left`}
                    </span>{' '}(min {p.min_stock})
                  </div>
                </div>
                {CAN_STOCK.has(role) && (
                  <>
                    <Button size="small" type={out ? 'primary' : 'default'} danger={out} onClick={() => { setRestock(p); setRestockQty(Math.max(p.min_stock * 2 - p.stock_qty, 1)) }}>
                      Restock
                    </Button>
                    <AntTooltip title="Edit product">
                      <Button size="small" icon={<EditOutlined />} aria-label={`Edit ${p.product_name}`}
                        onClick={() => navigate(`/products?search=${encodeURIComponent(p.item_id)}`)} />
                    </AntTooltip>
                  </>
                )}
              </div>
            )
          })}
        </Card>
      </div>

      <Modal
        title={restock ? `Restock ${restock.product_name}` : ''}
        open={!!restock} onCancel={() => setRestock(null)} onOk={doRestock}
        okText="Add stock" okButtonProps={{ style: { background: PRIMARY, borderColor: PRIMARY } }}
      >
        {restock && (
          <>
            <p style={{ color: SUB }}>
              {restock.item_id} · currently <b style={{ color: TEXT }}>{restock.stock_qty}</b> in stock (min {restock.min_stock})
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span>Quantity to add</span>
              <InputNumber min={1} value={restockQty} onChange={setRestockQty} autoFocus />
            </div>
            <p style={{ color: SUB, marginTop: 10, marginBottom: 0 }}>New stock: <b style={{ color: TEXT }}>{restock.stock_qty + (restockQty || 0)}</b></p>
          </>
        )}
      </Modal>
    </div>
  )
}
