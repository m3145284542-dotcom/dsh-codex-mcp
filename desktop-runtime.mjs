import { readFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let opening;
const runFile = promisify(execFile);

export function bridgeRoot() {
  return join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'codex-desktop-bridge');
}

export async function desktopStatus() {
  try {
    const value = JSON.parse(await readFile(join(bridgeRoot(), 'status.json'), 'utf8'));
    const now = Date.now();
    return {
      ready: now - value.updatedAt < 6000 && now - value.clientSeenAt < 6000,
      hostOnline: now - value.updatedAt < 6000,
      busy: Boolean(value.activeRequestId),
      sessionId: value.sessionId || null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { ready: false, hostOnline: false, busy: false, sessionId: null };
    throw new Error(`Cannot read desktop bridge status: ${error.message}`);
  }
}

export async function findDesktopApp() {
  const configured = process.env.DSH_DESKTOP_APP;
  const candidates = configured ? [configured] : process.platform === 'win32' ? [
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs', 'DeepSeek Harness', 'DeepSeek Harness.exe'),
    process.env.ProgramFiles && join(process.env.ProgramFiles, 'DeepSeek Harness', 'DeepSeek Harness.exe'),
  ] : [];
  if (!configured && process.platform === 'win32') {
    try {
      const script = '[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); $ErrorActionPreference = "SilentlyContinue"; $found = @(Get-Process -Name "DeepSeek Harness" | ForEach-Object { $_.Path } | Where-Object { $_ } | Select-Object -Unique); ConvertTo-Json -InputObject $found -Compress';
      const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 5000, encoding: 'utf8' });
      const found = JSON.parse(stdout.replace(/^\uFEFF/, '').trim() || '[]');
      if (Array.isArray(found)) candidates.push(...found.filter(path => typeof path === 'string'));
    } catch { /* manual --app remains available for unusual installations */ }
  }
  for (const candidate of candidates.filter(Boolean)) {
    if (!isAbsolute(candidate)) continue;
    try { await access(candidate); return candidate; } catch { /* next candidate */ }
  }
  throw new Error('DeepSeek Harness executable not found. Re-run the installer with --app <absolute executable path>, or set DSH_DESKTOP_APP.');
}

async function launchDesktop(app) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  await new Promise((resolve, reject) => {
    const child = spawn(app, [], { detached: true, stdio: 'ignore', windowsHide: false, env });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function ensureDesktop({ timeoutMs = 45000, autoStart = process.env.DSH_AUTO_START !== '0' } = {}) {
  let status = await desktopStatus();
  if (status.ready) return status;
  if (!autoStart) throw new Error('Harness desktop is offline and auto-start is disabled. Open its main window and retry.');
  if (opening) return opening;
  opening = (async () => {
    await launchDesktop(await findDesktopApp());
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      status = await desktopStatus();
      if (status.ready) return status;
      await sleep(250);
    }
    throw new Error('Harness opened but its desktop bridge did not become ready. Complete any login/startup dialog manually and check that the bridge plugin is enabled. No task was sent.');
  })();
  try { return await opening; } finally { opening = undefined; }
}
