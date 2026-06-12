import { getRuntimeKey } from 'hono/adapter';
import { readFile, stat } from 'fs/promises';
import path from 'path';

import {
  ModelCategory,
  MODEL_CATEGORIES,
  ProviderId,
} from '../types';

export const SUPPORTED_PROVIDERS: ProviderId[] = [
  'openai',
  'anthropic',
  'google',
  'zhipu',
  'dashscope',
  'moonshot',
  'minimax',
  'doubao',
  'deepseek',
];

type ProviderConfig = {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  baseUrlAnthropic?: string;
  lastSyncedAt?: string;
  remark?: string;
  apiFormat?: 'openai' | 'anthropic';
};

type CategoryConfig = {
  routing: RoutingEntry[];
  userConfig: Record<string, unknown> | null;
};

type RoutingEntry = {
  provider: ProviderId;
  model: string;
  configId: string;
  isPrimary: boolean;
};

type UiConfigFile = {
  providers: Record<ProviderId, ProviderConfig[]>;
} & Record<ModelCategory, CategoryConfig>;

const CONFIG_FILE_NAME = 'conf.ui.json';

// Config cache with mtime for quick invalidation
let cachedConfig: UiConfigFile | null = null;
let cachedMtime: number | null = null;

export type { ProviderConfig, CategoryConfig, RoutingEntry, UiConfigFile };

export function getConfigPath() {
  const execPath = process.env.NL_PATH || process.execPath;
  if (execPath.includes('.app/Contents/MacOS/')) {
    const appBundleDir = path.dirname(execPath);
    return path.join(appBundleDir, CONFIG_FILE_NAME);
  }
  const userConfigDir = path.join(process.env.HOME || '', '.llm-admin');
  return path.join(userConfigDir, CONFIG_FILE_NAME);
}

async function loadUiConfigWithCache(): Promise<UiConfigFile> {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') {
    throw new Error('UI config store is only supported in node or bun runtime');
  }

  const configPath = getConfigPath();

  try {
    // Check mtime first - if unchanged, use cache
    const fileStat = await stat(configPath);
    const currentMtime = fileStat.mtimeMs;

    if (cachedConfig && cachedMtime === currentMtime) {
      return cachedConfig;
    }

    // File changed or not cached - reload
    const raw = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as UiConfigFile;

    // Update cache
    cachedConfig = parsed;
    cachedMtime = currentMtime;

    return parsed;
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      const defaultConfig: UiConfigFile = {
        providers: {},
        text: { routing: [], userConfig: null },
        image: { routing: [], userConfig: null },
        video: { routing: [], userConfig: null },
        audio: { routing: [], userConfig: null },
        mcp: { routing: [], userConfig: null },
      };
      // Don't cache default config if file doesn't exist
      cachedConfig = null;
      cachedMtime = null;
      return defaultConfig;
    }
    throw e;
  }
}

export { loadUiConfigWithCache as loadUiConfig };

export async function loadUserConfig(
  category: ModelCategory
): Promise<Record<string, unknown> | null> {
  const config = await loadUiConfigWithCache();
  return config[category]?.userConfig ?? null;
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