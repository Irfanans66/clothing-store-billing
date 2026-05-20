import React, { useState, useEffect } from 'react'
import { Card, Table, Input, Button, Space, Tag, Typography, Modal, Form, Row, Col, Select, message } from 'antd'
import { SearchOutlined, UserAddOutlined } from '@ant-design/icons'
import { getCustomers, createCustomer, updateCustomer } from '../api/client'

const { Title, Text } = Typography
const MEMBER_TYPES = ['Regular','Silver','Gold','Platinum']

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [addModal, setAddModal] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [addForm] = Form.useForm()
  const [editForm] = Form.useForm()

  async function load(q = '') {
    setLoading(true)
    try {
      const res = await getCustomers(q ? { search: q } : {})
      setCustomers(res || [])
    } catch { setCustomers([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

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

  const columns = [
    { title: 'ID', dataIndex: 'customer_id', key: 'customer_id', width: 90 },
    { title: 'Name', dataIndex: 'name', key: 'name', render: (v, r) => (
      <Button type="link" size="small" onClick={() => { setEditTarget(r); editForm.setFieldsValue(r); setEditModal(true) }}>{v}</Button>
    )},
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
    { title: 'Email', dataIndex: 'email', key: 'email', ellipsis: true },
    { title: 'City', dataIndex: 'city', key: 'city' },
    { title: 'Type', dataIndex: 'member_type', key: 'member_type',
      render: (v) => {
        const colors = { Gold: 'gold', Platinum: 'purple', Silver: 'default', Regular: 'blue' }
        return <Tag color={colors[v] || 'blue'}>{v}</Tag>
      }},
    { title: 'Points', dataIndex: 'loyalty_pts', key: 'loyalty_pts', width: 70 },
    { title: 'Total ₹', dataIndex: 'total_purchase', key: 'total_purchase',
      render: (v) => `₹${Math.round(v).toLocaleString()}` },
  ]

  const CustomerForm = ({ form, onFinish }) => (
    <Form form={form} layout="vertical" onFinish={onFinish}>
      <Row gutter={12}>
        <Col span={12}><Form.Item name="name" label="Full Name *" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="phone" label="Phone *" rules={[{ required: true }]}><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="email" label="Email"><Input /></Form.Item></Col>
        <Col span={12}><Form.Item name="member_type" label="Member Type" initialValue="Regular">
          <Select>{MEMBER_TYPES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}</Select>
        </Form.Item></Col>
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
      <Card style={{ borderRadius: 12 }}>
        <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          <Space.Compact>
            <Input
              placeholder="Search by name, phone, or ID"
              value={search} onChange={(e) => setSearch(e.target.value)}
              onPressEnter={() => load(search)}
              prefix={<SearchOutlined />} style={{ width: 260 }}
            />
            <Button type="primary" onClick={() => load(search)}>Search</Button>
          </Space.Compact>
          <Button type="primary" icon={<UserAddOutlined />} onClick={() => setAddModal(true)}>
            Add Customer
          </Button>
        </Space>
        <Text type="secondary" style={{ marginBottom: 8, display: 'block' }}>
          {customers.length} customer(s)
        </Text>
        <Table
          dataSource={customers} columns={columns} rowKey="customer_id"
          loading={loading} size="middle"
          pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
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