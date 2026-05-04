import { DEEPSEEK } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformToAnthropicStopReason,
} from '../utils';
import { DEEPSEEK_STOP_REASON } from './types';

export const DeepSeekMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'deepseek-chat',
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
    default: 100,
    min: 0,
  },
  max_completion_tokens: {
    param: 'max_tokens',
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
};

interface DeepSeekMessagesResponse {
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
      content: string;
    };
    finish_reason: string | null;
  }[];
}

interface DeepSeekErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

export const DeepSeekMessagesResponseTransform = (
  response: DeepSeekMessagesResponse | DeepSeekErrorResponse,
  responseStatus: number,
  _responseHeaders: Headers,
  strictOpenAiCompliance: boolean
): MessagesResponse | ErrorResponse => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      DEEPSEEK
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
        response.choices[0]?.finish_reason as DEEPSEEK_STOP_REASON
      ),
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, DEEPSEEK);
};
