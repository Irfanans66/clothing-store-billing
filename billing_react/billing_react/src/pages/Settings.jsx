import React, { useEffect, useState } from 'react'
import { Card, Tabs, Form, Input, Button, message, Typography, Alert, Radio, Switch, InputNumber } from 'antd'
import { getStoreProfile, updateStoreProfile, getLoyaltyProgram, updateLoyaltyProgram } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { PLATFORMS, openPaymentDashboard } from '../utils/paymentPlatforms'

const { Title, Text } = Typography

function UpiQrPreview({ upiId, storeName }) {
  if (!upiId) return null
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=100&cu=INR&tn=Demo`
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(upiUrl)}`
  return (
    <div style={{ textAlign: 'center', marginTop: 16 }}>
      <img src={qrSrc} alt="UPI QR" width={160} height={160}
        style={{ border: '1px solid #eee', borderRadius: 8 }} />
      <div style={{ fontSize: 12, color: '#555', marginTop: 6 }}>Demo QR (₹100) — real receipt will show actual bill amount</div>
      <div style={{ fontSize: 11, color: '#888' }}>{upiId}</div>
    </div>
  )
}

export default function Settings() {
  const { role, storeName } = useAuthStore()
  const [profile, setProfile] = useState(null)
  const [infoForm] = Form.useForm()
  const [upiForm] = Form.useForm()
  const [loyaltyForm] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [previewUpi, setPreviewUpi] = useState('')
  const [loyalty, setLoyalty] = useState(null)
  const [paperSize, setPaperSize] = useState(
    () => localStorage.getItem('receipt_paper_size') || '3inch'
  )
  const [payMonitor, setPayMonitor] = useState(
    () => localStorage.getItem('payment_monitor_platform') || ''
  )

  useEffect(() => {
    getStoreProfile()
      .then((p) => {
        setProfile(p)
        infoForm.setFieldsValue(p)
        upiForm.setFieldValue('upi_id', p.upi_id || '')
        setPreviewUpi(p.upi_id || '')
      })
      .catch(() => {})
    getLoyaltyProgram()
      .then((l) => {
        setLoyalty(l)
        loyaltyForm.setFieldsValue({
          ...l,
          rupees_per_point: l.points_per_rupee ? Math.round(1 / l.points_per_rupee) : 100,
        })
      })
      .catch(() => {})
  }, [])

  async function saveLoyalty(values) {
    setSaving(true)
    try {
      const { rupees_per_point, ...rest } = values
      const payload = {
        ...rest,
        points_per_rupee: rupees_per_point > 0 ? 1 / rupees_per_point : 0.01,
      }
      const updated = await updateLoyaltyProgram(payload)
      setLoyalty(updated)
      message.success('Loyalty program updated!')
    } catch (err) {
      message.error(err.message || 'Failed to save loyalty program')
    } finally {
      setSaving(false)
    }
  }

  if (role !== 'Admin') {
    return <Card><Title level={4}>Admin access required</Title></Card>
  }

  async function saveInfo(values) {
    setSaving(true)
    try {
      await updateStoreProfile(values)
      message.success('Store info updated!')
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  async function saveUpi(values) {
    setSaving(true)
    try {
      await updateStoreProfile({ upi_id: values.upi_id?.trim() || null })
      setPreviewUpi(values.upi_id?.trim() || '')
      message.success('UPI ID saved!')
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <Title level={3} style={{ marginBottom: 16 }}>⚙️ Store Settings</Title>
      <Card style={{ borderRadius: 12, maxWidth: 640 }}>
        <Tabs
          items={[
            {
              key: 'info',
              label: '🏪 Store Info',
              children: (
                <Form form={infoForm} layout="vertical" onFinish={saveInfo} style={{ maxWidth: 500 }}>
                  <Form.Item name="store_name" label="Store Name"><Input /></Form.Item>
                  <Form.Item name="email" label="Email"><Input /></Form.Item>
                  <Form.Item name="phone" label="Phone"><Input /></Form.Item>
                  <Form.Item name="gstin" label="GSTIN"><Input /></Form.Item>
                  <Form.Item name="address" label="Address"><Input.TextArea rows={2} /></Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>Save Store Info</Button>
                </Form>
              ),
            },
            {
              key: 'upi',
              label: '💳 UPI Payment',
              children: (
                <div style={{ maxWidth: 480 }}>
                  <Alert
                    type="info" showIcon style={{ marginBottom: 20 }}
                    message="UPI QR Code on Receipts"
                    description="Add your UPI ID below. A QR code will appear on every receipt so customers can scan and pay the exact bill amount instantly — no manual entry needed."
                  />
                  <Form form={upiForm} layout="vertical" onFinish={saveUpi}>
                    <Form.Item
                      name="upi_id"
                      label="UPI ID"
                      extra="Examples: shopname@upi, 9876543210@paytm, name@okaxis"
                    >
                      <Input
                        placeholder="yourstore@upi"
                        onChange={(e) => {
                          if (!e.target.value) setPreviewUpi('')
                        }}
                      />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={saving}
                      onClick={() => setPreviewUpi(upiForm.getFieldValue('upi_id') || '')}>
                      Save UPI ID
                    </Button>
                  </Form>
                  <UpiQrPreview upiId={previewUpi} storeName={storeName} />
                </div>
              ),
            },
            {
              key: 'receipt',
              label: '🖨️ Receipt Design',
              children: (
                <div style={{ maxWidth: 560 }}>
                  <Alert
                    type="info" showIcon style={{ marginBottom: 20 }}
                    message="Receipt Design & Paper Size"
                    description="Choose a receipt design style. Designs 1–4 are full-featured invoice layouts. Thermal options are for narrow thermal roll printers."
                  />

                  <div style={{ marginBottom: 10, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    📄 Invoice Designs (80mm / A4-friendly)
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                    {[
                      { value: 'design1', label: 'Design 1', desc: 'Sales Invoice', detail: 'Bordered box · Red store name · Blue header · YOU SAVED · Barcode + Points' },
                      { value: 'design2', label: 'Design 2', desc: 'Dark Header', detail: 'Black header · Per-item discount · MRP total · Payment details table' },
                      { value: 'design3', label: 'Design 3', desc: 'Bill + Logo', detail: 'BILL bar · Logo placeholder · Red item header · Totals box · Footer bar' },
                      { value: 'design4', label: 'Design 4', desc: 'Tax Invoice', detail: 'Large blue store name · GST breakdown table · Large total · Minimal clean' },
                    ].map(({ value, label, desc, detail }) => (
                      <div
                        key={value}
                        onClick={() => { setPaperSize(value); localStorage.setItem('receipt_paper_size', value); message.success(`${desc} selected!`) }}
                        style={{
                          width: 'calc(50% - 5px)',
                          border: `2px solid ${paperSize === value ? '#C9A84C' : 'rgba(255,255,255,0.15)'}`,
                          borderRadius: 10,
                          padding: '12px 14px',
                          cursor: 'pointer',
                          background: paperSize === value ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)',
                          transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 13, color: paperSize === value ? '#C9A84C' : 'rgba(255,255,255,0.85)', marginBottom: 2 }}>
                          {label} — {desc}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>{detail}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ marginBottom: 10, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                    🧾 Thermal Roll (narrow paper)
                  </div>
                  <Radio.Group
                    value={paperSize}
                    onChange={(e) => {
                      setPaperSize(e.target.value)
                      localStorage.setItem('receipt_paper_size', e.target.value)
                      message.success('Receipt size updated!')
                    }}
                  >
                    <Radio.Button value="2inch" style={{ marginRight: 8 }}>2-inch (58mm)</Radio.Button>
                    <Radio.Button value="3inch" style={{ marginRight: 8 }}>3-inch Standard</Radio.Button>
                    <Radio.Button value="3inch-bold">3-inch Bold</Radio.Button>
                  </Radio.Group>

                  <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(201,168,76,0.08)', borderRadius: 8, border: '1px solid rgba(201,168,76,0.2)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                    {paperSize === '2inch' && '2-inch (58mm) paper — compact thermal receipt with UPI QR.'}
                    {paperSize === '3inch' && '3-inch (80mm) standard thermal receipt.'}
                    {paperSize === '3inch-bold' && '3-inch (80mm) bold receipt — large fonts, thick lines.'}
                    {paperSize === 'design1' && 'Sales Invoice — bordered layout with red store name, item table, barcode and loyalty points.'}
                    {paperSize === 'design2' && 'Dark Header — black header with per-item discount rows and full payment summary.'}
                    {paperSize === 'design3' && 'Bill + Logo — logo placeholder, colored table header, totals box and black footer bar.'}
                    {paperSize === 'design4' && 'Tax Invoice — large blue store name, GST breakdown table, clean minimal layout.'}
                  </div>
                </div>
              ),
            },
            {
              key: 'payment-monitor',
              label: '💳 Payment Monitor',
              children: (
                <div style={{ maxWidth: 520 }}>
                  <Alert type="info" showIcon style={{ marginBottom: 20 }}
                    message="Payment Monitor"
                    description="Choose your payment platform. A floating 💳 button will appear on every page — click it to open your payment dashboard in a popup window alongside the billing app."
                  />
                  <div style={{ fontWeight: 600, color: '#3A3530', marginBottom: 12 }}>Select Platform</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {[['gpay','🟦','GPay Business','Opens Google Pay for Business'],
                      ['phonepe','💜','PhonePe Business','Opens PhonePe Business dashboard'],
                      ['both','💳','GPay + PhonePe','Opens both side by side'],
                      ['','❌','Disable','Hide the payment monitor button']
                    ].map(([val, icon, label, desc]) => (
                      <div key={val} onClick={() => {
                          setPayMonitor(val)
                          localStorage.setItem('payment_monitor_platform', val)
                          message.success(val ? `${label} selected!` : 'Payment Monitor disabled')
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14,
                          padding: '12px 16px', borderRadius: 14, cursor: 'pointer',
                          background: '#EDE8E2',
                          boxShadow: payMonitor === val
                            ? 'inset 4px 4px 10px rgba(163,155,140,0.55), inset -4px -4px 10px rgba(255,255,255,0.92)'
                            : '4px 4px 12px rgba(163,155,140,0.4), -4px -4px 10px rgba(255,255,255,0.85)',
                          transition: 'box-shadow 0.2s',
                          border: payMonitor === val ? '1.5px solid #82B8D4' : '1.5px solid transparent',
                        }}>
                        <span style={{ fontSize: 22 }}>{icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: payMonitor === val ? '#5E9AB8' : '#3A3530' }}>{label}</div>
                          <div style={{ fontSize: 12, color: '#9A9490' }}>{desc}</div>
                        </div>
                        {payMonitor === val && <span style={{ marginLeft: 'auto', color: '#82B8D4', fontWeight: 700 }}>✓</span>}
                      </div>
                    ))}
                  </div>
                  {payMonitor && PLATFORMS[payMonitor] && (
                    <Button type="primary" size="large"
                      onClick={() => openPaymentDashboard(payMonitor)}
                    >
                      🔗 Open {PLATFORMS[payMonitor].label} Now
                    </Button>
                  )}
                </div>
              ),
            },
            {
              key: 'loyalty',
              label: '🎁 Loyalty',
              children: (
                <div style={{ maxWidth: 520 }}>
                  <Alert
                    type="info" showIcon style={{ marginBottom: 20 }}
                    message="Loyalty Rewards Program"
                    description="Reward repeat customers with points on every bill. Points can be redeemed as ₹ discount (1 point = ₹1). If Google Wallet is enabled on the server, customers will get a Google Wallet card link on WhatsApp."
                  />
                  <Form
                    form={loyaltyForm}
                    layout="vertical"
                    onFinish={saveLoyalty}
                    initialValues={{
                      enabled: false,
                      program_name: 'Rewards',
                      rupees_per_point: 100,
                      welcome_bonus: 0,
                      min_redeem_points: 50,
                      max_redeem_percent: 50,
                      terms: '',
                    }}
                  >
                    <Form.Item name="enabled" label="Enable loyalty program" valuePropName="checked">
                      <Switch />
                    </Form.Item>
                    <Form.Item name="program_name" label="Program name" extra="Shown on customer's Google Wallet card">
                      <Input placeholder="e.g. Ramesh Kirana Rewards" />
                    </Form.Item>
                    <Form.Item
                      name="rupees_per_point"
                      label="Points ratio"
                      extra="Customers earn 1 point per this many rupees spent. E.g. ₹100 → 1 point."
                    >
                      <InputNumber min={1} max={10000} step={10} style={{ width: 200 }} addonBefore="₹" addonAfter="= 1 point" />
                    </Form.Item>
                    <Form.Item
                      name="welcome_bonus"
                      label="Welcome bonus"
                      extra="Points given to a customer on their first bill (0 to disable)."
                    >
                      <InputNumber min={0} max={10000} style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item
                      name="min_redeem_points"
                      label="Minimum points to redeem"
                      extra="Customer must have at least this many points before redeeming."
                    >
                      <InputNumber min={0} max={100000} style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item
                      name="max_redeem_percent"
                      label="Max redemption %"
                      extra="Cap points redemption to this % of any single bill."
                    >
                      <InputNumber min={0} max={100} style={{ width: 200 }} addonAfter="%" />
                    </Form.Item>
                    <Form.Item name="terms" label="Terms &amp; conditions (optional)">
                      <Input.TextArea rows={2} placeholder="e.g. Points valid for 1 year, non-transferable" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={saving}>Save Loyalty Program</Button>
                  </Form>

                  {loyalty && (
                    <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(201,168,76,0.08)', borderRadius: 8, border: '1px solid rgba(201,168,76,0.2)', fontSize: 13 }}>
                      <div><strong>Google Wallet status:</strong>{' '}
                        {loyalty.wallet_configured
                          ? <span style={{ color: '#4caf50' }}>✓ Card class provisioned</span>
                          : <span style={{ color: '#c9a84c' }}>⏳ Not yet configured on server</span>}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                        Points work fully without Google Wallet. When issuer credentials are added to the server, customers will start receiving Wallet card links automatically.
                      </div>
                    </div>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}