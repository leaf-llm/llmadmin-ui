import { ProviderAPIConfig } from '../types';

const DoubaoAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://ark.cn-beijing.volces.com/api/v3',
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

export default DoubaoAPIConfig;
