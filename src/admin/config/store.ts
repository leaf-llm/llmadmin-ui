import { getRuntimeKey } from 'hono/adapter';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import {
  ProviderId,
  ProviderSummary,
  ProviderStatus,
  ProviderUpdateRequest,
} from '../types';

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'zhipu', // 智谱 GLM
  'dashscope', // 通义千问 Qwen
  'moonshot', // Kimi
  'minimax', // MINIMAX
  'doubao', // 豆包
];

const DEFAULT_BASE_URLS: Partial<Record<ProviderId, string>> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  dashscope: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn',
};

type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  lastSyncedAt?: string;
};

type UiConfigFile = {
  providers: Record<ProviderId, ProviderConfig | undefined>;
};

const CONFIG_FILE_NAME = 'conf.ui.json';

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8)
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function getConfigPath() {
  // In local dev, the process cwd is repository root.
  return path.join(process.cwd(), CONFIG_FILE_NAME);
}

async function loadUiConfig(): Promise<UiConfigFile> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    // Workers runtime has no fs access by default.
    throw new Error('UI config store is only supported in node or bun runtime');
  }

  const configPath = getConfigPath();
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as UiConfigFile;
    return parsed;
  } catch (e: any) {
    // If file does not exist, start with empty providers.
    if (e?.code === 'ENOENT') {
      return { providers: {} };
    }
    throw e;
  }
}

async function saveUiConfig(config: UiConfigFile) {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    return; // silently no-op, config cannot be saved in non-node/bun runtimes
  }
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function listProviderSummaries(): Promise<{
  providers: ProviderSummary[];
}> {
  const config = await loadUiConfig();

  const providers: ProviderSummary[] = SUPPORTED_PROVIDERS.map((provider) => {
    const p = config.providers?.[provider];
    const apiKey = p?.apiKey?.trim();
    const status: ProviderStatus = apiKey ? 'connected' : 'disconnected';

    return {
      provider,
      apiKeyMasked: apiKey ? maskApiKey(apiKey) : undefined,
      baseUrl: p?.baseUrl ?? DEFAULT_BASE_URLS[provider],
      status,
      lastSyncedAt: p?.lastSyncedAt,
    };
  });

  return { providers };
}

export async function upsertProvider(
  provider: ProviderId,
  update: ProviderUpdateRequest
): Promise<{ provider?: ProviderSummary }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  const current = config.providers?.[provider] ?? {};

  const apiKey =
    update.apiKey === undefined
      ? current.apiKey
      : update.apiKey.trim() === ''
        ? undefined
        : update.apiKey.trim();

  const baseUrl =
    update.baseUrl === undefined
      ? current.baseUrl
      : update.baseUrl.trim() || undefined;

  config.providers[provider] = {
    ...current,
    apiKey,
    baseUrl,
  };

  await saveUiConfig(config);

  // Return masked summary.
  const apiKeyMasked = apiKey ? maskApiKey(apiKey) : undefined;
  const status: ProviderStatus = apiKey ? 'connected' : 'disconnected';
  return {
    provider: {
      provider,
      apiKeyMasked,
      baseUrl,
      status,
      lastSyncedAt: config.providers[provider]?.lastSyncedAt,
    },
  };
}

export async function getProviderCredentialsForBilling(
  provider: ProviderId
): Promise<{
  apiKey?: string;
  baseUrl?: string;
  lastSyncedAt?: string;
} | null> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) return null;
  const config = await loadUiConfig();
  const p = config.providers?.[provider];
  if (!p) return null;
  return {
    apiKey: p.apiKey,
    baseUrl: p.baseUrl,
    lastSyncedAt: p.lastSyncedAt,
  };
}
