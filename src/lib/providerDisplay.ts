import type { TFunction } from 'i18next';

/**
 * Returns a human-friendly display name for a provider key. Falls back to
 * capitalizing the first letter when no mapping exists.
 */
export function getProviderDisplayName(
  provider: string,
  t: TFunction | ((key: string) => string)
): string {
  const providerMap: Record<string, string> = {
    zhipu: t('common.providerZhipu'),
    dashscope: t('common.providerDashscope'),
    doubao: t('common.providerDoubao'),
    minimax: 'MiniMax',
    moonshot: 'Moonshot AI',
    'google-openai': 'Google',
  };
  return (
    providerMap[provider] ||
    provider.charAt(0).toUpperCase() + provider.slice(1)
  );
}
