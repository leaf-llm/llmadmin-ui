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
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.5,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  splitStrings: true,
  splitStringsChunkLength: 10,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
});

await Bun.write('./build/llm-gateway.js', obfuscated.getObfuscatedCode());
console.log('Obfuscation done -> build/llm-gateway.js');
