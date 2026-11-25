import { useState } from 'react'
import { Alert, Button, Grid, Modal, message } from 'antd'
import { PrinterOutlined, ReloadOutlined, SwapOutlined, DeleteOutlined, LoadingOutlined } from '@ant-design/icons'
import {
  usePrinter, choosePrinter, reconnectPrinter, forgetPrinter, printTestPage, printPdfDirect, dotsForDesign,
} from '../utils/thermalPrinter'
import { getStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n'

const TEXT = '#3A3530'
const SUB  = '#5F5853'
const GOOD = '#1E8449'
const BAD  = '#C0392B'

const STATUS = {
  connecting: { dot: '#D4A017', text: 'Connecting to printer…' },
  ready:      { dot: GOOD, text: 'Printer ready' },
  printing:   { dot: GOOD, text: 'Printing…' },
  offline:    { dot: BAD, text: 'Printer is off or too far' },
}

const Dot = ({ color }) => (
  <span aria-hidden style={{ width: 9, height: 9, borderRadius: '50%', background: color, display: 'inline-block', flex: 'none' }} />
)

// Connect → test print → "Did it print?". Used by Settings and by the billing chip.
function usePrinterSetup({ design } = {}) {
  const storeName = useAuthStore((s) => s.storeName)
  const t = useT()
  const [step, setStep] = useState(null)        // null | 'printing' | 'ask' | 'failed'
  const [error, setError] = useState('')

  async function testPrint() {
    setStep('printing')
    try {
      const d = design || await getStoreProfile().then((p) => p.receipt_design).catch(() => '2inch')
      await printTestPage({ dots: dotsForDesign(d), storeName: storeName || '' })
      setStep('ask')
    } catch (err) {
      setError(err.message)
      setStep('failed')
    }
  }

  // Must run straight from a tap: Chrome only shows the printer list on a user gesture
  async function connect() {
    try {
      if (!(await choosePrinter())) return
    } catch (err) {
      setError(err.message)
      setStep('failed')
      return
    }
    testPrint()
  }

  function done() {
    setStep(null)
    message.success(t('Printer saved. The app connects to it by itself every time it opens.'))
  }

  const modal = (
    <Modal open={!!step} onCancel={() => setStep(null)} footer={null} centered width={400}
      title={step === 'failed' ? t('Could not reach the printer') : t('Test print')}>
      {step === 'printing' && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: TEXT }}>
          <LoadingOutlined style={{ fontSize: 28 }} />
          <div style={{ marginTop: 12 }}>{t('Printing a test slip…')}</div>
        </div>
      )}
      {step === 'ask' && (
        <>
          <div style={{ fontSize: 16, color: TEXT, marginBottom: 16 }}>{t('Did the test slip print?')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button size="large" type="primary" onClick={done}>✅ {t('Yes')}</Button>
            <Button size="large" onClick={() => setStep('failed')}>❌ {t('Try again')}</Button>
          </div>
        </>
      )}
      {step === 'failed' && (
        <>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <ul style={{ paddingLeft: 18, color: SUB, fontSize: 13.5, margin: '0 0 16px' }}>
            <li>{t('Check the printer is on, has paper, and the lid is shut.')}</li>
            <li>{t('Paper roll: the shiny side faces the print head.')}</li>
            <li>{t('Keep the phone within a few steps of the printer.')}</li>
            <li>{t('Picked the wrong device? Choose a different one.')}</li>
          </ul>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button size="large" type="primary" icon={<ReloadOutlined />} onClick={testPrint}>{t('Print again')}</Button>
            <Button size="large" icon={<SwapOutlined />} onClick={connect}>{t('Other printer')}</Button>
          </div>
        </>
      )}
    </Modal>
  )

  return { connect, testPrint, modal }
}

/** "4. Printer" in Settings → Receipt. `receipt` is the receipt settings being edited. */
export function PrinterSection({ receipt, getSamplePdf }) {
  const { status } = usePrinter()
  const t = useT()
  const { connect, testPrint, modal } = usePrinterSetup({ design: receipt?.receipt_design })
  const [sampling, setSampling] = useState(false)

  async function printSample() {
    setSampling(true)
    try {
      await printPdfDirect(await getSamplePdf())
      message.success(t('Sample receipt sent to printer'))
    } catch (err) { message.error(err.message) }
    finally { setSampling(false) }
  }

  async function reconnect() {
    try { await reconnectPrinter(); message.success(t('Printer connected')) }
    catch (err) { message.warning(err.message) }
  }

  function remove() {
    Modal.confirm({
      title: t('Remove this printer?'), content: t('Print will use the phone’s normal print screen until you connect a printer again.'),
      okText: t('Remove'), cancelText: t('Cancel'), okButtonProps: { danger: true }, centered: true, onOk: forgetPrinter,
    })
  }

  if (status === 'unsupported') {
    return (
      <Alert type="info" showIcon
        message={t('Direct printing needs the Android app or Chrome on Android')}
        description={t('On this device, Print opens the normal print screen. To print straight to a Bluetooth receipt printer, open Local Billing on an Android phone and update Chrome if asked.')} />
    )
  }

  if (status === 'none') {
    return (
      <div className="st-printer">
        <ol style={{ paddingLeft: 20, margin: '0 0 12px', color: TEXT, fontSize: 14, lineHeight: 1.7 }}>
          <li>{t('Turn the printer on.')}</li>
          <li>
            <b>{t('First time only:')}</b> {t('pair it in your phone’s Settings → Bluetooth.')}
            <div style={{ color: SUB, fontSize: 13 }}>{t('PIN is usually 0000 or 1234.')}</div>
          </li>
          <li>{t('Tap Connect printer and pick it from the list. Allow Bluetooth / Nearby devices if asked.')}</li>
        </ol>
        <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={connect}>{t('Connect printer')}</Button>
        <div style={{ fontSize: 12.5, color: SUB, marginTop: 8 }}>
          {t('Bills then print straight to the printer, with no print screen. A test slip prints first so you can check it works.')}
        </div>
        {modal}
      </div>
    )
  }

  const s = STATUS[status] || STATUS.connecting
  return (
    <div className="st-printer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: TEXT, fontWeight: 600, marginBottom: 4 }}>
        <Dot color={s.dot} />{t(s.text)}
      </div>
      <div style={{ fontSize: 13, color: SUB, marginBottom: 12 }}>
        {status === 'offline'
          ? t('Turn the printer on, bring it close and tap Reconnect. Bills can still print with the phone’s normal print.')
          : t('Bills print straight to this printer on {paper} paper, with no print screen.', { paper: receipt?.receipt_design === '2inch' ? '58 mm (384 dots)' : '80 mm (576 dots)' })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'offline' && <Button type="primary" icon={<ReloadOutlined />} onClick={reconnect}>{t('Reconnect')}</Button>}
        <Button icon={<PrinterOutlined />} onClick={testPrint} disabled={status === 'printing' || status === 'connecting'}>{t('Test print')}</Button>
        {getSamplePdf && (
          <Button onClick={printSample} loading={sampling} disabled={status === 'printing' || status === 'connecting'}>{t('Print sample receipt')}</Button>
        )}
        <Button icon={<SwapOutlined />} onClick={connect}>{t('Change printer')}</Button>
        <Button icon={<DeleteOutlined />} onClick={remove} aria-label={t('Remove printer')} />
      </div>
      {modal}
    </div>
  )
}

/** Small status chip for the billing screen: 🟢 Printer ready / 🔴 Tap to reconnect. */
export function PrinterChip() {
  const { status } = usePrinter()
  const screens = Grid.useBreakpoint()
  const t = useT()
  const { connect, modal } = usePrinterSetup()
  const [busy, setBusy] = useState(false)

  if (status === 'unsupported') return null
  // No printer yet: offer setup on phones; desktops keep the normal print dialog
  if (status === 'none') {
    if (screens.md) return null
    return <><Button size="small" icon={<PrinterOutlined />} onClick={connect}>{t('Connect printer')}</Button>{modal}</>
  }

  async function reconnect() {
    setBusy(true)
    try { await reconnectPrinter(); message.success(t('Printer connected')) }
    catch (err) { message.warning(err.message) }
    finally { setBusy(false) }
  }

  const offline = status === 'offline'
  const s = STATUS[status] || STATUS.connecting
  return (
    <>
      <Button size="small" onClick={offline ? reconnect : undefined} loading={busy}
        aria-label={offline ? t('Printer not reachable, tap to reconnect') : t(s.text)}
        style={{
          borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: offline ? 'pointer' : 'default', color: offline ? BAD : TEXT,
          borderColor: offline ? BAD : undefined,
        }}>
        {!busy && <Dot color={s.dot} />}
        {offline ? t('Tap to reconnect') : status === 'ready' ? t('Printer ready') : t(s.text)}
      </Button>
      {modal}
    </>
  )
}
