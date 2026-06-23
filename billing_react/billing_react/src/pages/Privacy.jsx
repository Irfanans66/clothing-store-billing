import React from 'react'
import { Typography, Divider } from 'antd'

const { Title, Paragraph, Text } = Typography

export default function Privacy() {
  return (
    <div style={{
      maxWidth: 760,
      margin: '0 auto',
      padding: '48px 24px',
      fontFamily: "'Poppins', sans-serif",
      color: '#222',
      background: '#fff',
      minHeight: '100vh',
    }}>
      <Title level={2} style={{ color: '#1a1a1a' }}>Privacy Policy – Local Billing</Title>
      <Text type="secondary">Last updated: June 2026</Text>
      <Divider />

      <Paragraph>
        Local Billing is a billing and point-of-sale application for clothing stores and boutiques.
      </Paragraph>

      <Title level={4}>Data We Collect</Title>
      <ul>
        <li>Store name, contact details, and GSTIN entered during setup</li>
        <li>Customer names and phone numbers added by the store owner</li>
        <li>Product and billing data created by the store</li>
      </ul>

      <Title level={4}>How We Use Your Data</Title>
      <ul>
        <li>All data is used solely to operate the billing system for your store</li>
        <li>We do not sell, share, or transfer your data to any third parties</li>
      </ul>

      <Title level={4}>Data Storage</Title>
      <ul>
        <li>Your data is stored securely on our servers</li>
        <li>Billing data remains private to your store account and is not accessible to other users</li>
      </ul>

      <Title level={4}>Payments</Title>
      <ul>
        <li>We do not store any payment card information</li>
        <li>UPI payment details are used only to generate QR codes for your customers</li>
      </ul>

      <Title level={4}>Offline Data</Title>
      <ul>
        <li>When used offline, bills are temporarily stored on your device and synced to our servers when internet is restored</li>
      </ul>

      <Title level={4}>Contact</Title>
      <Paragraph>
        For any privacy concerns, contact us at:{' '}
        <a href="mailto:developers@playo.co">developers@playo.co</a>
      </Paragraph>
    </div>
  )
}