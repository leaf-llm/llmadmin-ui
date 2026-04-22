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
} from '../api/adminClient';
import { ModelCategory } from '../types/models';
import { getModelsByProvider } from '../config/modelCategories';

type Draft = ProviderUpdateRequest & { apiKeyMasked?: string };

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
          nextDrafts[p.provider] = {
            apiKey: undefined,
            baseUrl: p.baseUrl ?? '',
            apiKeyMasked: p.apiKeyMasked,
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

  const toggleExpanded = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) next.delete(provider);
      else next.add(provider);
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

  const renderSaveButton = (p: ProviderSummary) => (
    <button
      className="primary"
      disabled={savingProvider === p.provider}
      onClick={async () => {
        setSavingProvider(p.provider);
        try {
          const draft = drafts[p.provider];
          const req: ProviderUpdateRequest = {
            apiKey: draft?.apiKey ? draft.apiKey : undefined,
            baseUrl: draft?.baseUrl || undefined,
          };
          await updateProvider(activeCategory, p.provider, req);
          await syncConfig(activeCategory);
          const refreshed = await getProviders(activeCategory);
          setProviders(refreshed.providers);
          const nextDrafts: Record<string, Draft> = {};
          for (const pp of refreshed.providers) {
            nextDrafts[pp.provider] = {
              apiKey: undefined,
              baseUrl: pp.baseUrl ?? '',
              apiKeyMasked: pp.apiKeyMasked,
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
      {savingProvider === p.provider ? 'Saving...' : 'Save'}
    </button>
  );

  const renderProviderForm = (p: ProviderSummary) => {
    const d = drafts[p.provider] ?? {};
    return (
      <div className="grid" style={{ gap: 10 }}>
        <div className="field">
          <div className="label">API Key (必填)</div>
          <input
            placeholder={
              p.apiKeyMasked
                ? `Current: ${p.apiKeyMasked}`
                : 'Paste new API key'
            }
            value={d.apiKey ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              setDrafts((prev) => ({
                ...prev,
                [p.provider]: {
                  ...(prev[p.provider] ?? {}),
                  apiKey: val || undefined,
                  apiKeyMasked: p.apiKeyMasked,
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
                [p.provider]: {
                  ...(prev[p.provider] ?? {}),
                  baseUrl: val,
                },
              }));
            }}
          />
        </div>
        <div className="row">
          {renderSaveButton(p)}
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

  const connectedProviders = providers.filter((p) => p.status === 'connected');
  const disconnectedProviders = providers.filter(
    (p) => p.status !== 'connected'
  );

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

      {!loading && (
        <>
          {connectedProviders.length > 0 && (
            <div className="pinned-section">
              <h2 className="section-title">Connected</h2>
              <div className="provider-list">
                {connectedProviders.map((p) => {
                  const isExpanded = expandedProviders.has(p.provider);
                  const routedModels =
                    routedProviderModels.get(p.provider) ?? [];
                  return (
                    <div className="provider-list-item" key={p.provider}>
                      <div className="provider-list-row">
                        <div className="provider-info">
                          <span className="provider-name">{p.provider}</span>
                          <span className="status-badge status-badge--connected">
                            Connected
                          </span>
                          {routedModels.length > 0 && (
                            <span className="routed-badge">
                              {routedModels.length} model
                              {routedModels.length > 1 ? 's' : ''} in routing
                            </span>
                          )}
                        </div>
                        <div className="provider-actions">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpanded(p.provider)}
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
              {connectedProviders.length > 0 && (
                <div className="section-divider" />
              )}
              <h2 className="section-title">Not Configured</h2>
              <div className="grid">
                {disconnectedProviders.map((p) => (
                  <div className="card" key={p.provider}>
                    <div className="card__title">
                      {p.provider}{' '}
                      <span className="muted" style={{ fontWeight: 400 }}>
                        ({p.status ?? 'unknown'})
                      </span>
                    </div>
                    {renderProviderForm(p)}
                  </div>
                ))}
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
