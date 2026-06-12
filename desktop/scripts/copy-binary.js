import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Gateway binary is built by the src-gateway submodule at src-gateway/build/.
// After build, it may be mirrored to a top-level build/ directory by the
// `build:gateway` script, or we read it directly from the submodule.
const buildDir = fs.existsSync(path.join(__dirname, '../../build'))
  ? path.join(__dirname, '../../build')
  : path.join(__dirname, '../../src-gateway/build');

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
}

const destDir = path.join(__dirname, '../dist/llm-admin');
copyDist(destDir);
