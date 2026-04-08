export type ProviderId = string;

export type ProviderStatus = 'connected' | 'disconnected' | 'unknown';

export type ProviderSummary = {
  provider: ProviderId;
  apiKeyMasked?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
  status?: ProviderStatus;
  lastSyncedAt?: string;
};

export type ProviderUpdateRequest = {
  apiKey?: string;
  organizationId?: string;
  projectId?: string;
  budgetUSD?: number;
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

