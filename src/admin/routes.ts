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
  };
  const daily: DailyProviderRow[] = [];

  let totalRequests = 0;
  let successCount = 0;
  let failureCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  metricsStore.forEach((dailyProviders, dateKey) => {
    const d = new Date(dateKey);
    if (d >= fromDate && d < toDate) {
      dailyProviders.forEach((metrics, provider) => {
        totalRequests += metrics.total;
        successCount += metrics.success;
        failureCount += metrics.failure;
        inputTokens += metrics.inputTokens;
        outputTokens += metrics.outputTokens;
        daily.push({
          date: dateKey,
          provider,
          totalRequests: metrics.total,
          successCount: metrics.success,
          failureCount: metrics.failure,
          inputTokens: metrics.inputTokens,
          outputTokens: metrics.outputTokens,
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

  const { apiKey, baseUrl, configId } = body as {
    apiKey?: string;
    baseUrl?: string;
    configId?: string;
  };

  let resolvedApiKey = apiKey?.trim();
  let resolvedBaseUrl = baseUrl?.trim();

  if (!resolvedApiKey && configId) {
    const uiConfig = await loadUiConfig();
    for (const providerConfigs of Object.values(uiConfig.providers)) {
      const matched = providerConfigs?.find((cfg) => cfg.id === configId);
      if (matched) {
        resolvedApiKey = matched.apiKey?.trim();
        if (!resolvedBaseUrl) resolvedBaseUrl = matched.baseUrl?.trim();
        break;
      }
    }
  }

  if (!resolvedApiKey) {
    return c.json({ ok: false, message: 'API key is required' }, 400);
  }
  if (!resolvedBaseUrl) {
    return c.json({ ok: false, message: 'Base URL is required' }, 400);
  }

  try {
    const parsedUrl = new URL(resolvedBaseUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return c.json(
        { ok: false, message: 'Base URL must start with http:// or https://' },
        400
      );
    }
  } catch {
    return c.json(
      { ok: false, message: 'Base URL is not a valid URL' },
      400
    );
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

    let modelsOk = false;
    let modelsAuthError = false;
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (response.status === 404) {
        } else if (response.status === 401 || response.status === 403) {
          modelsAuthError = true;
        } else {
          const errData = await response.json().catch(() => ({}));
          return c.json(
            {
              ok: false,
              message: errData.error?.message || `HTTP ${response.status}`,
            },
            200
          );
        }
      } else {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          return c.json(
            { ok: false, message: 'Base URL returned non-JSON response — the URL may be incorrect' },
            200
          );
        }
        const modelData = await response.json();
        if (modelData?.error || modelData?.code === 401 || modelData?.success === false) {
          modelsAuthError = true;
        } else {
          modelsOk = true;
        }
      }
    } catch (err: any) {
      return c.json({ ok: false, message: err.message }, 200);
    }

    if (modelsAuthError) {
      return c.json(
        { ok: false, message: 'Authentication failed — invalid API key' },
        200
      );
    }

    let apiFormat: 'openai' | 'anthropic' = 'openai';
    const testBody = {
      model: 'test-model',
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
    };
    const testHeaders = {
      ...headers,
      'Content-Type': 'application/json',
    };

    const messagesRes = await fetch(resolvedBaseUrl + '/messages', {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody),
    });

    const chatRes = await fetch(resolvedBaseUrl + '/chat/completions', {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody),
    });

    const isAuthError = (status: number) => status === 401 || status === 403;

    const isModelNotFound = (status: number, data: Record<string, any> | null) => {
      if (status !== 400 && status !== 404) return false;
      if (!data) return false;
      const msg =
        data.error?.message || data.error?.toString() || data.message || '';
      return msg.toLowerCase().includes('model') || msg.includes('模型');
    };

    const readBody = async (res: Response): Promise<Record<string, any> | null> => {
      try { return await res.clone().json() as Record<string, any>; }
      catch { return null; }
    };
    const [messagesData, chatData] = await Promise.all([
      readBody(messagesRes),
      readBody(chatRes),
    ]);
    const hasBodyError = (data: Record<string, any> | null) => {
      if (!data) return false;
      return data.error != null || data.code === 401;
    };

    const messagesOk =
      (messagesRes.ok && !hasBodyError(messagesData)) ||
      isModelNotFound(messagesRes.status, messagesData);
    const chatOk =
      (chatRes.ok && !hasBodyError(chatData)) ||
      isModelNotFound(chatRes.status, chatData);

    if (messagesOk) {
      apiFormat = 'anthropic';
    } else if (chatOk) {
      apiFormat = 'openai';
    }

    if (modelsOk) {
      return c.json({
        ok: true,
        message: 'Connected successfully',
        apiFormat,
      });
    }

    if (messagesOk || chatOk) {
      return c.json({
        ok: true,
        message: 'Connected successfully',
        apiFormat,
      });
    }

    if (isAuthError(messagesRes.status) || isAuthError(chatRes.status)) {
      return c.json(
        { ok: false, message: 'Authentication failed — invalid API key' },
        200
      );
    }

    return c.json({ ok: false, message: 'Could not connect — check the base URL' }, 200);
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 200);
  }
});

export { adminApp };