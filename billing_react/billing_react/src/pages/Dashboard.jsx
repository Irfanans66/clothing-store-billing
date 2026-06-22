import React, { useEffect, useState, useCallback } from 'react'
import { Row, Col, Card, Statistic, Table, Typography, Alert, Radio, Spin, Grid } from 'antd'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getDashboard, getDailySales, getSalesByCategory,
  getSalesByPayment, getLowStock,
} from '../api/client'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

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
  const screens  = useBreakpoint()
  const isMobile = !screens.md

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

  const chartH = isMobile ? 180 : 220

  return (
    <div>
      <Title level={isMobile ? 4 : 3} style={{ marginBottom: isMobile ? 12 : 20 }}>
        🏠 {isMobile ? storeName : `${storeName} — Dashboard`}
      </Title>

      {/* KPI Cards — 2 per row on mobile */}
      <Row gutter={[10, 10]} style={{ marginBottom: isMobile ? 12 : 20 }}>
        {KPI_KEYS.map(([key, label, fmt], i) => (
          <Col xs={12} sm={12} md={8} lg={4} key={key}>
            <Card
              style={{ borderLeft: `3px solid ${KPI_COLORS[i]}`, borderRadius: 12 }}
              styles={{ body: { padding: isMobile ? '10px 12px' : '16px 20px' } }}
            >
              <Statistic
                title={<span style={{ fontSize: isMobile ? 11 : 13 }}>{label}</span>}
                value={fmt(stats[key] ?? 0)}
                valueStyle={{ color: KPI_COLORS[i], fontSize: isMobile ? 18 : 22, fontWeight: 700 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      {/* Sales Chart */}
      <Card
        style={{ borderRadius: 12, marginBottom: 12 }}
        styles={{ header: { padding: isMobile ? '0 12px' : undefined } }}
        title={
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', gap: 8 }}>
            <span style={{ fontSize: isMobile ? 13 : 15 }}>{PERIOD_TITLES[period]}</span>
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
        <Row gutter={10} style={{ marginBottom: 12 }}>
          <Col xs={12}>
            <div style={{ borderRadius: 8, background: 'rgba(26,35,126,0.15)', border: '1px solid rgba(57,73,171,0.25)', padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Revenue</div>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 17 : 20, color: '#6fa8ff' }}>
                ₹{Math.round(periodRevenue).toLocaleString()}
              </div>
            </div>
          </Col>
          <Col xs={12}>
            <div style={{ borderRadius: 8, background: 'rgba(46,125,50,0.15)', border: '1px solid rgba(67,160,71,0.25)', padding: '8px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 2 }}>Bills</div>
              <div style={{ fontWeight: 700, fontSize: isMobile ? 17 : 20, color: '#81c784' }}>
                {periodBills}
              </div>
            </div>
          </Col>
        </Row>

        {salesLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : salesData.length ? (
          <ResponsiveContainer width="100%" height={chartH}>
            <BarChart data={salesData} margin={{ left: isMobile ? -20 : 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="date" tick={{ fontSize: 9 }}
                tickFormatter={v => period === 'year' ? v.slice(0, 7) : v.slice(5)} />
              <YAxis tick={{ fontSize: 9 }} width={isMobile ? 40 : 60} />
              <Tooltip
                contentStyle={{ background: 'rgba(10,5,2,0.9)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8 }}
                formatter={(v, name) => [
                  name === 'revenue' ? `₹${Number(v).toLocaleString()}` : v,
                  name === 'revenue' ? 'Revenue' : 'Bills',
                ]}
                labelFormatter={(l) => `Date: ${l}`}
              />
              <Bar dataKey="revenue" fill="#3949AB" radius={[3, 3, 0, 0]} name="revenue" />
              <Bar dataKey="bills"   fill="#43A047" radius={[3, 3, 0, 0]} name="bills" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: 32, fontSize: 13 }}>
            No sales data for this period
          </p>
        )}
      </Card>

      {/* Category + Payment charts */}
      <Row gutter={[10, 10]} style={{ marginBottom: 12 }}>
        <Col xs={24} md={12}>
          <Card title="🛍️ By Category" style={{ borderRadius: 12 }} styles={{ header: { padding: '0 12px', minHeight: 42 } }}>
            {byCategory.length ? (
              <ResponsiveContainer width="100%" height={chartH}>
                <BarChart data={byCategory} margin={{ left: isMobile ? -20 : 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="category" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={isMobile ? 40 : 60} />
                  <Tooltip contentStyle={{ background: 'rgba(10,5,2,0.9)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8 }} formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#3949AB" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: 32, fontSize: 13 }}>No data yet</p>}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="💳 By Payment Mode" style={{ borderRadius: 12 }} styles={{ header: { padding: '0 12px', minHeight: 42 } }}>
            {byPayment.length ? (
              <ResponsiveContainer width="100%" height={chartH}>
                <BarChart data={byPayment} margin={{ left: isMobile ? -20 : 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="payment_mode" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 9 }} width={isMobile ? 40 : 60} />
                  <Tooltip contentStyle={{ background: 'rgba(10,5,2,0.9)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8 }} formatter={(v) => `₹${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#00897B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p style={{ color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: 32, fontSize: 13 }}>No data yet</p>}
          </Card>
        </Col>
      </Row>

      {/* Low Stock */}
      <Card title="⚠️ Low Stock Alert" style={{ borderRadius: 12 }}>
        {lowStock.length ? (
          <Table
            dataSource={lowStock} columns={lowStockCols}
            rowKey="item_id" size="small" pagination={false}
            scroll={{ x: 400, y: 200 }}
          />
        ) : (
          <Alert message="All products well stocked ✅" type="success" showIcon />
        )}
      </Card>
    </div>
  )
}