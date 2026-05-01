import { ProviderAPIConfig } from '../types';

const ZhipuAPIConfig: ProviderAPIConfig = {
  getBaseURL: () => 'https://open.bigmodel.cn/api/paas/v4',
  headers: ({ providerOptions }) => {
    return { Authorization: `Bearer ${providerOptions.apiKey}` }; // https://open.bigmodel.cn/usercenter/apikeys
  },
  getEndpoint: ({ fn }) => {
    switch (fn) {
      case 'chatComplete':
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

export default ZhipuAPIConfig;
