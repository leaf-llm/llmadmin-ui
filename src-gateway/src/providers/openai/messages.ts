import { OPEN_AI } from '../../globals';
import { ContentType, Message, Params } from '../../types/requestBody';
import {
  ContentBlock,
  MessagesResponse,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from '../../types/messagesResponse';
import {
  ANTHROPIC_MESSAGE_DELTA_EVENT,
  ANTHROPIC_MESSAGE_START_EVENT,
  ANTHROPIC_MESSAGE_STOP_EVENT,
} from '../anthropic-base/constants';
import { ANTHROPIC_STOP_REASON } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { OpenAIErrorResponseTransform } from './utils';

// =============================================================================
// Types
// =============================================================================

interface OpenAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | 'developer';
  content?: string | Array<Record<string, any>> | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
    strict?: boolean;
  };
}

interface OpenAIChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    reasoning_content?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: { name: string; arguments: string };
    }>;
  };
  finish_reason: string | null;
}

interface OpenAIChatCompleteResponseLike {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  system_fingerprint?: string;
}

interface OpenAIErrorResponseBody {
  error: {
    message: string;
    type?: string;
    param?: string | null;
    code?: string | null;
  };
}

interface OpenAIStreamChunkChoice {
  index: number;
  delta: {
    role?: 'assistant';
    content?: string | null;
    reasoning_content?: string;
    tool_calls?: Array<{
      index: number;
      id?: string;
      type?: 'function';
      function?: { name?: string; arguments?: string };
    }>;
  };
  finish_reason: string | null;
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIStreamChunkChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAIMessagesStreamState {
  messageStartSent?: boolean;
  messageStopEmitted?: boolean;
  model?: string;
  responseId?: string;
  nextBlockIndex: number;
  currentBlock:
    | { type: 'text'; index: number }
    | { type: 'thinking'; index: number }
    | { type: 'tool_use'; index: number; toolId: string; toolName: string }
    | null;
  toolCalls: Map<
    number,
    {
      anthropicIndex: number;
      id: string;
      name: string;
      argumentsAcc: string;
      started: boolean;
    }
  >;
  inputTokens?: number;
  outputTokens?: number;
  pendingStopReason?: string;
  thinkingSignatureEmitted?: boolean;
}

// =============================================================================
// Request transformation: Anthropic Messages API -> OpenAI Chat Completions
// =============================================================================

const safeJsonParse = (input: string | undefined): Record<string, any> => {
  if (!input) return {};
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      return parsed;
  } catch {
    // fall through
  }
  return {};
};

const transformUserMessage = (msg: Message): OpenAIChatMessage => {
  if (typeof msg.content === 'string') {
    return { role: 'user', content: msg.content };
  }
  if (Array.isArray(msg.content)) {
    const parts: Array<Record<string, any>> = [];
    for (const block of msg.content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && block.text != null) {
        parts.push({ type: 'text', text: block.text });
      } else if (block.type === 'image' && (block as any).source) {
        const source = (block as any).source;
        if (source.type === 'url' && source.url) {
          parts.push({
            type: 'image_url',
            image_url: { url: source.url, detail: 'auto' },
          });
        } else if (source.type === 'base64' && source.data) {
          const mediaType = source.media_type || 'image/jpeg';
          parts.push({
            type: 'image_url',
            image_url: {
              url: `data:${mediaType};base64,${source.data}`,
              detail: 'auto',
            },
          });
        }
      } else if (block.type === 'document' && (block as any).source) {
        // OpenAI chat/completions does not accept document content; best-effort
        // pass-through is not possible. Skip silently.
      } else if (block.type === 'tool_result') {
        // Nested tool_result inside a user turn - emit as a separate tool message
        // in the caller (handled in transformAnthropicMessagesToOpenAI).
      }
    }
    // If only a single text part, collapse to a string for OpenAI friendliness.
    if (parts.length === 1 && parts[0].type === 'text') {
      return { role: 'user', content: parts[0].text };
    }
    if (parts.length === 0) {
      // Only non-text blocks (e.g., tool_result) — OpenAI requires non-empty
      // content for user messages, so emit an empty string. The accompanying
      // tool message(s) carry the actual payload.
      return { role: 'user', content: '' };
    }
    return { role: 'user', content: parts };
  }
  return { role: 'user', content: '' };
};

const transformAssistantMessage = (msg: Message): OpenAIChatMessage => {
  if (typeof msg.content === 'string') {
    return { role: 'assistant', content: msg.content };
  }
  if (Array.isArray(msg.content)) {
    const textParts: string[] = [];
    const toolCalls: NonNullable<OpenAIChatMessage['tool_calls']> = [];
    for (const block of msg.content) {
      if (!block || typeof block !== 'object') continue;
      if (block.type === 'text' && block.text != null) {
        textParts.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: (block as any).id,
          type: 'function',
          function: {
            name: (block as any).name,
            arguments: JSON.stringify((block as any).input ?? {}),
          },
        });
      }
      // thinking / redacted_thinking are dropped — OpenAI does not round-trip
      // them, and re-injecting them as `reasoning_content` is not supported.
    }
    const result: OpenAIChatMessage = {
      role: 'assistant',
      content: textParts.length > 0 ? textParts.join('\n') : null,
    };
    if (toolCalls.length > 0) result.tool_calls = toolCalls;
    return result;
  }
  return { role: 'assistant', content: null };
};

const transformToolResultMessage = (msg: Message): OpenAIChatMessage | null => {
  if (msg.tool_call_id) {
    if (typeof msg.content === 'string') {
      return {
        role: 'tool',
        tool_call_id: msg.tool_call_id,
        content: msg.content,
      };
    }
    if (Array.isArray(msg.content)) {
      const text = msg.content
        .filter((b: any) => b && b.type === 'text' && b.text != null)
        .map((b: any) => b.text)
        .join('\n');
      return { role: 'tool', tool_call_id: msg.tool_call_id, content: text };
    }
  }
  return null;
};

const extractToolResultBlocks = (msg: Message): OpenAIChatMessage[] => {
  if (!Array.isArray(msg.content)) return [];
  const out: OpenAIChatMessage[] = [];
  for (const block of msg.content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'tool_result') {
      let content = '';
      if (typeof (block as any).content === 'string') {
        content = (block as any).content;
      } else if (Array.isArray((block as any).content)) {
        content = ((block as any).content as any[])
          .filter((b) => b && b.type === 'text' && b.text != null)
          .map((b) => b.text)
          .join('\n');
      }
      if ((block as any).is_error) {
        content = `[tool error] ${content}`;
      }
      out.push({
        role: 'tool',
        tool_call_id: (block as any).tool_use_id,
        content,
      });
    }
  }
  return out;
};

export const transformAnthropicMessagesToOpenAI = (
  params: Params
): OpenAIChatMessage[] => {
  const out: OpenAIChatMessage[] = [];
  const systemParts: string[] = [];

  // 1. Top-level system (string or TextBlock[]).
  if (params.system != null) {
    if (typeof params.system === 'string') {
      if (params.system.length > 0) systemParts.push(params.system);
    } else if (Array.isArray(params.system)) {
      const joined = params.system
        .filter((b: any) => b && b.type === 'text' && b.text != null)
        .map((b: any) => b.text)
        .join('\n');
      if (joined.length > 0) systemParts.push(joined);
    }
  }

  // 2. Collect all system/developer messages from the messages array.
  //    OpenAI only supports `role: "system"` at the START of the
  //    conversation. Inserting one between an assistant's `tool_calls`
  //    and the following tool messages is invalid (OpenAI requires tool
  //    messages to immediately follow the assistant turn). Merge them
  //    into a single leading system message instead.
  for (const msg of params.messages ?? []) {
    if (!msg || typeof msg !== 'object') continue;
    if (msg.role === 'system' || msg.role === 'developer') {
      if (typeof msg.content === 'string' && msg.content.length > 0) {
        systemParts.push(msg.content);
      } else if (Array.isArray(msg.content)) {
        const joined = msg.content
          .filter((b: any) => b && b.type === 'text' && b.text != null)
          .map((b: any) => b.text)
          .join('\n');
        if (joined.length > 0) systemParts.push(joined);
      }
    }
  }

  if (systemParts.length > 0) {
    out.push({ role: 'system', content: systemParts.join('\n\n') });
  }

  // 3. Walk non-system messages in order, extracting tool_result blocks
  //    into separate tool messages.
  for (const msg of params.messages ?? []) {
    if (!msg || typeof msg !== 'object') continue;
    if (msg.role === 'system' || msg.role === 'developer') {
      // Already collected into the leading system message above.
      continue;
    } else if (msg.role === 'user') {
      // Tool messages must immediately follow the assistant's tool_calls
      // per OpenAI spec — emit them BEFORE the user message.
      for (const tr of extractToolResultBlocks(msg)) out.push(tr);
      const userMsg = transformUserMessage(msg);
      // Skip empty user messages that only contained tool_results.
      const hasContent =
        typeof userMsg.content === 'string'
          ? userMsg.content.length > 0
          : Array.isArray(userMsg.content) && userMsg.content.length > 0;
      if (hasContent) out.push(userMsg);
    } else if (msg.role === 'assistant') {
      out.push(transformAssistantMessage(msg));
    } else if (msg.role === 'tool') {
      const tr = transformToolResultMessage(msg);
      if (tr) out.push(tr);
    } else if (msg.role === 'function') {
      // legacy OpenAI function-call result; treat as tool
      if (msg.tool_call_id) {
        out.push({
          role: 'tool',
          tool_call_id: msg.tool_call_id,
          content:
            typeof msg.content === 'string'
              ? msg.content
              : String(msg.content ?? ''),
        });
      }
    }
  }

  return out;
};

export const transformAnthropicToolsToOpenAI = (
  params: Params
): OpenAITool[] | undefined => {
  if (!params.tools || !Array.isArray(params.tools)) return undefined;
  const out: OpenAITool[] = [];
  for (const tool of params.tools) {
    if (!tool || typeof tool !== 'object') continue;
    if (tool.type === 'function' && tool.function) {
      // Already OpenAI-shaped: pass through.
      out.push({
        type: 'function',
        function: {
          name: tool.function.name,
          description: tool.function.description,
          parameters: tool.function.parameters,
          strict: tool.function.strict,
        },
      });
    } else if (tool.name && (tool as any).input_schema) {
      // Anthropic-shaped: {name, description?, input_schema} -> OpenAI function.
      out.push({
        type: 'function',
        function: {
          name: tool.name,
          description: (tool as any).description,
          parameters: (tool as any).input_schema,
        },
      });
    }
    // Non-function tools (web_search, code_execution, mcp_toolset, etc.)
    // have no OpenAI equivalent in chat/completions — skip them.
  }
  return out.length > 0 ? out : undefined;
};

export const transformAnthropicToolChoiceToOpenAI = (params: Params) => {
  const choice: any = params.tool_choice;
  if (choice == null) return undefined;
  if (typeof choice === 'string') {
    if (choice === 'any') return 'required';
    if (choice === 'auto' || choice === 'none') return choice;
    return undefined;
  }
  if (typeof choice === 'object') {
    if (choice.type === 'auto') return 'auto';
    if (choice.type === 'any') return 'required';
    if (choice.type === 'none') return 'none';
    if (choice.type === 'tool' && choice.name) {
      return { type: 'function', function: { name: choice.name } };
    }
  }
  return undefined;
};

export const transformAnthropicThinkingToOpenAI = (
  params: Params
): 'low' | 'medium' | 'high' | undefined => {
  const thinking: any = params.thinking;
  if (!thinking || typeof thinking !== 'object') return undefined;
  if (thinking.type === 'disabled') return undefined;
  if (
    thinking.type === 'enabled' &&
    typeof thinking.budget_tokens === 'number'
  ) {
    const budget = thinking.budget_tokens;
    if (budget < 2000) return 'low';
    if (budget < 8000) return 'medium';
    return 'high';
  }
  return undefined;
};

export const ensureIncludeUsage = (
  params: Params
): { include_usage: boolean } | undefined => {
  if (params.stream !== true) return undefined;
  if (params.stream_options && typeof params.stream_options === 'object')
    return params.stream_options as { include_usage: boolean };
  return { include_usage: true };
};

export const transformOpenAIFinishReasonToAnthropic = (
  reason?: string | null
): ANTHROPIC_STOP_REASON => {
  switch (reason) {
    case 'length':
      return ANTHROPIC_STOP_REASON.max_tokens;
    case 'tool_calls':
    case 'function_call':
      return ANTHROPIC_STOP_REASON.tool_use;
    case 'content_filter':
    case 'stop':
    case null:
    case undefined:
    case '':
    default:
      return ANTHROPIC_STOP_REASON.end_turn;
  }
};

// =============================================================================
// OpenAIMessagesConfig
// =============================================================================

export const OpenAIMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'gpt-4o',
  },
  messages: {
    param: 'messages',
    required: true,
    default: [],
    transform: (params: Params) => transformAnthropicMessagesToOpenAI(params),
  },
  // The top-level Anthropic `system` field is intentionally NOT mapped
  // here. `transformAnthropicMessagesToOpenAI` already reads
  // `params.system` and splices it into the head of the messages array
  // as a system-role turn, so a config entry for `system` is redundant.
  // It used to live here with `param: 'messages'` and a transform that
  // returned `undefined` — but that entry was processed AFTER `messages`
  // and would overwrite the real `messages` array with `undefined`,
  // causing the upstream request to be sent with no `messages` key.
  // (Google's OpenAI-compat surface rejects that with
  // `GenerateContentRequest.contents: contents is not specified`.)
  max_tokens: {
    param: 'max_tokens',
    required: true,
    default: 4096,
    min: 1,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 2,
  },
  top_p: {
    param: 'top_p',
    default: 1,
    min: 0,
    max: 1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  stop_sequences: {
    param: 'stop',
  },
  tools: {
    param: 'tools',
    required: false,
    transform: (params: Params) => transformAnthropicToolsToOpenAI(params),
  },
  tool_choice: {
    param: 'tool_choice',
    required: false,
    transform: (params: Params) => transformAnthropicToolChoiceToOpenAI(params),
  },
  metadata: {
    param: 'metadata',
    required: false,
  },
  thinking: {
    param: 'reasoning_effort',
    required: false,
    transform: (params: Params) => transformAnthropicThinkingToOpenAI(params),
  },
  stream_options: {
    param: 'stream_options',
    required: false,
    transform: (params: Params) => ensureIncludeUsage(params),
  },
  parallel_tool_calls: {
    param: 'parallel_tool_calls',
  },
  user: {
    param: 'user',
  },
  // OpenAI-only passthroughs.
  frequency_penalty: { param: 'frequency_penalty', min: -2, max: 2 },
  presence_penalty: { param: 'presence_penalty', min: -2, max: 2 },
  logit_bias: { param: 'logit_bias' },
  response_format: { param: 'response_format' },
  seed: { param: 'seed' },
  service_tier: { param: 'service_tier' },
};

// =============================================================================
// Response transform: OpenAI Chat Completions -> Anthropic MessagesResponse
// =============================================================================

export const OpenAIMessagesResponseTransform = (
  response:
    | OpenAIChatCompleteResponseLike
    | OpenAIErrorResponseBody
    | MessagesResponse
    | Record<string, any>,
  responseStatus: number,
  _responseHeaders?: Headers,
  _strictOpenAiCompliance?: boolean,
  _gatewayRequestUrl?: string,
  gatewayRequest?: Params
): MessagesResponse | ErrorResponse => {
  // 1. Error path: HTTP non-200 with OpenAI error body.
  if (responseStatus !== 200) {
    if ('error' in (response as any) && (response as any).error) {
      return OpenAIErrorResponseTransform(response as any, OPEN_AI);
    }
    if ('message' in (response as any) && !(response as any).choices) {
      return generateErrorResponse(
        {
          message: (response as any).message,
          type: (response as any).type ?? null,
          param: (response as any).param ?? null,
          code: (response as any).code ?? null,
        },
        OPEN_AI
      );
    }
  }

  // 2. Defensive: if the upstream somehow returned an Anthropic-shaped response,
  // normalize the usage block and pass through.
  if (
    'type' in (response as any) &&
    (response as any).type === 'message' &&
    Array.isArray((response as any).content)
  ) {
    const a = response as MessagesResponse;
    return {
      id: a.id,
      type: 'message',
      role: a.role || 'assistant',
      content: a.content,
      model: a.model,
      stop_reason: a.stop_reason ?? null,
      stop_sequence: a.stop_sequence ?? null,
      usage: {
        input_tokens: a.usage?.input_tokens ?? 0,
        output_tokens: a.usage?.output_tokens ?? 0,
      },
    };
  }

  // 3. OpenAI shape: build a MessagesResponse from `choices[0].message`.
  if (
    'choices' in (response as any) &&
    Array.isArray((response as any).choices)
  ) {
    const r = response as OpenAIChatCompleteResponseLike;
    const choice = r.choices?.[0];
    if (!choice) {
      return generateInvalidProviderResponseError(response as any, OPEN_AI);
    }
    const message = choice.message ?? ({} as any);
    const content: ContentBlock[] = [];

    // reasoning_content (o-series) -> thinking block. OpenAI does not
    // emit a real signature; use a non-empty sentinel so Anthropic-format
    // downstream consumers (Claude Code, Anthropic SDK) do not drop the
    // block from the final content array.
    if (message.reasoning_content && message.reasoning_content.length > 0) {
      const thinking: ThinkingBlock = {
        type: 'thinking',
        thinking: message.reasoning_content,
        signature: 'openai-no-signature',
      };
      content.push(thinking);
    }

    if (message.content && message.content.length > 0) {
      const text: TextBlock = { type: 'text', text: message.content };
      content.push(text);
    }

    if (Array.isArray(message.tool_calls)) {
      for (const tc of message.tool_calls) {
        const toolUse: ToolUseBlock = {
          type: 'tool_use',
          id: tc.id,
          name: tc.function?.name ?? '',
          input: safeJsonParse(tc.function?.arguments),
        };
        content.push(toolUse);
      }
    }

    return {
      id: r.id || `chatcmpl-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: r.model || (gatewayRequest?.model as string) || '',
      stop_reason: transformOpenAIFinishReasonToAnthropic(choice.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: r.usage?.prompt_tokens ?? 0,
        output_tokens: r.usage?.completion_tokens ?? 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response as any, OPEN_AI);
};

// =============================================================================
// Stream chunk transform: OpenAI SSE -> Anthropic SSE
// =============================================================================

const emitEvent = (event: string, data: any): string => {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
};

const closeBlock = (state: OpenAIMessagesStreamState): string => {
  if (!state.currentBlock) return '';
  let out = '';
  // For thinking blocks, emit a signature_delta before the stop event.
  // OpenAI (and Gemini's OpenAI-compat surface) do not produce a real
  // signature, but the Anthropic-format SDK drops signature-less thinking
  // blocks from the final accumulated content. Emit a non-empty sentinel
  // so the SDK keeps the block.
  if (
    state.currentBlock.type === 'thinking' &&
    !state.thinkingSignatureEmitted
  ) {
    out += emitEvent('content_block_delta', {
      type: 'content_block_delta',
      index: state.currentBlock.index,
      delta: { type: 'signature_delta', signature: 'openai-no-signature' },
    });
    state.thinkingSignatureEmitted = true;
  }
  out += emitEvent('content_block_stop', {
    type: 'content_block_stop',
    index: state.currentBlock.index,
  });
  state.currentBlock = null;
  return out;
};

const openBlock = (
  state: OpenAIMessagesStreamState,
  type: 'text' | 'thinking' | 'tool_use',
  contentBlock: Record<string, any>
): string => {
  const index = state.nextBlockIndex++;
  state.currentBlock =
    type === 'tool_use'
      ? {
          type: 'tool_use',
          index,
          toolId: contentBlock.id,
          toolName: contentBlock.name,
        }
      : { type, index };
  return emitEvent('content_block_start', {
    type: 'content_block_start',
    index,
    content_block: contentBlock,
  });
};

const openBlockAt = (
  state: OpenAIMessagesStreamState,
  type: 'text' | 'thinking' | 'tool_use',
  contentBlock: Record<string, any>,
  index: number
): string => {
  state.currentBlock =
    type === 'tool_use'
      ? {
          type: 'tool_use',
          index,
          toolId: contentBlock.id,
          toolName: contentBlock.name,
        }
      : { type, index };
  return emitEvent('content_block_start', {
    type: 'content_block_start',
    index,
    content_block: contentBlock,
  });
};

const ensureMessageStart = (
  state: OpenAIMessagesStreamState,
  chunk: OpenAIStreamChunk,
  fallbackId: string,
  gatewayRequest?: Params
): string => {
  if (state.messageStartSent) return '';
  state.messageStartSent = true;
  state.model = chunk.model || (gatewayRequest?.model as string) || '';
  state.responseId = chunk.id || fallbackId;
  const evt = JSON.parse(ANTHROPIC_MESSAGE_START_EVENT);
  evt.message.id = state.responseId;
  evt.message.model = state.model;
  if (chunk.usage?.prompt_tokens != null) {
    evt.message.usage.input_tokens = chunk.usage.prompt_tokens;
  }
  return emitEvent('message_start', evt);
};

const emitMessageStopEvents = (
  state: OpenAIMessagesStreamState,
  chunk: OpenAIStreamChunk,
  forceFinalize = false
): string => {
  // OpenAI (and Gemini's OpenAI-compat surface) typically send
  // `finish_reason` and `usage` in SEPARATE chunks — the usage chunk
  // arrives after the stop-reason chunk. The Anthropic SDK snapshots
  // the message on `message_stop` and IGNORES any subsequent
  // `message_delta` events (see Anthropic SDK's MessageStream.mjs,
  // case 'message_stop' -> maybeParseMessage(currentMessageSnapshot)).
  // So the LAST `message_delta` we emit MUST carry the real usage.
  //
  // That means we defer `message_stop` until the usage chunk (or
  // `[DONE]`) arrives. Flow:
  //   - no finish_reason seen yet -> nothing to do, capture usage
  //   - finish_reason chunk (no usage) -> emit message_delta with
  //     stop_reason and current (likely zero) usage. Do NOT emit
  //     message_stop.
  //   - usage chunk (after stop reason) -> emit message_delta with
  //     updated usage AND message_stop.
  //   - [DONE] with no usage chunk yet -> force-finalize and emit
  //     message_stop with whatever usage we have.

  // Pass 1: usage capture. Always update state if a usage field is present.
  if (chunk.usage) {
    if (chunk.usage.prompt_tokens != null)
      state.inputTokens = chunk.usage.prompt_tokens;
    if (chunk.usage.completion_tokens != null)
      state.outputTokens = chunk.usage.completion_tokens;
  }

  const hasFinishReason =
    chunk.choices?.[0]?.finish_reason != null &&
    chunk.choices?.[0]?.finish_reason !== '';

  // Capture the stop reason the first time we see it.
  if (hasFinishReason && !state.pendingStopReason) {
    state.pendingStopReason = chunk.choices[0].finish_reason ?? undefined;
  }

  // If we already finalized, ignore further chunks. (They shouldn't
  // arrive — the SSE stream is done — but guard anyway.)
  if (state.messageStopEmitted) return '';

  // Need a stop reason to even consider finalizing. Without one, just
  // capture usage and wait.
  if (!state.pendingStopReason) {
    if (forceFinalize) {
      // Force-finalize without a stop reason: synthesize a default
      // "end_turn" so the SDK receives message_stop.
      state.pendingStopReason = 'stop';
    } else {
      return '';
    }
  }

  // Defer message_stop if we have a stop reason but no usage yet, AND
  // the caller isn't forcing. We still want to close any open content
  // block and emit a message_delta so the SDK has *something* to track.
  const hasUsage = state.inputTokens != null || state.outputTokens != null;
  if (!hasUsage && !forceFinalize) {
    let out = '';
    // Close any open content block first.
    out += closeBlock(state);
    // Emit a message_delta with the stop_reason and current (zero)
    // usage so the SDK's snapshot is updated. The FINAL message_delta
    // with the real usage will come on the usage chunk.
    const deltaEvt = JSON.parse(ANTHROPIC_MESSAGE_DELTA_EVENT);
    deltaEvt.delta.stop_reason = transformOpenAIFinishReasonToAnthropic(
      state.pendingStopReason
    );
    if (state.inputTokens != null)
      deltaEvt.usage.input_tokens = state.inputTokens;
    if (state.outputTokens != null)
      deltaEvt.usage.output_tokens = state.outputTokens;
    out += emitEvent('message_delta', deltaEvt);
    return out;
  }

  let out = '';
  // Close any open content block first.
  out += closeBlock(state);

  // Emit message_delta with the REAL usage and stop_reason (this is the
  // last message_delta the SDK will see before message_stop snapshots
  // the message).
  const deltaEvt = JSON.parse(ANTHROPIC_MESSAGE_DELTA_EVENT);
  deltaEvt.delta.stop_reason = transformOpenAIFinishReasonToAnthropic(
    state.pendingStopReason
  );
  if (state.inputTokens != null)
    deltaEvt.usage.input_tokens = state.inputTokens;
  if (state.outputTokens != null)
    deltaEvt.usage.output_tokens = state.outputTokens;
  out += emitEvent('message_delta', deltaEvt);

  // Emit message_stop last. The SDK snapshots the message here, so this
  // MUST be the final event in the stream.
  out += `event: message_stop\ndata: ${JSON.stringify(ANTHROPIC_MESSAGE_STOP_EVENT)}\n\n`;
  state.messageStopEmitted = true;
  return out;
};

export const OpenAIMessagesStreamChunkTransform = (
  responseChunk: string,
  fallbackId: string,
  streamState: OpenAIMessagesStreamState,
  _strictOpenAiCompliance: boolean,
  gatewayRequest?: Params
): string | undefined => {
  // Lazy-init state.
  if (!streamState.currentBlock && streamState.currentBlock !== null) {
    streamState.currentBlock = null;
    streamState.nextBlockIndex = 0;
    streamState.toolCalls = new Map();
  }
  if (streamState.nextBlockIndex === undefined) streamState.nextBlockIndex = 0;
  if (!streamState.toolCalls) streamState.toolCalls = new Map();

  // Strip the SSE framing that readStream may have left in.
  const line = (responseChunk ?? '').replace(/^data:\s*/, '').trim();
  if (!line) return undefined;
  if (line === '[DONE]') {
    // Synthesize an empty end if we never sent message_start.
    if (!streamState.messageStartSent) {
      const emptyChunk: OpenAIStreamChunk = {
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: (gatewayRequest?.model as string) || '',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      };
      let out = ensureMessageStart(
        streamState,
        emptyChunk,
        fallbackId,
        gatewayRequest
      );
      // Force-finalize so we emit message_stop with stop_reason even
      // though the usage is all zeros.
      out += emitMessageStopEvents(streamState, emptyChunk, true);
      return out;
    }
    // Otherwise: force-finalize if we haven't emitted message_stop yet
    // (e.g., the stream ended without a finish_reason or usage chunk).
    // The SDK will hang if it never receives message_stop.
    if (!streamState.messageStopEmitted) {
      const emptyUsage: OpenAIStreamChunk = {
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: (gatewayRequest?.model as string) || '',
        choices: [],
      };
      return emitMessageStopEvents(streamState, emptyUsage, true) || undefined;
    }
    return undefined;
  }

  let chunk: OpenAIStreamChunk;
  try {
    chunk = JSON.parse(line) as OpenAIStreamChunk;
  } catch {
    return undefined;
  }

  // Handle error events from OpenAI.
  if ((chunk as any).error) {
    return emitEvent('error', {
      type: 'error',
      error: (chunk as any).error,
    });
  }

  let out = ensureMessageStart(streamState, chunk, fallbackId, gatewayRequest);

  const choice = chunk.choices?.[0];
  const delta = choice?.delta;

  // 1. Reasoning content (o-series chain-of-thought).
  if (
    delta &&
    typeof delta.reasoning_content === 'string' &&
    delta.reasoning_content.length > 0
  ) {
    if (
      !streamState.currentBlock ||
      streamState.currentBlock.type !== 'thinking'
    ) {
      out += closeBlock(streamState);
      out += openBlock(streamState, 'thinking', {
        type: 'thinking',
        thinking: '',
        signature: '',
      });
      streamState.thinkingSignatureEmitted = false;
    }
    out += emitEvent('content_block_delta', {
      type: 'content_block_delta',
      index: (streamState.currentBlock as { type: 'thinking'; index: number })
        .index,
      delta: { type: 'thinking_delta', thinking: delta.reasoning_content },
    });
  }

  // 2. Text content.
  if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
    if (!streamState.currentBlock || streamState.currentBlock.type !== 'text') {
      out += closeBlock(streamState);
      out += openBlock(streamState, 'text', { type: 'text', text: '' });
    }
    out += emitEvent('content_block_delta', {
      type: 'content_block_delta',
      index: (streamState.currentBlock as { type: 'text'; index: number })
        .index,
      delta: { type: 'text_delta', text: delta.content },
    });
  }

  // 3. Tool calls - may appear alongside text/reasoning in the same chunk.
  if (delta && Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0) {
    for (const tc of delta.tool_calls) {
      let entry = streamState.toolCalls.get(tc.index);
      if (!entry) {
        entry = {
          anthropicIndex: streamState.nextBlockIndex++,
          id: tc.id ?? `tool_call_${tc.index}`,
          name: tc.function?.name ?? '',
          argumentsAcc: '',
          started: false,
        };
        streamState.toolCalls.set(tc.index, entry);
      }
      if (tc.id) entry.id = tc.id;
      if (tc.function?.name) entry.name = tc.function.name;
      if (tc.function?.arguments) entry.argumentsAcc += tc.function.arguments;
    }
    // After the per-chunk update, emit start/delta for any tool that needs them.
    for (const [, entry] of streamState.toolCalls) {
      if (!entry.started && (entry.id || entry.name)) {
        out += closeBlock(streamState);
        out += openBlockAt(
          streamState,
          'tool_use',
          {
            type: 'tool_use',
            id: entry.id,
            name: entry.name,
            input: {},
          },
          entry.anthropicIndex
        );
        entry.started = true;
      }
      if (entry.argumentsAcc.length > 0) {
        out += emitEvent('content_block_delta', {
          type: 'content_block_delta',
          index: entry.anthropicIndex,
          delta: { type: 'input_json_delta', partial_json: entry.argumentsAcc },
        });
        entry.argumentsAcc = '';
      }
    }
  }

  // 4. Termination: finish_reason set on the last choice, or usage-only chunk.
  const isTerminatingChunk =
    (chunk.choices?.length === 0 && chunk.usage != null) ||
    (chunk.choices?.[0]?.finish_reason != null &&
      chunk.choices?.[0]?.finish_reason !== '');
  if (isTerminatingChunk) {
    out += emitMessageStopEvents(streamState, chunk);
  }

  return out.length > 0 ? out : undefined;
};
