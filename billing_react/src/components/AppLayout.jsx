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

const SIDER_BG = '#1A237E'

function NavMenu({ menuItems, selectedKey, onSelect }) {
  return (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={menuItems}
      onClick={({ key }) => onSelect(key)}
      style={{ background: SIDER_BG, borderRight: 0, marginTop: 8 }}
    />
  )
}

function BrandHeader({ collapsed, storeName }) {
  return (
    <div style={{
      padding: collapsed ? '18px 12px' : '18px 16px',
      borderBottom: '1px solid rgba(255,255,255,0.15)',
    }}>
      <div style={{ color: '#fff', fontSize: collapsed ? 20 : 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {collapsed ? '🧾' : `🧾 Local Billing`}
      </div>
      {!collapsed && (
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{storeName || ''}</Text>
      )}
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
            background: SIDER_BG,
            position: 'fixed', height: '100vh',
            left: 0, top: 0, overflow: 'auto', zIndex: 100,
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
          bodyStyle={{ padding: 0, background: SIDER_BG }}
          headerStyle={{ display: 'none' }}
        >
          <BrandHeader collapsed={false} storeName={storeName} />
          <NavMenu menuItems={menuItems} selectedKey={selectedKey} onSelect={handleNavSelect} />
        </Drawer>
      )}

      <Layout style={{ marginLeft: isMobile ? 0 : (collapsed ? 80 : 220), transition: 'margin-left 0.2s' }}>
        <Header style={{
          background: token.colorBgContainer, padding: isMobile ? '0 12px' : '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
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
                <Avatar style={{ background: SIDER_BG, width: 32, height: 32, lineHeight: '32px' }}>
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