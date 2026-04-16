import React, { useEffect, useMemo, useState } from 'react';
import {
  getProviders,
  ProviderId,
  UsageByModel,
  UsageResponse,
  getUsage,
} from '../api/adminClient';

const pad2 = (n: number) => String(n).padStart(2, '0');
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function UsagePage() {
  const [providers, setProviders] = useState<ProviderId[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toISODate(d);
  });
  const [to, setTo] = useState(() => toISODate(new Date()));
  const [provider, setProvider] = useState<ProviderId | 'all'>('all');

  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingProviders(true);
      setError(null);
      try {
        const res = await getProviders();
        if (cancelled) return;
        setProviders(res.providers.map((p) => p.provider));
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoadingProviders(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = usage?.totals;

  const byModel: UsageByModel[] = useMemo(() => usage?.byModel ?? [], [usage]);

  return (
    <div>
      <h1 className="page-title">Usage</h1>

      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="card__title">Query</div>

        <div className="grid grid-2">
          <div className="field">
            <div className="label">From</div>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="field">
            <div className="label">To</div>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <div className="field">
            <div className="label">Provider</div>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
            >
              <option value="all">All</option>
              {loadingProviders
                ? null
                : providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
            </select>
          </div>

          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <div className="label">&nbsp;</div>
            <button
              className="primary"
              disabled={loading || !from || !to}
              onClick={async () => {
                setLoading(true);
                setError(null);
                try {
                  const res = await getUsage({
                    provider: provider === 'all' ? undefined : provider,
                    from,
                    to,
                  });
                  setUsage(res);
                } catch (e: any) {
                  setError(e?.message ?? String(e));
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? 'Loading...' : 'Load usage'}
            </button>
          </div>
        </div>
      </div>

      {usage ? (
        <div style={{ marginTop: 14 }}>
          <div className="grid grid-2">
            <div className="card">
              <div className="card__title">Total Cost</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {typeof totals?.costUSD === 'number'
                  ? `$${totals.costUSD.toFixed(4)}`
                  : '—'}
              </div>
            </div>
            <div className="card">
              <div className="card__title">Total Requests</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {typeof totals?.requests === 'number' ? totals.requests : '—'}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 14 }}>
            <div className="card__title">By Model</div>
            <table className="table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Requests</th>
                  <th>Input Tokens</th>
                  <th>Output Tokens</th>
                  <th>Cost (USD)</th>
                </tr>
              </thead>
              <tbody>
                {byModel.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="muted">
                      No data for the selected period.
                    </td>
                  </tr>
                ) : (
                  byModel.map((row, idx) => (
                    <tr key={`${row.model ?? 'unknown'}-${idx}`}>
                      <td>{row.model ?? 'unknown'}</td>
                      <td>
                        {typeof row.requests === 'number' ? row.requests : '—'}
                      </td>
                      <td>
                        {typeof row.inputTokens === 'number'
                          ? row.inputTokens
                          : '—'}
                      </td>
                      <td>
                        {typeof row.outputTokens === 'number'
                          ? row.outputTokens
                          : '—'}
                      </td>
                      <td>
                        {typeof row.costUSD === 'number'
                          ? `$${row.costUSD.toFixed(4)}`
                          : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
