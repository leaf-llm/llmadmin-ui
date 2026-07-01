let isWindows = false;

Neutralino.init();

Neutralino.events.on('ready', async () => {
  try {
    const kernelInfo = await Neutralino.computer.getKernelInfo();
    isWindows = kernelInfo.variant === 'Windows NT';

    // macOS webview blocks Cmd+C/V/X without a native Edit menu.
    // Intercept keyboard shortcuts and use Neutralino.clipboard API instead.
    if (!isWindows) {
      setupClipboardShortcuts();
    }

    Neutralino.debug.log('Starting backend...', 'INFO');
    await startBackend();
    Neutralino.debug.log('Backend process spawned', 'INFO');
  } catch (err) {
    Neutralino.debug.log('Startup error: ' + err.message, 'ERROR');
    try {
      await Neutralino.os.showMessageBox(
        'Startup Error',
        'Failed to start gateway: ' + (err.message || err),
        'ERROR'
      );
    } catch {
      // showMessageBox may not be available in all modes
    }
  }
});

Neutralino.events.on('windowClose', async () => {
  // Neutralino.app.exit() and execCommand are async IPC — on macOS the WKWebView
  // event loop crashes (objc_exception_rethrow) before they complete.
  // Instead, use a browser-native fetch to tell llm-gateway to kill us.
  // llm-gateway has our PID via --ppid and will SIGTERM us then exit itself.
  try {
    navigator.sendBeacon('http://127.0.0.1:8700/shutdown');
  } catch {
    // Last resort: try normal exit
    Neutralino.app.exit();
  }
});

function setupClipboardShortcuts() {
  document.addEventListener('keydown', async (e) => {
    const isMod = e.metaKey || e.ctrlKey;
    if (!isMod) return;

    const active = document.activeElement;
    const isEditable =
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.isContentEditable);
    if (!isEditable) return;

    if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      try {
        const text = await Neutralino.clipboard.readText();
        if (text) {
          document.execCommand('insertText', false, text);
        }
      } catch {}
    } else if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      try {
        const selected = window.getSelection()?.toString() || '';
        if (selected) {
          await Neutralino.clipboard.writeText(selected);
        }
      } catch {}
    } else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      try {
        const selected = window.getSelection()?.toString() || '';
        if (selected) {
          await Neutralino.clipboard.writeText(selected);
          document.execCommand('delete');
        }
      } catch {}
    } else if (e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      try {
        if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
          active.select();
        } else {
          document.execCommand('selectAll');
        }
      } catch {}
    }
  });
}

async function resolvePath(path) {
  try {
    const result = await Neutralino.os.execCommand(
      isWindows ? `for %I in ("${path}") do @echo %~fI` : `realpath "${path}"`
    );
    const resolved = (result.stdOut || result.stdout || '').trim();
    return resolved || path;
  } catch {
    return path;
  }
}

async function startBackend() {
  const binaryName = isWindows ? 'llm-gateway.exe' : 'llm-gateway';

  // NL_PATH points to the Neutralino app directory (where resources.neu lives).
  // On macOS .app bundles, this is Contents/ but binaries are in Contents/MacOS/.
  let nlDir = window.NL_PATH ? window.NL_PATH.replace(/[^/\\]*$/, '') : '';
  if (!isWindows && nlDir.includes('.app/Contents/')) {
    nlDir += 'MacOS/';
  }

  let backendBinary = null;
  const candidates = [
    `${nlDir}${binaryName}`,
    `./${binaryName}`,
    `./dist/llm-admin/${binaryName}`,
  ];
  for (const candidate of candidates) {
    try {
      const check = isWindows
        ? `if exist "${candidate}" echo FOUND`
        : `test -f "${candidate}" && echo FOUND || echo MISSING`;
      const result = await Neutralino.os.execCommand(check);
      const output = (result.stdOut || result.stdout || '').trim();
      if (output === 'FOUND') {
        backendBinary = candidate;
        break;
      }
    } catch {
      // continue to next candidate
    }
  }

  if (!backendBinary) {
    throw new Error(
      `Cannot find ${binaryName}. Tried: ${candidates.join(', ')}`
    );
  }

  // Resolve to absolute path so spawnProcess doesn't depend on CWD
  const absPath = await resolvePath(backendBinary);
  Neutralino.debug.log(
    'Backend binary: ' + backendBinary + ' -> ' + absPath,
    'INFO'
  );

  // Desktop app uses ~/.llm-admin/conf.json for unified config.
  // The home dir + path joining helpers come from the Vite-bundled frontend
  // (src/lib/neutralinoHomeDir.ts) — single source of truth, so the desktop
  // launcher and the React UI can never disagree on the path.
  if (typeof window.__getNeutralinoHomeDir !== 'function') {
    throw new Error(
      'Shared home-dir helper not loaded. The Vite bundle must be built before main.js can start the backend.'
    );
  }
  const homeDir = await window.__getNeutralinoHomeDir();
  const configPath = window.__joinPath(homeDir, '.llm-admin', 'conf.json');

  // Ensure the config file exists with default unified format before starting backend
  await ensureConfigExists(configPath);

  const ppidFlag = isWindows ? '' : ` --ppid=${window.NL_PID}`;
  const cmd = `"${absPath}" --port=8700 --headless --quiet-log --config="${configPath}"${ppidFlag}`;
  Neutralino.debug.log('Spawning: ' + cmd, 'INFO');

  const result = await Neutralino.os.spawnProcess(cmd);
  Neutralino.debug.log('Spawn result PID: ' + result.pid, 'INFO');
}

function getNeutralino() {
  return typeof window !== 'undefined' ? window.Neutralino : null;
}

async function ensureConfigExists(configPath) {
  const Neutralino = getNeutralino();
  if (!Neutralino?.filesystem?.getStats) {
    Neutralino?.debug?.log('Neutralino filesystem API not available', 'WARN');
    return;
  }

  // Use Neutralino.filesystem API directly — much faster than execCommand
  // (no PowerShell / sh cold-start), and cross-platform by design.
  const dirPath = configPath.substring(
    0,
    Math.max(configPath.lastIndexOf('/'), configPath.lastIndexOf('\\'))
  );

  // Check if file already exists
  try {
    await Neutralino.filesystem.getStats(configPath);
    Neutralino.debug.log('Config already exists at ' + configPath, 'INFO');
    return;
  } catch {
    // Missing — fall through and create
  }

  // File doesn't exist — create dir and write default.
  try {
    const defaultConfig = {
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
    const jsonStr = JSON.stringify(defaultConfig, null, 2);

    try {
      await Neutralino.filesystem.createDirectory(dirPath);
    } catch (e) {
      // Ignore "already exists" — mkdir is idempotent
      const msg = String(e?.message || e || '').toLowerCase();
      if (!(e?.code === 'NE_FS_DIRCRER' || msg.includes('exists') || msg.includes('eexist'))) {
        throw e;
      }
    }

    await Neutralino.filesystem.writeFile(configPath, jsonStr);
    Neutralino.debug.log('Created default config at ' + configPath, 'INFO');
  } catch (createErr) {
    Neutralino.debug.log('Failed to create config: ' + (createErr?.message || createErr), 'ERROR');
  }
}
