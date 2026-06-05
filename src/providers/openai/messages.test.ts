import { ANTHROPIC_STOP_REASON } from '../../types/messagesResponse';
import { Params } from '../../types/requestBody';
import {
  OpenAIMessagesConfig,
  OpenAIMessagesResponseTransform,
  OpenAIMessagesStreamChunkTransform,
  transformAnthropicMessagesToOpenAI,
  transformAnthropicThinkingToOpenAI,
  transformAnthropicToolChoiceToOpenAI,
  transformAnthropicToolsToOpenAI,
  transformOpenAIFinishReasonToAnthropic,
} from './messages';

const getConfigEntry = (key: string) =>
  (OpenAIMessagesConfig as any)[key] as {
    param: string;
    transform?: Function;
    default?: any;
    required?: boolean;
    min?: number;
    max?: number;
  };

// =============================================================================
// Config
// =============================================================================

describe('OpenAIMessagesConfig', () => {
  it('declares model as required with a default', () => {
    const model = getConfigEntry('model');
    expect(model.param).toBe('model');
    expect(model.required).toBe(true);
    expect(model.default).toBe('gpt-4o');
  });

  it('declares max_tokens as required with a default of 4096', () => {
    const maxTokens = getConfigEntry('max_tokens');
    expect(maxTokens.param).toBe('max_tokens');
    expect(maxTokens.required).toBe(true);
    expect(maxTokens.default).toBe(4096);
    expect(maxTokens.min).toBe(1);
  });

  it('declares a transform for messages', () => {
    const messages = getConfigEntry('messages');
    expect(messages.param).toBe('messages');
    expect(typeof messages.transform).toBe('function');
  });

  it('declares a transform for tools and tool_choice', () => {
    expect(typeof getConfigEntry('tools').transform).toBe('function');
    expect(typeof getConfigEntry('tool_choice').transform).toBe('function');
  });
});

// =============================================================================
// transformAnthropicMessagesToOpenAI
// =============================================================================

describe('transformAnthropicMessagesToOpenAI', () => {
  it('converts a plain user text message', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [{ role: 'user', content: 'hi' }],
    } as Params);
    expect(result).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('collapses single-text-block user messages to a string', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    } as Params);
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('expands user messages with text + image URL to a content array', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look:' },
            {
              type: 'image',
              source: { type: 'url', url: 'https://x.test/img.png' },
            },
          ],
        },
      ],
    } as any);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe('user');
    expect(Array.isArray(result[0].content)).toBe(true);
    const parts = result[0].content as Array<Record<string, any>>;
    expect(parts[0]).toEqual({ type: 'text', text: 'Look:' });
    expect(parts[1]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://x.test/img.png', detail: 'auto' },
    });
  });

  it('converts base64 image source to a data URI', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: 'AAAA',
              },
            },
          ],
        },
      ],
    } as any);
    const parts = result[0].content as Array<Record<string, any>>;
    expect(parts[0].image_url.url).toBe('data:image/png;base64,AAAA');
  });

  it('converts assistant tool_use blocks to tool_calls with JSON-stringified arguments', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call_1',
              name: 'get_weather',
              input: { city: 'SF' },
            },
          ],
        },
      ],
    } as any);
    expect(result[0].role).toBe('assistant');
    expect(result[0].content).toBeNull();
    expect(result[0].tool_calls).toEqual([
      {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: JSON.stringify({ city: 'SF' }),
        },
      },
    ]);
  });

  it('emits tool_result blocks as separate tool role messages', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: 'sunny, 22C',
            },
          ],
        },
      ],
    } as any);
    expect(result).toEqual([
      { role: 'user', content: '' },
      { role: 'tool', tool_call_id: 'call_1', content: 'sunny, 22C' },
    ]);
  });

  it('prepends a system message from a string-typed top-level system field', () => {
    const result = transformAnthropicMessagesToOpenAI({
      system: 'You are a helpful assistant.',
      messages: [{ role: 'user', content: 'hi' }],
    } as any);
    expect(result[0]).toEqual({
      role: 'system',
      content: 'You are a helpful assistant.',
    });
    expect(result[1]).toEqual({ role: 'user', content: 'hi' });
  });

  it('joins TextBlock[] system into a single system message', () => {
    const result = transformAnthropicMessagesToOpenAI({
      system: [
        { type: 'text', text: 'line 1' },
        { type: 'text', text: 'line 2' },
      ],
      messages: [{ role: 'user', content: 'hi' }],
    } as any);
    expect(result[0]).toEqual({
      role: 'system',
      content: 'line 1\nline 2',
    });
  });

  it('preserves inline system/developer messages in order', () => {
    const result = transformAnthropicMessagesToOpenAI({
      system: 'top',
      messages: [
        { role: 'system', content: 'inline' },
        { role: 'user', content: 'hi' },
      ],
    } as any);
    expect(result.map((m) => m.content)).toEqual(['top', 'inline', 'hi']);
  });

  it('drops cache_control fields and thinking blocks from assistant history', () => {
    const result = transformAnthropicMessagesToOpenAI({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'reasoning...',
              cache_control: { type: 'ephemeral' },
            } as any,
            {
              type: 'thinking',
              thinking: 'hidden chain',
              signature: 'sig',
            } as any,
            { type: 'text', text: 'final answer' },
          ],
        },
      ],
    } as any);
    expect(result[0].content).toBe('reasoning...\nfinal answer');
    expect(result[0].tool_calls).toBeUndefined();
  });
});

// =============================================================================
// transformAnthropicToolsToOpenAI
// =============================================================================

describe('transformAnthropicToolsToOpenAI', () => {
  it('converts function tools to OpenAI function format', () => {
    const result = transformAnthropicToolsToOpenAI({
      tools: [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the weather',
            parameters: {
              type: 'object',
              properties: { city: { type: 'string' } },
            },
          },
        },
      ],
    } as any);
    expect(result).toEqual([
      {
        type: 'function',
        function: {
          name: 'get_weather',
          description: 'Get the weather',
          parameters: {
            type: 'object',
            properties: { city: { type: 'string' } },
          },
          strict: undefined,
        },
      },
    ]);
  });

  it('returns undefined for no tools', () => {
    expect(transformAnthropicToolsToOpenAI({} as any)).toBeUndefined();
  });
});

// =============================================================================
// transformAnthropicToolChoiceToOpenAI
// =============================================================================

describe('transformAnthropicToolChoiceToOpenAI', () => {
  it.each([
    ['auto', 'auto'],
    ['any', 'required'],
    ['none', 'none'],
  ] as const)('maps string "%s" to "%s"', (input, expected) => {
    expect(
      transformAnthropicToolChoiceToOpenAI({ tool_choice: input } as any)
    ).toBe(expected);
  });

  it('maps {type:"tool",name:"foo"} to {type:"function",function:{name:"foo"}}', () => {
    expect(
      transformAnthropicToolChoiceToOpenAI({
        tool_choice: { type: 'tool', name: 'foo' },
      } as any)
    ).toEqual({ type: 'function', function: { name: 'foo' } });
  });

  it('returns undefined for unknown shapes', () => {
    expect(
      transformAnthropicToolChoiceToOpenAI({
        tool_choice: { foo: 'bar' },
      } as any)
    ).toBeUndefined();
  });
});

// =============================================================================
// transformAnthropicThinkingToOpenAI
// =============================================================================

describe('transformAnthropicThinkingToOpenAI', () => {
  it.each([
    [500, 'low'],
    [1999, 'low'],
    [2000, 'medium'],
    [7999, 'medium'],
    [8000, 'high'],
    [50000, 'high'],
  ] as const)('maps budget_tokens=%i to %s', (budget, expected) => {
    expect(
      transformAnthropicThinkingToOpenAI({
        thinking: { type: 'enabled', budget_tokens: budget },
      } as any)
    ).toBe(expected);
  });

  it('returns undefined for {type:"disabled"}', () => {
    expect(
      transformAnthropicThinkingToOpenAI({
        thinking: { type: 'disabled' },
      } as any)
    ).toBeUndefined();
  });

  it('returns undefined for missing thinking field', () => {
    expect(transformAnthropicThinkingToOpenAI({} as any)).toBeUndefined();
  });
});

// =============================================================================
// transformOpenAIFinishReasonToAnthropic
// =============================================================================

describe('transformOpenAIFinishReasonToAnthropic', () => {
  it.each([
    ['stop', ANTHROPIC_STOP_REASON.end_turn],
    ['length', ANTHROPIC_STOP_REASON.max_tokens],
    ['tool_calls', ANTHROPIC_STOP_REASON.tool_use],
    ['function_call', ANTHROPIC_STOP_REASON.tool_use],
    ['content_filter', ANTHROPIC_STOP_REASON.end_turn],
    [null, ANTHROPIC_STOP_REASON.end_turn],
    [undefined, ANTHROPIC_STOP_REASON.end_turn],
  ] as const)('maps "%s" to %s', (input, expected) => {
    expect(transformOpenAIFinishReasonToAnthropic(input as any)).toBe(expected);
  });
});

// =============================================================================
// OpenAIMessagesResponseTransform
// =============================================================================

describe('OpenAIMessagesResponseTransform', () => {
  it('converts an OpenAI text response to a MessagesResponse with a text block', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        id: 'chatcmpl-1',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'hello' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
      },
      200
    );
    expect(result).toMatchObject({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'hello' }],
      model: 'gpt-4o',
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 3 },
    });
  });

  it('places reasoning_content in a thinking block ahead of text', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        id: 'chatcmpl-2',
        object: 'chat.completion',
        created: 1,
        model: 'o3-mini',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'final answer',
              reasoning_content: 'thinking...',
            },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      200
    );
    expect((result as any).content).toEqual([
      { type: 'thinking', thinking: 'thinking...', signature: 'openai-no-signature' },
      { type: 'text', text: 'final answer' },
    ]);
  });

  it('converts tool_calls to tool_use blocks with parsed input', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        id: 'chatcmpl-3',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"SF"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      },
      200
    );
    expect((result as any).content).toEqual([
      {
        type: 'tool_use',
        id: 'call_1',
        name: 'get_weather',
        input: { city: 'SF' },
      },
    ]);
    expect((result as any).stop_reason).toBe('tool_use');
  });

  it('falls back to empty input when tool arguments are not valid JSON', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        id: 'chatcmpl-4',
        object: 'chat.completion',
        created: 1,
        model: 'gpt-4o',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'f', arguments: '{not json' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      },
      200
    );
    expect((result as any).content[0].input).toEqual({});
  });

  it('returns an ErrorResponse for OpenAI error body', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        error: { message: 'bad', type: 'invalid_request_error', code: '400' },
      },
      400
    );
    expect(result).toMatchObject({
      error: { message: 'openai error: bad', code: '400' },
      provider: 'openai',
    });
  });

  it('passes through an Anthropic-shaped response and normalizes usage', () => {
    const result = OpenAIMessagesResponseTransform(
      {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'hi' }],
        model: 'claude-test',
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 2, output_tokens: 4 },
      },
      200
    );
    expect(result).toMatchObject({
      id: 'msg_1',
      type: 'message',
      content: [{ type: 'text', text: 'hi' }],
      usage: { input_tokens: 2, output_tokens: 4 },
    });
  });
});

// =============================================================================
// OpenAIMessagesStreamChunkTransform
// =============================================================================

describe('OpenAIMessagesStreamChunkTransform', () => {
  const makeState = () =>
    ({
      currentBlock: null as any,
      nextBlockIndex: 0,
      toolCalls: new Map(),
    }) as any;

  const parseEvents = (sse: string) =>
    sse
      .split('\n\n')
      .filter((s) => s.trim().length > 0)
      .map((block) => {
        const lines = block.split('\n');
        const evtLine = lines.find((l) => l.startsWith('event:'));
        const dataLine = lines.find((l) => l.startsWith('data:'));
        return {
          event: evtLine ? evtLine.slice(6).trim() : null,
          data: dataLine ? JSON.parse(dataLine.slice(5).trim()) : null,
        };
      });

  const streamChunk = (delta: any, extras: any = {}) => ({
    id: 'chatcmpl-stream',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        delta,
        finish_reason: null,
      },
    ],
    ...extras,
  });

  it('emits message_start exactly once across multiple chunks', () => {
    const state = makeState();
    const r1 = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      { model: 'gpt-4o' } as any
    );
    expect(parseEvents(r1!).map((e) => e.event)).toEqual(['message_start']);

    const r2 = OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'hello' })),
      'fb',
      state,
      false,
      { model: 'gpt-4o' } as any
    );
    expect(parseEvents(r2!).map((e) => e.event)).toEqual([
      'content_block_start',
      'content_block_delta',
    ]);
    // message_start should NOT appear again
    expect(parseEvents(r2!).some((e) => e.event === 'message_start')).toBe(
      false
    );
  });

  it('emits text events in order: start -> delta*N -> stop -> delta -> stop', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;

    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'Hel' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'lo' })),
      'fb',
      state,
      false,
      request
    );
    const final = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );

    // Deferred-stop: finish_reason chunk closes the text block and
    // emits message_delta with stop_reason, but does NOT emit
    // message_stop yet (waiting for the trailing usage chunk).
    const events = parseEvents(final!);
    expect(events.map((e) => e.event)).toEqual([
      'content_block_stop',
      'message_delta',
    ]);
    expect(events[0].data.index).toBe(0);
    expect(events[1].data.delta.stop_reason).toBe('end_turn');

    // Usage chunk finalizes the message with message_stop.
    const usage = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-4o',
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      'fb',
      state,
      false,
      request
    );
    const usageEvents = parseEvents(usage!);
    expect(usageEvents.map((e) => e.event)).toEqual([
      'message_delta',
      'message_stop',
    ]);
    expect(usageEvents[0].data.usage).toMatchObject({
      input_tokens: 1,
      output_tokens: 1,
    });
  });

  it('emits tool_use start, then input_json_delta per chunk, then stop', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;

    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );

    const r1 = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_abc',
                type: 'function',
                function: { name: 'get_weather', arguments: '' },
              },
            ],
          })
        ),
      'fb',
      state,
      false,
      request
    );
    const e1 = parseEvents(r1!);
    expect(e1.map((e) => e.event)).toEqual(['content_block_start']);
    expect(e1[0].data.content_block).toEqual({
      type: 'tool_use',
      id: 'call_abc',
      name: 'get_weather',
      input: {},
    });

    const r2 = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk({
            tool_calls: [{ index: 0, function: { arguments: '{"city":' } }],
          })
        ),
      'fb',
      state,
      false,
      request
    );
    const e2 = parseEvents(r2!);
    expect(e2).toHaveLength(1);
    expect(e2[0].event).toBe('content_block_delta');
    expect(e2[0].data.delta.partial_json).toBe('{"city":');

    const r3 = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk({
            tool_calls: [{ index: 0, function: { arguments: '"SF"}' } }],
          })
        ),
      'fb',
      state,
      false,
      request
    );
    const e3 = parseEvents(r3!);
    expect(e3[0].data.delta.partial_json).toBe('"SF"}');

    const final = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    // Deferred-stop: finish_reason chunk emits only message_delta (no
    // message_stop). The usage chunk (which OpenAI always sends with
    // stream_options.include_usage=true) follows.
    const finalEvents = parseEvents(final!);
    expect(finalEvents.map((e) => e.event)).toEqual([
      'content_block_stop',
      'message_delta',
    ]);
    expect(finalEvents[1].data.delta.stop_reason).toBe('tool_use');

    // Usage chunk finalizes the message.
    const usage = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-4o',
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      'fb',
      state,
      false,
      request
    );
    const usageEvents = parseEvents(usage!);
    expect(usageEvents.map((e) => e.event)).toEqual([
      'message_delta',
      'message_stop',
    ]);
    expect(usageEvents[0].data.usage).toMatchObject({
      input_tokens: 1,
      output_tokens: 1,
    });
  });

  it('emits two parallel tool_use blocks when two tool_calls share a chunk', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    const r = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'a', arguments: '{}' },
              },
              {
                index: 1,
                id: 'call_2',
                type: 'function',
                function: { name: 'b', arguments: '{}' },
              },
            ],
          })
        ),
      'fb',
      state,
      false,
      request
    );
    const events = parseEvents(r!);
    const starts = events.filter((e) => e.event === 'content_block_start');
    expect(starts).toHaveLength(2);
    expect(starts[0].data.index).toBe(0);
    expect(starts[1].data.index).toBe(1);
  });

  it('opens and closes a thinking block before opening a text block', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    const r1 = OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ reasoning_content: 'think...' })),
      'fb',
      state,
      false,
      request
    );
    expect(parseEvents(r1!).map((e) => e.event)).toEqual([
      'content_block_start',
      'content_block_delta',
    ]);
    expect(parseEvents(r1!)[0].data.content_block.type).toBe('thinking');

    const r2 = OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'answer' })),
      'fb',
      state,
      false,
      request
    );
    const events = parseEvents(r2!);
    expect(events.map((e) => e.event)).toEqual([
      'content_block_delta',
      'content_block_stop',
      'content_block_start',
      'content_block_delta',
    ]);
    expect(events[0].data.delta.type).toBe('signature_delta');
    expect(events[0].data.delta.signature).toBe('openai-no-signature');
    expect(events[1].data.index).toBe(0);
    expect(events[2].data.index).toBe(1);
    expect(events[2].data.content_block.type).toBe('text');
  });

  it('maps finish_reason "length" to stop_reason "max_tokens"', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'partial...' })),
      'fb',
      state,
      false,
      request
    );
    const final = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'length' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    const evt = parseEvents(final!).find((e) => e.event === 'message_delta');
    expect(evt!.data.delta.stop_reason).toBe('max_tokens');
  });

  it('captures usage in the final chunk into message_delta', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'done' })),
      'fb',
      state,
      false,
      request
    );
    const final = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            {
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              usage: {
                prompt_tokens: 11,
                completion_tokens: 7,
                total_tokens: 18,
              },
            }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    const evt = parseEvents(final!).find((e) => e.event === 'message_delta');
    expect(evt!.data.usage).toMatchObject({
      input_tokens: 11,
      output_tokens: 7,
    });
  });

  it('captures usage sent in a separate chunk after the stop chunk', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ content: 'done' })),
      'fb',
      state,
      false,
      request
    );
    // First terminating chunk: stop reason only, no usage.
    const stop = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    // Second terminating chunk: usage only, no choices.
    const usage = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-4o',
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 42,
            total_tokens: 142,
          },
        }),
      'fb',
      state,
      false,
      request
    );

    // With deferred-stop semantics, the finish_reason chunk closes the
    // open text block and emits message_delta with stop_reason, but
    // does NOT emit message_stop yet (waiting for the trailing usage
    // chunk).
    const stopEvents = parseEvents(stop!).map((e) => e.event);
    expect(stopEvents).toEqual(['content_block_stop', 'message_delta']);
    const stopDelta = parseEvents(stop!).find((e) => e.event === 'message_delta');
    expect(stopDelta!.data.delta.stop_reason).toBe('end_turn');
    // usage is still 0 on this delta — the real usage arrives next.
    expect(stopDelta!.data.usage).toMatchObject({
      input_tokens: 0,
      output_tokens: 0,
    });

    // Usage chunk re-emits message_delta with the actual usage AND then
    // emits message_stop. The Anthropic SDK snapshots the message on
    // message_stop, so this is the LAST message_delta it will see.
    const usageEvents = parseEvents(usage!);
    const usageDelta = usageEvents.find((e) => e.event === 'message_delta');
    expect(usageDelta).toBeDefined();
    expect(usageDelta!.data.usage).toMatchObject({
      input_tokens: 100,
      output_tokens: 42,
    });
    // stop_reason is omitted on the update delta (it was already set on the
    // previous message_delta).
    expect(usageDelta!.data.delta.stop_reason).toBeNull();
    // message_stop is now emitted — it must come AFTER the final
    // message_delta in event order.
    const eventOrder = usageEvents.map((e) => e.event);
    const deltaIdx = eventOrder.indexOf('message_delta');
    const stopIdx = eventOrder.indexOf('message_stop');
    expect(stopIdx).toBeGreaterThan(deltaIdx);
  });

  it('emits signature_delta for a thinking block that closes at stream end', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' + JSON.stringify(streamChunk({ reasoning_content: 'hmm' })),
      'fb',
      state,
      false,
      request
    );
    // Stream ends with a stop chunk and no following text content.
    const final = OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );

    const events = parseEvents(final!);
    const signatureDelta = events.find(
      (e) => e.event === 'content_block_delta' && e.data.delta?.type === 'signature_delta'
    );
    expect(signatureDelta).toBeDefined();
    expect(signatureDelta!.data.delta.signature).toBe('openai-no-signature');
  });

  it('force-finalizes via [DONE] when usage chunk never arrives', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    // Stop chunk arrives with no usage. With deferred-stop semantics
    // this emits ONLY message_delta — no message_stop yet.
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    // [DONE] arrives, no usage chunk ever came. The transform must
    // force-finalize so the SDK receives message_stop.
    const r = OpenAIMessagesStreamChunkTransform(
      'data: [DONE]',
      'fb',
      state,
      false,
      request
    );
    expect(r).toBeDefined();
    const events = parseEvents(r!);
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('message_delta');
    expect(eventNames).toContain('message_stop');
    // message_stop MUST come last.
    expect(eventNames[eventNames.length - 1]).toBe('message_stop');
  });

  it('ignores [DONE] after message_stop has been emitted', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(streamChunk({ role: 'assistant', content: '' })),
      'fb',
      state,
      false,
      request
    );
    // Stop chunk + usage chunk in the same logical stream (deferred stop
    // emits both message_stop and the final message_delta here).
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify(
          streamChunk(
            {},
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }
          )
        ),
      'fb',
      state,
      false,
      request
    );
    OpenAIMessagesStreamChunkTransform(
      'data: ' +
        JSON.stringify({
          id: 'chatcmpl-stream',
          object: 'chat.completion.chunk',
          created: 1,
          model: 'gpt-4o',
          choices: [],
          usage: {
            prompt_tokens: 1,
            completion_tokens: 1,
            total_tokens: 2,
          },
        }),
      'fb',
      state,
      false,
      request
    );
    // Now message_stop has been emitted. A subsequent [DONE] must be a
    // no-op.
    const r = OpenAIMessagesStreamChunkTransform(
      'data: [DONE]',
      'fb',
      state,
      false,
      request
    );
    expect(r).toBeUndefined();
  });

  it('synthesizes an empty end if [DONE] arrives with no preceding chunks', () => {
    const state = makeState();
    const request = { model: 'gpt-4o' } as any;
    const r = OpenAIMessagesStreamChunkTransform(
      'data: [DONE]',
      'fb',
      state,
      false,
      request
    );
    const events = parseEvents(r!);
    expect(events.map((e) => e.event)).toEqual([
      'message_start',
      'message_delta',
      'message_stop',
    ]);
    expect(events[1].data.delta.stop_reason).toBe('end_turn');
  });

  it('ignores unparseable chunks', () => {
    const state = makeState();
    const r = OpenAIMessagesStreamChunkTransform(
      'not json at all',
      'fb',
      state,
      false,
      undefined
    );
    expect(r).toBeUndefined();
  });
});
