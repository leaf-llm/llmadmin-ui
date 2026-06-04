import {
  metricsStore,
  getCurrentTotals,
  recordMetrics,
  addLogClient,
  removeLogClient,
  broadcastCounts,
  extractTokens,
  _resetRuntimeCountsForTest,
} from './index';

beforeEach(() => {
  metricsStore.clear();
  _resetRuntimeCountsForTest();
});

describe('getCurrentTotals', () => {
  test('returns zero counts at process start, before any request is recorded', () => {
    const totals = getCurrentTotals();
    expect(totals.success).toBe(0);
    expect(totals.failure).toBe(0);
    expect(totals.total).toBe(0);
  });

  test('persisted daily metrics do not contribute to runtime counters', () => {
    metricsStore.set(
      '2026-06-01',
      new Map([
        [
          'openai',
          {
            total: 99,
            success: 90,
            failure: 9,
            inputTokens: 0,
            outputTokens: 0,
            cacheInputTokens: 0,
          },
        ],
      ])
    );

    const totals = getCurrentTotals();
    expect(totals.success).toBe(0);
    expect(totals.failure).toBe(0);
    expect(totals.total).toBe(0);
  });

  test('aggregates success and failure across requests recorded since startup', () => {
    recordMetrics(
      200,
      [
        {
          providerOptions: { provider: 'openai' },
          requestParams: {},
          response: {},
        } as any,
      ]
    );
    recordMetrics(
      200,
      [
        {
          providerOptions: { provider: 'anthropic' },
          requestParams: {},
          response: {},
        } as any,
      ]
    );
    recordMetrics(
      500,
      [
        {
          providerOptions: { provider: 'openai' },
          requestParams: {},
          response: { error: 'boom' },
        } as any,
      ]
    );

    const totals = getCurrentTotals();
    expect(totals.success).toBe(2);
    expect(totals.failure).toBe(1);
    expect(totals.total).toBe(3);
  });
});

describe('broadcastCounts', () => {
  test('writes a counts SSE event to every registered client', async () => {
    const sentA: any[] = [];
    const sentB: any[] = [];
    const clientA = { sendLog: (m: any) => sentA.push(m), mode: 'counts' as const };
    const clientB = { sendLog: (m: any) => sentB.push(m), mode: 'counts' as const };
    addLogClient('a', clientA);
    addLogClient('b', clientB);

    recordMetrics(
      200,
      [
        {
          providerOptions: { provider: 'openai' },
          requestParams: {},
          response: {},
        } as any,
      ]
    );

    await broadcastCounts();

    expect(sentA).toHaveLength(1);
    expect(sentB).toHaveLength(1);
    const msgA = sentA[0];
    expect(msgA.event).toBe('counts');
    const payloadA = JSON.parse(msgA.data);
    expect(payloadA.success).toBe(1);
    expect(payloadA.failure).toBe(0);
    expect(payloadA.total).toBe(1);

    removeLogClient('a');
    removeLogClient('b');
  });

  test('does not send to clients whose mode is not counts', async () => {
    const sentLog: any[] = [];
    const logClient = { sendLog: (m: any) => sentLog.push(m), mode: 'log' as const };
    addLogClient('log-only', logClient);

    recordMetrics(
      200,
      [
        {
          providerOptions: { provider: 'openai' },
          requestParams: {},
          response: {},
        } as any,
      ]
    );

    await broadcastCounts();

    expect(sentLog).toHaveLength(0);
    removeLogClient('log-only');
  });
});

describe('extractTokens', () => {
  test('extracts Anthropic cache_read_input_tokens', () => {
    const result = extractTokens(
      {
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_read_input_tokens: 30,
        },
      },
      'anthropic'
    );
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.cacheInputTokens).toBe(30);
  });

  test('extracts Anthropic cache_creation_input_tokens when read is absent', () => {
    const result = extractTokens(
      {
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: 20,
        },
      },
      'anthropic'
    );
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.cacheInputTokens).toBe(20);
  });

  test('extracts OpenAI prompt_tokens_details.cached_tokens', () => {
    const result = extractTokens(
      {
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 3 },
        },
      },
      'openai'
    );
    expect(result.inputTokens).toBe(10);
    expect(result.outputTokens).toBe(5);
    expect(result.cacheInputTokens).toBe(3);
  });

  test('returns 0 cacheInputTokens for Google (no cache field)', () => {
    const result = extractTokens(
      {
        usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 4 },
      },
      'google'
    );
    expect(result.inputTokens).toBe(7);
    expect(result.outputTokens).toBe(4);
    expect(result.cacheInputTokens).toBe(0);
  });

  test('returns zeros for an empty response', () => {
    const result = extractTokens({}, 'openai');
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
    expect(result.cacheInputTokens).toBe(0);
  });
});

describe('recordMetrics cache token accumulation', () => {
  test('accumulates cacheInputTokens from Anthropic usage into metricsStore', () => {
    recordMetrics(200, [
      {
        providerOptions: { provider: 'anthropic' },
        requestParams: {},
        response: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_read_input_tokens: 30,
          },
        },
      } as any,
    ]);
    recordMetrics(200, [
      {
        providerOptions: { provider: 'anthropic' },
        requestParams: {},
        response: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            cache_creation_input_tokens: 20,
          },
        },
      } as any,
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const stored = metricsStore.get(today)?.get('anthropic');
    expect(stored).toBeDefined();
    expect(stored!.inputTokens).toBe(20);
    expect(stored!.outputTokens).toBe(10);
    expect(stored!.cacheInputTokens).toBe(50);
  });

  test('accumulates cacheInputTokens from OpenAI prompt_tokens_details', () => {
    recordMetrics(200, [
      {
        providerOptions: { provider: 'openai' },
        requestParams: {},
        response: {
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            prompt_tokens_details: { cached_tokens: 3 },
          },
        },
      } as any,
    ]);

    const today = new Date().toISOString().slice(0, 10);
    const stored = metricsStore.get(today)?.get('openai');
    expect(stored).toBeDefined();
    expect(stored!.cacheInputTokens).toBe(3);
  });
});
