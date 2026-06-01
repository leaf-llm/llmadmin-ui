import { ZHIPU } from '../../globals';
import {
  ContentType,
  Message,
  OpenAIMessageRole,
  Params,
} from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const ZhipuChatCompleteConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'glm-3-turbo',
  },
  messages: {
    param: 'messages',
    required: true,
    transform: (params: Params) => {
      return params.messages?.map((message: Message) => {
        if (message.role === 'developer')
          return { ...message, role: 'system' };
        return message;
      });
    },
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

interface ZhipuToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface ZhipuChatCompleteResponse extends ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  choices: {
    index: number;
    message: {
      role: OpenAIMessageRole;
      content?: string | ContentType[];
      tool_calls?: ZhipuToolCall[];
    };
    finish_reason: string;
  }[];
}

export interface ZhipuErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

interface ZhipuStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    delta: {
      role?: string | null;
      content?: string | null;
      tool_calls?: ZhipuToolCall[];
    };
    index: number;
    finish_reason: string | null;
  }[];
}

export const ZhipuChatCompleteResponseTransform: (
  response: ZhipuChatCompleteResponse | ZhipuErrorResponse,
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
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: ZHIPU,
      choices: response.choices.map((c) => ({
        index: c.index,
        message: {
          role: c.message.role,
          content: c.message.content ?? undefined,
          ...(c.message.tool_calls && {
            tool_calls: c.message.tool_calls,
          }),
        },
        finish_reason: c.finish_reason ?? 'stop',
      })),
      usage: {
        prompt_tokens: response.usage?.prompt_tokens,
        completion_tokens: response.usage?.completion_tokens,
        total_tokens: response.usage?.total_tokens,
      },
    };
  }

  // Handle Anthropic-format response (when ZhiPu uses Anthropic-compatible endpoint)
  if ('type' in response && (response as any).type === 'message') {
    const anthropicResponse = response as any;
    const contentParts: string[] = [];
    if (anthropicResponse.content && Array.isArray(anthropicResponse.content)) {
      for (const block of anthropicResponse.content) {
        if (block.type === 'text') contentParts.push(block.text);
      }
    }
    const content = contentParts.join('') || undefined;

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
      provider: ZHIPU,
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

  return generateInvalidProviderResponseError(response, ZHIPU);
};

export const ZhipuChatCompleteStreamChunkTransform: (
  response: string
) => string = (responseChunk) => {
  let chunk = responseChunk.trim();
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();
  if (chunk === '[DONE]') {
    return `data: ${chunk}\n\n`;
  }
  const parsedChunk: ZhipuStreamChunk = JSON.parse(chunk);
  return (
    `data: ${JSON.stringify({
      id: parsedChunk.id,
      object: parsedChunk.object,
      created: parsedChunk.created,
      model: parsedChunk.model,
      provider: ZHIPU,
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
