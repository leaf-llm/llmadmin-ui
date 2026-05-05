import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { exportConfig, importConfig } from '../api/adminClient';

const VALID_CONFIG_KEYS = [
  'providers',
  'text',
  'image',
  'video',
  'audio',
  'mcp',
];
const VALID_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'zhipu',
  'dashscope',
  'moonshot',
  'minimax',
  'doubao',
  'deepseek',
];

export default function SettingsPage() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [rawConfig, setRawConfig] = useState<string>('');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const fullConfig = await exportConfig();
      setConfig(fullConfig);
      setRawConfig(JSON.stringify(fullConfig, null, 2));
    } catch (e: any) {
      setConfigError(e?.message ?? String(e));
    } finally {
      setConfigLoading(false);
    }
  }

  function validateConfig(cfg: unknown): string {
    if (!cfg || typeof cfg !== 'object') {
      return 'Config must be an object';
    }

    const c = cfg as Record<string, unknown>;

    for (const key of Object.keys(c)) {
      if (!VALID_CONFIG_KEYS.includes(key)) {
        return `Invalid config key: ${key}`;
      }
    }

    if (!c.providers || typeof c.providers !== 'object') {
      return 'Missing or invalid "providers" field';
    }
    const providers = c.providers as Record<string, unknown>;
    for (const [providerId, providerConfigs] of Object.entries(providers)) {
      if (!VALID_PROVIDERS.includes(providerId)) {
        return `Unknown provider: ${providerId}`;
      }
      if (!Array.isArray(providerConfigs)) {
        return `Provider "${providerId}" configs must be an array`;
      }
      for (const conf of providerConfigs) {
        if (!conf || typeof conf !== 'object') {
          return `Invalid config for provider "${providerId}"`;
        }
        const p = conf as Record<string, unknown>;
        if (typeof p.id !== 'string' || !p.id) {
          return `Provider "${providerId}" config missing "id"`;
        }
        if (typeof p.apiKey !== 'string') {
          return `Provider "${providerId}" config missing "apiKey"`;
        }
        if (typeof p.baseUrl !== 'string' || !p.baseUrl) {
          return `Provider "${providerId}" config missing "baseUrl"`;
        }
        if (typeof p.lastSyncedAt !== 'string' || !p.lastSyncedAt) {
          return `Provider "${providerId}" config missing "lastSyncedAt"`;
        }
        if (p.remark !== undefined && typeof p.remark !== 'string') {
          return `Provider "${providerId}" config "remark" must be a string`;
        }
      }
    }

    const categories = ['text', 'image', 'video', 'audio', 'mcp'];
    for (const cat of categories) {
      if (!c[cat] || typeof c[cat] !== 'object') {
        return `Missing or invalid category: ${cat}`;
      }
      const catConfig = c[cat] as Record<string, unknown>;
      if (!Array.isArray(catConfig.routing)) {
        return `Category "${cat}" missing valid "routing" array`;
      }
      for (const routing of catConfig.routing) {
        if (!routing || typeof routing !== 'object') {
          return `Category "${cat}" routing entry must be an object`;
        }
        const r = routing as Record<string, unknown>;
        if (typeof r.provider !== 'string' || !r.provider) {
          return `Category "${cat}" routing entry missing valid "provider"`;
        }
        if (!VALID_PROVIDERS.includes(r.provider as string)) {
          return `Category "${cat}" routing has unknown provider: ${r.provider}`;
        }
        if (typeof r.model !== 'string' || !r.model) {
          return `Category "${cat}" routing entry missing valid "model"`;
        }
        if (r.isPrimary !== undefined && typeof r.isPrimary !== 'boolean') {
          return `Category "${cat}" routing entry "isPrimary" must be boolean`;
        }
      }
      if (
        catConfig.userConfig !== null &&
        typeof catConfig.userConfig !== 'object'
      ) {
        return `Category "${cat}" "userConfig" must be null or object`;
      }
    }

    return '';
  }

  async function handleExport() {
    try {
      const fullConfig = await exportConfig();
      const blob = new Blob([JSON.stringify(fullConfig, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conf.ui.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setConfigError(e?.message ?? String(e));
    }
  }

  async function handleImportClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(false);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const validationError = validateConfig(parsed);
      if (validationError) {
        setImportError(validationError);
        return;
      }

      const res = await importConfig(parsed);
      if (res.ok) {
        setImportSuccess(true);
        await loadConfig();
      } else {
        setImportError(res.message || 'Import failed');
      }
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setImportError('Invalid JSON file');
      } else {
        setImportError(err?.message ?? String(err));
      }
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  return (
    <div>
      <h1 className="page-title">{t('nav.settings')}</h1>

      <div className="card">
        <div className="card__title">{t('common.gatewayConfig')}</div>

        {configLoading && <div className="muted">{t('common.loading')}</div>}
        {configError && <div className="error">{configError}</div>}

        {!configLoading && !configError && config && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {t('common.configIsActive')}
          </div>
        )}
        {!configLoading && !configError && !config && (
          <div className="muted" style={{ marginBottom: 10 }}>
            {t('common.noActiveConfig')}
          </div>
        )}

        <div className="row">
          <button
            className="secondary"
            disabled={configLoading}
            onClick={handleExport}
          >
            {t('common.export')}
          </button>
          <button
            className="secondary"
            disabled={configLoading}
            onClick={handleImportClick}
          >
            {t('common.import')}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {importError && (
          <div className="error" style={{ marginTop: 10 }}>
            {importError}
          </div>
        )}
        {importSuccess && (
          <div className="success" style={{ marginTop: 10 }}>
            {t('common.importSuccessful')}
          </div>
        )}
      </div>

      {rawConfig && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card__title">{t('common.configPreview')}</div>
          <textarea
            readOnly
            value={rawConfig}
            style={{
              width: '100%',
              minHeight: 300,
              fontFamily: 'monospace',
              fontSize: 12,
              padding: 10,
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              resize: 'vertical',
            }}
          />
        </div>
      )}
    </div>
  );
}
