import React, { useState, useEffect, useRef } from 'react'
import { Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col,
  Select, message, InputNumber, Alert, Grid, Segmented, Tooltip } from 'antd'
import { SearchOutlined, UserAddOutlined, EyeOutlined, WhatsAppOutlined, DollarOutlined, PhoneOutlined, GiftOutlined, TeamOutlined, WalletOutlined, WarningOutlined } from '@ant-design/icons'
import { getCustomers, createCustomer, updateCustomer, recordCreditPayment, getLoyaltyProgram, resendWalletLink } from '../api/client'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useCurrency } from '../utils/currency'
import { normalizeIndianMobile, whatsappNumber, indianMobileRule } from '../utils/phone'

const { Title, Text } = Typography
const { useBreakpoint } = Grid
const MEMBER_TYPES = ['Regular', 'Silver', 'Gold', 'Platinum']
const MEMBER_COLORS = { Gold: 'gold', Platinum: 'purple', Silver: 'default', Regular: 'blue' }
const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Net Banking']

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const BAD     = '#C0392B'

const CSS = `
.cu-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.cu-stat { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 12px 16px; text-align: left; border: none; font-family: inherit; }
button.cu-stat { cursor: pointer; }
button.cu-stat:hover { transform: translateY(-1px); }
.cu-stat-on { box-shadow: var(--neu-inset); }
.cu-card { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 14px; }
.cu-tools { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
.cu-tools .ant-segmented-item-selected { background: ${PRIMARY} !important; color: #fff !important; }
.cu-tools .ant-segmented-item:not(.ant-segmented-item-selected) { color: ${TEXT}; }
@media (max-width: 767px) {
  .cu-strip { gap: 8px; }
  .cu-stat { padding: 10px 12px; }
  .cu-tools { flex-direction: column; align-items: stretch; }
}
`

export default function Customers() {
  const [customers, setCustomers]     = useState([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')
  const [searchParams]                = useSearchParams()
  const [addModal, setAddModal]       = useState(searchParams.get('add') === '1')
  const [editModal, setEditModal]     = useState(false)
  const [editTarget, setEditTarget]   = useState(null)
  const [payModal, setPayModal]       = useState(false)
  const [payTarget, setPayTarget]     = useState(null)
  const [payAmount, setPayAmount]     = useState(0)
  const [payMode, setPayMode]         = useState('Cash')
  const [payLoading, setPayLoading]   = useState(false)
  const [addForm]  = Form.useForm()
  const [editForm] = Form.useForm()
  const [loyaltyProgram, setLoyaltyProgram] = useState(null)
  const debounceRef = useRef(null)
  const navigate = useNavigate()
  const { storeName, country } = useAuthStore()
  const india = (country || 'India') === 'India'
  const [duesOnly, setDuesOnly] = useState(searchParams.get('dues') === '1')
  const screens  = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()

  useEffect(() => { getLoyaltyProgram().then(setLoyaltyProgram).catch(() => {}) }, [])

  async function handleResendWallet(cust) {
    try {
      const res = await resendWalletLink(cust.customer_id)
      if (res?.wallet_link) {
        const phone = whatsappNumber(cust.phone)
        const msg = `Hi ${cust.name}! 🎁 Add your ${storeName} loyalty card to Google Wallet:\n${res.wallet_link}`
        const url = phone
          ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
          : null
        if (url) window.open(url, '_blank')
        else message.success('Wallet link generated — no phone on file to send.')
      }
    } catch (err) {
      message.error(err.message || 'Google Wallet not configured yet')
    }
  }

  async function load(q = '') {
    setLoading(true)
    try {
      const res = await getCustomers(q ? { search: q } : {})
      setCustomers(res || [])
    } catch { setCustomers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    getCustomers({})
      .then((res) => setCustomers(res || []))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false))
  }, [])

  function onSearchChange(e) {
    const val = e.target.value
    setSearch(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(val), 300)
  }

  const withCleanPhone = (values) => (india && normalizeIndianMobile(values.phone)
    ? { ...values, phone: normalizeIndianMobile(values.phone) } : values)

  async function handleAdd(values) {
    try {
      await createCustomer(withCleanPhone(values))
      message.success('Customer added!')
      setAddModal(false); addForm.resetFields(); load(search)
    } catch (err) { message.error(err.message) }
  }

  async function handleEdit(values) {
    try {
      await updateCustomer(editTarget.customer_id, withCleanPhone(values))
      message.success('Customer updated!')
      setEditModal(false); load(search)
    } catch (err) { message.error(err.message) }
  }

  async function handleRecordPayment() {
    if (!payAmount || payAmount <= 0) { message.error('Enter a valid amount'); return }
    setPayLoading(true)
    try {
      await recordCreditPayment(payTarget.customer_id, payAmount, payMode)
      message.success(`${sym}${payAmount} payment recorded for ${payTarget.name}`)
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
    const due = Math.round(cust.credit_balance).toLocaleString()
    const msg =
      `Dear ${cust.name},\n\n` +
      `This is a reminder from *${storeName || 'our store'}*.\n\n` +
      `You have an outstanding balance of *${sym}${due}* on your account.\n\n` +
      `Kindly visit us or make the payment at your earliest convenience.\n\n` +
      `Thank you! 🙏`
    const url = `https://wa.me/${whatsappNumber(cust.phone)}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  // summary stats
  const totalCustomers   = customers.length
  const totalOutstanding = customers.reduce((s, c) => s + (c.credit_balance || 0), 0)
  const withDues         = customers.filter(c => c.credit_balance > 0).length
  const shown            = duesOnly
    ? customers.filter(c => c.credit_balance > 0).sort((a, b) => b.credit_balance - a.credit_balance)
    : customers
  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const openEdit = (c) => { setEditTarget(c); editForm.setFieldsValue(c); setEditModal(true) }

  const columns = [
    {
      title: 'Customer', dataIndex: 'name', key: 'name',
      render: (v, r) => (
        <div>
          <a onClick={() => openEdit(r)} style={{ color: TEXT, fontWeight: 600 }}>{v}</a>
          <div style={{ fontSize: 12.5, color: SUB }}>
            {r.phone || 'No phone'}{r.city ? ` · ${r.city}` : ''} · {r.customer_id}
          </div>
        </div>
      ),
      sorter: (a, b) => a.name.localeCompare(b.name),
    },
    {
      title: 'Type', dataIndex: 'member_type', key: 'member_type', width: 100,
      render: (v) => <Tag color={MEMBER_COLORS[v] || 'blue'} style={{ margin: 0 }}>{v}</Tag>,
    },
    {
      title: 'Total spend', dataIndex: 'total_purchase', key: 'total_purchase', width: 130, align: 'right',
      render: (v) => <b style={{ color: TEXT }}>{money(v)}</b>,
      sorter: (a, b) => (a.total_purchase || 0) - (b.total_purchase || 0),
    },
    {
      title: 'Owes', dataIndex: 'credit_balance', key: 'credit_balance', width: 110, align: 'right',
      render: (v) => (v > 0 ? <b style={{ color: BAD }}>{money(v)}</b> : <span style={{ color: SUB }}>—</span>),
      sorter: (a, b) => (a.credit_balance || 0) - (b.credit_balance || 0),
    },
    ...(loyaltyProgram?.enabled ? [{
      title: 'Points', dataIndex: 'loyalty_pts', key: 'loyalty_pts', width: 90, align: 'right',
      render: (v) => <span style={{ color: TEXT }}>{v || 0}</span>,
      sorter: (a, b) => (a.loyalty_pts || 0) - (b.loyalty_pts || 0),
    }] : []),
    {
      title: '', key: 'action', width: 250, align: 'right',
      render: (_, r) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />}
            onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(r.name)}`)}>
            Bills
          </Button>
          {r.credit_balance > 0 && <>
            <Button size="small" type="primary" icon={<DollarOutlined />} onClick={() => openPayModal(r)}>
              Record payment
            </Button>
            <Tooltip title="Send a payment reminder on WhatsApp">
              <Button size="small" icon={<WhatsAppOutlined />} style={{ color: '#128C4B' }}
                onClick={() => sendWhatsAppReminder(r)} aria-label={`Remind ${r.name} on WhatsApp`} />
            </Tooltip>
          </>}
          {loyaltyProgram?.enabled && loyaltyProgram?.wallet_configured && (
            <Tooltip title="Send Google Wallet loyalty card link via WhatsApp">
              <Button size="small" icon={<GiftOutlined />} onClick={() => handleResendWallet(r)} aria-label="Send wallet card" />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ]

  const customerForm = (form, onFinish) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={12}>
        <Col xs={24} sm={12}><Form.Item name="name" label="Full name" rules={[{ required: true, message: 'Enter the customer name' }]}><Input /></Form.Item></Col>
        <Col xs={24} sm={12}>
          <Form.Item name="phone" label="Mobile number" rules={[{ required: true, message: 'Enter the mobile number' }, ...(india ? [indianMobileRule] : [])]}>
            <Input type="tel" inputMode="numeric" maxLength={16} placeholder={india ? '98765 43210' : ''} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}><Form.Item name="email" label="Email"><Input type="email" /></Form.Item></Col>
        <Col xs={24} sm={12}>
          <Form.Item name="member_type" label="Member Type" initialValue="Regular">
            <Select>{MEMBER_TYPES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}</Select>
          </Form.Item>
        </Col>
        <Col span={24}><Form.Item name="address" label="Address"><Input /></Form.Item></Col>
        <Col xs={24} sm={8}><Form.Item name="city" label="City"><Input /></Form.Item></Col>
        <Col xs={12} sm={8}><Form.Item name="state" label="State"><Input /></Form.Item></Col>
        <Col xs={12} sm={8}><Form.Item name="pincode" label="Pincode"><Input inputMode="numeric" maxLength={6} /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="gst_no" label="GSTIN"><Input /></Form.Item></Col>
        <Col xs={24} sm={12}><Form.Item name="notes" label="Notes"><Input /></Form.Item></Col>
      </Row>
      <Button type="primary" htmlType="submit" block size="large">Save customer</Button>
    </Form>
  )

  return (
    <div>
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>Customers</Title>
        <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddModal(true)}>
          {isMobile ? 'Add' : 'Add customer'}
        </Button>
      </div>

      {/* Summary */}
      <div className="cu-strip">
        <div className="cu-stat">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: SUB, fontWeight: 600 }}>
            Customers <TeamOutlined style={{ color: PRIMARY }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{totalCustomers}</div>
        </div>
        <button type="button" className={`cu-stat${duesOnly ? ' cu-stat-on' : ''}`} onClick={() => setDuesOnly(true)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: SUB, fontWeight: 600 }}>
            {isMobile ? 'Owed to you' : 'Customers owe you'} <WalletOutlined style={{ color: '#B9770E' }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: totalOutstanding > 0 ? BAD : TEXT }}>{money(totalOutstanding)}</div>
        </button>
        <button type="button" className={`cu-stat${duesOnly ? ' cu-stat-on' : ''}`} onClick={() => setDuesOnly(true)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: SUB, fontWeight: 600 }}>
            With dues <WarningOutlined style={{ color: withDues ? BAD : SUB }} />
          </div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{withDues}</div>
        </button>
      </div>

      {/* Search + filter */}
      <div className="cu-tools">
        <Input
          placeholder="Search by name, phone or ID"
          value={search} onChange={onSearchChange}
          prefix={<SearchOutlined />}
          allowClear onClear={() => { setSearch(''); load('') }}
          style={{ flex: 1 }}
        />
        <Segmented value={duesOnly ? 'dues' : 'all'} onChange={(v) => setDuesOnly(v === 'dues')}
          options={[{ value: 'all', label: 'All customers' }, { value: 'dues', label: `With dues (${withDues})` }]} />
      </div>

      <Text style={{ marginBottom: 8, display: 'block', fontSize: 12.5, color: SUB }}>
        {duesOnly ? `${shown.length} customer${shown.length === 1 ? '' : 's'} with dues, highest first` : `${shown.length} customer${shown.length === 1 ? '' : 's'}`}
      </Text>

      {/* Mobile: cards | Desktop: table */}
      {isMobile ? (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: SUB }}>Loading…</div>
        ) : shown.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: SUB, fontSize: 14 }}>
            {duesOnly ? 'No customers owe you money 🎉' : 'No customers found'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shown.map((c) => (
              <div key={c.customer_id} className="cu-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <a onClick={() => openEdit(c)} style={{ fontWeight: 700, fontSize: 15, color: TEXT }}>{c.name}</a>
                    <div style={{ fontSize: 12.5, color: SUB }}>
                      {c.phone ? <><PhoneOutlined style={{ marginRight: 4 }} />{c.phone}</> : 'No phone'}
                      {c.city && ` · ${c.city}`}
                    </div>
                  </div>
                  <Tag color={MEMBER_COLORS[c.member_type] || 'blue'} style={{ margin: 0 }}>{c.member_type}</Tag>
                </div>
                <div style={{ display: 'flex', gap: 16, margin: '10px 0', fontSize: 13, color: SUB }}>
                  <span>Spent <b style={{ color: TEXT }}>{money(c.total_purchase)}</b></span>
                  {c.credit_balance > 0
                    ? <span>Owes <b style={{ color: BAD }}>{money(c.credit_balance)}</b></span>
                    : <span>No dues</span>}
                  {loyaltyProgram?.enabled && <span>{c.loyalty_pts || 0} pts</span>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button size="small" icon={<EyeOutlined />} style={{ flex: 1 }}
                    onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(c.name)}`)}>
                    Bills
                  </Button>
                  {c.credit_balance > 0 && (
                    <>
                      <Button size="small" type="primary" icon={<DollarOutlined />} style={{ flex: 1 }}
                        onClick={() => openPayModal(c)}>Payment</Button>
                      <Button size="small" icon={<WhatsAppOutlined />} style={{ flex: 1, color: '#128C4B' }}
                        onClick={() => sendWhatsAppReminder(c)}>Remind</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card style={{ borderRadius: 14 }} styles={{ body: { padding: 8 } }}>
          <Table
            dataSource={shown} columns={columns} rowKey="customer_id"
            loading={loading} size="middle"
            locale={{ emptyText: duesOnly ? 'No customers owe you money 🎉' : 'No customers found' }}
            pagination={{ pageSize: 20, showSizeChanger: true, hideOnSinglePage: true }}
            scroll={{ x: 820 }}
          />
        </Card>
      )}

      {/* Add Customer Modal */}
      <Modal title="Add customer" open={addModal} onCancel={() => setAddModal(false)} footer={null} width={560}>
        {customerForm(addForm, handleAdd)}
      </Modal>

      {/* Edit Customer Modal */}
      <Modal title="Edit customer" open={editModal} onCancel={() => setEditModal(false)} footer={null} width={560}>
        {customerForm(editForm, handleEdit)}
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        title={`Record payment — ${payTarget?.name}`}
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
              message={`Outstanding balance: ${sym}${Math.round(payTarget.credit_balance).toLocaleString()}`}
            />
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <div>
                <Text strong>Amount Received ({sym})</Text>
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