#!/usr/bin/env node
/**
 * ffmpeg / ffprobe availability check.
 *
 * Resolves the binaries the same way the API's `VideoProcessor` does
 * and prints a one-line verdict plus the install command for the
 * current platform. Exits with a non-zero status when neither
 * binary can be found so it slots into a CI gate.
 *
 * Run with `pnpm --filter @epireels/api ffmpeg:check`.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const execFileAsync = promisify(execFile);

const isWindows = process.platform === 'win32';
const exeSuffix = isWindows ? '.exe' : '';

const HINT = {
  win32: 'winget install Gyan.FFmpeg   # or   choco install ffmpeg',
  darwin: 'brew install ffmpeg',
  linux: 'sudo apt-get install ffmpeg   # (or your distro equivalent)',
};

const extraSearchDirs = isWindows
  ? [
      path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WindowsApps'),
      path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'ffmpeg'),
      'C:\\Program Files\\ffmpeg\\bin',
      'C:\\Program Files (x86)\\ffmpeg\\bin',
      'C:\\ProgramData\\chocolatey\\bin',
      path.join(process.env.USERPROFILE ?? '', 'scoop', 'shims'),
    ]
  : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];

async function probe(candidate) {
  try {
    const { stdout } = await execFileAsync(candidate, ['-version'], {
      timeout: 5000,
      windowsHide: true,
    });
    return stdout.split('\n')[0].trim();
  } catch {
    return null;
  }
}

async function resolve(envVar, name) {
  // 1. Explicit override wins (even if it's `ffmpeg` on PATH).
  if (process.env[envVar]) {
    const version = await probe(process.env[envVar]);
    if (version) return { binary: process.env[envVar], version };
  }

  // 2. Bare command on PATH (works on macOS / Linux / MSYS / Git Bash).
  const onPath = await probe(name);
  if (onPath) return { binary: name, version: onPath };

  // 3. `<name>.exe` on Windows when the bare command didn't resolve.
  if (isWindows) {
    const exe = await probe(`${name}${exeSuffix}`);
    if (exe) return { binary: `${name}${exeSuffix}`, version: exe };
  }

  // 4. Common install locations (esp. winget / chocolatey on Windows).
  for (const dir of extraSearchDirs) {
    if (!dir) continue;
    const candidate = path.join(dir, `${name}${exeSuffix}`);
    if (!existsSync(candidate)) continue;
    const version = await probe(candidate);
    if (version) return { binary: candidate, version };
  }

  return null;
}

const ffmpeg = await resolve('FFMPEG_PATH', 'ffmpeg');
const ffprobe = await resolve('FFPROBE_PATH', 'ffprobe');

if (ffmpeg) {
  console.log(`✓ ffmpeg  : ${ffmpeg.binary}`);
  console.log(`           ${ffmpeg.version}`);
} else {
  console.log('✗ ffmpeg  : not found');
  console.log(`           install with: ${HINT[process.platform]}`);
}

if (ffprobe) {
  console.log(`✓ ffprobe : ${ffprobe.binary}`);
  console.log(`           ${ffprobe.version}`);
} else {
  console.log('✗ ffprobe : not found');
  console.log(`           install with: ${HINT[process.platform]}`);
}

if (!ffmpeg || !ffprobe) {
  console.log('');
  console.log(
    '  VideoProcessor will throw `spawn ffmpeg ENOENT` until both binaries are reachable.',
  );
  process.exitCode = 1;
}
