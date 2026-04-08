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
  'azure-openai',
  'groq',
  'mistral',
  'cohere',
  'together-ai',
  'perplexity-ai',
  'bedrock',
];

type ProviderConfig = {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
  lastSyncedAt?: string;
};

type UiConfigFile = {
  providers: Record<ProviderId, ProviderConfig | undefined>;
};

const CONFIG_FILE_NAME = 'conf.ui.json';

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function getConfigPath() {
  // In local dev, the process cwd is repository root.
  return path.join(process.cwd(), CONFIG_FILE_NAME);
}

async function loadUiConfig(): Promise<UiConfigFile> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node') {
    // Workers runtime has no fs access by default.
    throw new Error('UI config store is only supported in node runtime');
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
  if (runtime !== 'node') {
    throw new Error('UI config store is only supported in node runtime');
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
      organizationId: p?.organizationId,
      projectId: p?.projectId,
      budgetUSD: p?.budgetUSD,
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

  const organizationId =
    update.organizationId === undefined ? current.organizationId : update.organizationId.trim() || undefined;
  const projectId =
    update.projectId === undefined ? current.projectId : update.projectId.trim() || undefined;

  const budgetUSD =
    update.budgetUSD === undefined || Number.isNaN(update.budgetUSD)
      ? current.budgetUSD
      : update.budgetUSD;

  config.providers[provider] = {
    ...current,
    apiKey,
    organizationId,
    projectId,
    budgetUSD,
  };

  await saveUiConfig(config);

  // Return masked summary.
  const apiKeyMasked = apiKey ? maskApiKey(apiKey) : undefined;
  const status: ProviderStatus = apiKey ? 'connected' : 'disconnected';
  return {
    provider: {
      provider,
      apiKeyMasked,
      organizationId,
      projectId,
      budgetUSD,
      status,
      lastSyncedAt: config.providers[provider]?.lastSyncedAt,
    },
  };
}

export async function getProviderCredentialsForBilling(
  provider: ProviderId
): Promise<{
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
  lastSyncedAt?: string;
} | null> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) return null;
  const config = await loadUiConfig();
  const p = config.providers?.[provider];
  if (!p) return null;
  return {
    apiKey: p.apiKey,
    organizationId: p.organizationId,
    projectId: p.projectId,
    budgetUSD: p.budgetUSD,
    lastSyncedAt: p.lastSyncedAt,
  };
}

