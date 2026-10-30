import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const TABS = [
  { to: '/', label: 'Home', icon: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z', end: true },
  { to: '/assistant', label: 'AI Assistant', icon: 'M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z' },
  { to: '/events', label: 'Events', icon: 'M4 5h16v16H4zM4 9h16M8 3v4M16 3v4' },
  { to: '/you', label: 'You', icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0' },
];

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="PlanPal home">
          <img src="/favicon.svg" alt="" width="28" height="28" />
          <span>PlanPal</span>
        </NavLink>
        <nav aria-label="Main" className="tabs">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className="tab">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
                <path d={tab.icon} />
              </svg>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </nav>
        <span className="topbar-user" aria-label={`Signed in as ${user?.name}`}>
          {user?.name?.[0]?.toUpperCase()}
        </span>
      </header>
      <main id="main" className="content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
