import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card, Form, Input, Button, Typography, Tag, message, Select, Collapse, Modal, Grid, Spin, Alert,
} from 'antd'
import {
  SendOutlined, PhoneOutlined, SearchOutlined, PaperClipOutlined, DeleteOutlined, CheckCircleFilled,
  RightOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { submitSupportTicket, getMyTickets, replyToTicket, deleteMyTicket } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useT, translate } from '../i18n'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const WA      = '#25D366'

const SUPPORT_PHONE = '+918809968819'
const SUPPORT_PHONE_LABEL = '+91 88099 68819'
// Fill these in to show them on the page (left empty so we don't promise hours we can't keep)
const SUPPORT_HOURS = ''          // e.g. 'Mon–Sat, 10 am – 8 pm'
const SUPPORT_REPLY_TIME = ''     // e.g. 'We usually reply within 2 hours'

const CATEGORIES = ['Billing', 'Printing', 'Payments', 'Account', 'Other']
const STATUS_COLOR = { Open: 'orange', 'In Progress': 'blue', Resolved: 'green' }

// Fill {placeholders} in an already-translated sentence with JSX (bold words, code)
function rich(text, parts) {
  return text.split(/(\{\w+\})/).map((s, i) => {
    const m = s.match(/^\{(\w+)\}$/)
    return m && m[1] in parts ? <React.Fragment key={i}>{parts[m[1]]}</React.Fragment> : s
  })
}

// Self-help answers, written for this app's screens. Built per render so they follow the shop's language;
// each paragraph is one sentence key, with the bold words filled in through {placeholders}.
function buildFaq(t) {
  const b = (text) => <b>{t(text)}</b>
  return [
    {
      q: t('A receipt isn’t printing, or prints too small / cut off'),
      tags: 'print printer receipt pdf thermal 58 80 small cut',
      a: <>
        <p>{rich(t('Go to {receiptSettings} and choose the layout that matches your paper: {roll58}, {roll80}, or one of the invoice layouts. Save.'),
          { receiptSettings: b('Settings → Receipt'), roll58: b('58 mm roll'), roll80: b('80 mm roll') })}</p>
        <p>{rich(t('In the print window, pick your receipt printer, set {scale} to “Actual size” / 100% and {margins} to None.'),
          { scale: b('Scale'), margins: b('Margins') })}</p>
        <p>{t('On a phone, the receipt opens in the share sheet — choose your Bluetooth printer’s app or “Print”.')}</p>
      </>,
      link: ['/settings?tab=receipt', t('Open receipt settings')],
    },
    {
      q: t('How do I set up the UPI QR code?'),
      tags: 'upi qr gpay phonepe paytm payment scan',
      a: <>
        <p>{rich(t('Go to {upiSettings}, enter your UPI ID (like {example}) and save.'),
          { upiSettings: b('Settings → UPI'), example: <code>shopname@okaxis</code> })}</p>
        <p>{t('The QR then appears in New Bill when you choose UPI, and on printed receipts (you can hide it in Settings → Receipt).')}</p>
      </>,
      link: ['/settings?tab=upi', t('Open UPI settings')],
    },
    {
      q: t('How do I print barcode labels?'),
      tags: 'barcode label tag sticker zenpert print products',
      a: <>
        <p>{rich(t('On {products}, tick the products you want and press {printLabels}, or use “Print labels” from a product’s ⋮ menu.'),
          { products: b('Products'), printLabels: b('Print labels') })}</p>
        <p>{rich(t('Pick the label size and design, check the preview, then use {testPrint} to check alignment before printing the rest.'),
          { testPrint: b('Test print') })}</p>
        <p>{t('Adding stock also offers to print one label per new piece.')}</p>
      </>,
      link: ['/barcode-labels', t('Open barcode labels')],
    },
    {
      q: t('How do loyalty points work?'),
      tags: 'loyalty points rewards redeem wallet',
      a: <>
        <p>{rich(t('Turn the program on in {loyaltySettings} and choose how much a customer spends to earn 1 point (1 point = ₹1 off).'),
          { loyaltySettings: b('Settings → Loyalty') })}</p>
        <p>{t('Points are added automatically when you bill a named customer. To use them, the “Redeem points” box appears in New Bill’s summary.')}</p>
      </>,
      link: ['/settings?tab=loyalty', t('Open loyalty settings')],
    },
    {
      q: t('A customer wants to return or exchange something'),
      tags: 'return exchange refund size store credit',
      a: <>
        <p>{rich(t('In {newBill} press {returnExchange} and type the bill number, or open the bill in {billHistory} and press {returnExchange}.'),
          { newBill: b('New Bill'), returnExchange: b('Return / Exchange'), billHistory: b('Bill history') })}</p>
        <p>{rich(t('Refund in cash or as {storeCredit} the customer can spend on their next bill. For an exchange, return the item, then bill the new size.'),
          { storeCredit: b('store credit') })}</p>
      </>,
      link: ['/bill-history', t('Open bill history')],
    },
    {
      q: t('How do I give credit (udhaar) and collect it later?'),
      tags: 'credit udhaar due pay later collect balance',
      a: <>
        <p>{rich(t('In New Bill choose a customer, then {payLater}. The amount is added to what they owe.'),
          { payLater: b('Pay later') })}</p>
        <p>{rich(t('To collect, open {customersWithDues} and press {collect}, or send a WhatsApp reminder from their menu.'),
          { customersWithDues: b('Customers → With dues'), collect: b('Collect') })}</p>
      </>,
      link: ['/customers?dues=1', t('Customers with dues')],
    },
    {
      q: t('I made a wrong bill — how do I cancel it?'),
      tags: 'cancel void delete wrong bill mistake',
      a: <>
        <p>{rich(t('Open the bill in {billHistory} and press {cancelBill} (store Admin only). Give a reason.'),
          { billHistory: b('Bill history'), cancelBill: b('Cancel bill') })}</p>
        <p>{t('The bill stays in history, struck through, and is removed from sales reports. Stock and the customer’s balance are put back.')}</p>
      </>,
      link: ['/bill-history', t('Open bill history')],
    },
    {
      q: t('How do I add staff and control what they can do?'),
      tags: 'staff team cashier manager user login password role',
      a: <>
        <p>{rich(t('Go to {team} to add a login for each person. Cashiers can bill; Managers can also manage products; only the Admin can change settings and cancel bills.'),
          { team: b('Team') })}</p>
      </>,
      link: ['/team', t('Open team')],
    },
    {
      q: t('Can I bill without internet?'),
      tags: 'offline internet network sync',
      a: <>
        <p>{t('Yes. If the connection drops, New Bill saves the bill on the device and sends it automatically when you’re back online. A banner shows while you’re offline.')}</p>
      </>,
    },
  ]
}

const CSS = `
.hp-card { border-radius: 14px; margin-bottom: 16px; }
.hp-card .ant-card-body { padding: 24px; }
.hp-h { font-size: 16px; font-weight: 700; color: ${TEXT}; margin: 0 0 12px; }
.hp-wa.ant-btn { background: ${WA} !important; border-color: ${WA} !important; color: #fff !important; font-weight: 700; }
.hp-wa.ant-btn:hover { background: #1ebe5b !important; }
.hp-faq .ant-collapse-header { font-weight: 600; color: ${TEXT} !important; }
.hp-faq p { margin: 0 0 8px; color: ${TEXT}; }
.hp-msg { border-radius: 10px; padding: 8px 12px; margin-top: 8px; font-size: 13.5px; white-space: pre-wrap; }
.hp-store { background: rgba(47,102,144,0.08); }
.hp-support { background: rgba(30,132,73,0.1); border-left: 3px solid #1E8449; }
@media (max-width: 767px) { .hp-card .ant-card-body { padding: 16px; } }
`

// Shrink a screenshot before upload (≤ 1280 px, JPEG)
function readScreenshot(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error(translate('Attach an image (screenshot or photo)'))); return }
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => reject(new Error(translate('Could not read that image')))
    img.src = URL.createObjectURL(file)
  })
}

export default function Help() {
  const t = useT()
  const navigate = useNavigate()
  const { storeName, storeCode } = useAuthStore()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [form] = Form.useForm()
  const [tickets, setTickets] = useState(null)   // null = loading
  const [sending, setSending] = useState(false)
  const [created, setCreated] = useState(null)
  const [screenshot, setScreenshot] = useState(null)
  const [faqQuery, setFaqQuery] = useState('')
  const [replying, setReplying] = useState({})   // ticket id -> draft text
  const [viewImage, setViewImage] = useState(null)
  const fileRef = useRef(null)

  const waText = `Hi, I need help with Loacal Billing (Store: ${storeName || ''}${storeCode ? `, ${storeCode}` : ''})`
  const waUrl = `https://wa.me/${SUPPORT_PHONE.replace(/\D/g, '')}?text=${encodeURIComponent(waText)}`

  function loadTickets() {
    return getMyTickets().then((d) => setTickets(Array.isArray(d) ? d : [])).catch(() => setTickets([]))
  }
  useEffect(() => { loadTickets() }, [])

  async function handleSubmit(values) {
    setSending(true)
    try {
      const ticket = await submitSupportTicket({ ...values, screenshot })
      setCreated(ticket)
      form.resetFields()
      setScreenshot(null)
      loadTickets()
    } catch (err) {
      message.error(err.message || t('Failed to submit. Please try again.'))
    } finally {
      setSending(false)
    }
  }

  async function onFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setScreenshot(await readScreenshot(f)) } catch (err) { message.error(err.message) }
  }

  async function sendReply(tk) {
    const text = (replying[tk.id] || '').trim()
    if (!text) return
    try {
      await replyToTicket(tk.id, text)
      setReplying((r) => ({ ...r, [tk.id]: undefined }))
      message.success(t('Added to ticket #{id}', { id: tk.id }))
      loadTickets()
    } catch (err) { message.error(err.message) }
  }

  function confirmDelete(tk) {
    Modal.confirm({
      title: t('Delete ticket #{id}?', { id: tk.id }), content: tk.subject, okText: t('Delete'), cancelText: t('Cancel'), okButtonProps: { danger: true },
      onOk: () => deleteMyTicket(tk.id).then(() => { message.success(t('Ticket deleted')); loadTickets() }).catch((err) => message.error(err.message)),
    })
  }

  const q = faqQuery.trim().toLowerCase()
  const faqShown = buildFaq(t).filter((f) => !q || f.q.toLowerCase().includes(q) || f.tags.includes(q))

  // Conversation: the original message, then follow-ups (older tickets only have admin_reply)
  const thread = (tk) => {
    const msgs = tk.messages?.length ? tk.messages
      : tk.admin_reply ? [{ id: 'legacy', author: 'support', message: tk.admin_reply, created_at: tk.updated_at }] : []
    return msgs
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <style>{CSS}</style>
      <Title level={isMobile ? 4 : 3} style={{ margin: '0 0 4px', color: TEXT }}>{t('Help & support')}</Title>
      <Text style={{ display: 'block', marginBottom: 16, color: SUB }}>
        {t('Find a quick answer below, or contact us — we’re happy to help.')}
      </Text>

      {/* Contact */}
      <Card className="hp-card" style={{ background: 'linear-gradient(135deg, #e7fbe9 0%, #f3fff6 100%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="hp-h" style={{ marginBottom: 4, color: '#1a7a36' }}>{t('Talk to us')}</div>
            <div style={{ color: TEXT, fontSize: 13.5 }}>
              {t('WhatsApp is fastest. Your store name is added to the message so we know who’s writing.')}
            </div>
            {(SUPPORT_HOURS || SUPPORT_REPLY_TIME) && (
              <div style={{ color: SUB, fontSize: 12.5, marginTop: 4 }}>{[SUPPORT_REPLY_TIME, SUPPORT_HOURS].filter(Boolean).join(' · ')}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button className="hp-wa" size="large" href={waUrl} target="_blank" rel="noopener noreferrer">
              {t('Chat on WhatsApp')}
            </Button>
            <Button size="large" icon={<PhoneOutlined />} href={`tel:${SUPPORT_PHONE}`}>{SUPPORT_PHONE_LABEL}</Button>
          </div>
        </div>
      </Card>

      {/* FAQ */}
      <Card className="hp-card">
        <div className="hp-h">{t('Quick answers')}</div>
        <Input prefix={<SearchOutlined />} placeholder={t('Search, e.g. printing, UPI, return')} allowClear
          value={faqQuery} onChange={(e) => setFaqQuery(e.target.value)} style={{ marginBottom: 12 }} />
        {faqShown.length === 0 ? (
          <div style={{ color: SUB, fontSize: 13.5, padding: '8px 0' }}>{t('No quick answer for that — send us a ticket below.')}</div>
        ) : (
          <Collapse className="hp-faq" accordion bordered={false} style={{ background: 'transparent' }}
            items={faqShown.map((f) => ({
              key: f.q,
              label: f.q,
              children: (
                <div>
                  {f.a}
                  {f.link && (
                    <Button type="link" style={{ padding: 0, color: PRIMARY }} onClick={() => navigate(f.link[0])}>
                      {f.link[1]} <RightOutlined style={{ fontSize: 10 }} />
                    </Button>
                  )}
                </div>
              ),
            }))} />
        )}
      </Card>

      {/* New ticket */}
      <Card className="hp-card">
        <div className="hp-h">{t('Send us a ticket')}</div>
        {created && (
          <Alert type="success" showIcon closable onClose={() => setCreated(null)} style={{ marginBottom: 16 }}
            icon={<CheckCircleFilled />}
            message={t('Ticket #{id} created', { id: created.id })}
            description={t('We’ll reply here — you’ll see it under “My tickets” below. For anything urgent, message us on WhatsApp.')} />
        )}
        <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={{ category: undefined }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '200px 1fr', gap: '0 12px' }}>
            <Form.Item name="category" label={t('Topic')} rules={[{ required: true, message: t('Choose a topic') }]}>
              <Select placeholder={t('Choose…')} options={CATEGORIES.map((c) => ({ value: c, label: t(c) }))} />
            </Form.Item>
            <Form.Item name="subject" label={t('Subject')} rules={[{ required: true, message: t('Please enter a subject') }]}>
              <Input placeholder={t('e.g. Receipt not printing')} maxLength={200} />
            </Form.Item>
          </div>
          <Form.Item name="message" label={t('What happened?')} rules={[{ required: true, message: t('Please describe the problem') }]}>
            <Input.TextArea rows={5} placeholder={t('What were you trying to do, and what happened instead?')} maxLength={2000} showCount />
          </Form.Item>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <Button icon={<PaperClipOutlined />} onClick={() => fileRef.current?.click()}>{screenshot ? t('Change screenshot') : t('Attach a screenshot')}</Button>
            <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
            {screenshot && (
              <>
                <img src={screenshot} alt={t('Attached screenshot')} style={{ height: 48, borderRadius: 6, cursor: 'pointer' }} onClick={() => setViewImage(screenshot)} />
                <Button size="small" icon={<DeleteOutlined />} onClick={() => setScreenshot(null)} aria-label={t('Remove screenshot')} />
              </>
            )}
            <span style={{ fontSize: 12, color: SUB }}>{t('Optional — a photo of the problem helps us fix it faster.')}</span>
          </div>
          <Button type="primary" htmlType="submit" loading={sending} icon={<SendOutlined />}>{t('Send ticket')}</Button>
        </Form>
      </Card>

      {/* My tickets */}
      <Card className="hp-card">
        <div className="hp-h">{t('My tickets')}</div>
        {tickets === null ? <div style={{ textAlign: 'center', padding: 20 }}><Spin /></div>
          : tickets.length === 0 ? (
            <div style={{ color: SUB, fontSize: 13.5 }}>{t('No tickets yet. If something isn’t working, send us a ticket above.')}</div>
          ) : tickets.map((tk) => (
            <div key={tk.id} style={{ borderTop: '1px solid rgba(0,0,0,0.08)', padding: '14px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ color: SUB, fontWeight: 700, marginRight: 6 }}>#{tk.id}</span>
                  <b style={{ color: TEXT }}>{tk.subject}</b>
                  <div style={{ fontSize: 12.5, color: SUB, marginTop: 2 }}>
                    {tk.category && <Tag style={{ marginRight: 6 }}>{t(tk.category)}</Tag>}
                    {t('Sent {date}', { date: dayjs(tk.created_at).format('D MMM YYYY, h:mm A') })}
                    {tk.updated_at && dayjs(tk.updated_at).diff(dayjs(tk.created_at), 'minute') > 0 && <> · {t('Updated {date}', { date: dayjs(tk.updated_at).format('D MMM, h:mm A') })}</>}
                  </div>
                </div>
                <Tag color={STATUS_COLOR[tk.status] || 'default'} style={{ margin: 0, flexShrink: 0 }}>{t(tk.status)}</Tag>
              </div>
              <div className="hp-msg hp-store">{tk.message}</div>
              {tk.screenshot && (
                <img src={tk.screenshot} alt={t('Screenshot for ticket {id}', { id: tk.id })} onClick={() => setViewImage(tk.screenshot)}
                  style={{ height: 64, borderRadius: 6, marginTop: 8, cursor: 'pointer' }} />
              )}
              {thread(tk).map((m) => (
                <div key={m.id} className={`hp-msg ${m.author === 'support' ? 'hp-support' : 'hp-store'}`}>
                  <div style={{ fontSize: 12, color: SUB, marginBottom: 2 }}>
                    {m.author === 'support' ? t('Loacal Billing support') : (m.username || t('You'))}
                    {m.created_at && ` · ${dayjs(m.created_at).format('D MMM, h:mm A')}`}
                  </div>
                  {m.message}
                </div>
              ))}
              {replying[tk.id] !== undefined ? (
                <div style={{ marginTop: 8 }}>
                  <Input.TextArea rows={2} autoFocus maxLength={2000} value={replying[tk.id]} placeholder={t('Add more details or reply to support…')}
                    onChange={(e) => setReplying((r) => ({ ...r, [tk.id]: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    <Button type="primary" size="small" onClick={() => sendReply(tk)} disabled={!replying[tk.id]?.trim()}>{t('Send')}</Button>
                    <Button size="small" onClick={() => setReplying((r) => ({ ...r, [tk.id]: undefined }))}>{t('Cancel')}</Button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button size="small" onClick={() => setReplying((r) => ({ ...r, [tk.id]: '' }))}>
                    {tk.status === 'Resolved' ? t('Reopen with a reply') : t('Reply')}
                  </Button>
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(tk)}>{t('Delete')}</Button>
                </div>
              )}
            </div>
          ))}
      </Card>

      <Modal open={!!viewImage} onCancel={() => setViewImage(null)} footer={null} width={900} title={t('Screenshot')}>
        {viewImage && <img src={viewImage} alt={t('Screenshot')} style={{ width: '100%', borderRadius: 8 }} />}
      </Modal>
    </div>
  )
}
