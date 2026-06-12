const BACKEND_PORT = 8700;

export function isDesktopMode(): boolean {
  return typeof window !== 'undefined' && !!(window as any).NL_PORT;
}

export function getApiBaseUrl(): string {
  if (isDesktopMode()) {
    return `http://127.0.0.1:${BACKEND_PORT}`;
  }
  return '';
}

export function getBackendPort(): number {
  return BACKEND_PORT;
}

export async function openExternalUrl(url: string) {
  if (isDesktopMode()) {
    try {
      const Neutralino = (window as any).Neutralino;
      if (Neutralino?.os?.open) {
        await Neutralino.os.open(url);
      }
    } catch {
      window.open(url, '_blank');
    }
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
