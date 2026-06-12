import { MINIMAX } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';
import {
  chatCompleteParams,
  buildOpenAIChatCompleteResponse,
  parseSSEChunk,
  buildOpenAIStreamChunk,
} from '../open-ai-base';

export const MinimaxChatCompleteConfig = chatCompleteParams(
  [],
  { model: 'MiniMax-M2.7' },
  {
    max_tokens: { param: 'max_tokens', required: true, min: 0 },
    temperature: { param: 'temperature', min: 0, max: 1 },
    top_p: { param: 'top_p', default: -1 },
  }
);

export const MinimaxChatCompleteResponseTransform: (
  response: any,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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

  if ('choices' in response) {
    return buildOpenAIChatCompleteResponse(response, MINIMAX);
  }

  return generateInvalidProviderResponseError(response, MINIMAX);
};

export const MinimaxChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, _fallbackId) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, MINIMAX);
};
