import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Card, Select, InputNumber, Button, Table, Typography, Input, Checkbox, Switch, Tooltip, Modal,
  Grid, Spin, Tag, message, Empty,
} from 'antd'
import {
  PrinterOutlined, ArrowLeftOutlined, SearchOutlined, QuestionCircleOutlined, HistoryOutlined,
  ExperimentOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { getProducts, getStoreProfile, recordLabelPrint, getLabelPrints } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { useCurrency } from '../utils/currency'
import {
  LABEL_SIZES, LAYOUTS, LABEL_DESIGNS, DEFAULT_FIELDS, A4_65, labelDims, renderLabel, buildPrintHtml,
} from '../utils/labels'

const { Title, Text } = Typography
const { useBreakpoint } = Grid

const TEXT    = '#3A3530'
const SUB     = '#5F5853'
const PRIMARY = '#2F6690'
const BAD     = '#C0392B'

const CATEGORIES = ['Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Kurtis', 'Sarees', 'Lehenga', 'Jackets', 'Sweaters', 'Suits', 'Kids Wear', 'Accessories', 'Other']
const SETTINGS_KEY = 'label_settings_v2'
const NEW_STOCK_DAYS = 7
const FIELD_LABELS = [
  ['store', 'Store name'], ['size', 'Size'], ['color', 'Colour'], ['category', 'Category'],
  ['offer', 'Offer price (MRP struck through)'], ['taxNote', '“Incl. of all taxes”'],
]
const SAMPLE = { item_id: 'ITM001', product_name: 'Cotton Kurta', size: 'M', color: 'Blue', category: 'Kurtis', mrp: 899, selling_price: 799, barcode: 'ITM001-260618' }

const CSS = `
.bl-grid { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
.bl-field > label { display: block; font-size: 12.5px; font-weight: 600; color: ${TEXT}; margin-bottom: 4px; }
.bl-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.bl-preview { background: repeating-conic-gradient(#e9e4dd 0% 25%, #f3efe9 0% 50%) 50% / 16px 16px; border-radius: 12px;
  padding: 16px; display: flex; justify-content: center; align-items: center; min-height: 170px; }
.bl-preview img { max-width: 100%; max-height: 260px; box-shadow: 0 2px 10px rgba(0,0,0,0.25); image-rendering: pixelated; background: #fff; }
.bl-chip { flex: 0 0 auto; border: 1px solid rgba(47,102,144,0.35); background: transparent; color: ${PRIMARY};
  border-radius: 16px; padding: 4px 12px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; white-space: nowrap; }
.bl-chip-on { background: ${PRIMARY}; color: #fff; border-color: ${PRIMARY}; }
.bl-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.bl-out td { opacity: 0.55; }
.bl-card { background: var(--bg); border-radius: 14px; box-shadow: var(--neu-sm); padding: 12px 14px; margin-bottom: 10px; }
.bl-sticky { position: fixed; left: 10px; right: 10px; bottom: calc(72px + env(safe-area-inset-bottom)); z-index: 990; margin: 0 !important; box-shadow: 0 6px 24px rgba(0,0,0,0.22) !important; }
.bl-code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; color: ${TEXT}; letter-spacing: 0.3px; }
@media (max-width: 1100px) { .bl-grid { grid-template-columns: 1fr; } }
@media (max-width: 767px) { .bl-fields { grid-template-columns: 1fr; } }
`

function loadSettings() {
  try { return { ...defaults(), ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } } catch { return defaults() }
}
function defaults() {
  return { size: '50x25', layout: 'roll', design: 'size', fields: DEFAULT_FIELDS, rotate: true }
}

export default function BarcodeLabels() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const screens = useBreakpoint()
  const isMobile = !screens.md
  const { sym } = useCurrency()
  const { storeName: authStoreName } = useAuthStore()

  const [settings, setSettings] = useState(loadSettings)
  const set = (patch) => setSettings((s) => ({ ...s, ...patch }))
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('')
  const [chip, setChip]         = useState('all')
  const [selected, setSelected] = useState([])
  const [copies, setCopies]     = useState({})          // item_id -> copies
  const [defaultCopies, setDefaultCopies] = useState(1)
  const [startPos, setStartPos] = useState(1)
  const [previewId, setPreviewId] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)   // phone: settings folded away (they're remembered)
  const [printing, setPrinting] = useState(false)
  const [storeName, setStoreName] = useState(authStoreName || '')
  const [helpOpen, setHelpOpen] = useState(false)
  const [history, setHistory]   = useState(null)   // null = loading
  const [historyOpen, setHistoryOpen] = useState(false)
  const [today] = useState(() => dayjs())
  const preselected = useRef(false)

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
  }, [settings])

  useEffect(() => {
    if (!authStoreName) getStoreProfile().then((p) => setStoreName(p?.store_name || '')).catch(() => {})
    getProducts({ limit: 5000 })
      .then((list) => {
        setProducts(list || [])
        // ?items=ITM001,ITM002&copies=stock|N  (from Products page / after adding stock)
        const ids = (searchParams.get('items') || '').split(',').filter(Boolean)
        if (ids.length && !preselected.current) {
          preselected.current = true
          const want = searchParams.get('copies')
          const found = (list || []).filter((p) => ids.includes(p.item_id))
          setSelected(found.map((p) => p.item_id))
          setCopies(Object.fromEntries(found.map((p) => [p.item_id,
            want === 'stock' ? Math.max(1, p.stock_qty || 1) : Math.max(1, parseInt(want, 10) || 1)])))
          if (found[0]) setPreviewId(found[0].item_id)
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [wMm, hMm] = labelDims(settings.size, settings.layout)
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.item_id, p])), [products])
  const previewProduct = byId[previewId] || byId[selected[0]] || products[0] || SAMPLE

  const previewSrc = useMemo(() => {
    try {
      return renderLabel(previewProduct, {
        widthMm: wMm, heightMm: hMm, design: settings.design, fields: settings.fields, storeName, sym,
        dpi: settings.layout === 'a4-65' ? 300 : 203,
      }).toDataURL('image/png')
    } catch { return null }
  }, [previewProduct, wMm, hMm, settings.design, settings.fields, settings.layout, storeName, sym])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()
  const CHIPS = [
    ['all', 'All', () => true],
    ['instock', 'In stock', (p) => (p.stock_qty || 0) > 0],
    ['new', `New stock (${NEW_STOCK_DAYS} days)`, (p) => p.created_at && today.diff(dayjs(p.created_at), 'day') <= NEW_STOCK_DAYS],
    ['never', 'Never printed', (p) => !p.last_label_printed],
    ['selected', `Selected (${selected.length})`, (p) => selected.includes(p.item_id)],
  ]
  const chipFn = CHIPS.find(([k]) => k === chip)?.[2] || (() => true)
  const shown = products.filter((p) => chipFn(p)
    && (!category || p.category === category)
    && (!q || [p.product_name, p.item_id, p.barcode, p.color, p.size].some((v) => (v || '').toLowerCase().includes(q))))

  const copiesFor = (id) => copies[id] ?? defaultCopies
  const totalLabels = selected.reduce((s, id) => s + (copiesFor(id) || 0), 0)
  const perSheet = A4_65.cols * A4_65.rows

  function toggle(id, on) {
    setSelected((s) => (on ? [...new Set([...s, id])] : s.filter((x) => x !== id)))
    if (on) setPreviewId(id)
  }
  function copiesEqualStock() {
    setCopies((c) => ({ ...c, ...Object.fromEntries(selected.map((id) => [id, Math.max(1, byId[id]?.stock_qty || 1)])) }))
  }
  function setAllCopies(n) {
    setDefaultCopies(n || 1)
    setCopies((c) => ({ ...c, ...Object.fromEntries(selected.map((id) => [id, n || 1])) }))
  }

  // ── Printing ───────────────────────────────────────────────────────────────
  async function print(jobs, { test = false } = {}) {
    if (!jobs.length) return
    const win = window.open('', '_blank', 'width=700,height=600')   // open first so pop-up blockers allow it
    if (!win) { message.error('Allow pop-ups for this site to print labels'); return }
    win.document.write('<p style="font-family:sans-serif;padding:16px">Preparing labels…</p>')
    setPrinting(true)
    try {
      const html = buildPrintHtml(jobs, {
        sizeValue: settings.size, layout: settings.layout, design: settings.design, fields: settings.fields,
        storeName, sym, rotate: settings.rotate, startPos: settings.layout === 'a4-65' ? startPos : 1,
      })
      win.document.open(); win.document.write(html); win.document.close(); win.focus()
      if (!test) {
        const items = jobs.map(({ product, copies: n }) => ({ item_id: product.item_id, copies: n }))
        recordLabelPrint({ items, design: settings.design, label_size: settings.layout === 'a4-65' ? 'A4-65' : settings.size, layout: settings.layout })
          .then(() => {
            const stamp = new Date().toISOString()
            setProducts((list) => list.map((p) => (items.some((i) => i.item_id === p.item_id) ? { ...p, last_label_printed: stamp } : p)))
          })
          .catch(() => {})
        if (settings.layout === 'a4-65') {
          const used = (startPos - 1 + jobs.reduce((s, j) => s + j.copies, 0)) % perSheet
          setStartPos(used === 0 ? 1 : used + 1)
        }
      }
    } catch (err) {
      win.close()
      message.error('Could not prepare labels: ' + err.message)
    } finally { setPrinting(false) }
  }
  const printSelected = () => print(selected.filter((id) => byId[id]).map((id) => ({ product: byId[id], copies: copiesFor(id) || 1 })))
  const testPrint = () => print([{ product: previewProduct, copies: 1 }], { test: true })

  function openHistory() {
    setHistoryOpen(true)
    setHistory(null)
    getLabelPrints().then((h) => setHistory(h || [])).catch(() => setHistory([]))
  }

  // ── UI ─────────────────────────────────────────────────────────────────────
  const money = (v) => `${sym}${Math.round(Number(v) || 0).toLocaleString('en-IN')}`
  const stockTag = (p) => ((p.stock_qty || 0) <= 0
    ? <Tag color="red" style={{ margin: 0 }}>0 stock</Tag>
    : <span style={{ color: TEXT }}>{p.stock_qty}</span>)
  const priceCell = (p) => (
    <div style={{ whiteSpace: 'nowrap' }}>
      <span style={{ color: TEXT, fontWeight: 600 }}>MRP {money(p.mrp)}</span>
      {p.selling_price < p.mrp && (
        <Tooltip title="The label shows MRP; New Bill charges the selling price. Turn on “Offer price” to print both.">
          <div style={{ fontSize: 12, color: SUB }}>Sells at {money(p.selling_price)}</div>
        </Tooltip>
      )}
    </div>
  )

  const columns = [
    {
      title: 'Product', dataIndex: 'product_name', key: 'name',
      render: (v, p) => (
        <div>
          <div style={{ color: TEXT, fontWeight: 600 }}>{v}</div>
          <div style={{ fontSize: 12.5, color: SUB }}>{[p.size, p.color, p.category].filter(Boolean).join(' · ')}</div>
        </div>
      ),
    },
    { title: 'Price', key: 'price', width: 130, render: (_, p) => priceCell(p) },
    { title: 'Barcode', dataIndex: 'barcode', key: 'barcode', width: 170, render: (v, p) => <span className="bl-code">{v || p.item_id}</span> },
    { title: 'Stock', dataIndex: 'stock_qty', key: 'stock', width: 80, align: 'right', render: (_, p) => stockTag(p) },
    {
      title: 'Last printed', dataIndex: 'last_label_printed', key: 'printed', width: 110,
      render: (v) => <span style={{ color: v ? TEXT : SUB }}>{v ? dayjs(v).format('D MMM') : 'Never'}</span>,
    },
    {
      title: 'Copies', key: 'copies', width: 96,
      render: (_, p) => (
        <span onClick={(e) => e.stopPropagation()}>
          <InputNumber size="small" min={1} max={1000} style={{ width: 72 }} disabled={!selected.includes(p.item_id)}
            value={selected.includes(p.item_id) ? copiesFor(p.item_id) : null}
            onChange={(v) => setCopies((c) => ({ ...c, [p.item_id]: v || 1 }))} aria-label={`Copies of ${p.product_name}`} />
        </span>
      ),
    },
  ]

  const settingsCard = (
    <Card style={{ borderRadius: 14, marginBottom: 14 }} styles={{ body: { padding: isMobile ? 12 : 16 } }}
      title={isMobile
        ? <a onClick={() => setSettingsOpen((o) => !o)} style={{ color: TEXT }} aria-expanded={settingsOpen}>
            Label settings <span style={{ color: SUB, fontWeight: 400, fontSize: 12.5 }}>{settingsOpen ? '▲' : '▼ change size, design…'}</span>
          </a>
        : <span style={{ color: TEXT }}>Label settings</span>}
      extra={<a onClick={() => setHelpOpen(true)} style={{ color: PRIMARY, fontSize: 13 }}><QuestionCircleOutlined /> {isMobile ? 'Help' : 'Printer setup help'}</a>}>
      {(!isMobile || settingsOpen) && <>
      <div className="bl-fields">
        <div className="bl-field">
          <label htmlFor="bl-layout">Paper</label>
          <Select id="bl-layout" value={settings.layout} onChange={(v) => set({ layout: v })} options={LAYOUTS} style={{ width: '100%' }} popupMatchSelectWidth={false} />
        </div>
        <div className="bl-field">
          <label htmlFor="bl-size">Label size</label>
          <Select id="bl-size" value={settings.layout === 'a4-65' ? 'a4' : settings.size} onChange={(v) => set({ size: v })}
            disabled={settings.layout === 'a4-65'} style={{ width: '100%' }} popupMatchSelectWidth={false}
            options={settings.layout === 'a4-65' ? [{ value: 'a4', label: '38.1 × 21.2 mm (fixed by sheet)' }] : LABEL_SIZES} />
        </div>
        <div className="bl-field">
          <label htmlFor="bl-design">Design</label>
          <Select id="bl-design" value={settings.design} onChange={(v) => set({ design: v })} options={LABEL_DESIGNS} style={{ width: '100%' }} popupMatchSelectWidth={false} />
        </div>
        {settings.layout === 'a4-65' ? (
          <div className="bl-field">
            <label htmlFor="bl-start">Start at label no.</label>
            <InputNumber id="bl-start" min={1} max={perSheet} value={startPos} onChange={(v) => setStartPos(v || 1)} style={{ width: '100%' }} />
            <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>Skip labels already used on a half-used sheet (1–{perSheet}, left to right).</div>
          </div>
        ) : settings.layout === 'roll' && wMm > hMm ? (
          <div className="bl-field">
            <label htmlFor="bl-rotate">Turn sideways for printer</label>
            <Switch id="bl-rotate" checked={settings.rotate} onChange={(v) => set({ rotate: v })} />
            <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>Keep on for printers that feed labels sideways (e.g. Zenpert).</div>
          </div>
        ) : <div />}
      </div>
      <div className="bl-field" style={{ marginTop: 12 }}>
        <label>Show on label</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {FIELD_LABELS.map(([k, l]) => (
            <Checkbox key={k} checked={settings.fields[k]} onChange={(e) => set({ fields: { ...settings.fields, [k]: e.target.checked } })}>{l}</Checkbox>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 8 }}>Prints in pure black & white for sharp thermal labels. Your choices are remembered on this device.</div>
      </>}
    </Card>
  )

  const previewCard = (
    <Card style={{ borderRadius: 14, marginBottom: 14 }} styles={{ body: { padding: isMobile ? 12 : 16 } }}
      title={<span style={{ color: TEXT }}>Preview</span>}>
      <div className="bl-preview">
        {previewSrc ? <img src={previewSrc} alt={`Label preview for ${previewProduct.product_name}`} /> : <Spin />}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <Select value={previewProduct.item_id} onChange={setPreviewId} style={{ flex: 1, minWidth: 180 }} showSearch optionFilterProp="label"
          options={(products.length ? products : [SAMPLE]).map((p) => ({ value: p.item_id, label: `${p.product_name}${p.size ? ` · ${p.size}` : ''}` }))}
          aria-label="Product to preview" />
        <Tooltip title="Print one label of this product to check alignment">
          <Button icon={<ExperimentOutlined />} onClick={testPrint}>Test print</Button>
        </Tooltip>
      </div>
      <div style={{ fontSize: 12, color: SUB, marginTop: 6 }}>{wMm} × {hMm} mm · {LABEL_DESIGNS.find((d) => d.value === settings.design)?.label}</div>
    </Card>
  )

  const printBar = (
    <div className={isMobile ? 'bl-sticky' : undefined} style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 14,
      background: 'var(--bg)', boxShadow: 'var(--neu-sm)', marginBottom: 14,
    }}>
      <div style={{ marginRight: 'auto', color: TEXT }}>
        <b>{selected.length}</b> product{selected.length === 1 ? '' : 's'} · <b>{totalLabels}</b> label{totalLabels === 1 ? '' : 's'}
        {settings.layout === 'a4-65' && totalLabels > 0 && <span style={{ color: SUB }}> · {Math.ceil((startPos - 1 + totalLabels) / perSheet)} sheet(s)</span>}
      </div>
      <span style={{ fontSize: 13, color: SUB }}>Copies each</span>
      <InputNumber size="small" min={1} max={1000} value={defaultCopies} onChange={setAllCopies} style={{ width: 70 }} aria-label="Copies for every selected product" />
      <Button size="small" onClick={copiesEqualStock} disabled={!selected.length}>Copies = stock</Button>
      <Button type="primary" icon={<PrinterOutlined />} disabled={!selected.length} loading={printing} onClick={printSelected}>
        Print {totalLabels || ''} label{totalLabels === 1 ? '' : 's'}
      </Button>
    </div>
  )

  const listCard = (
    <Card style={{ borderRadius: 14 }} styles={{ body: { padding: isMobile ? 10 : 12 } }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <Input placeholder="Search name, ID, barcode, size" prefix={<SearchOutlined />} allowClear
          value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 2, minWidth: 0 }} />
        <Select placeholder="All categories" allowClear value={category || undefined} onChange={(v) => setCategory(v || '')}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))} style={{ flex: 1, minWidth: isMobile ? '100%' : 150 }} />
      </div>
      <div className="bl-chips" style={{ marginBottom: 8 }}>
        {CHIPS.map(([k, l]) => (
          <button key={k} type="button" className={`bl-chip${chip === k ? ' bl-chip-on' : ''}`} onClick={() => setChip(k)}>{l}</button>
        ))}
      </div>
      {isMobile ? (
        loading ? <div style={{ textAlign: 'center', padding: 30 }}><Spin /></div>
          : shown.length === 0 ? <Empty description="No products match" />
            : shown.map((p) => {
              const on = selected.includes(p.item_id)
              const out = (p.stock_qty || 0) <= 0
              return (
                <div key={p.item_id} className="bl-card" style={{ opacity: out && !on ? 0.65 : 1 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <Checkbox checked={on} onChange={(e) => toggle(p.item_id, e.target.checked)} style={{ marginTop: 3 }} aria-label={`Select ${p.product_name}`} />
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => toggle(p.item_id, !on)} role="button" tabIndex={-1}>
                      <div style={{ color: TEXT, fontWeight: 600 }}>{p.product_name}</div>
                      <div style={{ fontSize: 12.5, color: SUB }}>{[p.size, p.color, p.category].filter(Boolean).join(' · ')}</div>
                      <div className="bl-code" style={{ marginTop: 2 }}>{p.barcode || p.item_id}</div>
                      <div style={{ display: 'flex', gap: 12, fontSize: 13, marginTop: 4 }}>
                        <span>MRP <b style={{ color: TEXT }}>{money(p.mrp)}</b></span>
                        <span>{out ? <span style={{ color: BAD, fontWeight: 600 }}>0 stock</span> : <>Stock <b style={{ color: TEXT }}>{p.stock_qty}</b></>}</span>
                      </div>
                    </div>
                    {on && (
                      <InputNumber size="small" min={1} max={1000} style={{ width: 64 }} value={copiesFor(p.item_id)}
                        onChange={(v) => setCopies((c) => ({ ...c, [p.item_id]: v || 1 }))} aria-label={`Copies of ${p.product_name}`} />
                    )}
                  </div>
                </div>
              )
            })
      ) : (
        <Table
          dataSource={shown} columns={columns} rowKey="item_id" loading={loading} size="middle"
          pagination={{ pageSize: 30, hideOnSinglePage: true, showSizeChanger: false }}
          rowSelection={{ selectedRowKeys: selected, onChange: (keys) => setSelected(keys), preserveSelectedRowKeys: true }}
          onRow={(p) => ({ onClick: () => { toggle(p.item_id, !selected.includes(p.item_id)) }, style: { cursor: 'pointer' } })}
          rowClassName={(p) => ((p.stock_qty || 0) <= 0 ? 'bl-out' : '')}
          locale={{ emptyText: 'No products match' }}
        />
      )}
    </Card>
  )

  return (
    <div style={{ paddingBottom: isMobile ? 120 : 0 }}>
      <style>{CSS}</style>
      <a onClick={() => navigate('/products')} style={{ color: PRIMARY, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <ArrowLeftOutlined /> Products
      </a>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <Title level={isMobile ? 4 : 3} style={{ margin: 0, color: TEXT }}>Barcode labels</Title>
        <Button icon={<HistoryOutlined />} onClick={openHistory}>{isMobile ? '' : 'Print history'}</Button>
      </div>

      {isMobile ? (
        <>
          {previewCard}
          {settingsCard}
          {listCard}
          {printBar}
        </>
      ) : (
        <div className="bl-grid">
          <div>
            {printBar}
            {listCard}
          </div>
          <div style={{ position: 'sticky', top: 72 }}>
            {previewCard}
            {settingsCard}
          </div>
        </div>
      )}

      <Modal title="Printer setup" open={helpOpen} onCancel={() => setHelpOpen(false)} footer={null} width={520}>
        <ol style={{ paddingLeft: 18, color: TEXT, lineHeight: 1.7 }}>
          <li>Click <b>Test print</b> first — it prints one label so you can check alignment.</li>
          <li>In the print window, choose your label printer (for example Zenpert, TSC or Xprinter).</li>
          <li>Set the paper size to your label size ({wMm} × {hMm} mm), or A4 for sheets.</li>
          <li>Set <b>Scale</b> to “Actual size” / 100% and <b>Margins</b> to None.</li>
          <li>If labels come out sideways, switch “Turn sideways for printer” off (roll printers only).</li>
          <li>Most browsers remember these choices for next time.</li>
        </ol>
        <Text style={{ color: SUB }}>Thermal printers print black only, so designs here use no colour.</Text>
      </Modal>

      <Modal title="Print history" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={560}>
        {history === null ? <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
          : history.length === 0 ? <Empty description="No labels printed yet" />
          : history.map((h) => (
            <div key={h.id} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.07)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ color: TEXT }}>{h.total_labels} labels</b>
                <span style={{ color: SUB, fontSize: 12.5 }}>{dayjs(h.printed_at).format('D MMM YYYY, h:mm A')} · {h.printed_by}</span>
              </div>
              <div style={{ fontSize: 12.5, color: SUB }}>
                {h.items.map((i) => `${i.product_name} ×${i.copies}`).join(', ')}
              </div>
            </div>
          ))}
      </Modal>
    </div>
  )
}
