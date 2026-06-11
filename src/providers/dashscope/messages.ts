import { DASHSCOPE } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformToAnthropicStopReason,
} from '../utils';
import { convertOpenAIChatCompletionToMessagesResponse } from '../open-ai-base';

export const DashScopeMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'qwen-turbo',
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      return params.messages?.map((message: Message) => {
        if (message.role === 'developer') return { ...message, role: 'system' };
        return message;
      });
    },
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
    default: 100,
    min: 0,
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
  stop: {
    param: 'stop',
  },
  top_k: {
    param: 'top_k',
  },
  repetition_penalty: {
    param: 'repetition_penalty',
  },
  enable_search: {
    param: 'enable_search',
  },
  enable_thinking: {
    param: 'enable_thinking',
  },
  thinking_budget: {
    param: 'thinking_budget',
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
};

export const DashScopeMessagesResponseTransform = (
  response: Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type,
        param: response.error.param,
        code: response.error.code,
      },
      DASHSCOPE
    );
  }

  // Anthropic-format response from provider's /messages endpoint
  if ('type' in response && (response as any).type === 'message') {
    const r = response as any;
    return {
      id: r.id,
      type: 'message' as const,
      role: r.role || 'assistant',
      content: r.content || [],
      model: r.model,
      stop_reason: r.stop_reason || null,
      stop_sequence: r.stop_sequence || null,
      usage: {
        input_tokens: r.usage?.input_tokens || 0,
        output_tokens: r.usage?.output_tokens || 0,
      },
    };
  }

  // OpenAI-format fallback
  if ('choices' in response) {
    const result = convertOpenAIChatCompletionToMessagesResponse(response);
    result.stop_reason = transformToAnthropicStopReason(
      (response.choices[0]?.finish_reason ?? undefined) as any
    );
    return result;
  }

  return generateInvalidProviderResponseError(response, DASHSCOPE);
};
