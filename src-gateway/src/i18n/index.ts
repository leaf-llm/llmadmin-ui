import i18next from 'i18next';
import en from './translations/en.json';
import zh from './translations/zh.json';

const resources = { en: { translation: en }, zh: { translation: zh } };

i18next.init({
  resources,
  fallbackLng: 'en',
  lng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export const ERROR_CODES = {
  ERR_GENERIC: 'ERR_GENERIC',
  ERR_GUARDRAIL_FAILED: 'ERR_GUARDRAIL_FAILED',
  ERR_REQUEST_TIMEOUT: 'ERR_REQUEST_TIMEOUT',
  ERR_INVALID_RESPONSE: 'ERR_INVALID_RESPONSE',
  ERR_WEBSOCKET_FAILED: 'ERR_WEBSOCKET_FAILED',
  ERR_MISSING_BOUNDARY: 'ERR_MISSING_BOUNDARY',
  ERR_NO_PROVIDER: 'ERR_NO_PROVIDER',
  ERR_PROVIDER_NOT_FOUND: 'ERR_PROVIDER_NOT_FOUND',
  ERR_INVALID_CONTENT_TYPE: 'ERR_INVALID_CONTENT_TYPE',
  ERR_MISSING_PROVIDER_HEADER: 'ERR_MISSING_PROVIDER_HEADER',
  ERR_INVALID_PROVIDER: 'ERR_INVALID_PROVIDER',
  ERR_INVALID_CUSTOM_HOST: 'ERR_INVALID_CUSTOM_HOST',
  ERR_INVALID_CONFIG: 'ERR_INVALID_CONFIG',
  ERR_CONFIG_VERSION_UNSUPPORTED: 'ERR_CONFIG_VERSION_UNSUPPORTED',
  ERR_INVALID_FORWARD_HEADERS: 'ERR_INVALID_FORWARD_HEADERS',
  ERR_CANNOT_LOG_COMMITTED: 'ERR_CANNOT_LOG_COMMITTED',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export function t(key: string, options?: Record<string, string | number>): string {
  return i18next.t(key, options);
}

export function setLanguage(lang: string): void {
  i18next.changeLanguage(lang);
}

export function detectLanguage(acceptLanguage: string | null): string {
  if (!acceptLanguage) return 'en';

  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, q = '1'] = lang.trim().split(';q=');
      return { code: code.trim(), q: parseFloat(q) };
    })
    .sort((a, b) => b.q - a.q);

  for (const { code } of languages) {
    if (code.startsWith('zh')) return 'zh';
    if (code.startsWith('en')) return 'en';
  }

  return 'en';
}

export function getErrorMessage(key: string, options?: Record<string, string | number>): string {
  return t(key, options);
}

export function createErrorResponse(errCode: string, message: string): string {
  return JSON.stringify({
    status: 'failure',
    err_code: errCode,
    message,
  });
}