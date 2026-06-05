import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ProviderSummary,
  ProviderUpdateRequest,
  upsertProvider,
  deleteProviderConfig,
  listRouting,
  addToRouting,
  removeFromRouting,
  updateRoutingPrimary,
  RoutingEntry,
  SUPPORTED_PROVIDERS,
  listProviderSummaries,
} from '../lib/configStore';
import { testProviderConnectivity } from '../api/adminClient';
import { ModelCategory } from '../types/models';
import {
  getModelsByProvider,
  PROVIDER_API_KEY_URLS,
} from '../config/modelCategories';
import { openExternalUrl } from '../api/config';
import TopNotification from '../components/TopNotification';

type Draft = ProviderUpdateRequest & {
  apiKeyMasked?: string;
  remark?: string;
  testStatus?: 'untested' | 'testing' | 'passed' | 'failed';
  testMessage?: string;
  testStatusAnthropic?: 'untested' | 'testing' | 'passed' | 'failed';
  testMessageAnthropic?: string;
};

interface AllProvidersPageProps {
  onBack: () => void;
}

function getProviderDisplayName(
  provider: string,
  t: (key: string) => string
): string {
  const providerMap: Record<string, string> = {
    zhipu: t('common.providerZhipu'),
    dashscope: t('common.providerDashscope'),
    doubao: t('common.providerDoubao'),
    minimax: 'MiniMax',
    moonshot: 'Moonshot AI',
    'google-openai': 'Google',
  };
  return (
    providerMap[provider] ||
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}

export default function AllProvidersPage({ onBack }: AllProvidersPageProps) {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [routing, setRouting] = useState<RoutingEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );
  const [activeCategory] = useState<ModelCategory>('text');

  const [showModelDialog, setShowModelDialog] = useState(false);
  const [modelDialogProvider, setModelDialogProvider] = useState<string | null>(
    null
  );
  const [modelDialogConfigId, setModelDialogConfigId] = useState<string | null>(
    null
  );
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    provider: string;
    configId: string;
    models: string[];
  } | null>(null);
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
          listProviderSummaries(activeCategory),
          listRouting(activeCategory),
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
            baseUrlAnthropic: p.baseUrlAnthropic ?? '',
            apiKeyMasked: p.apiKeyMasked,
            remark: p.remark,
            apiFormat: p.apiFormat,
            testStatus: 'untested',
            testStatusAnthropic: 'untested',
          };
        }
        setDrafts(nextDrafts);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
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

  const openModelDialog = (provider: string, configId: string) => {
    setModelDialogProvider(provider);
    setModelDialogConfigId(configId);
    setSelectedModels([]);
    setShowModelDialog(true);
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
        await addToRouting(
          activeCategory,
          modelDialogProvider,
          model,
          modelDialogConfigId
        );
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
    // Always refresh state from backend, even on partial failure
    try {
      const [routingRes, providersRes] = await Promise.all([
        listRouting(activeCategory),
        listProviderSummaries(activeCategory),
      ]);
      setRouting(routingRes.routing);
      setProviders(providersRes.providers);
    } catch (refreshErr: any) {
      setError(refreshErr?.message ?? String(refreshErr));
    }
    closeModelDialog();
    setAddingModels(false);
  };

  const handleRemoveFromRouting = async (
    provider: string,
    model: string,
    configId: string
  ) => {
    try {
      await removeFromRouting(activeCategory, provider, model, configId);
      const routingRes = await listRouting(activeCategory);
      setRouting(routingRes.routing);
      const providersRes = await listProviderSummaries(activeCategory);
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
      const routingRes = await listRouting(activeCategory);
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

  const handleTestConnectivity = async (p: ProviderSummary, isNew: boolean) => {
    const key = p.configId ?? p.provider;
    const draft = drafts[key];
    if (isNew && !draft?.apiKey) {
      setNotification({
        message: t('common.pleaseEnterApiKeyFirst'),
        type: 'error',
      });
      return;
    }

    setTestingProvider(key);
    setDrafts((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        testStatus: 'testing',
        testStatusAnthropic: 'testing',
        testMessage: undefined,
        testMessageAnthropic: undefined,
      },
    }));

    try {
      const res = await testProviderConnectivity(p.provider, {
        ...(draft.apiKey ? { apiKey: draft.apiKey } : {}),
        baseUrl: draft.baseUrl ?? p.baseUrl,
        baseUrlAnthropic: draft.baseUrlAnthropic ?? p.baseUrlAnthropic,
        configId: isNew ? undefined : p.configId,
      });
      setDrafts((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testStatus: res.ok ? 'passed' : 'failed',
          testMessage: res.message,
          testStatusAnthropic: res.ok ? 'passed' : 'failed',
          testMessageAnthropic: res.message,
        },
      }));
      if (!res.ok) {
        setNotification({
          message: res.message || t('common.connectionFailed'),
          type: 'error',
        });
      }
    } catch (e: any) {
      setDrafts((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          testStatus: 'failed',
          testMessage: e?.message ?? t('common.connectionFailed'),
          testStatusAnthropic: 'failed',
          testMessageAnthropic: e?.message ?? t('common.connectionFailed'),
        },
      }));
    } finally {
      setTestingProvider(null);
    }
  };

  const renderSaveButton = (p: ProviderSummary, isNew: boolean = false) => {
    const key = p.configId ?? p.provider;
    const draft = drafts[key];
    const hasCredentialsChanged =
      draft?.apiKey !== undefined ||
      draft?.baseUrl !== (p.baseUrl ?? '') ||
      draft?.baseUrlAnthropic !== (p.baseUrlAnthropic ?? '');
    const canSave =
      (!isNew && !hasCredentialsChanged) ||
      draft?.testStatus === 'passed' ||
      draft?.testStatusAnthropic === 'passed';
    const buttonText = isNew ? t('common.addProvider') : t('common.save');
    return (
      <button
        className="primary"
        disabled={savingProvider === key || !canSave}
        onClick={async () => {
          const draft = drafts[key];
          if (isNew && (!draft?.apiKey || draft.apiKey.trim() === '')) {
            setNotification({
              message: t('common.apiKeyRequired'),
              type: 'error',
            });
            return;
          }
          setSavingProvider(key);
          try {
            const draft = drafts[key];
            const req: ProviderUpdateRequest = {
              apiKey: draft?.apiKey ? draft.apiKey : undefined,
              baseUrl: draft?.baseUrl || undefined,
              baseUrlAnthropic: draft?.baseUrlAnthropic || undefined,
              remark: draft?.remark || undefined,
              configId: p.configId,
              apiFormat: draft?.apiFormat,
            };
            await upsertProvider(activeCategory, p.provider, req);
            const refreshed = await listProviderSummaries(activeCategory);
            setProviders(refreshed.providers);
            const nextDrafts: Record<string, Draft> = {};
            for (const pp of refreshed.providers) {
              const ppKey = pp.configId ?? pp.provider;
              nextDrafts[ppKey] = {
                apiKey: undefined,
                baseUrl: pp.baseUrl ?? '',
                baseUrlAnthropic: pp.baseUrlAnthropic ?? '',
                apiKeyMasked: pp.apiKeyMasked,
                remark: pp.remark,
                apiFormat: pp.apiFormat,
                testStatus: 'untested',
                testStatusAnthropic: 'untested',
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
        {savingProvider === key ? t('common.saving') : buttonText}
      </button>
    );
  };

  const renderProviderForm = (p: ProviderSummary, isNew: boolean = false) => {
    const key = p.configId ?? p.provider;
    const d = drafts[key] ?? {};
    return (
      <div className="grid" style={{ gap: 10 }}>
        <div className="field">
          <div className="label">
            {t('common.apiKeyRequiredLabel')}
            {isNew && PROVIDER_API_KEY_URLS[p.provider.toLowerCase()] && (
              <button
                type="button"
                className="api-key-link"
                onClick={async (e) => {
                  e.stopPropagation();
                  const url = PROVIDER_API_KEY_URLS[p.provider.toLowerCase()];
                  if (!url) return;
                  await openExternalUrl(url);
                }}
              >
                {t('common.getApiKey')}
              </button>
            )}
          </div>
          <input
            placeholder={
              p.apiKeyMasked && !isNew
                ? t('common.currentValue', { value: p.apiKeyMasked })
                : t('common.pasteNewApiKey')
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
                  testStatus: 'untested',
                  testMessage: undefined,
                },
              }));
            }}
          />
        </div>
        <div className="field">
          <div className="label">{t('common.baseUrlLabel')}</div>
          <div style={{ position: 'relative' }}>
            <input
              value={d.baseUrl ?? p.baseUrl ?? ''}
              onChange={(e) => {
                const val = e.target.value;
                setDrafts((prev) => ({
                  ...prev,
                  [key]: {
                    ...(prev[key] ?? {}),
                    apiKey: (prev[key] ?? {}).apiKey,
                    apiKeyMasked: p.apiKeyMasked,
                    remark: (prev[key] ?? {}).remark,
                    baseUrl: val,
                    baseUrlAnthropic: (prev[key] ?? {}).baseUrlAnthropic,
                    testStatus: 'untested',
                    testStatusAnthropic: (prev[key] ?? {}).testStatusAnthropic,
                    testMessage: undefined,
                    testMessageAnthropic: (prev[key] ?? {}).testMessageAnthropic,
                  },
                }));
              }}
              className="with-status-icon"
            />
            {d.testStatus && d.testStatus !== 'untested' && (
              <span
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: d.testStatus === 'passed' ? '#22c55e' : d.testStatus === 'testing' ? '#f59e0b' : '#ef4444',
                  fontWeight: 'bold',
                  pointerEvents: 'none',
                }}
              >
                {d.testStatus === 'testing' ? (
                  <span className="loading-dots"><span /><span /><span /></span>
                ) : d.testStatus === 'passed' ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>
        {(p.baseUrlAnthropic || d.baseUrlAnthropic) && (
          <div className="field">
            <div className="label">{t('common.baseUrlLabel')} (Anthropic)</div>
            <div style={{ position: 'relative' }}>
              <input
                value={d.baseUrlAnthropic ?? p.baseUrlAnthropic ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setDrafts((prev) => ({
                    ...prev,
                    [key]: {
                      ...(prev[key] ?? {}),
                      apiKey: (prev[key] ?? {}).apiKey,
                      apiKeyMasked: p.apiKeyMasked,
                      remark: (prev[key] ?? {}).remark,
                      baseUrl: (prev[key] ?? {}).baseUrl,
                      baseUrlAnthropic: val,
                      testStatus: 'untested',
                      testStatusAnthropic: 'untested',
                      testMessage: undefined,
                      testMessageAnthropic: undefined,
                    },
                  }));
                }}
                className="with-status-icon"
              />
              {d.testStatusAnthropic && d.testStatusAnthropic !== 'untested' && (
                <span
                  style={{
                    position: 'absolute',
                    right: 10,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: d.testStatusAnthropic === 'passed' ? '#22c55e' : d.testStatusAnthropic === 'testing' ? '#f59e0b' : '#ef4444',
                    fontWeight: 'bold',
                    pointerEvents: 'none',
                  }}
                >
                  {d.testStatusAnthropic === 'testing' ? (
                    <span className="loading-dots"><span /><span /><span /></span>
                  ) : d.testStatusAnthropic === 'passed' ? '✓' : '✗'}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="field">
          <div className="label">{t('common.remarkLabel')}</div>
          <input
            value={d.remark ?? ''}
            placeholder={p.remark ?? t('common.autoGenerated')}
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
          {!isNew && p.configId && (
            <button
              className="danger"
              onClick={async () => {
                const key = `${p.provider}:${p.configId}`;
                const models = routedProviderModels.get(key) ?? [];
                if (models.length > 0) {
                  setDeleteTarget({
                    provider: p.provider,
                    configId: p.configId!,
                    models,
                  });
                  setShowDeleteDialog(true);
                } else {
                  setDeleteTarget({
                    provider: p.provider,
                    configId: p.configId!,
                    models: [],
                  });
                  setShowDeleteDialog(true);
                }
              }}
            >
              {t('common.delete')}
            </button>
          )}
          {(isNew || drafts[key]?.testStatus !== 'passed') && (
            <button
              className="secondary"
              disabled={testingProvider === key || (isNew && !drafts[key]?.apiKey)}
              onClick={() => handleTestConnectivity(p, isNew)}
            >
              {testingProvider === key
                ? t('common.testing')
                : t('common.testConnectivity')}
            </button>
          )}
          {drafts[key]?.testStatus === 'passed' && (
            <span
              className="test-passed-icon"
              title={t('common.connectionVerified')}
            >
              &#10003;
            </span>
          )}
          {drafts[key]?.testStatus === 'failed' && (
            <span className="test-failed-icon" title={drafts[key]?.testMessage}>
              &#10007;
            </span>
          )}
          <div className="muted">
            {p.lastSyncedAt
              ? t('common.lastSync', { time: p.lastSyncedAt })
              : ''}
          </div>
        </div>
      </div>
    );
  };

  function ConfirmDialog({
    isOpen,
    title,
    message,
    models,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    message: string;
    models: string[];
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div className="dialog-overlay" onClick={onCancel}>
        <div className="dialog" onClick={(e) => e.stopPropagation()}>
          <div className="dialog-header">
            <h3>{title}</h3>
            <button className="dialog-close" onClick={onCancel}>
              ×
            </button>
          </div>
          <div className="dialog-body">
            <p>{message}</p>
            {models.length > 0 && (
              <ul>
                {models.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="dialog-footer">
            <button onClick={onCancel}>{t('common.cancel')}</button>
            <button className="danger" onClick={onConfirm}>
              {t('common.confirmDeleteBtn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const routedProviderModels = new Map<string, string[]>();
  for (const entry of routing) {
    const key = `${entry.provider}:${entry.configId}`;
    const existing = routedProviderModels.get(key) ?? [];
    existing.push(entry.model);
    routedProviderModels.set(key, existing);
  }

  const connectedProviders = providers.filter((p) => p.status === 'connected');
  const allProvidersSet = new Set(SUPPORTED_PROVIDERS);
  const disconnectedProviders = Array.from(allProvidersSet).map((provider) => {
    const existingConfigs = providers.filter((p) => p.provider === provider);
    const firstConfig = existingConfigs[0];
    const hasApiKey = existingConfigs.some((c) => c.status === 'connected');
    return {
      provider,
      status: hasApiKey ? ('connected' as const) : ('disconnected' as const),
      baseUrl: firstConfig?.baseUrl ?? '',
      baseUrlAnthropic: firstConfig?.baseUrlAnthropic ?? '',
      configCount: existingConfigs.filter((c) => c.status === 'connected')
        .length,
      configId: provider + '-new',
    } as ProviderSummary;
  });

  return (
    <div className="all-providers-page">
      {notification && (
        <TopNotification
          message={notification.message}
          type={notification.type}
          onDismiss={() => setNotification(null)}
        />
      )}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        title={t('common.confirmDelete')}
        message={
          (deleteTarget?.models?.length ?? 0) > 0
            ? t('common.followingRoutingModelsWillBeDeleted')
            : t('common.deleteConfirmMessage')
        }
        models={deleteTarget?.models ?? []}
        onConfirm={async () => {
          if (deleteTarget) {
            try {
              await deleteProviderConfig(
                activeCategory,
                deleteTarget.provider,
                deleteTarget.configId
              );
              setShowDeleteDialog(false);
              setDeleteTarget(null);
              const [providersRes, routingRes] = await Promise.all([
                listProviderSummaries(activeCategory),
                listRouting(activeCategory),
              ]);
              setProviders(providersRes.providers);
              setRouting(routingRes.routing);
            } catch (e: any) {
              setError(e?.message ?? String(e));
            }
          }
        }}
        onCancel={() => {
          setShowDeleteDialog(false);
          setDeleteTarget(null);
        }}
      />
      <button className="back-btn" onClick={onBack}>
        ← {t('common.back')}
      </button>

      <div className="category-content-wrapper">
        <div className="category-content">
          {error ? <div className="error">{error}</div> : null}
          {loading ? <div className="muted">{t('common.loading')}</div> : null}

          {!loading && providers.length === 0 && !error && (
            <div className="notice">{t('common.noProvidersConfigured')}</div>
          )}

          {!loading && providers.length > 0 && (
            <>
              {connectedProviders.length > 0 && (
                <div className="providers-section">
                  <h2 className="section-title">
                    {t('common.statusConnected')}
                  </h2>
                  <div className="provider-list">
                    {connectedProviders.map((p) => {
                      const isExpanded = expandedProviders.has(
                        p.configId ?? p.provider
                      );
                      const routedModels =
                        routedProviderModels.get(
                          `${p.provider}:${p.configId}`
                        ) ?? [];
                      return (
                        <div
                          className="provider-list-item"
                          key={p.configId ?? p.provider}
                        >
                          <div className="provider-list-row">
                            <div className="provider-info">
                              <span className="provider-name">
                                {getProviderDisplayName(p.provider, t)}
                              </span>
                              {p.remark && (
                                <span className="provider-remark">
                                  {' '}
                                  ({p.remark})
                                </span>
                              )}
                              <span className="status-badge status-badge--connected">
                                {t('common.statusConnected')}
                              </span>
                              {routedModels.length > 0 && (
                                <span className="routed-badge">
                                  {t('common.modelCountInRouting', {
                                    count: routedModels.length,
                                    plural: routedModels.length > 1 ? 's' : '',
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="provider-actions">
                              <button
                                className="expand-btn"
                                onClick={() =>
                                  toggleExpanded(p.configId ?? p.provider)
                                }
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
                <div className="providers-section">
                  <h2 className="section-title">{t('common.notConfigured')}</h2>
                  <div className="provider-list">
                    {disconnectedProviders.map((p) => {
                      const isExpanded = expandedProviders.has(
                        p.configId ?? p.provider
                      );
                      return (
                        <div
                          className="provider-list-item"
                          key={p.configId ?? p.provider}
                        >
                          <div className="provider-list-row">
                            <div className="provider-info">
                              <span className="provider-name">
                                {getProviderDisplayName(p.provider, t)}
                              </span>
                              {p.configCount > 0 && (
                                <span
                                  className="routed-badge"
                                  style={{ marginLeft: 8 }}
                                >
                                  {t('common.configCount', {
                                    count: p.configCount,
                                  })}
                                </span>
                              )}
                            </div>
                            <div className="provider-actions">
                              <button
                                className="expand-btn"
                                onClick={() =>
                                  toggleExpanded(p.configId ?? p.provider)
                                }
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
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showModelDialog && modelDialogProvider && modelDialogConfigId && (
        <div className="dialog-overlay" onClick={closeModelDialog}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-header">
              <h3>
                {t('common.selectModels', { provider: modelDialogProvider })}
              </h3>
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
                      {t('common.noModelsAvailable', {
                        category: activeCategory,
                        provider: modelDialogProvider,
                      })}
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
                      <span className="muted">
                        {' '}
                        {t('common.alreadyInRouting')}
                      </span>
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
                  : t('common.addModels', {
                      count: selectedModels.length,
                      plural: selectedModels.length > 1 ? 's' : '',
                    })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
