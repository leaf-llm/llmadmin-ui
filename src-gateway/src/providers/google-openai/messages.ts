import { GOOGLE_OPENAI } from '../../globals';
import {
  ContentBlock,
  MessagesResponse,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
} from '../../types/messagesResponse';
import { Params } from '../../types/requestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import {
  OpenAIMessagesConfig,
  OpenAIMessagesStreamChunkTransform,
  transformAnthropicMessagesToOpenAI,
  transformAnthropicToolsToOpenAI,
  transformAnthropicToolChoiceToOpenAI,
  transformAnthropicThinkingToOpenAI,
  ensureIncludeUsage,
  transformOpenAIFinishReasonToAnthropic,
} from '../openai/messages';
import type { OpenAIMessagesStreamState } from '../openai/messages';

// =============================================================================
// Stream chunk transform: re-export the OpenAI one as-is.
// =============================================================================
//
// It is provider-agnostic: it emits Anthropic-format SSE events from
// OpenAI-format chunks and does not tag the provider name on the chunk
// itself. The provider name is stamped later on the final MessagesResponse.
export const GoogleOpenAIMessagesStreamChunkTransform =
  OpenAIMessagesStreamChunkTransform;

// =============================================================================
// GoogleOpenAIMessagesConfig
// =============================================================================
//
// Reuse OpenAI's messages config wholesale, but DROP the `system` entry from
// the spread. OpenAIMessagesConfig's `system` field is configured with
// `param: 'messages'` and a transform that returns `undefined`. Because
// `transformUsingProviderConfig` processes config keys in insertion order
// and calls `setNestedProperty` unconditionally, the `system` entry would
// run AFTER `messages` had already been set, overwriting the real
// `messages` array with `undefined`. `JSON.stringify` then drops the
// `undefined` value, so the upstream request would be sent with no
// `messages` key at all — which Google's OpenAI-compat surface rejects
// with `GenerateContentRequest.contents: contents is not specified`.
//
// The `system` entry is also redundant: the `messages` transform
// (`transformAnthropicMessagesToOpenAI`) already reads `params.system`
// and splices it into the head of the messages array as a system-role
// turn. So dropping the config entry is a no-op semantically.
//
// Other overrides vs. OpenAIMessagesConfig:
//   - default model is Gemini's flagship (Google has no `gpt-4o` equivalent)
//   - the `messages` field drops `default: []`. OpenAIMessagesConfig marks
//     `messages` as `required: true` with `default: []`, which causes the
//     gateway to inject an empty `messages: []` when the caller omits the
//     field. Google's OpenAI-compat surface rejects empty arrays with a 400,
//     so we let the caller's body reach Google as-is (no `messages` key) and
//     let Google respond with its own 400 instead.
//   - the `metadata` field is dropped. `metadata` is an Anthropic-specific
//     concept (it shows up in OpenAIMessagesConfig as a passthrough) and is
//     not part of OpenAI's Chat Completions schema. Google's OpenAI-compat
//     surface rejects unknown fields with a 400. We return `undefined` from
//     the transform — `JSON.stringify` drops keys with undefined values, so
//     the field is omitted from the outbound body.
const { system: _dropSystem, ...openAIMessagesConfigWithoutSystem } =
  OpenAIMessagesConfig;
void _dropSystem;
export const GoogleOpenAIMessagesConfig: ProviderConfig = {
  ...openAIMessagesConfigWithoutSystem,
  model: {
    param: 'model',
    required: true,
    default: 'gemini-1.5-pro',
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => transformAnthropicMessagesToOpenAI(params),
  },
  metadata: {
    param: 'metadata',
    required: false,
    transform: () => undefined,
  },
};

// =============================================================================
// Response transform: OpenAI Chat Completions -> Anthropic MessagesResponse
// =============================================================================
//
// Mirrors `OpenAIMessagesResponseTransform` from `../openai/messages` but
// stamps the provider as `GOOGLE_OPENAI` instead of `OPEN_AI` for both the
// success and error paths.

interface GoogleOpenAIChoice {
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

interface GoogleOpenAIChatCompleteResponseLike {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: GoogleOpenAIChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface GoogleOpenAIErrorResponseBody {
  error: {
    message: string;
    type?: string;
    param?: string | null;
    code?: string | null;
  };
}

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

export const GoogleOpenAIMessagesResponseTransform = (
  response:
    | GoogleOpenAIChatCompleteResponseLike
    | GoogleOpenAIErrorResponseBody
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
    // 1a. Google's OpenAI-compat surface sometimes returns validation
    // errors as a JSON array of `{ error: {...} }` objects instead of the
    // standard OpenAI `{ error: {...} }` shape (e.g. when the request is
    // missing required fields like `messages`). Detect that case and
    // unwrap the first element so it can flow through the normal
    // OpenAIErrorResponseTransform path.
    if (Array.isArray(response)) {
      const firstWithError = (response as any[]).find(
        (item) => item && typeof item === 'object' && item.error
      );
      if (firstWithError) {
        return OpenAIErrorResponseTransform(firstWithError, GOOGLE_OPENAI);
      }
    }
    if ('error' in (response as any) && (response as any).error) {
      return OpenAIErrorResponseTransform(response as any, GOOGLE_OPENAI);
    }
    if ('message' in (response as any) && !(response as any).choices) {
      return generateErrorResponse(
        {
          message: (response as any).message,
          type: (response as any).type ?? null,
          param: (response as any).param ?? null,
          code: (response as any).code ?? null,
        },
        GOOGLE_OPENAI
      );
    }
  }

  // 2. Defensive: if upstream returned an Anthropic-shaped response, normalize
  // the usage block and pass through.
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
    const r = response as GoogleOpenAIChatCompleteResponseLike;
    const choice = r.choices?.[0];
    if (!choice) {
      return generateInvalidProviderResponseError(response as any, GOOGLE_OPENAI);
    }
    const message = choice.message ?? ({} as any);
    const content: ContentBlock[] = [];

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

  return generateInvalidProviderResponseError(response as any, GOOGLE_OPENAI);
};

// Re-export the request-side helpers so callers that need to override the
// default request transform can import them from this module too.
export {
  transformAnthropicMessagesToOpenAI,
  transformAnthropicToolsToOpenAI,
  transformAnthropicToolChoiceToOpenAI,
  transformAnthropicThinkingToOpenAI,
  ensureIncludeUsage,
  transformOpenAIFinishReasonToAnthropic,
};
export type { OpenAIMessagesStreamState };
