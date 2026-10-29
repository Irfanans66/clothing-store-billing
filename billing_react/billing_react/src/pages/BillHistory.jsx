import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Card, Table, Input, Select, Button, Tag, Typography, DatePicker, Tooltip,
  Modal, Divider, message, InputNumber, Alert, AutoComplete, Spin, Grid, Radio,
} from 'antd'
import {
  SearchOutlined, PrinterOutlined, RollbackOutlined, EyeOutlined, FileSearchOutlined, RightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { getBills, getBill, returnBillItems, getCustomers } from '../api/client'
import { printPdfWithAuth } from '../utils/pdf'
import { useCurrency } from '../utils/currency'
import { useAuthStore } from '../store/authStore'

const { Title, Text } = Typography
const { useBreakpoint } = Grid
const { RangePicker } = DatePicker

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const GOOD    = '#1E8449'
const BAD     = '#C0392B'

const PAYMENT_MODES = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking', 'Credit']
const STATUS_COLORS = {
  Paid: 'green', Credit: 'orange', Void: 'red',
  Returned: 'purple', 'Partial Return': 'geekblue',
}
const ISO = 'YYYY-MM-DD'
const PAGE_LIMIT = 100   // backend default page size

const CSS = `
.bh-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
.bh-stat { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 12px 16px; }
.bh-filters { display: grid; grid-template-columns: 1.3fr 1fr 0.8fr auto; gap: 10px; align-items: center; }
.bh-card { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 14px; cursor: pointer; }
.bh-card:active { box-shadow: var(--neu-inset); }
.bh-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; font-size: 13.5px; color: ${SUB}; }
.bh-row b { color: ${TEXT}; }
.bh-table .ant-table-row { cursor: pointer; }
@media (max-width: 991px) { .bh-filters { grid-template-columns: 1fr 1fr; } }
@media (max-width: 767px) {
  .bh-strip { gap: 8px; }
  .bh-stat { padding: 10px 12px; }
  .bh-filters { grid-template-columns: 1fr; }
}
`

function paramsFor(f) {
  const p = {}
  if (f.from) p.date_from = f.from
  if (f.to) p.date_to = f.to
  if (f.customer) p.customer = f.customer
  if (f.payment_mode) p.payment_mode = f.payment_mode
  if (f.category != null) p.category = f.category
  return p
}

export default function BillHistory() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filters, setFilters] = useState(() => {
    const day = searchParams.get('date')
    return {
      from: searchParams.get('from') || day || '',
      to: searchParams.get('to') || day || '',
      customer: searchParams.get('customer') || '',
      payment_mode: searchParams.get('payment_mode') || '',
      category: searchParams.get('category'),
      categoryLabel: searchParams.get('category_label') || searchParams.get('category'),
    }
  })
  const [bills, setBills]     = useState([])
  const [loading, setLoading] = useState(true)
  const screens  = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()
  const india = (useAuthStore((s) => s.country) || 'India') === 'India'
  const [custOptions, setCustOptions] = useState([])
  const [custLoading, setCustLoading] = useState(false)
  const custDebounceRef = useRef(null)

  // detail modal
  const [detailBill, setDetailBill] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  // return modal
  const [returnOpen, setReturnOpen] = useState(false)
  const [returnQtys, setReturnQtys] = useState({})   // bill_item_id -> qty
  const [refundMethod, setRefundMethod] = useState('Cash')
  const [returnNotes, setReturnNotes] = useState('')
  const [returnLoading, setReturnLoading] = useState(false)

  async function load(next = filters) {
    setLoading(true)
    try {
      setBills((await getBills(paramsFor(next))) || [])
    } catch {
      setBills([])
    } finally {
      setLoading(false)
    }
  }

  // Apply a filter change straight away
  function applyFilters(patch) {
    const next = { ...filters, ...patch }
    setFilters(next)
    load(next)
  }

  useEffect(() => {
    getBills(paramsFor(filters))
      .then((res) => setBills(res || []))
      .catch(() => setBills([]))
      .finally(() => setLoading(false))
    // ?bill=BILL0042 (New Bill → Return / Exchange): open that bill straight away
    const billNo = searchParams.get('bill')
    if (billNo) viewDetail(billNo.trim().toUpperCase())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onCustInput(val) {
    setFilters((f) => ({ ...f, customer: val }))
    if (custDebounceRef.current) clearTimeout(custDebounceRef.current)
    if (!val.trim()) { setCustOptions([]); applyFilters({ customer: '' }); return }
    custDebounceRef.current = setTimeout(async () => {
      setCustLoading(true)
      try {
        const res = await getCustomers({ search: val.trim() })
        setCustOptions((res || []).map((c) => ({
          key: c.customer_id,
          value: c.name,
          label: (
            <span>
              <Text strong>{c.name}</Text>
              {c.phone && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{c.phone}</Text>}
            </span>
          ),
        })))
      } catch { setCustOptions([]) }
      finally { setCustLoading(false) }
    }, 300)
  }

  function clearCategory() {
    setSearchParams({}, { replace: true })
    applyFilters({ category: null, categoryLabel: null })
  }

  function resetFilters() {
    setSearchParams({}, { replace: true })
    setCustOptions([])
    applyFilters({ from: '', to: '', customer: '', payment_mode: '', category: null, categoryLabel: null })
  }

  async function viewDetail(billNo) {
    try {
      const res = await getBill(billNo)
      setDetailBill(res)
      setModalOpen(true)
    } catch (err) { message.error(`Bill ${billNo}: ${err.message}`) }
  }

  async function printBill(billNo) {
    try {
      const paper = localStorage.getItem('receipt_paper_size') || '3inch'
      await printPdfWithAuth(`/bills/${billNo}/receipt-pdf?paper=${paper}`)
    } catch (err) { message.error('PDF failed: ' + err.message) }
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
  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const fmtDate = (d) => (d ? dayjs(d).format('D MMM YYYY') : '—')

  const totalValue = bills.reduce((s, b) => s + (b.grand_total || 0), 0)
  const totalDue   = bills.reduce((s, b) => s + (b.change_amt < 0 ? -b.change_amt : 0), 0)
  const hasFilters = filters.from || filters.to || filters.customer || filters.payment_mode || filters.category != null

  const statusTag = (status) => <Tag color={STATUS_COLORS[status] || 'default'} style={{ margin: 0 }}>{status}</Tag>

  const columns = [
    {
      title: 'Bill', dataIndex: 'bill_no', key: 'bill_no', width: 120,
      render: (v) => <b style={{ color: PRIMARY }}>{v}</b>,
    },
    { title: 'Date', dataIndex: 'bill_date', key: 'bill_date', width: 120, render: fmtDate },
    {
      title: 'Customer', dataIndex: 'customer_name', key: 'customer_name', ellipsis: true,
      render: (v) => <span style={{ color: TEXT, fontWeight: 500 }}>{v || 'Walk-in'}</span>,
    },
    { title: 'Payment', dataIndex: 'payment_mode', key: 'payment_mode', width: 130, render: (v) => <Tag style={{ margin: 0 }}>{v}</Tag> },
    { title: 'Status', dataIndex: 'status', key: 'status', width: 120, render: statusTag },
    {
      title: 'Total', dataIndex: 'grand_total', key: 'grand_total', width: 110, align: 'right',
      render: (v) => <b style={{ color: TEXT }}>{money(v)}</b>,
      sorter: (a, b) => a.grand_total - b.grand_total,
    },
    {
      title: 'Due', dataIndex: 'change_amt', key: 'change_amt', width: 100, align: 'right',
      render: (v) => (v < 0 ? <b style={{ color: BAD }}>{money(-v)}</b> : <span style={{ color: SUB }}>—</span>),
    },
    {
      title: '', key: 'action', width: 96, align: 'right',
      render: (_, rec) => (
        <span style={{ display: 'inline-flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
          <Tooltip title="View bill"><Button size="small" icon={<EyeOutlined />} onClick={() => viewDetail(rec.bill_no)} aria-label={`View ${rec.bill_no}`} /></Tooltip>
          <Tooltip title="Print receipt"><Button size="small" icon={<PrinterOutlined />} onClick={() => printBill(rec.bill_no)} aria-label={`Print ${rec.bill_no}`} /></Tooltip>
        </span>
      ),
    },
  ]

  const empty = (
    <div style={{ textAlign: 'center', padding: '40px 12px', color: SUB }}>
      <FileSearchOutlined style={{ fontSize: 34, color: PRIMARY, opacity: 0.6 }} />
      <div style={{ marginTop: 8, fontSize: 14 }}>No bills match these filters</div>
      {hasFilters && <Button type="link" onClick={resetFilters} style={{ color: PRIMARY }}>Clear filters</Button>}
    </div>
  )

  const d = detailBill
  const gst = d?.gst_total || 0

  return (
    <div>
      <style>{CSS}</style>
      <Title level={isMobile ? 4 : 3} style={{ margin: '0 0 12px', color: TEXT }}>Bill history</Title>

      {/* Filters */}
      <Card style={{ borderRadius: 14, marginBottom: 14 }} styles={{ body: { padding: isMobile ? 12 : 16 } }}>
        <div className="bh-filters">
          <RangePicker
            value={filters.from && filters.to ? [dayjs(filters.from), dayjs(filters.to)] : null}
            onChange={(v) => applyFilters(v ? { from: v[0].format(ISO), to: v[1].format(ISO) } : { from: '', to: '' })}
            format="D MMM YYYY"
            placeholder={['From date', 'To date']}
            disabledDate={(day) => day.isAfter(dayjs(), 'day')}
            presets={[
              { label: 'Today', value: [dayjs(), dayjs()] },
              { label: 'Yesterday', value: [dayjs().subtract(1, 'day'), dayjs().subtract(1, 'day')] },
              { label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: 'This month', value: [dayjs().startOf('month'), dayjs()] },
              { label: 'Last month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            ]}
            inputReadOnly={isMobile}
            style={{ width: '100%' }}
          />
          <AutoComplete
            value={filters.customer}
            options={custOptions}
            onSearch={onCustInput}
            onChange={onCustInput}
            onSelect={(val) => { setCustOptions([]); applyFilters({ customer: val }) }}
            allowClear
            onClear={() => { setCustOptions([]); applyFilters({ customer: '' }) }}
            notFoundContent={custLoading ? <Spin size="small" /> : null}
            style={{ width: '100%' }}
          >
            <Input placeholder="Customer name" prefix={<SearchOutlined />}
              onPressEnter={() => load()} suffix={custLoading ? <Spin size="small" /> : null} />
          </AutoComplete>
          <Select
            placeholder="All payment modes" value={filters.payment_mode || undefined}
            onChange={(v) => applyFilters({ payment_mode: v || '' })}
            allowClear style={{ width: '100%' }}
            options={PAYMENT_MODES.map((m) => ({ value: m, label: m === 'Credit' ? 'Credit (pay later)' : m }))}
          />
          {hasFilters
            ? <Button type="link" onClick={resetFilters} style={{ color: PRIMARY, padding: 0 }}>Clear filters</Button>
            : <span />}
        </div>
        {filters.category != null && (
          <Tag closable onClose={clearCategory} color="blue" style={{ marginTop: 10, fontSize: 13, padding: '3px 10px' }}>
            Category: {filters.categoryLabel}
          </Tag>
        )}
      </Card>

      {/* Summary */}
      <div className="bh-strip">
        <div className="bh-stat">
          <div style={{ fontSize: 12.5, color: SUB, fontWeight: 600 }}>Bills</div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{loading ? '…' : bills.length}</div>
        </div>
        <div className="bh-stat">
          <div style={{ fontSize: 12.5, color: SUB, fontWeight: 600 }}>Total value</div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: TEXT }}>{loading ? '…' : money(totalValue)}</div>
        </div>
        <div className="bh-stat">
          <div style={{ fontSize: 12.5, color: SUB, fontWeight: 600 }}>Balance due</div>
          <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, color: totalDue > 0 ? BAD : TEXT }}>{loading ? '…' : money(totalDue)}</div>
        </div>
      </div>
      {!loading && bills.length >= PAGE_LIMIT && (
        <Alert type="info" showIcon style={{ marginBottom: 12 }}
          message={`Showing the latest ${PAGE_LIMIT} bills. Pick a date range to see older ones.`} />
      )}

      {/* Mobile: card list | Desktop: table */}
      {isMobile ? (
        loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
        ) : bills.length === 0 ? empty : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {bills.map((bill) => (
              <div key={bill.bill_no} className="bh-card" role="button" tabIndex={0}
                onClick={() => viewDetail(bill.bill_no)}
                onKeyDown={(e) => { if (e.key === 'Enter') viewDetail(bill.bill_no) }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: TEXT, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {bill.customer_name || 'Walk-in'}
                    </div>
                    <div style={{ fontSize: 12.5, color: SUB }}>{bill.bill_no} · {fmtDate(bill.bill_date)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, fontSize: 17, color: TEXT }}>{money(bill.grand_total)}</div>
                    {bill.change_amt < 0 && <div style={{ fontSize: 12, color: BAD, fontWeight: 700 }}>Due {money(-bill.change_amt)}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                  <Tag style={{ margin: 0 }}>{bill.payment_mode}</Tag>
                  {statusTag(bill.status)}
                  <Button size="small" icon={<PrinterOutlined />} style={{ marginLeft: 'auto' }}
                    onClick={(e) => { e.stopPropagation(); printBill(bill.bill_no) }}>Print</Button>
                  <RightOutlined style={{ color: SUB, fontSize: 11 }} />
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        <Card style={{ borderRadius: 14 }} styles={{ body: { padding: 8 } }}>
          <Table
            className="bh-table"
            dataSource={bills} columns={columns} rowKey="bill_no"
            loading={loading} size="middle"
            locale={{ emptyText: empty }}
            onRow={(rec) => ({ onClick: () => viewDetail(rec.bill_no) })}
            pagination={{ pageSize: 20, showSizeChanger: true, hideOnSinglePage: true }}
            scroll={{ x: 820 }}
          />
        </Card>
      )}

      {/* ── Bill Detail Modal ─────────────────────────────────────── */}
      <Modal
        title={d ? <span>Bill {d.bill_no} <span style={{ marginLeft: 6 }}>{statusTag(d.status)}</span></span> : ''}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={[
          canReturn && (
            <Button key="return" icon={<RollbackOutlined />} onClick={openReturnModal}>
              Return items
            </Button>
          ),
          <Button key="pdf" type="primary" icon={<PrinterOutlined />} onClick={() => printBill(d?.bill_no)}>
            Print receipt
          </Button>,
        ]}
        width={640}
      >
        {d && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '0 24px', marginBottom: 12 }}>
              <div className="bh-row"><span>Customer</span><b>{d.customer_name || 'Walk-in'}</b></div>
              <div className="bh-row"><span>Date</span><b>{fmtDate(d.bill_date)} {d.bill_time}</b></div>
              <div className="bh-row"><span>Phone</span><b>{d.phone || '—'}</b></div>
              <div className="bh-row"><span>Payment</span><b>{d.payment_mode}</b></div>
              {d.cashier && <div className="bh-row"><span>Billed by</span><b>{d.cashier}</b></div>}
            </div>

            <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }}>
              {d.items.map((it) => (
                <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600 }}>{it.product_name}</div>
                    <div style={{ fontSize: 12.5, color: SUB }}>
                      {[it.size, it.color].filter(Boolean).join(' · ')}{(it.size || it.color) ? ' · ' : ''}{it.qty} × {money(it.selling_price)}
                    </div>
                  </div>
                  <b style={{ color: TEXT, whiteSpace: 'nowrap' }}>{money(it.qty * it.selling_price)}</b>
                </div>
              ))}
            </div>

            <div style={{ maxWidth: 320, marginLeft: 'auto', marginTop: 10 }}>
              <div className="bh-row"><span>Subtotal</span><b>{money(d.subtotal)}</b></div>
              {d.discount > 0 && <div className="bh-row"><span>Discount</span><b style={{ color: GOOD }}>-{money(d.discount)}</b></div>}
              {india ? (
                <>
                  <div className="bh-row"><span>CGST</span><b>{money(gst / 2)}</b></div>
                  <div className="bh-row"><span>SGST</span><b>{money(gst - Math.round(gst / 2))}</b></div>
                </>
              ) : <div className="bh-row"><span>Tax</span><b>{money(gst)}</b></div>}
              <div className="bh-row" style={{ borderTop: '2px solid rgba(0,0,0,0.1)', marginTop: 4, paddingTop: 8 }}>
                <b style={{ fontSize: 15 }}>Grand total</b>
                <b style={{ fontSize: 20, color: PRIMARY }}>{money(d.grand_total)}</b>
              </div>
              <div className="bh-row"><span>Paid</span><b>{money(d.amount_paid)}</b></div>
              {d.change_amt > 0 && <div className="bh-row"><span>Change given</span><b>{money(d.change_amt)}</b></div>}
              {d.change_amt < 0 && <div className="bh-row"><span style={{ color: BAD }}>Balance due</span><b style={{ color: BAD }}>{money(-d.change_amt)}</b></div>}
            </div>
            {d.notes && <div style={{ marginTop: 10, fontSize: 13, color: SUB }}>Note: {d.notes}</div>}

            {/* Return history */}
            {d.returns?.length > 0 && (
              <>
                <Divider titlePlacement="start" style={{ margin: '16px 0 10px' }}>Returns</Divider>
                {d.returns.map((ret) => (
                  <div key={ret.id} style={{ background: 'rgba(185,119,14,0.08)', borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                      <b style={{ color: TEXT }}>Return #{ret.id}</b>
                      <span style={{ color: SUB, fontSize: 12.5 }}>{fmtDate(ret.return_date)} {ret.return_time}</span>
                    </div>
                    {ret.return_items.map((ri) => (
                      <div key={ri.id} style={{ fontSize: 13, color: SUB }}>
                        {ri.product_name} × {ri.return_qty} — {money(ri.refund_subtotal)}
                      </div>
                    ))}
                    <div style={{ marginTop: 4, fontSize: 13 }}>
                      Refund <b style={{ color: '#B9770E' }}>{money(ret.refund_amount)}</b> <span style={{ color: SUB }}>by {ret.refund_method}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </Modal>

      {/* ── Return Items Modal ────────────────────────────────────── */}
      <Modal
        title={`Return items — ${d?.bill_no}`}
        open={returnOpen}
        onCancel={() => setReturnOpen(false)}
        onOk={submitReturn}
        okText="Process return"
        okButtonProps={{ loading: returnLoading, danger: true, disabled: calcRefundTotal() === 0 }}
        width={560}
      >
        {d && (
          <>
            <p style={{ color: SUB, marginTop: 0 }}>Choose how many of each item the customer is returning.</p>
            {d.items.map((item) => {
              const max = maxReturnable(item)
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: TEXT, fontWeight: 600 }}>{item.product_name}{item.size ? ` · ${item.size}` : ''}</div>
                    <div style={{ fontSize: 12.5, color: SUB }}>
                      Bought {item.qty}{max < item.qty ? ` · ${max} can still be returned` : ''}
                    </div>
                  </div>
                  <InputNumber
                    min={0} max={max} value={returnQtys[item.id] || 0}
                    onChange={(v) => setReturnQtys({ ...returnQtys, [item.id]: v || 0 })}
                    style={{ width: 80 }} disabled={max === 0} aria-label={`Return quantity for ${item.product_name}`}
                  />
                </div>
              )
            })}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 10px', flexWrap: 'wrap' }}>
              <span style={{ color: TEXT, fontWeight: 600 }}>Refund as</span>
              <Radio.Group value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                <Radio value="Cash">Cash</Radio>
                <Radio value="Store Credit">Store credit</Radio>
              </Radio.Group>
            </div>

            <Input.TextArea
              placeholder="Notes (optional)"
              value={returnNotes}
              onChange={(e) => setReturnNotes(e.target.value)}
              rows={2}
              style={{ marginBottom: 12 }}
            />

            <div style={{ background: 'rgba(30,132,73,0.1)', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: TEXT, fontWeight: 600 }}>Refund {refundMethod === 'Cash' ? 'in cash' : 'as store credit'}</span>
              <b style={{ fontSize: 20, color: GOOD }}>{money(calcRefundTotal())}</b>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}
