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

  // Copy plugins directory alongside the binary so dynamic imports work.
  const pluginsSrc = path.join(__dirname, '../../src-gateway/plugins');
  const pluginsDest = path.join(destDir, 'plugins');
  if (fs.existsSync(pluginsSrc)) {
    fs.rmSync(pluginsDest, { recursive: true, force: true });
    copyDirSync(pluginsSrc, pluginsDest);
    console.log('Plugins copied to:', pluginsDest);
  }
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const destDir = path.join(__dirname, '../dist/llm-admin');
copyDist(destDir);
