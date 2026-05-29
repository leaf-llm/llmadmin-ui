import { ProviderAPIConfig } from '../types';

const DoubaoAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'messages')
      return (
        providerOptions.customHostAnthropic ||
        'https://ark.cn-beijing.volces.com/api/compatible/v1'
      );
    return providerOptions.customHost || 'https://ark.cn-beijing.volces.com/api/v3';
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
      case 'imageGenerate':
        return '/images/generations';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default DoubaoAPIConfig;
