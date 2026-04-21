import { Hono } from 'hono';
import { z } from 'zod';

import {
  listProviderSummaries,
  upsertProvider,
  loadUserConfig,
  saveUserConfig,
  loadUiConfig,
} from './config/store';
import { getUsage } from './billing';
import { ProviderId, ProviderUpdateRequest } from './types';

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

adminApp.get('/config', async (c) => {
  const config = await loadUserConfig();
  return c.json({ config });
});

/**
 * Auto-generate Portkey config from active providers.
 * - Has primary: primary as main, others as fallback (loadbalance on 429/500/503/504)
 * - No primary: all active providers in loadbalance
 */
async function generateConfigFromProviders(): Promise<Record<string, unknown>> {
  const uiConfig = await loadUiConfig();
  const { providers, primaryProvider } = uiConfig;

  const activeProviders: Array<{
    provider: string;
    apiKey: string;
    baseUrl?: string;
  }> = [];
  for (const [provider, p] of Object.entries(providers)) {
    if (p?.apiKey?.trim()) {
      activeProviders.push({
        provider,
        apiKey: p.apiKey!.trim(),
        baseUrl: p.baseUrl?.trim() || undefined,
      });
    }
  }

  if (activeProviders.length === 0) {
    throw new Error(
      'No active providers configured. Add provider API keys first.'
    );
  }

  const targets = activeProviders.map((p) => {
    const target: Record<string, unknown> = {
      provider: p.provider,
      api_key: p.apiKey,
    };
    if (p.baseUrl) {
      target.custom_host = p.baseUrl;
    }
    return target;
  });

  // Has primary → fallback strategy with primary first
  if (primaryProvider && activeProviders.length > 1) {
    const primary = targets.find((t) => t.provider === primaryProvider);
    if (primary) {
      const fallbacks = targets.filter((t) => t.provider !== primaryProvider);
      return {
        strategy: {
          mode: 'fallback',
          on_status_codes: [429, 500, 502, 503, 504],
        },
        targets: [primary, ...fallbacks],
      };
    }
  }

  // No primary or single provider → loadbalance all
  return {
    strategy: {
      mode: 'loadbalance',
    },
    targets,
  };
}

adminApp.post('/config', async (c) => {
  try {
    const generatedConfig = await generateConfigFromProviders();
    await saveUserConfig(generatedConfig);
    return c.json({ ok: true, config: generatedConfig });
  } catch (err: any) {
    return c.json({ ok: false, message: err.message }, 400);
  }
});

adminApp.delete('/config', async (c) => {
  await saveUserConfig(null);
  return c.json({ ok: true });
});

adminApp.get('/providers', async (c) => {
  const res = await listProviderSummaries();
  return c.json(res);
});

const ProviderUpdateSchema: z.ZodSchema<ProviderUpdateRequest> = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    setAsPrimary: z.boolean().optional(),
  })
  .partial();

adminApp.put('/providers/:provider', async (c) => {
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

  const res = await upsertProvider(provider, parsed.data);
  return c.json({ ok: true, ...res });
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

export { adminApp };
