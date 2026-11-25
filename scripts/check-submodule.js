#!/usr/bin/env node
/**
 * Guard for the web build: Vite writes the admin bundle into the gateway
 * submodule's build directory, so the gateway source must be checked out first.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const gatewayPackage = resolve(process.cwd(), 'src-gateway/package.json');
if (!existsSync(gatewayPackage)) {
  console.error(
    '\n[build:web] src-gateway is empty.\n' +
      'Run: git submodule update --init --recursive\n'
  );
  process.exit(1);
}
