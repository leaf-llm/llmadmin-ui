import { ProviderAPIConfig } from '../types';

const DeepSeekAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.deepseek.com',
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

export default DeepSeekAPIConfig;
