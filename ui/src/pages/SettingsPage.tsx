import React, { useEffect, useState } from 'react';
import { setAdminToken, getConfig, deleteConfig } from '../api/adminClient';

const ADMIN_TOKEN_KEY = 'adminToken';

function getStoredToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

export default function SettingsPage() {
  const [token, setTokenState] = useState('');
  const [saved, setSaved] = useState(false);
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    setTokenState(getStoredToken());
    loadConfig();
  }, []);

  async function loadConfig() {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const res = await getConfig();
      setConfig(res.config);
    } catch (e: any) {
      setConfigError(e?.message ?? String(e));
    } finally {
      setConfigLoading(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="card">
        <div className="card__title">Admin Authentication</div>

        <div className="grid">
          <div className="field">
            <div className="label">ADMIN_TOKEN (optional)</div>
            <input
              value={token}
              placeholder="Paste token to authorize /admin/* calls"
              onChange={(e) => {
                setTokenState(e.target.value);
                setSaved(false);
              }}
            />
          </div>

          <div className="row">
            <button
              className="primary"
              disabled={saved}
              onClick={() => {
                setAdminToken(token.trim());
                setSaved(true);
              }}
            >
              Save
            </button>

            <button
              disabled={!token}
              onClick={() => {
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                setTokenState('');
                setSaved(false);
              }}
            >
              Clear
            </button>

            {saved ? (
              <div className="muted">Saved.</div>
            ) : (
              <div className="muted" />
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card__title">Gateway Config</div>

        {configLoading && <div className="muted">Loading...</div>}
        {configError && <div className="error">{configError}</div>}

        {!configLoading && !configError && config && (
          <div className="muted" style={{ marginBottom: 10 }}>
            Config is active (auto-generated from providers).
          </div>
        )}
        {!configLoading && !configError && !config && (
          <div className="muted" style={{ marginBottom: 10 }}>
            No active config. Add providers and save to generate.
          </div>
        )}

        <div className="row">
          <button
            className="secondary"
            disabled={configLoading}
            onClick={loadConfig}
          >
            Refresh
          </button>
          {config && (
            <button
              className="secondary"
              disabled={configLoading}
              onClick={async () => {
                try {
                  await deleteConfig();
                  setConfig(null);
                } catch (e: any) {
                  setConfigError(e?.message ?? String(e));
                }
              }}
            >
              Delete Config
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
