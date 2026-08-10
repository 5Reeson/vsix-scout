import { spawn } from 'node:child_process';

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(
  pnpmCommand,
  ['exec', 'vitest', 'run', 'packages/marketplace/test/provider.live.test.ts'],
  {
    stdio: 'inherit',
    env: { ...process.env, VSIX_SCOUT_LIVE_MARKETPLACE: '1' },
  },
);

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal !== null) {
    console.error(`Live Marketplace test stopped by signal ${signal}.`);
    process.exitCode = 1;
    return;
  }

  process.exitCode = code ?? 1;
});
