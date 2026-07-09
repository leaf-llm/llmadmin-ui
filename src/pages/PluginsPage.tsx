import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getPlugins,
  setPluginEnabled,
  setPluginCredentials,
  setPluginPresetEnabled,
  type PluginSummary,
  type PluginFunctionSummary,
} from '../api/adminClient';

function PluginCard({
  plugin,
  onClick,
  onToggleEnabled,
  toggling,
}: {
  plugin: PluginSummary;
  onClick: () => void;
  onToggleEnabled: () => void;
  toggling: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="card plugin-card" onClick={onClick} role="button" tabIndex={0}>
      <div className="plugin-card__header">
        <div className="plugin-card__title">{plugin.manifestId || plugin.id}</div>
        <label
          className={`plugin-switch ${plugin.enabled ? 'plugin-switch--on' : ''} ${toggling ? 'plugin-switch--busy' : ''}`}
          onClick={(e) => e.stopPropagation()}
          title={plugin.enabled ? t('plugins.disable') : t('plugins.enable')}
        >
          <input
            type="checkbox"
            checked={plugin.enabled}
            disabled={toggling}
            onChange={onToggleEnabled}
            aria-label={plugin.enabled ? t('plugins.disable') : t('plugins.enable')}
          />
          <span className="plugin-switch__track">
            <span className="plugin-switch__thumb" />
          </span>
        </label>
      </div>
      <div className="plugin-card__desc" title={t(`plugins.${plugin.id}.description`, plugin.description)}>
        {t(`plugins.${plugin.id}.cardDescription`, t(`plugins.${plugin.id}.description`, plugin.description))}
      </div>
      <div className="plugin-card__badges">
        <span className="badge badge--muted">
          {plugin.type === 'transformer' ? t('plugins.typeTransformer') : t('plugins.typeGuardrail')}
        </span>
      </div>
    </div>
  );
}

function FunctionCard({ fn }: { fn: PluginFunctionSummary }) {
  return (
    <div className="plugin-fn">
      <div className="plugin-fn__name">{fn.name}</div>
      {fn.description && <div className="plugin-fn__desc">{fn.description}</div>}
      <div className="plugin-fn__meta">
        {fn.supportedHooks.length > 0 && <span>Hooks: {fn.supportedHooks.join(', ')}</span>}
      </div>
    </div>
  );
}

function renderCredentialsFields(
  schema: Record<string, unknown> | null,
  values: Record<string, string>,
  onChange: (key: string, value: string) => void,
): React.ReactNode | null {
  if (!schema || typeof schema !== 'object') return null;
  const props = (schema as any).properties as Record<
    string,
    { type?: string; label?: string; description?: string; encrypted?: boolean; enum?: string[] }
  > | undefined;
  if (!props) return null;
  const required = Array.isArray((schema as any).required) ? (schema as any).required : [];
  const fields = Object.entries(props).map(([key, prop]) => {
    const label = prop.label || key;
    const isRequired = required.includes(key);
    const isEncrypted = prop.encrypted === true;
    const isEnum = Array.isArray(prop.enum) && prop.enum.length > 0;
    const inputId = `cred-${key}`;
    const value = values[key] ?? '';
    let input: React.ReactNode;
    const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', minWidth: 0 };
    if (isEnum) {
      input = (
        <select id={inputId} value={value} onChange={(e) => onChange(key, e.target.value)} style={inputStyle}>
          <option value="">—</option>
          {prop.enum!.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );
    } else if (isEncrypted) {
      input = <input id={inputId} type="password" value={value} placeholder="••••••••" onChange={(e) => onChange(key, e.target.value)} style={inputStyle} autoComplete="off" />;
    } else {
      input = <input id={inputId} type="text" value={value} onChange={(e) => onChange(key, e.target.value)} style={inputStyle} />;
    }
    return (
      <div className="field" key={key} style={{ minWidth: 0 }}>
        <label className="label" htmlFor={inputId}>{label}{isRequired && <span style={{ color: '#b91c1c' }}>*</span>}</label>
        {input}
        {prop.description && <div style={{ fontSize: 11, color: 'rgba(17,24,39,0.5)' }}>{prop.description}</div>}
      </div>
    );
  });
  return fields.length > 0 ? <>{fields}</> : null;
}

function PluginsModal({
  plugin,
  onClose,
  onRefresh,
}: {
  plugin: PluginSummary;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [credentialsValues, setCredentialsValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'warn'; text: string } | null>(null);
  const [togglingPresetId, setTogglingPresetId] = useState<string | null>(null);

  useEffect(() => {
    setCredentialsValues({});
    setMessage(null);
    setSaving(false);
    setTogglingPresetId(null);
  }, [plugin.id]);

  const handleCredChange = useCallback((key: string, value: string) => {
    setCredentialsValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSaveCredentials = async () => {
    setSaving(true); setMessage(null);
    try {
      await setPluginCredentials(plugin.id, credentialsValues);
      setMessage({ type: 'ok', text: t('plugins.credentialsSaved') });
      onRefresh();
    } catch (err: any) { setMessage({ type: 'warn', text: err?.message ?? String(err) }); }
    finally { setSaving(false); }
  };

  const handlePresetToggle = async (presetId: string, currentlyEnabled: boolean) => {
    setTogglingPresetId(presetId);
    try {
      await setPluginPresetEnabled(plugin.id, presetId, !currentlyEnabled);
      onRefresh();
    } catch { /* silent */ }
    finally { setTogglingPresetId(null); }
  };

  const hasCredentialsForm =
    plugin.credentialsSchema &&
    typeof plugin.credentialsSchema === 'object' &&
    (plugin.credentialsSchema as any).properties &&
    Object.keys((plugin.credentialsSchema as any).properties).length > 0;

  const hasPresets = plugin.presets && plugin.presets.length > 0;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog dialog--wide" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h3>{plugin.manifestId || plugin.id}</h3>
          <button className="dialog-close" onClick={onClose}>×</button>
        </div>
        <div className="dialog-body">
          <div className="plugin-card__badges" style={{ marginBottom: 6 }}>
            <span className="badge badge--muted">
              {plugin.type === 'transformer' ? t('plugins.typeTransformer') : t('plugins.typeGuardrail')}
            </span>
          </div>
          <p style={{ fontSize: 13, margin: '0 0 12px', lineHeight: 1.5, color: 'rgba(17,24,39,0.8)' }}>
            {t(`plugins.${plugin.id}.description`, plugin.description)}
          </p>
          {hasPresets ? (
            <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!plugin.enabled && (
                <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
                  {t('plugins.enablePluginFirst', 'Please enable this plugin first to configure its presets.')}
                </div>
              )}
              {plugin.presets!.map((p) => (
                <div
                  key={p.id}
                  className="plugin-fn"
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'default', opacity: plugin.enabled ? 1 : 0.5 }}
                >
                  <label
                    className={`plugin-switch ${p.enabled ? 'plugin-switch--on' : ''} ${togglingPresetId === p.id ? 'plugin-switch--busy' : ''}`}
                    style={{ flexShrink: 0, marginTop: 1 }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      disabled={!plugin.enabled || togglingPresetId === p.id}
                      onChange={() => handlePresetToggle(p.id, p.enabled)}
                      aria-label={p.enabled ? t('plugins.disable') : t('plugins.enable')}
                    />
                    <span className="plugin-switch__track">
                      <span className="plugin-switch__thumb" />
                    </span>
                  </label>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{t(p.i18nKey + '.name', p.name)}</div>
                    <div style={{ fontSize: 12, color: 'rgba(17,24,39,0.6)', marginTop: 2, lineHeight: 1.4 }}>
                      {t(p.i18nKey + '.description', p.description)}
                    </div>
                    <div style={{ marginTop: 3 }}>
                      <span className="badge badge--muted" style={{ fontSize: 10 }}>
                        {p.eventType === 'beforeRequestHook' ? t('plugins.stageBeforeRequest', 'Before Request') : t('plugins.stageAfterRequest', 'After Request')}
                      </span>
                      {p.deny && (
                        <span className="badge badge--warn" style={{ fontSize: 10, marginLeft: 4 }}>
                          {t('plugins.presets.deny', 'Deny')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div className="card__title" style={{ fontSize: 13 }}>{t('plugins.functions')} ({plugin.functions.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plugin.functions.map((fn) => <FunctionCard key={fn.id} fn={fn} />)}
              </div>
            </div>
          )}
          {hasCredentialsForm && (
            <div style={{ marginBottom: 12 }}>
              <div className="card__title" style={{ fontSize: 13 }}>{t('plugins.credentials')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {renderCredentialsFields(plugin.credentialsSchema as Record<string, unknown>, credentialsValues, handleCredChange)}
              </div>
            </div>
          )}
          {message && <div className={message.type === 'warn' ? 'notice-warning' : 'notice'} style={{ marginTop: 4 }}>{message.text}</div>}
        </div>
        <div className="dialog-footer">
          <button onClick={onClose}>{t('common.cancel')}</button>
          {hasCredentialsForm && (
            <button className="primary" disabled={saving} onClick={handleSaveCredentials}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Whitelist of plugin IDs that are allowed to appear in the UI. Anything
// outside this list is hidden even if a manifest exists on disk.
const PLUGIN_WHITELIST = new Set(['default', 'promptcache']);

export default function PluginsPage() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<PluginSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<PluginSummary | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchPlugins = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await getPlugins();
      setPlugins(res.plugins.filter((p) => PLUGIN_WHITELIST.has(p.id)));
    } catch (err: any) { setError(err?.message ?? String(err)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlugins(); }, [fetchPlugins]);

  // Keep the selectedPlugin in sync when plugins data refreshes (e.g. after
  // a preset toggle updates the presets array on the default plugin).
  useEffect(() => {
    setSelectedPlugin((prev) => {
      if (!prev) return prev;
      const updated = plugins.find((p) => p.id === prev.id);
      return updated ?? prev;
    });
  }, [plugins]);

  const handleCardToggle = async (plugin: PluginSummary) => {
    setTogglingId(plugin.id);
    try {
      await setPluginEnabled(plugin.id, !plugin.enabled);
      await fetchPlugins();
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setTogglingId(null);
    }
  };

  const enabledPlugins = plugins.filter((p) => p.enabled);
  const availablePlugins = plugins.filter((p) => !p.enabled);

  return (
    <div>
      {loading && <div className="muted">{t('common.loading')}</div>}
      {error && <div className="error">{error}</div>}
      {!loading && !error && (
        <>
          <div className="card">
            <div className="card__title">{t('plugins.configured')}</div>
            {enabledPlugins.length > 0 ? (
              <div className="grid grid-3">
                {enabledPlugins.map((p) => (
                  <PluginCard
                    key={p.id}
                    plugin={p}
                    onClick={() => setSelectedPlugin(p)}
                    onToggleEnabled={() => handleCardToggle(p)}
                    toggling={togglingId === p.id}
                  />
                ))}
              </div>
            ) : (<div className="muted">{t('plugins.noConfigured')}</div>)}
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card__title">{t('plugins.configurable')}</div>
            {availablePlugins.length > 0 ? (
              <div className="grid grid-3">
                {availablePlugins.map((p) => (
                  <PluginCard
                    key={p.id}
                    plugin={p}
                    onClick={() => setSelectedPlugin(p)}
                    onToggleEnabled={() => handleCardToggle(p)}
                    toggling={togglingId === p.id}
                  />
                ))}
              </div>
            ) : (<div className="muted">{t('plugins.noConfigurable')}</div>)}
          </div>
        </>
      )}
      {selectedPlugin && (
        <PluginsModal
          plugin={selectedPlugin}
          onClose={() => setSelectedPlugin(null)}
          onRefresh={fetchPlugins}
        />
      )}
    </div>
  );
}
