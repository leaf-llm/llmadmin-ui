import { ProviderAPIConfig } from '../types';

const SambaNovaAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) =>
    providerOptions.customHost || 'https://api.sambanova.ai',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/v1/chat/completions';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default SambaNovaAPIConfig;
