import { ProviderAPIConfig } from '../types';

const NCompassApiConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.ncompass.tech/v1',
  headers: ({ providerOptions }) => {
    return {
      Authorization: `Bearer ${providerOptions.apiKey}`,
    };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default NCompassApiConfig;
