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
    `../build/${binaryName}`,
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

  // Desktop app uses ~/.llm-admin/conf.json for unified config
  const homeDir = await getHomeDir();
  const configPath = `${homeDir}/.llm-admin/conf.json`;

  // Ensure the config file exists with default unified format before starting backend
  await ensureConfigExists(configPath);

  const ppidFlag = isWindows ? '' : ` --ppid=${window.NL_PID}`;
  const cmd = `"${absPath}" --port=8700 --headless --quiet-log --config="${configPath}"${ppidFlag}`;
  Neutralino.debug.log('Spawning: ' + cmd, 'INFO');

  const result = await Neutralino.os.spawnProcess(cmd);
  Neutralino.debug.log('Spawn result PID: ' + result.pid, 'INFO');
}

async function getHomeDir() {
  // Try NL_PATH first (synchronous, always available in Neutralino)
  try {
    const nlPath = window.NL_PATH;
    if (nlPath && typeof nlPath === 'string') {
      for (const prefix of ['/home/', '/Users/']) {
        const idx = nlPath.indexOf(prefix);
        if (idx !== -1) {
          const afterPrefix = nlPath.slice(idx + prefix.length);
          const endIdx = afterPrefix.indexOf('/');
          if (endIdx !== -1) {
            return prefix + afterPrefix.slice(0, endIdx);
          }
        }
      }
    }
  } catch {}

  const Neutralino = getNeutralino();
  if (Neutralino?.os?.getEnv) {
    try {
      const home = await Neutralino.os.getEnv('HOME');
      if (home && typeof home === 'string' && home.length > 0) {
        return home;
      }
    } catch {}
  }
  if (Neutralino?.os?.homeDir) {
    try {
      const home = await Neutralino.os.homeDir();
      if (home && typeof home === 'string' && home.length > 0) {
        return home;
      }
    } catch {}
  }
  return '/home/user';
}

function getNeutralino() {
  return typeof window !== 'undefined' ? window.Neutralino : null;
}

async function ensureConfigExists(configPath) {
  const Neutralino = getNeutralino();
  if (!Neutralino?.os?.execCommand) {
    Neutralino?.debug?.log('Neutralino execCommand not available', 'WARN');
    return;
  }

  // Use shell command instead of Neutralino filesystem API
  const dirPath = configPath.substring(0, configPath.lastIndexOf('/'));

  // Check if file exists
  const checkCmd = isWindows
    ? `if exist "${configPath}" (echo EXISTS) else (echo MISSING)`
    : `test -f "${configPath}" && echo EXISTS || echo MISSING`;

  try {
    const checkResult = await Neutralino.os.execCommand(checkCmd);
    const output = (checkResult.stdOut || checkResult.stdout || '').trim();
    if (output === 'EXISTS') {
      Neutralino.debug.log('Config already exists at ' + configPath, 'INFO');
      return;
    }
  } catch (e) {
    Neutralino.debug.log('Check failed, will try to create anyway: ' + (e?.message || e), 'INFO');
  }

  // File doesn't exist — create dir and write default using shell
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
    const b64 = btoa(JSON.stringify(defaultConfig, null, 2));

    const mkdirCmd = isWindows
      ? `mkdir "${dirPath}"`
      : `mkdir -p "${dirPath}"`;
    await Neutralino.os.execCommand(mkdirCmd);

    // Write using base64 decode to avoid quoting issues
    const writeCmd = isWindows
      ? `powershell -Command "[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${b64}')) | Set-Content -Path '${configPath}'"`
      : `echo '${b64}' | base64 -d > '${configPath}'`;
    await Neutralino.os.execCommand(writeCmd);

    Neutralino.debug.log('Created default config at ' + configPath, 'INFO');
  } catch (createErr) {
    Neutralino.debug.log('Failed to create config via shell: ' + (createErr?.message || createErr), 'ERROR');
  }
}
