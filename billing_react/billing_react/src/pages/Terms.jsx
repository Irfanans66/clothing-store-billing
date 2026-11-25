import { Typography } from 'antd'
import LegalPage from './LegalPage'
import { rich } from '../i18n/rich'

const { Title, Paragraph } = Typography

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="July 2026">
      {(t) => (
        <>
          <Paragraph>
            {t('Loacal Billing ("we", "our", "the Service") is a multi-tenant billing and point-of-sale Software-as-a-Service platform operated by Irfan Ansari, Bengaluru, India. These Terms of Service govern your use of the Service.')}
          </Paragraph>

          <Title level={4}>{t('1. Who Can Use the Service')}</Title>
          <ul>
            <li>{t('Retail shopkeepers, boutiques, and small businesses in India')}</li>
            <li>{t('You must be at least 18 years old and legally able to run a business')}</li>
            <li>{t('You are responsible for the accuracy of the information you enter')}</li>
          </ul>

          <Title level={4}>{t('2. Your Account')}</Title>
          <ul>
            <li>{t('You register a store account with a username and password')}</li>
            <li>{t('You are responsible for keeping your credentials secure')}</li>
            <li>{t('You are responsible for all activity performed under your account, including by staff you add')}</li>
          </ul>

          <Title level={4}>{t('3. Your Data')}</Title>
          <ul>
            <li>{t('All data you enter (customers, products, bills) belongs to you')}</li>
            <li>{t('You may export or request deletion at any time by emailing us')}</li>
            <li>{rich(t('See our {privacy} for how we store and protect your data'), {
              privacy: <a href="/privacy">{t('Privacy Policy')}</a>,
            })}</li>
          </ul>

          <Title level={4}>{t('4. Loyalty Program & Google Wallet')}</Title>
          <ul>
            <li>{t('If you enable the loyalty program, your customers may receive a digital loyalty card via Google Wallet. The card is issued under the Loacal Billing Google Wallet Issuer account, on behalf of your store.')}</li>
            <li>{t('Loyalty points shown on customer cards reflect the balance at the time of the last sync')}</li>
            <li>{t('You are responsible for honouring the points and terms you configure in your program')}</li>
            <li>{t('We may suspend the loyalty program for accounts that violate Google Wallet policies (fraudulent activity, misleading terms, etc.)')}</li>
          </ul>

          <Title level={4}>{t('5. Payments & Fees')}</Title>
          <ul>
            <li>{t('UPI and payment features integrate with third-party providers (Google Pay, PhonePe, etc.)')}</li>
            <li>{t('We do not process or store payment card information')}</li>
            <li>{t('Subscription pricing (when applicable) is billed monthly and shown on your account page')}</li>
          </ul>

          <Title level={4}>{t('6. Acceptable Use')}</Title>
          <Paragraph>{t('You agree not to:')}</Paragraph>
          <ul>
            <li>{t('Use the Service for illegal or fraudulent business')}</li>
            <li>{t('Attempt to reverse-engineer, resell, or copy the Service')}</li>
            <li>{t('Send spam, unauthorized messages, or misuse WhatsApp integration')}</li>
            <li>{t('Store customer data without their consent, or share it with unrelated third parties')}</li>
          </ul>

          <Title level={4}>{t('7. Service Availability')}</Title>
          <ul>
            <li>{t('We aim for high availability but do not guarantee uninterrupted service')}</li>
            <li>{t('Offline mode allows you to keep billing during short outages; data syncs on reconnection')}</li>
            <li>{t('Scheduled maintenance is announced in advance where possible')}</li>
          </ul>

          <Title level={4}>{t('8. Termination')}</Title>
          <ul>
            <li>{t('You can stop using the Service at any time')}</li>
            <li>{t('We may suspend accounts that violate these Terms, applicable law, or Google Wallet policies')}</li>
            <li>{t('On termination, your data is retained for 30 days for recovery, then permanently deleted')}</li>
          </ul>

          <Title level={4}>{t('9. Limitation of Liability')}</Title>
          <ul>
            <li>{t('The Service is provided "as is" without warranty of any kind')}</li>
            <li>{t('We are not liable for indirect or consequential losses arising from use of the Service')}</li>
            <li>{t('Our total liability is limited to fees paid by you in the last 12 months')}</li>
          </ul>

          <Title level={4}>{t('10. Changes to These Terms')}</Title>
          <Paragraph>
            {t('We may update these Terms occasionally. Material changes will be announced via email or in-app notice. Continued use of the Service after changes means you accept the updated Terms.')}
          </Paragraph>

          <Title level={4}>{t('11. Governing Law')}</Title>
          <Paragraph>
            {t('These Terms are governed by the laws of India. Any disputes will be resolved in the courts of Bengaluru, Karnataka.')}
          </Paragraph>

          <Title level={4}>{t('12. Contact')}</Title>
          <Paragraph>
            {rich(t('For questions or concerns, contact us at: {email}'), {
              email: <a href="mailto:8809968819i@gmail.com">8809968819i@gmail.com</a>,
            })}
            <br />
            Loacal Billing, KR Puram, Bengaluru 560036, Karnataka, India
          </Paragraph>
        </>
      )}
    </LegalPage>
  )
}
