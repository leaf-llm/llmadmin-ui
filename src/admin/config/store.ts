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
import { getDefaultBaseUrls } from '../../data/getDefaultBaseUrls';

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'zhipu', // 智谱 GLM
  'dashscope', // 通义千问 Qwen
  'moonshot', // Kimi
  'minimax', // MINIMAX
  'doubao', // 豆包
  'deepseek',
];

type ProviderConfig = {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  lastSyncedAt?: string;
  remark?: string;
  apiFormat?: 'openai' | 'anthropic';
};

type CategoryConfig = {
  routing: RoutingEntry[];
  userConfig: Record<string, unknown> | null;
};

type UiConfigFile = {
  providers: Record<ProviderId, ProviderConfig[]>;
} & Record<ModelCategory, CategoryConfig>;

const CONFIG_FILE_NAME = 'conf.ui.json';

export function validateUiConfig(config: unknown): UiConfigFile {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Validate top-level structure
  if (
    !('providers' in cfg) ||
    typeof cfg.providers !== 'object' ||
    cfg.providers === null
  ) {
    throw new Error('Missing or invalid "providers" field');
  }

  const providers = cfg.providers as Record<string, unknown>;
  for (const [providerId, providerConfigs] of Object.entries(providers)) {
    if (!SUPPORTED_PROVIDERS.includes(providerId as ProviderId)) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    if (!Array.isArray(providerConfigs)) {
      throw new Error(`Provider "${providerId}" configs must be an array`);
    }
    for (const conf of providerConfigs) {
      if (!conf || typeof conf !== 'object') {
        throw new Error(`Invalid config for provider "${providerId}"`);
      }
      const c = conf as Record<string, unknown>;
      if (typeof c.id !== 'string') {
        throw new Error(`Provider "${providerId}" config missing valid "id"`);
      }
    }
  }

  // Validate categories
  for (const cat of MODEL_CATEGORIES) {
    if (!(cat in cfg)) {
      throw new Error(`Missing category: ${cat}`);
    }
    const catConfig = cfg[cat];
    if (!catConfig || typeof catConfig !== 'object') {
      throw new Error(`Category "${cat}" must be an object`);
    }
    const cc = catConfig as Record<string, unknown>;
    if (!Array.isArray(cc.routing)) {
      throw new Error(`Category "${cat}" missing valid "routing" array`);
    }
    if (cc.userConfig !== null && typeof cc.userConfig !== 'object') {
      throw new Error(`Category "${cat}" "userConfig" must be null or object`);
    }
  }

  return cfg as unknown as UiConfigFile;
}

function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8)
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function getConfigPath() {
  // In local dev, the process cwd is repository root.
  // In compiled bun binary (.app bundle on macOS), cwd is the filesystem root (/)
  // which is read-only, so write to the binary directory instead.
  const isBunBinary =
    typeof import.meta !== 'undefined' && import.meta.url?.startsWith('file:///$bunfs/');
  if (isBunBinary) {
    return path.join(path.dirname(process.execPath), CONFIG_FILE_NAME);
  }
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

    // Check if it's legacy format (has providers per category) or new format (providers at top level)
    if (
      parsed &&
      typeof parsed === 'object' &&
      'providers' in parsed &&
      !('text' in parsed)
    ) {
      // Legacy format - migrate to new structure with top-level providers
      const migratedProviders: Record<ProviderId, ProviderConfig[]> = {};
      // Legacy had providers nested in categories - collect first available config per provider
      for (const cat of MODEL_CATEGORIES) {
        const catProviders = (parsed as any)[cat]?.providers;
        if (catProviders) {
          for (const [providerId, cfgArr] of Object.entries(catProviders)) {
            if (Array.isArray(cfgArr)) {
              for (const cfg of cfgArr) {
                if (cfg && !migratedProviders[providerId as ProviderId]) {
                  migratedProviders[providerId as ProviderId] = [];
                }
                if (
                  cfg &&
                  Array.isArray(migratedProviders[providerId as ProviderId])
                ) {
                  migratedProviders[providerId as ProviderId].push(
                    cfg as ProviderConfig
                  );
                }
              }
            }
          }
        }
      }
      const migrated: UiConfigFile = {
        providers: migratedProviders,
        text: {
          routing: (parsed as any).text?.routing ?? [],
          userConfig: (parsed as any).text?.userConfig ?? null,
        },
        image: {
          routing: (parsed as any).image?.routing ?? [],
          userConfig: null,
        },
        video: {
          routing: (parsed as any).video?.routing ?? [],
          userConfig: null,
        },
        audio: {
          routing: (parsed as any).audio?.routing ?? [],
          userConfig: null,
        },
        mcp: {
          routing: (parsed as any).mcp?.routing ?? [],
          userConfig: null,
        },
      };
      await saveUiConfig(migrated);
      return migrated;
    }

    // Migrate routing entries without configId
    const needsMigration = (parsed as UiConfigFile).text?.routing?.some(
      (r: RoutingEntry) => !r.configId
    );
    if (needsMigration) {
      // Migrate routing entries: add configId from provider's primary config
      for (const cat of MODEL_CATEGORIES) {
        const catRouting = (parsed as UiConfigFile)[cat]?.routing;
        if (catRouting) {
          for (const entry of catRouting as RoutingEntry[]) {
            if (!entry.configId) {
              const providerConfigs = (parsed as UiConfigFile).providers?.[
                entry.provider
              ];
              entry.configId = providerConfigs?.[0]?.id ?? '';
            }
          }
        }
      }
      await saveUiConfig(parsed as UiConfigFile);
    }

    return parsed as UiConfigFile;
  } catch (e: any) {
    // If file does not exist, start with empty providers.
    if (e?.code === 'ENOENT') {
      // Return default structure with providers at top level
      const defaultConfig: UiConfigFile = {
        providers: {},
        text: {
          routing: [],
          userConfig: null,
        },
        image: {
          routing: [],
          userConfig: null,
        },
        video: {
          routing: [],
          userConfig: null,
        },
        audio: {
          routing: [],
          userConfig: null,
        },
        mcp: {
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
    routing: [],
    userConfig: null,
  };
}

export async function saveUiConfig(config: UiConfigFile) {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    return; // silently no-op, config cannot be saved in non-node/bun runtimes
  }
  const configPath = getConfigPath();
  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

export async function syncUserConfigFromRouting(
  category: ModelCategory
): Promise<void> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    return;
  }
  const config = await loadUiConfig();
  const { routing } = config[category];
  const { providers } = config;

  if (!routing || routing.length === 0) {
    config[category].userConfig = null;
    await saveUiConfig(config);
    return;
  }

  // Separate primary and non-primary entries while preserving insertion order within each group
  const primaryEntries = routing.filter((r) => r.isPrimary);
  const nonPrimaryEntries = routing.filter((r) => !r.isPrimary);
  const sortedRouting = [...primaryEntries, ...nonPrimaryEntries];

  // Build target from a routing entry
  function buildTarget(entry: RoutingEntry): Record<string, unknown> | null {
    const cfgs = providers[entry.provider];
    let p: ProviderConfig | undefined;

    if (entry.configId) {
      p = cfgs?.find((c) => c.id === entry.configId);
    }

    p = p || cfgs?.[0];

    if (!p?.apiKey?.trim()) return null;

    const target: Record<string, unknown> = {
      provider: entry.provider,
      api_key: p.apiKey.trim(),
      override_params: {
        model: entry.model,
      },
    };
    if (p.baseUrl?.trim()) {
      target.custom_host = p.baseUrl.trim();
    }
    return target;
  }

  // Build targets: primary entries as individual targets, non-primary wrapped in loadbalance
  const targets: Record<string, unknown>[] = [];

  // Primary entries: individual single targets
  for (const entry of primaryEntries) {
    const target = buildTarget(entry);
    if (target) targets.push(target);
  }

  // Non-primary entries: wrap in loadbalance if multiple, else single target
  if (nonPrimaryEntries.length > 1) {
    const loadbalanceTargets: Record<string, unknown>[] = [];
    for (const entry of nonPrimaryEntries) {
      const target = buildTarget(entry);
      if (target) loadbalanceTargets.push(target);
    }
    if (loadbalanceTargets.length > 0) {
      targets.push({
        strategy: { mode: 'loadbalance' },
        targets: loadbalanceTargets,
      });
    }
  } else if (nonPrimaryEntries.length === 1) {
    const target = buildTarget(nonPrimaryEntries[0]);
    if (target) targets.push(target);
  }

  if (targets.length === 0) {
    config[category].userConfig = null;
    await saveUiConfig(config);
    return;
  }

  // If only one target, no strategy needed
  if (targets.length === 1) {
    config[category].userConfig = targets[0];
    await saveUiConfig(config);
    return;
  }

  // Has primary → fallback strategy with primaries first, non-primaries in loadbalance
  if (primaryEntries.length > 0) {
    config[category].userConfig = {
      strategy: {
        mode: 'fallback',
        on_status_codes: [429, 500, 502, 503, 504],
      },
      targets,
    };
  } else {
    // No primary → loadbalance all
    config[category].userConfig = {
      strategy: {
        mode: 'loadbalance',
      },
      targets,
    };
  }

  await saveUiConfig(config);
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
    // All configs are now at top level
    const allConfigs: ProviderConfig[] = config.providers?.[provider] ?? [];

    // Provider-level status: connected if ANY config has API key
    const hasApiKey = allConfigs.some((c) => c.apiKey?.trim());
    const status: ProviderStatus = hasApiKey ? 'connected' : 'disconnected';

    // Get routing entries for this provider (only from current category)
    const routing =
      categoryConfig?.routing?.filter((r) => r.provider === provider) ?? [];

    // Derive isPrimary from routing - primary is the one with isPrimary=true
    const isPrimary =
      categoryConfig?.routing?.some(
        (r) => r.provider === provider && r.isPrimary
      ) ?? false;

    if (allConfigs.length === 0) {
      // No configs at all - show as disconnected
      providers.push({
        provider,
        status: 'disconnected',
        baseUrl: getDefaultBaseUrls()[provider],
        configCount: 0,
        configId: provider,
        apiFormat: undefined,
      });
    } else {
      // Show each config as a separate entry
      for (const cfg of allConfigs) {
        providers.push({
          provider,
          apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : undefined,
          baseUrl: cfg.baseUrl ?? getDefaultBaseUrls()[provider],
          status,
          lastSyncedAt: cfg.lastSyncedAt,
          isPrimary,
          routing: routing.length > 0 ? routing : undefined,
          remark: cfg.remark,
          configCount: allConfigs.length,
          configId: cfg.id,
          apiFormat: cfg.apiFormat,
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
  if (!config.providers) {
    config.providers = {};
  }
  if (!config.providers[provider]) {
    config.providers[provider] = [];
  }

  const apiKey =
    update.apiKey === undefined
      ? undefined
      : update.apiKey.trim() === ''
        ? undefined
        : update.apiKey.trim();

  const baseUrl =
    update.baseUrl === undefined
      ? getDefaultBaseUrls()[provider]
      : update.baseUrl.trim() || getDefaultBaseUrls()[provider];

  let savedConfig: ProviderConfig | undefined;

  // If configId is provided and is a real ID (not ending with -new), update existing config
  // If configId ends with -new or is not provided, create new config
  const isNewConfig = !update.configId || update.configId.endsWith('-new');
  if (!isNewConfig && update.configId) {
    const configs = config.providers[provider];
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
      apiFormat: update.apiFormat ?? configs[idx].apiFormat,
    };
    config.providers[provider][idx] = savedConfig;
  } else {
    const remark =
      update.remark?.trim() ||
      `Config ${config.providers[provider].length + 1}`;

    const newConfig: ProviderConfig = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      apiKey,
      baseUrl,
      lastSyncedAt: new Date().toISOString(),
      remark,
      apiFormat: update.apiFormat,
    };

    config.providers[provider].push(newConfig);
    savedConfig = newConfig;
  }

  // Handle setAsPrimary - update routing to mark this provider's entries as primary
  if (update.setAsPrimary === true) {
    if (!apiKey) {
      throw new Error('Cannot set inactive provider as primary');
    }
    // Mark all routing entries for this provider as non-primary first
    for (const entry of config[category].routing) {
      if (entry.provider === provider) {
        entry.isPrimary = true;
      } else {
        entry.isPrimary = false;
      }
    }
  } else if (update.setAsPrimary === false) {
    // Unset primary for all entries of this provider
    for (const entry of config[category].routing) {
      if (entry.provider === provider) {
        entry.isPrimary = false;
      }
    }
  }

  await saveUiConfig(config);

  // Sync userConfig from routing
  await syncUserConfigFromRouting(category);

  // Return masked summary.
  const apiKeyMasked = savedConfig?.apiKey
    ? maskApiKey(savedConfig.apiKey)
    : undefined;
  const status: ProviderStatus = savedConfig?.apiKey
    ? 'connected'
    : 'disconnected';
  const isPrimary = config[category].routing.some(
    (r) => r.provider === provider && r.isPrimary
  );
  const configCount = config.providers[provider]?.length ?? 0;
  return {
    provider: {
      provider,
      apiKeyMasked,
      baseUrl: savedConfig?.baseUrl,
      status,
      lastSyncedAt: savedConfig?.lastSyncedAt,
      isPrimary,
      remark: savedConfig?.remark,
      configCount,
      apiFormat: savedConfig?.apiFormat,
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
  const configs = config.providers?.[provider] ?? [];
  const hasApiKey = configs.some((c) => c.apiKey?.trim());

  // Verify provider is connected (has apiKey)
  if (!hasApiKey) {
    throw new Error('Cannot set inactive provider as primary');
  }

  // Update routing: set all entries for this provider as primary, others as non-primary
  for (const entry of config[category].routing) {
    if (entry.provider === provider) {
      entry.isPrimary = true;
    } else {
      entry.isPrimary = false;
    }
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);

  const primaryProvider = config[category].routing.some((r) => r.isPrimary)
    ? provider
    : null;
  return { primaryProvider };
}

export async function unsetPrimaryProvider(category: ModelCategory): Promise<{
  primaryProvider: null;
}> {
  const config = await loadUiConfig();
  // Clear isPrimary on all routing entries
  for (const entry of config[category].routing) {
    entry.isPrimary = false;
  }
  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);

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
  configId: string,
  isPrimary?: boolean
): Promise<{ routing: RoutingEntry[] }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  if (!config[category].routing) {
    config[category].routing = [];
  }

  // Check if already exists (provider + model + configId)
  const exists = config[category].routing.some(
    (r) =>
      r.provider === provider && r.model === model && r.configId === configId
  );
  if (!exists) {
    config[category].routing.push({ provider, model, configId, isPrimary });
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: config[category].routing };
}

export async function removeFromRouting(
  category: ModelCategory,
  provider: ProviderId,
  model: string,
  configId?: string
): Promise<{ routing: RoutingEntry[] }> {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const config = await loadUiConfig();
  if (!config[category].routing) {
    config[category].routing = [];
  }

  if (configId) {
    config[category].routing = config[category].routing.filter(
      (r) =>
        !(
          r.provider === provider &&
          r.model === model &&
          r.configId === configId
        )
    );
  } else {
    config[category].routing = config[category].routing.filter(
      (r) => !(r.provider === provider && r.model === model)
    );
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: config[category].routing };
}

export async function updateRoutingPrimary(
  category: ModelCategory,
  provider: ProviderId,
  model: string,
  configId: string,
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
    (r) =>
      r.provider === provider && r.model === model && r.configId === configId
  );
  if (entry) {
    entry.isPrimary = isPrimary;
  } else {
    throw new Error('Routing entry not found');
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: config[category].routing };
}

export async function moveRoutingEntry(
  category: ModelCategory,
  provider: ProviderId,
  model: string,
  configId: string,
  direction: 'up' | 'down'
): Promise<{ routing: RoutingEntry[] }> {
  const config = await loadUiConfig();
  const routing = config[category].routing;

  const idx = routing.findIndex(
    (r) =>
      r.provider === provider && r.model === model && r.configId === configId
  );

  if (idx === -1) throw new Error('Routing entry not found');

  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;

  if (targetIdx < 0 || targetIdx >= routing.length) {
    return { routing };
  }

  const current = routing[idx];
  const target = routing[targetIdx];

  // Only allow swapping within the same isPrimary group
  if (current.isPrimary !== target.isPrimary) {
    return { routing };
  }

  // Swap positions
  [routing[idx], routing[targetIdx]] = [routing[targetIdx], routing[idx]];

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: [...routing] };
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
  // Use first config entry for billing from top-level providers
  const configs = config.providers?.[provider];
  const p = configs?.[0];
  if (p) {
    return {
      apiKey: p.apiKey,
      baseUrl: p.baseUrl,
      lastSyncedAt: p.lastSyncedAt,
    };
  }
  return null;
}

export async function deleteProviderConfig(
  category: ModelCategory,
  provider: ProviderId,
  configId: string
): Promise<{ success: boolean }> {
  const config = await loadUiConfig();

  // Remove the specific config
  if (config.providers?.[provider]) {
    config.providers[provider] = config.providers[provider].filter(
      (c) => c.id !== configId
    );
  }

  // Clean up routing entries that reference this configId
  if (config[category]?.routing) {
    config[category].routing = config[category].routing.filter(
      (r) => !(r.provider === provider && r.configId === configId)
    );
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { success: true };
}
