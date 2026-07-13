import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { loadUiConfig, saveUiConfig, createEmptyUiConfig, getNeutralinoHomeDir, getConfigPathAsync } from '../lib/configStore';
import { isDesktopMode } from '../api/config';

const VALID_CONFIG_KEYS = [
  'settings',
  'gateway',
  'server',
];
const VALID_GATEWAY_KEYS = [
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
  'google-openai',
  'zhipu',
  'dashscope',
  'moonshot',
  'minimax',
  'doubao',
  'deepseek',
  'openai-compatible',
  'anthropic-compatible',
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
      // Read the raw conf.json so the preview shows all top-level keys
      // (settings, gateway, server) — not just the gateway section.
      const Neutralino = (window as any).Neutralino;
      if (Neutralino?.filesystem?.readFile) {
        try {
          const configPath = await getConfigPathAsync();
          const text = await Neutralino.filesystem.readFile(configPath);
          const parsed = JSON.parse(text);
          setConfig(parsed as any);
          setRawConfig(JSON.stringify(parsed, null, 2));
        } catch {
          // Fall through to the loadUiConfig path
          const gateway = await loadUiConfig();
          const unified: Record<string, unknown> = { gateway };
          setConfig(unified as any);
          setRawConfig(JSON.stringify(unified, null, 2));
        }
      } else {
        const gateway = await loadUiConfig();
        const unified: Record<string, unknown> = { gateway };
        setConfig(unified as any);
        setRawConfig(JSON.stringify(unified, null, 2));
      }
    } catch (e: any) {
      setConfigError(e?.message ?? String(e));
    } finally {
      setConfigLoading(false);
    }
  }

  function validateGateway(gateway: unknown): string {
    if (!gateway || typeof gateway !== 'object') {
      return 'Gateway section must be an object';
    }

    const g = gateway as Record<string, unknown>;

    for (const key of Object.keys(g)) {
      if (!VALID_GATEWAY_KEYS.includes(key)) {
        return `Invalid gateway key: ${key}`;
      }
    }

    if (!g.providers || typeof g.providers !== 'object') {
      return 'Missing or invalid "providers" field';
    }
    const providers = g.providers as Record<string, unknown>;
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
      if (!g[cat] || typeof g[cat] !== 'object') {
        return `Missing or invalid category: ${cat}`;
      }
      const catConfig = g[cat] as Record<string, unknown>;
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

    if (c.gateway) {
      const err = validateGateway(c.gateway);
      if (err) return err;
    }

    return '';
  }

  async function handleExport() {
    setConfigError(null);
    setExportSuccess(null);
    try {
      // Read the actual config file from disk - this is the source of truth
      const Neutralino = isDesktopMode() ? (window as any).Neutralino : null;
      let unifiedConfig: Record<string, unknown> = {};

      if (Neutralino?.filesystem) {
        const home = await getNeutralinoHomeDir();
        const configPath = `${home}/.llm-admin/conf.json`;
        const text: string = await Neutralino.filesystem.readFile(configPath);
        unifiedConfig = JSON.parse(text);
      } else {
        // Web mode fallback: use loadUiConfig (just gateway section)
        unifiedConfig.gateway = await loadUiConfig();
      }

      const jsonStr = JSON.stringify(unifiedConfig, null, 2);

      if (isDesktopMode()) {
        let filePath: string | null = null;
        try {
          const result = await Neutralino.os.showSaveDialog('Export Config', {
            defaultPath: 'conf.json',
          });
          filePath = result || null;
        } catch {
          filePath = null;
        }
        if (!filePath) return;
        await Neutralino.filesystem.writeFile(filePath, jsonStr);
        setExportSuccess(filePath);
        return;
      }

      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'conf.json';
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

      const gateway = (parsed as any).gateway || createEmptyUiConfig();
      await saveUiConfig(gateway);
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

      const gateway = (parsed as any).gateway || createEmptyUiConfig();
      await saveUiConfig(gateway);
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
      const Neutralino = isDesktopMode() ? (window as any).Neutralino : null;

      // Reset gateway section
      await saveUiConfig(createEmptyUiConfig());

      // Reset settings section on disk
      if (Neutralino?.filesystem) {
        try {
          const home = await getNeutralinoHomeDir();
          const configPath = `${home}/.llm-admin/conf.json`;
          const text: string = await Neutralino.filesystem.readFile(configPath);
          const unified = JSON.parse(text);
          unified.settings = {
            plugins_enabled: ['default'],
            credentials: {},
            cache: false,
            integrations: [],
          };
          await Neutralino.filesystem.writeFile(
            configPath,
            JSON.stringify(unified, null, 2)
          );
        } catch (e: any) {
          console.warn('Failed to clear settings section:', e?.message);
        }
      }

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
