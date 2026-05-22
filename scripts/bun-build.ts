import { obfuscatedBuild } from 'bun-plugin-javascript-obfuscator';

const result = await obfuscatedBuild({
  entrypoints: ['./src/start-server.ts'],
  outdir: './build',
  target: 'bun',
  minify: true,
  bundleNodeModules: true,
  obfuscator: {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.75,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.4,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: true,
    splitStrings: true,
    splitStringsChunkLength: 10,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
  },
  naming: {
    entry: 'llm-gateway.js',
  },
});

if (!result.success) {
  console.error('Build failed');
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log('Build succeeded');

if (result.outputs.length > 0) {
  for (const output of result.outputs) {
    console.log(`- ${output.path}`);
  }
}
