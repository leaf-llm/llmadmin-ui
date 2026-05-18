import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../../build');

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
