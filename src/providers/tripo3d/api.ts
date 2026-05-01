import { ProviderAPIConfig } from '../types';

const Tripo3DAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.tripo3d.ai/v2/openapi',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    if (fn === 'listModels') return '/models';
    return '';
  },
};

export default Tripo3DAPIConfig;
