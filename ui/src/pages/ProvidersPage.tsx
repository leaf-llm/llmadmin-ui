import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  moveRoutingEntry,
  RoutingEntry,
} from '../api/adminClient';
import CategoryTabs from '../components/CategoryTabs';
import TopNotification from '../components/TopNotification';
import { ModelCategory } from '../types/models';
import { MODEL_CATEGORY_MAP, getModelsByProvider, PROVIDER_API_KEY_URLS } from '../config/modelCategories';

type Draft = ProviderUpdateRequest & { apiKeyMasked?: string; remark?: string };

interface ProvidersPageProps {
  onNavigateAllProviders: () => void;
}

function getProviderDisplayName(provider: string, t: (key: string) => string): string {
  const providerMap: Record<string, string> = {
    zhipu: t('common.providerZhipu'),
    dashscope: t('common.providerDashscope'),
    doubao: t('common.providerDoubao'),
  };
  return providerMap[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}

export default function ProvidersPage({
  onNavigateAllProviders,
}: ProvidersPageProps) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [routing, setRouting] = useState<RoutingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [activeCategory, setActiveCategory] = useState<ModelCategory>('text');
  const [configInfo, setConfigInfo] = useState<
    Map<string, { remark?: string; apiKeyMasked?: string; baseUrl?: string }>
  >(new Map());

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
      const rawModels = result.data || (result as any).models || [];
      const modelIds = rawModels
        .map((m: any) => {
          const id = m.id || m.name || '';
          return id.replace(/^models\//, '');
        })
        .filter(Boolean);
      setProviderModels(modelIds);
    } catch (e) {
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
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
      closeModelDialog();
      await syncConfig(activeCategory);
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
      const providersRes = await getProviders(activeCategory);
      setProviders(providersRes.providers);
      await syncConfig(activeCategory);
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
      await syncConfig(activeCategory);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  };

  const handleMove = async (
    entry: RoutingEntry,
    direction: 'up' | 'down'
  ) => {
    try {
      const res = await moveRoutingEntry(
        activeCategory,
        entry.provider,
        entry.model,
        entry.configId,
        direction
      );
      setRouting(res.routing);
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
        if (!p.apiKeyMasked && (!draft?.apiKey || draft.apiKey.trim() === '')) {
          setNotification({ message: t('common.apiKeyRequired'), type: 'error' });
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
      {savingProvider === p.provider ? t('common.saving') : t('common.save')}
    </button>
  );

  const renderProviderForm = (p: ProviderSummary) => {
    const d = drafts[p.provider] ?? {};
    return (
      <div className="grid" style={{ gap: 10 }}>
        <div className="field">
          <div className="label">
            {t('common.apiKeyRequiredLabel')}
            {PROVIDER_API_KEY_URLS[p.provider.toLowerCase()] && (
              <a
                href={PROVIDER_API_KEY_URLS[p.provider.toLowerCase()]}
                target="_blank"
                rel="noopener noreferrer"
                className="api-key-link"
                onClick={(e) => e.stopPropagation()}
              >
                {t('common.getApiKey')}
              </a>
            )}
          </div>
          <input
            placeholder={
              p.apiKeyMasked
                ? t('common.currentValue', { value: p.apiKeyMasked })
                : t('common.pasteNewApiKey')
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
            onPaste={(e) => {
              e.preventDefault();
              const pasted = e.clipboardData.getData('text');
              setDrafts((prev) => ({
                ...prev,
                [p.provider]: {
                  ...(prev[p.provider] ?? {}),
                  apiKey: pasted || undefined,
                  apiKeyMasked: p.apiKeyMasked,
                  remark: prev[p.provider]?.remark,
                },
              }));
            }}
          />
        </div>

        <div className="field">
          <div className="label">{t('common.baseUrlLabel')}</div>
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
          <div className="label">{t('common.remarkLabel')}</div>
          <input
            value={d.remark ?? ''}
            placeholder={p.remark ?? t('common.autoGenerated')}
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
            {p.lastSyncedAt ? t('common.lastSync', { time: p.lastSyncedAt }) : ''}
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
      <div className="category-content-wrapper">
        <CategoryTabs
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
        />

        <div className="category-content">
          {error ? <div className="error">{error}</div> : null}
          {loading ? <div className="muted">{t('common.loading')}</div> : null}

          {!loading && providers.length === 0 && !error ? (
            <div className="notice">
              {t('common.noProvidersConfigured')}
            </div>
          ) : null}

          {(() => {
            const activeProviders = providers.filter(
              (p) => p.status === 'connected'
            );
            const routedProviderModels = new Map<string, string[]>();
            for (const entry of routing) {
              const key = `${entry.provider}:${entry.configId}`;
              const existing = routedProviderModels.get(key) ?? [];
              existing.push(entry.model);
              routedProviderModels.set(key, existing);
            }
            return (
              <>
                <div className="routing-section">
                  <h2 className="section-title">{t('common.modelRouting')}</h2>
                  {routing.length === 0 ? (
                    <div className="notice">
                      {t('common.noRoutingConfigured')}
                    </div>
                  ) : (
                    <div className="routing-groups">
                      {(() => {
                        const primaryEntries = routing.filter((e) => e.isPrimary);
                        const lbEntries = routing.filter((e) => !e.isPrimary);
                        return (
                          <>
                            {primaryEntries.length > 0 && (
                              <div className="routing-group routing-group--primary">
                                <div className="routing-group-header">
                                  <span className="routing-group-icon">★</span>
                                  <span className="routing-group-label">
                                    {t('common.primaryFallback')}
                                  </span>
                                  {primaryEntries.length > 0 && (
                                  <span className="routing-group-desc">
                                    {t('common.primaryFallbackDesc')}
                                  </span>
                                )}
                              </div>
                              <div className="routing-list">
                                {primaryEntries.map((entry, idx) => {
                                  const info = configInfo.get(entry.configId);
                                  const isFirst = idx === 0;
                                  const isLast = idx === primaryEntries.length - 1;
                                  return (
                                    <div
                                      key={`${entry.provider}-${entry.model}-${entry.configId}`}
                                      className="routing-item is-primary"
                                    >
                                      <div className="routing-info">
                                        <span className="routing-provider">
                                          {getProviderDisplayName(entry.provider, t)}
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
                                      </div>
                                      <div className="routing-actions">
                                        <span className="move-buttons">
                                          <button
                                            className="move-btn"
                                            onClick={() => handleMove(entry, 'up')}
                                            disabled={isFirst}
                                            title="Move up"
                                          >
                                            ↑
                                          </button>
                                          <button
                                            className="move-btn"
                                            onClick={() => handleMove(entry, 'down')}
                                            disabled={isLast}
                                            title="Move down"
                                          >
                                            ↓
                                          </button>
                                        </span>
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
                                          {t('common.removePrimary')}
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
                                          title={t('common.removeFromRouting')}
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
                                  {primaryEntries.length === 0
                                    ? t('common.randomAccess')
                                    : t('common.loadBalancing')}
                                </span>
                                {lbEntries.length > 0 && (
                                  <span className="routing-group-desc">
                                    {t('common.loadBalancingDesc')}
                                  </span>
                                )}
                              </div>
                              <div className="routing-list">
                                {lbEntries.map((entry, idx) => {
                                  const info = configInfo.get(entry.configId);
                                  const isFirst = idx === 0;
                                  const isLast = idx === lbEntries.length - 1;
                                  return (
                                    <div
                                      key={`${entry.provider}-${entry.model}-${entry.configId}`}
                                      className="routing-item"
                                    >
                                      <div className="routing-info">
                                        <span className="routing-provider">
                                          {getProviderDisplayName(entry.provider, t)}
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
                                          {t('common.setAsPrimary')}
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
                                          title={t('common.removeFromRouting')}
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
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>

                <div className="providers-section" style={{ marginTop: 16 }}>
                  <div className="section-title-row">
                    <h2 className="section-title">{t('common.activeProviders')}</h2>
                    <button
                      className="primary small"
                      onClick={onNavigateAllProviders}
                    >
                      {t('common.addProvider')}
                    </button>
                  </div>
                  {activeProviders.length === 0 ? (
                    <div className="notice">
                      {t('common.noActiveProviders')}
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
                                <span className="provider-name">{getProviderDisplayName(p.provider, t)}</span>
                                {p.remark && (
                                  <span className="provider-remark">
                                    {' '}
                                    ({p.remark})
                                  </span>
                                )}
                                {routedModels.length > 0 && (
                                  <span className="routed-badge">
                                    {t('common.modelCountInRouting', { count: routedModels.length, plural: routedModels.length > 1 ? 's' : '' })}
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
                                  {t('common.addToRouting')}
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
        </div>
      </div>

      {showModelDialog && modelDialogProvider && modelDialogConfigId && (
        <div className="dialog-overlay" onClick={closeModelDialog}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>{t('common.selectModels', { provider: modelDialogProvider })}</h3>
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
                      {t('common.noModelsAvailable', { category: activeCategory, provider: modelDialogProvider })}
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
                      <span className="muted"> {t('common.alreadyInRouting')}</span>
                    )}
                  </label>
                ));
              })()}
            </div>
            <div className="dialog-footer">
              <button className="secondary" onClick={closeModelDialog}>
                {t('common.cancel')}
              </button>
              <button
                className="primary"
                disabled={selectedModels.length === 0 || addingModels}
                onClick={handleAddModels}
              >
                {addingModels
                  ? t('common.adding')
                  : t('common.addModels', { count: selectedModels.length, plural: selectedModels.length > 1 ? 's' : '' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
