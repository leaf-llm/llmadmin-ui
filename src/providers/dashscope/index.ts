import { DASHSCOPE } from '../../globals';
import {
  chatCompleteParams,
  embedParams,
  responseTransformers,
} from '../open-ai-base';
import { ProviderConfigs } from '../types';
import { dashscopeAPIConfig } from './api';
import {
  DashScopeImageGenerateConfig,
  DashScopeImageGenerateResponseTransform,
} from './imageGenerate';
import {
  DashScopeMessagesConfig,
  DashScopeMessagesResponseTransform,
} from './messages';
import { generateErrorResponse, generateInvalidProviderResponseError } from '../utils';

const dashscopeChatCompleteConfig = chatCompleteParams(
  [],
  { model: 'qwen-turbo' },
  {
    top_k: { param: 'top_k' },
    repetition_penalty: { param: 'repetition_penalty' },
    stop: { param: 'stop' },
    enable_search: { param: 'enable_search' },
    enable_thinking: { param: 'enable_thinking' },
    thinking_budget: { param: 'thinking_budget' },
    tools: { param: 'tools' },
    tool_choice: { param: 'tool_choice' },
  }
);

const dashscopeChatCompleteResponseTransform = (
  response: any,
  responseStatus: number
) => {
  if (responseStatus !== 200 && 'html-message' in response) {
    return generateErrorResponse(
      {
        message: response['html-message'] || `HTTP ${responseStatus}: API returned an unexpected response.`,
        type: 'api_error',
        param: null,
        code: String(responseStatus),
      },
      DASHSCOPE
    );
  }

  if ('error' in response) {
    return generateErrorResponse(
      {
        message: response.error?.message || 'Unknown error',
        type: 'api_error',
        param: null,
        code: null,
      },
      DASHSCOPE
    );
  }

  if ('choices' in response) {
    return {
      id: response.id,
      object: response.object,
      created: response.created,
      model: response.model,
      provider: DASHSCOPE,
      choices: response.choices.map((c: any) => ({
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

  return generateInvalidProviderResponseError(response, DASHSCOPE);
};

export const DashScopeConfig: ProviderConfigs = {
  chatComplete: dashscopeChatCompleteConfig,
  messages: DashScopeMessagesConfig,
  embed: embedParams([], { model: 'text-embedding-v1' }),
  imageGenerate: DashScopeImageGenerateConfig,
  api: dashscopeAPIConfig,
  responseTransforms: {
    ...responseTransformers(DASHSCOPE, {
      chatComplete: false,
      embed: true,
    }),
    chatComplete: dashscopeChatCompleteResponseTransform,
    messages: DashScopeMessagesResponseTransform,
    imageGenerate: DashScopeImageGenerateResponseTransform,
  },
};
