import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, message, Tabs } from 'antd'
import { login, registerStore } from '../api/client'
import { useAuthStore } from '../store/authStore'
import { COUNTRIES } from '../utils/currency'

const BG   = '#EDE8E2'
const DARK = 'rgba(163,155,140,0.55)'
const LITE = 'rgba(255,255,255,0.92)'
const BLUE = '#82B8D4'
const MINT = '#96C9B0'
const PEACH= '#F0C4A0'

const neu = (inset = false) => inset
  ? `inset 4px 4px 10px ${DARK}, inset -4px -4px 10px ${LITE}`
  : `6px 6px 18px ${DARK}, -6px -6px 18px ${LITE}`

// ── Reusable styled input ────────────────────────────────────────────────────
function NeuInput({ icon, placeholder, type = 'text', value, onChange, id }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: BG,
      borderRadius: 14,
      boxShadow: focused ? neu(true) : `3px 3px 8px ${DARK}, -3px -3px 8px ${LITE}`,
      padding: '12px 16px',
      marginBottom: 14,
      transition: 'box-shadow 0.25s',
    }}>
      <span style={{ fontSize: 16, color: focused ? BLUE : '#A09890' }}>{icon}</span>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: 'none', background: 'transparent',
          outline: 'none', fontSize: 14, color: '#4A4440',
          fontFamily: "'Poppins', sans-serif",
        }}
      />
    </div>
  )
}

// ── Reusable styled select ───────────────────────────────────────────────────
function NeuSelect({ icon, value, onChange, options }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: BG,
      borderRadius: 14,
      boxShadow: focused ? `inset 4px 4px 10px ${DARK}, inset -4px -4px 10px ${LITE}` : `3px 3px 8px ${DARK}, -3px -3px 8px ${LITE}`,
      padding: '12px 16px',
      marginBottom: 14,
      transition: 'box-shadow 0.25s',
    }}>
      <span style={{ fontSize: 16, color: focused ? BLUE : '#A09890' }}>{icon}</span>
      <select
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1, border: 'none', background: 'transparent',
          outline: 'none', fontSize: 14, color: '#4A4440',
          fontFamily: "'Poppins', sans-serif", cursor: 'pointer',
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ── Soft 3D button ────────────────────────────────────────────────────────────
function NeuButton({ children, onClick, loading, color = BLUE }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={loading}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        width: '100%', padding: '13px 0',
        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
        border: 'none', borderRadius: 14, cursor: 'pointer',
        color: '#fff', fontWeight: 700, fontSize: 15,
        fontFamily: "'Poppins', sans-serif", letterSpacing: 0.5,
        boxShadow: pressed
          ? `inset 3px 3px 8px rgba(0,0,0,0.18), inset -2px -2px 6px rgba(255,255,255,0.25)`
          : `4px 4px 14px rgba(0,0,0,0.18), -2px -2px 8px rgba(255,255,255,0.5)`,
        transition: 'box-shadow 0.15s, transform 0.15s',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

// ── Decorative blob ───────────────────────────────────────────────────────────
function Blob({ top, left, right, bottom, size, color, opacity = 0.45, borderRadius = '60% 40% 55% 45% / 50% 60% 40% 55%' }) {
  return (
    <div style={{
      position: 'absolute', top, left, right, bottom,
      width: size, height: size,
      background: color, opacity,
      borderRadius,
      filter: 'blur(2px)',
      pointerEvents: 'none',
    }} />
  )
}

// ── Main Login page ───────────────────────────────────────────────────────────
export default function Login() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)
  const [loading, setLoading] = useState(false)
  const [tab, setTab]         = useState('login')

  // Login state
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // Register state
  const [reg, setReg] = useState({
    store_name: '', owner_user: '', password: '', confirm_password: '',
    email: '', phone: '', address: '', gstin: '', country: 'India',
  })

  async function handleLogin() {
    if (!username || !password) { message.warning('Enter username and password'); return }
    setLoading(true)
    try {
      const res = await login({ username, password })
      localStorage.setItem('token', res.access_token)
      setAuth({ token: res.access_token, role: res.role, storeCode: res.store_code || '', storeName: res.store_name || 'Super Admin', username })
      navigate(res.role === 'SuperAdmin' ? '/super-admin' : '/dashboard')
    } catch (err) { message.error(err.message)
    } finally { setLoading(false) }
  }

  async function handleRegister() {
    if (reg.password !== reg.confirm_password) { message.error('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await registerStore(reg)
      message.success(res.message)
      setTab('login')
    } catch (err) { message.error(err.message)
    } finally { setLoading(false) }
  }

  const r = (field) => (e) => setReg((p) => ({ ...p, [field]: e.target.value }))

  return (
    <div style={{
      minHeight: '100vh', background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, position: 'relative', overflow: 'hidden',
      fontFamily: "'Poppins', sans-serif",
    }}>

      {/* Decorative blobs */}
      <Blob top={-60} left={-60}   size={280} color={BLUE}  opacity={0.35} />
      <Blob top={40}  right={-40}  size={180} color={MINT}  opacity={0.4}  borderRadius="50% 60% 40% 55% / 60% 40% 60% 45%" />
      <Blob bottom={-40} right={80} size={220} color={PEACH} opacity={0.35} borderRadius="55% 45% 60% 40% / 45% 60% 40% 55%" />
      <Blob bottom={60} left={-30} size={150} color={MINT}  opacity={0.3}  />

      {/* Small floating circles */}
      {[[40,'15%',null,null,32,BLUE,0.25],[null,null,'12%',120,24,MINT,0.3],[null,'35%',null,50,18,PEACH,0.4]].map(([t,l,r,b,s,c,o],i) => (
        <div key={i} style={{ position:'absolute', top:t, left:l, right:r, bottom:b, width:s, height:s, borderRadius:'50%', background:c, opacity:o, boxShadow: neu(), pointerEvents:'none' }} />
      ))}

      <div style={{ width: '100%', maxWidth: 440, position: 'relative', zIndex: 1 }}>

        {/* Logo + Brand */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80, borderRadius: 22, margin: '0 auto 14px',
            background: BG, boxShadow: neu(),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src="/logo-icon.svg" alt="Local Billing" style={{ width: 52, height: 52 }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#3A3530', letterSpacing: '-0.5px' }}>
            Local Billing
          </div>
          <div style={{ fontSize: 12, color: '#9A9490', marginTop: 4, letterSpacing: 0.5 }}>
            Smart POS for Clothing Stores
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: BG, borderRadius: 26,
          boxShadow: neu(),
          padding: '28px 28px 24px',
        }}>

          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: BG,
            borderRadius: 14, padding: 4, marginBottom: 24,
            boxShadow: neu(true),
          }}>
            {[['login','🔐 Login'],['register','🏪 Register']].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                flex: 1, padding: '9px 0', border: 'none', borderRadius: 11,
                cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
                fontSize: 13, fontWeight: tab === k ? 700 : 500,
                color: tab === k ? '#fff' : '#9A9490',
                background: tab === k ? `linear-gradient(135deg, ${BLUE}, ${BLUE}CC)` : 'transparent',
                boxShadow: tab === k ? `3px 3px 10px rgba(0,0,0,0.15), -2px -2px 6px rgba(255,255,255,0.5)` : 'none',
                transition: 'all 0.2s',
              }}>{label}</button>
            ))}
          </div>

          {tab === 'login' ? (
            <>
              <NeuInput icon="👤" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} id="username" />
              <NeuInput icon="🔒" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} id="password" />
              <div style={{ marginTop: 6 }}>
                <NeuButton onClick={handleLogin} loading={loading} color={BLUE}>Login</NeuButton>
              </div>
              <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: '#B0AAA4' }}>
                Default: <span style={{ color: '#7A7470', fontWeight: 600 }}>admin / admin123</span>
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
                {[['store_name','🏪','Store Name'],['owner_user','👤','Username'],['password','🔒','Password','password'],['confirm_password','🔒','Confirm Password','password'],['email','📧','Email','email'],['phone','📱','Phone']].map(([f,icon,ph,type='text']) => (
                  <div key={f} style={{ gridColumn: ['address','gstin'].includes(f) ? '1/-1' : undefined }}>
                    <NeuInput icon={icon} placeholder={ph} type={type} value={reg[f]} onChange={r(f)} />
                  </div>
                ))}
              </div>
              <NeuInput icon="📍" placeholder="Address" value={reg.address} onChange={r('address')} />
              <NeuInput icon="🏛️" placeholder="GSTIN (optional)" value={reg.gstin} onChange={r('gstin')} />
              <NeuSelect
                icon="🌍"
                value={reg.country}
                onChange={r('country')}
                options={COUNTRIES.map(c => ({ value: c.name, label: `${c.name} (${c.symbol} ${c.currency})` }))}
              />
              <NeuButton onClick={handleRegister} loading={loading} color={MINT}>Register Store</NeuButton>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <div style={{ fontSize: 11, color: '#B0AAA4', marginBottom: 10 }}>
            www.localbilling.com
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18 }}>
            {/* WhatsApp */}
            <a href="https://wa.me/918809968819" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: '#25D366', fontSize: 12, fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              +91 8809968819
            </a>
            <span style={{ color: '#D0CAC4', fontSize: 14 }}>|</span>
            {/* Instagram */}
            <a href="https://instagram.com/localbillingofficial" target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 5, textDecoration: 'none', color: '#E1306C', fontSize: 12, fontWeight: 600 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="url(#igGrad)" xmlns="http://www.w3.org/2000/svg">
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
  )
}