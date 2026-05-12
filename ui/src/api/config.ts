const BACKEND_PORT = 8787;

export function isDesktopMode(): boolean {
  return typeof window !== 'undefined' && !!(window as any).NL_PORT;
}

export function getApiBaseUrl(): string {
  if (isDesktopMode()) {
    return `http://localhost:${BACKEND_PORT}`;
  }
  return '';
}

export function getBackendPort(): number {
  return BACKEND_PORT;
}
