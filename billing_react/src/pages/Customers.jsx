import React, { useState, useEffect, useRef } from 'react'
import { Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col, Select, message, Statistic } from 'antd'
import { SearchOutlined, UserAddOutlined, EyeOutlined } from '@ant-design/icons'
import { getCustomers, createCustomer, updateCustomer } from '../api/client'
import { useNavigate } from 'react-router-dom'

const { Title, Text } = Typography
const MEMBER_TYPES = ['Regular', 'Silver', 'Gold', 'Platinum']
const MEMBER_COLORS = { Gold: 'gold', Platinum: 'purple', Silver: 'default', Regular: 'blue' }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [addModal, setAddModal]   = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [addForm]  = Form.useForm()
  const [editForm] = Form.useForm()
  const debounceRef = useRef(null)
  const navigate = useNavigate()

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

  // summary stats
  const totalCustomers  = customers.length
  const totalOutstanding = customers.reduce((s, c) => s + (c.credit_balance || 0), 0)
  const goldPlus        = customers.filter(c => c.member_type === 'Gold' || c.member_type === 'Platinum').length

  const columns = [
    { title: 'ID', dataIndex: 'customer_id', key: 'customer_id', width: 90 },
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
    { title: 'City', dataIndex: 'city', key: 'city', width: 100 },
    {
      title: 'Type', dataIndex: 'member_type', key: 'member_type', width: 100,
      render: (v) => <Tag color={MEMBER_COLORS[v] || 'blue'}>{v}</Tag>,
    },
    {
      title: 'Points', dataIndex: 'loyalty_pts', key: 'loyalty_pts', width: 75,
      render: (v) => <Text>{v || 0}</Text>,
    },
    {
      title: 'Total Purchase', dataIndex: 'total_purchase', key: 'total_purchase', width: 130,
      render: (v) => <Text strong>₹{Math.round(v || 0).toLocaleString()}</Text>,
      sorter: (a, b) => (a.total_purchase || 0) - (b.total_purchase || 0),
    },
    {
      title: 'Outstanding', dataIndex: 'credit_balance', key: 'credit_balance', width: 120,
      render: (v) => v > 0
        ? <Tag color="red">₹{Math.round(v).toLocaleString()}</Tag>
        : <Tag color="green">Clear</Tag>,
      sorter: (a, b) => (a.credit_balance || 0) - (b.credit_balance || 0),
    },
    {
      title: '', key: 'action', width: 80,
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />}
          onClick={() => navigate(`/bill-history?customer=${encodeURIComponent(r.name)}`)}>
          Bills
        </Button>
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
      <Title level={3} style={{ marginBottom: 16 }}>👤 Customers</Title>

      {/* Summary Cards */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Total Customers" value={totalCustomers} valueStyle={{ fontSize: 22 }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Outstanding" prefix="₹"
              value={Math.round(totalOutstanding).toLocaleString()}
              valueStyle={{ fontSize: 22, color: totalOutstanding > 0 ? '#cf1322' : '#3f8600' }} />
          </Card>
        </Col>
        <Col xs={8}>
          <Card size="small" style={{ borderRadius: 10, textAlign: 'center' }}>
            <Statistic title="Gold / Platinum" value={goldPlus} valueStyle={{ fontSize: 22, color: '#d48806' }} />
          </Card>
        </Col>
      </Row>

      <Card style={{ borderRadius: 12 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Input
            placeholder="Search by name, phone, or ID..."
            value={search}
            onChange={onSearchChange}
            prefix={<SearchOutlined />}
            style={{ width: 280 }}
            allowClear
            onClear={() => { setSearch(''); load('') }}
          />
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddModal(true)}>
            Add Customer
          </Button>
        </Space>

        <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
          {customers.length} customer(s) found
        </Text>

        <Table
          dataSource={customers} columns={columns} rowKey="customer_id"
          loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal title="Add Customer" open={addModal} onCancel={() => setAddModal(false)} footer={null} width={560}>
        <CustomerForm form={addForm} onFinish={handleAdd} />
      </Modal>
      <Modal title="Edit Customer" open={editModal} onCancel={() => setEditModal(false)} footer={null} width={560}>
        <CustomerForm form={editForm} onFinish={handleEdit} />
      </Modal>
    </div>
  )
}