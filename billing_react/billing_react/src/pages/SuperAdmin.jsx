import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Statistic, Table, Input, Select, Button, Alert, Checkbox, Segmented, Switch,
  Typography, Tag, Space, Modal, Form, message, Tabs, Descriptions, Divider, Tooltip as AntTooltip,
} from 'antd'
import {
  SearchOutlined, MessageOutlined, EyeOutlined, EditOutlined, LockOutlined, UnlockOutlined, DownloadOutlined,
} from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  adminOverview, adminListStores, adminToggleStore,
  adminUpdateStore, adminDailyRevenue, adminRevenueByStore,
  adminListTickets, adminReplyTicket, adminDeleteTicket,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography
const { TextArea } = Input

const TICKET_STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }
const DAY = 24 * 60 * 60 * 1000

// API timestamps are UTC without a zone suffix
const toDate = (v) => (v ? new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`) : null)
const inr = (v) => `₹${Math.round(v || 0).toLocaleString('en-IN')}`

// ₹60.8L, ₹1.2Cr, ₹45K
function inrShort(v) {
  const n = Number(v) || 0
  const a = Math.abs(n)
  if (a >= 1e7) return `₹${+(n / 1e7).toFixed(1)}Cr`
  if (a >= 1e5) return `₹${+(n / 1e5).toFixed(1)}L`
  if (a >= 1e3) return `₹${+(n / 1e3).toFixed(1)}K`
  return `₹${Math.round(n)}`
}

function ago(v) {
  const d = toDate(v)
  if (!d) return null
  const days = Math.floor((Date.now() - d) / DAY)
  if (days < 1) {
    const hrs = Math.floor((Date.now() - d) / 3600000)
    return hrs < 1 ? 'just now' : `${hrs}h ago`
  }
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const maskPhone = (p) => (p && p.length > 4 ? `${p.slice(0, 2)}${'•'.repeat(p.length - 4)}${p.slice(-2)}` : p)
const maskEmail = (e) => {
  if (!e || !e.includes('@')) return e
  const [user, domain] = e.split('@')
  return `${user.slice(0, 2)}•••@${domain}`
}

// active = billed in the last 30 days; idle = live but quiet
function activity(s, activeDays) {
  if (!s.is_active) return { label: 'Frozen', color: 'red' }
  const last = toDate(s.last_bill_at)
  if (last && Date.now() - last <= activeDays * DAY) return { label: 'Active', color: 'green' }
  return { label: last ? 'Idle' : 'No bills', color: 'default' }
}

function downloadCsv(rows) {
  const cols = [
    ['Store code', 'store_code'], ['Store name', 'store_name'], ['Owner', 'owner_user'],
    ['Phone', 'phone'], ['Email', 'email'], ['Plan', 'plan'], ['Frozen', (r) => (r.is_active ? 'No' : 'Yes')],
    ['Test', (r) => (r.is_test ? 'Yes' : 'No')], ['Bills', 'bills'], ['Sales', (r) => Math.round(r.revenue || 0)],
    ['Bills today', 'today_bills'], ['Sales today', (r) => Math.round(r.today_sales || 0)],
    ['Customers', 'customers'], ['Products', 'products'],
    ['Last bill', (r) => toDate(r.last_bill_at)?.toISOString() || ''],
    ['Signup', (r) => toDate(r.created_at)?.toISOString() || ''], ['Notes', 'notes'],
  ]
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [cols.map(([h]) => cell(h)).join(',')]
  rows.forEach((r) => lines.push(cols.map(([, k]) => cell(typeof k === 'function' ? k(r) : r[k])).join(',')))
  const url = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `stores-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// One bar per day, including days with no sales
function fillDays(rows, days) {
  const byDate = Object.fromEntries(rows.map((r) => [r.date, r]))
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10)
    out.push({ date: d.slice(5), revenue: byDate[d]?.revenue || 0, bills: byDate[d]?.bills || 0 })
  }
  return out
}

export default function SuperAdmin() {
  const { role } = useAuthStore()
  const [ov, setOv]               = useState({})
  const [stores, setStores]       = useState([])
  const [storesError, setStoresError] = useState('')
  const [daily, setDaily]         = useState([])
  const [range, setRange]         = useState(30)
  const [byStore, setByStore]     = useState([])
  const [tickets, setTickets]     = useState([])
  const [ticketFilter, setTicketFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [planFilter, setPlanFilter]     = useState('All')
  const [showTest, setShowTest]         = useState(false)
  const [revealed, setRevealed]         = useState(() => new Set())
  const [selected, setSelected]         = useState([])
  const [planModal, setPlanModal]       = useState(null)
  const [detailModal, setDetailModal]   = useState(null)
  const [replyModal, setReplyModal]     = useState(null)
  const [form] = Form.useForm()
  const [replyForm] = Form.useForm()

  function load() {
    adminOverview().then(setOv).catch(() => {})
    adminListStores()
      .then((data) => { setStores(data); setStoresError('') })
      .catch((err) => setStoresError(err.message || 'Failed to load stores'))
    adminRevenueByStore(10).then(setByStore).catch(() => {})
  }

  function loadTickets() {
    const s = ticketFilter !== 'All' ? ticketFilter : undefined
    adminListTickets(s).then(setTickets).catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { adminDailyRevenue(range).then(setDaily).catch(() => {}) }, [range])
  useEffect(() => { loadTickets() }, [ticketFilter])

  if (role !== 'SuperAdmin') {
    return <Card><Title level={4}>Access Denied</Title></Card>
  }

  const activeDays = ov.active_days || 30

  function confirmToggle(r, after) {
    Modal.confirm({
      title: r.is_active ? `Freeze ${r.store_name}?` : `Unfreeze ${r.store_name}?`,
      content: r.is_active
        ? 'Everyone in this store will be blocked from signing in until you unfreeze it.'
        : 'The store’s users will be able to sign in again.',
      okText: r.is_active ? 'Freeze' : 'Unfreeze',
      okButtonProps: { danger: r.is_active },
      onOk: () => adminToggleStore(r.store_code)
        .then(() => { message.success(r.is_active ? 'Store frozen' : 'Store unfrozen'); after?.(); load() })
        .catch((err) => message.error(err.message)),
    })
  }

  function confirmBulkFreeze() {
    const targets = stores.filter((s) => selected.includes(s.store_code) && s.is_active)
    if (!targets.length) { message.info('The selected stores are already frozen.'); return }
    Modal.confirm({
      title: `Freeze ${targets.length} store${targets.length > 1 ? 's' : ''}?`,
      content: targets.map((t) => t.store_name).join(', '),
      okText: 'Freeze', okButtonProps: { danger: true },
      onOk: async () => {
        const results = await Promise.allSettled(targets.map((t) => adminToggleStore(t.store_code)))
        const failed = results.filter((r) => r.status === 'rejected').length
        if (failed) message.error(`${failed} could not be frozen`)
        else message.success(`${targets.length} frozen`)
        setSelected([])
        load()
      },
    })
  }

  function openEdit(r) {
    setPlanModal(r)
    form.setFieldsValue({ plan: r.plan, notes: r.notes || '', is_test: !!r.is_test })
  }

  async function handlePlanSave(values) {
    try {
      await adminUpdateStore(planModal.store_code, values)
      message.success('Store updated!'); setPlanModal(null); load()
    } catch (err) { message.error(err.message) }
  }

  async function handleReplySave(values) {
    try {
      await adminReplyTicket(replyModal.id, values)
      message.success('Reply sent!')
      setReplyModal(null)
      replyForm.resetFields()
      loadTickets()
    } catch (err) { message.error(err.message) }
  }

  const testCount = stores.filter((s) => s.is_test).length
  const filtered = stores.filter((s) => {
    if (!showTest && s.is_test) return false
    if (search) {
      const q = search.toLowerCase()
      if (
        !s.store_code.toLowerCase().includes(q) &&
        !s.store_name.toLowerCase().includes(q) &&
        !s.owner_user.toLowerCase().includes(q) &&
        !(s.phone || '').includes(q) &&
        !(s.email || '').toLowerCase().includes(q)
      ) return false
    }
    const act = activity(s, activeDays).label
    if (statusFilter === 'Billed today' && !s.today_bills) return false
    if (statusFilter === 'Active' && act !== 'Active') return false
    if (statusFilter === 'Idle' && act !== 'Idle' && act !== 'No bills') return false
    if (statusFilter === 'Frozen' && act !== 'Frozen') return false
    if (planFilter !== 'All' && (s.plan || 'Free') !== planFilter) return false
    return true
  })

  const plans = ['All', ...new Set(stores.map((s) => s.plan || 'Free'))]
  const reveal = (code) => setRevealed((prev) => new Set(prev).add(code))
  const byTime = (k) => (a, b) => (toDate(a[k]) || 0) - (toDate(b[k]) || 0)

  const storeColumns = [
    {
      title: 'Store', key: 'store_name', fixed: 'left', width: 200,
      sorter: (a, b) => a.store_name.localeCompare(b.store_name),
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <Text strong style={{ wordBreak: 'normal', overflowWrap: 'anywhere' }}>{r.store_name}</Text>
          {r.is_test && <Tag color="purple" style={{ marginLeft: 6 }}>Test</Tag>}
          <div><Text code style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{r.store_code}</Text></div>
        </div>
      ),
    },
    {
      title: 'Owner', dataIndex: 'owner_user', key: 'owner_user', width: 130, ellipsis: true,
      render: (v) => v || <Text type="danger">missing</Text>,
    },
    {
      title: 'Contact', key: 'contact', width: 190,
      render: (_, r) => {
        if (!r.phone && !r.email) return <Text type="warning">No contact details</Text>
        const show = revealed.has(r.store_code)
        return (
          <div style={{ fontSize: 12, cursor: show ? 'text' : 'pointer' }}
            title={show ? undefined : 'Click to show'} onClick={() => reveal(r.store_code)}>
            {r.phone && <div>📞 {show ? r.phone : maskPhone(r.phone)}</div>}
            {r.email && <div style={{ color: '#666', overflowWrap: 'anywhere' }}>✉ {show ? r.email : maskEmail(r.email)}</div>}
          </div>
        )
      },
    },
    { title: 'Plan', dataIndex: 'plan', key: 'plan', width: 80,
      render: (v) => <Tag color="blue">{v || 'Free'}</Tag> },
    { title: 'Status', key: 'status', width: 95,
      render: (_, r) => { const a = activity(r, activeDays); return <Tag color={a.color}>{a.label}</Tag> } },
    { title: 'Last active', dataIndex: 'last_bill_at', key: 'last_bill_at', width: 110,
      sorter: byTime('last_bill_at'),
      render: (v) => (v ? <AntTooltip title={toDate(v).toLocaleString()}>{ago(v)}</AntTooltip> : <Text type="secondary">Never</Text>) },
    { title: 'Today', dataIndex: 'today_sales', key: 'today_sales', width: 100, align: 'right',
      sorter: (a, b) => (a.today_sales || 0) - (b.today_sales || 0),
      render: (v, r) => (r.today_bills
        ? <AntTooltip title={`${r.today_bills} bill${r.today_bills > 1 ? 's' : ''} today`}>
            <Text strong style={{ color: '#00695C', whiteSpace: 'nowrap' }}>{inr(v)}</Text>
          </AntTooltip>
        : <Text type="secondary">—</Text>) },
    { title: 'Sales', dataIndex: 'revenue', key: 'revenue', width: 110, align: 'right',
      sorter: (a, b) => (a.revenue || 0) - (b.revenue || 0),
      render: (v) => <Text strong style={{ color: '#1A237E', whiteSpace: 'nowrap' }}>{inr(v)}</Text> },
    { title: 'Bills', dataIndex: 'bills', key: 'bills', width: 75, align: 'right',
      sorter: (a, b) => a.bills - b.bills },
    { title: 'Signup', dataIndex: 'created_at', key: 'created_at', width: 105,
      sorter: byTime('created_at'), defaultSortOrder: 'descend',
      render: (v) => <span style={{ whiteSpace: 'nowrap' }}>{v ? toDate(v).toLocaleDateString() : '—'}</span> },
    {
      title: '', key: 'actions', fixed: 'right', width: 112,
      render: (_, r) => (
        <Space size={2}>
          <AntTooltip title="Details">
            <Button size="small" type="text" icon={<EyeOutlined />} aria-label="Details" onClick={() => setDetailModal(r)} />
          </AntTooltip>
          <AntTooltip title="Edit plan, notes, test flag">
            <Button size="small" type="text" icon={<EditOutlined />} aria-label="Edit" onClick={() => openEdit(r)} />
          </AntTooltip>
          <AntTooltip title={r.is_active ? 'Freeze' : 'Unfreeze'}>
            <Button size="small" type="text" danger={r.is_active} aria-label={r.is_active ? 'Freeze' : 'Unfreeze'}
              icon={r.is_active ? <LockOutlined /> : <UnlockOutlined />} onClick={() => confirmToggle(r)} />
          </AntTooltip>
        </Space>
      ),
    },
  ]

  const ticketColumns = [
    { title: '#', dataIndex: 'id', key: 'id', width: 55 },
    {
      title: 'Store', key: 'store', width: 140,
      render: (_, r) => (
        <div>
          <Text strong style={{ fontSize: 12 }}>{r.store_name}</Text>
          <div><Text code style={{ fontSize: 11 }}>{r.store_code}</Text></div>
        </div>
      ),
    },
    { title: 'User', dataIndex: 'username', key: 'username', width: 100 },
    { title: 'Subject', dataIndex: 'subject', key: 'subject', ellipsis: true,
      render: (v, r) => <span>{r.category && <Tag style={{ marginRight: 6 }}>{r.category}</Tag>}{v}{r.screenshot && ' 📎'}</span> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (v) => <Tag color={TICKET_STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Open for', key: 'age', width: 95,
      sorter: byTime('created_at'),
      render: (_, r) => {
        if (r.status === 'Resolved') return <Text type="secondary">—</Text>
        const days = (Date.now() - toDate(r.created_at)) / DAY
        return <Text type={days > 3 ? 'danger' : undefined}>{ago(r.created_at)?.replace(' ago', '')}</Text>
      } },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', width: 130,
      render: (v) => v ? toDate(v).toLocaleString() : '—' },
    {
      title: 'Action', key: 'action', width: 80,
      render: (_, r) => (
        <Button
          size="small" type="primary" icon={<MessageOutlined />}
          onClick={() => {
            setReplyModal(r)
            replyForm.setFieldsValue({ status: r.status, admin_reply: '' })
          }}
        >
          Reply
        </Button>
      ),
    },
  ]

  const KPI = [
    { label: 'Open today',             value: ov.open_today,     color: '#AD1457',
      hint: `Stores that made a bill today (${ov.bills_today ?? 0} bills)` },
    { label: 'Sales today',            value: inrShort(ov.sales_today), color: '#00695C',
      hint: `Today’s sales across open stores: ${inr(ov.sales_today)}` },
    { label: 'Stores',                 value: ov.total_stores,   color: '#1A237E',
      hint: ov.test_stores ? `${ov.test_stores} test stores not counted` : 'Real stores' },
    { label: `Active (${activeDays}d)`, value: ov.active_stores,  color: '#2E7D32',
      hint: `Made a bill in the last ${activeDays} days` },
    { label: 'Idle 14d+',              value: ov.idle_stores,    color: '#C62828',
      hint: 'Not frozen, but no bill in 14+ days' },
    { label: 'New this week',          value: ov.new_signups_7d, color: '#00838F', hint: 'Signups in the last 7 days' },
    { label: 'First bill this week',   value: ov.first_bill_7d,  color: '#558B2F', hint: 'Stores that made their first bill in the last 7 days' },
    { label: 'Paid stores',            value: ov.paid_stores,    color: '#6A1B9A',
      hint: 'Stores on a plan other than Free' },
    { label: 'Store sales',            value: inrShort(ov.store_sales), color: '#E65100',
      hint: `What stores sold (${inr(ov.store_sales)}) — not your income` },
    { label: 'Bills',                  value: ov.total_bills,    color: '#5D4037', hint: 'Excludes voided bills' },
  ]

  const openTickets = tickets.filter((t) => t.status === 'Open').length
  const s = detailModal  // shorthand inside detail modal
  const dailyFilled = fillDays(daily, range)

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Super Admin Dashboard</Title>

      {/* KPI Cards */}
      <Row gutter={[12, 12]} style={{ marginBottom: 24 }}>
        {KPI.map(({ label, value, color, hint }) => (
          <Col xs={12} sm={8} md={6} xl={{ flex: '20%' }} key={label}>
            <AntTooltip title={hint}>
              <Card style={{ borderLeft: `4px solid ${color}`, borderRadius: 12, height: '100%' }}
                styles={{ body: { padding: '14px 16px' } }}>
                <Statistic
                  title={<span style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{label}</span>}
                  value={value ?? 0}
                  valueStyle={{ color, fontSize: 22, fontWeight: 700 }}
                />
              </Card>
            </AntTooltip>
          </Col>
        ))}
      </Row>

      <Tabs
        defaultActiveKey="stores"
        items={[
          {
            key: 'stores',
            label: 'Stores',
            children: (
              <>
                {/* Charts */}
                <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                  <Col xs={24} lg={14}>
                    <Card title="Daily store sales" style={{ borderRadius: 12 }}
                      extra={<Segmented size="small" value={range} onChange={setRange}
                        options={[{ label: '7d', value: 7 }, { label: '30d', value: 30 }, { label: '90d', value: 90 }]} />}>
                      {daily.length ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={dailyFilled}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={12} />
                            <YAxis tick={{ fontSize: 11 }} tickFormatter={inrShort} width={56} />
                            <Tooltip formatter={(v, name) => (name === 'revenue' ? [inr(v), 'Sales'] : [v, name])} />
                            <Bar dataKey="revenue" fill="#1A237E" radius={[3, 3, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 32 }}>No sales in the last {range} days</p>}
                    </Card>
                  </Col>
                  <Col xs={24} lg={10}>
                    <Card title="Top 10 stores by sales" style={{ borderRadius: 12 }}>
                      {byStore.length ? (
                        <ResponsiveContainer width="100%" height={240}>
                          <BarChart data={byStore} layout="vertical" margin={{ left: 8, right: 16 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={inrShort} />
                            <YAxis type="category" dataKey="store" width={110} interval={0}
                              tick={{ fontSize: 11 }} tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)} />
                            <Tooltip formatter={(v) => [inr(v), 'Sales']} />
                            <Bar dataKey="revenue" fill="#3949AB" radius={[0, 3, 3, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 32 }}>No data yet</p>}
                    </Card>
                  </Col>
                </Row>

                {/* Stores table */}
                <Card style={{ borderRadius: 12 }}>
                  <Space wrap style={{ marginBottom: 16 }}>
                    <Input placeholder="Search name / code / phone / email…" value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      prefix={<SearchOutlined />} style={{ width: 260 }} allowClear />
                    <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 190 }} prefix="Status:"
                      options={['All', 'Billed today', 'Active', 'Idle', 'Frozen'].map((v) => ({ value: v, label: v }))} />
                    <Select value={planFilter} onChange={setPlanFilter} style={{ width: 140 }} prefix="Plan:"
                      options={plans.map((p) => ({ value: p, label: p }))} />
                    <Checkbox checked={showTest} onChange={(e) => setShowTest(e.target.checked)}>
                      Show test stores{testCount ? ` (${testCount})` : ''}
                    </Checkbox>
                    <Text type="secondary">{filtered.length} of {stores.length} stores</Text>
                    <Button onClick={load}>Refresh</Button>
                    <Button icon={<DownloadOutlined />} onClick={() => downloadCsv(filtered)} disabled={!filtered.length}>
                      Export CSV
                    </Button>
                    {selected.length > 0 && (
                      <Button danger icon={<LockOutlined />} onClick={confirmBulkFreeze}>
                        Freeze {selected.length} selected
                      </Button>
                    )}
                  </Space>
                  {storesError && <Alert type="error" message={storesError} style={{ marginBottom: 12 }} showIcon />}
                  <Table
                    dataSource={filtered} columns={storeColumns} rowKey="store_code"
                    size="small" pagination={{ pageSize: 20 }} scroll={{ x: 1350 }}
                    rowSelection={{ selectedRowKeys: selected, onChange: setSelected, fixed: true }}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'support',
            label: (
              <span>
                Support Tickets
                {openTickets > 0 && (
                  <Tag color="red" style={{ marginLeft: 6, fontSize: 11 }}>{openTickets}</Tag>
                )}
              </span>
            ),
            children: (
              <Card style={{ borderRadius: 12 }}>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Select value={ticketFilter} onChange={setTicketFilter} style={{ width: 180 }} prefix="Status:">
                    {['All','Open','In Progress','Resolved'].map((v) => (
                      <Select.Option key={v} value={v}>{v}</Select.Option>
                    ))}
                  </Select>
                  <Button onClick={loadTickets}>Refresh</Button>
                  <Text type="secondary">{tickets.length} ticket(s)</Text>
                </Space>
                <Table
                  dataSource={tickets} columns={ticketColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
                  locale={{ emptyText: 'No tickets.' }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* ── Store Detail Modal ───────────────────────────────────────────── */}
      <Modal
        title={s ? `${s.store_name} — Store Details` : ''}
        open={!!detailModal}
        onCancel={() => setDetailModal(null)}
        footer={
          s && (
            <Space>
              <Button danger={s.is_active} onClick={() => confirmToggle(s, () => setDetailModal(null))}>
                {s.is_active ? 'Freeze Store' : 'Unfreeze Store'}
              </Button>
              <Button type="primary" onClick={() => { openEdit(s); setDetailModal(null) }}>
                Edit Plan / Notes
              </Button>
            </Space>
          )
        }
        width="min(600px, 96vw)"
        style={{ top: 20 }}
      >
        {s && (
          <>
            <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Store Name" span={2}>
                <Text strong style={{ fontSize: 15 }}>{s.store_name}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Store Code">
                <Text code>{s.store_code}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Owner Username">
                <Text strong>{s.owner_user}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Phone">
                {s.phone || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Email">
                {s.email || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Address" span={2}>
                {s.address || <Text type="secondary">—</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Plan">
                <Tag color="blue">{s.plan || 'Free'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={activity(s, activeDays).color}>{activity(s, activeDays).label}</Tag>
                {s.is_test && <Tag color="purple">Test</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="Signup Date">
                {s.created_at ? toDate(s.created_at).toLocaleString() : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Last Login">
                {s.last_login ? toDate(s.last_login).toLocaleString() : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Last Bill" span={2}>
                {s.last_bill_at ? `${toDate(s.last_bill_at).toLocaleString()} (${ago(s.last_bill_at)})` : 'Never'}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }}>Sales Summary</Divider>

            <Row gutter={[12, 12]}>
              {[
                { label: 'Total Bills',   value: s.bills,     color: '#E65100' },
                { label: 'Total Sales',   value: inrShort(s.revenue), color: '#1A237E' },
                { label: 'Customers',     value: s.customers, color: '#2E7D32' },
                { label: 'Products',      value: s.products,  color: '#6A1B9A' },
              ].map(({ label, value, color }) => (
                <Col xs={12} sm={6} key={label}>
                  <Card styles={{ body: { padding: '12px 14px' } }} style={{ borderRadius: 10, textAlign: 'center', borderTop: `3px solid ${color}` }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{label}</div>
                  </Card>
                </Col>
              ))}
            </Row>

            {s.notes && (
              <>
                <Divider style={{ margin: '12px 0' }}>Notes</Divider>
                <Text>{s.notes}</Text>
              </>
            )}
          </>
        )}
      </Modal>

      {/* ── Edit Plan Modal ──────────────────────────────────────────────── */}
      <Modal
        title={`Edit Store — ${planModal?.store_code}`}
        open={!!planModal} onCancel={() => setPlanModal(null)} footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handlePlanSave} style={{ marginTop: 16 }}>
          <Form.Item name="plan" label="Plan">
            <Select>
              {['Free','Basic','Pro','Enterprise'].map((p) => (
                <Select.Option key={p} value={p}>{p}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Only Super Admins see this" />
          </Form.Item>
          <Form.Item name="is_test" label="Test store" valuePropName="checked"
            extra="Test and demo stores are left out of the dashboard numbers and charts.">
            <Switch />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Save</Button>
        </Form>
      </Modal>

      {/* ── Reply Ticket Modal ───────────────────────────────────────────── */}
      <Modal
        title={`Reply to Ticket #${replyModal?.id} — ${replyModal?.subject}`}
        open={!!replyModal}
        onCancel={() => { setReplyModal(null); replyForm.resetFields() }}
        footer={null}
        width={560}
      >
        {replyModal && (
          <div style={{ marginBottom: 16, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ background: 'rgba(47,102,144,0.08)', borderRadius: 8, padding: '10px 14px' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                From {replyModal.username} ({replyModal.store_name}){replyModal.category ? ` · ${replyModal.category}` : ''}:
              </Text>
              <p style={{ margin: '4px 0 0', whiteSpace: 'pre-wrap' }}>{replyModal.message}</p>
              {replyModal.screenshot && (
                <a href={replyModal.screenshot} target="_blank" rel="noreferrer">
                  <img src={replyModal.screenshot} alt="Attached screenshot" style={{ maxWidth: '100%', maxHeight: 220, marginTop: 8, borderRadius: 6 }} />
                </a>
              )}
            </div>
            {(replyModal.messages || []).map((m) => (
              <div key={m.id} style={{ marginTop: 8, borderRadius: 8, padding: '8px 12px',
                background: m.author === 'support' ? 'rgba(30,132,73,0.1)' : 'rgba(47,102,144,0.08)' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {m.author === 'support' ? 'You (support)' : m.username} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                </Text>
                <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{m.message}</p>
              </div>
            ))}
          </div>
        )}
        <Form form={replyForm} layout="vertical" onFinish={handleReplySave}>
          <Form.Item name="status" label="Status">
            <Select>
              {['Open','In Progress','Resolved'].map((v) => (
                <Select.Option key={v} value={v}>{v}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="admin_reply" label="Reply to User">
            <TextArea rows={4} placeholder="Type your reply here…" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Send Reply</Button>
          <Button danger type="text" block style={{ marginTop: 8 }} onClick={() => Modal.confirm({
            title: `Delete ticket #${replyModal?.id}?`, content: 'Use this for test or spam tickets. This can’t be undone.',
            okText: 'Delete', okButtonProps: { danger: true },
            onOk: () => adminDeleteTicket(replyModal.id)
              .then(() => { message.success('Ticket deleted'); setReplyModal(null); replyForm.resetFields(); loadTickets() })
              .catch((err) => message.error(err.message)),
          })}>Delete ticket</Button>
        </Form>
      </Modal>
    </div>
  )
}