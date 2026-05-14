let isWindows = false;

Neutralino.init();

Neutralino.events.on('ready', async () => {
  try {
    const kernelInfo = await Neutralino.computer.getKernelInfo();
    isWindows = kernelInfo.variant === 'Windows NT';

    // macOS requires a native Edit menu for Cmd+C/V/X shortcuts to work in webview
    if (!isWindows) {
      await Neutralino.window.setMainMenu([
        {
          id: 'edit',
          text: 'Edit',
          menuItems: [
            { id: 'cut', text: 'Cut' },
            { id: 'copy', text: 'Copy' },
            { id: 'paste', text: 'Paste' },
          ],
        },
      ]);
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
  // Exit without waiting - portkey-gateway will exit on its own via --ppid watcher
  Neutralino.app.exit();
});

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
