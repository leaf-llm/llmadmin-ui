import { Hono } from 'hono';
import { z } from 'zod';

import { getUsage } from './billing';
import { metricsStore } from '../middlewares/log';
import Providers from '../providers/index';
import { loadUiConfig } from './config/store';

import { ProviderId } from './types';

const adminApp = new Hono();

const ADMIN_TOKEN = process.env.ADMIN_TOKEN ?? '';

function tryParseBearerToken(authHeader: string | undefined) {
  if (!authHeader) return '';
  const parts = authHeader.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === 'bearer')
    return parts[1];
  return '';
}

async function adminAuth(c: any, next: any) {
  const origin = c.req.header('origin');
  if (
    origin &&
    (origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1'))
  ) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    c.header('Access-Control-Allow-Credentials', 'true');
  }
  if (c.req.method === 'OPTIONS') return c.body(null, 204);

  if (!ADMIN_TOKEN) return next();

  const bearer = tryParseBearerToken(c.req.header('authorization'));
  const token = bearer || c.req.header('x-admin-token') || '';

  if (token !== ADMIN_TOKEN) {
    return c.json({ ok: false, message: 'Unauthorized' }, 401);
  }

  return next();
}

adminApp.use('*', adminAuth);

adminApp.get('/health', (c) => c.json({ ok: true }));

const UsageQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provider: z.string().optional(),
});

adminApp.get('/usage', async (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const providerParam = c.req.query('provider');
  const parsed = UsageQuerySchema.safeParse({
    from,
    to,
    provider: providerParam ?? undefined,
  });
  if (!parsed.success) {
    return c.json(
      { ok: false, message: 'Invalid query', issues: parsed.error.issues },
      400
    );
  }

  const provider = parsed.data.provider;
  const res = await getUsage({
    provider,
    from: parsed.data.from,
    to: parsed.data.to,
  });
  return c.json(res);
});

const MetricsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

adminApp.get('/metrics', (c) => {
  const from = c.req.query('from');
  const to = c.req.query('to');
  const parsed = MetricsQuerySchema.safeParse({ from, to });
  if (!parsed.success) {
    return c.json(
      { ok: false, message: 'Invalid query', issues: parsed.error.issues },
      400
    );
  }

  const fromDate = new Date(parsed.data.from);
  const toDate = new Date(parsed.data.to);
  toDate.setDate(toDate.getDate() + 1);

  type DailyProviderRow = {
    date: string;
    provider: string;
    totalRequests: number;
    successCount: number;
    failureCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheInputTokens: number;
  };
  const daily: DailyProviderRow[] = [];

  let totalRequests = 0;
  let successCount = 0;
  let failureCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheInputTokens = 0;

  metricsStore.forEach((dailyProviders, dateKey) => {
    const d = new Date(dateKey);
    if (d >= fromDate && d < toDate) {
      dailyProviders.forEach((metrics, provider) => {
        totalRequests += metrics.total;
        successCount += metrics.success;
        failureCount += metrics.failure;
        inputTokens += metrics.inputTokens;
        outputTokens += metrics.outputTokens;
        cacheInputTokens += metrics.cacheInputTokens;
        daily.push({
          date: dateKey,
          provider,
          totalRequests: metrics.total,
          successCount: metrics.success,
          failureCount: metrics.failure,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
          cacheInputTokens: metrics.cacheInputTokens,
        });
      });
    }
  });

  daily.sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    return dateCmp !== 0 ? dateCmp : a.provider.localeCompare(b.provider);
  });

  return c.json({
    from: parsed.data.from,
    to: parsed.data.to,
    totals: {
      totalRequests,
      successCount,
      failureCount,
      inputTokens,
      outputTokens,
      cacheInputTokens,
    },
    daily,
  });
});

adminApp.post('/providers/:provider/test-connectivity', async (c) => {
  const provider = c.req.param('provider') as ProviderId;
  const body = await c.req.json().catch(() => ({}));

  const providerConfig = Providers[provider];
  if (!providerConfig?.api) {
    return c.json({ ok: false, message: 'Unknown provider' }, 404);
  }

  const { apiKey, baseUrl, baseUrlAnthropic, configId } = body as {
    apiKey?: string;
    baseUrl?: string;
    baseUrlAnthropic?: string;
    configId?: string;
  };

  let resolvedApiKey = apiKey?.trim();
  let resolvedBaseUrl = baseUrl?.trim();
  let resolvedBaseUrlAnthropic = baseUrlAnthropic?.trim();

  if (!resolvedApiKey && configId) {
    const uiConfig = await loadUiConfig();
    for (const providerConfigs of Object.values(uiConfig.providers)) {
      const matched = providerConfigs?.find((cfg) => cfg.id === configId);
      if (matched) {
        resolvedApiKey = matched.apiKey?.trim();
        if (!resolvedBaseUrl) resolvedBaseUrl = matched.baseUrl?.trim();
        if (!resolvedBaseUrlAnthropic)
          resolvedBaseUrlAnthropic = matched.baseUrlAnthropic?.trim();
        break;
      }
    }
  }

  if (!resolvedApiKey) {
    return c.json({ ok: false, message: 'API key is required' }, 400);
  }

  const testConnectivity = async (
    resolvedBaseUrl: string | undefined,
    label: string
  ): Promise<{ ok: boolean; message: string }> => {
    if (!resolvedBaseUrl) {
      return { ok: false, message: `${label} URL is required` };
    }

    try {
      const parsedUrl = new URL(resolvedBaseUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return {
          ok: false,
          message: `${label} URL must start with http:// or https://`,
        };
      }
    } catch {
      return { ok: false, message: `${label} URL is not a valid URL` };
    }

    const providerOptions = {
      apiKey: resolvedApiKey,
      customHost: resolvedBaseUrl,
    };

    try {
      const endpoint = providerConfig.api.getEndpoint({
        c: c,
        providerOptions,
        fn: 'listModels',
        gatewayRequestBodyJSON: {},
        gatewayRequestBody: {},
        gatewayRequestURL: resolvedBaseUrl + '/models',
      });

      const url = resolvedBaseUrl + endpoint;
      const headers = await providerConfig.api.headers({
        c: c,
        providerOptions,
        fn: 'listModels',
        transformedRequestBody: {},
        transformedRequestUrl: url,
        gatewayRequestBody: {},
        headers: {},
      });

      const response = await fetch(url, { headers });

      if (response.ok) {
        return { ok: true, message: 'Connected successfully' };
      }

      if (response.status === 401 || response.status === 403) {
        return { ok: false, message: 'Authentication failed — invalid API key' };
      }

      const errData = await response.json().catch(() => ({}));
      return {
        ok: false,
        message: errData.error?.message || `HTTP ${response.status}`,
      };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  };

  const [openaiResult, anthropicResult] = await Promise.all([
    testConnectivity(resolvedBaseUrl, 'OpenAI'),
    testConnectivity(resolvedBaseUrlAnthropic, 'Anthropic'),
  ]);

  const ok = openaiResult.ok || anthropicResult.ok;

  return c.json({
    ok,
    openai: resolvedBaseUrl ? openaiResult : undefined,
    anthropic: resolvedBaseUrlAnthropic ? anthropicResult : undefined,
  });
});

export { adminApp };