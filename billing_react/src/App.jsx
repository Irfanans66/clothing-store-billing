import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ConfigProvider, theme as antTheme } from 'antd'
import { useAuthStore } from './store/authStore'
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

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function App() {
  const darkMode = useAuthStore((s) => s.darkMode)

  useEffect(() => {
    document.body.style.background = darkMode ? '#141414' : '#f0f2f5'
  }, [darkMode])

  return (
    <ConfigProvider
      theme={{
        algorithm: darkMode ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
        token: { colorPrimary: '#1A237E' },
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
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
            <Route path="super-admin"     element={<SuperAdmin />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  )
}