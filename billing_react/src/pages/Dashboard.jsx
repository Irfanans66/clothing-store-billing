import React, { useEffect, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Typography, Alert } from 'antd'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getDashboard, getDailySales, getSalesByCategory,
  getSalesByPayment, getLowStock,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title } = Typography

const KPI_COLORS = ['#1A237E', '#2E7D32', '#6A1B9A', '#E65100', '#C62828']
const KPI_KEYS = [
  ['total_revenue', 'Total Revenue', (v) => `₹${Number(v).toLocaleString()}`],
  ['total_bills', 'Total Bills', (v) => v],
  ['total_customers', 'Customers', (v) => v],
  ['total_products', 'Products', (v) => v],
  ['low_stock_count', 'Low Stock ⚠️', (v) => v],
]

export default function Dashboard() {
  const storeName = useAuthStore((s) => s.storeName)
  const [stats, setStats] = useState({})
  const [daily, setDaily] = useState([])
  const [byCategory, setByCategory] = useState([])
  const [byPayment, setByPayment] = useState([])
  const [lowStock, setLowStock] = useState([])

  useEffect(() => {
    getDashboard().then(setStats).catch(() => {})
    getDailySales().then(setDaily).catch(() => {})
    getSalesByCategory().then(setByCategory).catch(() => {})
    getSalesByPayment().then(setByPayment).catch(() => {})
    getLowStock().then(setLowStock).catch(() => {})
  }, [])

  const lowStockCols = [
    { title: 'Item ID', dataIndex: 'item_id', key: 'item_id' },
    { title: 'Product', dataIndex: 'product_name', key: 'product_name' },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock_qty' },
    { title: 'Min', dataIndex: 'min_stock', key: 'min_stock' },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 20 }}>🏠 {storeName} — Dashboard</Title>

      {/* KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {KPI_KEYS.map(([key, label, fmt], i) => (
          <Col xs={24} sm={12} md={8} lg={4} key={key}>
            <Card
              style={{ borderLeft: `4px solid ${KPI_COLORS[i]}`, borderRadius: 12 }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Statistic
                title={<span style={{ fontSize: 13 }}>{label}</span>}
                value={fmt(stats[key] ?? 0)}
                valueStyle={{ color: KPI_COLORS[i], fontSize: 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Charts Row 1 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="📈 Daily Revenue (₹)" style={{ borderRadius: 12 }}>
            {daily.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Line type="monotone" dataKey="revenue" stroke="#1A237E" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No data yet</p>}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="⚠️ Low Stock Alert" style={{ borderRadius: 12 }}>
            {lowStock.length ? (
              <Table
                dataSource={lowStock} columns={lowStockCols}
                rowKey="item_id" size="small" pagination={false}
                scroll={{ y: 180 }}
              />
            ) : (
              <Alert message="All products well stocked ✅" type="success" showIcon />
            )}
          </Card>
        </Col>
      </Row>

      {/* Charts Row 2 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="🛍️ Sales by Category" style={{ borderRadius: 12 }}>
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#3949AB" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No data yet</p>}
          </Card>
        </Col>

        <Col xs={24} md={12}>
          <Card title="💳 Revenue by Payment Mode" style={{ borderRadius: 12 }}>
            {byPayment.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byPayment}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="payment_mode" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#00897B" />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No data yet</p>}
          </Card>
        </Col>
      </Row>
    </div>
  )
}