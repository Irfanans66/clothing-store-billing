import React, { useState, useEffect } from 'react'
import {
  Card, Table, Input, Select, Button, Space, Tag, Typography,
  Modal, Descriptions, Divider, message, InputNumber, Form, Alert,
} from 'antd'
import { SearchOutlined, PrinterOutlined, RollbackOutlined } from '@ant-design/icons'
import { getBills, getBill, returnBillItems } from '../api/client'
import { printPdfWithAuth } from '../utils/pdf'

const { Title, Text } = Typography
const PAYMENT_MODES = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking']

const STATUS_COLORS = {
  Paid: 'green',
  Credit: 'orange',
  Void: 'red',
  Returned: 'purple',
  'Partial Return': 'geekblue',
}

export default function BillHistory() {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({ date: '', customer: '', payment_mode: '' })

  // detail modal
  const [detailBill, setDetailBill] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  // return modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnQtys, setReturnQtys] = useState({})   // bill_item_id -> qty
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const params = {}
      if (filters.date) params.date = filters.date
      if (filters.customer) params.customer = filters.customer
      if (filters.payment_mode) params.payment_mode = filters.payment_mode
      const res = await getBills(params)
      setBills(res || [])
    } catch {
      setBills([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function viewDetail(billNo) {
    try {
      const res = await getBill(billNo)
      setDetailBill(res)
      setModalOpen(true)
    } catch { }
  }

  function openReturnModal() {
    // Pre-fill return qty inputs with 0 for each item
    const init = {}
    detailBill.items.forEach((item) => {
      init[item.id] = 0
    })
    setReturnQtys(init)
    setRefundMethod('Cash')
    setReturnNotes('')
    setReturnOpen(true)
  }

  // Compute max returnable qty per item (original - already returned)
  function maxReturnable(item) {
    if (!detailBill?.returns?.length) return item.qty
    const alreadyReturned = detailBill.returns
      .flatMap((r) => r.return_items)
      .filter((ri) => ri.bill_item_id === item.id)
      .reduce((sum, ri) => sum + ri.return_qty, 0)
    return item.qty - alreadyReturned
  }

  // Compute refund total preview
  function calcRefundTotal() {
    if (!detailBill) return 0
    return detailBill.items.reduce((sum, item) => {
      const qty = returnQtys[item.id] || 0
      if (qty <= 0) return sum
      const perItem = item.qty > 0 ? item.total / item.qty : 0
      return sum + Math.round(perItem * qty)
    }, 0)
  }

  async function submitReturn() {
    const items = Object.entries(returnQtys)
      .filter(([, qty]) => qty > 0)
      .map(([bill_item_id, return_qty]) => ({
        bill_item_id: Number(bill_item_id),
        return_qty,
      }))

    if (items.length === 0) {
      message.warning('Please enter at least one return quantity.')
      return
    }

    setReturnLoading(true)
    try {
      await returnBillItems(detailBill.bill_no, {
        items,
        refund_method: refundMethod,
        notes: returnNotes,
      })
      message.success('Return processed successfully!')
      setReturnOpen(false)
      setModalOpen(false)
      load()
    } catch (err) {
      message.error(err.message || 'Return failed')
    } finally {
      setReturnLoading(false)
    }
  }

  const canReturn = detailBill && !['Void', 'Returned'].includes(detailBill.status)

  const columns = [
    {
      title: 'Bill No', dataIndex: 'bill_no', key: 'bill_no',
      render: (v) => <Button type="link" size="small" onClick={() => viewDetail(v)}>{v}</Button>,
    },
    { title: 'Date', dataIndex: 'bill_date', key: 'bill_date' },
    { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
    {
      title: 'Total', dataIndex: 'grand_total', key: 'grand_total',
      render: (v) => <Text strong>₹{Math.round(v).toLocaleString()}</Text>,
    },
    {
      title: 'Payment', dataIndex: 'payment_mode', key: 'payment_mode',
      render: (v) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: 'Status', dataIndex: 'status', key: 'status',
      render: (v) => <Tag color={STATUS_COLORS[v] || 'default'}>{v}</Tag>,
    },
    {
      title: '', key: 'action',
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
      <Title level={3} style={{ marginBottom: 16 }}>Bill History</Title>

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

      {/* ── Bill Detail Modal ─────────────────────────────────────── */}
      <Modal
        title={`Bill Detail — ${detailBill?.bill_no}`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          canReturn && (
            <Button key="return" icon={<RollbackOutlined />} onClick={openReturnModal}>
              Return Items
            </Button>
          ),
          <Button key="pdf" type="primary" icon={<PrinterOutlined />}
            onClick={async () => {
              try { await printPdfWithAuth(`/bills/${detailBill?.bill_no}/receipt-pdf`) }
              catch (err) { message.error('PDF failed: ' + err.message) }
            }}>
            Print PDF
          </Button>,
          <Button key="close" onClick={() => setModalOpen(false)}>Close</Button>,
        ]}
        width={640}
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
                <Tag color={STATUS_COLORS[detailBill.status] || 'default'}>{detailBill.status}</Tag>
              </Descriptions.Item>
            </Descriptions>

            <Divider />
            <Table
              dataSource={detailBill.items} rowKey="id" size="small" pagination={false}
              columns={[
                { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 60 },
                { title: 'Qty', dataIndex: 'qty', key: 'qty', width: 50 },
                { title: 'Price', dataIndex: 'selling_price', key: 'selling_price', render: (v) => `₹${v}` },
                { title: 'Total', dataIndex: 'total', key: 'total', render: (v) => `₹${Math.round(v)}` },
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

            {/* Return history */}
            {detailBill.returns?.length > 0 && (
              <>
                <Divider orientation="left">Return History</Divider>
                {detailBill.returns.map((ret) => (
                  <Card key={ret.id} size="small" style={{ marginBottom: 8, background: '#fff7e6' }}>
                    <Text strong>Return #{ret.id}</Text>
                    <Text type="secondary"> — {ret.return_date} {ret.return_time}</Text>
                    <br />
                    {ret.return_items.map((ri) => (
                      <div key={ri.id}>
                        {ri.product_name} × {ri.return_qty} — ₹{Math.round(ri.refund_subtotal)}
                      </div>
                    ))}
                    <div style={{ marginTop: 4 }}>
                      <Tag color="orange">Refund: ₹{Math.round(ret.refund_amount)}</Tag>
                      <Tag>{ret.refund_method}</Tag>
                    </div>
                  </Card>
                ))}
              </>
            )}
          </>
        )}
      </Modal>

      {/* ── Return Items Modal ────────────────────────────────────── */}
      <Modal
        title={`Return Items — ${detailBill?.bill_no}`}
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={submitReturn}
        okText="Process Return"
        okButtonProps={{ loading: returnLoading, danger: true }}
        width={560}
      >
        {detailBill && (
          <>
            <Alert
              type="info"
              message="Enter the quantity to return for each product. Leave 0 to skip an item."
              style={{ marginBottom: 16 }}
              showIcon
            />

            <Table
              dataSource={detailBill.items}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
                { title: 'Size', dataIndex: 'size', key: 'size', width: 55 },
                {
                  title: 'Orig Qty', dataIndex: 'qty', key: 'qty', width: 75,
                  render: (v, item) => {
                    const max = maxReturnable(item)
                    return <span>{v}{max < v ? <Text type="secondary"> ({max} left)</Text> : ''}</span>
                  },
                },
                {
                  title: 'Return Qty', key: 'return_qty', width: 110,
                  render: (_, item) => {
                    const max = maxReturnable(item)
                    return (
                      <InputNumber
                        min={0} max={max} value={returnQtys[item.id] || 0}
                        onChange={(v) => setReturnQtys({ ...returnQtys, [item.id]: v || 0 })}
                        size="small" style={{ width: 80 }}
                        disabled={max === 0}
                      />
                    )
                  },
                },
              ]}
            />

            <Divider />

            <Form layout="inline" style={{ marginBottom: 8 }}>
              <Form.Item label="Refund Method">
                <Select value={refundMethod} onChange={setRefundMethod} style={{ width: 150 }}>
                  <Select.Option value="Cash">Cash</Select.Option>
                  <Select.Option value="Store Credit">Store Credit</Select.Option>
                </Select>
              </Form.Item>
            </Form>

            <Input.TextArea
              placeholder="Notes (optional)"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              rows={2}
              style={{ marginBottom: 12 }}
            />

            <Card size="small" style={{ background: '#f6ffed', border: '1px solid #b7eb8f' }}>
              <Text strong>Total Refund: </Text>
              <Text strong style={{ fontSize: 18, color: '#389e0d' }}>
                ₹{calcRefundTotal().toLocaleString()}
              </Text>
              <Text type="secondary"> via {refundMethod}</Text>
            </Card>
          </>
        )}
      </Modal>
    </div>
  )
}