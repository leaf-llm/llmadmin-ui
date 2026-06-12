import { DOUBO } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateErrorResponse } from '../utils';

export const DoubaoImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'doubao-image-generation-v1',
  },
  n: {
    param: 'n',
    min: 1,
    max: 9,
  },
  size: {
    param: 'size',
  },
};

interface DoubaoImageObject {
  url?: string;
  b64_json?: string;
}

interface DoubaoImageGenerateResponse extends ImageGenerateResponse {
  data: DoubaoImageObject[];
}

export const DoubaoImageGenerateResponseTransform: (
  response: DoubaoImageGenerateResponse | ErrorResponse,
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
      DOUBO
    );
  }

  return response;
};