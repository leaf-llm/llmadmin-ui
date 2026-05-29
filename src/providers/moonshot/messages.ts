import { MOONSHOT } from '../../globals';
import { Params, Message } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
} from '../utils';

export const MoonshotMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'moonshot-v1-8k',
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

interface MoonshotMessagesResponse {
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

export interface MoonshotErrorResponse {
  object: string;
  message: string;
  type: string;
  param: string | null;
  code: string;
}

export const MoonshotMessagesResponseTransform = (
  response: MoonshotMessagesResponse | MoonshotErrorResponse | Record<string, any>,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
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

  return generateInvalidProviderResponseError(response, MOONSHOT);
};
