import { DOUBO } from '../../globals';
import { Params } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const DoubaoChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'doubao-seed-2-0-pro',
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
  tools: {
    param: 'tools',
  },
  tool_choice: {
    param: 'tool_choice',
  },
};

interface DoubaoChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface DoubaoStreamChunk {
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
}

export const DoubaoChatCompleteResponseTransform: (
  response: DoubaoChatCompleteResponse | ErrorResponse | Record<string, any>,
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
        message: (response as ErrorResponse).error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      DOUBO
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: DOUBO,
      choices: response.choices.map((c: ChatCompletionResponse['choices'][0]) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content,
          ...(c.message.tool_calls && {
            tool_calls: c.message.tool_calls,
          }),
        },
        finish_reason: c.finish_reason,
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  // Handle Anthropic-format response
  if ('type' in response && (response as any).type === 'message') {
    const anthropicResponse = response as any;
    const contentParts: string[] = [];
    if (anthropicResponse.content && Array.isArray(anthropicResponse.content)) {
      for (const block of anthropicResponse.content) {
        if (block.type === 'text') contentParts.push(block.text);
      }
    }
    const content = contentParts.join('') || null;

    const finishReasonMap: Record<string, string> = {
      end_turn: 'stop',
      max_tokens: 'length',
      tool_use: 'tool_calls',
      stop_sequence: 'stop',
    };

    return {
      id: anthropicResponse.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: anthropicResponse.model,
      provider: DOUBO,
      choices: [
        {
          index: 0,
          message: {
            role: anthropicResponse.role || 'assistant',
            content,
          },
          finish_reason:
            finishReasonMap[anthropicResponse.stop_reason] ||
            anthropicResponse.stop_reason ||
            'stop',
        },
      ],
      usage: {
        prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
        completion_tokens: anthropicResponse.usage?.output_tokens || 0,
        total_tokens:
          (anthropicResponse.usage?.input_tokens || 0) +
          (anthropicResponse.usage?.output_tokens || 0),
      },
    };
  }

  return generateInvalidProviderResponseError(response, DOUBO);
};

export const DoubaoChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: DoubaoStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: DOUBO,
      choices: [
        {
          index: parsedChunk.choices[0].index,
          delta: parsedChunk.choices[0].delta,
          finish_reason: parsedChunk.choices[0].finish_reason,
        },
      ],
    })}` + '\n\n'
  );
};
