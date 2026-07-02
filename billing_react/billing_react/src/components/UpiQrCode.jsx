import React from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Typography } from 'antd'

const { Text } = Typography

export default function UpiQrCode({ bill, storeProfile, storeName, size = 180 }) {
  const upiId = storeProfile?.upi_id?.trim()
  if (!upiId) return null

  const amount = Math.round(bill.grand_total)
  const upiUrl =
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent(storeName || '')}` +
    `&am=${amount}` +
    `&cu=INR` +
    `&tr=${encodeURIComponent(bill.bill_no)}` +
    `&tn=${encodeURIComponent(`Payment for ${bill.bill_no}`)}`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 16,
        margin: '12px 0',
        background: '#ffffff',
        borderRadius: 14,
        boxShadow: 'inset 3px 3px 8px #d1d9e6, inset -3px -3px 8px #ffffff',
      }}
    >
      <Text strong style={{ fontSize: 15, marginBottom: 4 }}>
        📱 Scan to Pay ₹{amount}
      </Text>
      <Text type="secondary" style={{ fontSize: 11, marginBottom: 10 }}>
        Any UPI app · GPay · PhonePe · Paytm
      </Text>
      <div
        style={{
          padding: 10,
          background: '#fff',
          borderRadius: 10,
          boxShadow: '3px 3px 10px #d1d9e6, -3px -3px 10px #ffffff',
        }}
      >
        <QRCodeSVG
          value={upiUrl}
          size={size}
          level="M"
          includeMargin={false}
          bgColor="#ffffff"
          fgColor="#1a1a1a"
        />
      </div>
      <Text style={{ fontSize: 11, color: '#888', marginTop: 8 }}>
        UPI ID: <Text code style={{ fontSize: 11 }}>{upiId}</Text>
      </Text>
    </div>
  )
}
