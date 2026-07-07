import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

function neutralinoInjectPlugin() {
  let isDesktop = false;
  return {
    name: 'neutralino-inject',
    configResolved(config: any) {
      isDesktop = config.mode === 'desktop';
    },
    transformIndexHtml(html: string) {
      if (isDesktop) {
        return html.replace(
          '</body>',
          '  <script src="js/neutralino.js"></script>\n  <script src="js/main.js"></script>\n</body>'
        );
      }
    },
  };
}

function isLocalOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  return (
    origin.startsWith('http://localhost') ||
    origin.startsWith('http://127.0.0.1')
  );
}

function applyCors(res: any, origin: string | undefined) {
  if (isLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,PUT,POST,DELETE,OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization'
    );
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

function defaultUnifiedConfig() {
  return {
    settings: {
      plugins_enabled: ['default'],
      credentials: {},
      cache: false,
      integrations: [],
    },
    gateway: {
      providers: {},
      text: { routing: [], userConfig: null },
      image: { routing: [], userConfig: null },
      video: { routing: [], userConfig: null },
      audio: { routing: [], userConfig: null },
      mcp: { routing: [], userConfig: null },
    },
    server: { port: 8700, headless: false },
  };
}

function sendJson(
  res: any,
  status: number,
  body: Record<string, unknown>
) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

async function readUnifiedConfig(confPath: string): Promise<{
  config: Record<string, unknown>;
  existed: boolean;
}> {
  try {
    const raw = await readFile(confPath, 'utf-8');
    return { config: JSON.parse(raw), existed: true };
  } catch (e: any) {
    if (e?.code === 'ENOENT') {
      return { config: defaultUnifiedConfig(), existed: false };
    }
    throw e;
  }
}

async function atomicWriteConfig(
  confPath: string,
  merged: Record<string, unknown>
): Promise<void> {
  const tmpPath = `${confPath}.tmp-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await writeFile(tmpPath, JSON.stringify(merged, null, 2), 'utf-8');
  try {
    await rename(tmpPath, confPath);
  } catch (e) {
    try {
      await unlink(tmpPath);
    } catch {}
    throw e;
  }
}

/**
 * Dev-only handler for /admin/config. The path itself is short-circuited by
 * the bypass callback on the proxy (see `proxy['/admin'].bypass` below), so
 * this function is only ever invoked for /admin/config and /admin/config/
 * (with or without query string).
 */
async function handleConfRequest(
  req: any,
  res: any,
  confPath: string
): Promise<void> {
  const origin = req.headers?.origin;

  if (req.method === 'OPTIONS') {
    applyCors(res, origin);
    res.statusCode = 204;
    res.end();
    return;
  }
  applyCors(res, origin);

  try {
    if (req.method === 'GET') {
      const { config, existed } = await readUnifiedConfig(confPath);
      sendJson(res, 200, {
        ok: true,
        existed,
        config: config.gateway || {},
        unified: config,
      });
      return;
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(res, 400, { ok: false, message: 'invalid_json' });
        return;
      }
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed)
      ) {
        sendJson(res, 400, { ok: false, message: 'invalid_body' });
        return;
      }
      const incoming = parsed as Record<string, unknown>;
      const { config: existing } = await readUnifiedConfig(confPath);
      // Preserve any existing top-level keys the user may have (legacy
      // Portkey schema fields, custom keys, etc.). Only the gateway block
      // is updated — settings/server fall through unchanged.
      const merged: Record<string, unknown> = {
        ...existing,
      };
      // Allow the PUT to also update settings/server if explicitly provided.
      if ('settings' in incoming) merged.settings = incoming.settings;
      if ('server' in incoming) merged.server = incoming.server;
      merged.gateway = incoming.gateway ?? incoming;
      await atomicWriteConfig(confPath, merged);
      sendJson(res, 200, {
        ok: true,
        config: merged.gateway,
        unified: merged,
      });
      return;
    }

    sendJson(res, 405, { ok: false, message: 'method_not_allowed' });
  } catch (e: any) {
    console.error('[dev-conf-json] error:', e);
    sendJson(res, 500, {
      ok: false,
      message: e?.message || 'internal_error',
    });
  }
}

/**
 * Dev-only plugin: serves /admin/config from a local conf.json file so the
 * web UI can read/write configuration without the gateway running.
 *
 * The /admin proxy bypass skips /admin/config; this middleware then handles
 * only that path. Everything else under /admin falls through to the gateway
 * proxy unchanged.
 *
 * Atomicity matches the gateway and Neutralino desktop paths: write a tmp
 * file in the same directory and rename over the destination, so a crash
 * mid-write never leaves a half-written file.
 */
function devConfJsonPlugin() {
  return {
    name: 'dev-conf-json',
    configureServer(server: any) {
      const confPath = path.resolve(process.cwd(), 'conf.json');
      server.middlewares.use('/admin/config', (req: any, res: any) => {
        // Strip trailing slash so /admin/config/ and /admin/config match.
        const stripped = (req.url || '').split('?')[0].replace(/\/+$/, '');
        if (stripped !== '' && stripped !== '/') {
          // Sub-path like /export, /import — let it fall through (proxy
          // bypass already skipped, so return 404 here).
          res.statusCode = 404;
          res.end();
          return;
        }
        handleConfRequest(req, res, confPath);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const isDesktop = mode === 'desktop';
  return {
    plugins: [react(), neutralinoInjectPlugin(), devConfJsonPlugin()],
    base: isDesktop ? '/' : '/public/admin/',
    build: {
      outDir: isDesktop ? './desktop/resources' : './build/public/admin',
      emptyOutDir: !isDesktop,
    },
    server: {
      host: '::',
      proxy: {
        '/admin': {
          target: 'http://localhost:8700',
          changeOrigin: true,
          // Skip the gateway for /admin/config and /admin/config/ — our
          // dev-conf-json middleware handles those locally.
          bypass: (req: any) => {
            const url = req.url || '';
            const pathname = url.split('?')[0].replace(/\/+$/, '');
            if (pathname === '/admin/config' || pathname === '/admin/config/') {
              return url; // return string → middleware calls next() and our handler runs
            }
            return undefined; // fall through to normal proxying
          },
        },
        '/log': {
          target: 'http://localhost:8700',
          changeOrigin: true,
        },
      },
    },
  };
});