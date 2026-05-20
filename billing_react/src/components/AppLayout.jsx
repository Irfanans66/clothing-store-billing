import React, { useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Typography, Button, Dropdown, Tag, Space } from 'antd'
import {
  DashboardOutlined, ShoppingCartOutlined, FileTextOutlined,
  UserOutlined, ShopOutlined, BarcodeOutlined, BarChartOutlined,
  TeamOutlined, SettingOutlined, LogoutOutlined, SafetyCertificateOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'

const { Sider, Header, Content } = Layout
const { Text } = Typography

const ROLE_MENUS = {
  Admin: [
    { key: '/dashboard',     icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',      icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',  icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',     icon: <UserOutlined />,             label: 'Customers' },
    { key: '/products',      icon: <ShopOutlined />,             label: 'Products' },
    { key: '/barcode-labels',icon: <BarcodeOutlined />,          label: 'Barcode Labels' },
    { key: '/reports',       icon: <BarChartOutlined />,         label: 'Reports' },
    { key: '/team',          icon: <TeamOutlined />,             label: 'Team' },
    { key: '/settings',      icon: <SettingOutlined />,          label: 'Settings' },
  ],
  Manager: [
    { key: '/dashboard',     icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',      icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',  icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',     icon: <UserOutlined />,             label: 'Customers' },
    { key: '/products',      icon: <ShopOutlined />,             label: 'Products' },
    { key: '/barcode-labels',icon: <BarcodeOutlined />,          label: 'Barcode Labels' },
    { key: '/reports',       icon: <BarChartOutlined />,         label: 'Reports' },
    { key: '/team',          icon: <TeamOutlined />,             label: 'Team' },
  ],
  Cashier: [
    { key: '/dashboard',     icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/new-bill',      icon: <ShoppingCartOutlined />,     label: 'New Bill' },
    { key: '/bill-history',  icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/customers',     icon: <UserOutlined />,             label: 'Customers' },
  ],
  Viewer: [
    { key: '/dashboard',     icon: <DashboardOutlined />,        label: 'Dashboard' },
    { key: '/bill-history',  icon: <FileTextOutlined />,         label: 'Bill History' },
    { key: '/reports',       icon: <BarChartOutlined />,         label: 'Reports' },
  ],
  SuperAdmin: [
    { key: '/super-admin',   icon: <SafetyCertificateOutlined />, label: 'Super Admin' },
  ],
}

const ROLE_COLORS = {
  Admin: 'blue', Manager: 'green', Cashier: 'orange',
  Viewer: 'default', SuperAdmin: 'purple',
}

export default function AppLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { role, storeName, username, logout } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  const menuItems = ROLE_MENUS[role] || ROLE_MENUS.Viewer

  const userMenu = {
    items: [
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') { logout(); navigate('/login') }
    },
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        style={{ background: '#1A237E', position: 'fixed', height: '100vh', left: 0, top: 0, overflow: 'auto', zIndex: 100 }}
      >
        <div style={{ padding: collapsed ? '20px 12px' : '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
          <div style={{ color: '#fff', fontSize: collapsed ? 20 : 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {collapsed ? '👗' : `👗 ${storeName || 'Billing'}`}
          </div>
          {!collapsed && (
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>
              Billing System
            </Text>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ background: '#1A237E', borderRight: 0, marginTop: 8 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 220, transition: 'margin-left 0.2s' }}>
        <Header style={{
          background: '#fff', padding: '0 24px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'sticky', top: 0, zIndex: 99,
        }}>
          <Button
            type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{ fontSize: 16 }}
          />
          <Space>
            <Tag color={ROLE_COLORS[role] || 'default'}>{role}</Tag>
            <Dropdown menu={userMenu} trigger={['click']}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar style={{ background: '#1A237E' }}>
                  {username?.[0]?.toUpperCase()}
                </Avatar>
                <Text strong style={{ display: 'none' }}>{username}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content style={{ margin: '24px', minHeight: 'calc(100vh - 112px)' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}