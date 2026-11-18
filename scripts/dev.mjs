import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venvPython = path.join(root, '.venv', 'bin', 'python');
const venvPip = path.join(root, '.venv', 'bin', 'pip');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function ensurePython() {
  try {
    if (!existsSync(venvPython)) {
      await run('python3', ['-m', 'venv', path.join(root, '.venv')]);
    }
    await run(venvPip, ['install', '-q', '-r', 'server/requirements.txt']);
    return venvPython;
  } catch (err) {
    console.warn(`[riff] project venv unavailable (${err.message}). Using python3 with --user packages.`);
    await run('python3', ['-m', 'pip', 'install', '--user', '-q', '-r', 'server/requirements.txt']);
    return 'python3';
  }
}

const phone = process.argv.includes('--phone') || process.env.PRACTICE_PHONE === '1';

/** Wi-Fi / Ethernet addresses a phone on the same network can reach. */
function lanUrls(port) {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => `http://${net.address}:${port}`);
}

const python = await ensurePython();
const phoneUrls = phone ? lanUrls(5173) : [];
const env = {
  ...process.env,
  PRACTICE_PHONE: phone ? '1' : '',
  PRACTICE_PHONE_URLS: phoneUrls.join(' '),
  PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
};
const helper = spawn(python, ['-m', 'server.riff_server'], { cwd: root, stdio: 'inherit', env });
const vite = spawn('npx', ['vite', '--port', '5173', '--strictPort'], { cwd: root, stdio: 'inherit', env });
if (phone) {
  console.log('\n[phone] On your phone (same Wi-Fi), open:');
  for (const url of phoneUrls) console.log(`[phone]   ${url}`);
  if (!phoneUrls.length) console.log('[phone]   (no network address found: is Wi-Fi on?)');
  console.log('[phone] Anyone on this network can open it while it runs.\n');
}

function shutdown() {
  helper.kill('SIGTERM');
  vite.kill('SIGTERM');
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
helper.on('exit', (code) => {
  if (code && code !== 0) console.error(`[riff] helper exited ${code}`);
});
vite.on('exit', (code) => {
  if (code && code !== 0) {
    helper.kill('SIGTERM');
    process.exit(code);
  }
});
