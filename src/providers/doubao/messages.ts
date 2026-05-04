import { DOUBO } from '../../globals';
import { Params } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const DoubaoMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'doubao-seed-2.0-lite',
  },
  messages: {
    param: 'messages',
    required: true,
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
};

interface DoubaoMessagesResponse {
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

export const DoubaoMessagesResponseTransform = (
  response: DoubaoMessagesResponse | ErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if ('error' in response) {
    return generateErrorResponse(
      {
        message: (response as ErrorResponse).error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      DOUBO
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

  return generateInvalidProviderResponseError(response, DOUBO);
};
