import { ProviderAPIConfig } from '../types';

const MinimaxAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.minimaxi.com/anthropic/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn, providerOptions }) => {
    switch (fn) {
      case 'chatComplete':
        return providerOptions.apiFormat === 'openai'
          ? '/chat/completions'
          : '/messages';
      case 'messages':
        return providerOptions.apiFormat === 'openai'
          ? '/chat/completions'
          : '/messages';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default MinimaxAPIConfig;
