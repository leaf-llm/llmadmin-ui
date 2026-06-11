import { UsageByModel, UsageResponse, UsageTotals } from '../../types';

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

function asModel(row: any): string | undefined {
  return (
    row?.model ??
    row?.name ??
    row?.line_item?.model ??
    row?.lineItem?.model ??
    undefined
  );
}

async function fetchWithFallbacks(args: {
  apiKey: string;
  organizationId?: string;
  from: string;
  to: string;
}) {
  const { apiKey, organizationId, from, to } = args;

  // Prefer ISO timestamps for broader API compatibility.
  const startTime = `${from}T00:00:00Z`;
  const endTime = `${to}T23:59:59Z`;

  const headers: Record<string, string> = {
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
    'x-api-key': apiKey,
  };

  // Some endpoints might also accept Authorization header.
  headers.Authorization = `Bearer ${apiKey}`;

  const endpoints: string[] = [
    // Best-effort endpoint guesses.
    `https://api.anthropic.com/v1/usage?start_time=${encodeURIComponent(
      startTime
    )}&end_time=${encodeURIComponent(endTime)}`,
  ];

  if (organizationId) {
    endpoints.push(
      `https://api.anthropic.com/v1/organizations/${encodeURIComponent(
        organizationId
      )}/usage?start_time=${encodeURIComponent(startTime)}&end_time=${encodeURIComponent(endTime)}`
    );
  }

  let lastErr: any = null;
  for (const url of endpoints) {
    const res = await fetch(url, { method: 'GET', headers }).catch((e) => {
      lastErr = e;
      return null as any;
    });
    if (!res) continue;

    const payload: any = await res.json().catch(() => ({}));
    if (res.ok) return payload;

    // Retry next endpoint if this one is missing.
    lastErr = payload ?? { status: res.status, message: res.statusText };
    if (res.status !== 404 && res.status !== 400) {
      // For other errors, don't spam multiple attempts.
      break;
    }
  }

  throw new Error(
    lastErr?.message ||
      lastErr?.error ||
      lastErr?.status ||
      'Anthropic billing request failed'
  );
}

export async function getAnthropicUsage(params: {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  from: string;
  to: string;
}): Promise<Pick<UsageResponse, 'totals' | 'byModel'>> {
  const payload = await fetchWithFallbacks({
    apiKey: params.apiKey,
    organizationId: params.organizationId,
    from: params.from,
    to: params.to,
  });

  const rows: any[] = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.results)
      ? payload.results
      : Array.isArray(payload?.models)
        ? payload.models
        : Array.isArray(payload?.usage?.models)
          ? payload.usage.models
          : [];

  if (
    rows.length === 0 &&
    payload?.usage &&
    typeof payload.usage === 'object'
  ) {
    // If we only have aggregate usage, return a single "unknown" row.
    const totals: UsageTotals = {};
    const baseInput = toNumber(
      (payload.usage as any)?.input_tokens ??
        (payload.usage as any)?.inputTokens
    );
    const cacheRead = toNumber(
      (payload.usage as any)?.cache_read_input_tokens ??
        (payload.usage as any)?.cacheReadInputTokens
    );
    const cacheCreate = toNumber(
      (payload.usage as any)?.cache_creation_input_tokens ??
        (payload.usage as any)?.cacheCreationInputTokens
    );
    const cacheTotal = (cacheRead ?? 0) + (cacheCreate ?? 0);
    const byModel: UsageByModel[] = [
      {
        model: 'unknown',
        requests: toNumber((payload.usage as any)?.requests),
        // Include cache input tokens in the total input count
        inputTokens:
          baseInput != null ? baseInput + cacheTotal : cacheTotal || undefined,
        outputTokens: toNumber(
          (payload.usage as any)?.output_tokens ??
            (payload.usage as any)?.outputTokens
        ),
        cacheInputTokens: cacheTotal || undefined,
        costUSD: toNumber(
          (payload.usage as any)?.cost ?? (payload.usage as any)?.total_cost
        ),
      },
    ];
    for (const r of byModel) {
      totals.requests = (totals.requests ?? 0) + (r.requests ?? 0);
      totals.inputTokens = (totals.inputTokens ?? 0) + (r.inputTokens ?? 0);
      totals.outputTokens = (totals.outputTokens ?? 0) + (r.outputTokens ?? 0);
      totals.cacheInputTokens =
        (totals.cacheInputTokens ?? 0) + (r.cacheInputTokens ?? 0);
      totals.costUSD = (totals.costUSD ?? 0) + (r.costUSD ?? 0);
    }
    return { totals, byModel };
  }

  const byModel: UsageByModel[] = rows.map((row) => {
    const baseInput = toNumber(
      row?.input_tokens ??
        row?.inputTokens ??
        row?.input_token_count ??
        row?.inputTokenCount
    );
    const cacheRead = toNumber(
      row?.cache_read_input_tokens ??
        row?.cacheReadInputTokens ??
        row?.cache_read_input_token_count
    );
    const cacheCreate = toNumber(
      row?.cache_creation_input_tokens ??
        row?.cacheCreationInputTokens ??
        row?.cache_creation_input_token_count
    );
    const cacheTotal = (cacheRead ?? 0) + (cacheCreate ?? 0);
    return {
      model: asModel(row),
      requests: toNumber(
        row?.requests ?? row?.request_count ?? row?.requestCount
      ),
      // Include cache input tokens in the total input count
      inputTokens:
        baseInput != null ? baseInput + cacheTotal : cacheTotal || undefined,
      outputTokens: toNumber(
        row?.output_tokens ??
          row?.outputTokens ??
          row?.output_token_count ??
          row?.outputTokenCount
      ),
      cacheInputTokens: cacheTotal || undefined,
      costUSD: toNumber(
        row?.cost ?? row?.total_cost ?? row?.totalCost ?? row?.amount
      ),
    };
  });

  const totals: UsageTotals = {};
  for (const r of byModel) {
    totals.requests = (totals.requests ?? 0) + (r.requests ?? 0);
    totals.inputTokens = (totals.inputTokens ?? 0) + (r.inputTokens ?? 0);
    totals.outputTokens = (totals.outputTokens ?? 0) + (r.outputTokens ?? 0);
    totals.cacheInputTokens =
      (totals.cacheInputTokens ?? 0) + (r.cacheInputTokens ?? 0);
    totals.costUSD = (totals.costUSD ?? 0) + (r.costUSD ?? 0);
  }

  return { totals, byModel };
}
