import { Typography } from 'antd'
import LegalPage from './LegalPage'
import { rich } from '../i18n/rich'

const { Title, Paragraph } = Typography

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="June 2026">
      {(t) => (
        <>
          <Paragraph>
            {t('Loacal Billing is a billing and point-of-sale application for clothing stores and boutiques.')}
          </Paragraph>

          <Title level={4}>{t('Data We Collect')}</Title>
          <ul>
            <li>{t('Store name, contact details, and GSTIN entered during setup')}</li>
            <li>{t('Customer names and phone numbers added by the store owner')}</li>
            <li>{t('Product and billing data created by the store')}</li>
          </ul>

          <Title level={4}>{t('How We Use Your Data')}</Title>
          <ul>
            <li>{t('All data is used solely to operate the billing system for your store')}</li>
            <li>{t('We do not sell, share, or transfer your data to any third parties')}</li>
          </ul>

          <Title level={4}>{t('Data Storage')}</Title>
          <ul>
            <li>{t('Your data is stored securely on our servers')}</li>
            <li>{t('Billing data remains private to your store account and is not accessible to other users')}</li>
          </ul>

          <Title level={4}>{t('Payments')}</Title>
          <ul>
            <li>{t('We do not store any payment card information')}</li>
            <li>{t('UPI payment details are used only to generate QR codes for your customers')}</li>
          </ul>

          <Title level={4}>{t('Offline Data')}</Title>
          <ul>
            <li>{t('When used offline, bills are temporarily stored on your device and synced to our servers when internet is restored')}</li>
          </ul>

          <Title level={4}>{t('Contact')}</Title>
          <Paragraph>
            {rich(t('For any privacy concerns, contact us at: {email}'), {
              email: <a href="mailto:developers@playo.co">developers@playo.co</a>,
            })}
          </Paragraph>
        </>
      )}
    </LegalPage>
  )
}
