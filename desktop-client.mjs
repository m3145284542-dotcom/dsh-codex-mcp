import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { atomicJson } from './desktop-plugin/index.mjs';
import { ensureDesktop } from './desktop-runtime.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function runDesktop({ prompt, cwd, sessionId, timeoutMs }) {
  const root = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'codex-desktop-bridge');
  let status;
  try { status = await ensureDesktop(); }
  catch (error) { return { ok: false, text: '', sessionId, error: error.message }; }
  if (status.busy) return { ok: false, text: '', sessionId, error: 'The desktop bridge is busy. Wait for its current task to finish.' };
  const requestId = randomUUID();
  const deadline = Date.now() + timeoutMs;
  await mkdir(join(root, 'inbox'), { recursive: true });
  await atomicJson(join(root, 'inbox', requestId + '.json'), { requestId, prompt, cwd, sessionId, deadline });
  let knownSession = sessionId;
  while (Date.now() < deadline + 4000) {
    try { return JSON.parse(await readFile(join(root, 'outbox', requestId + '.json'), 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { knownSession = JSON.parse(await readFile(join(root, 'outbox', requestId + '.progress.json'), 'utf8')).sessionId; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    await sleep(200);
  }
  return { ok: false, text: '', sessionId: knownSession, error: 'Desktop bridge response timed out. The task may have been admitted; inspect the conversation before retrying.', mode: 'desktop' };
}
