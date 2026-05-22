import { Hono } from 'hono';
import { z } from 'zod';
import { writeFile } from 'fs/promises';
import path from 'path';

import {
  listProviderSummaries,
  upsertProvider,
  deleteProviderConfig,
  loadUserConfig,
  saveUserConfig,
  loadUiConfig,
  saveUiConfig,
  listRouting,
  addToRouting,
  removeFromRouting,
  updateRoutingPrimary,
  moveRoutingEntry,
  validateUiConfig,
} from './config/store';
import { getUsage } from './billing';
import { metricsStore } from '../middlewares/log';
import Providers from '../providers/index';

import {
  ModelCategory,
  MODEL_CATEGORIES,
  ProviderId,
  ProviderUpdateRequest,
  RoutingEntry,
} from './types';

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
  // CORS (local admin UI — Neutralino desktop uses a random localhost port)
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

function getCategoryParam(c: any): ModelCategory {
  const category = c.req.query('category') as string;
  if (category && MODEL_CATEGORIES.includes(category as ModelCategory)) {
    return category as ModelCategory;
  }
  return 'text'; // default
}

adminApp.get('/config', async (c) => {
  const category = getCategoryParam(c);
  const config = await loadUserConfig(category);
  return c.json({ config });
});

/**
 * Auto-generate Portkey config from routing entries.
 * - Has primary models: primary models first, non-primaries in loadbalance group
 * - No primary: all routing models in loadbalance
 */
async function generateConfigFromProviders(
  category: ModelCategory
): Promise<Record<string, unknown>> {
  const uiConfig = await loadUiConfig();
  const categoryConfig = uiConfig[category];
  const { routing } = categoryConfig;
  const { providers } = uiConfig;

  if (!routing || routing.length === 0) {
    throw new Error('No models in routing. Add models to routing first.');
  }

  // Build target from a routing entry
  function buildTarget(
    entry: (typeof routing)[0]
  ): Record<string, unknown> | null {
    const configs = providers[entry.provider];
    let p = configs?.[0];

    if (entry.configId) {
      const matched = configs?.find((c) => c.id === entry.configId);
      if (matched) p = matched;
    }

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
    if (p.apiFormat) {
      target.api_format = p.apiFormat;
    }
    return target;
  }

  // Separate primary and non-primary entries
  const primaryEntries: (typeof routing)[0][] = [];
  const nonPrimaryEntries: (typeof routing)[0][] = [];

  for (const entry of routing) {
    if (entry.isPrimary) {
      primaryEntries.push(entry);
    } else {
      nonPrimaryEntries.push(entry);
    }
  }

  // Build targets
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
    throw new Error('No valid routing entries. Add models to routing first.');
  }

  // If only one target, no strategy needed
  if (targets.length === 1) {
    return targets[0];
  }

  // Has primary → fallback strategy with primaries first, non-primaries in loadbalance
  const hasPrimary = primaryEntries.length > 0;
  if (hasPrimary) {
    return {
      strategy: {
        mode: 'fallback',
        on_status_codes: [429, 500, 502, 503, 504],
      },
      targets,
    };
  }

  // No primary → loadbalance all
  return {
    strategy: {
      mode: 'loadbalance',
    },
    targets,
  };
}

adminApp.post('/config', async (c) => {
  try {
    const category = getCategoryParam(c);
    const generatedConfig = await generateConfigFromProviders(category);
    await saveUserConfig(category, generatedConfig);
    return c.json({ ok: true, config: generatedConfig });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.delete('/config', async (c) => {
  const category = getCategoryParam(c);
  await saveUserConfig(category, null);
  return c.json({ ok: true });
});

adminApp.delete('/providers/:provider/config/:configId', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const configId = c.req.param('configId');
  try {
    await deleteProviderConfig(category, provider, configId);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.get('/config/export', async (c) => {
  try {
    const config = await loadUiConfig();
    return c.json({ config });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 500);
  }
});

adminApp.post('/config/export-file', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const config = await loadUiConfig();
    const jsonStr = JSON.stringify(config, null, 2);

    // If a path is provided, write to that path (user chose via save dialog)
    if (body.path && typeof body.path === 'string') {
      await writeFile(body.path, jsonStr, 'utf-8');
      return c.json({ ok: true, path: body.path });
    }

    // Otherwise write to ~/Downloads/conf.ui.json (fallback for desktop without dialog)
    const home = process.env.HOME || process.env.USERPROFILE || '';
    const downloadsDir = path.join(home, 'Downloads');
    const filePath = path.join(downloadsDir, 'conf.ui.json');
    await writeFile(filePath, jsonStr, 'utf-8');
    return c.json({ ok: true, path: filePath });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 500);
  }
});

adminApp.post('/config/import', async (c) => {
  try {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return c.json({ ok: false, message: 'Invalid JSON body' }, 400);
    }
    const validated = validateUiConfig(body);
    await saveUiConfig(validated);
    return c.json({ ok: true });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.get('/providers', async (c) => {
  const category = getCategoryParam(c);
  const res = await listProviderSummaries(category);
  return c.json(res);
});

const ProviderUpdateSchema: z.ZodSchema<ProviderUpdateRequest> = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    setAsPrimary: z.boolean().optional(),
    addModels: z.array(z.string()).optional(),
    removeModels: z.array(z.string()).optional(),
    configId: z.string().optional(),
    remark: z.string().optional(),
    apiFormat: z.enum(['openai', 'anthropic']).optional(),
  })
  .partial();

adminApp.put('/providers/:provider', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const body = await c.req.json().catch(() => ({}));
  const parsed = ProviderUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        ok: false,
        message: 'Invalid request body',
        issues: parsed.error.issues,
      },
      400
    );
  }

  const res = await upsertProvider(category, provider, parsed.data);
  return c.json({ ok: true, ...res });
});

// Routing endpoints
adminApp.get('/routing', async (c) => {
  const category = getCategoryParam(c);
  const res = await listRouting(category);
  return c.json(res);
});

const RoutingPostSchema = z.object({
  configId: z.string().min(1, 'configId is required'),
  isPrimary: z.boolean().optional(),
});

adminApp.post('/routing/:provider/:model', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const model = c.req.param('model');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RoutingPostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
  try {
    const res = await addToRouting(
      category,
      provider,
      model,
      parsed.data.configId,
      parsed.data.isPrimary
    );
    return c.json({ ok: true, routing: res.routing });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.put('/routing/:provider/:model', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const model = c.req.param('model');
  const body = await c.req.json().catch(() => ({}));
  const parsed = RoutingPostSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, message: 'Invalid request body' }, 400);
  }
  try {
    const res = await updateRoutingPrimary(
      category,
      provider,
      model,
      parsed.data.configId,
      parsed.data.isPrimary ?? false
    );
    return c.json({ ok: true, routing: res.routing });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.delete('/routing/:provider/:model', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const model = c.req.param('model');
  const configId = c.req.query('configId');
  try {
    const res = await removeFromRouting(
      category,
      provider,
      model,
      configId || undefined
    );
    return c.json({ ok: true, routing: res.routing });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.put('/routing/:provider/:model/move', async (c) => {
  const category = getCategoryParam(c);
  const provider = c.req.param('provider') as ProviderId;
  const model = c.req.param('model');
  const configId = c.req.query('configId');
  const direction = c.req.query('direction') as 'up' | 'down' | undefined;
  if (!configId || !direction || !['up', 'down'].includes(direction)) {
    return c.json(
      { ok: false, message: 'configId and direction (up/down) are required' },
      400
    );
  }
  try {
    const res = await moveRoutingEntry(
      category,
      provider,
      model,
      configId,
      direction
    );
    return c.json({ ok: true, routing: res.routing });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

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

adminApp.get('/metrics', async (c) => {
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
  toDate.setDate(toDate.getDate() + 1); // inclusive

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

// Provider model catalog - fetch available models from provider's /models endpoint
adminApp.get('/provider-models', async (c) => {
  const provider = c.req.query('provider');
  const configId = c.req.query('configId');
  if (!provider) {
    return c.json({ ok: false, message: 'provider is required' }, 400);
  }

  const providerConfig = Providers[provider];
  if (!providerConfig?.api) {
    return c.json({ ok: false, message: 'Unknown provider' }, 404);
  }

  try {
    // Get apiKey from provider config in store
    const uiConfig = await loadUiConfig();
    const providerConfigs = uiConfig.providers?.[provider as ProviderId];
    const matchedConfig = configId
      ? providerConfigs?.find((cfg) => cfg.id === configId)
      : providerConfigs?.[0];
    if (!matchedConfig) {
      return c.json(
        {
          ok: false,
          message: `Config not found for ${provider}${configId ? ` with configId ${configId}` : ''}. Please check your config key and baseURL.`,
        },
        404
      );
    }
    const apiKey = matchedConfig.apiKey || '';
    const baseUrl = matchedConfig.baseUrl;

    const providerOptions = { apiKey, customHost: baseUrl };

    const resolvedBaseURL = providerConfig.api.getBaseURL({
      providerOptions,
      fn: 'listModels',
      c: c,
      gatewayRequestURL: '',
      requestHeaders: {},
      params: {},
    });

    const endpoint = providerConfig.api.getEndpoint({
      c: c,
      providerOptions,
      fn: 'listModels',
      gatewayRequestBodyJSON: {},
      gatewayRequestBody: {},
      gatewayRequestURL: resolvedBaseURL + '/models',
    });

    const url = resolvedBaseURL + endpoint;
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
    const data = await response.json();

    return c.json(data);
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 500);
  }
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

  // When no API key provided but configId exists, look up stored credentials
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

  // Validate URL format
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
          // /models not available (common with Anthropic-format proxies) — continue to format detection
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
        // Some providers return HTTP 200 with auth errors in the body (e.g. ZhiPu /models)
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

    // Detect API format by trying both endpoints
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

    // Try /messages endpoint (Anthropic format)
    const messagesRes = await fetch(resolvedBaseUrl + '/messages', {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody),
    });

    // Try /chat/completions endpoint (OpenAI format)
    const chatRes = await fetch(resolvedBaseUrl + '/chat/completions', {
      method: 'POST',
      headers: testHeaders,
      body: JSON.stringify(testBody),
    });

    // 2xx = endpoint works. 401/403 = auth failure.
    const isAuthError = (status: number) => status === 401 || status === 403;

    // Some APIs return 404 or 400 when the model name is invalid (not because the endpoint is missing).
    // Check response body to distinguish "model not found" from "endpoint not found".
    const isModelNotFound = (status: number, data: Record<string, any> | null) => {
      if (status !== 400 && status !== 404) return false;
      if (!data) return false;
      const msg =
        data.error?.message || data.error?.toString() || data.message || '';
      return msg.toLowerCase().includes('model') || msg.includes('模型');
    };

    // Read response bodies for ALL statuses to detect API-level errors
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

    // If /models confirmed connectivity, trust it regardless of format detection
    if (modelsOk) {
      return c.json({
        ok: true,
        message: 'Connected successfully',
        apiFormat,
      });
    }

    // Format detection confirms connectivity
    if (messagesOk || chatOk) {
      return c.json({
        ok: true,
        message: 'Connected successfully',
        apiFormat,
      });
    }

    // One or both endpoints returned auth errors
    if (isAuthError(messagesRes.status) || isAuthError(chatRes.status)) {
      return c.json(
        { ok: false, message: 'Authentication failed — invalid API key' },
        200
      );
    }

    // /models returned 404 and format endpoints also failed — URL is likely wrong
    return c.json({ ok: false, message: 'Could not connect — check the base URL' }, 200);
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 200);
  }
});

export { adminApp };
