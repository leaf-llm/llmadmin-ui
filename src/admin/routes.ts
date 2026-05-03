import { Hono } from 'hono';
import { z } from 'zod';

import {
  listProviderSummaries,
  upsertProvider,
  loadUserConfig,
  saveUserConfig,
  loadUiConfig,
  saveUiConfig,
  listRouting,
  addToRouting,
  removeFromRouting,
  updateRoutingPrimary,
  validateUiConfig,
  DEFAULT_BASE_URLS,
} from './config/store';
import { getUsage } from './billing';
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
  // CORS (primarily for local UI)
  const origin = c.req.header('origin');
  if (origin && origin.startsWith('http://localhost:5173')) {
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
 * - Has primary models: primary models first, others as fallback (loadbalance on 429/500/503/504)
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

  // Sort: primary entries first
  const sortedRouting = [...routing].sort((a, b) => {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return 0;
  });

  // Build targets from routing entries (sorted)
  const targets: Record<string, unknown>[] = [];
  for (const entry of sortedRouting) {
    const configs = providers[entry.provider];
    const p = configs?.[0]; // Use first config entry
    if (!p?.apiKey?.trim()) {
      continue; // Skip if provider has no apiKey
    }
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
    targets.push(target);
  }

  if (targets.length === 0) {
    throw new Error('No valid routing entries. Add models to routing first.');
  }

  // Check if there are primary entries
  const hasPrimary = sortedRouting.some((r) => r.isPrimary);

  // Has primary → fallback strategy with primary first
  if (hasPrimary && targets.length > 1) {
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

adminApp.get('/config/export', async (c) => {
  try {
    const config = await loadUiConfig();
    return c.json({ config });
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
  try {
    const res = await removeFromRouting(category, provider, model);
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

// Provider model catalog - fetch available models from provider's /models endpoint
adminApp.get('/provider-models', async (c) => {
  const provider = c.req.query('provider');
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
    const firstConfig = providerConfigs?.[0];
    const apiKey = firstConfig?.apiKey || '';

    const providerOptions = { apiKey };

    const baseURL = providerConfig.api.getBaseURL({
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
      gatewayRequestURL: baseURL + '/models',
    });

    const url = baseURL + endpoint;
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

export { adminApp };
