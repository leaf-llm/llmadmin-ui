import { ProviderConfigs } from '../types';
import MinimaxAPIConfig from './api';
import {
  MinimaxChatCompleteConfig,
  MinimaxChatCompleteResponseTransform,
  MinimaxChatCompleteStreamChunkTransform,
} from './chatComplete';

const MinimaxConfig: ProviderConfigs = {
  chatComplete: MinimaxChatCompleteConfig,
  api: MinimaxAPIConfig,
  responseTransforms: {
    chatComplete: MinimaxChatCompleteResponseTransform,
    'stream-chatComplete': MinimaxChatCompleteStreamChunkTransform,
  },
};

export default MinimaxConfig;
