import React, { useEffect, useState, useCallback } from 'react'
import { Row, Col, Card, Statistic, Table, Typography, Alert, Radio, Spin } from 'antd'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getDashboard, getDailySales, getSalesByCategory,
  getSalesByPayment, getLowStock,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography

const KPI_COLORS = ['#1A237E', '#2E7D32', '#6A1B9A', '#E65100', '#C62828']
const KPI_KEYS = [
  ['total_revenue', 'Total Revenue', (v) => `₹${Number(v).toLocaleString()}`],
  ['total_bills', 'Total Bills', (v) => v],
  ['total_customers', 'Customers', (v) => v],
  ['total_products', 'Products', (v) => v],
  ['low_stock_count', 'Low Stock ⚠️', (v) => v],
]

const PERIODS = [
  { label: 'Today', value: 'today' },
  { label: 'Weekly', value: 'week' },
  { label: 'Monthly', value: 'month' },
  { label: 'Yearly', value: 'year' },
]

const PERIOD_TITLES = {
  today: "📈 Today's Sales",
  week: '📈 Last 7 Days Sales',
  month: '📈 Last 30 Days Sales',
  year: '📈 Monthly Sales (This Year)',
}

export default function Dashboard() {
  const storeName = useAuthStore((s) => s.storeName)
  const [stats, setStats]         = useState({})
  const [salesData, setSalesData] = useState([])
  const [salesLoading, setSalesLoading] = useState(false)
  const [period, setPeriod]       = useState('today')
  const [byCategory, setByCategory] = useState([])
  const [byPayment, setByPayment] = useState([])
  const [lowStock, setLowStock]   = useState([])

  useEffect(() => {
    getDashboard().then(setStats).catch(() => {})
    getSalesByCategory().then(setByCategory).catch(() => {})
    getSalesByPayment().then(setByPayment).catch(() => {})
    getLowStock().then(setLowStock).catch(() => {})
  }, [])

  const fetchSales = useCallback(async (p) => {
    setSalesLoading(true)
    try {
      const res = await getDailySales(p)
      setSalesData(res || [])
    } catch { setSalesData([]) }
    finally { setSalesLoading(false) }
  }, [])

  useEffect(() => { fetchSales(period) }, [period])

  // Today's summary from salesData when period === 'today'
  const todayRevenue = period === 'today'
    ? salesData.reduce((s, r) => s + (r.revenue || 0), 0)
    : null
  const todayBills = period === 'today'
    ? salesData.reduce((s, r) => s + (r.bills || 0), 0)
    : null

  // Period totals
  const periodRevenue = salesData.reduce((s, r) => s + (r.revenue || 0), 0)
  const periodBills   = salesData.reduce((s, r) => s + (r.bills || 0), 0)

  const lowStockCols = [
    { title: 'Item ID', dataIndex: 'item_id', key: 'item_id' },
    { title: 'Product', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock_qty', width: 60 },
    { title: 'Min', dataIndex: 'min_stock', key: 'min_stock', width: 60 },
  ]

  return (
    <div>
      <Title level={3} style={{ marginBottom: 20 }}>🏠 {storeName} — Dashboard</Title>

      {/* Overall KPI Cards */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
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

      {/* Sales Chart with Period Filter */}
      <Card
        style={{ borderRadius: 12, marginBottom: 16 }}
        title={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span>{PERIOD_TITLES[period]}</span>
            <Radio.Group
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              optionType="button"
              buttonStyle="solid"
              size="small"
            >
              {PERIODS.map(p => <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>)}
            </Radio.Group>
          </div>
        }
      >
        {/* Period summary row */}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={12}>
            <Card size="small" style={{ borderRadius: 8, background: '#f0f4ff', border: 'none', textAlign: 'center' }}>
              <Statistic
                title={<Text style={{ fontSize: 12 }}>Revenue</Text>}
                value={`₹${Math.round(periodRevenue).toLocaleString()}`}
                valueStyle={{ fontSize: 20, color: '#1A237E', fontWeight: 700 }}
              />
            </Card>
          </Col>
          <Col xs={12}>
            <Card size="small" style={{ borderRadius: 8, background: '#f0fff4', border: 'none', textAlign: 'center' }}>
              <Statistic
                title={<Text style={{ fontSize: 12 }}>Bills</Text>}
                value={periodBills}
                valueStyle={{ fontSize: 20, color: '#2E7D32', fontWeight: 700 }}
              />
            </Card>
          </Col>
        </Row>

        {/* Chart */}
        {salesLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : salesData.length ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={salesData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }}
                tickFormatter={v => period === 'year' ? v.slice(0, 7) : v.slice(5)} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [
                  name === 'revenue' ? `₹${Number(v).toLocaleString()}` : v,
                  name === 'revenue' ? 'Revenue' : 'Bills',
                ]}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Bar dataKey="revenue" fill="#1A237E" radius={[4, 4, 0, 0]} name="revenue" />
              <Bar dataKey="bills" fill="#43A047" radius={[4, 4, 0, 0]} name="bills" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No sales data for this period</p>
        )}
      </Card>

      {/* Charts Row 2 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="🛍️ Sales by Category" style={{ borderRadius: 12 }}>
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={byCategory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#3949AB" radius={[4, 4, 0, 0]} />
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
                  <Bar dataKey="revenue" fill="#00897B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: '#aaa', textAlign: 'center', padding: 40 }}>No data yet</p>}
          </Card>
        </Col>
      </Row>

      {/* Low Stock */}
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
    </div>
  )
}