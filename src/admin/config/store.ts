import { getRuntimeKey } from 'hono/adapter';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

import {
  ModelCategory,
  MODEL_CATEGORIES,
  ProviderId,
  ProviderSummary,
  ProviderStatus,
  ProviderUpdateRequest,
  RoutingEntry,
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
  minimax: 'https://api.minimaxi.com/anthropic',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
};

type ProviderConfig = {
  apiKey?: string;
  baseUrl?: string;
  lastSyncedAt?: string;
};

type CategoryConfig = {
  providers: Record<ProviderId, ProviderConfig | undefined>;
  primaryProvider: ProviderId | null;
  routing: RoutingEntry[];
  userConfig: Record<string, unknown> | null;
};

type UiConfigFile = Record<ModelCategory, CategoryConfig>;

// Legacy format for migration
type LegacyUiConfigFile = {
  providers: Record<ProviderId, ProviderConfig | undefined>;
  primaryProvider: ProviderId | null;
  userConfig: Record<string, unknown> | null;
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

export async function loadUiConfig(): Promise<UiConfigFile> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    // Workers runtime has no fs access by default.
    throw new Error('UI config store is only supported in node or bun runtime');
  }

  const configPath = getConfigPath();
  try {
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Check if it's legacy format (has providers directly) or new format (keyed by category)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'providers' in parsed &&
      !('text' in parsed)
    ) {
      // Legacy format - migrate to per-category structure
      const legacy = parsed as LegacyUiConfigFile;
      const migrated: UiConfigFile = {
        text: { ...legacy, routing: [] },
        image: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        video: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        audio: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        mcp: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
      };
      // Save migrated format back
      await saveUiConfig(migrated);
      return migrated;
    }

    return parsed as UiConfigFile;
  } catch (e: any) {
    // If file does not exist, start with empty providers.
    if (e?.code === 'ENOENT') {
      // Return default per-category structure
      const defaultConfig: UiConfigFile = {
        text: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        image: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        video: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        audio: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
        mcp: {
          providers: {},
          primaryProvider: null,
          routing: [],
          userConfig: null,
        },
      };
      return defaultConfig;
    }
    throw e;
  }
}

function createEmptyCategoryConfig(): CategoryConfig {
  return {
    providers: {},
    primaryProvider: null,
    routing: [],
    userConfig: null,
  };
}

async function saveUiConfig(config: UiConfigFile) {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    return; // silently no-op, config cannot be saved in non-node/bun runtimes
  }
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function loadUserConfig(
  category: ModelCategory
): Promise<Record<string, unknown> | null> {
  const config = await loadUiConfig();
  return config[category]?.userConfig ?? null;
}

export async function saveUserConfig(
  category: ModelCategory,
  config: Record<string, unknown> | null
): Promise<void> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    return;
  }
  const current = await loadUiConfig();
  current[category].userConfig = config;
  await saveUiConfig(current);
}

export async function listProviderSummaries(category: ModelCategory): Promise<{
  providers: ProviderSummary[];
}> {
  const config = await loadUiConfig();
  const categoryConfig = config[category];

  const providers: ProviderSummary[] = SUPPORTED_PROVIDERS.map((provider) => {
    const p = categoryConfig?.providers?.[provider];
    const apiKey = p?.apiKey?.trim();
    const status: ProviderStatus = apiKey ? 'connected' : 'disconnected';

    // Get routing entries for this provider
    const routing =
      categoryConfig?.routing?.filter((r) => r.provider === provider) ?? [];

    return {
      provider,
      apiKeyMasked: apiKey ? maskApiKey(apiKey) : undefined,
      baseUrl: p?.baseUrl ?? DEFAULT_BASE_URLS[provider],
      status,
      lastSyncedAt: p?.lastSyncedAt,
      isPrimary: provider === categoryConfig?.primaryProvider,
      routing: routing.length > 0 ? routing : undefined,
    };
  });

  return { providers };
}

export async function upsertProvider(
  category: ModelCategory,
  provider: ProviderId,
  update: ProviderUpdateRequest
): Promise<{ provider?: ProviderSummary }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  const categoryConfig = config[category];
  const current = categoryConfig?.providers?.[provider] ?? {};

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

  if (!config[category]) {
    config[category] = createEmptyCategoryConfig();
  }
  if (!config[category].providers) {
    config[category].providers = {};
  }
  config[category].providers[provider] = {
    ...current,
    apiKey,
    baseUrl,
  };

  // Handle setAsPrimary
  if (update.setAsPrimary === true) {
    // Verify provider is connected (has apiKey)
    if (!apiKey) {
      throw new Error('Cannot set inactive provider as primary');
    }
    config[category].primaryProvider = provider;
  } else if (
    update.setAsPrimary === false &&
    config[category].primaryProvider === provider
  ) {
    config[category].primaryProvider = null;
  }

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
      lastSyncedAt: config[category].providers[provider]?.lastSyncedAt,
      isPrimary: config[category].primaryProvider === provider,
    },
  };
}

export async function setPrimaryProvider(
  category: ModelCategory,
  provider: ProviderId
): Promise<{ primaryProvider: ProviderId | null }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  const p = config[category]?.providers?.[provider];

  // Verify provider is connected (has apiKey)
  if (!p?.apiKey?.trim()) {
    throw new Error('Cannot set inactive provider as primary');
  }

  config[category].primaryProvider = provider;
  await saveUiConfig(config);

  return { primaryProvider: config[category].primaryProvider };
}

export async function unsetPrimaryProvider(category: ModelCategory): Promise<{
  primaryProvider: null;
}> {
  const config = await loadUiConfig();
  config[category].primaryProvider = null;
  await saveUiConfig(config);

  return { primaryProvider: null };
}

export async function listRouting(category: ModelCategory): Promise<{
  routing: RoutingEntry[];
}> {
  const config = await loadUiConfig();
  return { routing: config[category]?.routing ?? [] };
}

export async function addToRouting(
  category: ModelCategory,
  provider: ProviderId,
  model: string,
  isPrimary?: boolean
): Promise<{ routing: RoutingEntry[] }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  if (!config[category].routing) {
    config[category].routing = [];
  }

  // Check if already exists
  const exists = config[category].routing.some(
    (r) => r.provider === provider && r.model === model
  );
  if (!exists) {
    config[category].routing.push({ provider, model, isPrimary });
  }

  await saveUiConfig(config);
  return { routing: config[category].routing };
}

export async function removeFromRouting(
  category: ModelCategory,
  provider: ProviderId,
  model: string
): Promise<{ routing: RoutingEntry[] }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  if (!config[category].routing) {
    config[category].routing = [];
  }

  config[category].routing = config[category].routing.filter(
    (r) => !(r.provider === provider && r.model === model)
  );

  await saveUiConfig(config);
  return { routing: config[category].routing };
}

export async function updateRoutingPrimary(
  category: ModelCategory,
  provider: ProviderId,
  model: string,
  isPrimary: boolean
): Promise<{ routing: RoutingEntry[] }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  if (!config[category].routing) {
    config[category].routing = [];
  }

  const entry = config[category].routing.find(
    (r) => r.provider === provider && r.model === model
  );
  if (entry) {
    entry.isPrimary = isPrimary;
  } else {
    throw new Error('Routing entry not found');
  }

  await saveUiConfig(config);
  return { routing: config[category].routing };
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
