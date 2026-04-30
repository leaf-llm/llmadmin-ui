import React, { useEffect, useState } from 'react';
import {
  getProviders,
  ProviderSummary,
  ProviderUpdateRequest,
  updateProvider,
  syncConfig,
  getRouting,
  addRoutingModel,
  removeRoutingModel,
  updateRoutingPrimary,
  RoutingEntry,
  SUPPORTED_PROVIDERS,
} from '../api/adminClient';
import { ModelCategory } from '../types/models';
import { getModelsByProvider } from '../config/modelCategories';

type Draft = ProviderUpdateRequest & { apiKeyMasked?: string; remark?: string };

interface AllProvidersPageProps {
  onBack: () => void;
}

export default function AllProvidersPage({ onBack }: AllProvidersPageProps) {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [routing, setRouting] = useState<RoutingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  // Default category for routing operations (category tabs hidden on this page)
  const [activeCategory] = useState<ModelCategory>('text');

  const [showModelDialog, setShowModelDialog] = useState(false);
  const [modelDialogProvider, setModelDialogProvider] = useState<string | null>(
    null
  );
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [addingModels, setAddingModels] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [providersRes, routingRes] = await Promise.all([
          getProviders(activeCategory),
          getRouting(activeCategory),
        ]);
        if (cancelled) return;
        setProviders(providersRes.providers);
        setRouting(routingRes.routing);
        const nextDrafts: Record<string, Draft> = {};
        for (const p of providersRes.providers) {
          const key = p.configId ?? p.provider;
          nextDrafts[key] = {
            apiKey: undefined,
            baseUrl: p.baseUrl ?? '',
            apiKeyMasked: p.apiKeyMasked,
            remark: p.remark,
          };
        }
        setDrafts(nextDrafts);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [activeCategory]);

  const toggleExpanded = (configId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(configId)) next.delete(configId);
      else next.add(configId);
      return next;
    });
  };

  const openModelDialog = (provider: string) => {
    setModelDialogProvider(provider);
    setSelectedModels([]);
    setShowModelDialog(true);
  };

  const closeModelDialog = () => {
    setShowModelDialog(false);
    setModelDialogProvider(null);
    setSelectedModels([]);
  };

  const handleAddModels = async () => {
    if (!modelDialogProvider || selectedModels.length === 0) return;
    setAddingModels(true);
    try {
      for (const model of selectedModels) {
        await addRoutingModel(activeCategory, modelDialogProvider, model);
      }
      const routingRes = await getRouting(activeCategory);
      setRouting(routingRes.routing);
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
      closeModelDialog();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setAddingModels(false);
    }
  };

  const handleRemoveFromRouting = async (provider: string, model: string) => {
    try {
      await removeRoutingModel(activeCategory, provider, model);
      const routingRes = await getRouting(activeCategory);
      setRouting(routingRes.routing);
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const handleTogglePrimary = async (
    provider: string,
    model: string,
    currentIsPrimary: boolean
  ) => {
    try {
      await updateRoutingPrimary(
        activeCategory,
        provider,
        model,
        !currentIsPrimary
      );
      const routingRes = await getRouting(activeCategory);
      setRouting(routingRes.routing);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const toggleModelSelection = (model: string) => {
    setSelectedModels((prev) =>
      prev.includes(model) ? prev.filter((m) => m !== model) : [...prev, model]
    );
  };

  const renderSaveButton = (p: ProviderSummary, isNew: boolean = false) => {
    const key = p.configId ?? p.provider;
    const buttonText = isNew ? '新增' : '保存';
    return (
    <button
      className="primary"
      disabled={savingProvider === key}
      onClick={async () => {
        setSavingProvider(key);
        try {
          const draft = drafts[key];
          const req: ProviderUpdateRequest = {
            apiKey: draft?.apiKey ? draft.apiKey : undefined,
            baseUrl: draft?.baseUrl || undefined,
            remark: draft?.remark || undefined,
            configId: p.configId,
          };
          await updateProvider(activeCategory, p.provider, req);
          // Note: Do NOT auto-syncConfig here. User should add models to routing first, then sync manually.
          const refreshed = await getProviders(activeCategory);
          setProviders(refreshed.providers);
          const nextDrafts: Record<string, Draft> = {};
          for (const pp of refreshed.providers) {
            const ppKey = pp.configId ?? pp.provider;
            nextDrafts[ppKey] = {
              apiKey: undefined,
              baseUrl: pp.baseUrl ?? '',
              apiKeyMasked: pp.apiKeyMasked,
              remark: pp.remark,
            };
          }
          setDrafts(nextDrafts);
        } catch (e: any) {
          setError(e?.message ?? String(e));
        } finally {
          setSavingProvider(null);
        }
      }}
    >
      {savingProvider === key ? 'Saving...' : buttonText}
    </button>
  );
};

  const renderProviderForm = (p: ProviderSummary, isNew: boolean = false) => {
    const key = p.configId ?? p.provider;
    const d = drafts[key] ?? {};
    return (
      <div className="grid" style={{ gap: 10 }}>
        <div className="field">
          <div className="label">API Key (必填)</div>
          <input
            placeholder={
              p.apiKeyMasked && !isNew
                ? `Current: ${p.apiKeyMasked}`
                : 'Paste new API key'
            }
            value={d.apiKey ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setDrafts((prev) => ({
                ...prev,
                [key]: {
                  ...(prev[key] ?? {}),
                  apiKey: val || undefined,
                  apiKeyMasked: p.apiKeyMasked,
                  remark: (prev[key] ?? {}).remark,
                  baseUrl: (prev[key] ?? {}).baseUrl,
                },
              }));
            }}
          />
        </div>
        <div className="field">
          <div className="label">请求地址 (可选)</div>
          <input
            value={d.baseUrl ?? ''}
            placeholder={p.baseUrl}
            onChange={(e) => {
              const val = e.target.value;
              setDrafts((prev) => ({
                ...prev,
                [key]: {
                  ...(prev[key] ?? {}),
                  apiKey: (prev[key] ?? {}).apiKey,
                  apiKeyMasked: (prev[key] ?? {}).apiKeyMasked,
                  remark: (prev[key] ?? {}).remark,
                  baseUrl: val,
                },
              }));
            }}
          />
        </div>
        <div className="field">
          <div className="label">备注 (可选，不填则自动生成)</div>
          <input
            value={d.remark ?? ''}
            placeholder={p.remark ?? '自动生成'}
            onChange={(e) => {
              const val = e.target.value;
              setDrafts((prev) => ({
                ...prev,
                [key]: {
                  ...(prev[key] ?? {}),
                  remark: val || undefined,
                },
              }));
            }}
          />
        </div>
        <div className="row">
          {renderSaveButton(p, isNew)}
          <div className="muted">
            {p.lastSyncedAt ? `Last sync: ${p.lastSyncedAt}` : ''}
          </div>
        </div>
      </div>
    );
  };

  const routedProviderModels = new Map<string, string[]>();
  for (const entry of routing) {
    const existing = routedProviderModels.get(entry.provider) ?? [];
    existing.push(entry.model);
    routedProviderModels.set(entry.provider, existing);
  }

  // Connected: show ALL configs (each config as separate entry) so user can modify them
  const connectedProviders = providers.filter((p) => p.status === 'connected');
  // Not Configured: ALL providers (including those already in Connected), so user can add MORE configs
  const allProvidersSet = new Set(SUPPORTED_PROVIDERS);
  const disconnectedProviders = Array.from(allProvidersSet).map((provider) => {
    const existingConfigs = providers.filter((p) => p.provider === provider);
    const firstConfig = existingConfigs[0];
    const hasApiKey = existingConfigs.some((c) => c.status === 'connected');
    return {
      provider,
      status: hasApiKey ? 'connected' as const : 'disconnected' as const,
      baseUrl: firstConfig?.baseUrl ?? '',
      configCount: existingConfigs.length,
      configId: provider + '-new', // unique key for new config
    } as ProviderSummary;
  });

  return (
    <div className="all-providers-page">
      <button className="back-btn" onClick={onBack}>
        ← Back
      </button>
      <h1 className="page-title">All Providers</h1>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="muted">Loading providers...</div> : null}

      {!loading && providers.length === 0 && !error && (
        <div className="notice">No providers found.</div>
      )}

      {!loading && providers.length > 0 && (
        <>
          {connectedProviders.length > 0 && (
            <div className="pinned-section">
              <h2 className="section-title">Connected</h2>
              <div className="provider-list">
                {connectedProviders.map((p) => {
                  const isExpanded = expandedProviders.has(p.configId ?? p.provider);
                  const routedModels = routedProviderModels.get(p.provider) ?? [];
                  return (
                    <div className="provider-list-item" key={p.configId ?? p.provider}>
                      <div className="provider-list-row">
                        <div className="provider-info">
                          <span className="provider-name">{p.provider}</span>
                          <span className="status-badge status-badge--connected">Connected</span>
                          {p.remark && (
                            <span className="routed-badge">{p.remark}</span>
                          )}
                          {p.configCount > 1 && (
                            <span className="routed-badge">{p.configCount} configs</span>
                          )}
                          {routedModels.length > 0 && (
                            <span className="routed-badge">
                              {routedModels.length} model{routedModels.length > 1 ? 's' : ''} in routing
                            </span>
                          )}
                        </div>
                        <div className="provider-actions">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpanded(p.configId ?? p.provider)}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="provider-expand-content">
                          {renderProviderForm(p)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {disconnectedProviders.length > 0 && (
            <>
              {connectedProviders.length > 0 && <div className="section-divider" />}
              <h2 className="section-title">Not Configured</h2>
              <div className="provider-list">
                {disconnectedProviders.map((p) => {
                  const isExpanded = expandedProviders.has(p.configId ?? p.provider);
                  return (
                    <div className="provider-list-item" key={p.configId ?? p.provider}>
                      <div className="provider-list-row">
                        <div className="provider-info">
                          <span className="provider-name">{p.provider}</span>
                          {p.status === 'connected' && (
                            <span className="status-badge status-badge--connected" style={{ marginLeft: 8 }}>Has Config</span>
                          )}
                          {p.configCount > 0 && (
                            <span className="routed-badge" style={{ marginLeft: 8 }}>{p.configCount} config{p.configCount > 1 ? 's' : ''}</span>
                          )}
                        </div>
                        <div className="provider-actions">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpanded(p.configId ?? p.provider)}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="provider-expand-content">
                          {renderProviderForm(p, true)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {showModelDialog && modelDialogProvider && (
        <div className="dialog-overlay" onClick={closeModelDialog}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>Select Models - {modelDialogProvider}</h3>
              <button className="dialog-close" onClick={closeModelDialog}>
                ×
              </button>
            </div>
            <div className="dialog-body">
              {(() => {
                const allModels = getModelsByProvider(modelDialogProvider);
                const filtered = allModels.filter(
                  (m) => m.category === activeCategory
                );
                const routedModels = new Set(
                  routing
                    .filter((r) => r.provider === modelDialogProvider)
                    .map((r) => r.model)
                );
                if (filtered.length === 0) {
                  return (
                    <div className="muted">
                      No {activeCategory} models available for{' '}
                      {modelDialogProvider}
                    </div>
                  );
                }
                return filtered.map((m) => (
                  <label key={m.model} className="model-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedModels.includes(m.model)}
                      onChange={() => toggleModelSelection(m.model)}
                      disabled={routedModels.has(m.model)}
                    />
                    <span className="model-name">{m.model}</span>
                    {routedModels.has(m.model) && (
                      <span className="muted"> (already in routing)</span>
                    )}
                  </label>
                ));
              })()}
            </div>
            <div className="dialog-footer">
              <button className="secondary" onClick={closeModelDialog}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={selectedModels.length === 0 || addingModels}
                onClick={handleAddModels}
              >
                {addingModels
                  ? 'Adding...'
                  : `Add ${selectedModels.length} Model${selectedModels.length > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
