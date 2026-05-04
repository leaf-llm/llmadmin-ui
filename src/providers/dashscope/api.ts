import { ProviderAPIConfig } from '../types';

export const dashscopeAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost ||
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return `/chat/completions`;
      case 'embed':
        return `/embeddings`;
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};
