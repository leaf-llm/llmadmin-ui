import { ZHIPU } from '../../globals';
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

export const ZhipuChatCompleteConfig = chatCompleteParams(
  [],
  { model: 'glm-3-turbo' }
);

export const ZhipuChatCompleteResponseTransform: (
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
      ZHIPU
    );
  }

  if ('choices' in response) {
    return buildOpenAIChatCompleteResponse(response, ZHIPU);
  }

  return generateInvalidProviderResponseError(response, ZHIPU);
};

export const ZhipuChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, ZHIPU);
};
