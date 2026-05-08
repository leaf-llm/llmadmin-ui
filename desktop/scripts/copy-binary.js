import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const buildDir = path.join(__dirname, '../../build');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log('Source not found:', src);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function findAppBundle(distBase) {
  const entries = fs.readdirSync(distBase, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.endsWith('.app')) {
      return path.join(distBase, entry.name);
    }
  }
  return null;
}

function copyLinux(destDir) {
  if (!fs.existsSync(destDir)) {
    console.log('Dist directory not found, skipping copy');
    return;
  }

  const binarySrc = path.join(buildDir, 'portkey-gateway');
  if (fs.existsSync(binarySrc)) {
    const binaryDest = path.join(destDir, 'portkey-gateway');
    fs.copyFileSync(binarySrc, binaryDest);
    console.log('Binary copied to:', binaryDest);
  } else {
    console.log('Binary not found:', binarySrc);
  }

  const publicSrc = path.join(buildDir, 'public');
  const publicDest = path.join(destDir, 'public');
  if (fs.existsSync(publicSrc)) {
    copyDir(publicSrc, publicDest);
    console.log('UI files copied to:', publicDest);
  } else {
    console.log('Public directory not found:', publicSrc);
  }
}

function copyMac() {
  const distBase = path.join(__dirname, '..', 'dist');
  const releaseDirs = fs.readdirSync(distBase, { withFileTypes: true })
    .filter(e => e.isDirectory() && e.name.startsWith('mac_'))
    .map(e => path.join(distBase, e.name, 'release'));

  for (const releaseDir of releaseDirs) {
    const appBundle = findAppBundle(releaseDir);
    if (!appBundle) {
      console.log('App bundle not found in:', releaseDir);
      continue;
    }

    const macosDir = path.join(appBundle, 'Contents', 'MacOS');
    const resourcesDir = path.join(appBundle, 'Contents', 'Resources');

    const binarySrc = path.join(buildDir, 'portkey-gateway');
    if (fs.existsSync(binarySrc)) {
      const binaryDest = path.join(macosDir, 'portkey-gateway');
      fs.copyFileSync(binarySrc, binaryDest);
      fs.chmodSync(binaryDest, 0o755);
      console.log('Binary copied to:', binaryDest);
    } else {
      console.log('Binary not found:', binarySrc);
    }

    const publicSrc = path.join(buildDir, 'public');
    const publicDest = path.join(resourcesDir, 'public');
    if (fs.existsSync(publicSrc)) {
      fs.cpSync(publicSrc, publicDest, { recursive: true });
      console.log('UI files copied to:', publicDest);
    } else {
      console.log('Public directory not found:', publicSrc);
    }

    const resourcesNeuSrc = path.join(releaseDir, 'resources.neu');
    const resourcesNeuDest = path.join(resourcesDir, 'resources.neu');
    if (fs.existsSync(resourcesNeuSrc)) {
      fs.copyFileSync(resourcesNeuSrc, resourcesNeuDest);
      console.log('resources.neu copied to:', resourcesNeuDest);
    }
  }
}

const platform = process.argv[2] || process.platform;
if (platform === 'darwin' || platform === 'mac') {
  copyMac();
} else {
  const destDir = path.join(__dirname, '../dist/local-llm-gateway');
  copyLinux(destDir);
}

