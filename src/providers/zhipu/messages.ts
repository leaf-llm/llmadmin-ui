import { ZHIPU } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

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

interface ZhipuMessagesResponse {
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

interface ZhipuErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

export const ZhipuMessagesResponseTransform = (
  response: ZhipuMessagesResponse | ZhipuErrorResponse,
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
      stop_reason: response.choices[0]?.finish_reason as any,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, ZHIPU);
};
