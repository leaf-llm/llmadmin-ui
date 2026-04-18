import { ProviderConfigs } from '../types';
import DoubaoAPIConfig from './api';
import {
  DoubaoChatCompleteConfig,
  DoubaoChatCompleteResponseTransform,
  DoubaoChatCompleteStreamChunkTransform,
} from './chatComplete';

const DoubaoConfig: ProviderConfigs = {
  chatComplete: DoubaoChatCompleteConfig,
  api: DoubaoAPIConfig,
  responseTransforms: {
    chatComplete: DoubaoChatCompleteResponseTransform,
    'stream-chatComplete': DoubaoChatCompleteStreamChunkTransform,
  },
};

export default DoubaoConfig;
