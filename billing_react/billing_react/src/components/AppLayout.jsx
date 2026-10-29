import React, { useState, useEffect } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu, Avatar, Typography, Button, Dropdown, Tag, Space, Grid } from 'antd'
import {
  DashboardOutlined, ShoppingCartOutlined, FileTextOutlined,
  UserOutlined, ShopOutlined, BarcodeOutlined, BarChartOutlined,
  TeamOutlined, SettingOutlined, LogoutOutlined, SafetyCertificateOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined, QuestionCircleOutlined, PlusOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'
import { getStoreProfile } from '../api/client'
import OfflineBanner from './OfflineBanner'
import PaymentMonitor from './PaymentMonitor'

const { Sider, Header, Content } = Layout
const { Text } = Typography
const { useBreakpoint } = Grid

const GOLD = '#82B8D4'
const GOLD_LIGHT = '#96C9B0'

const ROLE_COLORS = {
  Admin: 'blue', Manager: 'green', Cashier: 'orange',
  Viewer: 'default', SuperAdmin: 'purple',
}

// ── Desktop sidebar menus (unchanged) ──────────────────────────────────────
const ROLE_MENUS = {
  Admin: [
    { key: '/dashboard',      icon: <DashboardOutlined />,         label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,      label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,          label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,              label: 'Customers' },
    { key: '/products',       icon: <ShopOutlined />,              label: 'Products' },
    { key: '/barcode-labels', icon: <BarcodeOutlined />,           label: 'Barcode Labels' },
    { key: '/reports',        icon: <BarChartOutlined />,          label: 'Reports' },
    { key: '/team',           icon: <TeamOutlined />,              label: 'Team' },
    { key: '/settings',       icon: <SettingOutlined />,           label: 'Settings' },
    { key: '/help',           icon: <QuestionCircleOutlined />,    label: 'Help & Support' },
  ],
  Manager: [
    { key: '/dashboard',      icon: <DashboardOutlined />,         label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,      label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,          label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,              label: 'Customers' },
    { key: '/products',       icon: <ShopOutlined />,              label: 'Products' },
    { key: '/barcode-labels', icon: <BarcodeOutlined />,           label: 'Barcode Labels' },
    { key: '/reports',        icon: <BarChartOutlined />,          label: 'Reports' },
    { key: '/team',           icon: <TeamOutlined />,              label: 'Team' },
    { key: '/help',           icon: <QuestionCircleOutlined />,    label: 'Help & Support' },
  ],
  Cashier: [
    { key: '/dashboard',      icon: <DashboardOutlined />,         label: 'Dashboard' },
    { key: '/new-bill',       icon: <ShoppingCartOutlined />,      label: 'New Bill' },
    { key: '/bill-history',   icon: <FileTextOutlined />,          label: 'Bill History' },
    { key: '/customers',      icon: <UserOutlined />,              label: 'Customers' },
    { key: '/help',           icon: <QuestionCircleOutlined />,    label: 'Help & Support' },
  ],
  Viewer: [
    { key: '/dashboard',      icon: <DashboardOutlined />,         label: 'Dashboard' },
    { key: '/bill-history',   icon: <FileTextOutlined />,          label: 'Bill History' },
    { key: '/reports',        icon: <BarChartOutlined />,          label: 'Reports' },
    { key: '/help',           icon: <QuestionCircleOutlined />,    label: 'Help & Support' },
  ],
  SuperAdmin: [
    { key: '/super-admin',    icon: <SafetyCertificateOutlined />, label: 'Super Admin' },
  ],
}

// ── Mobile bottom-nav tab definitions ──────────────────────────────────────
const MOBILE_TABS = {
  Admin: [
    { key: '/dashboard',    Icon: DashboardOutlined,       label: 'Dashboard' },
    { key: '/products',     Icon: ShopOutlined,            label: 'Products',  matchPaths: ['/products', '/barcode-labels'] },
    { key: '/bill-history', Icon: FileTextOutlined,        label: 'History' },
    { key: '/customers',    Icon: UserOutlined,            label: 'Customers' },
    { key: '/reports',      Icon: BarChartOutlined,        label: 'Reports' },
  ],
  Manager: [
    { key: '/dashboard',    Icon: DashboardOutlined,       label: 'Dashboard' },
    { key: '/products',     Icon: ShopOutlined,            label: 'Products',  matchPaths: ['/products', '/barcode-labels'] },
    { key: '/bill-history', Icon: FileTextOutlined,        label: 'History' },
    { key: '/customers',    Icon: UserOutlined,            label: 'Customers' },
    { key: '/reports',      Icon: BarChartOutlined,        label: 'Reports' },
  ],
  Cashier: [
    { key: '/dashboard',    Icon: DashboardOutlined,       label: 'Dashboard' },
    { key: '/products',     Icon: ShopOutlined,            label: 'Products',  matchPaths: ['/products', '/barcode-labels'] },
    { key: '/bill-history', Icon: FileTextOutlined,        label: 'History' },
    { key: '/customers',    Icon: UserOutlined,            label: 'Customers' },
    { key: '/help',         Icon: QuestionCircleOutlined,  label: 'Help' },
  ],
  Viewer: [
    { key: '/dashboard',    Icon: DashboardOutlined,       label: 'Dashboard' },
    { key: '/bill-history', Icon: FileTextOutlined,        label: 'History' },
    { key: '/reports',      Icon: BarChartOutlined,        label: 'Reports' },
    { key: '/help',         Icon: QuestionCircleOutlined,  label: 'Help' },
  ],
  SuperAdmin: [
    { key: '/super-admin',  Icon: SafetyCertificateOutlined, label: 'Admin' },
  ],
}

const CAN_CREATE_BILL = new Set(['Admin', 'Manager', 'Cashier'])

// ── Shared desktop sidebar sub-components ──────────────────────────────────
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

function CollapsedNav({ menuItems, selectedKey, onSelect }) {
  return (
    <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 6px' }}>
      {menuItems.map(({ key, icon, label }) => {
        const active = selectedKey === key
        return (
          <button
            key={key} type="button" onClick={() => onSelect(key)} title={label}
            aria-current={active ? 'page' : undefined}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '9px 2px', border: 'none', borderRadius: 12, cursor: 'pointer',
              background: active ? 'var(--bg)' : 'transparent',
              boxShadow: active ? 'var(--neu-inset)' : 'none',
              color: active ? '#2F6690' : '#5F5853',
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 500, lineHeight: 1.2, textAlign: 'center' }}>
              {label.replace(' & Support', '')}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function BrandHeader({ collapsed, storeName }) {
  return (
    <div style={{
      padding: collapsed ? '18px 12px' : '18px 20px',
      borderBottom: '1px solid rgba(201,168,76,0.18)',
      background: 'rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, overflow: 'hidden' }}>
        <img src="/logo-icon.svg" alt="logo" style={{
          width: collapsed ? 32 : 38, height: collapsed ? 32 : 38,
          flexShrink: 0, borderRadius: 10,
          boxShadow: '0 4px 16px rgba(201,168,76,0.35)',
        }} />
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: 15, fontWeight: 700,
              fontFamily: "'Poppins', sans-serif",
              letterSpacing: '0.3px',
              color: '#3A3530', whiteSpace: 'nowrap',
            }}>
              Loacal Billing
            </div>
            {storeName && (
              <Text style={{ color: '#5F5853', fontSize: 11, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {storeName}
              </Text>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mobile: fixed glass top header ─────────────────────────────────────────
function MobileTopHeader({ storeName, role, username, onProfileAction }) {
  const profileMenu = {
    items: [
      { key: 'settings', icon: <SettingOutlined />,       label: 'Settings' },
      { key: 'help',     icon: <QuestionCircleOutlined />, label: 'Help & Support' },
      { key: 'team',     icon: <TeamOutlined />,           label: 'Team' },
      { type: 'divider' },
      { key: 'logout',   icon: <LogoutOutlined />,         label: 'Logout', danger: true },
    ],
    onClick: ({ key }) => onProfileAction(key),
  }

  return (
    <div className="mobile-top-header">
      {/* Profile avatar — upper-left, opens Settings / Help / Team / Logout */}
      <Dropdown menu={profileMenu} trigger={['click']} placement="bottomLeft">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flexShrink: 0 }}>
          <Avatar style={{
            background: `linear-gradient(135deg, ${GOLD}, ${GOLD_LIGHT})`,
            width: 38, height: 38, lineHeight: '38px',
            fontWeight: 700, color: '#1a0a00', fontSize: 16,
            boxShadow: `0 0 14px ${GOLD}66`, flexShrink: 0,
          }}>
            {username?.[0]?.toUpperCase()}
          </Avatar>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3A3530', marginBottom: 2 }}>
              {username}
            </div>
            <Tag color={ROLE_COLORS[role] || 'default'} style={{ margin: 0, fontSize: 9, padding: '0 5px', lineHeight: '15px' }}>
              {role}
            </Tag>
          </div>
        </div>
      </Dropdown>

      {/* Store name — center */}
      <div style={{ flex: 1, textAlign: 'center', padding: '0 8px', overflow: 'hidden' }}>
        <div style={{
          fontSize: 15, fontWeight: 700, color: '#2F6690',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {storeName || 'Loacal Billing'}
        </div>
      </div>

      {/* App logo — right */}
      <img src="/logo-icon.svg" alt="logo" style={{
        width: 34, height: 34, borderRadius: 9, flexShrink: 0,
        boxShadow: '0 2px 10px rgba(201,168,76,0.35)',
      }} />
    </div>
  )
}

// ── Mobile: fixed glass bottom navigation bar ───────────────────────────────
function MobileBottomNav({ tabs, currentPath, onNavigate, canBill }) {
  const all = canBill
    ? [...tabs.slice(0, 2), { key: '/new-bill', Icon: PlusOutlined, label: 'New Bill', primary: true }, ...tabs.slice(2)]
    : tabs
  return (
    <div className="mobile-bottom-nav">
      {all.map(({ key, Icon, label, matchPaths, primary }) => {
        const isActive = matchPaths
          ? matchPaths.some(p => currentPath.startsWith(p))
          : currentPath === key || currentPath.startsWith(key + '/')

        return (
          <button
            key={key}
            className={`mob-tab${isActive ? ' mob-tab--active' : ''}${primary ? ' mob-tab--primary' : ''}`}
            onClick={() => onNavigate(key)}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive && !primary && <span className="mob-tab-indicator" />}
            {primary ? <span className="mob-tab-plus"><Icon /></span> : <Icon style={{
              fontSize: 22,
              filter: isActive ? `drop-shadow(0 0 5px ${GOLD}99)` : 'none',
              transition: 'filter 0.2s',
            }} />}
            <span className="mob-tab-label">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ── Main layout ─────────────────────────────────────────────────────────────
export default function AppLayout() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const { role, storeName, username, logout, setAuth } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (role && role !== 'SuperAdmin') {
      getStoreProfile()
        .then(p => { if (p?.country) setAuth({ country: p.country }) })
        .catch(() => {})
    }
  }, [role])

  const screens  = useBreakpoint()
  const isMobile = !screens.md   // true when < 768 px

  const menuItems  = ROLE_MENUS[role]   || ROLE_MENUS.Viewer
  const mobileTabs = MOBILE_TABS[role]  || MOBILE_TABS.Viewer
  const path       = location.pathname
  const canBill    = CAN_CREATE_BILL.has(role)

  const desktopUserMenu = {
    items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout', danger: true }],
    onClick: ({ key }) => { if (key === 'logout') { logout(); navigate('/login') } },
  }

  function go(key) { navigate(key) }

  function handleMobileProfile(key) {
    if (key === 'logout') { logout(); navigate('/login') }
    else navigate(`/${key}`)
  }

  // ── Desktop layout (100% unchanged) ──────────────────────────────────────
  if (!isMobile) {
    return (
      <Layout style={{ minHeight: '100vh' }}>
        <Sider
          collapsible collapsed={collapsed} onCollapse={setCollapsed} trigger={null}
          width={220} collapsedWidth={84}
          style={{ position: 'fixed', height: '100vh', left: 0, top: 0, overflow: 'auto', zIndex: 100 }}
        >
          <BrandHeader collapsed={collapsed} storeName={storeName} />
          {collapsed
            ? <CollapsedNav menuItems={menuItems} selectedKey={path} onSelect={go} />
            : <NavMenu menuItems={menuItems} selectedKey={path} onSelect={go} />}
        </Sider>

        <Layout style={{ marginLeft: collapsed ? 84 : 220, transition: 'margin-left 0.2s' }}>
          <Header style={{
            padding: '0 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 99, height: 56,
          }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ fontSize: 16 }}
            />
            <Space>
              {storeName && (
                <Text style={{ fontSize: 13, color: '#5F5853' }}>{storeName}</Text>
              )}
              <Tag color="blue" style={{ margin: 0, boxShadow: '2px 2px 6px rgba(163,155,140,0.4), -2px -2px 6px rgba(255,255,255,0.9)', border: 'none' }}>{role}</Tag>
              <Dropdown menu={desktopUserMenu} trigger={['click']}>
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar style={{
                    background: 'linear-gradient(135deg, #82B8D4, #5E9AB8)',
                    width: 32, height: 32, lineHeight: '32px', fontWeight: 700, color: '#fff',
                    boxShadow: '3px 3px 8px rgba(163,155,140,0.5), -2px -2px 6px rgba(255,255,255,0.9)',
                  }}>
                    {username?.[0]?.toUpperCase()}
                  </Avatar>
                </Space>
              </Dropdown>
            </Space>
          </Header>

          <OfflineBanner />
          <Content style={{ margin: '24px', minHeight: 'calc(100vh - 56px)' }}>
            <Outlet />
          </Content>
        </Layout>
        <PaymentMonitor />
      </Layout>
    )
  }

  // ── Mobile layout ─────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', position: 'relative', background: '#EDE8E2' }}>

      {/* Fixed glass top header */}
      <MobileTopHeader
        storeName={storeName}
        role={role}
        username={username}
        onProfileAction={handleMobileProfile}
      />

      {/* Scrollable page content */}
      <div style={{
        paddingTop: 60,
        paddingBottom: 90,
        minHeight: '100vh',
      }}>
        <OfflineBanner />
        <PaymentMonitor />
        <div style={{ padding: '14px 14px 0' }}>
          <Outlet />
        </div>
      </div>

      {/* Fixed bottom navigation bar */}
      <MobileBottomNav
        tabs={mobileTabs}
        currentPath={path}
        onNavigate={go}
        canBill={canBill}
      />
    </div>
  )
}