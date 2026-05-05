import React, { useEffect, useMemo, useState } from 'react';
import {
  getProviders,
  ProviderSummary,
  ProviderUpdateRequest,
  updateProvider,
  syncConfig,
  getRouting,
  addRoutingModel,
  removeRoutingModel,
  getProviderModels,
  updateRoutingPrimary,
  RoutingEntry,
} from '../api/adminClient';
import CategoryTabs from '../components/CategoryTabs';
import TopNotification from '../components/TopNotification';
import { ModelCategory } from '../types/models';
import { MODEL_CATEGORY_MAP, getModelsByProvider } from '../config/modelCategories';

type Draft = ProviderUpdateRequest & { apiKeyMasked?: string; remark?: string };

const GATEWAY_URL = 'http://127.0.0.1:8787';

interface ProvidersPageProps {
  onNavigateAllProviders: () => void;
}

export default function ProvidersPage({
  onNavigateAllProviders,
}: ProvidersPageProps) {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [routing, setRouting] = useState<RoutingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [copied, setCopied] = useState(false);
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('text');
  // Map from configId to config info (remark, apiKeyMasked, baseUrl)
  const [configInfo, setConfigInfo] = useState<
    Map<string, { remark?: string; apiKeyMasked?: string; baseUrl?: string }>
  >(new Map());

  // Model selection dialog state
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [modelDialogProvider, setModelDialogProvider] = useState<string | null>(
    null
  );
  const [modelDialogConfigId, setModelDialogConfigId] = useState<string | null>(
    null
  );
  const [providerModels, setProviderModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [addingModels, setAddingModels] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    type: 'error' | 'notice';
  } | null>(null);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(GATEWAY_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        // Build configId -> configInfo map
        const configMap = new Map<
          string,
          { remark?: string; apiKeyMasked?: string; baseUrl?: string }
        >();
        for (const p of providersRes.providers) {
          if (p.configId) {
            configMap.set(p.configId, {
              remark: p.remark,
              apiKeyMasked: p.apiKeyMasked,
              baseUrl: p.baseUrl,
            });
          }
        }
        setConfigInfo(configMap);
        const nextDrafts: Record<string, Draft> = {};
        for (const p of providersRes.providers) {
          nextDrafts[p.provider] = {
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

  const canSave = useMemo(() => {
    if (!savingProvider) return true;
    return false;
  }, [savingProvider]);

  const toggleExpanded = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(provider)) {
        next.delete(provider);
      } else {
        next.add(provider);
      }
      return next;
    });
  };

  const openModelDialog = async (provider: string, configId: string) => {
    setModelDialogProvider(provider);
    setModelDialogConfigId(configId);
    setSelectedModels([]);
    setProviderModels([]); // clear previous cache before fetch
    setShowModelDialog(true);
    try {
      const result = await getProviderModels(provider, configId);
      // Handle Google-style response: { models: [{ name: "models/gemini-2.5-flash", ... }] }
      // and OpenAI-style response: { data: [{ id: "gpt-4o", ... }] }
      const rawModels = result.data || (result as any).models || [];
      const modelIds = rawModels
        .map((m: any) => {
          const id = m.id || m.name || '';
          // Strip "models/" prefix for Google
          return id.replace(/^models\//, '');
        })
        .filter(Boolean);
      setProviderModels(modelIds);
    } catch (e) {
      console.error('Failed to fetch provider models:', e);
      setProviderModels([]);
    }
  };

  const closeModelDialog = () => {
    setShowModelDialog(false);
    setModelDialogProvider(null);
    setModelDialogConfigId(null);
    setSelectedModels([]);
  };

  const handleAddModels = async () => {
    if (
      !modelDialogProvider ||
      !modelDialogConfigId ||
      selectedModels.length === 0
    )
      return;
    setAddingModels(true);
    try {
      for (const model of selectedModels) {
        await addRoutingModel(
          activeCategory,
          modelDialogProvider,
          model,
          modelDialogConfigId
        );
      }
      const routingRes = await getRouting(activeCategory);
      setRouting(routingRes.routing);
      // Refresh providers to update their routing info
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
      closeModelDialog();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setAddingModels(false);
    }
  };

  const handleRemoveFromRouting = async (
    provider: string,
    model: string,
    configId: string
  ) => {
    try {
      await removeRoutingModel(activeCategory, provider, model, configId);
      const routingRes = await getRouting(activeCategory);
      setRouting(routingRes.routing);
      // Refresh providers to update their routing info
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const handleTogglePrimary = async (
    provider: string,
    model: string,
    configId: string,
    currentIsPrimary: boolean
  ) => {
    try {
      await updateRoutingPrimary(
        activeCategory,
        provider,
        model,
        configId,
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
      disabled={!canSave || savingProvider === p.provider}
      onClick={async () => {
        const draft = drafts[p.provider];
        // Validate required fields for new provider
        if (!p.apiKeyMasked && (!draft?.apiKey || draft.apiKey.trim() === '')) {
          setNotification({ message: 'API Key 为必填项', type: 'error' });
          return;
        }
        setSavingProvider(p.provider);
        try {
          const draft = drafts[p.provider];
          const req: ProviderUpdateRequest = {
            apiKey: draft?.apiKey ? draft.apiKey : undefined,
            baseUrl: draft?.baseUrl || undefined,
            remark: draft?.remark || undefined,
          };
          await updateProvider(activeCategory, p.provider, req);
          // Note: Do NOT auto-syncConfig here. User should add models to routing first, then sync manually.
          const refreshed = await getProviders(activeCategory);
          setProviders(refreshed.providers);
          const nextDrafts: Record<string, Draft> = {};
          for (const pp of refreshed.providers) {
            nextDrafts[pp.provider] = {
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
                  remark: prev[p.provider]?.remark,
                },
              }));
            }}
          />
        </div>

        <div className="field">
          <div className="label">请求地址</div>
          <input
            value={d.baseUrl ?? p.baseUrl ?? ''}
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

        <div className="field">
          <div className="label">备注 (可选，不填则自动生成)</div>
          <input
            value={d.remark ?? ''}
            placeholder={p.remark ?? '自动生成'}
            onChange={(e) => {
              const val = e.target.value;
              setDrafts((prev) => ({
                ...prev,
                [p.provider]: {
                  ...(prev[p.provider] ?? {}),
                  remark: val || undefined,
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

  return (
    <div>
      {notification && (
        <TopNotification
          message={notification.message}
          type={notification.type}
          onDismiss={() => setNotification(null)}
        />
      )}
      <div
        className="gateway-url-banner"
        onClick={handleCopyUrl}
        style={{ cursor: 'pointer' }}
      >
        <span>网关地址: {GATEWAY_URL}</span>
        <span className="copy-hint">{copied ? '已复制' : '点击复制'}</span>
      </div>
      <h1 className="page-title">Routing</h1>
      <CategoryTabs
        activeCategory={activeCategory}
        onCategoryChange={setActiveCategory}
      />

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="muted">Loading providers...</div> : null}

      {!loading && providers.length === 0 && !error ? (
        <div className="notice">
          No providers configured yet. Add providers in the backend config
          first.
        </div>
      ) : null}

      {(() => {
        // Show all configs with apiKey (each config is a separate entry)
        const activeProviders = providers.filter(
          (p) => p.status === 'connected'
        );
        // Get models already in routing for each provider+configId
        const routedProviderModels = new Map<string, string[]>();
        for (const entry of routing) {
          const key = `${entry.provider}:${entry.configId}`;
          const existing = routedProviderModels.get(key) ?? [];
          existing.push(entry.model);
          routedProviderModels.set(key, existing);
        }
        return (
          <>
            {/* Routing Section */}
            {routing.length > 0 && (
              <div className="pinned-section">
                <h2 className="section-title">Routing</h2>
                {(() => {
                  const primaryEntries = routing.filter((e) => e.isPrimary);
                  const lbEntries = routing.filter((e) => !e.isPrimary);
                  return (
                    <div className="routing-groups">
                      {primaryEntries.length > 0 && (
                        <div className="routing-group routing-group--primary">
                          <div className="routing-group-header">
                            <span className="routing-group-icon">★</span>
                            <span className="routing-group-label">
                              Primary / Fallback
                            </span>
                          </div>
                          <div className="routing-list">
                            {primaryEntries.map((entry) => {
                              const info = configInfo.get(entry.configId);
                              return (
                                <div
                                  key={`${entry.provider}-${entry.model}-${entry.configId}`}
                                  className="routing-item is-primary"
                                >
                                  <div className="routing-info">
                                    <span className="routing-provider">
                                      {entry.provider}
                                    </span>
                                    <span className="routing-separator">/</span>
                                    <span className="routing-model">
                                      {entry.model}
                                    </span>
                                    {info?.remark && (
                                      <span className="routing-config-info">
                                        ({info.remark})
                                      </span>
                                    )}
                                    {info?.apiKeyMasked && (
                                      <span className="routing-config-key">
                                        {info.apiKeyMasked}
                                      </span>
                                    )}
                                  </div>
                                  <div className="routing-actions">
                                    <button
                                      className="secondary small"
                                      onClick={() =>
                                        handleTogglePrimary(
                                          entry.provider,
                                          entry.model,
                                          entry.configId,
                                          true
                                        )
                                      }
                                    >
                                      Remove Primary
                                    </button>
                                    <button
                                      className="routing-delete"
                                      onClick={() =>
                                        handleRemoveFromRouting(
                                          entry.provider,
                                          entry.model,
                                          entry.configId
                                        )
                                      }
                                      title="Remove from routing"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {lbEntries.length > 0 && (
                        <div className="routing-group routing-group--lb">
                          <div className="routing-group-header">
                            <span className="routing-group-icon">⟳</span>
                            <span className="routing-group-label">
                              Load Balancing
                            </span>
                          </div>
                          <div className="routing-list">
                            {lbEntries.map((entry) => {
                              const info = configInfo.get(entry.configId);
                              return (
                                <div
                                  key={`${entry.provider}-${entry.model}-${entry.configId}`}
                                  className="routing-item"
                                >
                                  <div className="routing-info">
                                    <span className="routing-provider">
                                      {entry.provider}
                                    </span>
                                    <span className="routing-separator">/</span>
                                    <span className="routing-model">
                                      {entry.model}
                                    </span>
                                    {info?.remark && (
                                      <span className="routing-config-info">
                                        ({info.remark})
                                      </span>
                                    )}
                                    {info?.apiKeyMasked && (
                                      <span className="routing-config-key">
                                        {info.apiKeyMasked}
                                      </span>
                                    )}
                                  </div>
                                  <div className="routing-actions">
                                    <button
                                      className="secondary small"
                                      onClick={() =>
                                        handleTogglePrimary(
                                          entry.provider,
                                          entry.model,
                                          entry.configId,
                                          false
                                        )
                                      }
                                    >
                                      Set as Primary
                                    </button>
                                    <button
                                      className="routing-delete"
                                      onClick={() =>
                                        handleRemoveFromRouting(
                                          entry.provider,
                                          entry.model,
                                          entry.configId
                                        )
                                      }
                                      title="Remove from routing"
                                    >
                                      ×
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Active Providers Section */}
            <div className="pinned-section">
              <div className="section-title-row">
                <h2 className="section-title">Active Providers</h2>
                <button
                  className="primary small"
                  onClick={onNavigateAllProviders}
                >
                  ＋ Add Provider
                </button>
              </div>
              {activeProviders.length === 0 ? (
                <div className="notice">
                  No active providers. Click "＋ Add Provider" to configure one.
                </div>
              ) : (
                <div className="provider-list">
                  {activeProviders.map((p) => {
                    const isExpanded = expandedProviders.has(p.provider);
                    const routedModels =
                      routedProviderModels.get(`${p.provider}:${p.configId}`) ??
                      [];
                    return (
                      <div className="provider-list-item" key={p.configId}>
                        <div className="provider-list-row">
                          <div className="provider-info">
                            <span className="provider-name">{p.provider}</span>
                            {p.remark && (
                              <span className="provider-remark">
                                {' '}
                                ({p.remark})
                              </span>
                            )}
                            {routedModels.length > 0 && (
                              <span className="routed-badge">
                                {routedModels.length} model
                                {routedModels.length > 1 ? 's' : ''} in routing
                              </span>
                            )}
                          </div>
                          <div className="provider-actions">
                            <button
                              className="secondary small"
                              onClick={() =>
                                openModelDialog(
                                  p.provider,
                                  p.configId ?? p.provider
                                )
                              }
                            >
                              Add to Routing
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
              )}
            </div>
          </>
        );
      })()}

      {/* Model Selection Dialog */}
      {showModelDialog && modelDialogProvider && modelDialogConfigId && (
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
                // Use API-returned models, filter by name pattern for category
                const modelIds = providerModels.length > 0 ? providerModels : [];
                const filtered = modelIds
                  .map((id) => ({
                    model: id,
                    category: /(?:^|[-_])image(?:[-_]|$)|img/i.test(id) ? 'image' : 'text',
                  }))
                  .filter((m) => m.category === activeCategory);
                const routedModels = new Set(
                  routing
                    .filter(
                      (r) =>
                        r.provider === modelDialogProvider &&
                        r.configId === modelDialogConfigId
                    )
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
