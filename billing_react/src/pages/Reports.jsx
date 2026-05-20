import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Table, Typography, Button } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { getDailySales, getSalesByCategory, getSalesByPayment, getTopProducts, getGstSummary } from '../api/client'

const { Title } = Typography

export default function Reports() {
  const [daily, setDaily] = useState([])
  const [byCategory, setByCategory] = useState([])
  const [byPayment, setByPayment] = useState([])
  const [topProducts, setTopProducts] = useState([])
  const [gstSummary, setGstSummary] = useState([])

  useEffect(() => {
    getDailySales().then(setDaily).catch(() => {})
    getSalesByCategory().then(setByCategory).catch(() => {})
    getSalesByPayment().then(setByPayment).catch(() => {})
    getTopProducts().then(setTopProducts).catch(() => {})
    getGstSummary().then(setGstSummary).catch(() => {})
  }, [])

  const gstCols = [
    { title: 'GST Rate %', dataIndex: 'gst_pct', key: 'gst_pct' },
    { title: 'Line Items', dataIndex: 'line_items', key: 'line_items' },
    { title: 'Taxable Value (₹)', dataIndex: 'taxable_value', key: 'taxable_value',
      render: (v) => `₹${Math.round(v).toLocaleString()}` },
    { title: 'GST Collected (₹)', dataIndex: 'gst_collected', key: 'gst_collected',
      render: (v) => `₹${Math.round(v).toLocaleString()}` },
  ]

  const noData = <p style={{ color: '#aaa', textAlign: 'center', padding: 32 }}>No data yet</p>

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>📊 Reports & Analytics</Title>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="🛍️ Sales by Category" style={{ borderRadius: 12 }}>
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#3949AB" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="💳 Revenue by Payment Mode" style={{ borderRadius: 12 }}>
            {byPayment.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={byPayment}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="payment_mode" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#00897B" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="📈 Daily Revenue" style={{ borderRadius: 12 }}>
            {daily.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="#1A237E" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : noData}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="🏆 Top Products by Units Sold" style={{ borderRadius: 12 }}>
            {topProducts.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={topProducts} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="product" type="category" tick={{ fontSize: 10 }} width={120} />
                  <Tooltip />
                  <Bar dataKey="units_sold" fill="#6A1B9A" radius={[0,4,4,0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </Card>
        </Col>

        <Col xs={24}>
          <Card
            title="📄 GST Summary"
            style={{ borderRadius: 12 }}
            extra={
              gstSummary.length ? (
                <Button size="small" icon={<DownloadOutlined />}
                  onClick={() => {
                    const csv = ['GST Rate,Items,Taxable,GST Collected',
                      ...gstSummary.map((r) => `${r.gst_pct},${r.line_items},${r.taxable_value},${r.gst_collected}`)
                    ].join('\n')
                    const a = document.createElement('a')
                    a.href = 'data:text/csv,' + encodeURIComponent(csv)
                    a.download = 'gst_summary.csv'; a.click()
                  }}>
                  Export CSV
                </Button>
              ) : null
            }
          >
            <Table
              dataSource={gstSummary} columns={gstCols} rowKey="gst_pct"
              pagination={false} size="middle"
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}