import React, { useEffect, useState } from 'react';
import { getApiBaseUrl } from '../api/config';
import {
  AdminAuthError,
  adminFetch,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
} from '../api/adminClient';

type Status = 'checking' | 'login' | 'authenticated' | 'error';

type Health = {
  ok?: boolean;
  authRequired?: boolean;
  setupRequired?: boolean;
  message?: string;
};

/**
 * Web-only gate: the desktop app talks to a trusted localhost process, but a
 * public deployment needs an admin token. The gate validates the token before
 * rendering the admin UI so pages never flash empty data on a 401.
 */
export default function AdminAuthGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<Status>('checking');
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [health, setHealth] = useState<Health | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [demoExpired, setDemoExpired] = useState(false);

  const validate = async (candidate?: string) => {
    try {
      await adminFetch('/admin/config', { method: 'GET' });
      setStatus('authenticated');
      setError('');
    } catch (e: any) {
      if (e instanceof AdminAuthError) {
        if (candidate) {
          clearAdminToken();
          setError('Token 无效，请检查后重试。');
          setStatus('login');
        } else {
          setStatus('login');
        }
        return;
      }
      setError(e?.message || '无法连接管理端');
      setStatus('error');
    }
  };

  const check = async () => {
    setStatus('checking');
    setError('');
    try {
      // Demo mode: the session cookie is the credential, so there is no token
      // to type. An expired demo session is reported instead of the login form.
      const demoRes = await fetch(`${getApiBaseUrl()}/admin/session`, {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (demoRes.ok) {
        setStatus('authenticated');
        return;
      }
      if (demoRes.status === 401) {
        const body = await demoRes.json().catch(() => null);
        if (body?.code === 'demo_session_required') {
          setDemoExpired(true);
          setError(
            '没有找到演示会话（可能已过期或还没进入过 /demo）。点击下面按钮重新进入沙盒。'
          );
          setStatus('error');
          return;
        }
      }

      const res = await fetch(`${getApiBaseUrl()}/admin/health`, {
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as Health;
      setHealth(data);
      if (!res.ok) {
        setError(data?.message || `管理端不可用 (HTTP ${res.status})`);
        setStatus('error');
        return;
      }
      if (data.setupRequired) {
        setError(
          '服务端没有配置 ADMIN_TOKEN。请在部署平台的环境变量中设置后重启。'
        );
        setStatus('error');
        return;
      }
      if (!data.authRequired) {
        setStatus('authenticated');
        return;
      }
      if (!getAdminToken()) {
        setStatus('login');
        return;
      }
      await validate();
    } catch (e: any) {
      setError(e?.message || '无法连接管理端');
      setStatus('error');
    }
  };

  useEffect(() => {
    void check();
    const onUnauthorized = () => {
      clearAdminToken();
      setStatus('login');
    };
    const onLogout = () => {
      clearAdminToken();
      setToken('');
      setStatus('login');
    };
    window.addEventListener('llmadmin:unauthorized', onUnauthorized);
    window.addEventListener('llmadmin:logout', onLogout);
    return () => {
      window.removeEventListener('llmadmin:unauthorized', onUnauthorized);
      window.removeEventListener('llmadmin:logout', onLogout);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) {
      setError('请输入管理端 token');
      return;
    }
    setSubmitting(true);
    setError('');
    setAdminToken(trimmed);
    await validate(trimmed);
    setSubmitting(false);
  };

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  if (status === 'checking') {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <div style={styles.brand}>LLM Admin</div>
          <div style={styles.muted}>正在连接管理端…</div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.center}>
      <form style={styles.card} onSubmit={submit}>
        <div style={styles.brand}>LLM Admin</div>
        <div style={styles.muted}>
          {status === 'login'
            ? '请输入 ADMIN_TOKEN 以进入管理后台'
            : '管理端暂时不可用'}
        </div>

        {status === 'login' && (
          <>
            <input
              style={styles.input}
              type="password"
              autoFocus
              autoComplete="current-password"
              placeholder="ADMIN_TOKEN"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <button style={styles.button} type="submit" disabled={submitting}>
              {submitting ? '验证中…' : '进入'}
            </button>
            <div style={styles.hint}>
              token 由部署平台生成（Render Dashboard → Environment →
              ADMIN_TOKEN）。仅保存在当前浏览器标签页的 sessionStorage。
            </div>
          </>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {status === 'error' && demoExpired && (
          <a
            style={{ ...styles.button, textAlign: 'center', textDecoration: 'none' }}
            href="/demo"
          >
            进入演示沙盒
          </a>
        )}

        {status === 'error' && (
          <button style={styles.button} type="button" onClick={() => void check()}>
            重试
          </button>
        )}

        {health?.authRequired === false && status === 'login' && (
          <div style={styles.hint}>
            服务端未启用管理端鉴权。仅建议在本地开发时这样运行。
          </div>
        )}
      </form>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  center: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f6f7f9',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    background: '#fff',
    borderRadius: 14,
    border: '1px solid #e5e7eb',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
    padding: 28,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  brand: { fontSize: 22, fontWeight: 700, color: '#111827' },
  muted: { color: '#6b7280', fontSize: 14, lineHeight: 1.5 },
  input: {
    height: 42,
    borderRadius: 8,
    border: '1px solid #d1d5db',
    padding: '0 12px',
    fontSize: 14,
    outline: 'none',
  },
  button: {
    height: 42,
    borderRadius: 8,
    border: 'none',
    background: '#111827',
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  hint: { color: '#6b7280', fontSize: 12, lineHeight: 1.6 },
  error: {
    background: '#fef2f2',
    border: '1px solid #fecaca',
    color: '#991b1b',
    borderRadius: 8,
    padding: '10px 12px',
    fontSize: 13,
  },
};
