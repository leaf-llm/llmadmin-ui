import { ProviderConfigs } from '../types';
import DoubaoAPIConfig from './api';
import {
  DoubaoChatCompleteConfig,
  DoubaoChatCompleteResponseTransform,
  DoubaoChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  DoubaoMessagesConfig,
  DoubaoMessagesResponseTransform,
} from './messages';

const DoubaoConfig: ProviderConfigs = {
  chatComplete: DoubaoChatCompleteConfig,
  messages: DoubaoMessagesConfig,
  api: DoubaoAPIConfig,
  responseTransforms: {
    chatComplete: DoubaoChatCompleteResponseTransform,
    'stream-chatComplete': DoubaoChatCompleteStreamChunkTransform,
    messages: DoubaoMessagesResponseTransform,
  },
};

export default DoubaoConfig;
