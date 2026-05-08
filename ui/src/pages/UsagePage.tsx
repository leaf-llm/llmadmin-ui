import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getProviders,
  ProviderId,
  getMetrics,
  MetricsResponse,
} from '../api/adminClient';
import DatePicker from '../components/DatePicker';
import Select from '../components/Select';

const pad2 = (n: number) => String(n).padStart(2, '0');
function toISODate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export default function UsagePage() {
  const { t } = useTranslation();
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
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    async function loadMetrics() {
      if (!from || !to) return;
      setLoading(true);
      setError(null);
      try {
        const res = await getMetrics({ from, to });
        if (cancelled) return;
        setMetrics(res);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadMetrics();
    return () => {
      cancelled = true;
    };
  }, [from, to]);

  const totals = metrics?.totals;

  return (
    <div>
      {error ? <div className="error">{error}</div> : null}

      <div className="card">
        <div className="card__title">{t('common.query')}</div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <DatePicker
            label={t('common.from')}
            value={from}
            onChange={setFrom}
          />
          <DatePicker
            label={t('common.to')}
            value={to}
            onChange={setTo}
          />
          <Select
            label={t('common.provider')}
            value={provider}
            onChange={(v) => setProvider(v as ProviderId | 'all')}
            placeholder={t('common.all')}
            options={[
              { value: 'all', label: t('common.all') },
              ...(loadingProviders ? [] : providers.map((p) => ({ value: p, label: p })))
            ]}
          />
          <button
            className="primary"
            disabled={loading || !from || !to}
            onClick={async () => {
              setLoading(true);
              setError(null);
              try {
                const res = await getMetrics({ from, to });
                setMetrics(res);
              } catch (e: any) {
                setError(e?.message ?? String(e));
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? t('common.loading') : t('common.loadUsage')}
          </button>
        </div>
      </div>

      {metrics ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__title">{t('common.totalRequests')}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {totals?.totalRequests ?? 0}
              </div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__title">{t('common.successCount')}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-success, green)' }}>
                {totals?.successCount ?? 0}
              </div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__title">{t('common.failureCount')}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-error, red)' }}>
                {totals?.failureCount ?? 0}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__title">{t('common.inputTokens')}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {totals?.inputTokens?.toLocaleString() ?? 0}
              </div>
            </div>
            <div className="card" style={{ flex: 1 }}>
              <div className="card__title">{t('common.outputTokens')}</div>
              <div style={{ fontSize: 22, fontWeight: 800 }}>
                {totals?.outputTokens?.toLocaleString() ?? 0}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__title">{t('common.usageByProvider')}</div>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th>
                  <th>{t('common.provider')}</th>
                  <th>{t('common.totalRequests')}</th>
                  <th>{t('common.successCount')}</th>
                  <th>{t('common.failureCount')}</th>
                  <th>{t('common.inputTokens')}</th>
                  <th>{t('common.outputTokens')}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.daily.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  metrics.daily.map((row) => {
                    if (provider !== 'all' && row.provider !== provider) {
                      return null;
                    }
                    return (
                      <tr key={`${row.date}-${row.provider}`}>
                        <td>{row.date}</td>
                        <td>{row.provider}</td>
                        <td>{row.totalRequests}</td>
                        <td style={{ color: 'var(--color-success, green)' }}>{row.successCount}</td>
                        <td style={{ color: 'var(--color-error, red)' }}>{row.failureCount}</td>
                        <td>{row.inputTokens?.toLocaleString() ?? 0}</td>
                        <td>{row.outputTokens?.toLocaleString() ?? 0}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
