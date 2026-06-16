import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Statistic, Table, Input, Select, Button,
  Typography, Tag, Space, Modal, Form, message, Tabs, Descriptions, Divider,
} from 'antd'
import { SearchOutlined, MessageOutlined, EyeOutlined } from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  adminOverview, adminListStores, adminToggleStore,
  adminUpdateStore, adminDailyRevenue, adminRevenueByStore,
  adminListTickets, adminReplyTicket,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography
const { TextArea } = Input

const TICKET_STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }

export default function SuperAdmin() {
  const { role } = useAuthStore()
  const [ov, setOv]               = useState({})
  const [stores, setStores]       = useState([])
  const [daily, setDaily]         = useState([])
  const [byStore, setByStore]     = useState([])
  const [tickets, setTickets]     = useState([])
  const [ticketFilter, setTicketFilter] = useState('All')
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [planFilter, setPlanFilter]     = useState('All')
  const [planModal, setPlanModal]       = useState(null)
  const [detailModal, setDetailModal]   = useState(null)
  const [replyModal, setReplyModal]     = useState(null)
  const [form] = Form.useForm()
  const [replyForm] = Form.useForm()

  if (role !== 'SuperAdmin') {
    return <Card><Title level={4}>Access Denied</Title></Card>
  }

  async function load() {
    adminOverview().then(setOv).catch(() => {})
    adminListStores().then(setStores).catch(() => {})
    adminDailyRevenue().then(setDaily).catch(() => {})
    adminRevenueByStore().then(setByStore).catch(() => {})
  }

  async function loadTickets() {
    const s = ticketFilter !== 'All' ? ticketFilter : undefined
    adminListTickets(s).then(setTickets).catch(() => {})
  }

  useEffect(() => { load() }, [])
  useEffect(() => { loadTickets() }, [ticketFilter])

  async function handleToggle(code) {
    try { await adminToggleStore(code); load() }
    catch (err) { message.error(err.message) }
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

  const filtered = stores.filter((s) => {
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
    if (statusFilter === 'Active' && !s.is_active) return false
    if (statusFilter === 'Frozen' && s.is_active) return false
    if (planFilter !== 'All' && s.plan !== planFilter) return false
    return true
  })

  const plans = ['All', ...new Set(stores.map((s) => s.plan || 'Free'))]

  const storeColumns = [
    {
      title: 'Store Name', key: 'store_name',
      render: (_, r) => (
        <div>
          <Text strong>{r.store_name}</Text>
          <div><Text code style={{ fontSize: 11 }}>{r.store_code}</Text></div>
        </div>
      ),
    },
    { title: 'Owner', dataIndex: 'owner_user', key: 'owner_user', width: 110 },
    {
      title: 'Contact', key: 'contact',
      render: (_, r) => (
        <div style={{ fontSize: 12 }}>
          {r.phone && <div>📞 {r.phone}</div>}
          {r.email && <div style={{ color: '#666' }}>✉ {r.email}</div>}
          {!r.phone && !r.email && <Text type="secondary">—</Text>}
        </div>
      ),
    },
    { title: 'Plan', dataIndex: 'plan', key: 'plan', width: 80,
      render: (v) => <Tag color="blue">{v || 'Free'}</Tag> },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active', width: 80,
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Frozen'}</Tag> },
    { title: 'Revenue', dataIndex: 'revenue', key: 'revenue', width: 110,
      render: (v) => <Text strong style={{ color: '#1A237E' }}>₹{Math.round(v || 0).toLocaleString()}</Text> },
    { title: 'Bills', dataIndex: 'bills', key: 'bills', width: 60 },
    { title: 'Signup', dataIndex: 'created_at', key: 'created_at', width: 100,
      render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
    {
      title: 'Actions', key: 'actions', width: 180,
      render: (_, r) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetailModal(r)}>
            Details
          </Button>
          <Button size="small" onClick={() => {
            setPlanModal(r)
            form.setFieldsValue({ plan: r.plan, notes: r.notes || '' })
          }}>
            Edit
          </Button>
          <Button size="small" danger={r.is_active} onClick={() => handleToggle(r.store_code)}>
            {r.is_active ? 'Freeze' : 'Unfreeze'}
          </Button>
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
    { title: 'Subject', dataIndex: 'subject', key: 'subject', ellipsis: true },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 110,
      render: (v) => <Tag color={TICKET_STATUS_COLOR[v] || 'default'}>{v}</Tag> },
    { title: 'Date', dataIndex: 'created_at', key: 'created_at', width: 130,
      render: (v) => v ? new Date(v).toLocaleString() : '—' },
    {
      title: 'Action', key: 'action', width: 80,
      render: (_, r) => (
        <Button
          size="small" type="primary" icon={<MessageOutlined />}
          onClick={() => {
            setReplyModal(r)
            replyForm.setFieldsValue({ status: r.status, admin_reply: r.admin_reply || '' })
          }}
        >
          Reply
        </Button>
      ),
    },
  ]

  const KPI = [
    { label: 'Total Stores',     key: 'total_stores',   color: '#1A237E' },
    { label: 'Active',           key: 'active_stores',  color: '#2E7D32' },
    { label: 'Frozen',           key: 'inactive_stores',color: '#C62828' },
    { label: 'Total Bills',      key: 'total_bills',    color: '#E65100' },
    { label: 'Platform Revenue', key: 'total_revenue',  color: '#6A1B9A',
      fmt: (v) => `₹${Math.round(v || 0).toLocaleString()}` },
  ]

  const openTickets = tickets.filter((t) => t.status === 'Open').length
  const s = detailModal  // shorthand inside detail modal

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>Super Admin Dashboard</Title>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {KPI.map(({ label, key, color, fmt }) => (
          <Col xs={24} sm={12} md={8} lg={4} key={key}>
            <Card style={{ borderLeft: `4px solid ${color}`, borderRadius: 12 }}
              styles={{ body: { padding: '16px 20px' } }}>
              <Statistic
                title={<span style={{ fontSize: 13 }}>{label}</span>}
                value={fmt ? fmt(ov[key]) : ov[key] ?? 0}
                valueStyle={{ color, fontSize: 22, fontWeight: 700 }}
              />
            </Card>
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
                  <Col xs={24} md={12}>
                    <Card title="Daily Revenue (₹)" style={{ borderRadius: 12 }}>
                      {daily.length ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={daily}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                            <Bar dataKey="revenue" fill="#1A237E" />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 32 }}>No data yet</p>}
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="Revenue by Store" style={{ borderRadius: 12 }}>
                      {byStore.length ? (
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={byStore}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="store" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                            <Bar dataKey="revenue" fill="#3949AB" />
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
                      prefix={<SearchOutlined />} style={{ width: 260 }} />
                    <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}>
                      {['All','Active','Frozen'].map((v) => <Select.Option key={v} value={v}>{v}</Select.Option>)}
                    </Select>
                    <Select value={planFilter} onChange={setPlanFilter} style={{ width: 120 }}>
                      {plans.map((p) => <Select.Option key={p} value={p}>{p}</Select.Option>)}
                    </Select>
                    <Text type="secondary">{filtered.length} of {stores.length} stores</Text>
                  </Space>
                  <Table
                    dataSource={filtered} columns={storeColumns} rowKey="store_code"
                    size="small" pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
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
                  <Select value={ticketFilter} onChange={setTicketFilter} style={{ width: 160 }}>
                    {['All','Open','In Progress','Resolved'].map((v) => (
                      <Select.Option key={v} value={v}>{v}</Select.Option>
                    ))}
                  </Select>
                  <Button onClick={loadTickets}>Refresh</Button>
                  <Text type="secondary">{tickets.length} ticket(s)</Text>
                </Space>
                <Table
                  dataSource={tickets} columns={ticketColumns} rowKey="id"
                  size="small" pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
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
              <Button danger={s.is_active} onClick={() => { handleToggle(s.store_code); setDetailModal(null) }}>
                {s.is_active ? 'Freeze Store' : 'Unfreeze Store'}
              </Button>
              <Button type="primary" onClick={() => {
                setPlanModal(s)
                form.setFieldsValue({ plan: s.plan, notes: s.notes || '' })
                setDetailModal(null)
              }}>
                Edit Plan / Notes
              </Button>
            </Space>
          )
        }
        width={600}
      >
        {s && (
          <>
            <Descriptions bordered size="small" column={2} style={{ marginBottom: 16 }}>
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
                <Tag color={s.is_active ? 'green' : 'red'}>{s.is_active ? 'Active' : 'Frozen'}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Signup Date">
                {s.created_at ? new Date(s.created_at).toLocaleString() : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Last Login">
                {s.last_login ? new Date(s.last_login).toLocaleString() : '—'}
              </Descriptions.Item>
            </Descriptions>

            <Divider style={{ margin: '12px 0' }}>Sales Summary</Divider>

            <Row gutter={16}>
              {[
                { label: 'Total Bills',   value: s.bills,     color: '#E65100' },
                { label: 'Total Revenue', value: `₹${Math.round(s.revenue || 0).toLocaleString()}`, color: '#1A237E' },
                { label: 'Customers',     value: s.customers, color: '#2E7D32' },
                { label: 'Products',      value: s.products,  color: '#6A1B9A' },
              ].map(({ label, value, color }) => (
                <Col span={6} key={label}>
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
            <Input.TextArea rows={3} />
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
          <div style={{ marginBottom: 16, background: '#f5f5f5', borderRadius: 8, padding: '10px 14px' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              From {replyModal.username} ({replyModal.store_name}):
            </Text>
            <p style={{ margin: '4px 0 0' }}>{replyModal.message}</p>
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
        </Form>
      </Modal>
    </div>
  )
}