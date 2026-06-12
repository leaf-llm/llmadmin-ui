import { DOUBO } from '../../globals';
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

export const DoubaoChatCompleteConfig = chatCompleteParams(
  [],
  { model: 'doubao-seed-2-0-pro' }
);

export const DoubaoChatCompleteResponseTransform: (
  response: any,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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
        message: response.error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      DOUBO
    );
  }

  if ('choices' in response) {
    return buildOpenAIChatCompleteResponse(response, DOUBO);
  }

  return generateInvalidProviderResponseError(response, DOUBO);
};

export const DoubaoChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, DOUBO);
};
