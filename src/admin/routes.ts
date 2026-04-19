import { Hono } from 'hono';
import { z } from 'zod';

import { listProviderSummaries, upsertProvider } from './config/store';
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

adminApp.get('/providers', async (c) => {
  const res = await listProviderSummaries();
  return c.json(res);
});

const ProviderUpdateSchema: z.ZodSchema<ProviderUpdateRequest> = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
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
