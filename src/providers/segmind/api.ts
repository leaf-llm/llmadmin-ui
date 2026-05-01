import { ProviderAPIConfig } from '../types';

const SegmindAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.segmind.com/v1',
  headers: ({ providerOptions }) => {
    return { 'x-api-key': `${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON }) => {
    if (fn === 'listModels') return '/models';
    return `/${gatewayRequestBodyJSON.model}`;
  },
};

export default SegmindAIAPIConfig;
