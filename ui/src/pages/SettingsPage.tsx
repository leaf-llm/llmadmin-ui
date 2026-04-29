import React, { useEffect, useState } from 'react';
import { getConfig, deleteConfig } from '../api/adminClient';

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
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
