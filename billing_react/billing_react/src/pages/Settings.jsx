import React, { useEffect, useState } from 'react'
import { Card, Tabs, Form, Input, Button, message, Typography, Alert, Radio } from 'antd'
import { getStoreProfile, updateStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'

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
  const [saving, setSaving] = useState(false)
  const [previewUpi, setPreviewUpi] = useState('')
  const [paperSize, setPaperSize] = useState(
    () => localStorage.getItem('receipt_paper_size') || '3inch'
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
  }, [])

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
              label: '🖨️ Receipt Size',
              children: (
                <div style={{ maxWidth: 480 }}>
                  <Alert
                    type="info" showIcon style={{ marginBottom: 20 }}
                    message="Thermal Printer Paper Size"
                    description="Choose the paper roll size your thermal printer uses. This setting is saved on this device and applies to all printed receipts."
                  />
                  <div style={{ marginBottom: 12, fontWeight: 600 }}>Paper Width</div>
                  <Radio.Group
                    value={paperSize}
                    onChange={(e) => {
                      setPaperSize(e.target.value)
                      localStorage.setItem('receipt_paper_size', e.target.value)
                      message.success('Receipt size updated!')
                    }}
                  >
                    <Radio.Button value="2inch" style={{ marginRight: 8 }}>
                      2-inch (58mm)
                    </Radio.Button>
                    <Radio.Button value="3inch" style={{ marginRight: 8 }}>
                      3-inch Standard
                    </Radio.Button>
                    <Radio.Button value="3inch-bold">
                      3-inch Bold
                    </Radio.Button>
                  </Radio.Group>
                  <div style={{ marginTop: 16, color: '#888', fontSize: 12 }}>
                    {paperSize === '2inch' && 'Using 2-inch (58mm) paper — compact receipt with UPI QR.'}
                    {paperSize === '3inch' && 'Using 3-inch (80mm) standard receipt.'}
                    {paperSize === '3inch-bold' && 'Using 3-inch (80mm) bold receipt — large fonts, thick lines, easy to read.'}
                  </div>
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  )
}