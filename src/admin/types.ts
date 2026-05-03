export type ProviderId = string;

export type ModelCategory = 'text' | 'image' | 'video' | 'audio' | 'mcp';

export const MODEL_CATEGORIES: ModelCategory[] = [
  'text',
  'image',
  'video',
  'audio',
  'mcp',
];

export type ProviderStatus = 'connected' | 'disconnected' | 'unknown';

export type RoutingEntry = {
  provider: ProviderId;
  model: string;
  configId: string;
  isPrimary?: boolean;
};

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  baseUrl?: string;
  status?: ProviderStatus;
  lastSyncedAt?: string;
  isPrimary?: boolean;
  routing?: RoutingEntry[];
  remark?: string;
  configCount: number;
  configId?: string;
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  baseUrl?: string;
  setAsPrimary?: boolean;
  addModels?: string[];
  removeModels?: string[];
  remark?: string;
  configId?: string;
};

export type UsageByModel = {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
  costUSD?: number;
};

export type UsageTotals = {
  costUSD?: number;
  inputTokens?: number;
  outputTokens?: number;
  requests?: number;
};

export type UsageResponse = {
  provider?: ProviderId;
  from?: string;
  to?: string;
  totals?: UsageTotals;
  byModel?: UsageByModel[];
};
