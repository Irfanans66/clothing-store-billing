import React, { useState, useEffect } from 'react'
import {
  Card, Row, Col, Statistic, Table, Input, Select, Button,
  Typography, Tag, Space, Modal, Form, message, Tabs,
} from 'antd'
import { SearchOutlined } from '@ant-design/icons'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  adminOverview, adminListStores, adminToggleStore,
  adminUpdateStore, adminDailyRevenue, adminRevenueByStore,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography

export default function SuperAdmin() {
  const { role } = useAuthStore()
  const [ov, setOv] = useState({})
  const [stores, setStores] = useState([])
  const [daily, setDaily] = useState([])
  const [byStore, setByStore] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [planFilter, setPlanFilter] = useState('All')
  const [planModal, setPlanModal] = useState(null)
  const [form] = Form.useForm()

  if (role !== 'SuperAdmin') {
    return <Card><Title level={4}>Access Denied</Title></Card>
  }

  async function load() {
    adminOverview().then(setOv).catch(() => {})
    adminListStores().then(setStores).catch(() => {})
    adminDailyRevenue().then(setDaily).catch(() => {})
    adminRevenueByStore().then(setByStore).catch(() => {})
  }

  useEffect(() => { load() }, [])

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

  const filtered = stores.filter((s) => {
    if (search) {
      const q = search.toLowerCase()
      if (!s.store_code.toLowerCase().includes(q) && !s.store_name.toLowerCase().includes(q) && !s.owner_user.toLowerCase().includes(q)) return false
    }
    if (statusFilter === 'Active' && !s.is_active) return false
    if (statusFilter === 'Frozen' && s.is_active) return false
    if (planFilter !== 'All' && s.plan !== planFilter) return false
    return true
  })

  const plans = ['All', ...new Set(stores.map((s) => s.plan || 'Free'))]

  const columns = [
    { title: 'Store Code', dataIndex: 'store_code', key: 'store_code', render: (v) => <Text code>{v}</Text> },
    { title: 'Store Name', dataIndex: 'store_name', key: 'store_name', ellipsis: true },
    { title: 'Owner', dataIndex: 'owner_user', key: 'owner_user' },
    { title: 'Plan', dataIndex: 'plan', key: 'plan',
      render: (v) => <Tag color="blue">{v || 'Free'}</Tag> },
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Frozen'}</Tag> },
    { title: 'Bills', dataIndex: 'bills', key: 'bills' },
    { title: 'Revenue', dataIndex: 'revenue', key: 'revenue',
      render: (v) => `₹${Math.round(v || 0).toLocaleString()}` },
    { title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => { setPlanModal(r); form.setFieldsValue({ plan: r.plan, notes: r.notes || '' }) }}>
            Edit
          </Button>
          <Button size="small" danger={r.is_active} onClick={() => handleToggle(r.store_code)}>
            {r.is_active ? 'Freeze' : 'Unfreeze'}
          </Button>
        </Space>
      ),
    },
  ]

  const KPI = [
    { label: 'Total Stores', key: 'total_stores', color: '#1A237E' },
    { label: 'Active', key: 'active_stores', color: '#2E7D32' },
    { label: 'Frozen', key: 'inactive_stores', color: '#C62828' },
    { label: 'Total Bills', key: 'total_bills', color: '#E65100' },
    { label: 'Platform Revenue', key: 'total_revenue', color: '#6A1B9A',
      fmt: (v) => `₹${Math.round(v || 0).toLocaleString()}` },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>🛡️ Super Admin Dashboard</Title>

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

      <Card style={{ borderRadius: 12 }}>
        <Space wrap style={{ marginBottom: 16 }}>
          <Input placeholder="Search stores…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<SearchOutlined />} style={{ width: 240 }} />
          <Select value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }}>
            {['All','Active','Frozen'].map((s) => <Select.Option key={s} value={s}>{s}</Select.Option>)}
          </Select>
          <Select value={planFilter} onChange={setPlanFilter} style={{ width: 120 }}>
            {plans.map((p) => <Select.Option key={p} value={p}>{p}</Select.Option>)}
          </Select>
          <Text type="secondary">{filtered.length} of {stores.length} stores</Text>
        </Space>
        <Table
          dataSource={filtered} columns={columns} rowKey="store_code"
          size="middle" pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
        />
      </Card>

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
    </div>
  )
}