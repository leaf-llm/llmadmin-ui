/**
 * Cross-platform home directory resolution for the Neutralino.js webview.
 *
 * Both `src/lib/configStore.ts` (frontend) and `desktop/resources/js/main.js`
 * (desktop launcher) need to know the user's home directory so they can agree
 * on the path to `~/.llm-admin/conf.json`. They both run inside the same
 * Neutralino webview, so we share a single implementation via
 * `window.__getNeutralinoHomeDir` and `window.__joinPath`.
 *
 * Why this lives in a separate module: an earlier duplicate implementation
 * diverged between the two callers — on Windows the regex only matched
 * `/home/<user>` and `/Users/<user>` prefixes, but Windows paths use `\`, so
 * it fell through to a hardcoded `/home/user` literal and the frontend and
 * desktop launcher ended up writing to different files. Sharing one
 * implementation eliminates that whole class of bug.
 */

const HOME_CACHE_KEY = 'llm_admin_home_v2';

let cachedHomeDir: string | null = null;

function getNeutralino(): any {
  return typeof window !== 'undefined' ? (window as any).Neutralino : null;
}

function timeoutPromise<T>(ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const id = window.setTimeout(() => resolve(fallback), ms);
    (id as any)?.unref?.();
  });
}

function getHomeFromStorage(): string | null {
  try {
    return localStorage.getItem(HOME_CACHE_KEY);
  } catch {
    return null;
  }
}

function setHomeToStorage(home: string): void {
  try {
    localStorage.setItem(HOME_CACHE_KEY, home);
  } catch {}
}

/**
 * Parse the user's home directory out of a Neutralino NL_PATH value.
 *
 * Examples (matched via /[\\\/](Users|home)[\\\/]([^\\\/]+)/):
 *   Windows: "C:\\Users\\<user>\\AppData\\...\\app.neu" -> "C:\\Users\\<user>"
 *   Linux:   "/home/<user>/.local/share/llm-admin/app.neu" -> "/home/<user>"
 *   macOS:   "/Users/<user>/Library/..." -> "/Users/<user>"
 *
 * Returns null if no match is found.
 */
function parseHomeFromNlPath(nlPath: string): string | null {
  const m = nlPath.match(/[\\/](Users|home)[\\/]([^\\/]+)/);
  if (!m) return null;
  const idx = nlPath.indexOf(m[0]);
  return nlPath.slice(0, idx + m[0].length);
}

/**
 * Detect the path separator used by the host filesystem. NL_PATH is set by
 * Neutralino at startup, so we can use it as a reliable platform hint.
 */
export function detectPathSeparator(): '\\' | '/' {
  if (typeof window === 'undefined') return '/';
  const nlPath = (window as any).NL_PATH;
  if (typeof nlPath === 'string' && nlPath.includes('\\')) return '\\';
  return '/';
}

export function isWindowsPlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const nlPath = (window as any).NL_PATH;
  if (typeof nlPath === 'string' && nlPath.includes('\\')) return true;
  // Fallback for non-Neutralino contexts (e.g. web dev server)
  return typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
}

/**
 * Join path segments using the platform-native separator.
 *
 * `path.join` is a Node API and not available in the browser webview, so we
 * implement it here. We deliberately do NOT call `path.normalize` — that
 * turns `C:\\Users\\<user>` into `C:/Users/<user>`, which then breaks Windows shell
 * commands. Native separators all the way through is what we want.
 */
export function joinPath(...parts: string[]): string {
  const sep = detectPathSeparator();
  return parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map((p) => p.replace(/[\\/]+$/, ''))
    .join(sep)
    .replace(/[\\/]+/g, sep);
}

/**
 * Resolve the user's home directory, with cross-platform fallbacks.
 *
 * Order:
 *   1. localStorage cache (key `llm_admin_home_v2`)
 *   2. Parse NL_PATH via the Windows- and Unix-aware regex
 *   3. Platform-appropriate env var (USERPROFILE on Windows, HOME elsewhere)
 *   4. Neutralino.os.homeDir() (cross-platform native call, 4s timeout)
 *   5. Throw — never return a path we can't verify
 *
 * The earlier implementation silently fell back to the hardcoded literal
 * `/home/user`, which on Windows is a nonsense POSIX path. Throwing surfaces
 * the failure to the user instead of corrupting state.
 */
export async function getNeutralinoHomeDir(): Promise<string> {
  if (cachedHomeDir) {
    return cachedHomeDir;
  }

  const stored = getHomeFromStorage();
  if (stored) {
    cachedHomeDir = stored;
    return cachedHomeDir;
  }

  try {
    const nlPath = (window as any).NL_PATH;
    if (nlPath && typeof nlPath === 'string') {
      const home = parseHomeFromNlPath(nlPath);
      if (home) {
        cachedHomeDir = home;
        setHomeToStorage(home);
        return cachedHomeDir;
      }
    }
  } catch {}

  const Neutralino = getNeutralino();
  const envName = isWindowsPlatform() ? 'USERPROFILE' : 'HOME';

  try {
    if (Neutralino?.os?.getEnv) {
      const home = await Promise.race([
        Neutralino.os.getEnv(envName),
        timeoutPromise(4000, null),
      ]);
      if (home && typeof home === 'string' && home.length > 0) {
        cachedHomeDir = home;
        setHomeToStorage(home);
        return cachedHomeDir;
      }
    }
  } catch {}

  try {
    if (Neutralino?.os?.homeDir) {
      const home = await Promise.race([
        Neutralino.os.homeDir(),
        timeoutPromise(4000, null),
      ]);
      if (home && typeof home === 'string' && home.length > 0) {
        cachedHomeDir = home;
        setHomeToStorage(home);
        return cachedHomeDir;
      }
    }
  } catch {}

  throw new Error(
    'Could not determine home directory on this platform. ' +
      'Tried localStorage cache, NL_PATH parsing, ' +
      `${envName} env var, and Neutralino.os.homeDir().`
  );
}

// Expose to plain-JS main.js via window so the desktop launcher and the
// frontend can never disagree on the home directory again.
if (typeof window !== 'undefined') {
  (window as any).__getNeutralinoHomeDir = getNeutralinoHomeDir;
  (window as any).__joinPath = joinPath;
  (window as any).__isWindowsPlatform = isWindowsPlatform;
}
