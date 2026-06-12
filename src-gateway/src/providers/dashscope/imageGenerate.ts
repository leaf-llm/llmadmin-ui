import { DASHSCOPE } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateErrorResponse } from '../utils';

export const DashScopeImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'wanx2.1-t2i-turbo',
  },
  n: {
    param: 'n',
    min: 1,
    max: 9,
  },
  size: {
    param: 'size',
  },
  style: {
    param: 'style',
  },
  quality: {
    param: 'quality',
  },
};

interface DashScopeImageObject {
  image_url?: string;
  b64_json?: string;
  revised_prompt?: string;
}

interface DashScopeImageGenerateResponse extends ImageGenerateResponse {
  data: DashScopeImageObject[];
}

export const DashScopeImageGenerateResponseTransform: (
  response: DashScopeImageGenerateResponse | ErrorResponse,
  responseStatus: number
) => ImageGenerateResponse | ErrorResponse = (response, responseStatus) => {
  if (responseStatus !== 200 && 'error' in response) {
    return generateErrorResponse(
      {
        message: response.error?.message || 'Unknown error',
        type: response.error?.type || null,
        param: response.error?.param || null,
        code: response.error?.code || null,
      },
      DASHSCOPE
    );
  }

  return response;
};