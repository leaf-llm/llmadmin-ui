import { ProviderAPIConfig } from '../types';
import { version } from '../../../package.json';

const BytezInferenceAPI: ProviderAPIConfig = {
  getBaseURL: () => 'https://api.bytez.com',
  headers: async ({ providerOptions }) => {
    const { apiKey } = providerOptions;

    const headers: Record<string, string> = {};

    headers['Authorization'] = `Key ${apiKey}`;
    headers['user-agent'] = `portkey/${version}`;

    return headers;
  },
  getEndpoint: ({ fn, gatewayRequestBodyJSON }) => {
    const version = (gatewayRequestBodyJSON as any)?.version ?? 2;
    const model = (gatewayRequestBodyJSON as any)?.model;
    if (fn === 'listModels') return '/models';
    return `/models/v${version}/${model}`;
  },
};

export default BytezInferenceAPI;
