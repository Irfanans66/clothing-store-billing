import axios from 'axios'

const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api/v1'

const api = axios.create({ baseURL: BASE, timeout: 15000 })

// Attach token from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global error handler — returns null on 4xx/5xx so callers can handle gracefully
api.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const msg = err.response?.data?.detail || err.message || 'Request failed'
    return Promise.reject(new Error(msg))
  }
)

// ── Auth ──────────────────────────────────────────────────────────────────────
export const login = (data) => api.post('/auth/login', data)
export const registerStore = (data) => api.post('/auth/register', data)
export const getStoreProfile = () => api.get('/auth/profile')
export const updateStoreProfile = (data) => api.patch('/auth/profile', data)

// ── Dashboard / Reports ───────────────────────────────────────────────────────
export const getDashboard = () => api.get('/reports/dashboard')
export const getDailySales = () => api.get('/reports/daily-sales')
export const getSalesByCategory = () => api.get('/reports/sales-by-category')
export const getSalesByPayment = () => api.get('/reports/sales-by-payment-mode')
export const getTopProducts = () => api.get('/reports/top-products')
export const getGstSummary = () => api.get('/reports/gst-summary')
export const getLowStock = () => api.get('/reports/low-stock')

// ── Customers ─────────────────────────────────────────────────────────────────
export const getCustomers = (params = {}) => api.get('/customers/', { params })
export const getCustomer = (id) => api.get(`/customers/${id}`)
export const createCustomer = (data) => api.post('/customers/', data)
export const updateCustomer = (id, data) => api.patch(`/customers/${id}`, data)

// ── Products ──────────────────────────────────────────────────────────────────
export const getProducts = (params = {}) => api.get('/products/', { params })
export const getProduct = (id) => api.get(`/products/${id}`)
export const createProduct = (data) => api.post('/products/', data)
export const updateProduct = (id, data) => api.patch(`/products/${id}`, data)
export const adjustStock = (id, delta) =>
  api.patch(`/products/${id}/stock`, null, { params: { delta } })

// ── Bills ─────────────────────────────────────────────────────────────────────
export const getBills = (params = {}) => api.get('/bills/', { params })
export const getBill = (billNo) => api.get(`/bills/${billNo}`)
export const createBill = (data) => api.post('/bills/', data)
export const getReceiptPdfUrl = (billNo) =>
  `${BASE}/bills/${billNo}/receipt-pdf`
export const getPublicReceiptUrl = (shareToken) =>
  `${BASE}/bills/public/${shareToken}`

// ── Team ──────────────────────────────────────────────────────────────────────
export const getTeam = () => api.get('/store-users/')
export const createTeamUser = (data) => api.post('/store-users/', data)
export const toggleTeamUser = (username) =>
  api.patch(`/store-users/${username}/toggle`)
export const changeTeamPassword = (username, data) =>
  api.patch(`/store-users/${username}/password`, data)

// ── Super Admin ───────────────────────────────────────────────────────────────
export const adminOverview = () => api.get('/admin/overview')
export const adminListStores = () => api.get('/admin/stores')
export const adminToggleStore = (code) => api.patch(`/admin/stores/${code}/toggle`)
export const adminUpdateStore = (code, data) => api.patch(`/admin/stores/${code}`, data)
export const adminDailyRevenue = () => api.get('/admin/daily-revenue')
export const adminRevenueByStore = () => api.get('/admin/revenue-by-store')