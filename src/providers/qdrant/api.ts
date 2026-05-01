import { ProviderAPIConfig } from '../types';

const QdrantAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return providerOptions.customHost || '';
  },
  headers: ({ providerOptions }) => {
    return { 'api-key': `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default QdrantAPIConfig;
