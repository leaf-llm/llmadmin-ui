import { Context } from 'hono';
import { getRuntimeKey } from 'hono/adapter';

let logId = 0;
const MAX_RESPONSE_LENGTH = 100000;
const MAX_METRICS_AGE_DAYS = 90;

// Map to store all connected log clients
const logClients: Map<string | number, any> = new Map();

type LogClientMode = 'log' | 'counts';
type LogClient = {
  sendLog: (message: any) => Promise<unknown> | unknown;
  mode?: LogClientMode;
};

const isLogClient = (c: any): c is LogClient => c && typeof c.sendLog === 'function';

// In-memory metrics store: date string (YYYY-MM-DD) -> provider -> metrics
export type ProviderMetrics = {
  total: number;
  success: number;
  failure: number;
  inputTokens: number;
  outputTokens: number;
  cacheInputTokens: number;
};
export type DailyMetrics = Map<string, ProviderMetrics>; // provider -> metrics
export const metricsStore: Map<string, DailyMetrics> = new Map();

function getDateKey(date: Date = new Date()): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// ---- Persistence ----

let _metricsSavePath: string | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

async function _getFs() {
  const { join } = await import('path');
  const { writeFile, readFile, mkdir } = await import('fs/promises');
  return { join, writeFile, readFile, mkdir };
}

async function getMetricsPath(): Promise<string> {
  if (_metricsSavePath) return _metricsSavePath;
  const { join } = await _getFs();
  _metricsSavePath = join(
    process.env.HOME || '',
    '.llm-admin',
    'metrics.json'
  );
  return _metricsSavePath;
}

type MetricsStoreSerialized = Record<
  string,
  Record<string, ProviderMetrics>
>;

function serializeStore(): MetricsStoreSerialized {
  const data: MetricsStoreSerialized = {};
  metricsStore.forEach((dailyProviders, dateKey) => {
    const providers: Record<string, ProviderMetrics> = {};
    dailyProviders.forEach((metrics, provider) => {
      providers[provider] = { ...metrics };
    });
    data[dateKey] = providers;
  });
  return data;
}

function deserializeStore(data: MetricsStoreSerialized) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_METRICS_AGE_DAYS);

  for (const [dateKey, providers] of Object.entries(data)) {
    if (new Date(dateKey) < cutoff) continue;
    const dailyProviders: DailyMetrics = new Map();
    for (const [provider, metrics] of Object.entries(providers)) {
      dailyProviders.set(provider, {
        total: metrics.total ?? 0,
        success: metrics.success ?? 0,
        failure: metrics.failure ?? 0,
        inputTokens: metrics.inputTokens ?? 0,
        outputTokens: metrics.outputTokens ?? 0,
        cacheInputTokens: metrics.cacheInputTokens ?? 0,
      });
    }
    if (dailyProviders.size > 0) {
      metricsStore.set(dateKey, dailyProviders);
    }
  }
}

// Debounced save (at most once per 5 seconds)
function scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(async () => {
    _saveTimer = null;
    try {
      const { writeFile, mkdir } = await _getFs();
      const path = await getMetricsPath();
      const dir = path.substring(0, path.lastIndexOf('/'));
      await mkdir(dir, { recursive: true });
      const serialized = serializeStore();
      await writeFile(path, JSON.stringify(serialized, null, 2), 'utf-8');
    } catch {
      // Silently ignore persistence errors — metrics are non-critical
    }
  }, 5000);
}

async function loadPersistedMetrics() {
  const runtime = getRuntimeKey();
  if (runtime !== 'node' && runtime !== 'bun') return;

  try {
    const { readFile } = await _getFs();
    const path = await getMetricsPath();
    const raw = await readFile(path, 'utf-8');
    const data: MetricsStoreSerialized = JSON.parse(raw);
    if (data && typeof data === 'object') {
      deserializeStore(data);
    }
  } catch {
    // File doesn't exist yet or is corrupt — start with empty store
  }
}

// Load persisted data on module init
loadPersistedMetrics();

function getProvider(metrics: any): string {
  return metrics?.providerOptions?.provider || 'unknown';
}

export function extractTokens(
  response: any,
  provider: string
): { inputTokens: number; outputTokens: number; cacheInputTokens: number } {
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheInputTokens = 0;

  // Try OpenAI format first (prompt_tokens, completion_tokens)
  // Note: OpenAI's prompt_tokens ALREADY includes cached_tokens, so we
  // don't add cacheInputTokens to inputTokens here.
  if (response?.usage?.prompt_tokens !== undefined) {
    inputTokens = response.usage.prompt_tokens || 0;
    outputTokens = response.usage.completion_tokens || 0;
    // OpenAI: { prompt_tokens_details: { cached_tokens: N } }
    cacheInputTokens = response.usage.prompt_tokens_details?.cached_tokens || 0;
  }
  // Anthropic format (input_tokens, output_tokens)
  // Note: Anthropic's input_tokens does NOT include cache reads/writes —
  // we must add them to get the true total input billed to the user.
  else if (response?.usage?.input_tokens !== undefined) {
    const cacheRead = response.usage.cache_read_input_tokens || 0;
    const cacheCreate = response.usage.cache_creation_input_tokens || 0;
    inputTokens =
      (response.usage.input_tokens || 0) + cacheRead + cacheCreate;
    outputTokens = response.usage.output_tokens || 0;
    // Anthropic reports cache hits/writes in dedicated fields
    cacheInputTokens = cacheRead || cacheCreate || 0;
  }
  // Google format (promptTokenCount, candidatesTokenCount)
  // Note: Google's promptTokenCount does NOT include cachedContentTokenCount.
  else if (response?.usageMetadata?.promptTokenCount !== undefined) {
    const cacheTokens = response.usageMetadata.cachedContentTokenCount || 0;
    inputTokens = (response.usageMetadata.promptTokenCount || 0) + cacheTokens;
    outputTokens = response.usageMetadata.candidatesTokenCount || 0;
    cacheInputTokens = cacheTokens;
  }

  return { inputTokens, outputTokens, cacheInputTokens };
}

function extractUsageFromSSE(text: string): Record<string, any> | null {
  if (text.length < 10 || !text.includes('"usage"')) return null;
  const lines = text.split('\n');
  // Walk backwards to find the last meaningful SSE data chunk (usually has usage)
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('data:') || line === 'data: [DONE]') continue;
    const jsonStr = line.substring(5).trim();
    if (!jsonStr) continue;
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed?.usage && typeof parsed.usage === 'object') {
        // OpenAI: { prompt_tokens, completion_tokens, total_tokens }
        if (parsed.usage.prompt_tokens !== undefined || parsed.usage.completion_tokens !== undefined) {
          return { usage: parsed.usage };
        }
        // Anthropic SSE delta might have usage_info
        if (parsed.usage.input_tokens !== undefined || parsed.usage.output_tokens !== undefined) {
          return { usage: parsed.usage };
        }
      }
      // Anthropic message_delta event: { usage: { output_tokens: N } }
      if (parsed?.delta?.usage || parsed?.usage) {
        const u = parsed.delta?.usage || parsed.usage;
        if (u.output_tokens !== undefined || u.input_tokens !== undefined) {
          return { usage: u };
        }
      }
    } catch {
      // Not valid JSON, keep looking
    }
  }
  return null;
}

async function tryReadStreamUsage(c: any): Promise<Record<string, any> | null> {
  try {
    const cloned = c.res.clone();
    // Limit read to 5 MB to prevent unbounded buffering
    const reader = cloned.body?.getReader();
    if (!reader) return null;
    const chunks: string[] = [];
    let totalSize = 0;
    const maxSize = 5 * 1024 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = typeof value === 'string' ? value : new TextDecoder().decode(value);
      chunks.push(text);
      totalSize += text.length;
      if (totalSize > maxSize) break;
    }
    const fullText = chunks.join('');
    return extractUsageFromSSE(fullText);
  } catch {
    return null;
  }
}

export function getCurrentTotals() {
  return {
    success: runtimeSuccess,
    failure: runtimeFailure,
    total: runtimeSuccess + runtimeFailure,
  };
}

let runtimeSuccess = 0;
let runtimeFailure = 0;

export function _resetRuntimeCountsForTest() {
  runtimeSuccess = 0;
  runtimeFailure = 0;
}

export function recordMetrics(status: number, requestOptionsArray: any[]) {
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
      cacheInputTokens: 0,
    };
    dailyProviders.set(provider, metrics);
  }

  metrics.total++;
  if (status >= 200 && status < 300) {
    metrics.success++;
    runtimeSuccess++;
  } else {
    metrics.failure++;
    runtimeFailure++;
  }

  // Extract tokens from response if available
  const response = requestOptionsArray[0]?.response;
  if (response && typeof response === 'object') {
    const tokens = extractTokens(response, provider);
    metrics.inputTokens += tokens.inputTokens;
    metrics.outputTokens += tokens.outputTokens;
    metrics.cacheInputTokens += tokens.cacheInputTokens;
  }

  // Persist to disk (debounced)
  scheduleSave();
}

export const addLogClient = (clientId: any, client: LogClient) => {
  logClients.set(clientId, client);
};

export const removeLogClient = (clientId: any) => {
  logClients.delete(clientId);
};

const sendToClients = async (
  message: any,
  predicate: (client: LogClient) => boolean,
) => {
  const deadClients: any = [];

  await Promise.all(
    Array.from(logClients.entries()).map(async ([id, client]) => {
      if (!isLogClient(client) || !predicate(client)) return;
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

  deadClients.forEach((id: any) => {
    removeLogClient(id);
  });
};

const QUIET_LOG = process.argv.includes('--quiet-log');

const broadcastLog = async (log: any) => {
  if (QUIET_LOG) return;
  const message = {
    data: log,
    event: 'log',
    id: String(logId++),
  };
  await sendToClients(message, (c) => c.mode === undefined || c.mode === 'log');
};

export const broadcastCounts = async () => {
  const totals = getCurrentTotals();
  const message = {
    data: JSON.stringify(totals),
    event: 'counts',
    id: String(logId++),
  };
  await sendToClients(message, (c) => c.mode === 'counts');
};

async function processLog(c: Context, start: number) {
  const ms = Date.now() - start;
  if (!c.req.url.includes('/v1/')) return;

  const requestOptionsArray = c.get('requestOptions') || [];

  let response: any;
  let responseStatus = c.res?.status || 0;

  try {
    if (requestOptionsArray.length > 0 && requestOptionsArray[0].requestParams?.stream) {
      // Try to extract usage from the streamed SSE response
      const streamUsage = await tryReadStreamUsage(c);
      response = streamUsage || { message: 'The response was a stream.' };
    } else if (requestOptionsArray.length > 0 && c.res) {
      response = await c.res.clone().json();
    } else {
      // Request was rejected early (e.g., by requestValidator) before requestOptions was set
      // Try to read the response body anyway
      try {
        response = await c.res?.clone()?.json();
      } catch {
        response = { message: 'Response not available' };
      }
    }

    const responseString = JSON.stringify(response);
    if (requestOptionsArray.length > 0 && responseString.length > MAX_RESPONSE_LENGTH) {
      requestOptionsArray[0].response =
        responseString.substring(0, MAX_RESPONSE_LENGTH) + '...';
    } else if (requestOptionsArray.length > 0) {
      requestOptionsArray[0].response = response;
    }
  } catch (error) {
    console.error('Error processing log:', error);
    response = { message: 'Error reading response' };
  }

  await broadcastLog(
    JSON.stringify({
      time: new Date().toLocaleString(),
      method: c.req.method,
      endpoint: c.req.url.split(':8700')[1],
      targetUrl: requestOptionsArray[0]?.providerOptions?.requestURL || '',
      status: responseStatus,
      duration: ms,
      requestOptions: requestOptionsArray,
    })
  );

  if (requestOptionsArray.length > 0) {
    recordMetrics(responseStatus, requestOptionsArray);
  }

  // Push a fresh aggregate snapshot to any counts-mode SSE client.
  await broadcastCounts();
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
