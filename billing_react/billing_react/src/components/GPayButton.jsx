import React, { useState } from 'react'
import { Button, message, Tag } from 'antd'

const IS_ANDROID = /Android/i.test(navigator.userAgent)

/**
 * GPayButton — integrates Google Pay for both Android and Web.
 *
 * Android (TWA/APK): uses upi:// deep link which opens GPay/PhonePe/any UPI app.
 * Web (Chrome desktop/iOS): uses Payment Request API with https://tez.google.com/pay.
 * Fallback: plain upi:// link shown as a button.
 */
export default function GPayButton({ bill, storeProfile, storeName, size = 'middle' }) {
  const [status, setStatus] = useState(null) // null | 'success' | 'pending' | 'fail'
  const [loading, setLoading] = useState(false)

  const upiId  = storeProfile?.upi_id?.trim()
  const gstin  = storeProfile?.gstin || ''
  const amount = String(Math.round(bill.grand_total))
  const billNo = bill.bill_no
  const note   = `Payment for ${billNo}`

  if (!upiId) return null

  // ── Android: UPI deep link ────────────────────────────────────────────────
  async function payAndroid() {
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount}&cu=INR&tr=${billNo}&tn=${encodeURIComponent(note)}`
    window.location.href = upiUrl
    // Android doesn't return a result to the web page — mark as pending
    setTimeout(() => {
      setStatus('pending')
      message.info('Check GPay / PhonePe for payment confirmation.')
    }, 1500)
  }

  // ── Web: Payment Request API (GPay) ─────────────────────────────────────
  async function payWeb() {
    if (!window.PaymentRequest) {
      // Fallback: open UPI link in new tab
      window.open(`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount}&cu=INR&tr=${billNo}`, '_blank')
      setStatus('pending')
      return
    }

    const methods = [
      {
        supportedMethods: 'https://tez.google.com/pay',
        data: {
          pa: upiId,
          pn: storeName,
          tr: billNo,
          tn: note,
          am: amount,
          cu: 'INR',
          mc: '5411',
          ...(gstin ? { gstIn: gstin, invoiceNo: billNo, invoiceDate: new Date().toISOString() } : {}),
        },
      },
    ]
    const details = {
      total: { label: storeName, amount: { currency: 'INR', value: amount } },
    }

    setLoading(true)
    try {
      const request = new PaymentRequest(methods, details)
      const canPay = await request.canMakePayment().catch(() => false)
      if (!canPay) {
        // GPay not available — open UPI deep link
        window.open(`upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(storeName)}&am=${amount}&cu=INR&tr=${billNo}`, '_blank')
        setStatus('pending')
        message.info('UPI link opened. Confirm payment manually.')
        return
      }
      const response = await request.show()
      await response.complete('success')
      setStatus('success')
      message.success(`Payment of ₹${amount} initiated via GPay!`)
    } catch (err) {
      if (err.name === 'AbortError') {
        setStatus('fail')
        message.warning('Payment cancelled.')
      } else {
        setStatus('fail')
        message.error('GPay error: ' + err.message)
      }
    } finally {
      setLoading(false)
    }
  }

  const statusTag = {
    success: <Tag color="success" style={{ marginLeft: 8 }}>✓ Initiated</Tag>,
    pending: <Tag color="warning" style={{ marginLeft: 8 }}>⏳ Pending</Tag>,
    fail:    <Tag color="error"   style={{ marginLeft: 8 }}>✗ Cancelled</Tag>,
  }[status]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <Button
        size={size}
        loading={loading}
        onClick={IS_ANDROID ? payAndroid : payWeb}
        style={{
          background: 'linear-gradient(135deg, #4285F4, #34A853)',
          border: 'none', color: '#fff', fontWeight: 600,
          boxShadow: '3px 3px 10px rgba(66,133,244,0.35)',
          borderRadius: 10,
        }}
        icon={<span style={{ fontSize: 15 }}>G</span>}
      >
        Pay with GPay
      </Button>
      {statusTag}
    </span>
  )
}