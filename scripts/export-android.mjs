import fs from 'node:fs/promises';

const apiDir = new URL('../app/api', import.meta.url);
const disabledDir = new URL('../.android-api-disabled', import.meta.url);

let moved = false;
try {
  await fs.rm(new URL('../out', import.meta.url), { recursive: true, force: true });
  await fs.rename(apiDir, disabledDir);
  moved = true;
  process.env.NEXT_EXPORT = '1';
  const { spawn } = await import('node:child_process');
  await new Promise((resolve, reject) => {
    const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'build'], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`next build terminó con código ${code}`)));
  });
} finally {
  if (moved) await fs.rename(disabledDir, apiDir);
}
