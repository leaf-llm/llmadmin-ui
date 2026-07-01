import { isDesktopMode } from '../api/config';
import {
  getNeutralinoHomeDir,
  joinPath,
} from './neutralinoHomeDir';

export type ProviderId = string;

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'openai',
  'anthropic',
  'google-openai',
  'zhipu',
  'dashscope',
  'moonshot',
  'minimax',
  'doubao',
  'deepseek',
  'openai-compatible',
  'anthropic-compatible',
];

export type ModelCategory = 'text' | 'image' | 'video' | 'audio' | 'mcp';

export const MODEL_CATEGORIES: ModelCategory[] = [
  'text',
  'image',
  'video',
  'audio',
  'mcp',
];

export type RoutingEntry = {
  provider: ProviderId;
  model: string;
  configId: string;
  isPrimary?: boolean;
};

export type ProviderConfig = {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  baseUrlAnthropic?: string;
  lastSyncedAt?: string;
  remark?: string;
  apiFormat?: 'openai' | 'anthropic';
};

export type CategoryConfig = {
  routing: RoutingEntry[];
  userConfig: Record<string, unknown> | null;
};

export type UiConfigFile = {
  providers: Record<ProviderId, ProviderConfig[]>;
} & Record<ModelCategory, CategoryConfig>;

function getNeutralino(): any {
  return typeof window !== 'undefined' ? (window as any).Neutralino : null;
}

// Cached config path
let cachedConfigPath: string | null = null;

// Re-export so existing imports of `getNeutralinoHomeDir` from this module
// keep working — the implementation now lives in `./neutralinoHomeDir`.
export { getNeutralinoHomeDir };

// Get config path - must be called after Neutralino is initialized
export async function getConfigPathAsync(): Promise<string> {
  if (cachedConfigPath) {
    return cachedConfigPath;
  }
  const home = await getNeutralinoHomeDir();
  cachedConfigPath = joinPath(home, '.llm-admin', 'conf.json');
  return cachedConfigPath;
}

// Sync fallback for initial load (before async path is computed).
// Throws instead of returning a hardcoded POSIX path that would silently
// corrupt state on Windows (the previous behaviour, which is what this
// refactor fixes).
function getConfigPath(): string {
  if (cachedConfigPath) return cachedConfigPath;
  throw new Error(
    'Config path not initialized — call getConfigPathAsync() once before any synchronous config access.'
  );
}

// Unified config type for frontend
export type UnifiedConfigFile = {
  settings?: {
    plugins_enabled?: string[];
    credentials?: Record<string, { apiKey: string }>;
    cache?: boolean;
    integrations?: unknown[];
  };
  gateway?: UiConfigFile;
  server?: { port?: number; headless?: boolean };
};

export function maskApiKey(key: string): string {
  const trimmed = key.trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8)
    return `${trimmed.slice(0, 2)}***${trimmed.slice(-2)}`;
  return `${trimmed.slice(0, 4)}***${trimmed.slice(-4)}`;
}

function createEmptyCategoryConfig(): CategoryConfig {
  return {
    routing: [],
    userConfig: null,
  };
}

export function createEmptyUiConfig(): UiConfigFile {
  return {
    providers: {},
    text: createEmptyCategoryConfig(),
    image: createEmptyCategoryConfig(),
    video: createEmptyCategoryConfig(),
    audio: createEmptyCategoryConfig(),
    mcp: createEmptyCategoryConfig(),
  };
}

// --- File I/O via Neutralino.filesystem API ---
//
// Why not execCommand: each `os.execCommand` call spawns a fresh
// `powershell.exe` (Windows) or `/bin/sh` (Unix) — cold-start is ~300-1500ms
// per call, and `saveUiConfig` previously made 4-5 such calls. The
// `Neutralino.filesystem` API talks to the native Neutralino helper over a
// WebSocket and is sub-millisecond per call.
//
// Atomicity: we still write to a tmp file and use `filesystem.move` (which
// calls `MoveFileEx` with `MOVEFILE_REPLACE_EXISTING` on Windows and
// `rename(2)` on POSIX — both atomic) so the backend's mtime cache at
// `src-gateway/src/admin/config/store.ts:66-103` only ever sees old or new,
// never a half-written file.

const ensuredDirs = new Set<string>();

async function shellReadFile(path: string): Promise<string> {
  const Neutralino = getNeutralino();
  return await Neutralino.filesystem.readFile(path);
}

async function shellWriteFile(path: string, content: string): Promise<void> {
  const Neutralino = getNeutralino();
  // Atomic write: write to a tmp file in the same directory (so the move is
  // on the same filesystem and therefore atomic), then rename over the
  // destination. Readers see either the old content or the new content, never
  // a half-written truncation.
  const tmpPath = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await Neutralino.filesystem.writeFile(tmpPath, content);
  try {
    await Neutralino.filesystem.move(tmpPath, path);
  } catch (e) {
    // Clean up tmp on failure
    try {
      await Neutralino.filesystem.remove(tmpPath);
    } catch {}
    throw e;
  }
}

async function shellMkdir(dir: string): Promise<void> {
  if (ensuredDirs.has(dir)) return;
  const Neutralino = getNeutralino();
  try {
    await Neutralino.filesystem.createDirectory(dir);
  } catch (e: any) {
    // Idempotent: ignore "already exists" errors (NL_ERR_DIR_EXISTS / EEXIST).
    const msg = String(e?.message || e || '');
    if (
      e?.code === 'NE_FS_DIRCRER' ||
      msg.toLowerCase().includes('exists') ||
      msg.toLowerCase().includes('eexist')
    ) {
      // directory already exists — fine
    } else {
      throw e;
    }
  }
  ensuredDirs.add(dir);
}

async function shellFileExists(path: string): Promise<boolean> {
  const Neutralino = getNeutralino();
  try {
    await Neutralino.filesystem.getStats(path);
    return true;
  } catch {
    return false;
  }
}

// --- Config loading ---

const DEFAULT_UNIFIED_CONFIG = JSON.stringify({
  settings: { plugins_enabled: ['default'], credentials: {}, cache: false, integrations: [] },
  gateway: { providers: {}, text: { routing: [], userConfig: null }, image: { routing: [], userConfig: null }, video: { routing: [], userConfig: null }, audio: { routing: [], userConfig: null }, mcp: { routing: [], userConfig: null } },
  server: { port: 8700, headless: false },
}, null, 2);

function createUiDefaultConfig(): UiConfigFile {
  return {
    providers: {},
    text: createEmptyCategoryConfig(),
    image: createEmptyCategoryConfig(),
    video: createEmptyCategoryConfig(),
    audio: createEmptyCategoryConfig(),
    mcp: createEmptyCategoryConfig(),
  };
}

export async function loadUiConfig(): Promise<UiConfigFile> {
  const defaultConfig = createUiDefaultConfig();

  if (!isDesktopMode()) {
    return defaultConfig;
  }

  const Neutralino = getNeutralino();
  if (!Neutralino?.filesystem?.readFile) {
    return defaultConfig;
  }

  const configPath = await getConfigPathAsync();
  const dirPath = configPath.substring(
    0,
    Math.max(configPath.lastIndexOf('/'), configPath.lastIndexOf('\\'))
  );

  try {
    // Ensure directory exists
    await shellMkdir(dirPath);

    // Check if file exists — create default if missing
    const exists = await shellFileExists(configPath);
    if (!exists) {
      await shellWriteFile(configPath, DEFAULT_UNIFIED_CONFIG);
      Neutralino.debug?.log?.('Created default config at ' + configPath, 'INFO');
    }

    // Read and parse file
    const text = await shellReadFile(configPath);
    if (!text) {
      // File is empty or read failed — write default
      await shellWriteFile(configPath, DEFAULT_UNIFIED_CONFIG);
      return defaultConfig;
    }

    const parsed = JSON.parse(text);
    return parsed?.gateway
      ? { ...defaultConfig, ...parsed.gateway }
      : defaultConfig;
  } catch (e) {
    console.warn('loadUiConfig error:', e);
    return defaultConfig;
  }
}

export async function saveUiConfig(config: UiConfigFile): Promise<void> {
  if (!isDesktopMode()) {
    throw new Error('Cannot save config in web mode');
  }

  const Neutralino = getNeutralino();
  if (!Neutralino?.filesystem?.writeFile) {
    throw new Error('Neutralino filesystem API not available');
  }

  const configPath = await getConfigPathAsync();
  const dirPath = configPath.substring(
    0,
    Math.max(configPath.lastIndexOf('/'), configPath.lastIndexOf('\\'))
  );

  try {
    // Ensure directory exists
    await shellMkdir(dirPath);

    // Read existing config to preserve settings and server
    let existingConfig: UnifiedConfigFile = {};
    const exists = await shellFileExists(configPath);
    if (exists) {
      try {
        const text = await shellReadFile(configPath);
        existingConfig = JSON.parse(text);
      } catch {}
    }

    // Update gateway, preserve settings and server
    const unifiedConfig: UnifiedConfigFile = {
      ...existingConfig,
      gateway: config,
    };

    await shellWriteFile(configPath, JSON.stringify(unifiedConfig, null, 2));
  } catch (e: any) {
    console.warn('saveUiConfig error:', e);
    throw new Error('Failed to save config: ' + (e?.message || e));
  }
}

export async function loadUserConfig(
  category: ModelCategory
): Promise<Record<string, unknown> | null> {
  const config = await loadUiConfig();
  return config[category]?.userConfig ?? null;
}

export async function syncUserConfigFromRouting(
  category: ModelCategory
): Promise<void> {
  const config = await loadUiConfig();
  const { routing } = config[category];
  const { providers } = config;

  if (!routing || routing.length === 0) {
    config[category].userConfig = null;
    await saveUiConfig(config);
    return;
  }

  // Separate primary and non-primary entries
  const primaryEntries = routing.filter((r) => r.isPrimary);
  const nonPrimaryEntries = routing.filter((r) => !r.isPrimary);
  const sortedRouting = [...primaryEntries, ...nonPrimaryEntries];

  function buildTarget(entry: RoutingEntry): Record<string, unknown> | null {
    const cfgs = providers[entry.provider];
    let p: ProviderConfig | undefined;

    if (entry.configId) {
      p = cfgs?.find((c) => c.id === entry.configId);
    }

    p = p || cfgs?.[0];

    if (!p?.apiKey?.trim()) return null;

    // Map UI provider enum to backend provider: openai-compatible /
    // anthropic-compatible are routed to the same backend provider as the
    // official openai / anthropic.
    const backendProvider =
      entry.provider === 'openai-compatible'
        ? 'openai'
        : entry.provider === 'anthropic-compatible'
          ? 'anthropic'
          : entry.provider;

    const target: Record<string, unknown> = {
      provider: backendProvider,
      api_key: p.apiKey.trim(),
      override_params: {
        model: entry.model,
      },
    };
    if (p.baseUrl?.trim()) {
      target.custom_host = p.baseUrl.trim();
    }
    if (p.baseUrlAnthropic?.trim()) {
      target.custom_host_anthropic = p.baseUrlAnthropic.trim();
    }
    if (p.apiFormat) {
      target.api_format = p.apiFormat;
    }
    return target;
  }

  const targets: Record<string, unknown>[] = [];

  for (const entry of primaryEntries) {
    const target = buildTarget(entry);
    if (target) targets.push(target);
  }

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

  if (targets.length === 1) {
    config[category].userConfig = targets[0];
    await saveUiConfig(config);
    return;
  }

  if (primaryEntries.length > 0) {
    config[category].userConfig = {
      strategy: {
        mode: 'fallback',
        on_status_codes: [400, 402, 424, 429, 500, 502, 503, 504],
      },
      targets,
    };
  } else {
    config[category].userConfig = {
      strategy: {
        mode: 'loadbalance',
      },
      targets,
    };
  }

  await saveUiConfig(config);
}

export type ProviderStatus = 'connected' | 'disconnected' | 'unknown';

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  baseUrl?: string;
  baseUrlAnthropic?: string;
  status?: ProviderStatus;
  lastSyncedAt?: string;
  isPrimary?: boolean;
  routing?: RoutingEntry[];
  remark?: string;
  configCount: number;
  configId?: string;
  apiFormat?: 'openai' | 'anthropic';
};

const DEFAULT_BASE_URLS: Record<ProviderId, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  'anthropic-compatible': 'https://api.anthropic.com',
  'google-openai': 'https://generativelanguage.googleapis.com/v1beta/openai',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  moonshot: 'https://api.moonshot.cn/v1',
  minimax: 'https://api.minimax.chat/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/v3',
  deepseek: 'https://api.deepseek.com/v1',
};

const DEFAULT_ANTHROPIC_BASE_URLS: Record<ProviderId, string> = {
  'openai-compatible': '',
  'anthropic-compatible': 'https://api.anthropic.com',
  zhipu: 'https://open.bigmodel.cn/api/anthropic',
  dashscope: 'https://dashscope.aliyuncs.com/apps/anthropic/v1',
  moonshot: 'https://api.moonshot.cn/anthropic/v1',
  minimax: 'https://api.minimaxi.com/anthropic/v1',
  doubao: 'https://ark.cn-beijing.volces.com/api/compatible/v1',
  deepseek: 'https://api.deepseek.com/anthropic/v1',
};

export async function listProviderSummaries(category: ModelCategory): Promise<{
  providers: ProviderSummary[];
}> {
  const config = await loadUiConfig();
  const categoryConfig = config[category];
  const providers: ProviderSummary[] = [];

  for (const provider of SUPPORTED_PROVIDERS) {
    const allConfigs: ProviderConfig[] = config.providers?.[provider] ?? [];

    const hasApiKey = allConfigs.some((c) => c.apiKey?.trim());
    const status: ProviderStatus = hasApiKey ? 'connected' : 'disconnected';

    const routing =
      categoryConfig?.routing?.filter((r) => r.provider === provider) ?? [];

    const isPrimary =
      categoryConfig?.routing?.some(
        (r) => r.provider === provider && r.isPrimary
      ) ?? false;

    if (allConfigs.length === 0) {
      providers.push({
        provider,
        status: 'disconnected',
        baseUrl: DEFAULT_BASE_URLS[provider],
        baseUrlAnthropic: DEFAULT_ANTHROPIC_BASE_URLS[provider],
        configCount: 0,
        configId: provider,
        apiFormat: undefined,
      });
    } else {
      for (const cfg of allConfigs) {
        providers.push({
          provider,
          apiKeyMasked: cfg.apiKey ? maskApiKey(cfg.apiKey) : undefined,
          baseUrl: cfg.baseUrl ?? DEFAULT_BASE_URLS[provider],
          baseUrlAnthropic:
            cfg.baseUrlAnthropic ?? DEFAULT_ANTHROPIC_BASE_URLS[provider],
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

export type ProviderUpdateRequest = {
  apiKey?: string;
  baseUrl?: string;
  baseUrlAnthropic?: string;
  setAsPrimary?: boolean;
  addModels?: string[];
  removeModels?: string[];
  remark?: string;
  configId?: string;
  apiFormat?: 'openai' | 'anthropic';
};

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
      ? DEFAULT_BASE_URLS[provider]
      : update.baseUrl.trim() || DEFAULT_BASE_URLS[provider];

  const baseUrlAnthropic =
    update.baseUrlAnthropic === undefined
      ? DEFAULT_ANTHROPIC_BASE_URLS[provider]
      : update.baseUrlAnthropic.trim() ||
        DEFAULT_ANTHROPIC_BASE_URLS[provider];

  let savedConfig: ProviderConfig | undefined;

  const isNewConfig = !update.configId || update.configId.endsWith('-new');
  if (!isNewConfig && update.configId) {
    const configs = config.providers[provider];
    const idx = configs.findIndex((c) => c.id === update.configId);
    if (idx === -1) {
      throw new Error(`Config not found: ${update.configId}`);
    }
    savedConfig = {
      ...configs[idx],
      apiKey: apiKey !== undefined ? apiKey : configs[idx].apiKey,
      baseUrl: baseUrl !== undefined ? baseUrl : configs[idx].baseUrl,
      baseUrlAnthropic:
        baseUrlAnthropic !== undefined
          ? baseUrlAnthropic
          : configs[idx].baseUrlAnthropic,
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
      baseUrlAnthropic,
      lastSyncedAt: new Date().toISOString(),
      remark,
      apiFormat: update.apiFormat,
    };

    config.providers[provider].push(newConfig);
    savedConfig = newConfig;
  }

  if (update.setAsPrimary === true) {
    if (!apiKey) {
      throw new Error('Cannot set inactive provider as primary');
    }
    for (const entry of config[category].routing) {
      if (entry.provider === provider) {
        entry.isPrimary = true;
      } else {
        entry.isPrimary = false;
      }
    }
  } else if (update.setAsPrimary === false) {
    for (const entry of config[category].routing) {
      if (entry.provider === provider) {
        entry.isPrimary = false;
      }
    }
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);

  const apiKeyMasked = savedConfig?.apiKey
    ? maskApiKey(savedConfig.apiKey)
    : undefined;
  const providerStatus: ProviderStatus = savedConfig?.apiKey
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
      status: providerStatus,
      lastSyncedAt: savedConfig?.lastSyncedAt,
      isPrimary,
      remark: savedConfig?.remark,
      configCount,
      apiFormat: savedConfig?.apiFormat,
    },
  };
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
  const routing = config[category].routing;
  if (!routing) {
    config[category].routing = [];
  }

  const idx = routing.findIndex(
    (r) =>
      r.provider === provider && r.model === model && r.configId === configId
  );
  if (idx === -1) throw new Error('Routing entry not found');

  if (isPrimary) {
    const [entry] = routing.splice(idx, 1);
    entry.isPrimary = true;
    let insertIdx = routing.length;
    for (let i = routing.length - 1; i >= 0; i--) {
      if (routing[i].isPrimary) {
        insertIdx = i + 1;
        break;
      }
    }
    routing.splice(insertIdx, 0, entry);
  } else {
    routing[idx].isPrimary = false;
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing };
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

  if (current.isPrimary !== target.isPrimary) {
    return { routing };
  }

  [routing[idx], routing[targetIdx]] = [routing[targetIdx], routing[idx]];

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: [...routing] };
}

export async function moveRoutingEntryToIndex(
  category: ModelCategory,
  fromIndex: number,
  toIndex: number
): Promise<{ routing: RoutingEntry[] }> {
  const config = await loadUiConfig();
  const routing = config[category].routing;

  if (
    !routing ||
    fromIndex < 0 ||
    fromIndex >= routing.length ||
    toIndex < 0 ||
    toIndex >= routing.length ||
    fromIndex === toIndex
  ) {
    return { routing: routing ?? [] };
  }

  const [entry] = routing.splice(fromIndex, 1);
  routing.splice(toIndex, 0, entry);

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { routing: [...routing] };
}

export async function listRouting(category: ModelCategory): Promise<{
  routing: RoutingEntry[];
}> {
  const config = await loadUiConfig();
  return { routing: config[category]?.routing ?? [] };
}

export async function deleteProviderConfig(
  category: ModelCategory,
  provider: ProviderId,
  configId: string
): Promise<{ success: boolean }> {
  const config = await loadUiConfig();

  if (config.providers?.[provider]) {
    config.providers[provider] = config.providers[provider].filter(
      (c) => c.id !== configId
    );
  }

  if (config[category]?.routing) {
    config[category].routing = config[category].routing.filter(
      (r) => !(r.provider === provider && r.configId === configId)
    );
  }

  await saveUiConfig(config);
  await syncUserConfigFromRouting(category);
  return { success: true };
}

export type ProviderModelsResponse = {
  object?: string;
  data?: Array<{
    id?: string;
    object?: string;
    created?: number;
    owned_by?: string;
  }>;
};

// Fetch models directly from provider's API
export async function getProviderModels(
  provider: ProviderId,
  configId: string
): Promise<ProviderModelsResponse> {
  const config = await loadUiConfig();
  const providerConfigs = config.providers?.[provider];
  const matchedConfig = configId
    ? providerConfigs?.find((cfg) => cfg.id === configId)
    : providerConfigs?.[0];

  if (!matchedConfig?.apiKey) {
    throw new Error('API key not found for provider');
  }

  const baseUrl = matchedConfig.baseUrl || DEFAULT_BASE_URLS[provider];

  // Try to fetch models from the provider.
  // NOTE: do NOT set `Content-Type: application/json` on this GET — it would
  // force a CORS preflight (OPTIONS) that some providers (notably Google's
  // /v1beta/openai) do not respond to, even though they accept the actual
  // request. A GET with no body only needs Authorization.
  const url = `${baseUrl}/models`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${matchedConfig.apiKey}`,
  };

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } catch {
    // Fallback: try OpenAI-compatible format at /v1/models
    const openaiUrl = `${baseUrl}/v1/models`;
    const openaiResponse = await fetch(openaiUrl, { headers });
    if (!openaiResponse.ok) {
      throw new Error('Failed to fetch models from provider');
    }
    return await openaiResponse.json();
  }
}