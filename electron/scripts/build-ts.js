const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

function getTsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
    .map(file => path.join(dir, file));
}

const electronDir = path.resolve(__dirname, '..');
const rootDir = path.resolve(electronDir, '..');
const backendDir = path.resolve(rootDir, 'backend');

const electronFiles = [
  path.join(electronDir, 'gui.ts'),
  path.join(electronDir, 'preload.ts'),
  path.join(electronDir, 'sharedState.ts')
].filter(f => fs.existsSync(f));

const backendFiles = [
  ...getTsFiles(backendDir),
  ...getTsFiles(path.join(backendDir, 'routes')),
  ...getTsFiles(path.join(backendDir, 'utils'))
];

console.log(`[build:ts] Compiling ${electronFiles.length} electron files...`);
if (electronFiles.length > 0) {
  esbuild.buildSync({
    entryPoints: electronFiles,
    platform: 'node',
    outdir: electronDir
  });
}

console.log(`[build:ts] Compiling ${backendFiles.length} backend files...`);
if (backendFiles.length > 0) {
  esbuild.buildSync({
    entryPoints: backendFiles,
    platform: 'node',
    outbase: backendDir,
    outdir: backendDir
  });
}

console.log('[build:ts] Compilation finished successfully.');
