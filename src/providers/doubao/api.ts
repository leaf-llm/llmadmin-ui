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
      default:
        return '';
    }
  },
};

export default DoubaoAPIConfig;
