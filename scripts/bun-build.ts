import JavaScriptObfuscator from 'javascript-obfuscator';

// Step 1: Bundle with Bun into a single JS file
const bundle = await Bun.build({
  entrypoints: ['./src/start-server.ts'],
  outdir: './build',
  target: 'bun',
  minify: true,
  naming: '[dir]/llm-gateway.bundle.[ext]',
});

if (!bundle.success) {
  console.error('Bundle failed');
  for (const log of bundle.logs) console.error(log);
  process.exit(1);
}

const bundlePath = bundle.outputs[0].path;
console.log(`Bundle: ${bundlePath}`);

// Step 2: Read bundled code and obfuscate
const code = await Bun.file(bundlePath).text();

const obfuscated = JavaScriptObfuscator.obfuscate(code, {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  stringArray: false,
  splitStrings: false,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  // Preserve strings used for CLI arg parsing and URL construction
  reservedStrings: [
    '--port=',
    '--headless',
    '--ppid=',
    'http://',
    'https://',
    '/v1/',
    '/admin/',
    '/public/',
  ],
});

await Bun.write('./build/llm-gateway.js', obfuscated.getObfuscatedCode());
console.log('Obfuscation done -> build/llm-gateway.js');
