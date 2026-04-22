import React, { useState, useEffect } from 'react';
import ProvidersPage from './pages/ProvidersPage';
import AllProvidersPage from './pages/AllProvidersPage';
import UsagePage from './pages/UsagePage';
import SettingsPage from './pages/SettingsPage';

type Page = 'providers' | 'all-providers' | 'usage' | 'settings';

function Header({
  active,
  onNavigate,
}: {
  active: Page;
  onNavigate: (page: Page) => void;
}) {
  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="app-header__brand">
          <div className="app-header__title">LLM Admin UI</div>
        </div>

        <nav className="app-nav">
          <button
            className={
              active === 'providers'
                ? 'app-nav__link is-active'
                : 'app-nav__link'
            }
            onClick={() => onNavigate('providers')}
          >
            Routing
          </button>
          <button
            className={
              active === 'usage' ? 'app-nav__link is-active' : 'app-nav__link'
            }
            onClick={() => onNavigate('usage')}
          >
            Usage
          </button>
          <button
            className={
              active === 'settings'
                ? 'app-nav__link is-active'
                : 'app-nav__link'
            }
            onClick={() => onNavigate('settings')}
          >
            Settings
          </button>
        </nav>
      </div>
    </header>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('providers');

  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/providers') {
      setActivePage('providers');
    } else if (path === '/usage') {
      setActivePage('usage');
    } else if (path === '/settings') {
      setActivePage('settings');
    }
    window.history.replaceState(null, '', '/');
  }, []);

  const handleNavigate = (page: Page) => {
    setActivePage(page);
  };

  return (
    <div className="app-root">
      {activePage !== 'all-providers' && (
        <Header active={activePage} onNavigate={handleNavigate} />
      )}
      <main
        className={
          activePage === 'all-providers'
            ? 'app-main app-main--full'
            : 'app-main'
        }
      >
        {activePage === 'providers' && (
          <ProvidersPage
            onNavigateAllProviders={() => setActivePage('all-providers')}
          />
        )}
        {activePage === 'all-providers' && (
          <AllProvidersPage onBack={() => setActivePage('providers')} />
        )}
        {activePage === 'usage' && <UsagePage />}
        {activePage === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
