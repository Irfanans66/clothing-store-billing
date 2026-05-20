import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getTeam, createTeamUser, toggleTeamUser, changeTeamPassword } from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title } = Typography
const ROLES = ['Admin','Manager','Cashier','Viewer']

export default function Team() {
  const { role } = useAuthStore()
  const [team, setTeam] = useState([])
  const [loading, setLoading] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [pwModal, setPwModal] = useState(null)
  const [addForm] = Form.useForm()
  const [pwForm] = Form.useForm()

  async function load() {
    setLoading(true)
    try { setTeam(await getTeam() || []) }
    catch { setTeam([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (!['Admin','Manager'].includes(role)) {
    return <Card><Title level={4}>Access Denied</Title></Card>
  }

  async function handleAdd(values) {
    try {
      await createTeamUser(values); message.success('User created!')
      setAddModal(false); addForm.resetFields(); load()
    } catch (err) { message.error(err.message) }
  }

  async function handleChangePw(values) {
    try {
      await changeTeamPassword(pwModal, values); message.success('Password updated!')
      setPwModal(null); pwForm.resetFields()
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v) => <strong>{v}</strong> },
    { title: 'Full Name', dataIndex: 'full_name', key: 'full_name' },
    { title: 'Role', dataIndex: 'role', key: 'role',
      render: (v) => {
        const colors = { Admin: 'blue', Manager: 'green', Cashier: 'orange', Viewer: 'default' }
        return <Tag color={colors[v] || 'default'}>{v}</Tag>
      }},
    { title: 'Status', dataIndex: 'is_active', key: 'is_active',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? 'Active' : 'Inactive'}</Tag> },
    { title: 'Actions', key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => toggleTeamUser(r.username).then(load).catch((e) => message.error(e.message))}>
            {r.is_active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="small" onClick={() => { setPwModal(r.username); pwForm.resetFields() }}>
            Change PW
          </Button>
        </Space>
      )},
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>👥 Team Management</Title>
      <Card style={{ borderRadius: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)} style={{ marginBottom: 16 }}>
          Add Team Member
        </Button>
        <Table
          dataSource={team} columns={columns} rowKey="username"
          loading={loading} size="middle" pagination={false}
        />
      </Card>

      <Modal title="Add Team Member" open={addModal} onCancel={() => setAddModal(false)} footer={null}>
        <Form form={addForm} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="username" label="Username *" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="full_name" label="Full Name"><Input /></Form.Item>
          <Form.Item name="password" label="Password *" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" initialValue="Cashier">
            <Select>{ROLES.map((r) => <Select.Option key={r} value={r}>{r}</Select.Option>)}</Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Create User</Button>
        </Form>
      </Modal>

      <Modal title={`Change Password — ${pwModal}`} open={!!pwModal} onCancel={() => setPwModal(null)} footer={null}>
        <Form form={pwForm} layout="vertical" onFinish={handleChangePw} style={{ marginTop: 16 }}>
          <Form.Item name="new_password" label="New Password *" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm_password" label="Confirm Password *" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>Update Password</Button>
        </Form>
      </Modal>
    </div>
  )
}