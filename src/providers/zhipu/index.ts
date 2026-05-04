import { ProviderConfigs } from '../types';
import ZhipuAPIConfig from './api';
import {
  ZhipuChatCompleteConfig,
  ZhipuChatCompleteResponseTransform,
  ZhipuChatCompleteStreamChunkTransform,
} from './chatComplete';
import { ZhipuEmbedConfig, ZhipuEmbedResponseTransform } from './embed';
import {
  ZhipuMessagesConfig,
  ZhipuMessagesResponseTransform,
} from './messages';

const ZhipuConfig: ProviderConfigs = {
  chatComplete: ZhipuChatCompleteConfig,
  messages: ZhipuMessagesConfig,
  embed: ZhipuEmbedConfig,
  api: ZhipuAPIConfig,
  responseTransforms: {
    chatComplete: ZhipuChatCompleteResponseTransform,
    'stream-chatComplete': ZhipuChatCompleteStreamChunkTransform,
    embed: ZhipuEmbedResponseTransform,
    messages: ZhipuMessagesResponseTransform,
  },
};

export default ZhipuConfig;
