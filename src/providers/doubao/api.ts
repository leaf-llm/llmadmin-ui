import { ProviderAPIConfig } from '../types';

const DoubaoAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost ||
    (providerOptions.apiFormat === 'anthropic'
      ? 'https://ark.cn-beijing.volces.com/api/compatible/v1'
      : 'https://ark.cn-beijing.volces.com/api/v3'),
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
      case 'imageGenerate':
        return `/images/generations`;
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default DoubaoAPIConfig;
