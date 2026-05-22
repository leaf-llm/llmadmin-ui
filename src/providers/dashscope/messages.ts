import { DASHSCOPE } from '../../globals';
import { Params } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformToAnthropicStopReason,
} from '../utils';

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
      return params.messages?.map((message) => {
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
};

interface DashScopeMessagesResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
    };
    finish_reason: string | null;
  }[];
}

interface DashScopeErrorResponse {
  error: {
    message: string;
    type: string;
    param: string | null;
    code: string | null;
  };
}

export const DashScopeMessagesResponseTransform = (
  response: DashScopeMessagesResponse | DashScopeErrorResponse,
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

  if ('choices' in response) {
    const message = response.choices[0]?.message;
    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: message?.content
        ? [{ type: 'text' as const, text: message.content }]
        : [],
      model: response.model,
      stop_reason: transformToAnthropicStopReason(
        (response.choices[0]?.finish_reason ?? undefined) as any
      ),
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, DASHSCOPE);
};
