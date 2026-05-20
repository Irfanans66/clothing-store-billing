import React, { useState, useEffect } from 'react'
import { Card, Table, Input, Select, Button, Space, Tag, Typography, Modal, Descriptions, Divider, message } from 'antd'
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons'
import { getBills, getBill } from '../api/client'
import { printPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const PAYMENT_MODES = ['Cash','UPI','Credit Card','Debit Card','Net Banking']

export default function BillHistory() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ date: '', customer: '', payment_mode: '' })
  const [detailBill, setDetailBill] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = {}
      if (filters.date) params.date = filters.date
      if (filters.customer) params.customer = filters.customer
      if (filters.payment_mode) params.payment_mode = filters.payment_mode
      const res = await getBills(params)
      setBills(res || [])
    } catch { setBills([]) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  async function viewDetail(billNo) {
    try {
      const res = await getBill(billNo)
      setDetailBill(res); setModalOpen(true)
    } catch { }
  }

  const columns = [
    { title: 'Bill No', dataIndex: 'bill_no', key: 'bill_no',
      render: (v) => <Button type="link" size="small" onClick={() => viewDetail(v)}>{v}</Button> },
    { title: 'Date', dataIndex: 'bill_date', key: 'bill_date' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
    { title: 'Total', dataIndex: 'grand_total', key: 'grand_total',
      render: (v) => <Text strong>₹{Math.round(v).toLocaleString()}</Text> },
    { title: 'Payment', dataIndex: 'payment_mode', key: 'payment_mode',
      render: (v) => <Tag color="blue">{v}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status',
      render: (v) => <Tag color={v === 'Paid' ? 'green' : 'red'}>{v}</Tag> },
    { title: '', key: 'action',
      render: (_, rec) => (
        <Button
          size="small" icon={<PrinterOutlined />}
          onClick={async () => {
            try { await printPdfWithAuth(`/bills/${rec.bill_no}/receipt-pdf`) }
            catch (err) { message.error('PDF failed: ' + err.message) }
          }}
        >PDF</Button>
      ),
    },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>📋 Bill History</Title>

      <Card style={{ borderRadius: 12, marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Filter by date (YYYY-MM-DD)"
            value={filters.date}
            onChange={(e) => setFilters({ ...filters, date: e.target.value })}
            prefix={<SearchOutlined />} style={{ width: 200 }}
          />
          <Input
            placeholder="Filter by customer"
            value={filters.customer}
            onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
            prefix={<SearchOutlined />} style={{ width: 180 }}
          />
          <Select
            placeholder="Payment Mode" value={filters.payment_mode || undefined}
            onChange={(v) => setFilters({ ...filters, payment_mode: v })}
            allowClear style={{ width: 160 }}
          >
            {PAYMENT_MODES.map((m) => <Select.Option key={m} value={m}>{m}</Select.Option>)}
          </Select>
          <Button type="primary" onClick={load} icon={<SearchOutlined />}>Search</Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 12 }}>
        <Text type="secondary" style={{ marginBottom: 12, display: 'block' }}>
          {bills.length} record(s) found
        </Text>
        <Table
          dataSource={bills} columns={columns} rowKey="bill_no"
          loading={loading} size="middle"
          pagination={{ pageSize: 20, showSizeChanger: true }}
          scroll={{ x: 700 }}
        />
      </Card>

      <Modal
        title={`Bill Detail — ${detailBill?.bill_no}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          <Button key="pdf" type="primary" icon={<PrinterOutlined />}
            onClick={async () => {
              try { await printPdfWithAuth(`/bills/${detailBill?.bill_no}/receipt-pdf`) }
              catch (err) { message.error('PDF failed: ' + err.message) }
            }}>
            Print PDF
          </Button>,
          <Button key="close" onClick={() => setModalOpen(false)}>Close</Button>,
        ]}
        width={600}
      >
        {detailBill && (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="Bill No">{detailBill.bill_no}</Descriptions.Item>
              <Descriptions.Item label="Date">{detailBill.bill_date} {detailBill.bill_time}</Descriptions.Item>
              <Descriptions.Item label="Customer">{detailBill.customer_name}</Descriptions.Item>
              <Descriptions.Item label="Phone">{detailBill.phone || '-'}</Descriptions.Item>
              <Descriptions.Item label="Payment">{detailBill.payment_mode}</Descriptions.Item>
              <Descriptions.Item label="Status">
                <Tag color={detailBill.status === 'Paid' ? 'green' : 'red'}>{detailBill.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
            <Divider />
            <Table
              dataSource={detailBill.items} rowKey="id" size="small" pagination={false}
              columns={[
                { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 60 },
                { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 50 },
                { title: 'Price', dataIndex: 'selling_price', key: 'selling_price',
                  render: (v) => `₹${v}` },
                { title: 'Total', dataIndex: 'subtotal', key: 'subtotal',
                  render: (v) => `₹${Math.round(v)}` },
              ]}
            />
            <Divider />
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="Subtotal">₹{Math.round(detailBill.subtotal)}</Descriptions.Item>
              {detailBill.discount > 0 && (
                <Descriptions.Item label="Discount">-₹{Math.round(detailBill.discount)}</Descriptions.Item>
              )}
              <Descriptions.Item label="GST">₹{Math.round(detailBill.gst_total)}</Descriptions.Item>
              <Descriptions.Item label={<Text strong>Grand Total</Text>}>
                <Text strong style={{ fontSize: 16, color: '#1A237E' }}>
                  ₹{Math.round(detailBill.grand_total)}
                </Text>
              </Descriptions.Item>
            </Descriptions>
          </>
        )}
      </Modal>
    </div>
  )
}