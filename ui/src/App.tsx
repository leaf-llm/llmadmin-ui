import React from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProvidersPage from './pages/ProvidersPage';
import UsagePage from './pages/UsagePage';
import SettingsPage from './pages/SettingsPage';

function Header() {
  const location = useLocation();
  const active = (path: string) => location.pathname === path;

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand">
          <div className="app-header__title">LLM Admin UI</div>
        </div>

        <nav className="app-nav">
          <Link
            className={active('/providers') ? 'app-nav__link is-active' : 'app-nav__link'}
            to="/providers"
          >
            Providers
          </Link>
          <Link
            className={active('/usage') ? 'app-nav__link is-active' : 'app-nav__link'}
            to="/usage"
          >
            Usage
          </Link>
          <Link
            className={active('/settings') ? 'app-nav__link is-active' : 'app-nav__link'}
            to="/settings"
          >
            Settings
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="app-root">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/providers" replace />} />
          <Route path="/providers" element={<ProvidersPage />} />
          <Route path="/usage" element={<UsagePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/providers" replace />} />
        </Routes>
      </main>
    </div>
  );
}

