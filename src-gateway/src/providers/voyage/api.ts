import { ProviderAPIConfig } from '../types';

const VoyageAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.voyageai.com/v1',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'embed':
        return '/embeddings';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default VoyageAPIConfig;
