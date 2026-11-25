// One "Print" for every screen: straight to the Bluetooth printer when one is set up,
// otherwise (or as a backup) the normal system print.
import { Modal, message } from 'antd'
import { fetchPdfBlob, printPdfBlob } from './pdf'
import { hasSavedPrinter, printPdfDirect } from './thermalPrinter'

// Ask what to do when the printer can't be reached. Resolves 'retry' or 'system'.
function askRetry(text) {
  return new Promise((resolve) => {
    Modal.confirm({
      title: 'Could not reach the printer',
      content: text,
      okText: 'Retry',
      cancelText: 'Use phone print',
      closable: false,
      maskClosable: false,
      keyboard: false,
      centered: true,
      onOk: () => resolve('retry'),
      onCancel: () => resolve('system'),
    })
  })
}

export async function printBillReceipt(billNo) {
  const path = `/bills/${billNo}/receipt-pdf`
  try {
    const blob = await fetchPdfBlob(path)
    if (!(await hasSavedPrinter())) return await printPdfBlob(blob)
    for (;;) {
      const hide = message.loading('Printing…', 0)
      try {
        await printPdfDirect(blob)
        hide()
        message.success('Sent to printer')
        return
      } catch (err) {
        hide()
        if ((await askRetry(err.message)) === 'system') return await printPdfBlob(blob)
      }
    }
  } catch (err) {
    message.error('Print failed: ' + err.message)
  }
}
