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

function copyDist(destDir) {
  if (!fs.existsSync(destDir)) {
    console.log('Dist directory not found, skipping copy');
    return;
  }

  const binarySrc = path.join(buildDir, 'portkey-gateway');
  if (fs.existsSync(binarySrc)) {
    const binaryDest = path.join(destDir, 'portkey-gateway');
    fs.copyFileSync(binarySrc, binaryDest);
    fs.chmodSync(binaryDest, 0o755);
    console.log('Binary copied to:', binaryDest);
  } else {
    console.log('Binary not found:', binarySrc);
  }

  const publicSrc = path.join(buildDir, 'public');
  const publicDest = path.join(destDir, 'public');
  if (fs.existsSync(publicSrc)) {
    copyDir(publicSrc, publicDest);
    // Remove dev UI index.html - not needed in production
    const indexHtml = path.join(publicDest, 'index.html');
    if (fs.existsSync(indexHtml)) {
      fs.unlinkSync(indexHtml);
      console.log('Removed dev UI:', indexHtml);
    }
    console.log('UI files copied to:', publicDest);
  } else {
    console.log('Public directory not found:', publicSrc);
  }
}

const destDir = path.join(__dirname, '../dist/local-llm-gateway');
copyDist(destDir);
