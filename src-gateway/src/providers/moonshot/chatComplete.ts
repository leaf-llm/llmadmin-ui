import { MOONSHOT } from '../../globals';
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

export const MoonshotChatCompleteConfig = chatCompleteParams(
  [],
  { model: 'moonshot-v1-8k' }
);

export const MoonshotChatCompleteResponseTransform: (
  response: any,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if ('message' in response && responseStatus !== 200) {
    return generateErrorResponse(
      {
        message: response.message,
        type: response.type,
        param: response.param,
        code: response.code,
      },
      MOONSHOT
    );
  }

  if ('choices' in response) {
    return buildOpenAIChatCompleteResponse(response, MOONSHOT);
  }

  return generateInvalidProviderResponseError(response, MOONSHOT);
};

export const MoonshotChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, MOONSHOT);
};
