import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import ProvidersPage from './pages/ProvidersPage';
import AllProvidersPage from './pages/AllProvidersPage';
import UsagePage from './pages/UsagePage';
import SettingsPage from './pages/SettingsPage';
import { useBackendHealth, BackendStatus } from './hooks/useBackendHealth';
import { getApiBaseUrl } from './api/config';

type Page = 'providers' | 'all-providers' | 'usage' | 'settings';

function Header({
  active,
  onNavigate,
  backendStatus,
  onRetry,
}: {
  active: Page;
  onNavigate: (page: Page) => void;
  backendStatus: BackendStatus;
  onRetry: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [copied, setCopied] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(newLang);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(getApiBaseUrl() || 'http://127.0.0.1:8700');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusDotClass =
    backendStatus === 'connected'
      ? 'status-dot status-dot--connected'
      : backendStatus === 'connecting'
        ? 'status-dot status-dot--connecting'
        : 'status-dot status-dot--error';

  const statusText =
    backendStatus === 'connected'
      ? t('common.running')
      : backendStatus === 'connecting'
        ? t('common.connecting', '连接中...')
        : t('common.connectionFailed', '连接失败');

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <div className="header-left">
          <div className="app-header__brand">
            <div className="app-header__title">LLM Admin</div>
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
              {t('nav.routing')}
            </button>
            <button
              className={
                active === 'usage' ? 'app-nav__link is-active' : 'app-nav__link'
              }
              onClick={() => onNavigate('usage')}
            >
              {t('nav.usage')}
            </button>
            <button
              className={
                active === 'settings' ? 'app-nav__link is-active' : 'app-nav__link'
              }
              onClick={() => onNavigate('settings')}
            >
              {t('nav.settings')}
            </button>
          </nav>
        </div>

        <div className="header-right">
          <div className="gateway-url" onClick={handleCopyUrl} style={{ cursor: 'pointer' }}>
            <span>{copied ? t('common.copied') : (getApiBaseUrl() || 'http://127.0.0.1:8700')}</span>
          </div>
          <div
            className="status-indicator"
            onClick={backendStatus === 'error' ? onRetry : undefined}
            style={backendStatus === 'error' ? { cursor: 'pointer' } : undefined}
          >
            <span className={statusDotClass}></span>
            <span>{statusText}</span>
          </div>
          <button
            className="lang-toggle"
            onClick={toggleLanguage}
            title="Toggle language"
          >
            {i18n.language.startsWith('zh') ? '中文' : 'EN'}
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<Page>('providers');
  const { status: backendStatus, retry } = useBackendHealth();

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
        <Header
          active={activePage}
          onNavigate={handleNavigate}
          backendStatus={backendStatus}
          onRetry={retry}
        />
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
