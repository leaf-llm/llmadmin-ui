import { ProviderAPIConfig } from '../types';

const DeepSeekAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.deepseek.com',
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

export default DeepSeekAPIConfig;
