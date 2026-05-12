const BACKEND_PORT = 8787;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const ADMIN_URL = `${BACKEND_URL}/public/admin/`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 15000;

let backendPid = null;
let isWindows = false;

setStatus('JS loaded! Testing...');

Neutralino.init();

Neutralino.events.on('ready', async () => {
  setStatus('Ready! Starting backend...');
  try {
    const kernelInfo = await Neutralino.computer.getKernelInfo();
    isWindows = kernelInfo.variant === 'Windows NT';

    Neutralino.debug.log('NL_PATH: ' + window.NL_PATH, 'INFO');
    Neutralino.debug.log('Kernel info: ' + JSON.stringify(kernelInfo), 'INFO');
    Neutralino.debug.log('isWindows: ' + isWindows, 'INFO');

    await startBackend();
    await waitForBackend();

    setStatus('Opening UI...');
    Neutralino.debug.log('Navigating to: ' + ADMIN_URL, 'INFO');

    await sleep(1000);
    window.location.href = ADMIN_URL;
  } catch (err) {
    Neutralino.debug.log('Startup error: ' + err.message, 'ERROR');
    showError(`Failed: ${err.message || err}`);
  }
});

Neutralino.events.on('windowClose', async () => {
  Neutralino.app.exit();
});

async function startBackend() {
  const binaryName = isWindows ? 'portkey-gateway.exe' : 'portkey-gateway';

  Neutralino.debug.log('startBackend called', 'INFO');
  Neutralino.debug.log('NL_PATH: ' + window.NL_PATH, 'INFO');

  let backendBinary = null;
  const candidates = [
    `./${binaryName}`,
    `Contents/MacOS/${binaryName}`,
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
    showError(`Cannot find ${binaryName}. Tried: ${candidates.join(', ')}`);
    return;
  }

  Neutralino.debug.log('Backend binary: ' + backendBinary, 'INFO');

  // Pass PPID so backend can detect when parent (Neutralino) dies
  const ppidFlag = isWindows ? '' : ` --ppid=${window.NL_PID}`;
  const cmd = `${backendBinary} --port=${BACKEND_PORT} --headless${ppidFlag}`;
  Neutralino.debug.log('Spawning: ' + cmd, 'INFO');

  const result = await Neutralino.os.spawnProcess(cmd);
  Neutralino.debug.log('Spawn result PID: ' + result.pid, 'INFO');
  backendPid = result.pid;
}

async function waitForBackend() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    try {
      Neutralino.debug.log('Checking with curl attempt ' + attempt, 'INFO');
      const result = await Neutralino.os.execCommand(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:' +
          BACKEND_PORT +
          '/public/admin/ 2>&1 || echo "CURL_FAILED"'
      );

      const stdout = result.stdOut?.trim() || result.stdout?.trim() || '';

      if (stdout && stdout !== 'CURL_FAILED' && !isNaN(parseInt(stdout))) {
        Neutralino.debug.log('Server is up!', 'INFO');
        return;
      }
    } catch (err) {
      Neutralino.debug.log('Check error: ' + err.message, 'INFO');
    }
    await sleep(POLL_INTERVAL_MS);
  }
  Neutralino.debug.log('Backend timeout', 'ERROR');
  showError('Backend failed to start within ' + POLL_TIMEOUT_MS / 1000 + 's.');
}

function setStatus(msg) {
  const el = document.getElementById('status');
  if (el) el.textContent = msg;
}

function showError(msg) {
  const el = document.getElementById('error');
  if (el) el.textContent = msg;
  setStatus('Something went wrong.');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
