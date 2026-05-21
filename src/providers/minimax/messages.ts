import { MINIMAX } from '../../globals';
import { Params, Message, SYSTEM_MESSAGE_ROLES } from '../../types/requestBody';
import { MessagesResponse } from '../../types/messagesResponse';
import { ErrorResponse, ProviderConfig } from '../types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformToAnthropicStopReason,
} from '../utils';
import { ANTHROPIC_STOP_REASON } from '../anthropic/types';

export const MinimaxMessagesConfig: ProviderConfig = {
  model: {
    param: 'model',
    required: true,
    default: 'MiniMax-M2.7',
  },
  messages: [
    {
      param: 'messages',
      required: true,
      transform: (params: Params) => {
        let messages: any[] = [];
        if (params.messages) {
          params.messages.forEach((msg: Message) => {
            if (SYSTEM_MESSAGE_ROLES.includes(msg.role)) return;
            messages.push({
              role: msg.role,
              content: msg.content,
            });
          });
        }
        return messages;
      },
    },
    {
      param: 'system',
      required: false,
      transform: (params: Params) => {
        let systemContent = '';
        if (params.messages) {
          params.messages.forEach((msg: Message) => {
            if (SYSTEM_MESSAGE_ROLES.includes(msg.role) && msg.content) {
              systemContent +=
                (typeof msg.content === 'string'
                  ? msg.content
                  : msg.content[0]?.text || '') + '\n';
            }
          });
        }
        return systemContent.trim() || undefined;
      },
    },
  ],
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
};

interface MinimaxMessagesResponse {
  id: string;
  type: string;
  role: string;
  content: { type: string; text?: string }[];
  stop_reason: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

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
    message: { role: string; content: string };
    finish_reason: string | null;
  }[];
}

interface MinimaxErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

export const MinimaxMessagesResponseTransform = (
  response: MinimaxMessagesResponse | MinimaxOpenAIResponse | MinimaxErrorResponse,
  responseStatus: number
): MessagesResponse | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return generateErrorResponse(
      {
        message: response.error.message,
        type: response.error.type,
        param: null,
        code: null,
      },
      MINIMAX
    );
  }

  if ('content' in response && Array.isArray(response.content)) {
    const textContent = response.content
      .filter((item) => item.type === 'text')
      .map((item) => ({ type: 'text' as const, text: item.text || '' }));

    return {
      id: response.id,
      type: 'message',
      role: 'assistant',
      content: textContent,
      model: response.model,
      stop_reason: transformToAnthropicStopReason(
        response.stop_reason as ANTHROPIC_STOP_REASON
      ),
      usage: {
        input_tokens: response.usage?.input_tokens || 0,
        output_tokens: response.usage?.output_tokens || 0,
      },
    };
  }

  if ('choices' in response) {
    const minimaxResponse = response as MinimaxOpenAIResponse;
    const message = minimaxResponse.choices[0]?.message;
    return {
      id: minimaxResponse.id,
      type: 'message',
      role: 'assistant',
      content: message?.content
        ? [{ type: 'text' as const, text: message.content }]
        : [],
      model: minimaxResponse.model,
      stop_reason: transformToAnthropicStopReason(
        minimaxResponse.choices[0]?.finish_reason as ANTHROPIC_STOP_REASON
      ),
      usage: {
        input_tokens: minimaxResponse.usage?.prompt_tokens || 0,
        output_tokens: minimaxResponse.usage?.completion_tokens || 0,
      },
    };
  }

  return generateInvalidProviderResponseError(response, MINIMAX);
};
