import { Context } from 'hono';
import { POWERED_BY } from '../../globals';
import { loadUserConfig } from '../../admin/config/store';
import { ModelCategory } from '../../admin/types';

const PATH_TO_CATEGORY: Record<string, ModelCategory> = {
  '/v1/messages': 'text',
  '/v1/chat/completions': 'text',
  '/v1/completions': 'text',
  '/v1/embeddings': 'text',
  '/v1/images/generations': 'image',
  '/v1/images/edits': 'image',
  '/v1/audio/speech': 'audio',
  '/v1/audio/translations': 'audio',
};

function getCategoryFromPath(path: string): ModelCategory {
  if (PATH_TO_CATEGORY[path]) return PATH_TO_CATEGORY[path];
  if (path.startsWith('/v1/images')) return 'image';
  if (path.startsWith('/v1/audio')) return 'audio';
  if (path.startsWith('/v1/video')) return 'video';
  return 'text';
}

export const configInjector = async (c: Context, next: any) => {
  const configHeader = c.req.header(`x-${POWERED_BY}-config`);
  if (!configHeader) {
    const category = getCategoryFromPath(c.req.path);
    const userConfig = await loadUserConfig(category);
    if (userConfig) {
      c.req.raw.headers.set(
        `x-${POWERED_BY}-config`,
        JSON.stringify(userConfig)
      );
    }
  }
  return next();
};
