import { DOUBO } from '../../globals';
import { ProviderConfigs } from '../types';
import DoubaoAPIConfig from './api';
import {
  DoubaoChatCompleteConfig,
  DoubaoChatCompleteResponseTransform,
  DoubaoChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  DoubaoImageGenerateConfig,
  DoubaoImageGenerateResponseTransform,
} from './imageGenerate';
import {
  DoubaoMessagesConfig,
  DoubaoMessagesResponseTransform,
} from './messages';

const DoubaoConfig: ProviderConfigs = {
  chatComplete: DoubaoChatCompleteConfig,
  messages: DoubaoMessagesConfig,
  imageGenerate: DoubaoImageGenerateConfig,
  api: DoubaoAPIConfig,
  responseTransforms: {
    chatComplete: DoubaoChatCompleteResponseTransform,
    'stream-chatComplete': DoubaoChatCompleteStreamChunkTransform,
    messages: DoubaoMessagesResponseTransform,
    imageGenerate: DoubaoImageGenerateResponseTransform,
  },
};

export default DoubaoConfig;