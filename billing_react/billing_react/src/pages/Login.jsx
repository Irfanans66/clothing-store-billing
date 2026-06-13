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
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0a0118 0%, #160332 55%, #0d0225 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative blobs — logo purple & cyan */}
      <div style={{
        position: 'absolute', top: -100, left: -100,
        width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(134,59,255,0.22) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', bottom: -80, right: -80,
        width: 320, height: 320, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(71,191,255,0.16) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', top: '40%', right: -60,
        width: 220, height: 220, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(134,59,255,0.12) 0%, transparent 70%)',
        pointerEvents: 'none',
      }}/>

      <div style={{ width: '100%', maxWidth: 460, position: 'relative', zIndex: 1 }}>
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo-icon.svg" alt="Local Billing Logo"
            style={{ width: 88, height: 88, borderRadius: 20, boxShadow: '0 8px 32px rgba(124,58,237,0.5)', marginBottom: 16 }}
          />
          <Title level={2} style={{
            margin: '0 0 6px',
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 800,
            background: 'linear-gradient(90deg, #ffffff 30%, #a78bfa)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            letterSpacing: '-0.5px',
          }}>
            Local Billing
          </Title>
          <Text style={{
            color: 'rgba(255,255,255,0.55)',
            fontFamily: "'Poppins', sans-serif",
            fontSize: 13, letterSpacing: '0.5px',
          }}>
            Smart POS for Clothing Stores
          </Text>
        </div>

        <Card
          style={{
            borderRadius: 20,
            boxShadow: '0 16px 48px rgba(0,0,0,0.35), 0 0 0 1px rgba(124,58,237,0.15)',
            border: 'none',
            backdropFilter: 'blur(10px)',
          }}
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