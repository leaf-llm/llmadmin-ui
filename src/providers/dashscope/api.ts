import { ProviderAPIConfig } from '../types';

export const dashscopeAPIConfig: ProviderAPIConfig = {
  getBaseURL: ({ providerOptions, fn }) => {
    if (fn === 'messages')
      return (
        providerOptions.customHostAnthropic ||
        'https://dashscope.aliyuncs.com/apps/anthropic/v1'
      );
    return (
      providerOptions.customHost ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    );
  },
  headers({ providerOptions }) {
    const { apiKey } = providerOptions;
    return { Authorization: `Bearer ${apiKey}` };
  },
  getEndpoint({ fn }) {
    switch (fn) {
      case 'chatComplete':
        return '/chat/completions';
      case 'messages':
        return '/messages';
      case 'embed':
        return '/embeddings';
      case 'imageGenerate':
        return '/images/generations';
      case 'listModels':
        return '/models';
      default:
        return '';
    }
  },
};