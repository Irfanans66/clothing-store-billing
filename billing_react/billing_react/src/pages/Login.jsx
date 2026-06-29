import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Form, message, Tabs } from 'antd'
import { login, registerStore } from '../api/client'
import { useAuthStore } from '../store/authStore'

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
    email: '', phone: '', address: '', gstin: '',
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
              <NeuButton onClick={handleRegister} loading={loading} color={MINT}>Register Store</NeuButton>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#B0AAA4' }}>
          www.loacalbilling.com
        </div>
      </div>
    </div>
  )
}