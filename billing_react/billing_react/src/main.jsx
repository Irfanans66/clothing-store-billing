import React from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <ConfigProvider
    theme={{
      token: {
        colorPrimary:        '#7C3AED',
        colorLink:           '#7C3AED',
        colorSuccess:        '#10B981',
        colorWarning:        '#F59E0B',
        colorError:          '#EF4444',
        colorInfo:           '#06B6D4',
        borderRadius:        10,
        borderRadiusLG:      14,
        borderRadiusSM:      6,
        fontFamily:          "'Poppins', 'Inter', 'Segoe UI', sans-serif",
        fontSize:            14,
        fontSizeLG:          16,
        lineHeight:          1.6,
        colorBgContainer:    '#ffffff',
        colorBgLayout:       '#F5F3FF',
        colorBgElevated:     '#ffffff',
        colorTextBase:       '#1e293b',
        colorTextSecondary:  '#64748b',
        colorBorder:         'rgba(124,58,237,0.14)',
        colorBorderSecondary:'rgba(124,58,237,0.08)',
        boxShadow:           '0 2px 12px rgba(124,58,237,0.08)',
        boxShadowSecondary:  '0 6px 24px rgba(124,58,237,0.13)',
        controlHeight:       38,
        controlHeightLG:     44,
      },
      components: {
        Button: {
          borderRadius:      8,
          fontWeight:        600,
          primaryShadow:     '0 4px 14px rgba(124,58,237,0.3)',
        },
        Card: {
          borderRadius:      14,
          paddingLG:         24,
        },
        Input: {
          borderRadius:      8,
          paddingInline:     12,
        },
        Select: {
          borderRadius:      8,
        },
        Table: {
          borderRadius:      12,
          headerBg:          '#ede9fe',
          headerColor:       '#5b21b6',
          rowHoverBg:        '#f5f3ff',
        },
        Menu: {
          itemBg:            'transparent',
          subMenuItemBg:     'transparent',
          itemSelectedBg:    'rgba(167,139,250,0.2)',
          itemHoverBg:       'rgba(255,255,255,0.09)',
          itemSelectedColor: '#ffffff',
          itemColor:         'rgba(255,255,255,0.72)',
          iconSize:          16,
          itemHeight:        44,
          itemMarginInline:  4,
          itemBorderRadius:  8,
          itemPaddingInline: 16,
        },
        Layout: {
          siderBg:           'transparent',
          bodyBg:            '#F5F3FF',
          headerBg:          '#ffffff',
          headerHeight:      56,
        },
        Tabs: {
          inkBarColor:       '#7C3AED',
          itemSelectedColor: '#7C3AED',
          itemHoverColor:    '#8B5CF6',
        },
        Tag: {
          borderRadius:      20,
          fontSizeSM:        12,
        },
        Progress: {
          defaultColor:      '#7C3AED',
        },
        Statistic: {
          contentFontSize:   28,
        },
        Badge: {
          colorError:        '#7C3AED',
        },
      },
    }}
  >
    <App />
  </ConfigProvider>
)