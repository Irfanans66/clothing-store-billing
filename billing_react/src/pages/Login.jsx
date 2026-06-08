import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, Tabs, message, Row, Col, Typography, Divider } from 'antd'
import { UserOutlined, LockOutlined, ShopOutlined } from '@ant-design/icons'
import { login, registerStore } from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)

  async function handleLogin(values) {
    setLoading(true)
    try {
      const res = await login(values)
      localStorage.setItem('token', res.access_token)
      setAuth({
        token: res.access_token,
        role: res.role,
        storeCode: res.store_code || '',
        storeName: res.store_name || 'Super Admin',
        username: values.username,
      })
      navigate(res.role === 'SuperAdmin' ? '/super-admin' : '/dashboard')
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(values) {
    setLoading(true)
    try {
      const res = await registerStore(values)
      message.success(res.message)
    } catch (err) {
      message.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'linear-gradient(135deg, #1A237E 0%, #3949AB 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 56 }}>🧾</div>
          <Title level={2} style={{ color: '#fff', margin: '8px 0 4px' }}>
            Local Billing
          </Title>
          <Text style={{ color: 'rgba(255,255,255,0.7)' }}>
            Billing & Inventory Management
          </Text>
        </div>

        <Card
          style={{ borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}
          styles={{ body: { padding: '32px 28px' } }}
        >
          <Tabs
            centered
            items={[
              {
                key: 'login',
                label: '🔐 Login',
                children: (
                  <Form layout="vertical" onFinish={handleLogin} style={{ marginTop: 16 }}>
                    <Form.Item name="username" rules={[{ required: true, message: 'Enter username' }]}>
                      <Input prefix={<UserOutlined />} placeholder="Username" size="large" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: 'Enter password' }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="Password" size="large" />
                    </Form.Item>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                        Login
                      </Button>
                    </Form.Item>
                    <Divider />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Default: <strong>admin / admin123</strong>
                    </Text>
                  </Form>
                ),
              },
              {
                key: 'register',
                label: '🏪 Register Store',
                children: (
                  <Form layout="vertical" onFinish={handleRegister} style={{ marginTop: 16 }}>
                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Item name="store_name" label="Store Name" rules={[{ required: true }]}>
                          <Input prefix={<ShopOutlined />} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="owner_user" label="Username" rules={[{ required: true }]}>
                          <Input prefix={<UserOutlined />} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="password" label="Password" rules={[{ required: true, min: 6 }]}>
                          <Input.Password />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="confirm_password" label="Confirm Password" rules={[{ required: true }]}>
                          <Input.Password />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item name="phone" label="Phone" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item name="address" label="Address" rules={[{ required: true }]}>
                          <Input />
                        </Form.Item>
                      </Col>
                      <Col span={24}>
                        <Form.Item name="gstin" label="GSTIN (optional)">
                          <Input />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Form.Item style={{ marginBottom: 0 }}>
                      <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                        Register Store
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}