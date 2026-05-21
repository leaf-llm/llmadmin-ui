import { Context } from 'hono';
import { POWERED_BY } from '../../globals';
import { loadUserConfig } from '../../admin/config/store';
import { ModelCategory } from '../../admin/types';

const PATH_TO_CATEGORY: Record<string, ModelCategory> = {
  '/v1/chat/completions': 'text',
  '/v1/completions': 'text',
  '/v1/embeddings': 'text',
  '/v1/images/generations': 'image',
  '/v1/images/variations': 'image',
  '/v1/audio/transcriptions': 'audio',
  '/v1/audio/speech': 'audio',
  '/v1/video/generations': 'video',
};

export const configInjector = async (c: Context, next: any) => {
  const configHeader = c.req.header(`x-${POWERED_BY}-config`);
  const providerHeader = c.req.header(`x-${POWERED_BY}-provider`);
  if (!configHeader && !providerHeader) {
    const path = c.req.path;
    const category = PATH_TO_CATEGORY[path];
    if (!category) {
      return next();
    }
    const userConfig = await loadUserConfig(category);
    if (userConfig) {
      c.req.raw.headers.set(
        `x-${POWERED_BY}-config`,
        JSON.stringify(userConfig)
      );
    } else {
      return new Response(
        JSON.stringify({
          status: 'failure',
          message:
            'No model routing configured. Please add a model route in the admin panel first.',
        }),
        {
          status: 400,
          headers: {
            'content-type': 'application/json',
          },
        }
      );
    }
  }
  return next();
};
