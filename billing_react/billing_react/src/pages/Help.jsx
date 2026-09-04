import React, { useState, useEffect } from 'react'
import { Card, Form, Input, Button, Typography, Tag, Space, message } from 'antd'
import { QuestionCircleOutlined, SendOutlined } from '@ant-design/icons'
import { submitSupportTicket, getMyTickets } from '../api/client'

const { Title, Text } = Typography

const STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }
const WHATSAPP_NUMBER = '918809968819'
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`

function WhatsAppIcon({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

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

      {/* WhatsApp instant support */}
      <Card style={{ borderRadius: 12, marginBottom: 24, background: 'linear-gradient(135deg, #e7fbe9 0%, #f0fff4 100%)', border: '1.5px solid #b7eb8f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ background: '#25D366', borderRadius: '50%', width: 52, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 4px 14px rgba(37,211,102,0.4)' }}>
            <WhatsAppIcon size={28} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <Title level={5} style={{ marginBottom: 2, color: '#1a7a36' }}>Chat with us on WhatsApp</Title>
            <Text style={{ color: '#555', fontSize: 13 }}>
              Get instant help — message us directly on WhatsApp.
            </Text>
            <br />
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
              <Text strong style={{ fontSize: 15, color: '#1a7a36', letterSpacing: '0.5px', textDecoration: 'underline', cursor: 'pointer' }}>
                +91 8809968819
              </Text>
            </a>
          </div>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <Button
              type="primary"
              icon={<WhatsAppIcon size={15} />}
              style={{ background: '#25D366', borderColor: '#25D366', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Chat on WhatsApp
            </Button>
          </a>
        </div>
      </Card>

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