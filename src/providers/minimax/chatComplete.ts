import { MINIMAX } from '../../globals';
import { Params, Message, SYSTEM_MESSAGE_ROLES } from '../../types/requestBody';
import {
  ChatCompletionResponse,
  ErrorResponse,
  ProviderConfig,
} from '../types';
import { ANTHROPIC_STOP_REASON } from '../anthropic/types';
import {
  generateErrorResponse,
  generateInvalidProviderResponseError,
  transformFinishReason,
} from '../utils';

export const MinimaxChatCompleteConfig: ProviderConfig = {
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

interface MinimaxChatCompleteResponse {
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

interface MinimaxErrorResponse {
  error: {
    type: string;
    message: string;
  };
}

interface MinimaxStreamChunk {
  type: string;
  index: number;
  delta: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  usage?: {
    output_tokens?: number;
    input_tokens?: number;
  };
}

export const MinimaxChatCompleteResponseTransform: (
  response: MinimaxChatCompleteResponse | MinimaxErrorResponse,
  responseStatus: number
) => ChatCompletionResponse | ErrorResponse = (response, responseStatus) => {
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

  if ('content' in response) {
    let content = '';
    response.content.forEach((item) => {
      if (item.type === 'text' && item.text) {
        content += item.text;
      }
    });

    return {
      id: response.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      provider: MINIMAX,
      choices: [
        {
          message: {
            role: 'assistant',
            content,
          },
          index: 0,
          finish_reason: transformFinishReason(
            response.stop_reason as ANTHROPIC_STOP_REASON,
            false
          ),
        },
      ],
      usage: {
        prompt_tokens: response.usage?.input_tokens || 0,
        completion_tokens: response.usage?.output_tokens || 0,
        total_tokens:
          (response.usage?.input_tokens || 0) +
          (response.usage?.output_tokens || 0),
      },
    };
  }

  return generateInvalidProviderResponseError(response, MINIMAX);
};

export const MinimaxChatCompleteStreamChunkTransform: (
  response: string,
  fallbackId: string
) => string = (responseChunk, fallbackId) => {
  let chunk = responseChunk.trim();

  if (
    chunk.startsWith('event: ping') ||
    chunk.startsWith('event: content_block_stop')
  ) {
    return '';
  }

  if (chunk.startsWith('event: message_stop')) {
    return 'data: [DONE]\n\n';
  }

  chunk = chunk.replace(/^event: content_block_delta[\r\n]*/, '');
  chunk = chunk.replace(/^event: content_block_start[\r\n]*/, '');
  chunk = chunk.replace(/^event: message_delta[\r\n]*/, '');
  chunk = chunk.replace(/^event: message_start[\r\n]*/, '');
  chunk = chunk.replace(/^event: error[\r\n]*/, '');
  chunk = chunk.replace(/^data: /, '');
  chunk = chunk.trim();

  const parsedChunk: MinimaxStreamChunk = JSON.parse(chunk);

  if (parsedChunk.type === 'error') {
    return (
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: MINIMAX,
        choices: [
          {
            finish_reason: 'error',
            delta: {
              content: '',
            },
          },
        ],
      })}` +
      '\n\n' +
      'data: [DONE]\n\n'
    );
  }

  if (parsedChunk.type === 'message_delta' && parsedChunk.usage) {
    return (
      `data: ${JSON.stringify({
        id: fallbackId,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: '',
        provider: MINIMAX,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: transformFinishReason(
              parsedChunk.delta?.stop_reason as
                | ANTHROPIC_STOP_REASON
                | undefined,
              false
            ),
          },
        ],
        usage: {
          prompt_tokens: parsedChunk.usage?.input_tokens || 0,
          completion_tokens: parsedChunk.usage?.output_tokens || 0,
          total_tokens:
            (parsedChunk.usage?.input_tokens || 0) +
            (parsedChunk.usage?.output_tokens || 0),
        },
      })}` + '\n\n'
    );
  }

  const content = parsedChunk.delta?.text;

  return (
    `data: ${JSON.stringify({
      id: fallbackId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: '',
      provider: MINIMAX,
      choices: [
        {
          delta: {
            content,
          },
          index: 0,
          finish_reason: null,
        },
      ],
    })}` + '\n\n'
  );
};
