import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = new URL('../', import.meta.url);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const packageJson = JSON.parse(
  await readFile(new URL('package.json', repositoryRoot), 'utf8'),
);
const bundleUrl = new URL('dist/vsix-scout.js', repositoryRoot);
const bundle = await readFile(bundleUrl, 'utf8');
const bundleStat = await stat(bundleUrl);

function invariant(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.error?.message ?? result.stderr ?? result.stdout}`,
    );
  }
  return result.stdout;
}

invariant(packageJson.name === 'vsix-scout', 'Unexpected package name.');
invariant(packageJson.version === '0.1.0', 'Expected version 0.1.0.');
invariant(packageJson.private !== true, 'Release package cannot be private.');
invariant(packageJson.license === 'MIT', 'Release package must use MIT.');
invariant(
  packageJson.bin?.['vsix-scout'] === './dist/vsix-scout.js',
  'CLI bin entry does not point to the release bundle.',
);
invariant(bundle.startsWith('#!/usr/bin/env node\n'), 'Bundle has no shebang.');
invariant(
  bundleStat.size > 0 && bundleStat.size < 2_000_000,
  'Bundle size is unexpected.',
);
invariant(
  run(process.execPath, [fileURLToPath(bundleUrl), '--version']).trim() ===
    '0.1.0',
  'Bundled CLI reports the wrong version.',
);
invariant(
  run(process.execPath, [fileURLToPath(bundleUrl), '--help']).includes(
    'VSIX Scout',
  ),
  'Bundled CLI help smoke test failed.',
);

const npmCache = await mkdtemp(join(tmpdir(), 'vsix-scout-npm-cache-'));
let packOutput;
try {
  packOutput = run(npmCommand, [
    'pack',
    '--dry-run',
    '--json',
    '--ignore-scripts',
    '--cache',
    npmCache,
  ]);
} finally {
  await rm(npmCache, { recursive: true, force: true });
}
const packResult = JSON.parse(packOutput)[0];
const files = packResult.files.map((file) => file.path);
const requiredFiles = [
  'LICENSE',
  'README.md',
  'THIRD_PARTY_NOTICES.md',
  'dist/vsix-scout.js',
  'package.json',
  'schemas/v1/cli-output.schema.json',
];

for (const requiredFile of requiredFiles) {
  invariant(
    files.includes(requiredFile),
    `Package is missing ${requiredFile}.`,
  );
}

const forbidden = files.filter((file) =>
  /(^|\/)(src|test|tests|fixtures|node_modules)(\/|$)|pnpm-lock\.yaml$|\.map$/.test(
    file,
  ),
);
invariant(
  forbidden.length === 0,
  `Package contains forbidden files: ${forbidden.join(', ')}`,
);

console.log(
  `Verified ${packResult.filename}: ${files.length} files, ${packResult.size} bytes packed.`,
);
