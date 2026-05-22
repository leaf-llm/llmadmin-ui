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
  response: DoubaoMessagesResponse | ErrorResponse | Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'html-message' in response) {
    return generateErrorResponse(
      {
        message: response['html-message'] || `HTTP ${responseStatus}: API returned an unexpected response. Check the base URL and endpoint.`,
        type: 'api_error',
        param: null,
        code: String(responseStatus),
      },
      DOUBO
    );
  }

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

  // Handle Anthropic-format response
  if ('type' in response && (response as any).type === 'message') {
    const anthropicResponse = response as any;
    return {
      id: anthropicResponse.id,
      type: 'message' as const,
      role: anthropicResponse.role || 'assistant',
      content: anthropicResponse.content || [],
      model: anthropicResponse.model,
      stop_reason: anthropicResponse.stop_reason || null,
      stop_sequence: anthropicResponse.stop_sequence || null,
      usage: {
        input_tokens: anthropicResponse.usage?.input_tokens || 0,
        output_tokens: anthropicResponse.usage?.output_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, DOUBO);
};
