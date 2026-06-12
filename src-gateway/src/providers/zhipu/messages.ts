import { ZHIPU } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { convertOpenAIChatCompletionToMessagesResponse } from '../open-ai-base';

export const ZhipuMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'glm-4-0520',
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
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
};

export const ZhipuMessagesResponseTransform = (
  response: Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      ZHIPU
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
    return convertOpenAIChatCompletionToMessagesResponse(response);
  }

  return generateInvalidProviderResponseError(response, ZHIPU);
};
