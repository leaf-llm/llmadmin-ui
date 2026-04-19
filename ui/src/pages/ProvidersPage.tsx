import React, { useEffect, useMemo, useState } from 'react';
import {
  getProviders,
  ProviderSummary,
  ProviderUpdateRequest,
  updateProvider,
} from '../api/adminClient';

type Draft = ProviderUpdateRequest & { apiKeyMasked?: string };

export default function ProvidersPage() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProvider, setSavingProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await getProviders();
        if (cancelled) return;
        setProviders(res.providers);
        const nextDrafts: Record<string, Draft> = {};
        for (const p of res.providers) {
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
  }, []);

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

  const renderSaveButton = (p: ProviderSummary) => (
    <button
      className="primary"
      disabled={!canSave || savingProvider === p.provider}
      onClick={async () => {
        setSavingProvider(p.provider);
        try {
          const draft = drafts[p.provider];
          const req: ProviderUpdateRequest = {
            apiKey: draft?.apiKey ? draft.apiKey : undefined,
            baseUrl: draft?.baseUrl || undefined,
          };
          await updateProvider(p.provider, req);
          const refreshed = await getProviders();
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

  return (
    <div>
      <h1 className="page-title">Providers</h1>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="muted">Loading providers...</div> : null}

      {!loading && providers.length === 0 && !error ? (
        <div className="notice">
          No providers configured yet. Add providers in the backend config
          first.
        </div>
      ) : null}

      {(() => {
        const pinnedProviders = providers.filter(
          (p) => p.status === 'connected'
        );
        const otherProviders = providers.filter(
          (p) => p.status !== 'connected'
        );
        return (
          <>
            {pinnedProviders.length > 0 && (
              <div className="pinned-section">
                <h2 className="section-title">Active Providers</h2>
                <div className="provider-list">
                  {pinnedProviders.map((p) => {
                    const isExpanded = expandedProviders.has(p.provider);
                    return (
                      <div className="provider-list-item" key={p.provider}>
                        <div className="provider-list-row">
                          <span className="provider-name">{p.provider}</span>
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpanded(p.provider)}
                          >
                            {isExpanded ? '▲' : '▼'}
                          </button>
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

            <div className="grid">
              {otherProviders.map((p) => (
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
        );
      })()}
    </div>
  );
}
