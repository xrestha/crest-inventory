import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './Layout.css'

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',       icon: '▦' },
  { to: '/periods',    label: 'Periods',          icon: '◷' },
  { to: '/items',      label: 'Item Master',      icon: '≡' },
  { to: '/vendors',    label: 'Vendors',          icon: '⊙' },
  { to: '/purchases',  label: 'Purchases',        icon: '↓' },
  { to: '/stock',      label: 'Stock Count',      icon: '⊞' },
  { to: '/recipes',    label: 'Recipe Costing',   icon: '◈' },
  { to: '/sales',      label: 'Sales Entry',      icon: '↑' },
  { to: '/variance',   label: 'Variance Report',  icon: '△' },
  { to: '/summary',    label: 'Monthly Summary',  icon: '◻' },
]

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const clientName = profile?.clients?.name

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="layout-root">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="sidebar-logo">⬡</span>
          <div>
            <div className="sidebar-brand-name">Crest</div>
            <div className="sidebar-brand-sub">Inventory</div>
          </div>
        </div>

        {isAdmin ? (
          <div className="sidebar-client">
            <span className="sidebar-client-label">Role</span>
            <span className="sidebar-client-name">Consultant</span>
          </div>
        ) : clientName ? (
          <div className="sidebar-client">
            <span className="sidebar-client-label">Property</span>
            <span className="sidebar-client-name">{clientName}</span>
          </div>
        ) : null}

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
              }
            >
              <span className="sidebar-icon">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="sidebar-divider" />
              <div className="sidebar-section-label">Admin</div>
              <NavLink
                to="/admin/clients"
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
              >
                <span className="sidebar-icon">⊛</span>
                Clients
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="sidebar-user-name">{profile?.full_name || 'User'}</div>
            <div className="sidebar-user-role">{isAdmin ? 'Admin' : 'Client'}</div>
          </div>
          <button onClick={handleSignOut} className="sidebar-signout" title="Sign out">
            ⎋
          </button>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
