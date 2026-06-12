import { ProviderConfigs } from '../types';
import MoonshotAPIConfig from './api';
import {
  MoonshotChatCompleteConfig,
  MoonshotChatCompleteResponseTransform,
  MoonshotChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  MoonshotMessagesConfig,
  MoonshotMessagesResponseTransform,
} from './messages';

const MoonshotConfig: ProviderConfigs = {
  chatComplete: MoonshotChatCompleteConfig,
  messages: MoonshotMessagesConfig,
  api: MoonshotAPIConfig,
  responseTransforms: {
    chatComplete: MoonshotChatCompleteResponseTransform,
    'stream-chatComplete': MoonshotChatCompleteStreamChunkTransform,
    messages: MoonshotMessagesResponseTransform,
  },
};

export default MoonshotConfig;
