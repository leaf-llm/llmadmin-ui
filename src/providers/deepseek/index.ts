import { ProviderConfigs } from '../types';
import DeepSeekAPIConfig from './api';
import {
  DeepSeekChatCompleteConfig,
  DeepSeekChatCompleteResponseTransform,
  DeepSeekChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  DeepSeekMessagesConfig,
  DeepSeekMessagesResponseTransform,
} from './messages';

const DeepSeekConfig: ProviderConfigs = {
  chatComplete: DeepSeekChatCompleteConfig,
  messages: DeepSeekMessagesConfig,
  api: DeepSeekAPIConfig,
  responseTransforms: {
    chatComplete: DeepSeekChatCompleteResponseTransform,
    'stream-chatComplete': DeepSeekChatCompleteStreamChunkTransform,
    messages: DeepSeekMessagesResponseTransform,
  },
};

export default DeepSeekConfig;
