import { MINIMAX } from '../../globals';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import { convertOpenAIChatCompletionToMessagesResponse } from '../open-ai-base';

export const MinimaxMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'MiniMax-M2.7',
  },
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: -1,
  },
  stream: {
    param: 'stream',
    default: false,
  },
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
};

export const MinimaxMessagesResponseTransform = (
  response: Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'html-message' in response) {
    return generateErrorResponse(
      {
        message: response['html-message'] || 'Bad request',
        type: 'api_error',
        param: null,
        code: String(responseStatus),
      },
      MINIMAX
    );
  }

  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      MINIMAX
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

  return generateInvalidProviderResponseError(response, MINIMAX);
};
