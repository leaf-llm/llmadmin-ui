import React, { useEffect, useState } from 'react';
import { setAdminToken } from '../api/adminClient';

const ADMIN_TOKEN_KEY = 'adminToken';

function getStoredToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

export default function SettingsPage() {
  const [token, setTokenState] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTokenState(getStoredToken());
  }, []);

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
    </div>
  );
}
