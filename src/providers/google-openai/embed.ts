import { GOOGLE_OPENAI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ErrorResponse, ProviderConfig } from '../types';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { generateInvalidProviderResponseError } from '../utils';

export const GoogleOpenAIEmbedConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'text-embedding-004',
  },
  input: {
    param: 'input',
    required: true,
  },
  encoding_format: {
    param: 'encoding_format',
  },
  dimensions: {
    param: 'dimensions',
  },
  user: {
    param: 'user',
  },
};

export interface GoogleOpenAIEmbedResponse extends EmbedResponse {}

export const GoogleOpenAIEmbedResponseTransform: (
  response: GoogleOpenAIEmbedResponse | ErrorResponse,
  responseStatus: number
) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, GOOGLE_OPENAI);
  }

  if ('data' in response) {
    return {
      object: response.object,
      data: response.data,
      model: response.model,
      usage: response.usage,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_OPENAI);
};
