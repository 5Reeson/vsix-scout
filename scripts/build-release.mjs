import { chmod, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const outputDirectory = new URL('../dist/', import.meta.url);
const outputFile = new URL('vsix-scout.js', outputDirectory);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: [
    fileURLToPath(new URL('../apps/cli/src/bin.ts', import.meta.url)),
  ],
  outfile: fileURLToPath(outputFile),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  packages: 'bundle',
  sourcemap: false,
  legalComments: 'external',
});

await chmod(outputFile, 0o755);
