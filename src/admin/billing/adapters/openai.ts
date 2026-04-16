import { UsageByModel, UsageResponse, UsageTotals } from '../../types';

function toNumber(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

function asModel(row: any): string | undefined {
  return (
    row?.model ??
    row?.line_item?.model ??
    row?.lineItem?.model ??
    row?.name ??
    row?.product_code ??
    undefined
  );
}

export async function getOpenAIUsage(params: {
  apiKey: string;
  organizationId?: string;
  projectId?: string;
  from: string;
  to: string;
}): Promise<Pick<UsageResponse, 'totals' | 'byModel'>> {
  const url = new URL('https://api.openai.com/v1/dashboard/billing/usage');
  url.searchParams.set('start_date', params.from);
  url.searchParams.set('end_date', params.to);
  if (params.projectId) url.searchParams.set('project_id', params.projectId);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      ...(params.organizationId
        ? { 'OpenAI-Organization': params.organizationId }
        : {}),
    },
  });

  const payload: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      `OpenAI billing request failed: HTTP ${res.status}`;
    throw new Error(msg);
  }

  const rows: any[] = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.results)
      ? payload.results
      : [];

  const byModel: UsageByModel[] = rows.map((row) => {
    return {
      model: asModel(row),
      requests: toNumber(
        row?.requests ?? row?.request_count ?? row?.requestCount
      ),
      inputTokens: toNumber(
        row?.input_tokens ?? row?.inputTokens ?? row?.input_token_count
      ),
      outputTokens: toNumber(
        row?.output_tokens ?? row?.outputTokens ?? row?.output_token_count
      ),
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
    totals.costUSD = (totals.costUSD ?? 0) + (r.costUSD ?? 0);
  }

  return { totals, byModel };
}
