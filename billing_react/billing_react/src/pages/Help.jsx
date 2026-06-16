import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Tag, Space, message } from 'antd'
import { QuestionCircleOutlined, SendOutlined } from '@ant-design/icons'
import { submitSupportTicket, getMyTickets } from '../api/client'

const { Title, Text } = Typography

const STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }

export default function Help() {
  const [form] = Form.useForm()
  const [tickets, setTickets] = useState([])
  const [sending, setSending] = useState(false)

  async function loadTickets() {
    try {
      const data = await getMyTickets()
      setTickets(Array.isArray(data) ? data : [])
    } catch {
      setTickets([])
    }
  }

  useEffect(() => { loadTickets() }, [])

  async function handleSubmit(values) {
    setSending(true)
    try {
      await submitSupportTicket(values)
      message.success('Your concern has been submitted! We will get back to you soon.')
      form.resetFields()
      loadTickets()
    } catch (err) {
      message.error(err.message || 'Failed to submit. Please try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ maxWidth: 780, margin: '0 auto' }}>
      <Title level={3} style={{ marginBottom: 4 }}>
        <QuestionCircleOutlined style={{ marginRight: 8, color: '#7C3AED' }} />
        Help & Support
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
        Have a problem or question? Submit your concern below and our team will respond.
      </Text>

      {/* Submit form */}
      <Card style={{ borderRadius: 12, marginBottom: 24 }}>
        <Title level={5} style={{ marginBottom: 16 }}>Submit a Concern</Title>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="subject" label="Subject"
            rules={[{ required: true, message: 'Please enter a subject' }]}
          >
            <Input placeholder="e.g. Cannot add product, Receipt not printing…" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="message" label="Message"
            rules={[{ required: true, message: 'Please describe your concern' }]}
          >
            <Input.TextArea rows={5} placeholder="Describe your issue in detail…" maxLength={2000} showCount />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button type="primary" htmlType="submit" loading={sending} icon={<SendOutlined />}>
              Submit
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Ticket history */}
      <Card style={{ borderRadius: 12 }}>
        <Title level={5} style={{ marginBottom: 16 }}>My Previous Tickets</Title>
        {tickets.length === 0 ? (
          <Text type="secondary">No tickets submitted yet.</Text>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            {tickets.map((t) => (
              <Card key={t.id} size="small" style={{ borderRadius: 8, borderLeft: `4px solid ${STATUS_COLOR[t.status] === 'orange' ? '#fa8c16' : STATUS_COLOR[t.status] === 'blue' ? '#1677ff' : '#52c41a'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <Text strong style={{ fontSize: 14 }}>{t.subject}</Text>
                  <Tag color={STATUS_COLOR[t.status] || 'default'} style={{ marginLeft: 8, flexShrink: 0 }}>{t.status}</Tag>
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>{t.created_at ? new Date(t.created_at).toLocaleString() : ''}</Text>
                <div style={{ marginTop: 6, color: '#555', fontSize: 13 }}>{t.message}</div>
                {t.admin_reply && (
                  <div style={{ marginTop: 8, padding: '8px 12px', background: '#f0fff4', borderRadius: 6, borderLeft: '3px solid #52c41a' }}>
                    <Text style={{ fontSize: 12, color: '#888' }}>Admin reply: </Text>
                    <Text style={{ color: '#2e7d32' }}>{t.admin_reply}</Text>
                  </div>
                )}
              </Card>
            ))}
          </Space>
        )}
      </Card>
    </div>
  )
}