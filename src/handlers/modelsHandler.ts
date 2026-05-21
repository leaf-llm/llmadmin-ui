import { Context, Next } from 'hono';
import { HEADER_KEYS } from '../globals';
import { env } from 'hono/adapter';
import { loadUiConfig } from '../admin/config/store';

/**
 * Handles the models request. Returns a list of models supported by the Ai gateway.
 * Allows filters in query params for the provider
 * @param c - The Hono context
 * @returns - The response
 */
export const modelsHandler = async (context: Context, next: Next) => {
  const fetchOptions: Record<string, any> = {};
  fetchOptions['method'] = context.req.method;

  const controlPlaneURL = env(context).ALBUS_BASEPATH;

  const headers = Object.fromEntries(context.req.raw.headers);

  const authHeader = headers['Authorization'] || headers['authorization'];

  const apiKey =
    headers[HEADER_KEYS.API_KEY] || authHeader?.replace('Bearer ', '');
  let config: any = headers[HEADER_KEYS.CONFIG];
  if (config && typeof config === 'string') {
    try {
      config = JSON.parse(config);
    } catch {
      config = {};
    }
  }
  const providerHeader = headers[HEADER_KEYS.PROVIDER];
  const virtualKey = headers[HEADER_KEYS.VIRTUAL_KEY];

  const containsProvider =
    providerHeader || virtualKey || config?.provider || config?.virtual_key;

  if (containsProvider) {
    return next();
  }

  if (!controlPlaneURL) {
    return localModelsHandler(context);
  }

  // Strip gateway endpoint for models endpoint.
  const urlObject = new URL(context.req.url);
  const requestRoute = `${controlPlaneURL}${context.req.path.replace('/v1/', '/v2/')}${urlObject.search}`;
  fetchOptions['headers'] = {
    [HEADER_KEYS.API_KEY]: apiKey,
  };

  const resp = await fetch(requestRoute, fetchOptions);
  const body = await resp.json();

  // Inject llmadmin as a model
  if (body.data && Array.isArray(body.data)) {
    const hasLlmadmin = body.data.some((m: any) => m.id === 'llmadmin');
    if (!hasLlmadmin) {
      body.data.unshift({
        id: 'llmadmin',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'llmadmin',
      });
    }
  }

  return new Response(JSON.stringify(body), {
    status: resp.status,
    headers: {
      'content-type': 'application/json',
    },
  });
};

/**
 * Builds a local model list from configured providers with llmadmin injected.
 */
export const localModelsHandler = async (context: Context) => {
  try {
    const uiConfig = await loadUiConfig();
    const seen = new Set<string>();
    const models: Array<{
      id: string;
      object: string;
      created: number;
      owned_by: string;
    }> = [
      {
        id: 'llmadmin',
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: 'llmadmin',
      },
    ];
    seen.add('llmadmin');

    for (const category of ['text', 'image', 'audio', 'video'] as const) {
      const cfg = uiConfig[category];
      if (!cfg?.routing) continue;
      for (const entry of cfg.routing) {
        if (!seen.has(entry.model)) {
          seen.add(entry.model);
          models.push({
            id: entry.model,
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: entry.provider,
          });
        }
      }
    }

    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  } catch {
    return new Response(
      JSON.stringify({
        object: 'list',
        data: [
          {
            id: 'llmadmin',
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'llmadmin',
          },
        ],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  }
};
