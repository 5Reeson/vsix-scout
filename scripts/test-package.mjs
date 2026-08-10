import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repositoryRoot = new URL('../', import.meta.url);
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'vsix-scout-package-'));
const npmCache = join(temporaryDirectory, 'npm-cache');

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed:\n${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

try {
  const packOutput = run('npm', [
    'pack',
    '--json',
    '--ignore-scripts',
    '--pack-destination',
    temporaryDirectory,
    '--cache',
    npmCache,
  ]);
  const [{ filename }] = JSON.parse(packOutput);
  const tarball = join(temporaryDirectory, filename);
  const installRoot = join(temporaryDirectory, 'install');

  run('npm', [
    'install',
    '--prefix',
    installRoot,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--cache',
    npmCache,
    tarball,
  ]);

  const installedPackage = JSON.parse(
    await readFile(
      join(installRoot, 'node_modules', 'vsix-scout', 'package.json'),
      'utf8',
    ),
  );
  if (installedPackage.dependencies !== undefined) {
    throw new Error(
      'Packed CLI unexpectedly has runtime package dependencies.',
    );
  }

  const installedCli = join(
    installRoot,
    'node_modules',
    'vsix-scout',
    'dist',
    'vsix-scout.js',
  );
  const version = run(process.execPath, [installedCli, '--version']).trim();
  if (version !== '0.1.0') {
    throw new Error(`Clean install reported unexpected version ${version}.`);
  }
  run(process.execPath, [installedCli, '--help']);
  console.log(`Clean tarball install passed for vsix-scout@${version}.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
