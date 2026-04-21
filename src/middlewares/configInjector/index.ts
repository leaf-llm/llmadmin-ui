import { Context } from 'hono';
import { POWERED_BY } from '../../globals';
import { loadUserConfig } from '../../admin/config/store';

export const configInjector = async (c: Context, next: any) => {
  const configHeader = c.req.header(`x-${POWERED_BY}-config`);
  if (!configHeader) {
    const userConfig = await loadUserConfig();
    if (userConfig) {
      c.req.raw.headers.set(
        `x-${POWERED_BY}-config`,
        JSON.stringify(userConfig)
      );
    }
  }
  return next();
};
