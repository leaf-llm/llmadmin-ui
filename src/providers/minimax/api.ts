import { ProviderAPIConfig } from '../types';

const MinimaxAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.minimaxi.com/anthropic',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'messages':
        return '/messages';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default MinimaxAPIConfig;
