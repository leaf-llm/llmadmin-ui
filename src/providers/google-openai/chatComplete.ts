import { GOOGLE_OPENAI } from '../../globals';
import { Params } from '../../types/requestBody';
import { ChatCompletionResponse, ErrorResponse } from '../types';
import { generateInvalidProviderResponseError } from '../utils';

interface GoogleOpenAIChatCompleteResponse extends ChatCompletionResponse {}

export interface GoogleOpenAIErrorResponse extends ErrorResponse {}

interface GoogleOpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }[];
    };
    index: number;
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export const GoogleOpenAIChatCompleteResponseTransform: (
  response: GoogleOpenAIChatCompleteResponse | GoogleOpenAIErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return {
      ...response,
      provider: GOOGLE_OPENAI,
    } as ErrorResponse;
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: GOOGLE_OPENAI,
      choices: response.choices,
      usage: response.usage,
    };
  }

  return generateInvalidProviderResponseError(response, GOOGLE_OPENAI);
};

export const GoogleOpenAIChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: GoogleOpenAIStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: GOOGLE_OPENAI,
      choices: [
        {
          index: parsedChunk.choices[0]?.index ?? 0,
          delta: parsedChunk.choices[0]?.delta ?? {},
          finish_reason: parsedChunk.choices[0]?.finish_reason ?? null,
        },
      ],
      ...(parsedChunk.usage && { usage: parsedChunk.usage }),
    })}` + '\n\n'
  );
};
