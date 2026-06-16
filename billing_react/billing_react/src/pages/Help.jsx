import React, { useState, useEffect } from 'react'
import {
  Card, Form, Input, Button, Typography, Tag, Table, Space, message,
} from 'antd'
import { QuestionCircleOutlined, SendOutlined } from '@ant-design/icons'
import { submitSupportTicket, getMyTickets } from '../api/client'

const { Title, Text } = Typography
const { TextArea } = Input

const STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }

export default function Help() {
  const [form] = Form.useForm()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  async function loadTickets() {
    setLoading(true)
    try { setTickets(await getMyTickets() || []) }
    catch { setTickets([]) }
    finally { setLoading(false) }
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

  const columns = [
    {
      title: 'Subject', dataIndex: 'subject', key: 'subject',
      render: (v) => <Text strong>{v}</Text>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status', width: 120,
      render: (v) => <Tag color={STATUS_COLOR[v] || 'default'}>{v}</Tag>,
    },
    {
      title: 'Date', dataIndex: 'created_at', key: 'created_at', width: 160,
      render: (v) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: 'Reply from Admin', dataIndex: 'admin_reply', key: 'admin_reply',
      render: (v) => v
        ? <Text type="success" style={{ fontSize: 13 }}>💬 {v}</Text>
        : <Text type="secondary" style={{ fontSize: 12 }}>Pending…</Text>,
    },
  ]

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
            name="subject"
            label="Subject"
            rules={[{ required: true, message: 'Please enter a subject' }]}
          >
            <Input placeholder="e.g. Cannot add product, Receipt not printing…" maxLength={200} />
          </Form.Item>
          <Form.Item
            name="message"
            label="Message"
            rules={[{ required: true, message: 'Please describe your concern' }]}
          >
            <TextArea
              rows={5}
              placeholder="Describe your issue in detail…"
              maxLength={2000}
              showCount
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary" htmlType="submit" loading={sending}
              icon={<SendOutlined />}
            >
              Submit
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* Ticket history */}
      <Card style={{ borderRadius: 12 }}>
        <Title level={5} style={{ marginBottom: 12 }}>My Previous Tickets</Title>
        <Table
          dataSource={tickets}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 10 }}
          expandable={{
            expandedRowRender: (r) => (
              <div style={{ padding: '8px 16px' }}>
                <Text type="secondary" style={{ fontSize: 12 }}>Your message:</Text>
                <p style={{ marginTop: 4, marginBottom: 0 }}>{r.message}</p>
              </div>
            ),
          }}
          locale={{ emptyText: 'No tickets submitted yet.' }}
        />
      </Card>
    </div>
  )
}