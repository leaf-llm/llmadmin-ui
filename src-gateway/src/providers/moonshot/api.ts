import { ProviderAPIConfig } from '../types';

const MoonshotAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'messages')
      return (
        providerOptions.customHostAnthropic ||
        'https://api.moonshot.cn/anthropic/v1'
      );
    return providerOptions.customHost || 'https://api.moonshot.cn/v1';
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
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default MoonshotAPIConfig;