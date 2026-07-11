import React from 'react'
import { Typography, Divider } from 'antd'

const { Title, Paragraph, Text } = Typography

export default function Terms() {
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
      <Title level={2} style={{ color: '#1a1a1a' }}>Terms of Service – Local Billing</Title>
      <Text type="secondary">Last updated: July 2026</Text>
      <Divider />

      <Paragraph>
        Local Billing ("we", "our", "the Service") is a multi-tenant billing and point-of-sale
        Software-as-a-Service platform operated by Irfan Ansari, Bengaluru, India. These Terms
        of Service govern your use of the Service.
      </Paragraph>

      <Title level={4}>1. Who Can Use the Service</Title>
      <ul>
        <li>Retail shopkeepers, boutiques, and small businesses in India</li>
        <li>You must be at least 18 years old and legally able to run a business</li>
        <li>You are responsible for the accuracy of the information you enter</li>
      </ul>

      <Title level={4}>2. Your Account</Title>
      <ul>
        <li>You register a store account with a username and password</li>
        <li>You are responsible for keeping your credentials secure</li>
        <li>You are responsible for all activity performed under your account, including by staff you add</li>
      </ul>

      <Title level={4}>3. Your Data</Title>
      <ul>
        <li>All data you enter (customers, products, bills) belongs to you</li>
        <li>You may export or request deletion at any time by emailing us</li>
        <li>See our <a href="/privacy">Privacy Policy</a> for how we store and protect your data</li>
      </ul>

      <Title level={4}>4. Loyalty Program &amp; Google Wallet</Title>
      <ul>
        <li>
          If you enable the loyalty program, your customers may receive a digital loyalty card
          via Google Wallet. The card is issued under the Local Billing Google Wallet Issuer
          account, on behalf of your store.
        </li>
        <li>Loyalty points shown on customer cards reflect the balance at the time of the last sync</li>
        <li>You are responsible for honouring the points and terms you configure in your program</li>
        <li>
          We may suspend the loyalty program for accounts that violate Google Wallet
          policies (fraudulent activity, misleading terms, etc.)
        </li>
      </ul>

      <Title level={4}>5. Payments &amp; Fees</Title>
      <ul>
        <li>UPI and payment features integrate with third-party providers (Google Pay, PhonePe, etc.)</li>
        <li>We do not process or store payment card information</li>
        <li>Subscription pricing (when applicable) is billed monthly and shown on your account page</li>
      </ul>

      <Title level={4}>6. Acceptable Use</Title>
      <Paragraph>You agree not to:</Paragraph>
      <ul>
        <li>Use the Service for illegal or fraudulent business</li>
        <li>Attempt to reverse-engineer, resell, or copy the Service</li>
        <li>Send spam, unauthorized messages, or misuse WhatsApp integration</li>
        <li>Store customer data without their consent, or share it with unrelated third parties</li>
      </ul>

      <Title level={4}>7. Service Availability</Title>
      <ul>
        <li>We aim for high availability but do not guarantee uninterrupted service</li>
        <li>Offline mode allows you to keep billing during short outages; data syncs on reconnection</li>
        <li>Scheduled maintenance is announced in advance where possible</li>
      </ul>

      <Title level={4}>8. Termination</Title>
      <ul>
        <li>You can stop using the Service at any time</li>
        <li>We may suspend accounts that violate these Terms, applicable law, or Google Wallet policies</li>
        <li>On termination, your data is retained for 30 days for recovery, then permanently deleted</li>
      </ul>

      <Title level={4}>9. Limitation of Liability</Title>
      <ul>
        <li>The Service is provided "as is" without warranty of any kind</li>
        <li>We are not liable for indirect or consequential losses arising from use of the Service</li>
        <li>Our total liability is limited to fees paid by you in the last 12 months</li>
      </ul>

      <Title level={4}>10. Changes to These Terms</Title>
      <Paragraph>
        We may update these Terms occasionally. Material changes will be announced via
        email or in-app notice. Continued use of the Service after changes means you accept
        the updated Terms.
      </Paragraph>

      <Title level={4}>11. Governing Law</Title>
      <Paragraph>
        These Terms are governed by the laws of India. Any disputes will be resolved in
        the courts of Bengaluru, Karnataka.
      </Paragraph>

      <Title level={4}>12. Contact</Title>
      <Paragraph>
        For questions or concerns, contact us at:{' '}
        <a href="mailto:8809968819i@gmail.com">8809968819i@gmail.com</a>
        <br />
        Local Billing, KR Puram, Bengaluru 560036, Karnataka, India
      </Paragraph>
    </div>
  )
}