import { MINIMAX } from '../../globals';
import { Params } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const MinimaxMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'MiniMax-M2.7',
  },
  messages: {
    param: 'messages',
    required: true,
  },
  max_tokens: {
    param: 'max_tokens',
    required: true,
  },
  temperature: {
    param: 'temperature',
    default: 1,
    min: 0,
    max: 1,
  },
  top_p: {
    param: 'top_p',
    default: -1,
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

interface MinimaxOpenAIResponse {
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
      role: string;
      content: string | null;
      reasoning_content?: string;
      tool_calls?: {
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }[];
    };
    finish_reason: string | null;
  }[];
}

export const MinimaxMessagesResponseTransform = (
  response: MinimaxOpenAIResponse | ErrorResponse | Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
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
        message: (response as ErrorResponse).error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      MINIMAX
    );
  }

  // Anthropic-format response from provider's /messages endpoint
  if ('type' in response && (response as any).type === 'message') {
    const anthropicResponse = response as any;
    return {
      id: anthropicResponse.id,
      type: 'message' as const,
      role: anthropicResponse.role || 'assistant',
      content: anthropicResponse.content || [],
      model: anthropicResponse.model,
      stop_reason: anthropicResponse.stop_reason || null,
      stop_sequence: anthropicResponse.stop_sequence || null,
      usage: {
        input_tokens: anthropicResponse.usage?.input_tokens || 0,
        output_tokens: anthropicResponse.usage?.output_tokens || 0,
      },
    };
  }

  // OpenAI-format fallback
  if ('choices' in response) {
    const message = response.choices[0]?.message;
    const content: any[] = [];
    if (message?.reasoning_content) {
      content.push({
        type: 'thinking' as const,
        thinking: message.reasoning_content,
        signature: '',
      });
    }
    if (message?.content) {
      content.push({ type: 'text' as const, text: message.content });
    }
    if (message?.tool_calls) {
      for (const tc of message.tool_calls) {
        content.push({
          type: 'tool_use' as const,
          id: tc.id,
          name: tc.function.name,
          input: JSON.parse(tc.function.arguments || '{}'),
        });
      }
    }
    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content,
      model: response.model,
      stop_reason: response.choices[0]?.finish_reason as any,
      usage: {
        input_tokens: response.usage?.prompt_tokens || 0,
        output_tokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, MINIMAX);
};
