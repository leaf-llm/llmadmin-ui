import { OPEN_AI } from '../../globals';
import { EmbedResponse } from '../../types/embedRequestBody';
import { ResponseItemList } from '../../types/inputList';
import { Params, Message } from '../../types/requestBody';
import {
  OpenAIResponse,
  ModelResponseDeleteResponse,
} from '../../types/modelResponses';
import {
  OpenAIChatCompleteConfig,
  OpenAIChatCompleteResponse,
} from '../openai/chatComplete';
import { OpenAICompleteResponse } from '../openai/complete';
import { OpenAIErrorResponseTransform } from '../openai/utils';
import { ChatChoice, ChatCompletionResponse, ErrorResponse, ProviderConfig } from '../types';
import { MessagesResponse } from '../../types/messagesResponse';
import { OpenAICreateModelResponseConfig } from './createModelResponse';
import { generateInvalidProviderResponseError } from '../utils';

type CustomTransformer<T, U> = (
  response: T | ErrorResponse,
  isError?: boolean
) => U;

type DefaultValues = {
  model?: string;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
  logprobs?: boolean;
  [key: string]: unknown;
};

const excludeObjectKeys = (keyList: string[], object: Record<string, any>) => {
  if (keyList) {
    keyList.forEach((excludeKey) => {
      if (Object.hasOwn(object, excludeKey)) {
        delete object[excludeKey];
      }
    });
  }
};

export const developerToSystemMessagesTransform = (params: Params) => {
  return params.messages?.map((message: Message) => {
    if (message.role === 'developer') return { ...message, role: 'system' };
    return message;
  });
};

/**
 *
 * @param exclude List of string that we should exclude from open-ai default paramters
 * @param defaultValues Default values specific to the provider for params
 * @param extra Extra parameters type of ProviderConfig should extend to support the provider
 * @returns {ProviderConfig}
 */
export const chatCompleteParams = (
  exclude: string[],
  defaultValues?: DefaultValues,
  extra?: ProviderConfig
): ProviderConfig => {
  const baseParams: ProviderConfig = {
    ...OpenAIChatCompleteConfig,
    messages: {
      param: 'messages',
      default: '',
      transform: developerToSystemMessagesTransform,
    },
  };

  Object.keys(defaultValues ?? {}).forEach((key) => {
    const param = baseParams[key];
    if (Object.hasOwn(baseParams, key) && !Array.isArray(param)) {
      (param as any).default = defaultValues?.[key];
    }
  });

  // Exclude params that are not needed.
  excludeObjectKeys(exclude, baseParams);

  return { ...baseParams, ...(extra ?? {}) };
};

/**
 *
 * @param exclude List of string that we should exclude from open-ai default paramters
 * @param defaultValues Default values specific to the provider for params
 * @param extra Extra parameters type of ProviderConfig should extend to support the provider
 * @returns {ProviderConfig}
 */
export const completeParams = (
  exclude: string[],
  defaultValues?: DefaultValues,
  extra?: ProviderConfig
): ProviderConfig => {
  const baseParams: ProviderConfig = {
    model: {
      param: 'model',
      required: true,
      ...(defaultValues?.model && { default: defaultValues.model }),
    },
    prompt: {
      param: 'prompt',
      default: '',
    },
    max_tokens: {
      param: 'max_tokens',
      ...(defaultValues?.max_tokens && { default: defaultValues.max_tokens }),
      min: 0,
    },
    temperature: {
      param: 'temperature',
      ...(defaultValues?.temperature && { default: defaultValues.temperature }),
      min: 0,
      max: 2,
    },
    top_p: {
      param: 'top_p',
      ...(defaultValues?.top_p && { default: defaultValues.top_p }),
      min: 0,
      max: 1,
    },
    n: {
      param: 'n',
      default: 1,
    },
    stream: {
      param: 'stream',
      ...(defaultValues?.stream && { default: defaultValues.stream }),
    },
    logprobs: {
      param: 'logprobs',
      max: 5,
    },
    echo: {
      param: 'echo',
      default: false,
    },
    stop: {
      param: 'stop',
    },
    presence_penalty: {
      param: 'presence_penalty',
      min: -2,
      max: 2,
    },
    frequency_penalty: {
      param: 'frequency_penalty',
      min: -2,
      max: 2,
    },
    best_of: {
      param: 'best_of',
    },
    logit_bias: {
      param: 'logit_bias',
    },
    user: {
      param: 'user',
    },
    seed: {
      param: 'seed',
    },
    suffix: {
      param: 'suffix',
    },
  };

  excludeObjectKeys(exclude, baseParams);

  return { ...baseParams, ...(extra ?? {}) };
};

export const embedParams = (
  exclude: string[],
  defaultValues?: Record<string, string>,
  extra?: ProviderConfig
): ProviderConfig => {
  const baseParams: ProviderConfig = {
    model: {
      param: 'model',
      required: true,
      ...(defaultValues?.model && { default: defaultValues.model }),
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

  excludeObjectKeys(exclude, baseParams);

  return { ...baseParams, ...(extra ?? {}) };
};

export const createSpeechParams = (
  exclude: string[],
  defaultValues?: Record<string, string>,
  extra?: ProviderConfig
): ProviderConfig => {
  const baseParams: ProviderConfig = {
    model: {
      param: 'model',
      required: true,
      default: 'tts-1',
    },
    input: {
      param: 'input',
      required: true,
    },
    voice: {
      param: 'voice',
      required: true,
      default: 'alloy',
    },
    response_format: {
      param: 'response_format',
      required: false,
      default: 'mp3',
    },
    speed: {
      param: 'speed',
      required: false,
      default: 1,
    },
  };

  excludeObjectKeys(exclude, baseParams);

  return { ...baseParams, ...(extra ?? {}) };
};

export const createModelResponseParams = (
  exclude: string[],
  defaultValues: Record<string, string> = {},
  extra?: ProviderConfig
): ProviderConfig => {
  const baseParams: ProviderConfig = {
    ...OpenAICreateModelResponseConfig,
  };

  excludeObjectKeys(exclude, baseParams);

  // Object.keys(defaultValues).forEach((key) => {
  //   if (Object.hasOwn(baseParams, key) && !Array.isArray(baseParams[key])) {
  //     baseParams[key].default = defaultValues[key];
  //   }
  // });

  return { ...baseParams, ...(extra ?? {}) };
};

const EmbedResponseTransformer = <T extends EmbedResponse | ErrorResponse>(
  provider: string,
  customTransformer?: CustomTransformer<EmbedResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => EmbedResponse | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      return OpenAIErrorResponseTransform(response, provider ?? OPEN_AI);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

const CompleteResponseTransformer = <
  T extends OpenAICompleteResponse | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<OpenAICompleteResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(errorResponse, true);
      }
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });

    return response;
  };

  return transformer;
};

const CreateSpeechResponseTransformer = <T extends Response | ErrorResponse>(
  provider: string,
  customTransformer?: CustomTransformer<Response | ErrorResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(errorResponse, true);
      }
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });

    return response;
  };

  return transformer;
};

const ChatCompleteResponseTransformer = <
  T extends OpenAIChatCompleteResponse | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<OpenAIChatCompleteResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(response as ErrorResponse, true);
      }

      return errorResponse;
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

export const OpenAICreateModelResponseTransformer = <
  T extends OpenAIResponse | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<OpenAIResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response as ErrorResponse,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(response as ErrorResponse, true);
      }

      return errorResponse;
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

export const OpenAIGetModelResponseTransformer = <
  T extends OpenAIResponse | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<OpenAIResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response as ErrorResponse,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(response as ErrorResponse, true);
      }

      return errorResponse;
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

export const OpenAIDeleteModelResponseTransformer = <
  T extends ModelResponseDeleteResponse | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<ModelResponseDeleteResponse, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(response as ErrorResponse, true);
      }

      return errorResponse;
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

export const OpenAIListInputItemsResponseTransformer = <
  T extends ResponseItemList | ErrorResponse,
>(
  provider: string,
  customTransformer?: CustomTransformer<ResponseItemList, T>
) => {
  const transformer: (
    response: T | ErrorResponse,
    responseStatus: number
  ) => T | ErrorResponse = (response, responseStatus) => {
    if (responseStatus !== 200 && 'error' in response) {
      const errorResponse = OpenAIErrorResponseTransform(
        response,
        provider ?? OPEN_AI
      );
      if (customTransformer) {
        return customTransformer(response as ErrorResponse, true);
      }

      return errorResponse;
    }

    if (customTransformer) {
      return customTransformer(response as T);
    }

    Object.defineProperty(response, 'provider', {
      value: provider,
      enumerable: true,
    });
    return response;
  };

  return transformer;
};

/**
 *
 * @param provider Provider value
 * @param options Enable transformer functions to specific task (complete, chatComplete or embed)
 * @returns
 */
export const responseTransformers = <
  T extends EmbedResponse | ErrorResponse,
  U extends OpenAICompleteResponse | ErrorResponse,
  V extends OpenAIChatCompleteResponse | ErrorResponse,
  W extends Response | ErrorResponse,
>(
  provider: string,
  options: {
    embed?: boolean | CustomTransformer<EmbedResponse | ErrorResponse, T>;
    complete?:
      | boolean
      | CustomTransformer<OpenAICompleteResponse | ErrorResponse, U>;
    chatComplete?:
      | boolean
      | CustomTransformer<OpenAIChatCompleteResponse | ErrorResponse, V>;
    createSpeech?: boolean | CustomTransformer<Response | ErrorResponse, W>;
  }
) => {
  const transformers: Record<
    'complete' | 'chatComplete' | 'embed' | 'createSpeech',
    Function | null
  > = {
    complete: null,
    chatComplete: null,
    embed: null,
    createSpeech: null,
  };

  if (options.embed) {
    transformers.embed = EmbedResponseTransformer<T>(
      provider,
      typeof options.embed === 'function' ? options.embed : undefined
    );
  }

  if (options.complete) {
    transformers.complete = CompleteResponseTransformer<U>(
      provider,
      typeof options.complete === 'function' ? options.complete : undefined
    );
  }

  if (options.chatComplete) {
    transformers.chatComplete = ChatCompleteResponseTransformer<V>(
      provider,
      typeof options.chatComplete === 'function'
        ? options.chatComplete
        : undefined
    );
  }

  if (options.createSpeech) {
    transformers.createSpeech = CreateSpeechResponseTransformer<W>(
      provider,
      typeof options.createSpeech === 'function'
        ? options.createSpeech
        : undefined
    );
  }
  return transformers;
};

export const convertOpenAIChatCompletionToMessagesResponse = (
  response: Record<string, any>
): MessagesResponse => {
  const message = response.choices?.[0]?.message ?? {};
  const content: any[] = [];

  if (message.reasoning_content) {
    content.push({
      type: 'thinking' as const,
      thinking: message.reasoning_content,
      signature: '',
    });
  }
  if (message.content) {
    content.push({ type: 'text' as const, text: message.content });
  }
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      let input = {};
      try {
        input = JSON.parse(tc.function?.arguments || '{}');
      } catch {
        input = {};
      }
      content.push({
        type: 'tool_use' as const,
        id: tc.id,
        name: tc.function?.name ?? tc.name,
        input,
      });
    }
  }

  return {
    id: response.id,
    type: 'message',
    role: 'assistant',
    content,
    model: response.model,
    stop_reason: response.choices?.[0]?.finish_reason ?? null,
    usage: {
      input_tokens: response.usage?.prompt_tokens || 0,
      output_tokens: response.usage?.completion_tokens || 0,
    },
  };
};

export const buildOpenAIChatCompleteResponse = (
  response: Record<string, any>,
  provider: string,
  mapChoice?: (
    choice: any,
    index: number
  ) => {
    message?: Partial<Message>;
    finish_reason?: string | null;
    index?: number;
    logprobs?: any;
  }
): ChatCompletionResponse => {
  return {
    id: response.id,
    object: response.object,
    created: response.created,
    model: response.model,
    provider,
    choices: response.choices.map((c: any, i: number) => {
      const overrides = mapChoice ? mapChoice(c, i) : {};
      return {
        index: overrides.index ?? c.index ?? i,
        message: {
          role: 'assistant',
          content: undefined,
          ...(c.message?.tool_calls && { tool_calls: c.message.tool_calls }),
          ...c.message,
          ...overrides.message,
        } as Message,
        finish_reason: overrides.finish_reason ?? c.finish_reason,
        ...(c.logprobs != null && { logprobs: c.logprobs }),
        ...(overrides.logprobs != null && { logprobs: overrides.logprobs }),
      } as ChatChoice;
    }),
    usage: {
      prompt_tokens: response.usage?.prompt_tokens,
      completion_tokens: response.usage?.completion_tokens,
      total_tokens: response.usage?.total_tokens,
    },
  };
};

export const parseSSEChunk = (
  chunk: string
): { done: true } | { done: false; data: any } => {
  let trimmed = chunk.trim();
  trimmed = trimmed.replace(/^data: /, '');
  trimmed = trimmed.trim();
  if (trimmed === '[DONE]') {
    return { done: true };
  }
  return { done: false, data: JSON.parse(trimmed) };
};

export const buildOpenAIStreamChunk = (
  parsedChunk: Record<string, any>,
  provider: string,
  mapDelta?: (
    delta: any,
    choice: any,
    index: number
  ) => {
    delta?: Record<string, any>;
    finish_reason?: string | null;
    index?: number;
  }
): string => {
  const choice = parsedChunk.choices?.[0] ?? {};
  const overrides = mapDelta
    ? mapDelta(choice.delta, choice, choice.index ?? 0)
    : {};

  return `data: ${JSON.stringify({
    id: parsedChunk.id,
    object: parsedChunk.object,
    created: parsedChunk.created,
    model: parsedChunk.model,
    provider,
    choices: [
      {
        index: overrides.index ?? choice.index ?? 0,
        delta: overrides.delta ?? choice.delta,
        finish_reason: overrides.finish_reason ?? choice.finish_reason ?? null,
      },
    ],
    ...(parsedChunk.usage && {
      usage: {
        prompt_tokens: parsedChunk.usage.prompt_tokens,
        completion_tokens: parsedChunk.usage.completion_tokens,
        total_tokens: parsedChunk.usage.total_tokens,
      },
    }),
  })}\n\n`;
};

export const OpenAIResponseTransform = (
  response: Response | ErrorResponse,
  responseStatus: number,
  provider: string
): Response | ErrorResponse => {
  if (responseStatus !== 200 && 'error' in response) {
    return OpenAIErrorResponseTransform(response, provider ?? OPEN_AI);
  }

  return response;
};
