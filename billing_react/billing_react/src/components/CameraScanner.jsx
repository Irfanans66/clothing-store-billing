import React, { useEffect, useRef, useState } from 'react'
import { Modal, Alert } from 'antd'

// Camera barcode scanner (CODE128 labels, EAN, QR…). Calls onDetected(text) once.
export default function CameraScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let controls = null
    let done = false
    let cancelled = false
    import('@zxing/browser')
      .then(({ BrowserMultiFormatReader }) => {
        if (cancelled) return
        const reader = new BrowserMultiFormatReader()
        return reader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          (result, _err, ctl) => {
            if (result && !done) {
              done = true
              ctl.stop()
              onDetected(result.getText())
            }
          },
        )
      })
      .then((ctl) => {
        if (cancelled) ctl?.stop()
        else controls = ctl
      })
      .catch((err) => {
        if (cancelled) return
        setError(err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access for this site and try again.'
          : 'Could not start the camera on this device.')
      })
    return () => { cancelled = true; controls?.stop(); setError('') }
  }, [open, onDetected])

  return (
    <Modal open={open} onCancel={onClose} footer={null} title="Scan barcode" destroyOnHidden width={420}>
      {error ? <Alert type="error" showIcon message={error} /> : (
        <>
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#000' }}>
            <video ref={videoRef} muted playsInline style={{ width: '100%', display: 'block', aspectRatio: '4 / 3', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', left: '10%', right: '10%', top: '42%', height: 2, background: '#E53935', boxShadow: '0 0 8px #E53935' }} />
          </div>
          <div style={{ textAlign: 'center', color: '#5F5853', fontSize: 13, marginTop: 10 }}>
            Point the camera at the barcode on the price tag
          </div>
        </>
      )}
    </Modal>
  )
}
