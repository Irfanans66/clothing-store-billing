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
          colorTextSecondary:  '#9A9490',
          colorTextTertiary:   '#B8B2AC',
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