import { ProviderConfigs } from '../types';
import MinimaxAPIConfig from './api';
import {
  MinimaxChatCompleteConfig,
  MinimaxChatCompleteResponseTransform,
  MinimaxChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  MinimaxMessagesConfig,
  MinimaxMessagesResponseTransform,
} from './messages';

const MinimaxConfig: ProviderConfigs = {
  chatComplete: MinimaxChatCompleteConfig,
  messages: MinimaxMessagesConfig,
  api: MinimaxAPIConfig,
  responseTransforms: {
    chatComplete: MinimaxChatCompleteResponseTransform,
    'stream-chatComplete': MinimaxChatCompleteStreamChunkTransform,
    messages: MinimaxMessagesResponseTransform,
  },
};

export default MinimaxConfig;
