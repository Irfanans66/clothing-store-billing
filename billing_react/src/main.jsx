import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary: '#1A237E',
        borderRadius: 8,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      },
    }}
  >
    <App />
  </ConfigProvider>
)
