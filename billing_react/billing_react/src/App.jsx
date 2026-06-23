import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'
import { useAuthStore } from './store/authStore'
import { useOfflineStore } from './store/offlineStore'
import AppLayout from './components/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewBill from './pages/NewBill'
import BillHistory from './pages/BillHistory'
import Customers from './pages/Customers'
import Products from './pages/Products'
import BarcodeLabels from './pages/BarcodeLabels'
import Reports from './pages/Reports'
import Team from './pages/Team'
import Settings from './pages/Settings'
import SuperAdmin from './pages/SuperAdmin'
import Help from './pages/Help'
import Privacy from './pages/Privacy'

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
        algorithm: antTheme.darkAlgorithm,
        token: {
          colorPrimary:        '#C9A84C',
          colorLink:           '#C9A84C',
          fontFamily:          "'Poppins', 'Inter', 'Segoe UI', sans-serif",
          borderRadius:        12,
          colorBgLayout:       'transparent',
          colorBgContainer:    'rgba(18, 10, 3, 0.55)',
          colorBgElevated:     'rgba(25, 14, 4, 0.80)',
          colorBorder:         'rgba(201, 168, 76, 0.2)',
          colorText:           'rgba(255,255,255,0.92)',
          colorTextSecondary:  'rgba(255,255,255,0.55)',
          colorTextTertiary:   'rgba(255,255,255,0.38)',
        },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/privacy" element={<Privacy />} />
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
      </BrowserRouter>
    </ConfigProvider>
  )
}