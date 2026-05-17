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
  // Instead, use a browser-native fetch to tell portkey-gateway to kill us.
  // portkey-gateway has our PID via --ppid and will SIGTERM us then exit itself.
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
      active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
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
  const binaryName = isWindows ? 'portkey-gateway.exe' : 'portkey-gateway';

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
    throw new Error(`Cannot find ${binaryName}. Tried: ${candidates.join(', ')}`);
  }

  // Resolve to absolute path so spawnProcess doesn't depend on CWD
  const absPath = await resolvePath(backendBinary);
  Neutralino.debug.log('Backend binary: ' + backendBinary + ' -> ' + absPath, 'INFO');

  const ppidFlag = isWindows ? '' : ` --ppid=${window.NL_PID}`;
  const cmd = `"${absPath}" --port=8700 --headless${ppidFlag}`;
  Neutralino.debug.log('Spawning: ' + cmd, 'INFO');

  const result = await Neutralino.os.spawnProcess(cmd);
  Neutralino.debug.log('Spawn result PID: ' + result.pid, 'INFO');
}
