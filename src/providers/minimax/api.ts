import { ProviderAPIConfig } from '../types';

const MinimaxAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.minimaxi.com/anthropic',
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
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default MinimaxAPIConfig;
