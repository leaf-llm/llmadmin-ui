import { ProviderAPIConfig } from '../types';

const ZhipuAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'messages')
      return (
        providerOptions.customHostAnthropic ||
        'https://open.bigmodel.cn/api/anthropic'
      );
    return providerOptions.customHost || 'https://open.bigmodel.cn/api/paas/v4';
  },
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'messages':
        return '/messages';
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