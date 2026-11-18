// One-time install for splitting riffs into guitar / drums / bass (Demucs).
// Usage: npm run setup:stems   (or ./launch --stems)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const venvPython = path.join(root, '.venv', 'bin', 'python');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

let python = venvPython;
try {
  if (!existsSync(venvPython)) await run('python3', ['-m', 'venv', path.join(root, '.venv')]);
} catch {
  python = 'python3';
}
const pipArgs = python === 'python3' ? ['--user'] : [];
console.log('Installing PyTorch + Demucs (about 1–2 GB, one time)…');
await run(python, ['-m', 'pip', 'install', ...pipArgs, '-r', 'server/requirements.txt', '-r', 'server/requirements-stems.txt']);
// Demucs without its dependency list: see server/requirements-stems.txt.
await run(python, ['-m', 'pip', 'install', ...pipArgs, '--no-deps', 'demucs>=4.0.1']);
console.log('Downloading the splitting model (~50 MB, one time)…');
await run(python, ['-c', 'from server.stems import _model; _model(); print("Splitting is ready.")']);
