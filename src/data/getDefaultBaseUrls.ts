import { ProviderId } from '../admin/types';
import providersData from './providers.json';

export function getDefaultBaseUrls(): Partial<Record<ProviderId, string>> {
  const result: Partial<Record<ProviderId, string>> = {};
  for (const entry of providersData.data as Array<{
    id: string;
    base_url?: string;
  }>) {
    if (entry.id && entry.base_url) {
      result[entry.id as ProviderId] = entry.base_url;
    }
  }
  return result;
}
