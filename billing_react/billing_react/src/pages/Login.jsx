import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { message } from 'antd'
import {
  UserOutlined, LockOutlined, ShopOutlined, MailOutlined, PhoneOutlined,
  EnvironmentOutlined, BankOutlined, GlobalOutlined, EyeOutlined,
  EyeInvisibleOutlined, DownOutlined, LoginOutlined, CheckCircleFilled,
} from '@ant-design/icons'
import { login, registerStore } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { COUNTRIES } from '../utils/currency'

const BG      = '#EDE8E2'
const DARK    = 'rgba(163,155,140,0.55)'
const LITE    = 'rgba(255,255,255,0.92)'
const BLUE    = '#82B8D4'
const MINT    = '#96C9B0'
const PEACH   = '#F0C4A0'
const PRIMARY = '#2F6690'   // one strong primary for buttons / active tab (white text ≈ 6:1 contrast)
const TEXT    = '#3A3530'
const SUB     = '#5F5853'   // darker secondary text for readability on beige
const ICON    = '#7A726C'

const SUPPORT_WHATSAPP = '918809968819'
const REMEMBER_KEY = 'remember_username'

const DIAL_CODES = {
  IN: '+91', US: '+1', GB: '+44', EU: '', AE: '+971', SA: '+966', PK: '+92', BD: '+880',
  NP: '+977', LK: '+94', MY: '+60', SG: '+65', AU: '+61', CA: '+1', ZA: '+27', NG: '+234',
  KE: '+254', GH: '+233', CN: '+86', JP: '+81', ID: '+62', PH: '+63',
}

const neu = (inset = false) => inset
  ? `inset 4px 4px 10px ${DARK}, inset -4px -4px 10px ${LITE}`
  : `6px 6px 18px ${DARK}, -6px -6px 18px ${LITE}`

// Page-level CSS (media queries / pseudo-elements can't be done inline)
const CSS = `
.lb-page { min-height: 100vh; background: ${BG}; position: relative; overflow: hidden;
  font-family: 'Poppins', sans-serif; padding: 32px 16px 24px;
  display: flex; flex-direction: column; align-items: center; }
.lb-main { width: 100%; max-width: 560px; position: relative; z-index: 1;
  display: grid; grid-template-columns: 1fr; gap: 40px; align-items: start; }
.lb-features { display: none; }
.lb-card { background: ${BG}; border-radius: 26px; box-shadow: ${neu()}; padding: 28px; }
.lb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.lb-full { grid-column: 1 / -1; }
.lb-section { grid-column: 1 / -1; font-size: 12px; font-weight: 700; color: ${SUB};
  text-transform: uppercase; letter-spacing: 0.8px; margin: 4px 0 10px; }
.lb-input::placeholder { color: #8A837D; opacity: 1; }
.lb-input { min-width: 0; width: 100%; }
.lb-select { appearance: none; -webkit-appearance: none; }
.lb-blob { position: absolute; pointer-events: none; filter: blur(2px); }
.lb-footer-links { display: flex; align-items: center; justify-content: center; gap: 8px 20px; flex-wrap: wrap; }
.lb-footer-links a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 8px;
  text-decoration: none; font-size: 14px; font-weight: 600; }
.lb-badge { width: 84px; height: 84px; }
.lb-badge img { width: 72px; height: 72px; }
.lb-title { font-size: 26px; }
@media (min-width: 960px) {
  .lb-main { max-width: 1040px; grid-template-columns: 1fr 540px; }
  .lb-features { display: block; padding-top: 24px; }
}
@media (max-width: 600px) {
  .lb-page { padding: 20px 16px 16px; }
  .lb-card { padding: 22px 18px; }
  .lb-grid { grid-template-columns: 1fr; }
  .lb-badge { width: 60px; height: 60px; border-radius: 16px !important; }
  .lb-badge img { width: 50px; height: 50px; }
  .lb-title { font-size: 21px; }
  .lb-brand { margin-bottom: 16px !important; }
  .lb-blob { transform: scale(0.55); opacity: 0.18 !important; }
  .lb-footer-links { flex-direction: column; gap: 0; }
  .lb-footer-sep { display: none; }
}
`

// ── Labelled field wrapper ───────────────────────────────────────────────────
function Field({ label, htmlFor, required, optional, children, hint, full }) {
  return (
    <div className={full ? 'lb-full' : undefined} style={{ marginBottom: 14 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: TEXT, marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: '#C0392B', marginLeft: 3 }} aria-hidden="true">*</span>}
        {optional && <span style={{ color: SUB, fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
      </label>
      {children}
      {hint}
    </div>
  )
}

function useFocusBox() {
  const [focused, setFocused] = useState(false)
  const box = {
    display: 'flex', alignItems: 'center', gap: 10,
    background: BG, borderRadius: 14,
    boxShadow: focused ? neu(true) : `3px 3px 8px ${DARK}, -3px -3px 8px ${LITE}`,
    padding: '0 14px', minHeight: 46,
    transition: 'box-shadow 0.25s',
  }
  return { box, focused, onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
}

const inputStyle = {
  flex: 1, border: 'none', background: 'transparent', outline: 'none',
  fontSize: 14, color: '#2F2A26', fontFamily: "'Poppins', sans-serif", padding: '12px 0',
}

// ── Reusable styled input ────────────────────────────────────────────────────
function NeuInput({ icon, placeholder, type = 'text', value, onChange, id, prefix, autoComplete, required }) {
  const { box, focused, onFocus, onBlur } = useFocusBox()
  const [show, setShow] = useState(false)
  const isPassword = type === 'password'
  return (
    <div style={box}>
      <span style={{ fontSize: 16, color: focused ? PRIMARY : ICON, display: 'flex' }}>{icon}</span>
      {prefix && <span style={{ fontSize: 14, color: SUB, fontWeight: 600 }}>{prefix}</span>}
      <input
        id={id}
        className="lb-input"
        type={isPassword && show ? 'text' : type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        autoComplete={autoComplete}
        required={required}
        style={inputStyle}
      />
      {isPassword && (
        <button type="button" onClick={() => setShow(s => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: ICON, fontSize: 16, padding: 6, display: 'flex' }}>
          {show ? <EyeInvisibleOutlined /> : <EyeOutlined />}
        </button>
      )}
    </div>
  )
}

// ── Reusable styled select ───────────────────────────────────────────────────
function NeuSelect({ icon, value, onChange, options, id }) {
  const { box, focused, onFocus, onBlur } = useFocusBox()
  return (
    <div style={box}>
      <span style={{ fontSize: 16, color: focused ? PRIMARY : ICON, display: 'flex' }}>{icon}</span>
      <select
        id={id}
        className="lb-input lb-select"
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <DownOutlined style={{ fontSize: 12, color: ICON, pointerEvents: 'none' }} />
    </div>
  )
}

// ── Soft 3D button ────────────────────────────────────────────────────────────
function NeuButton({ children, loading }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      type="submit"
      disabled={loading}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: '100%', padding: '14px 0', minHeight: 48,
        background: PRIMARY,
        border: 'none', borderRadius: 14, cursor: loading ? 'wait' : 'pointer',
        color: '#fff', fontWeight: 700, fontSize: 15,
        fontFamily: "'Poppins', sans-serif", letterSpacing: 0.5,
        boxShadow: pressed
          ? `inset 3px 3px 8px rgba(0,0,0,0.25)`
          : `4px 4px 14px rgba(0,0,0,0.2), -2px -2px 8px rgba(255,255,255,0.5)`,
        transition: 'box-shadow 0.15s, transform 0.15s',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        opacity: loading ? 0.75 : 1,
      }}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

// ── Decorative blob ───────────────────────────────────────────────────────────
function Blob({ top, left, right, bottom, size, color, opacity = 0.45, borderRadius = '60% 40% 55% 45% / 50% 60% 40% 55%' }) {
  return (
    <div className="lb-blob" style={{ top, left, right, bottom, width: size, height: size, background: color, opacity, borderRadius }} />
  )
}

// ── Password strength ─────────────────────────────────────────────────────────
function passwordStrength(pw) {
  if (!pw) return null
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++
  if (/\d/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (pw.length < 6) return { label: 'Too short — use at least 6 characters', color: '#C0392B', pct: 15 }
  if (score <= 1) return { label: 'Weak', color: '#C0392B', pct: 33 }
  if (score <= 3) return { label: 'Medium', color: '#B9770E', pct: 66 }
  return { label: 'Strong', color: '#1E8449', pct: 100 }
}

function StrengthHint({ password }) {
  const s = passwordStrength(password)
  if (!s) return <div style={{ fontSize: 11.5, color: SUB, marginTop: 6 }}>At least 6 characters. Mix letters, numbers and symbols.</div>
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ height: 4, borderRadius: 2, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${s.pct}%`, height: '100%', background: s.color, transition: 'width 0.2s' }} />
      </div>
      <div style={{ fontSize: 11.5, color: s.color, marginTop: 4, fontWeight: 600 }}>{s.label}</div>
    </div>
  )
}

const FEATURES = [
  'GST bills & printed receipts in seconds',
  'Inventory with barcode labels',
  'UPI payments with QR codes',
  'Sales reports and customer history',
  'Works on phone, tablet and desktop',
]

// ── Main Login page ───────────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('login')

  // Login state
  const remembered = (() => { try { return localStorage.getItem(REMEMBER_KEY) || '' } catch { return '' } })()
  const [username, setUsername] = useState(remembered)
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(!!remembered)

  // Register state
  const [reg, setReg] = useState({
    store_name: '', owner_user: '', password: '', confirm_password: '',
    email: '', phone: '', address: '', gstin: '', country: 'India',
  })
  const [agreed, setAgreed] = useState(false)

  const dialCode = DIAL_CODES[COUNTRIES.find(c => c.name === reg.country)?.code] || ''

  async function handleLogin(e) {
    e.preventDefault()
    if (!username || !password) { message.warning('Enter username and password'); return }
    setLoading(true)
    try {
      const res = await login({ username, password })
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, username)
        else localStorage.removeItem(REMEMBER_KEY)
      } catch { /* storage unavailable */ }
      localStorage.setItem('token', res.access_token)
      setAuth({ token: res.access_token, role: res.role, storeCode: res.store_code || '', storeName: res.store_name || 'Super Admin', username })
      navigate(res.role === 'SuperAdmin' ? '/super-admin' : '/dashboard')
    } catch (err) { message.error(err.message)
    } finally { setLoading(false) }
  }

  async function handleRegister(e) {
    e.preventDefault()
    const required = { store_name: 'Store Name', phone: 'Phone', email: 'Email', address: 'Address', owner_user: 'Username', password: 'Password' }
    const missing = Object.entries(required).find(([f]) => !reg[f].trim())
    if (missing) { message.warning(`Please enter ${missing[1]}`); return }
    if (!/^[a-z0-9][a-z0-9._-]{2,29}$/i.test(reg.owner_user.trim())) {
      message.error('Username must be 3–30 characters: letters, numbers, dot, dash or underscore'); return
    }
    const phoneDigits = reg.phone.replace(/\D/g, '').replace(/^(91(?=\d{10}$)|0(?=\d{10}$))/, '')
    if (reg.country === 'India' ? !/^[6-9]\d{9}$/.test(phoneDigits) : !/^\d{7,15}$/.test(phoneDigits)) {
      message.error(reg.country === 'India' ? 'Enter a valid 10-digit mobile number' : 'Enter a valid phone number'); return
    }
    if (reg.password !== reg.confirm_password) { message.error('Passwords do not match'); return }
    if (!agreed) { message.warning('Please accept the Terms of Service and Privacy Policy'); return }
    setLoading(true)
    try {
      const res = await registerStore(reg)
      message.success(res.message)
      setUsername(reg.owner_user.toLowerCase())
      setTab('login')
    } catch (err) { message.error(err.message)
    } finally { setLoading(false) }
  }

  const r = (field) => (e) => setReg((p) => ({ ...p, [field]: e.target.value }))

  const forgotHref = `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
    `Hi, I forgot my Loacal Billing password. My username is: ${username || ''}`
  )}`

  return (
    <div className="lb-page">
      <style>{CSS}</style>

      {/* Decorative blobs */}
      <Blob top={-60} left={-60}   size={280} color={BLUE}  opacity={0.3} />
      <Blob top={40}  right={-40}  size={180} color={MINT}  opacity={0.32} borderRadius="50% 60% 40% 55% / 60% 40% 60% 45%" />
      <Blob bottom={-40} right={80} size={220} color={PEACH} opacity={0.3} borderRadius="55% 45% 60% 40% / 45% 60% 40% 55%" />
      <Blob bottom={60} left={-30} size={150} color={MINT}  opacity={0.25} />

      {/* Logo + Brand — pinned to the top so switching tabs doesn't move it */}
      <div className="lb-brand" style={{ textAlign: 'center', marginBottom: 24, position: 'relative', zIndex: 1 }}>
        <div className="lb-badge" style={{
          borderRadius: 22, margin: '0 auto 12px',
          background: BG, boxShadow: neu(),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <img src="/logo-icon.svg" alt="" />
        </div>
        <h1 className="lb-title" style={{ margin: 0, fontWeight: 800, color: TEXT, letterSpacing: '-0.5px' }}>
          Loacal Billing
        </h1>
        <div style={{ fontSize: 13, color: SUB, marginTop: 4, letterSpacing: 0.3 }}>
          Smart POS for Clothing Stores
        </div>
      </div>

      <div className="lb-main">

        {/* Feature list (desktop only) */}
        <div className="lb-features">
          <h2 style={{ fontSize: 28, lineHeight: 1.25, color: TEXT, margin: '0 0 12px', fontWeight: 800 }}>
            Billing made simple for clothing & boutique stores
          </h2>
          <p style={{ fontSize: 15, color: SUB, margin: '0 0 24px', lineHeight: 1.6 }}>
            Create bills, manage stock and accept payments — all from one app.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 15, color: TEXT, marginBottom: 14 }}>
                <CheckCircleFilled style={{ color: PRIMARY, fontSize: 18 }} />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div>
          {/* Card */}
          <div className="lb-card">

            {/* Tab switcher */}
            <div role="tablist" style={{
              display: 'flex', background: BG,
              borderRadius: 14, padding: 4, marginBottom: 24,
              boxShadow: neu(true),
            }}>
              {[['login', <LoginOutlined key="i" />, 'Login'], ['register', <ShopOutlined key="i" />, 'Register']].map(([k, icon, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} style={{
                  flex: 1, padding: '10px 0', border: 'none', borderRadius: 11,
                  cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                  fontSize: 14, fontWeight: tab === k ? 700 : 500,
                  color: tab === k ? '#fff' : SUB,
                  background: tab === k ? PRIMARY : 'transparent',
                  boxShadow: tab === k ? `3px 3px 10px rgba(0,0,0,0.15), -2px -2px 6px rgba(255,255,255,0.5)` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.2s',
                }}>{icon}{label}</button>
              ))}
            </div>

            {tab === 'login' ? (
              <form onSubmit={handleLogin} noValidate>
                <Field label="Username" htmlFor="username">
                  <NeuInput icon={<UserOutlined />} placeholder="Enter your username" value={username}
                    onChange={e => setUsername(e.target.value)} id="username" autoComplete="username" />
                </Field>
                <Field label="Password" htmlFor="password">
                  <NeuInput icon={<LockOutlined />} placeholder="Enter your password" type="password" value={password}
                    onChange={e => setPassword(e.target.value)} id="password" autoComplete="current-password" />
                </Field>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '2px 0 18px', gap: 12, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: TEXT, cursor: 'pointer', minHeight: 32 }}>
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: PRIMARY }} />
                    Remember me
                  </label>
                  <a href={forgotHref} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 13, color: PRIMARY, fontWeight: 600, textDecoration: 'none', minHeight: 32, display: 'flex', alignItems: 'center' }}>
                    Forgot password?
                  </a>
                </div>
                <NeuButton loading={loading}>Login</NeuButton>
              </form>
            ) : (
              <form onSubmit={handleRegister} noValidate>
                <div className="lb-grid">
                  <div className="lb-section">Store details</div>
                  <Field label="Store Name" htmlFor="reg-store" required>
                    <NeuInput id="reg-store" icon={<ShopOutlined />} placeholder="e.g. Sharma Garments"
                      value={reg.store_name} onChange={r('store_name')} autoComplete="organization" required />
                  </Field>
                  <Field label="Phone" htmlFor="reg-phone" required>
                    <NeuInput id="reg-phone" icon={<PhoneOutlined />} prefix={dialCode} type="tel" placeholder="98765 43210"
                      value={reg.phone} onChange={r('phone')} autoComplete="tel-national" required />
                  </Field>
                  <Field label="Email" htmlFor="reg-email" required full>
                    <NeuInput id="reg-email" icon={<MailOutlined />} type="email" placeholder="you@example.com"
                      value={reg.email} onChange={r('email')} autoComplete="email" required />
                  </Field>
                  <Field label="Address" htmlFor="reg-address" required full>
                    <NeuInput id="reg-address" icon={<EnvironmentOutlined />} placeholder="Shop address"
                      value={reg.address} onChange={r('address')} autoComplete="street-address" required />
                  </Field>
                  <Field label="GSTIN" htmlFor="reg-gstin" optional>
                    <NeuInput id="reg-gstin" icon={<BankOutlined />} placeholder="22AAAAA0000A1Z5"
                      value={reg.gstin} onChange={r('gstin')} />
                  </Field>
                  <Field label="Country" htmlFor="reg-country" required>
                    <NeuSelect
                      id="reg-country"
                      icon={<GlobalOutlined />}
                      value={reg.country}
                      onChange={r('country')}
                      options={COUNTRIES.map(c => ({ value: c.name, label: `${c.name} (${c.symbol} ${c.currency})` }))}
                    />
                  </Field>

                  <div className="lb-section" style={{ marginTop: 8 }}>Your account</div>
                  <Field label="Username" htmlFor="reg-user" required full>
                    <NeuInput id="reg-user" icon={<UserOutlined />} placeholder="No spaces, used to log in"
                      value={reg.owner_user} onChange={r('owner_user')} autoComplete="username" required />
                  </Field>
                  <Field label="Password" htmlFor="reg-pass" required hint={<StrengthHint password={reg.password} />}>
                    <NeuInput id="reg-pass" icon={<LockOutlined />} type="password" placeholder="Create a password"
                      value={reg.password} onChange={r('password')} autoComplete="new-password" required />
                  </Field>
                  <Field label="Confirm Password" htmlFor="reg-pass2" required
                    hint={reg.confirm_password && reg.confirm_password !== reg.password
                      ? <div style={{ fontSize: 11.5, color: '#C0392B', marginTop: 6, fontWeight: 600 }}>Passwords do not match</div>
                      : null}>
                    <NeuInput id="reg-pass2" icon={<LockOutlined />} type="password" placeholder="Re-enter password"
                      value={reg.confirm_password} onChange={r('confirm_password')} autoComplete="new-password" required />
                  </Field>
                </div>

                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: TEXT, margin: '4px 0 18px', cursor: 'pointer', lineHeight: 1.5 }}>
                  <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                    style={{ width: 16, height: 16, marginTop: 3, accentColor: PRIMARY, flexShrink: 0 }} />
                  <span>
                    I agree to the{' '}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: PRIMARY, fontWeight: 600 }}>Terms of Service</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: PRIMARY, fontWeight: 600 }}>Privacy Policy</a>
                  </span>
                </label>

                <NeuButton loading={loading}>Register Store</NeuButton>
              </form>
            )}
          </div>

          {/* Footer */}
          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div style={{ fontSize: 13, color: SUB, marginBottom: 4 }}>
              www.loacalbilling.com
            </div>
            <div className="lb-footer-links">
              {/* WhatsApp */}
              <a href={`https://wa.me/${SUPPORT_WHATSAPP}`} target="_blank" rel="noopener noreferrer" style={{ color: '#128C4B' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                +91 8809968819
              </a>
              <span className="lb-footer-sep" style={{ color: '#B5AEA7', fontSize: 14 }} aria-hidden="true">|</span>
              {/* Instagram */}
              <a href="https://instagram.com/localbillingofficial" target="_blank" rel="noopener noreferrer" style={{ color: '#C13584' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="url(#igGrad)" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <defs>
                    <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#f09433"/>
                      <stop offset="25%" stopColor="#e6683c"/>
                      <stop offset="50%" stopColor="#dc2743"/>
                      <stop offset="75%" stopColor="#cc2366"/>
                      <stop offset="100%" stopColor="#bc1888"/>
                    </linearGradient>
                  </defs>
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                </svg>
                @localbillingofficial
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
