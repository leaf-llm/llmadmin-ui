import { ProviderAPIConfig } from '../types';

const ZhipuAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://open.bigmodel.cn/api/paas/v4',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn, providerOptions }) => {
    switch (fn) {
      case 'chatComplete':
        return providerOptions.apiFormat === 'anthropic'
          ? '/messages'
          : '/chat/completions';
      case 'messages':
        return providerOptions.apiFormat === 'anthropic'
          ? '/messages'
          : '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default ZhipuAPIConfig;
