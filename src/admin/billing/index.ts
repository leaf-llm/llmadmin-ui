import { UsageResponse, ProviderId, UsageTotals, UsageByModel } from '../types';
import {
  getProviderCredentialsForBilling,
  SUPPORTED_PROVIDERS,
} from '../config/store';
import { getOpenAIUsage } from './adapters/openai';
import { getAnthropicUsage } from './adapters/anthropic';

function emptyTotals(): UsageTotals {
  return {};
}

function sumTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    costUSD: (a.costUSD ?? 0) + (b.costUSD ?? 0),
    inputTokens: (a.inputTokens ?? 0) + (b.inputTokens ?? 0),
    outputTokens: (a.outputTokens ?? 0) + (b.outputTokens ?? 0),
    requests: (a.requests ?? 0) + (b.requests ?? 0),
  };
}

export async function getUsage(params: {
  provider?: ProviderId;
  from: string;
  to: string;
}): Promise<UsageResponse> {
  const providerList: ProviderId[] = params.provider
    ? [params.provider]
    : SUPPORTED_PROVIDERS;

  let totals: UsageTotals = emptyTotals();
  const byModel: UsageByModel[] = [];

  for (const provider of providerList) {
    const creds = await getProviderCredentialsForBilling(provider);
    if (!creds?.apiKey) continue;

    try {
      if (provider === 'openai') {
        const { totals: t, byModel: rows } = await getOpenAIUsage({
          apiKey: creds.apiKey,
          from: params.from,
          to: params.to,
        });
        totals = sumTotals(totals, t);
        byModel.push(...rows);
      } else if (provider === 'anthropic') {
        const { totals: t, byModel: rows } = await getAnthropicUsage({
          apiKey: creds.apiKey,
          from: params.from,
          to: params.to,
        });
        totals = sumTotals(totals, t);
        byModel.push(...rows);
      } else {
        // Not implemented yet for other providers.
      }
    } catch (e) {
      // Continue other providers; don't break whole usage query.
      // In UI we'll just show whatever data we managed to fetch.
    }
  }

  return {
    provider: params.provider,
    from: params.from,
    to: params.to,
    totals,
    byModel,
  };
}
