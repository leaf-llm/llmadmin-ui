import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

let logId = 0;
const MAX_RESPONSE_LENGTH = 100000;

// Map to store all connected log clients
const logClients: Map<string | number, any> = new Map();

// In-memory metrics store: date string (YYYY-MM-DD) -> provider -> metrics
export type ProviderMetrics = {
  total: number;
  success: number;
  failure: number;
  inputTokens: number;
  outputTokens: number;
};
export type DailyMetrics = Map<string, ProviderMetrics>; // provider -> metrics
export const metricsStore: Map<string, DailyMetrics> = new Map();

function getDateKey(date: Date = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function getProvider(metrics: any): string {
  return metrics?.providerOptions?.provider || 'unknown';
}

function extractTokens(
  response: any,
  provider: string
): { inputTokens: number; outputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;

  // Try OpenAI format first (prompt_tokens, completion_tokens)
  if (response?.usage?.prompt_tokens !== undefined) {
    inputTokens = response.usage.prompt_tokens || 0;
    outputTokens = response.usage.completion_tokens || 0;
  }
  // Anthropic format (input_tokens, output_tokens)
  else if (response?.usage?.input_tokens !== undefined) {
    inputTokens = response.usage.input_tokens || 0;
    outputTokens = response.usage.output_tokens || 0;
  }
  // Google format (promptTokenCount, candidatesTokenCount)
  else if (response?.usageMetadata?.promptTokenCount !== undefined) {
    inputTokens = response.usageMetadata.promptTokenCount || 0;
    outputTokens = response.usageMetadata.candidatesTokenCount || 0;
  }

  return { inputTokens, outputTokens };
}

function recordMetrics(status: number, requestOptionsArray: any[]) {
  const dateKey = getDateKey();
  const provider = getProvider(requestOptionsArray[0] || {});

  let dailyProviders = metricsStore.get(dateKey);
  if (!dailyProviders) {
    dailyProviders = new Map();
    metricsStore.set(dateKey, dailyProviders);
  }

  let metrics = dailyProviders.get(provider);
  if (!metrics) {
    metrics = {
      total: 0,
      success: 0,
      failure: 0,
      inputTokens: 0,
      outputTokens: 0,
    };
    dailyProviders.set(provider, metrics);
  }

  metrics.total++;
  if (status >= 200 && status < 300) {
    metrics.success++;
  } else {
    metrics.failure++;
  }

  // Extract tokens from response if available
  const response = requestOptionsArray[0]?.response;
  if (response && typeof response === 'object') {
    const tokens = extractTokens(response, provider);
    metrics.inputTokens += tokens.inputTokens;
    metrics.outputTokens += tokens.outputTokens;
  }
}

export const addLogClient = (clientId: any, client: any) => {
  logClients.set(clientId, client);
};

export const removeLogClient = (clientId: any) => {
  logClients.delete(clientId);
};

const broadcastLog = async (log: any) => {
  const message = {
    data: log,
    event: 'log',
    id: String(logId++),
  };

  const deadClients: any = [];

  // Run all sends in parallel
  await Promise.all(
    Array.from(logClients.entries()).map(async ([id, client]) => {
      try {
        await Promise.race([
          client.sendLog(message),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Send timeout')), 1000)
          ),
        ]);
      } catch (error: any) {
        console.error(`Failed to send log to client ${id}:`, error.message);
        deadClients.push(id);
      }
    })
  );

  // Remove dead clients after iteration
  deadClients.forEach((id: any) => {
    removeLogClient(id);
  });
};

async function processLog(c: Context, start: number) {
  const ms = Date.now() - start;
  if (!c.req.url.includes('/v1/')) return;

  const requestOptionsArray = c.get('requestOptions');
  if (!requestOptionsArray?.length) {
    return;
  }

  try {
    const response = requestOptionsArray[0].requestParams.stream
      ? { message: 'The response was a stream.' }
      : await c.res.clone().json();

    const responseString = JSON.stringify(response);
    if (responseString.length > MAX_RESPONSE_LENGTH) {
      requestOptionsArray[0].response =
        responseString.substring(0, MAX_RESPONSE_LENGTH) + '...';
    } else {
      requestOptionsArray[0].response = response;
    }
  } catch (error) {
    console.error('Error processing log:', error);
  }

  await broadcastLog(
    JSON.stringify({
      time: new Date().toLocaleString(),
      method: c.req.method,
      endpoint: c.req.url.split(':8700')[1],
      targetUrl: requestOptionsArray[0]?.providerOptions?.requestURL || '',
      status: c.res.status,
      duration: ms,
      requestOptions: requestOptionsArray,
    })
  );

  recordMetrics(c.res.status, requestOptionsArray);
}

export const logHandler = () => {
  return async (c: Context, next: any) => {
    c.set('addLogClient', addLogClient);
    c.set('removeLogClient', removeLogClient);

    const start = Date.now();

    await next();

    const runtime = getRuntimeKey();

    if (runtime == 'workerd') {
      c.executionCtx.waitUntil(processLog(c, start));
    } else if (['node', 'bun', 'deno'].includes(runtime)) {
      processLog(c, start).then().catch(console.error);
    }
  };
};
