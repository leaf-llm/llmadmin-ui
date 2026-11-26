import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Gateway binary is built by the src-gateway submodule into src-gateway/build/.
const buildDir = path.join(__dirname, '../../src-gateway/build');
const isDev = process.argv.includes('--dev');

function copyBinary(destDir) {
  fs.mkdirSync(destDir, { recursive: true });

  // Find llm-gateway binary (with or without .exe on Windows)
  let binarySrc = path.join(buildDir, 'llm-gateway');
  if (!fs.existsSync(binarySrc) && process.platform === 'win32') {
    binarySrc = path.join(buildDir, 'llm-gateway.exe');
  }

  if (!fs.existsSync(binarySrc)) {
    console.error(
      `Gateway binary not found: ${binarySrc}\n` +
        'Run: npm --prefix src-gateway run build:bun'
    );
    process.exit(1);
  }

  const ext = path.extname(binarySrc);
  const binaryDest = path.join(destDir, 'llm-gateway' + ext);
  fs.copyFileSync(binarySrc, binaryDest);
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryDest, 0o755);
  }
  console.log('Binary copied to:', binaryDest);
}

// `neu run` serves desktop/resources directly and main.js looks for a binary
// next to the Neutralino app. `neu build` packages into dist/llm-admin first.
const destDir = isDev
  ? path.join(__dirname, '..')
  : path.join(__dirname, '../dist/llm-admin');

copyBinary(destDir);
