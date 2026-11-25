import { useState } from 'react'
import { Typography, Divider, Button } from 'antd'
import { useT, useLangStore } from '../i18n'

const { Title, Text } = Typography

/** Page frame for Terms and Privacy. In another language the page is a translation:
 *  a note says the English text is the one that counts, with a switch to read it. */
export default function LegalPage({ title, updated, children }) {
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const [english, setEnglish] = useState(false)
  // the page text: translated, or the English original when asked
  const page = english ? (s, v) => (v ? s.replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s) : t
  return (
    <div dir={english ? 'ltr' : undefined} style={{
      maxWidth: 760,
      margin: '0 auto',
      padding: '48px 24px',
      fontFamily: "'Poppins', sans-serif",
      color: '#222',
      background: '#fff',
      minHeight: '100vh',
      ...(english && { textAlign: 'left' }),
    }}>
      {lang !== 'en' && (
        <div style={{ background: '#F4F1EC', borderRadius: 8, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
          {english ? (
            <Button type="link" size="small" style={{ padding: 0 }} onClick={() => setEnglish(false)}>{t('Show the translation')}</Button>
          ) : (
            <>
              {t('This is a translation for your convenience. If it differs from the English version, the English version applies.')}{' '}
              <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={() => setEnglish(true)}>{t('Read in English')}</Button>
            </>
          )}
        </div>
      )}
      <Title level={2} style={{ color: '#1a1a1a' }}>{page(title)} – Loacal Billing</Title>
      <Text type="secondary">{page('Last updated: {date}', { date: page(updated) })}</Text>
      <Divider />
      {children(page)}
    </div>
  )
}
