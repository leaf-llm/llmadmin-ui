const BACKEND_PORT = 8787;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const ADMIN_URL = `${BACKEND_URL}/public/admin/`;
const POLL_INTERVAL_MS = 500;
const POLL_TIMEOUT_MS = 30000;

let backendPid = null;
let isWindows = false;

Neutralino.init();

Neutralino.events.on('ready', async () => {
  try {
    const kernelInfo = await Neutralino.computer.getKernelInfo();
    isWindows = kernelInfo.variant === 'Windows NT';

    setStatus('Starting gateway...');
    await startBackend();
    setStatus('Waiting for gateway...');
    await waitForBackend();
    setStatus('Opening UI...');
    await Neutralino.window.navigate(ADMIN_URL);
  } catch (err) {
    showError(`Failed to start gateway: ${err.message || err}`);
  }
});

Neutralino.events.on('windowClose', async () => {
  await stopBackend();
  await Neutralino.app.exit();
});

async function startBackend() {
  // In dev (neu run from desktop/), binary is one level up in build/.
  // In a packaged distribution, ship the binary alongside the neutralino binary
  // and reference it as ./portkey-gateway (adjust packaging scripts accordingly).
  const binaryName = isWindows ? 'portkey-gateway.exe' : 'portkey-gateway';
  const devPath = `../build/${binaryName}`;

  const cmd = `${devPath} --port=${BACKEND_PORT} --headless`;
  const result = await Neutralino.os.spawnProcess(cmd);
  backendPid = result.pid;
}

async function waitForBackend() {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BACKEND_URL}/`);
      if (res.status < 500) return; // backend is up
    } catch {
      // not ready yet
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Gateway did not start within ${POLL_TIMEOUT_MS / 1000}s`);
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
