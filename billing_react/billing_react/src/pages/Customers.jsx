import React, { useState, useEffect, useRef } from 'react'
import { Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col,
  Select, message, Statistic, InputNumber, Alert, Grid } from 'antd'
import { SearchOutlined, UserAddOutlined, EyeOutlined, WhatsAppOutlined, DollarOutlined, PhoneOutlined } from '@ant-design/icons'
import { getCustomers, createCustomer, updateCustomer, recordCreditPayment } from '../api/client'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography
const { useBreakpoint } = Grid
const MEMBER_TYPES = ['Regular', 'Silver', 'Gold', 'Platinum']
const MEMBER_COLORS = { Gold: 'gold', Platinum: 'purple', Silver: 'default', Regular: 'blue' }
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Net Banking']

export default function Customers() {
  const [customers, setCustomers]     = useState([])
  const [loading, setLoading]         = useState(false)
  const [search, setSearch]           = useState('')
  const [addModal, setAddModal]       = useState(false)
  const [editModal, setEditModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [payModal, setPayModal]       = useState(false)
  const [payTarget, setPayTarget]     = useState(null)
  const [payAmount, setPayAmount]     = useState(0)
  const [payMode, setPayMode]         = useState('Cash')
  const [payLoading, setPayLoading]   = useState(false)
  const [addForm]  = Form.useForm()
  const [editForm] = Form.useForm()
  const debounceRef = useRef(null)
  const navigate = useNavigate()
  const { storeName } = useAuthStore()
  const screens  = useBreakpoint()
  const isMobile = !screens.md

  async function load(q = '') {
    setLoading(true)
    try {
      const res = await getCustomers(q ? { search: q } : {})
      setCustomers(res || [])
    } catch { setCustomers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  function onSearchChange(e) {
    const val = e.target.value
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(val), 300)
  }

  async function handleAdd(values) {
    try {
      await createCustomer(values)
      message.success('Customer added!')
      setAddModal(false); addForm.resetFields(); load(search)
    } catch (err) { message.error(err.message) }
  }

  async function handleEdit(values) {
    try {
      await updateCustomer(editTarget.customer_id, values)
      message.success('Customer updated!')
      setEditModal(false); load(search)
    } catch (err) { message.error(err.message) }
  }

  async function handleRecordPayment() {
    if (!payAmount || payAmount <= 0) { message.error('Enter a valid amount'); return }
    setPayLoading(true)
    try {
      await recordCreditPayment(payTarget.customer_id, payAmount, payMode)
      message.success(`₹${payAmount} payment recorded for ${payTarget.name}`)
      setPayModal(false); setPayTarget(null); setPayAmount(0)
      load(search)
    } catch (err) { message.error(err.message) }
    finally { setPayLoading(false) }
  }

  function openPayModal(cust) {
    setPayTarget(cust)
    setPayAmount(Math.round(cust.credit_balance))
    setPayMode('Cash')
    setPayModal(true)
  }

  function sendWhatsAppReminder(cust) {
    if (!cust.phone) { message.warning('No phone number for this customer'); return }
    const phone = cust.phone.replace(/\D/g, '')
    const due = Math.round(cust.credit_balance).toLocaleString()
    const msg =
      `Dear ${cust.name},\n\n` +
      `This is a reminder from *${storeName || 'our store'}*.\n\n` +
      `You have an outstanding balance of *₹${due}* on your account.\n\n` +
      `Kindly visit us or make the payment at your earliest convenience.\n\n` +
      `Thank you! 🙏`
    const url = `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  // summary stats
  const totalCustomers   = customers.length
  const totalOutstanding = customers.reduce((s, c) => s + (c.credit_balance || 0), 0)
  const withDues         = customers.filter(c => c.credit_balance > 0).length

  const columns = [
    { title: 'ID', dataIndex: 'customer_id', key: 'customer_id', width: 80 },
    {
      title: 'Name', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => { setEditTarget(r); editForm.setFieldsValue(r); setEditModal(true) }}>
          {v}
        </Button>
      ),
    },
    { title: 'Phone', dataIndex: 'phone', key: 'phone', width: 120 },
    { title: 'City', dataIndex: 'city', key: 'city', width: 90 },
    {
      title: 'Type', dataIndex: 'member_type', key: 'member_type', width: 90,
      render: (v) => <Tag color={MEMBER_COLORS[v] || 'blue'}>{v}</Tag>,
    },
    {
      title: 'Total Purchase', dataIndex: 'total_purchase', key: 'total_purchase', width: 120,
      render: (v) => <Text strong>₹{Math.round(v || 0).toLocaleString()}</Text>,
      sorter: (a, b) => (a.total_purchase || 0) - (b.total_purchase || 0),
    },
    {
      title: 'Outstanding', dataIndex: 'credit_balance', key: 'credit_balance', width: 110,
      render: (v) => v > 0
        ? <Tag color="red">₹{Math.round(v).toLocaleString()}</Tag>
        : <Tag color="green">Clear</Tag>,
      sorter: (a, b) => (a.credit_balance || 0) - (b.credit_balance || 0),
    },
    {
      title: 'Actions', key: 'action', width: 180,
      render: (_, r) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(r.name)}`)}>
            Bills
          </Button>
          {r.credit_balance > 0 && <>
            <Button size="small" type="primary" icon={<DollarOutlined />}
              onClick={() => openPayModal(r)}>
              Pay
            </Button>
            <Button size="small" style={{ background: '#25D366', borderColor: '#25D366', color: '#fff' }}
              icon={<WhatsAppOutlined />}
              onClick={() => sendWhatsAppReminder(r)}>
              Remind
            </Button>
          </>}
        </Space>
      ),
    },
  ]

  const CustomerForm = ({ form, onFinish }) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="name" label="Full Name" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="phone" label="Phone" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
        <Col span={12}>
          <Form.Item name="member_type" label="Member Type" initialValue="Regular">
            <Select>{MEMBER_TYPES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}</Select>
          </Form.Item>
        </Col>
        <Col span={24}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="pincode" label="Pincode"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="gst_no" label="GST No."><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="notes" label="Notes"><Input /></Form.Item></Col>
      </Row>
      <Button type="primary" htmlType="submit" block>Save</Button>
    </Form>
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>👤 Customers</Title>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddModal(true)}>
          {isMobile ? 'Add' : 'Add Customer'}
        </Button>
      </div>

      {/* Summary strip */}
      <Row gutter={8} style={{ marginBottom: 12 }}>
        {[
          { label: 'Total', value: totalCustomers, color: undefined },
          { label: 'Outstanding', value: `₹${Math.round(totalOutstanding).toLocaleString()}`, color: totalOutstanding > 0 ? '#ff7875' : '#95de64' },
          { label: 'With Dues', value: withDues, color: withDues > 0 ? '#ffc069' : '#95de64' },
        ].map(({ label, value, color }) => (
          <Col xs={8} key={label}>
            <div style={{ background: 'rgba(18,10,3,0.55)', border: '1px solid rgba(201,168,76,0.18)', borderRadius: 10, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 2 }}>{label}</div>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 16 : 20, color: color || 'rgba(255,255,255,0.9)' }}>{value}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Search */}
      <div style={{ marginBottom: 12 }}>
        <Input
          placeholder="Search by name, phone, or ID..."
          value={search} onChange={onSearchChange}
          prefix={<SearchOutlined />}
          allowClear onClear={() => { setSearch(''); load('') }}
        />
      </div>

      <Text type="secondary" style={{ marginBottom: 8, display: 'block', fontSize: 12 }}>
        {customers.length} customer(s) found
      </Text>

      {/* Mobile: cards | Desktop: table */}
      {isMobile ? (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><span>Loading…</span></div>
        ) : customers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 48, color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
            No customers found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {customers.map((c) => (
              <div
                key={c.customer_id}
                style={{
                  background: 'rgba(18,10,3,0.6)',
                  backdropFilter: 'blur(14px)',
                  border: '1px solid rgba(201,168,76,0.18)',
                  borderRadius: 14,
                  padding: '14px 16px',
                }}
              >
                {/* Name + membership */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <button
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontSize: 15, color: '#C9A84C', textAlign: 'left' }}
                    onClick={() => { setEditTarget(c); editForm.setFieldsValue(c); setEditModal(true) }}
                  >
                    {c.name}
                  </button>
                  <Tag color={MEMBER_COLORS[c.member_type] || 'blue'} style={{ margin: 0, fontSize: 10 }}>{c.member_type}</Tag>
                </div>
                {/* Phone */}
                {c.phone && (
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginBottom: 6 }}>
                    <PhoneOutlined style={{ marginRight: 5 }} />{c.phone}
                    {c.city && <span style={{ marginLeft: 8, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.city}</span>}
                  </div>
                )}
                {/* Amounts */}
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '4px 10px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 1 }}>Purchased</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#95de64' }}>₹{Math.round(c.total_purchase || 0).toLocaleString()}</div>
                  </div>
                  <div style={{ background: c.credit_balance > 0 ? 'rgba(255,77,79,0.12)' : 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '4px 10px', flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginBottom: 1 }}>Outstanding</div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: c.credit_balance > 0 ? '#ff7875' : '#95de64' }}>
                      {c.credit_balance > 0 ? `₹${Math.round(c.credit_balance).toLocaleString()}` : 'Clear'}
                    </div>
                  </div>
                </div>
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="small" icon={<EyeOutlined />} style={{ flex: 1 }}
                    onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(c.name)}`)}>
                    Bills
                  </Button>
                  {c.credit_balance > 0 && (
                    <>
                      <Button size="small" type="primary" icon={<DollarOutlined />} style={{ flex: 1 }}
                        onClick={() => openPayModal(c)}>Pay</Button>
                      <Button size="small"
                        style={{ background: '#25D366', borderColor: '#25D366', color: '#fff', flex: 1 }}
                        icon={<WhatsAppOutlined />}
                        onClick={() => sendWhatsAppReminder(c)}>Remind</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card style={{ borderRadius: 12 }}>
          <Table
            dataSource={customers} columns={columns} rowKey="customer_id"
            loading={loading} size="middle"
            pagination={{ pageSize: 20, showSizeChanger: true }}
            scroll={{ x: 1000 }}
          />
        </Card>
      )}

      {/* Add Customer Modal */}
      <Modal title="Add Customer" open={addModal} onCancel={() => setAddModal(false)} footer={null} width={560}>
        <CustomerForm form={addForm} onFinish={handleAdd} />
      </Modal>

      {/* Edit Customer Modal */}
      <Modal title="Edit Customer" open={editModal} onCancel={() => setEditModal(false)} footer={null} width={560}>
        <CustomerForm form={editForm} onFinish={handleEdit} />
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        title={`💰 Record Payment — ${payTarget?.name}`}
        open={payModal}
        onCancel={() => setPayModal(false)}
        onOk={handleRecordPayment}
        okText="Record Payment"
        okButtonProps={{ loading: payLoading }}
        width={420}
      >
        {payTarget && (
          <div>
            <Alert
              type="warning" showIcon style={{ marginBottom: 16 }}
              message={`Outstanding balance: ₹${Math.round(payTarget.credit_balance).toLocaleString()}`}
            />
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Text strong>Amount Received (₹)</Text>
                <InputNumber
                  style={{ width: '100%', marginTop: 6 }}
                  min={1} max={Math.round(payTarget.credit_balance)}
                  value={payAmount} onChange={setPayAmount}
                  size="large"
                />
              </div>
              <div>
                <Text strong>Payment Mode</Text>
                <Select value={payMode} onChange={setPayMode} style={{ width: '100%', marginTop: 6 }} size="large">
                  {PAYMENT_MODES.map(m => <Select.Option key={m} value={m}>{m}</Select.Option>)}
                </Select>
              </div>
            </Space>
          </div>
        )}
      </Modal>
    </div>
  )
}