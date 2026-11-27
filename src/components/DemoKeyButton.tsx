import React, { useEffect, useState } from 'react';
import {
  type DemoSessionInfo,
  fetchDemoSession,
  generateDemoKey,
  resetDemoSession,
  revokeDemoKey,
} from '../api/demo';

/**
 * Demo-only header control: hands the visitor their own sandbox key.
 * Renders nothing outside demo mode.
 */
export default function DemoKeyButton() {
  const [info, setInfo] = useState<DemoSessionInfo | null>(null);
  const [open, setOpen] = useState(
    () =>
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).has('key')
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<'key' | 'url' | ''>('');

  useEffect(() => {
    fetchDemoSession().then(setInfo);
  }, []);

  if (!info) return null;

  const copy = async (value: string, kind: 'key' | 'url') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(''), 1500);
    } catch {
      /* clipboard can be unavailable on http origins */
    }
  };

  const handleGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      const generated = await generateDemoKey();
      const next = await fetchDemoSession();
      if (next) setInfo({ ...next, apiKey: generated.apiKey });
    } catch (e: any) {
      setError(e?.message || '生成失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    setError('');
    try {
      await revokeDemoKey();
      const next = await fetchDemoSession();
      if (next) setInfo(next);
    } catch (e: any) {
      setError(e?.message || '操作失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('重置后，演示配置会恢复为初始状态（你的 Key 不受影响）。继续？')) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next = await resetDemoSession();
      setInfo({ ...next, apiKey: info.apiKey });
    } catch (e: any) {
      setError(e?.message || '重置失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const curl = info.apiKey
    ? `curl ${info.gatewayUrl}/chat/completions \\\n  -H "Authorization: Bearer ${info.apiKey}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"demo-fast","messages":[{"role":"user","content":"你好"}]}'`
    : '';

  return (
    <>
      <button className="lang-toggle" onClick={() => setOpen(true)} title="演示 API Key">
        {info.hasKey ? '演示 Key' : '获取 Demo Key'}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              color: '#151c27',
              width: 'min(560px, calc(100vw - 32px))',
              borderRadius: 16,
              padding: '24px 24px 20px',
              boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
              maxHeight: 'calc(100vh - 64px)',
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>演示环境 API Key</div>
                <div style={{ fontSize: 13, color: '#5c5f5e', marginTop: 4 }}>
                  每个访客一个独立的沙盒，刷新页面不会丢失；上游是内置 Mock
                  模型，不消耗真实额度。
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="关闭"
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: '#5c5f5e',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 16,
                fontSize: 13,
                color: '#3b4238',
              }}
            >
              <span>
                请求额度 <strong>{info.requestsRemaining}</strong> / {info.limits.maxRequests}
              </span>
            </div>

            {error && (
              <div style={{ marginTop: 12, color: '#b42318', fontSize: 13 }}>{error}</div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#5c5f5e', marginBottom: 6 }}>网关地址</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: '#f4f6fb',
                  border: '1px solid #e1e5ee',
                  borderRadius: 10,
                  padding: '8px 12px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 13,
                }}
              >
                <span style={{ flex: 1, wordBreak: 'break-all' }}>{info.gatewayUrl}</span>
                <button
                  onClick={() => copy(info.gatewayUrl, 'url')}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2d5a27', fontSize: 12 }}
                >
                  {copied === 'url' ? '已复制' : '复制'}
                </button>
              </div>
            </div>

            {info.hasKey && info.apiKey ? (
              <>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#5c5f5e', marginBottom: 6 }}>你的密钥</div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: '#f4f6fb',
                      border: '1px solid #e1e5ee',
                      borderRadius: 10,
                      padding: '8px 12px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flex: 1, wordBreak: 'break-all' }}>{info.apiKey}</span>
                    <button
                      onClick={() => copy(info.apiKey as string, 'key')}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#2d5a27', fontSize: 12 }}
                    >
                      {copied === 'key' ? '已复制' : '复制'}
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#5c5f5e', marginBottom: 6 }}>试一下</div>
                  <pre
                    style={{
                      margin: 0,
                      background: '#151c27',
                      color: '#e7edf7',
                      borderRadius: 10,
                      padding: 12,
                      fontSize: 12,
                      lineHeight: 1.5,
                      overflow: 'auto',
                    }}
                  >
                    {curl}
                  </pre>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 13, color: '#3b4238', lineHeight: 1.6 }}>
                  生成后可以把它填进任何兼容 OpenAI / Anthropic 协议的客户端，比如：
                  <code style={{ background: '#f4f6fb', padding: '1px 6px', borderRadius: 6 }}>
                    ANTHROPIC_BASE_URL={info.gatewayUrl.replace(/\/v1$/, '')}
                  </code>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 20 }}>
              {!info.hasKey ? (
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  style={{
                    border: 'none',
                    borderRadius: 10,
                    background: '#b45309',
                    color: '#fff',
                    padding: '10px 16px',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  {busy ? '生成中…' : '生成演示 Key'}
                </button>
              ) : (
                <button
                  onClick={handleGenerate}
                  disabled={busy}
                  style={{
                    border: '1px solid #e1e5ee',
                    borderRadius: 10,
                    background: '#fff',
                    padding: '10px 16px',
                    fontSize: 14,
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  重新生成
                </button>
              )}
              <button
                onClick={handleReset}
                disabled={busy}
                style={{
                  border: '1px solid #e1e5ee',
                  borderRadius: 10,
                  background: '#fff',
                  padding: '10px 16px',
                  fontSize: 14,
                  cursor: busy ? 'default' : 'pointer',
                }}
              >
                重置演示配置
              </button>
              {info.hasKey && (
                <button
                  onClick={handleRevoke}
                  disabled={busy}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#b42318',
                    padding: '10px 8px',
                    fontSize: 13,
                    cursor: busy ? 'default' : 'pointer',
                  }}
                >
                  作废 Key
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
