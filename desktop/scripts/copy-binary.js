import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Gateway binary is built by the src-gateway submodule into src-gateway/build/.
const buildDir = path.join(__dirname, '../../src-gateway/build');

function copyDist(destDir) {
  if (!fs.existsSync(destDir)) {
    console.log('Dist directory not found, skipping copy');
    return;
  }

  // Find llm-gateway binary (with or without .exe on Windows)
  let binarySrc = path.join(buildDir, 'llm-gateway');
  if (!fs.existsSync(binarySrc) && process.platform === 'win32') {
    binarySrc = path.join(buildDir, 'llm-gateway.exe');
  }

  if (fs.existsSync(binarySrc)) {
    const ext = path.extname(binarySrc);
    const binaryDest = path.join(destDir, 'llm-gateway' + ext);
    fs.copyFileSync(binarySrc, binaryDest);
    if (process.platform !== 'win32') {
      fs.chmodSync(binaryDest, 0o755);
    }
    console.log('Binary copied to:', binaryDest);
  } else {
    console.log('Binary not found:', binarySrc);
  }

  // Plugin source code is now statically imported and bundled into the binary
  // by `bun build --compile`, so the desktop bundle no longer needs a
  // separate `plugins/` directory next to the binary.
}

const destDir = path.join(__dirname, '../dist/llm-admin');
copyDist(destDir);
