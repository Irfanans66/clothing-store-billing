import { useState } from 'react'
import { Alert, Button, Grid, Modal, message } from 'antd'
import { PrinterOutlined, ReloadOutlined, SwapOutlined, DeleteOutlined, LoadingOutlined } from '@ant-design/icons'
import {
  usePrinter, choosePrinter, reconnectPrinter, forgetPrinter, printTestPage, printPdfDirect, dotsForDesign,
} from '../utils/thermalPrinter'
import { getStoreProfile } from '../api/client'
import { useAuthStore } from '../store/authStore'

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
    message.success('Printer saved. The app connects to it by itself every time it opens.')
  }

  const modal = (
    <Modal open={!!step} onCancel={() => setStep(null)} footer={null} centered width={400}
      title={step === 'failed' ? 'Could not reach the printer' : 'Test print'}>
      {step === 'printing' && (
        <div style={{ textAlign: 'center', padding: '24px 0', color: TEXT }}>
          <LoadingOutlined style={{ fontSize: 28 }} />
          <div style={{ marginTop: 12 }}>Printing a test slip…</div>
        </div>
      )}
      {step === 'ask' && (
        <>
          <div style={{ fontSize: 16, color: TEXT, marginBottom: 16 }}>Did the test slip print?</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button size="large" type="primary" onClick={done}>✅ Yes</Button>
            <Button size="large" onClick={() => setStep('failed')}>❌ Try again</Button>
          </div>
        </>
      )}
      {step === 'failed' && (
        <>
          {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
          <ul style={{ paddingLeft: 18, color: SUB, fontSize: 13.5, margin: '0 0 16px' }}>
            <li>Check the printer is on, has paper, and the lid is shut.</li>
            <li>Paper roll: the shiny side faces the print head.</li>
            <li>Keep the phone within a few steps of the printer.</li>
            <li>Picked the wrong device? Choose a different one.</li>
          </ul>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button size="large" type="primary" icon={<ReloadOutlined />} onClick={testPrint}>Print again</Button>
            <Button size="large" icon={<SwapOutlined />} onClick={connect}>Other printer</Button>
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
  const { connect, testPrint, modal } = usePrinterSetup({ design: receipt?.receipt_design })
  const [sampling, setSampling] = useState(false)

  async function printSample() {
    setSampling(true)
    try {
      await printPdfDirect(await getSamplePdf())
      message.success('Sample receipt sent to printer')
    } catch (err) { message.error(err.message) }
    finally { setSampling(false) }
  }

  async function reconnect() {
    try { await reconnectPrinter(); message.success('Printer connected') }
    catch (err) { message.warning(err.message) }
  }

  function remove() {
    Modal.confirm({
      title: 'Remove this printer?', content: 'Print will use the phone’s normal print screen until you connect a printer again.',
      okText: 'Remove', okButtonProps: { danger: true }, centered: true, onOk: forgetPrinter,
    })
  }

  if (status === 'unsupported') {
    return (
      <Alert type="info" showIcon
        message="Direct printing needs the Android app or Chrome on Android"
        description="On this device, Print opens the normal print screen. To print straight to a Bluetooth receipt printer, open Local Billing on an Android phone and update Chrome if asked." />
    )
  }

  if (status === 'none') {
    return (
      <div className="st-printer">
        <ol style={{ paddingLeft: 20, margin: '0 0 12px', color: TEXT, fontSize: 14, lineHeight: 1.7 }}>
          <li>Turn the printer on.</li>
          <li>
            <b>First time only:</b> pair it in your phone’s <b>Settings → Bluetooth</b>.
            <div style={{ color: SUB, fontSize: 13 }}>PIN is usually 0000 or 1234.</div>
          </li>
          <li>Tap <b>Connect printer</b> and pick it from the list. Allow Bluetooth / Nearby devices if asked.</li>
        </ol>
        <Button type="primary" size="large" icon={<PrinterOutlined />} onClick={connect}>Connect printer</Button>
        <div style={{ fontSize: 12.5, color: SUB, marginTop: 8 }}>
          Bills then print straight to the printer, with no print screen. A test slip prints first so you can check it works.
        </div>
        {modal}
      </div>
    )
  }

  const s = STATUS[status] || STATUS.connecting
  return (
    <div className="st-printer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: TEXT, fontWeight: 600, marginBottom: 4 }}>
        <Dot color={s.dot} />{s.text}
      </div>
      <div style={{ fontSize: 13, color: SUB, marginBottom: 12 }}>
        {status === 'offline'
          ? 'Turn the printer on, bring it close and tap Reconnect. Bills can still print with the phone’s normal print.'
          : `Bills print straight to this printer on ${receipt?.receipt_design === '2inch' ? '58 mm (384 dots)' : '80 mm (576 dots)'} paper, with no print screen.`}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {status === 'offline' && <Button type="primary" icon={<ReloadOutlined />} onClick={reconnect}>Reconnect</Button>}
        <Button icon={<PrinterOutlined />} onClick={testPrint} disabled={status === 'printing' || status === 'connecting'}>Test print</Button>
        {getSamplePdf && (
          <Button onClick={printSample} loading={sampling} disabled={status === 'printing' || status === 'connecting'}>Print sample receipt</Button>
        )}
        <Button icon={<SwapOutlined />} onClick={connect}>Change printer</Button>
        <Button icon={<DeleteOutlined />} onClick={remove} aria-label="Remove printer" />
      </div>
      {modal}
    </div>
  )
}

/** Small status chip for the billing screen: 🟢 Printer ready / 🔴 Tap to reconnect. */
export function PrinterChip() {
  const { status } = usePrinter()
  const screens = Grid.useBreakpoint()
  const { connect, modal } = usePrinterSetup()
  const [busy, setBusy] = useState(false)

  if (status === 'unsupported') return null
  // No printer yet: offer setup on phones; desktops keep the normal print dialog
  if (status === 'none') {
    if (screens.md) return null
    return <><Button size="small" icon={<PrinterOutlined />} onClick={connect}>Connect printer</Button>{modal}</>
  }

  async function reconnect() {
    setBusy(true)
    try { await reconnectPrinter(); message.success('Printer connected') }
    catch (err) { message.warning(err.message) }
    finally { setBusy(false) }
  }

  const offline = status === 'offline'
  const s = STATUS[status] || STATUS.connecting
  return (
    <>
      <Button size="small" onClick={offline ? reconnect : undefined} loading={busy}
        aria-label={offline ? 'Printer not reachable, tap to reconnect' : s.text}
        style={{
          borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
          cursor: offline ? 'pointer' : 'default', color: offline ? BAD : TEXT,
          borderColor: offline ? BAD : undefined,
        }}>
        {!busy && <Dot color={s.dot} />}
        {offline ? 'Tap to reconnect' : status === 'ready' ? 'Printer ready' : s.text.replace('to printer', '')}
      </Button>
      {modal}
    </>
  )
}
