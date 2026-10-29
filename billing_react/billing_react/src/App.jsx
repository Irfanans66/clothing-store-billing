import React, { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, Spin, theme as antTheme } from 'antd'
import { useAuthStore } from './store/authStore'
import { useOfflineStore } from './store/offlineStore'
import AppLayout from './components/AppLayout'

// Each page is its own chunk, loaded when first opened (keeps the main bundle small;
// the PWA precaches every chunk so they still work offline)
const Login         = lazy(() => import('./pages/Login'))
const Dashboard     = lazy(() => import('./pages/Dashboard'))
const NewBill       = lazy(() => import('./pages/NewBill'))
const BillHistory   = lazy(() => import('./pages/BillHistory'))
const Customers     = lazy(() => import('./pages/Customers'))
const Products      = lazy(() => import('./pages/Products'))
const BarcodeLabels = lazy(() => import('./pages/BarcodeLabels'))
const Reports       = lazy(() => import('./pages/Reports'))
const Team          = lazy(() => import('./pages/Team'))
const Settings      = lazy(() => import('./pages/Settings'))
const SuperAdmin    = lazy(() => import('./pages/SuperAdmin'))
const Help          = lazy(() => import('./pages/Help'))
const Privacy       = lazy(() => import('./pages/Privacy'))
const Terms         = lazy(() => import('./pages/Terms'))

const pageFallback = (
  <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><Spin /></div>
)

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const setOnline = useOfflineStore((s) => s.setOnline)

  useEffect(() => {
    const on  = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [setOnline])

  return (
    <ConfigProvider
      theme={{
        algorithm: antTheme.defaultAlgorithm,
        token: {
          colorPrimary:        '#82B8D4',
          colorLink:           '#5E9AB8',
          fontFamily:          "'Poppins', 'Inter', 'Segoe UI', sans-serif",
          borderRadius:        12,
          colorBgLayout:       '#EDE8E2',
          colorBgContainer:    '#EDE8E2',
          colorBgElevated:     '#EDE8E2',
          colorBorder:         '#D8D2CB',
          colorText:           '#3A3530',
          colorTextSecondary:  '#5F5853',
          colorTextTertiary:   '#7A726C',
        },
      }}
    >
      <BrowserRouter>
        <Suspense fallback={pageFallback}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <AppLayout />
              </PrivateRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard"      element={<Dashboard />} />
            <Route path="new-bill"        element={<NewBill />} />
            <Route path="bill-history"    element={<BillHistory />} />
            <Route path="customers"       element={<Customers />} />
            <Route path="products"        element={<Products />} />
            <Route path="barcode-labels"  element={<BarcodeLabels />} />
            <Route path="reports"         element={<Reports />} />
            <Route path="team"            element={<Team />} />
            <Route path="settings"        element={<Settings />} />
            <Route path="help"            element={<Help />} />
            <Route path="super-admin"     element={<SuperAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </BrowserRouter>
    </ConfigProvider>
  )
}