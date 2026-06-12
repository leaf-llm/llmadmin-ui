import { ProviderAPIConfig } from '../types';

const GoogleOpenAIAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions }) => {
    return (
      providerOptions?.customHost ||
      'https://generativelanguage.googleapis.com/v1beta/openai'
    );
  },
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` };
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
      case 'messages':
        return '/chat/completions';
      case 'embed':
        return '/embeddings';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};

export default GoogleOpenAIAPIConfig;
