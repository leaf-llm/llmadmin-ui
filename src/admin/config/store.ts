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
  id: string;
  apiKey?: string;
  baseUrl?: string;
  lastSyncedAt?: string;
  remark?: string;
};

type CategoryConfig = {
  providers: Record<ProviderId, ProviderConfig[]>;
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
      // Convert legacy single-config providers to array format
      const migratedProviders: Record<ProviderId, ProviderConfig[]> = {};
      for (const [providerId, p] of Object.entries(legacy.providers)) {
        if (p) {
          migratedProviders[providerId as ProviderId] = [
            {
              id:
                Date.now().toString(36) +
                Math.random().toString(36).slice(2, 6),
              ...p,
            },
          ];
        }
      }
      const migrated: UiConfigFile = {
        text: {
          providers: migratedProviders,
          primaryProvider: legacy.primaryProvider,
          routing: [],
          userConfig: legacy.userConfig,
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

  // Return one entry per config, so the same provider can appear multiple times
  const providers: ProviderSummary[] = [];

  for (const provider of SUPPORTED_PROVIDERS) {
    // Collect configs from ALL categories to show all provider configs
    const allConfigs: ProviderConfig[] = [];
    for (const cat of MODEL_CATEGORIES) {
      const catConfigs = config[cat]?.providers?.[provider] ?? [];
      allConfigs.push(...catConfigs);
    }

    // Provider-level status: connected if ANY config has API key
    const hasApiKey = allConfigs.some((c) => c.apiKey?.trim());
    const status: ProviderStatus = hasApiKey ? 'connected' : 'disconnected';

    // Get routing entries for this provider (only from current category)
    const routing =
      categoryConfig?.routing?.filter((r) => r.provider === provider) ?? [];

    if (allConfigs.length === 0) {
      // No configs at all - show as disconnected
      providers.push({
        provider,
        status: 'disconnected',
        baseUrl: DEFAULT_BASE_URLS[provider],
        configCount: 0,
        configId: provider,
      });
    } else {
      // Show each config as a separate entry
      for (const cfg of allConfigs) {
        providers.push({
          provider,
          apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : undefined,
          baseUrl: cfg.baseUrl ?? DEFAULT_BASE_URLS[provider],
          status,
          lastSyncedAt: cfg.lastSyncedAt,
          isPrimary: provider === categoryConfig?.primaryProvider,
          routing: routing.length > 0 ? routing : undefined,
          remark: cfg.remark,
          configCount: allConfigs.length,
          configId: cfg.id,
        });
      }
    }
  }

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

  if (!config[category]) {
    config[category] = createEmptyCategoryConfig();
  }
  if (!config[category].providers) {
    config[category].providers = {};
  }
  if (!config[category].providers[provider]) {
    config[category].providers[provider] = [];
  }

  const apiKey =
    update.apiKey === undefined
      ? undefined
      : update.apiKey.trim() === ''
        ? undefined
        : update.apiKey.trim();

  const baseUrl =
    update.baseUrl === undefined
      ? undefined
      : update.baseUrl.trim() || undefined;

  let savedConfig: ProviderConfig | undefined;

  // If configId is provided and is a real ID (not ending with -new), update existing config
  // If configId ends with -new or is not provided, create new config
  const isNewConfig = !update.configId || update.configId.endsWith('-new');
  if (!isNewConfig && update.configId) {
    const configs = config[category].providers[provider];
    const idx = configs.findIndex((c) => c.id === update.configId);
    if (idx === -1) {
      throw new Error(`Config not found: ${update.configId}`);
    }
    // Update existing config in place
    savedConfig = {
      ...configs[idx],
      apiKey: apiKey !== undefined ? apiKey : configs[idx].apiKey,
      baseUrl: baseUrl !== undefined ? baseUrl : configs[idx].baseUrl,
      lastSyncedAt: new Date().toISOString(),
      remark: update.remark?.trim() || configs[idx].remark,
    };
    config[category].providers[provider][idx] = savedConfig;
  } else {
    const remark =
      update.remark?.trim() ||
      `Config ${config[category].providers[provider].length + 1}`;

    const newConfig: ProviderConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      apiKey,
      baseUrl,
      lastSyncedAt: new Date().toISOString(),
      remark,
    };

    config[category].providers[provider].push(newConfig);
    savedConfig = newConfig;
  }

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
  const apiKeyMasked = savedConfig?.apiKey
    ? maskApiKey(savedConfig.apiKey)
    : undefined;
  const status: ProviderStatus = savedConfig?.apiKey
    ? 'connected'
    : 'disconnected';
  return {
    provider: {
      provider,
      apiKeyMasked,
      baseUrl: savedConfig?.baseUrl,
      status,
      lastSyncedAt: savedConfig?.lastSyncedAt,
      isPrimary: config[category].primaryProvider === provider,
      remark: savedConfig?.remark,
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
  const configs = config[category]?.providers?.[provider] ?? [];
  const hasApiKey = configs.some((c) => c.apiKey?.trim());

  // Verify provider is connected (has apiKey)
  if (!hasApiKey) {
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
  // Use first config entry for billing - iterate through categories to find this provider
  for (const cat of MODEL_CATEGORIES) {
    const configs = config[cat]?.providers?.[provider];
    const p = configs?.[0];
    if (p) {
      return {
        apiKey: p.apiKey,
        baseUrl: p.baseUrl,
        lastSyncedAt: p.lastSyncedAt,
      };
    }
  }
  return null;
}
