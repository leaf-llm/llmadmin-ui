import { ProviderAPIConfig } from '../types';

const RecraftAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://external.api.recraft.ai/v1',
  headers: ({ providerOptions }) => ({
    Authorization: `Bearer ${providerOptions.apiKey}`,
    'Content-Type': 'application/json',
  }),
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'imageGenerate':
        return '/images/generations';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default RecraftAIAPIConfig;
