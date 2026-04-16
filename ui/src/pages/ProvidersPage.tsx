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
            organizationId: p.organizationId ?? '',
            projectId: p.projectId ?? '',
            budgetUSD: p.budgetUSD ?? undefined,
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

      <div className="grid grid-2">
        {providers.map((p) => {
          const d = drafts[p.provider] ?? {};
          return (
            <div className="card" key={p.provider}>
              <div className="card__title">
                {p.provider}{' '}
                <span className="muted" style={{ fontWeight: 400 }}>
                  ({p.status ?? 'unknown'})
                </span>
              </div>

              <div className="grid" style={{ gap: 10 }}>
                <div className="field">
                  <div className="label">API Key (update)</div>
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
                  <div className="label">Organization ID (optional)</div>
                  <input
                    value={d.organizationId ?? ''}
                    placeholder="e.g. org_xxx"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrafts((prev) => ({
                        ...prev,
                        [p.provider]: {
                          ...(prev[p.provider] ?? {}),
                          organizationId: val,
                        },
                      }));
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Project ID (optional)</div>
                  <input
                    value={d.projectId ?? ''}
                    placeholder="e.g. proj_xxx"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDrafts((prev) => ({
                        ...prev,
                        [p.provider]: {
                          ...(prev[p.provider] ?? {}),
                          projectId: val,
                        },
                      }));
                    }}
                  />
                </div>

                <div className="field">
                  <div className="label">Budget USD (optional)</div>
                  <input
                    type="number"
                    value={d.budgetUSD ?? ''}
                    placeholder="e.g. 1000"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const val = raw === '' ? undefined : Number(raw);
                      setDrafts((prev) => ({
                        ...prev,
                        [p.provider]: {
                          ...(prev[p.provider] ?? {}),
                          budgetUSD: val,
                        },
                      }));
                    }}
                  />
                </div>

                <div className="row">
                  <button
                    className="primary"
                    disabled={!canSave || savingProvider === p.provider}
                    onClick={async () => {
                      setSavingProvider(p.provider);
                      try {
                        const draft = drafts[p.provider];
                        const req: ProviderUpdateRequest = {
                          apiKey: draft?.apiKey ? draft.apiKey : undefined,
                          organizationId: draft?.organizationId || undefined,
                          projectId: draft?.projectId || undefined,
                          budgetUSD: draft?.budgetUSD,
                        };
                        await updateProvider(p.provider, req);
                        // Re-fetch to show new masked key/status.
                        const refreshed = await getProviders();
                        setProviders(refreshed.providers);
                        const nextDrafts: Record<string, Draft> = {};
                        for (const pp of refreshed.providers) {
                          nextDrafts[pp.provider] = {
                            apiKey: undefined,
                            organizationId: pp.organizationId ?? '',
                            projectId: pp.projectId ?? '',
                            budgetUSD: pp.budgetUSD ?? undefined,
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
                  <div className="muted">
                    {p.lastSyncedAt ? `Last sync: ${p.lastSyncedAt}` : ''}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
