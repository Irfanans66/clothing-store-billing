import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Typography, Button, Dropdown, Tag, Space, Drawer, Grid, theme as antTheme, Tooltip } from 'antd'
import {
  DashboardOutlined, ShoppingCartOutlined, FileTextOutlined,
  UserOutlined, ShopOutlined, BarcodeOutlined, BarChartOutlined,
  TeamOutlined, SettingOutlined, LogoutOutlined, SafetyCertificateOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, MenuOutlined,
  SunOutlined, MoonOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'

const { Sider, Header, Content } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

const ROLE_MENUS = {
  Admin: [
    { key: '/dashboard',      icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,             label: 'Customers' },
    { key: '/products',       icon: <ShopOutlined />,             label: 'Products' },
    { key: '/barcode-labels', icon: <BarcodeOutlined />,          label: 'Barcode Labels' },
    { key: '/reports',        icon: <BarChartOutlined />,         label: 'Reports' },
    { key: '/team',           icon: <TeamOutlined />,             label: 'Team' },
    { key: '/settings',       icon: <SettingOutlined />,          label: 'Settings' },
  ],
  Manager: [
    { key: '/dashboard',      icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,             label: 'Customers' },
    { key: '/products',       icon: <ShopOutlined />,             label: 'Products' },
    { key: '/barcode-labels', icon: <BarcodeOutlined />,          label: 'Barcode Labels' },
    { key: '/reports',        icon: <BarChartOutlined />,         label: 'Reports' },
    { key: '/team',           icon: <TeamOutlined />,             label: 'Team' },
  ],
  Cashier: [
    { key: '/dashboard',      icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,             label: 'Customers' },
  ],
  Viewer: [
    { key: '/dashboard',      icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/bill-history',   icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/reports',        icon: <BarChartOutlined />,         label: 'Reports' },
  ],
  SuperAdmin: [
    { key: '/super-admin',    icon: <SafetyCertificateOutlined />, label: 'Super Admin' },
  ],
}

const ROLE_COLORS = {
  Admin: 'blue', Manager: 'green', Cashier: 'orange',
  Viewer: 'default', SuperAdmin: 'purple',
}

const SIDER_GRADIENT = 'linear-gradient(160deg, #0a0118 0%, #160332 55%, #0d0225 100%)'
const PRIMARY = '#863bff'

function NavMenu({ menuItems, selectedKey, onSelect }) {
  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => onSelect(key)}
      style={{ background: 'transparent', borderRight: 0, marginTop: 8, padding: '0 8px' }}
    />
  )
}

function BrandHeader({ collapsed, storeName }) {
  return (
    <div style={{
      padding: collapsed ? '16px 12px' : '16px 20px',
      borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
        <img src="/logo-icon.svg" alt="logo"
          style={{ width: collapsed ? 32 : 36, height: collapsed ? 32 : 36, flexShrink: 0, borderRadius: 8 }}
        />
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              color: '#fff', fontSize: 15, fontWeight: 700,
              fontFamily: "'Poppins', sans-serif",
              letterSpacing: '0.3px',
              background: 'linear-gradient(90deg, #fff 30%, #a78bfa)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              whiteSpace: 'nowrap',
            }}>
              Local Billing
            </div>
            {storeName && (
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {storeName}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, storeName, username, logout, darkMode, toggleDarkMode } = useAuthStore()
  const [collapsed, setCollapsed]   = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { token } = antTheme.useToken()

  const screens   = useBreakpoint()
  const isMobile  = !screens.md   // < 768px

  const menuItems  = ROLE_MENUS[role] || ROLE_MENUS.Viewer
  const selectedKey = location.pathname

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') { logout(); navigate('/login') }
    },
  }

  function handleNavSelect(key) {
    navigate(key)
    if (isMobile) setDrawerOpen(false)
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>

      {/* Desktop: fixed sidebar */}
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={220}
          style={{
            background: SIDER_GRADIENT,
            position: 'fixed', height: '100vh',
            left: 0, top: 0, overflow: 'auto', zIndex: 100,
            boxShadow: '4px 0 24px rgba(18,0,41,0.35)',
          }}
        >
          <BrandHeader collapsed={collapsed} storeName={storeName} />
          <NavMenu menuItems={menuItems} selectedKey={selectedKey} onSelect={handleNavSelect} />
        </Sider>
      )}

      {/* Mobile: Drawer */}
      {isMobile && (
        <Drawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          placement="left"
          width={240}
          bodyStyle={{ padding: 0, background: SIDER_GRADIENT }}
          headerStyle={{ display: 'none' }}
        >
          <BrandHeader collapsed={false} storeName={storeName} />
          <NavMenu menuItems={menuItems} selectedKey={selectedKey} onSelect={handleNavSelect} />
        </Drawer>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 220), transition: 'margin-left 0.2s' }}>
        <Header style={{
          background: token.colorBgContainer,
          padding: isMobile ? '0 12px' : '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 0 rgba(124,58,237,0.1), 0 2px 12px rgba(124,58,237,0.06)',
          borderBottom: '1px solid rgba(124,58,237,0.08)',
          position: 'sticky', top: 0, zIndex: 99,
          height: 56,
        }}>
          <Button
            type="text"
            icon={isMobile
              ? <MenuOutlined style={{ fontSize: 18 }} />
              : (collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />)
            }
            onClick={() => isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />

          <Space>
            {!isMobile && storeName && (
              <Text type="secondary" style={{ fontSize: 13 }}>{storeName}</Text>
            )}
            <Tooltip title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
              <Button
                type="text"
                icon={darkMode ? <SunOutlined style={{ fontSize: 17 }} /> : <MoonOutlined style={{ fontSize: 17 }} />}
                onClick={toggleDarkMode}
              />
            </Tooltip>
            <Tag color={ROLE_COLORS[role] || 'default'} style={{ margin: 0 }}>{role}</Tag>
            <Dropdown menu={userMenu} trigger={['click']}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: 'linear-gradient(135deg, #863bff, #47bfff)', width: 32, height: 32, lineHeight: '32px', fontWeight: 700 }}>
                  {username?.[0]?.toUpperCase()}
                </Avatar>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{
          margin: isMobile ? '12px 8px' : '24px',
          minHeight: 'calc(100vh - 56px)',
        }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}