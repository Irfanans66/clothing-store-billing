import React, { useState, useEffect } from 'react'
import { Card, Table, Button, Space, Tag, Typography, Modal, Form, Input, Select, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { getTeam, createTeamUser, toggleTeamUser, changeTeamPassword } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n'

const { Title } = Typography
const ROLES = ['Admin','Manager','Cashier','Viewer']

export default function Team() {
  const t = useT()
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
    return <Card><Title level={4}>{t('Access Denied')}</Title></Card>
  }

  async function handleAdd(values) {
    try {
      await createTeamUser(values); message.success(t('User created!'))
      setAddModal(false); addForm.resetFields(); load()
    } catch (err) { message.error(err.message) }
  }

  async function handleChangePw(values) {
    try {
      await changeTeamPassword(pwModal, values); message.success(t('Password updated!'))
      setPwModal(null); pwForm.resetFields()
    } catch (err) { message.error(err.message) }
  }

  const columns = [
    { title: t('Username'), dataIndex: 'username', key: 'username', render: (v) => <strong>{v}</strong> },
    { title: t('Full Name'), dataIndex: 'full_name', key: 'full_name' },
    { title: t('Role'), dataIndex: 'role', key: 'role',
      render: (v) => {
        const colors = { Admin: 'blue', Manager: 'green', Cashier: 'orange', Viewer: 'default' }
        return <Tag color={colors[v] || 'default'}>{t(v)}</Tag>
      }},
    { title: t('Status'), dataIndex: 'is_active', key: 'is_active',
      render: (v) => <Tag color={v ? 'green' : 'red'}>{v ? t('Active') : t('Inactive')}</Tag> },
    { title: t('Actions'), key: 'actions',
      render: (_, r) => (
        <Space>
          <Button size="small" onClick={() => toggleTeamUser(r.username).then(load).catch((e) => message.error(e.message))}>
            {r.is_active ? t('Deactivate') : t('Activate')}
          </Button>
          <Button size="small" onClick={() => { setPwModal(r.username); pwForm.resetFields() }}>
            {t('Change PW')}
          </Button>
        </Space>
      )},
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>👥 {t('Team Management')}</Title>
      <Card style={{ borderRadius: 12 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModal(true)} style={{ marginBottom: 16 }}>
          {t('Add Team Member')}
        </Button>
        <Table
          dataSource={team} columns={columns} rowKey="username"
          loading={loading} size="middle" pagination={false}
        />
      </Card>

      <Modal title={t('Add Team Member')} open={addModal} onCancel={() => setAddModal(false)} footer={null}>
        <Form form={addForm} layout="vertical" onFinish={handleAdd} style={{ marginTop: 16 }}>
          <Form.Item name="username" label={`${t('Username')} *`} rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="full_name" label={t('Full Name')}><Input /></Form.Item>
          <Form.Item name="password" label={`${t('Password')} *`} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label={t('Role')} initialValue="Cashier">
            <Select>{ROLES.map((r) => <Select.Option key={r} value={r}>{t(r)}</Select.Option>)}</Select>
          </Form.Item>
          <Button type="primary" htmlType="submit" block>{t('Create User')}</Button>
        </Form>
      </Modal>

      <Modal title={t('Change Password — {name}', { name: pwModal })} open={!!pwModal} onCancel={() => setPwModal(null)} footer={null}>
        <Form form={pwForm} layout="vertical" onFinish={handleChangePw} style={{ marginTop: 16 }}>
          <Form.Item name="new_password" label={`${t('New Password')} *`} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="confirm_password" label={`${t('Confirm Password')} *`} rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>{t('Update Password')}</Button>
        </Form>
      </Modal>
    </div>
  )
}