import { DEEPSEEK } from '../../globals';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';
import { DEEPSEEK_STOP_REASON } from './types';
import {
  chatCompleteParams,
  buildOpenAIChatCompleteResponse,
  parseSSEChunk,
  buildOpenAIStreamChunk,
} from '../open-ai-base';

export const DeepSeekChatCompleteConfig: ProviderConfig = chatCompleteParams(
  [],
  { model: 'deepseek-chat' }
);

export const DeepSeekChatCompleteResponseTransform: (
  response: any,
  responseStatus: number,
  _responseHeaders?: Headers,
  strictOpenAiCompliance?: boolean
) => ChatCompletionResponse | ErrorResponse = (
  response,
  responseStatus,
  _responseHeaders,
  strictOpenAiCompliance
) => {
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
    return buildOpenAIChatCompleteResponse(response, DEEPSEEK, (c) => ({
      finish_reason: transformFinishReason(
        c.finish_reason as DEEPSEEK_STOP_REASON,
        strictOpenAiCompliance
      ),
    }));
  }

  return generateInvalidProviderResponseError(response, DEEPSEEK);
};

export const DeepSeekChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string,
  streamState: any,
  strictOpenAiCompliance: boolean,
  gatewayRequest: any
) => string = (
  responseChunk,
  _fallbackId,
  _streamState,
  strictOpenAiCompliance,
  _gatewayRequest
) => {
  const result = parseSSEChunk(responseChunk);
  if (result.done) {
    return `data: [DONE]\n\n`;
  }
  return buildOpenAIStreamChunk(result.data, DEEPSEEK, (_delta, choice) => ({
    finish_reason: choice.finish_reason
      ? transformFinishReason(
          choice.finish_reason as DEEPSEEK_STOP_REASON,
          strictOpenAiCompliance
        )
      : null,
  }));
};
