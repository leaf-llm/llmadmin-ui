const BACKEND_PORT = 8787;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const ADMIN_URL = `${BACKEND_URL}/public/admin/`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30000;

let backendPid = null;
let isWindows = false;

// dirname equivalent - get parent directory
const dirname = (p) => p.replace(/[/\\][^/\\]*$/, '');

// Test: change status immediately to prove JS runs
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

    // Wait for server to be ready before navigating
    await sleep(1000);

    window.location.href = ADMIN_URL;
  } catch (err) {
    Neutralino.debug.log('Startup error: ' + err.message, 'ERROR');
    showError(`Failed: ${err.message || err}`);
  }
});

Neutralino.events.on('windowClose', async () => {
  await stopBackend();
  await Neutralino.app.exit();
});

async function startBackend() {
  const binaryName = isWindows ? 'portkey-gateway.exe' : 'portkey-gateway';

  Neutralino.debug.log('startBackend called', 'INFO');

  // Get the directory of the neutralino binary via NL_PATH
  const nlPath = await Neutralino.os.getEnv('NL_PATH');
  Neutralino.debug.log('NL_PATH: ' + nlPath, 'INFO');

  let backendBinary;
  if (nlPath) {
    // Packaged: binary is alongside neutralino at ./portkey-gateway
    const binDir = nlPath.substring(0, nlPath.lastIndexOf('/'));
    backendBinary = `${binDir}/${binaryName}`;
  } else {
    // Dev (neu run): binary is one level up in build/
    backendBinary = `../build/${binaryName}`;
  }
  Neutralino.debug.log('Backend binary: ' + backendBinary, 'INFO');

  const cmd = `${backendBinary} --port=${BACKEND_PORT} --headless`;
  Neutralino.debug.log('Spawning: ' + cmd, 'INFO');

  const result = await Neutralino.os.spawnProcess(cmd);
  Neutralino.debug.log('Spawn result PID: ' + result.pid, 'INFO');
  backendPid = result.pid;
}

async function waitForBackend() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let attempt = 0;

  // Use curl to check if server is responding
  while (Date.now() < deadline) {
    attempt++;
    try {
      Neutralino.debug.log('Checking with curl attempt ' + attempt, 'INFO');
      const result = await Neutralino.os.execCommand(
        'curl -s -o /dev/null -w "%{http_code}" http://localhost:' +
          BACKEND_PORT +
          '/ 2>&1 || echo "CURL_FAILED"'
      );

      // Note: Neutralino uses stdOut with capital O
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
}

async function stopBackend() {
  if (!backendPid) return;
  try {
    const killCmd = isWindows
      ? `taskkill /F /PID ${backendPid}`
      : `kill ${backendPid}`;
    await Neutralino.os.spawnProcess(killCmd);
  } catch {
    // best effort
  }
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
