import { ProviderConfigs } from '../types';
import { chatCompleteParams } from '../open-ai-base';
import GoogleOpenAIAPIConfig from './api';
import {
  GoogleOpenAIChatCompleteResponseTransform,
  GoogleOpenAIChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  GoogleOpenAIEmbedConfig,
  GoogleOpenAIEmbedResponseTransform,
} from './embed';
import {
  GoogleOpenAIMessagesConfig,
  GoogleOpenAIMessagesResponseTransform,
  GoogleOpenAIMessagesStreamChunkTransform,
} from './messages';

// Google's OpenAI-compatible surface accepts the full OpenAI chat-completions
// parameter set (model, messages, max_tokens, temperature, tools, etc.), so
// the default OpenAI shape from `chatCompleteParams` is the right contract —
// no exclusions or extras are needed.
const GoogleOpenAIChatCompleteConfig = chatCompleteParams([]);

const GoogleOpenAIConfig: ProviderConfigs = {
  api: GoogleOpenAIAPIConfig,
  chatComplete: GoogleOpenAIChatCompleteConfig,
  embed: GoogleOpenAIEmbedConfig,
  messages: GoogleOpenAIMessagesConfig,
  responseTransforms: {
    chatComplete: GoogleOpenAIChatCompleteResponseTransform,
    'stream-chatComplete': GoogleOpenAIChatCompleteStreamChunkTransform,
    embed: GoogleOpenAIEmbedResponseTransform,
    messages: GoogleOpenAIMessagesResponseTransform,
    'stream-messages': GoogleOpenAIMessagesStreamChunkTransform,
  },
};

export default GoogleOpenAIConfig;
