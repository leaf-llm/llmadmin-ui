import { GOOGLE_OPENAI } from '../../globals';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';
import {
  buildOpenAIChatCompleteResponse,
  parseSSEChunk,
  buildOpenAIStreamChunk,
} from '../open-ai-base';

export const GoogleOpenAIChatCompleteResponseTransform: (
  response: any,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
      ...response,
      provider: GOOGLE_OPENAI,
    } as ErrorResponse;
  }

  if ('choices' in response) {
    return buildOpenAIChatCompleteResponse(response, GOOGLE_OPENAI);
  }

  return generateInvalidProviderResponseError(response, GOOGLE_OPENAI);
};

export const GoogleOpenAIChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, GOOGLE_OPENAI);
};
