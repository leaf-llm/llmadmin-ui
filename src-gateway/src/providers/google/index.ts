import { GOOGLE } from '../../globals';
import { ProviderConfigs } from '../types';
import GoogleApiConfig from './api';
import {
  GoogleChatCompleteConfig,
  GoogleChatCompleteResponseTransform,
  GoogleChatCompleteStreamChunkTransform,
} from './chatComplete';
import {
  GoogleImageGenerateConfig,
  GoogleImageGenerateResponseTransform,
} from './imageGenerate';
import { GoogleEmbedConfig, GoogleEmbedResponseTransform } from './embed';

const GoogleConfig: ProviderConfigs = {
  api: GoogleApiConfig,
  chatComplete: GoogleChatCompleteConfig,
  embed: GoogleEmbedConfig,
  imageGenerate: GoogleImageGenerateConfig,
  responseTransforms: {
    chatComplete: GoogleChatCompleteResponseTransform,
    'stream-chatComplete': GoogleChatCompleteStreamChunkTransform,
    embed: GoogleEmbedResponseTransform,
    imageGenerate: GoogleImageGenerateResponseTransform,
  },
};

export default GoogleConfig;