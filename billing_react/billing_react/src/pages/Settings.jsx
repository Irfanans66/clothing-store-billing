import React, { useEffect, useRef, useState } from 'react'
import {
  Card, Tabs, Form, Input, Button, message, Typography, Alert, Switch, InputNumber, Select, Grid, Spin, Tooltip, Modal,
} from 'antd'
import {
  ShopOutlined, QrcodeOutlined, PrinterOutlined, GiftOutlined, AppstoreOutlined, CheckCircleFilled,
  UploadOutlined, DeleteOutlined, EyeOutlined, ReloadOutlined,
} from '@ant-design/icons'
import { QRCodeSVG } from 'qrcode.react'
import { useSearchParams } from 'react-router-dom'
import { getStoreProfile, updateStoreProfile, getLoyaltyProgram, updateLoyaltyProgram, getReceiptPreview } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { PrinterSection } from '../components/PrinterSetup'
import { useT, translate, useLangStore, LANGUAGE_OPTIONS } from '../i18n'
import { PLATFORMS, openPaymentDashboard } from '../utils/paymentPlatforms'
import { COUNTRIES, getCurrencyInfo, useCurrency } from '../utils/currency'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

// Draw page 1 of a PDF as an image (works on phones, no dark browser PDF viewer)
async function pdfToImage(blob) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2.2 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
  doc.destroy()
  return canvas.toDataURL('image/png')
}

const { Title } = Typography
const { useBreakpoint } = Grid

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const GOOD    = '#1E8449'

const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const RECEIPT_LAYOUTS = [
  { value: '2inch',      group: 'Thermal roll', name: '58 mm roll', desc: 'Small thermal printers. Compact, with UPI QR.' },
  { value: '3inch',      group: 'Thermal roll', name: '80 mm roll', desc: 'Standard thermal receipt. Most common.' },
  { value: '3inch-bold', group: 'Thermal roll', name: '80 mm bold', desc: 'Larger text and thicker lines, easier to read.' },
  { value: 'design1',    group: 'Invoice (80 mm)', name: 'Sales invoice', desc: 'Bordered, “You saved” box, barcode and points table.' },
  { value: 'design2',    group: 'Invoice (80 mm)', name: 'Dark header', desc: 'Black header, per-item discount, amount in words.' },
  { value: 'design3',    group: 'Invoice (80 mm)', name: 'Bill with logo', desc: 'Your logo, totals box and footer bar.' },
  { value: 'design4',    group: 'Invoice (80 mm)', name: 'Tax invoice', desc: 'GST breakdown table (CGST/SGST). Needs a GSTIN.' },
]


const CSS = `
.st-tabs .ant-tabs-nav { margin-bottom: 20px; }
.st-lang { padding: 14px; border-radius: 12px; background: rgba(47,102,144,0.07); margin-bottom: 20px; }
.st-tab { display: inline-flex; align-items: center; gap: 6px; }
@media (max-width: 767px) {
  .st-tab { flex-direction: column; gap: 2px; font-size: 11.5px; }
  .st-tab .anticon { font-size: 18px; margin: 0 !important; }
  .st-tabs .ant-tabs-tab { padding: 8px 2px !important; margin: 0 !important; flex: 1; justify-content: center; }
  .st-tabs .ant-tabs-nav-list { width: 100%; }
}
.st-receipt { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 24px; align-items: start; }
.st-layouts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.st-layout { position: relative; text-align: left; border: 2px solid transparent; border-radius: 12px; padding: 10px; cursor: pointer;
  background: var(--bg); box-shadow: var(--neu-sm); font-family: inherit; display: flex; gap: 10px; align-items: flex-start; }
.st-layout:hover { border-color: rgba(47,102,144,0.35); }
.st-layout-on { border-color: ${PRIMARY}; background: rgba(47,102,144,0.1); box-shadow: none; }
.st-section { font-size: 13px; font-weight: 700; color: ${SUB}; text-transform: uppercase; letter-spacing: 0.5px; margin: 18px 0 8px; }
.st-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }
.st-preview { background: #d9d4cc; border-radius: 12px; padding: 14px; display: flex; justify-content: center; }
.st-preview img { width: 100%; max-width: 330px; background: #fff; box-shadow: 0 4px 18px rgba(0,0,0,0.25); border-radius: 4px; }
.st-layout:disabled { cursor: not-allowed; opacity: 0.55; }
.st-layout:disabled:hover { border-color: transparent; }
.st-savebar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 18px; }
.st-choice { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 14px; cursor: pointer; border: 2px solid transparent;
  background: var(--bg); box-shadow: var(--neu-sm); font-family: inherit; width: 100%; text-align: left; }
.st-choice-on { border-color: ${PRIMARY}; background: rgba(47,102,144,0.1); box-shadow: none; }
@media (max-width: 1100px) { .st-receipt { grid-template-columns: 1fr; } }
@media (max-width: 767px) {
  .st-layouts { grid-template-columns: 1fr; }
  .st-savebar-sticky { position: fixed; left: 10px; right: 10px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 990;
    margin: 0; padding: 10px 12px; border-radius: 14px; background: var(--bg); box-shadow: 0 6px 24px rgba(0,0,0,0.22); }
}
`

// Small sketch of each receipt layout so the choice is visual, not just a name
function LayoutSketch({ value }) {
  const line = (w, h = 3, c = '#9a948e', mt = 3) => <div style={{ width: w, height: h, background: c, marginTop: mt, borderRadius: 1 }} />
  const box = { width: 46, height: 70, background: '#fff', borderRadius: 3, padding: 4, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.25)', overflow: 'hidden' }
  if (value === '2inch' || value === '3inch' || value === '3inch-bold') {
    const bold = value === '3inch-bold'
    return (
      <div style={{ ...box, width: value === '2inch' ? 34 : 46 }}>
        {line('70%', bold ? 5 : 4, '#333', 0)}
        {line('90%')}{line('90%')}{line('60%')}
        {line('100%', 1, '#555', 4)}
        {line('85%', bold ? 4 : 3, '#333')}
        <div style={{ width: 14, height: 14, margin: '5px auto 0', background: 'repeating-conic-gradient(#333 0 25%, #fff 0 50%) 0 0 / 5px 5px' }} />
      </div>
    )
  }
  return (
    <div style={box}>
      {value === 'design1' && <>{line('70%', 5, '#c62828', 0)}{line('100%', 5, '#3949ab')}{line('90%')}{line('90%')}{line('100%', 6, '#222', 4)}</>}
      {value === 'design2' && <><div style={{ height: 12, background: '#111', margin: -4, marginBottom: 2 }} />{line('90%')}{line('90%')}{line('70%')}{line('100%', 6, '#222', 4)}</>}
      {value === 'design3' && <><div style={{ height: 8, background: '#111', margin: -4, marginBottom: 2 }} /><div style={{ display: 'flex', gap: 3 }}><div>{line(20)}{line(18)}</div><div style={{ width: 12, height: 12, border: '1.5px solid #333', marginTop: 2 }} /></div>{line('100%', 3, '#c62828', 4)}{line('90%')}<div style={{ height: 6, background: '#111', margin: '6px -4px 0' }} /></>}
      {value === 'design4' && <>{line('80%', 6, '#1a3fa6', 0)}{line('100%', 1, '#555', 3)}{line('90%')}{line('90%')}<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, marginTop: 4 }}>{[...Array(6)].map((_, i) => <div key={i} style={{ height: 4, background: '#bbb' }} />)}</div>{line('60%', 5, '#111', 4)}</>}
    </div>
  )
}

// Resize an uploaded logo so it stays small (≤ 320 px) before saving it with the store
function readLogo(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg)$/.test(file.type)) { reject(new Error(translate('Use a PNG or JPG image'))); return }
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 320 / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(img.src)
      resolve(c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.9))
    }
    img.onerror = () => reject(new Error(translate('Could not read that image')))
    img.src = URL.createObjectURL(file)
  })
}

export default function Settings() {
  const { role, storeName, setAuth } = useAuthStore()
  const { sym } = useCurrency()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') || 'info')
  const [profile, setProfile] = useState(null)
  const [infoForm] = Form.useForm()
  const [upiForm] = Form.useForm()
  const [loyaltyForm] = Form.useForm()
  const loyaltyOn = Form.useWatch('enabled', loyaltyForm)
  const gstinValue = Form.useWatch('gstin', infoForm)
  const [saving, setSaving] = useState(false)
  const [previewUpi, setPreviewUpi] = useState('')
  const [loyalty, setLoyalty] = useState(null)
  const [payMonitor, setPayMonitor] = useState(() => localStorage.getItem('payment_monitor_platform') || '')
  const t = useT()
  const lang = useLangStore((s) => s.lang)
  const setLang = useLangStore((s) => s.setLang)
  const [savingLang, setSavingLang] = useState(false)

  // Receipt settings (saved with the store, so every device and WhatsApp links use them)
  const [receipt, setReceipt] = useState(null)
  const [savedReceipt, setSavedReceipt] = useState(null)
  const [previewImg, setPreviewImg] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [phonePreview, setPhonePreview] = useState(false)
  const previewTimer = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getStoreProfile()
      .then((p) => {
        setProfile(p)
        infoForm.setFieldsValue(p)
        upiForm.setFieldValue('upi_id', p.upi_id || '')
        setPreviewUpi(p.upi_id || '')
        if (p.country) setAuth({ country: p.country })
        const r = {
          receipt_design: p.receipt_design || localStorage.getItem('receipt_paper_size') || '3inch',
          receipt_footer: p.receipt_footer || '',
          receipt_policy: p.receipt_policy || '',
          receipt_show_gstin: p.receipt_show_gstin !== false,
          receipt_show_qr: p.receipt_show_qr !== false,
          receipt_show_points: p.receipt_show_points !== false,
          logo_data: p.logo_data || null,
        }
        setReceipt(r)
        setSavedReceipt(p.receipt_design ? r : null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Live receipt preview (debounced; PDFs render inline on desktop)
  useEffect(() => {
    if (!receipt || tab !== 'receipt' || isMobile) return
    clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      setPreviewing(true)
      getReceiptPreview({ ...receipt, language: lang })
        .then(pdfToImage)
        .then(setPreviewImg)
        .catch(() => message.error(translate('Could not build the preview')))
        .finally(() => setPreviewing(false))
    }, 500)
    return () => clearTimeout(previewTimer.current)
  }, [receipt, tab, isMobile, lang])

  if (role !== 'Admin') {
    return <Card><Title level={4}>{t('Admin access required')}</Title></Card>
  }

  const changeTab = (k) => { setTab(k); setSearchParams(k === 'info' ? {} : { tab: k }, { replace: true }) }
  const setR = (patch) => setReceipt((r) => ({ ...r, ...patch }))
  const receiptDirty = receipt && JSON.stringify(receipt) !== JSON.stringify(savedReceipt)

  async function saveInfo(values) {
    setSaving(true)
    try {
      const p = await updateStoreProfile(values)
      setProfile(p)
      if (values.country) setAuth({ country: values.country })
      if (values.store_name) setAuth({ storeName: values.store_name })
      message.success(t('Store info saved'))
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  async function saveUpi(values) {
    setSaving(true)
    try {
      await updateStoreProfile({ upi_id: values.upi_id?.trim() || '' })
      setPreviewUpi(values.upi_id?.trim() || '')
      message.success(t('UPI ID saved'))
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  async function saveReceipt() {
    setSaving(true)
    try {
      await updateStoreProfile({ ...receipt, logo_data: receipt.logo_data || '' })
      setSavedReceipt(receipt)
      try { localStorage.removeItem('receipt_paper_size') } catch { /* old per-device setting */ }
      message.success(t('Receipt settings saved — every device and WhatsApp receipt now uses them'))
    } catch (err) { message.error(err.message) }
    finally { setSaving(false) }
  }

  async function openFullPreview() {
    setPhonePreview(true)
    setPreviewImg(null)
    try { setPreviewImg(await pdfToImage(await getReceiptPreview({ ...receipt, language: lang }))) }
    catch (err) { message.error(err.message); setPhonePreview(false) }
  }

  async function onLogoFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try { setR({ logo_data: await readLogo(file) }) }
    catch (err) { message.error(err.message) }
  }

  async function saveLoyalty(values) {
    setSaving(true)
    try {
      const { rupees_per_point, ...rest } = values
      const updated = await updateLoyaltyProgram({ ...rest, points_per_rupee: rupees_per_point > 0 ? 1 / rupees_per_point : 0.01 })
      setLoyalty(updated)
      message.success(t('Loyalty program saved'))
    } catch (err) {
      message.error(err.message || t('Failed to save loyalty program'))
    } finally {
      setSaving(false)
    }
  }

  // Saved on the store: every device, staff login and receipt switches to it
  async function changeLanguage(code) {
    setSavingLang(true)
    try {
      const p = await updateStoreProfile({ language: code })
      setProfile(p)
      await setLang(code)
      message.success(translate('Language changed. The app and receipts now use it.'))
    } catch (err) { message.error(err.message) }
    finally { setSavingLang(false) }
  }

  const tabLabel = (icon, text) => <span className="st-tab">{icon}{t(text)}</span>
  const layout = RECEIPT_LAYOUTS.find((l) => l.value === receipt?.receipt_design)

  const receiptTab = !receipt ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
    <div className="st-receipt">
      <div>
        <div className="st-section" style={{ marginTop: 0 }}>{t('1. Paper & layout')}</div>
        {['Thermal roll', 'Invoice (80 mm)'].map((group) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, color: TEXT, fontWeight: 600, marginBottom: 6 }}>{t(group)}</div>
            <div className="st-layouts" role="radiogroup" aria-label={t(group)}>
              {RECEIPT_LAYOUTS.filter((l) => l.group === group).map((l) => {
                const on = receipt.receipt_design === l.value
                const locked = l.value === 'design4' && !profile?.gstin
                return (
                  <button key={l.value} type="button" role="radio" aria-checked={on} disabled={locked}
                    className={`st-layout${on ? ' st-layout-on' : ''}`} onClick={() => setR({ receipt_design: l.value })}>
                    <LayoutSketch value={l.value} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: on ? PRIMARY : TEXT, fontSize: 13.5 }}>{t(l.name)}</div>
                      <div style={{ fontSize: 12, color: SUB, lineHeight: 1.35, marginTop: 2 }}>
                        {locked ? <>{t('Needs a GSTIN.')} <a onClick={(e) => { e.stopPropagation(); changeTab('info') }} style={{ color: PRIMARY, pointerEvents: 'auto' }}>{t('Add GSTIN in Store tab')}</a></> : t(l.desc)}
                      </div>
                    </div>
                    {on && <CheckCircleFilled style={{ position: 'absolute', top: 8, right: 8, color: PRIMARY, fontSize: 16 }} />}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <div className="st-section">{t('2. What the receipt says')}</div>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label htmlFor="rc-footer" style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t('Thank-you line')}</label>
            <Input id="rc-footer" maxLength={60} showCount value={receipt.receipt_footer} placeholder={t('Thank you! Visit again')}
              onChange={(e) => setR({ receipt_footer: e.target.value })} />
          </div>
          <div>
            <label htmlFor="rc-policy" style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{t('Return / exchange policy')}</label>
            <Input.TextArea id="rc-policy" rows={2} maxLength={200} showCount value={receipt.receipt_policy}
              placeholder={t('Exchange within 7 days with receipt')}
              onChange={(e) => setR({ receipt_policy: e.target.value })} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 4 }}>{t('Logo')}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {receipt.logo_data
                ? <img src={receipt.logo_data} alt={t('Store logo')} style={{ height: 48, maxWidth: 120, objectFit: 'contain', background: '#fff', borderRadius: 6, padding: 3 }} />
                : <span style={{ fontSize: 12.5, color: SUB }}>{t('No logo — the bill shows your initials instead.')}</span>}
              <Button icon={<UploadOutlined />} onClick={() => fileRef.current?.click()}>{receipt.logo_data ? t('Change') : t('Upload logo')}</Button>
              {receipt.logo_data && <Button icon={<DeleteOutlined />} onClick={() => setR({ logo_data: null })} aria-label={t('Remove logo')} />}
              <input ref={fileRef} type="file" accept="image/png,image/jpeg" onChange={onLogoFile} style={{ display: 'none' }} />
            </div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 4 }}>{t('PNG or JPG. Printed on the “Bill with logo” layout.')}</div>
          </div>
        </div>

        <div className="st-section">{t('3. Show on receipt')}</div>
        {[
          ['receipt_show_gstin', 'GSTIN', profile?.gstin ? profile.gstin : t('Not set — add it under Store')],
          ['receipt_show_qr', t('UPI QR code for payment'), profile?.upi_id ? profile.upi_id : t('Add a UPI ID under UPI first')],
          ['receipt_show_points', t('Loyalty points earned / balance'), loyalty?.enabled ? t('When the customer earns or uses points') : t('Loyalty program is off')],
        ].map(([k, l, hint]) => (
          <div key={k} className="st-switch">
            <div>
              <div style={{ color: TEXT, fontWeight: 600, fontSize: 13.5 }}>{l}</div>
              <div style={{ fontSize: 12, color: SUB }}>{hint}</div>
            </div>
            <Switch checked={receipt[k]} onChange={(v) => setR({ [k]: v })} aria-label={l} />
          </div>
        ))}

        {isMobile && !receiptDirty && <Button block size="large" icon={<EyeOutlined />} onClick={openFullPreview} style={{ marginTop: 16 }}>{t('Preview receipt')}</Button>}
        <div className={`st-savebar${receiptDirty ? ' st-savebar-sticky' : ''}`}>
          {receiptDirty ? (
            isMobile ? (
              // Phone: one compact row pinned above the menu, with Preview inside it
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                <Button icon={<EyeOutlined />} onClick={openFullPreview} aria-label={t('Preview receipt')}>{t('Preview')}</Button>
                <Button onClick={() => setReceipt(savedReceipt || receipt)} disabled={!savedReceipt}>{t('Discard')}</Button>
                <Button type="primary" loading={saving} onClick={saveReceipt} style={{ flex: 1 }}>{t('Save')}</Button>
              </div>
            ) : (
              <>
                <span style={{ fontSize: 13, color: '#B9770E', fontWeight: 600, marginRight: 'auto' }}>{t('Unsaved changes')}</span>
                <Button onClick={() => setReceipt(savedReceipt || receipt)} disabled={!savedReceipt}>{t('Discard')}</Button>
                <Button type="primary" size="large" loading={saving} onClick={saveReceipt}>{t('Save receipt settings')}</Button>
              </>
            )
          ) : (
            <span style={{ fontSize: 13.5, color: GOOD, fontWeight: 600 }}><CheckCircleFilled /> {t('All changes saved')}</span>
          )}
        </div>

        <div className="st-section">{t('4. Printer')}</div>
        {/* Bills print with the saved layout, so the printer uses that paper width too */}
        <PrinterSection receipt={savedReceipt || receipt} getSamplePdf={() => getReceiptPreview({ ...(savedReceipt || receipt), language: lang })} />
        {isMobile && receiptDirty && <div style={{ height: 70 }} />}
      </div>

      {!isMobile && (
        <div style={{ position: 'sticky', top: 72 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: TEXT }}>{t('Preview')} <span style={{ fontWeight: 400, color: SUB, fontSize: 12.5 }}>· {t('sample bill')}, {t(layout?.name || '')}</span></span>
            <span>
              {previewing && <Spin size="small" style={{ marginRight: 8 }} />}
              <Tooltip title={t('Refresh')}><Button size="small" icon={<ReloadOutlined />} onClick={() => setR({})} style={{ marginLeft: 6 }} aria-label={t('Refresh preview')} /></Tooltip>
            </span>
          </div>
          <div className="st-preview">
            {previewImg
              ? <img src={previewImg} alt={t('Sample receipt')} style={{ opacity: previewing ? 0.6 : 1 }} />
              : <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div>
      <Modal open={phonePreview} onCancel={() => setPhonePreview(false)} footer={null} title={t('Receipt preview')} width={420} centered>
        <div className="st-preview">
          {previewImg ? <img src={previewImg} alt={t('Sample receipt')} /> : <div style={{ padding: 60 }}><Spin /></div>}
        </div>
      </Modal>
      <style>{CSS}</style>
      <Title level={isMobile ? 4 : 3} style={{ margin: '0 0 12px', color: TEXT }}>{t('Store settings')}</Title>
      <Card style={{ borderRadius: 14, maxWidth: 1180 }} styles={{ body: { padding: isMobile ? 12 : 24 } }}>
        <Tabs
          className="st-tabs"
          activeKey={tab}
          onChange={changeTab}
          animated={{ inkBar: false, tabPane: false }}
          items={[
            {
              key: 'info',
              label: tabLabel(<ShopOutlined />, 'Store'),
              children: (
                <div style={{ maxWidth: 560 }}>
                <div className="st-lang">
                  <label htmlFor="st-language" style={{ display: 'block', fontWeight: 600, color: TEXT, marginBottom: 6 }}>
                    {t('Language for the app and receipts')}
                  </label>
                  <Select id="st-language" value={lang} onChange={changeLanguage} loading={savingLang} disabled={savingLang}
                    options={LANGUAGE_OPTIONS} style={{ width: '100%' }} size="large" />
                  <div style={{ fontSize: 12.5, color: SUB, marginTop: 6 }}>
                    {t('Every screen, every staff login and every receipt use this language. Product and customer names stay as you typed them.')}
                  </div>
                </div>
                <Form form={infoForm} layout="vertical" onFinish={saveInfo}>
                  <Form.Item name="store_name" label={t('Store name')} rules={[{ required: true, message: t('Enter the store name') }]}><Input /></Form.Item>
                  <Form.Item name="phone" label={t('Phone')}><Input type="tel" /></Form.Item>
                  <Form.Item name="email" label={t('Email')}><Input type="email" /></Form.Item>
                  <Form.Item name="gstin" label="GSTIN" normalize={(v) => (v || '').toUpperCase().replace(/\s/g, '')}
                    rules={[{ validator: (_, v) => (!v || GSTIN_RE.test(v) ? Promise.resolve() : Promise.reject(new Error(t('GSTIN should be 15 characters, like 29ABCDE1234F1Z5')))) }]}
                    extra={!gstinValue ? t('Needed for the tax invoice receipt and GST bills.') : undefined}>
                    <Input maxLength={15} placeholder="29ABCDE1234F1Z5" />
                  </Form.Item>
                  <Form.Item name="address" label={t('Address')}><Input.TextArea rows={2} /></Form.Item>
                  <Form.Item
                    name="country"
                    label={t('Country & currency')}
                    extra={`${t('Currency')}: ${getCurrencyInfo(infoForm.getFieldValue('country') || 'India').currency}`}
                  >
                    <Select showSearch optionFilterProp="label"
                      options={COUNTRIES.map((c) => ({ value: c.name, label: `${c.name} — ${c.symbol} ${c.currency}` }))} />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={saving}>{t('Save store info')}</Button>
                </Form>
                </div>
              ),
            },
            {
              key: 'upi',
              label: tabLabel(<QrcodeOutlined />, 'UPI'),
              children: (
                <div style={{ maxWidth: 560 }}>
                  <Alert type="info" showIcon style={{ marginBottom: 20 }}
                    message={t('UPI QR code on receipts and New Bill')}
                    description={t('Customers scan the QR to pay the exact bill amount — no typing needed.')} />
                  <Form form={upiForm} layout="vertical" onFinish={saveUpi}>
                    <Form.Item name="upi_id" label="UPI ID" extra={`${t('Examples')}: shopname@upi, 9876543210@paytm, name@okaxis`}
                      rules={[{ pattern: /^[\w.-]{2,}@[A-Za-z][\w.-]{1,}$/, message: t('That doesn’t look like a UPI ID (name@bank)') }]}>
                      <Input placeholder="yourstore@upi" onChange={(e) => setPreviewUpi(e.target.value.trim())} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={saving}>{t('Save UPI ID')}</Button>
                  </Form>
                  {previewUpi && (
                    <div style={{ textAlign: 'center', marginTop: 20 }}>
                      <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 10 }}>
                        <QRCodeSVG size={160} value={`upi://pay?pa=${encodeURIComponent(previewUpi)}&pn=${encodeURIComponent(storeName || '')}&am=100&cu=INR&tn=Demo`} />
                      </div>
                      <div style={{ fontSize: 12.5, color: SUB, marginTop: 6 }}>{t('Sample QR for {amount} — real bills use the exact amount', { amount: `${sym}100` })}</div>
                    </div>
                  )}
                </div>
              ),
            },
            {
              key: 'receipt',
              label: tabLabel(<PrinterOutlined />, 'Receipt'),
              children: receiptTab,
            },
            {
              key: 'payment-monitor',
              label: tabLabel(<AppstoreOutlined />, isMobile ? 'Pay app' : 'Payment app'),
              children: (
                <div style={{ maxWidth: 560 }}>
                  <Alert type="info" showIcon style={{ marginBottom: 20 }}
                    message={t('Payment app shortcut')}
                    description={t('Choose the app you check payments in. A floating button then opens its dashboard beside the billing app. This choice is saved on this device.')} />
                  <div style={{ display: 'grid', gap: 10, marginBottom: 20 }} role="radiogroup" aria-label={t('Payment app')}>
                    {[['gpay', 'GPay Business', t('Opens Google Pay for Business')],
                      ['phonepe', 'PhonePe Business', t('Opens the PhonePe Business dashboard')],
                      ['both', 'GPay + PhonePe', t('Opens both side by side')],
                      ['', t('Off'), t('Hide the shortcut button')],
                    ].map(([val, label, desc]) => {
                      const on = payMonitor === val
                      return (
                        <button key={val || 'off'} type="button" role="radio" aria-checked={on} className={`st-choice${on ? ' st-choice-on' : ''}`}
                          onClick={() => {
                            setPayMonitor(val)
                            localStorage.setItem('payment_monitor_platform', val)
                            message.success(val ? t('{name} selected', { name: label }) : t('Payment app shortcut turned off'))
                          }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: on ? PRIMARY : TEXT }}>{label}</div>
                            <div style={{ fontSize: 12.5, color: SUB }}>{desc}</div>
                          </div>
                          {on && <CheckCircleFilled style={{ color: PRIMARY, fontSize: 18 }} />}
                        </button>
                      )
                    })}
                  </div>
                  {payMonitor && PLATFORMS[payMonitor] && (
                    <Button type="primary" onClick={() => openPaymentDashboard(payMonitor)}>{t('Open {name} now', { name: PLATFORMS[payMonitor].label })}</Button>
                  )}
                </div>
              ),
            },
            {
              key: 'loyalty',
              label: tabLabel(<GiftOutlined />, 'Loyalty'),
              children: (
                <div style={{ maxWidth: 560 }}>
                  <Alert type="info" showIcon style={{ marginBottom: 20 }}
                    message={t('Loyalty rewards')}
                    description={t('Customers earn points on every bill and redeem them as a {sym} discount (1 point = {sym}1).', { sym })} />
                  <Form
                    form={loyaltyForm}
                    layout="vertical"
                    onFinish={saveLoyalty}
                    initialValues={{ enabled: false, program_name: 'Rewards', rupees_per_point: 100, welcome_bonus: 0, min_redeem_points: 50, max_redeem_percent: 50, terms: '' }}
                  >
                    <Form.Item name="enabled" label={t('Loyalty program')} valuePropName="checked">
                      <Switch checkedChildren={t('On')} unCheckedChildren={t('Off')} />
                    </Form.Item>
                    <fieldset disabled={!loyaltyOn} style={{ border: 'none', padding: 0, margin: 0, opacity: loyaltyOn ? 1 : 0.5 }}>
                      <Form.Item name="program_name" label={t('Program name')} extra={t("Shown on the customer's Google Wallet card")}>
                        <Input placeholder={t('e.g. Vera Rewards')} disabled={!loyaltyOn} />
                      </Form.Item>
                      <Form.Item name="rupees_per_point" label={t('Points ratio')} extra={t('Customers earn 1 point for every {sym} this much spent.', { sym })}>
                        <InputNumber min={1} max={10000} step={10} style={{ width: 220 }} addonBefore={sym} addonAfter={t('= 1 point')} disabled={!loyaltyOn} />
                      </Form.Item>
                      <Form.Item name="welcome_bonus" label={t('Welcome bonus')} extra={t('Points for a new customer (0 to turn off).')}>
                        <InputNumber min={0} max={10000} style={{ width: 220 }} disabled={!loyaltyOn} />
                      </Form.Item>
                      <Form.Item name="min_redeem_points" label={t('Minimum points to redeem')}>
                        <InputNumber min={0} max={100000} style={{ width: 220 }} disabled={!loyaltyOn} />
                      </Form.Item>
                      <Form.Item name="max_redeem_percent" label={t('Most of a bill that points can pay')} extra={t('Cap redemption at this % of a single bill.')}>
                        <InputNumber min={0} max={100} style={{ width: 220 }} addonAfter="%" disabled={!loyaltyOn} />
                      </Form.Item>
                      <Form.Item name="terms" label={t('Terms (optional)')}>
                        <Input.TextArea rows={2} placeholder={t('e.g. Points valid for 1 year, non-transferable')} disabled={!loyaltyOn} />
                      </Form.Item>
                    </fieldset>
                    <Button type="primary" htmlType="submit" loading={saving}>{t('Save loyalty program')}</Button>
                  </Form>

                  {loyalty && (
                    <div style={{ marginTop: 20, padding: '12px 14px', background: 'rgba(47,102,144,0.07)', borderRadius: 10, fontSize: 13, color: TEXT }}>
                      <div><strong>Google Wallet:</strong>{' '}
                        {loyalty.wallet_configured
                          ? <span style={{ color: GOOD, fontWeight: 600 }}>✓ {t('Ready')}</span>
                          : <span style={{ color: '#B9770E', fontWeight: 600 }}>{t('Not set up on the server yet')}</span>}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 12.5, color: SUB }}>
                        {t('Points work fully without Google Wallet. Once Wallet is set up on the server, customers get a Wallet card link on WhatsApp automatically.')}
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
