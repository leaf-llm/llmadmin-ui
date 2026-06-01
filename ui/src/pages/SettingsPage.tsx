import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { loadUiConfig, saveUiConfig, createEmptyUiConfig, getNeutralinoHomeDir } from '../lib/configStore';
import { isDesktopMode } from '../api/config';

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
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);
  const [showClearDialog, setShowClearDialog] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const fullConfig = await loadUiConfig();
      setConfig(fullConfig as any);
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
    setConfigError(null);
    setExportSuccess(null);
    try {
      if (isDesktopMode()) {
        const Neutralino = (window as any).Neutralino;
        let filePath: string | null = null;
        try {
          const result = await Neutralino.os.showSaveDialog('Export Config', {
            defaultPath: 'conf.ui.json',
          });
          filePath = result || null;
        } catch {
          // dialog API not available; treat as user-cancelled (silent abort)
          filePath = null;
        }
        if (!filePath) {
          // user cancelled (or dialog unavailable) - do nothing
          return;
        }
        const fullConfig = await loadUiConfig();
        const jsonStr = JSON.stringify(fullConfig, null, 2);
        await Neutralino.filesystem.writeFile(filePath, jsonStr);
        setExportSuccess(filePath);
        return;
      }

      const fullConfig = await loadUiConfig();
      const jsonStr = JSON.stringify(fullConfig, null, 2);
      const blob = new Blob([jsonStr], {
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
    if (isDesktopMode()) {
      await handleDesktopImport();
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleDesktopImport() {
    setImportError(null);
    setImportSuccess(false);

    try {
      const Neutralino = (window as any).Neutralino;
      const paths: string[] = await Neutralino.os.showOpenDialog(
        'Import Config'
      );
      const filePath = paths?.[0];
      if (!filePath) return;

      const text: string = await Neutralino.filesystem.readFile(filePath);
      const parsed = JSON.parse(text);

      const validationError = validateConfig(parsed);
      if (validationError) {
        setImportError(validationError);
        return;
      }

      await saveUiConfig(parsed as any);
      setImportSuccess(true);
      await loadConfig();
    } catch (err: any) {
      if (err instanceof SyntaxError) {
        setImportError('Invalid JSON file');
      } else {
        setImportError(err?.message ?? String(err));
      }
    }
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

      if (!isDesktopMode()) {
        setImportError('Config import is only available in desktop mode');
        return;
      }

      await saveUiConfig(parsed as any);
      setImportSuccess(true);
      await loadConfig();
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

  async function handleClear() {
    setConfigError(null);
    try {
      await saveUiConfig(createEmptyUiConfig());
      setShowClearDialog(false);
      await loadConfig();
    } catch (e: any) {
      setConfigError(e?.message ?? String(e));
      setShowClearDialog(false);
    }
  }

  function ClearConfirmDialog({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-header">
            <h3>{t('common.clearConfig')}</h3>
            <button className="dialog-close" onClick={onCancel}>
              ×
            </button>
          </div>
          <div className="dialog-body">
            <p>{t('common.clearConfigConfirm')}</p>
          </div>
          <div className="dialog-footer">
            <button onClick={onCancel}>{t('common.cancel')}</button>
            <button className="danger" onClick={onConfirm}>
              {t('common.clear')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
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
            onClick={handleImportClick}
          >
            {t('common.import')}
          </button>
          <button
            className="secondary"
            disabled={configLoading}
            onClick={handleExport}
          >
            {t('common.export')}
          </button>
          {isDesktopMode() && (
            <button
              className="danger"
              disabled={configLoading}
              onClick={() => setShowClearDialog(true)}
            >
              {t('common.clear')}
            </button>
          )}
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
        {exportSuccess && (
          <div className="success" style={{ marginTop: 10 }}>
            {t('common.exportSuccessful', { path: exportSuccess })}
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
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text)',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>
      )}

      <ClearConfirmDialog
        isOpen={showClearDialog}
        onConfirm={handleClear}
        onCancel={() => setShowClearDialog(false)}
      />
    </div>
  );
}
