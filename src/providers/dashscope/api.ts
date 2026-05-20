import { ProviderAPIConfig } from '../types';

export const dashscopeAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost ||
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn, providerOptions }) {
    switch (fn) {
      case 'chatComplete':
        return providerOptions.apiFormat === 'anthropic'
          ? '/messages'
          : '/chat/completions';
      case 'embed':
        return `/embeddings`;
      case 'imageGenerate':
        return `/images/generations`;
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};
