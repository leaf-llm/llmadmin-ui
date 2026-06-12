import { GOOGLE } from '../../globals';
import { ErrorResponse, ImageGenerateResponse, ProviderConfig } from '../types';
import { generateErrorResponse } from '../utils';

export const GoogleImageGenerateConfig: ProviderConfig = {
  prompt: {
    param: 'prompt',
    required: true,
  },
  model: {
    param: 'model',
    required: true,
    default: 'imagen-3.0-generate',
  },
  n: {
    param: 'n',
    min: 1,
    max: 8,
  },
  aspect_ratio: {
    param: 'aspect_ratio',
  },
  safety_setting: {
    param: 'safety_setting',
  },
  person_generation: {
    param: 'person_generation',
  },
};

interface GoogleImageObject {
  image?: {
    b64_json?: string;
  };
  predicted_aspect_ratio?: string;
}

interface GoogleImageGenerateResponse extends ImageGenerateResponse {
  images?: GoogleImageObject[];
  image?: {
    b64_json?: string;
  };
}

export const GoogleImageGenerateResponseTransform: (
  response: GoogleImageGenerateResponse | ErrorResponse,
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
      GOOGLE
    );
  }

  // Google Imagen returns images in different formats depending on version
  if ('images' in response && Array.isArray(response.images)) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: response.images.map((img) => ({
        b64_json: img.image?.b64_json,
      })),
      provider: GOOGLE,
    };
  }

  if ('image' in response && response.image) {
    return {
      created: Math.floor(Date.now() / 1000),
      data: [{ b64_json: response.image.b64_json }],
      provider: GOOGLE,
    };
  }

  return response;
};