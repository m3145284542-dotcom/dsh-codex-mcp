import { mkdir, readdir, readFile, writeFile, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { randomUUID } from 'node:crypto';

export const inject = ['sessionController', 'workspaceRegistry', 'agents', 'connection', 'workingDirectory'];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const uuid = /^[0-9a-f-]{36}$/i;
export async function atomicJson(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
}

export async function apply(ctx) {
  const root = join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'codex-desktop-bridge');
  const inbox = join(root, 'inbox');
  const outbox = join(root, 'outbox');
  await mkdir(inbox, { recursive: true });
  await mkdir(outbox, { recursive: true });
  let stopped = false;
  let scanning = false;
  let active = null;
  let navigation = {};
  let clientSeenAt = 0;
  const workspaceFile = join(root, 'workspace.json');
  let workspaceId;
  try { workspaceId = JSON.parse(await readFile(workspaceFile, 'utf8')).workspaceId; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }

  async function sharedWorkspace(cwd) {
    let workspace = workspaceId ? ctx.workspaceRegistry.get(workspaceId) : undefined;
    if (!workspace) {
      workspace = ctx.workspaceRegistry.list().find(item => item.title === 'Codex 工作区');
      if (!workspace) workspace = await ctx.workspaceRegistry.create(cwd || process.cwd(), 'Codex 工作区');
      await atomicJson(workspaceFile, { workspaceId: workspace.id });
      workspaceId = workspace.id;
    }
    return workspace;
  }

  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/codex-desktop-bridge/navigation',
    methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      clientSeenAt = Date.now();
      if (request.method === 'GET') {
        const requestAtStart = navigation.requestId;
        const until = Date.now() + 1500;
        while (!stopped && Date.now() < until && navigation.requestId === requestAtStart) await sleep(100);
        clientSeenAt = Date.now();
      }
      if (request.method === 'POST') {
        const value = await request.json();
        if (active && value.requestId === active.requestId) active.visible = true;
      }
      return Response.json(navigation, { headers: { 'Cache-Control': 'no-store' } });
    },
  }));

  async function heartbeat() {
    if (!stopped) await atomicJson(join(root, 'status.json'), {
      version: 1, pid: process.pid, updatedAt: Date.now(), clientSeenAt,
      activeRequestId: active?.requestId || null, sessionId: active?.sessionId || null,
    });
  }

  async function execute(request) {
    const { requestId, prompt, sessionId, cwd, deadline } = request;
    if (!uuid.test(requestId) || typeof prompt !== 'string' || !prompt.trim()) throw new Error('Invalid desktop bridge request');
    if (!Number.isFinite(deadline) || Date.now() >= deadline) throw new Error('Request expired before desktop admission');
    if (Date.now() - clientSeenAt > 5000) throw new Error('Harness desktop UI is not connected. Open the desktop window and retry.');
    if (cwd && !isAbsolute(cwd)) throw new Error('cwd must be an absolute directory');
    active = { requestId, sessionId, visible: false, turn: null, reason: null, answer: '', usage: null, admitted: false };
    await heartbeat();
    let releaseEvents;
    try {
      if (!active.sessionId) {
        const workspace = await sharedWorkspace(cwd);
        const created = await ctx.sessionController.create({ workspaceId: workspace.id });
        active.sessionId = created.sessionId;
      }
      const targetId = active.sessionId;
      const resolved = await ctx.sessionController.resolveAgent(targetId);
      if (resolved.error) throw resolved.error;
      if (resolved.agent.status !== 'idle') throw new Error('Target session is busy. Wait for its current task to finish.');
      if (cwd && !sessionId) {
        await ctx.workingDirectory.set(resolved.agent, cwd, AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      } else if (cwd && ctx.workingDirectory.get(resolved.agent.session).toLowerCase() !== cwd.toLowerCase()) {
        throw new Error('Session cwd differs; resume it with its current working directory.');
      }
      navigation = { requestId, sessionId: targetId };
      await atomicJson(join(outbox, `${requestId}.progress.json`), { sessionId: targetId, state: 'opening' });
      const visibleDeadline = Math.min(deadline, Date.now() + 15000);
      while (!active.visible && Date.now() < visibleDeadline && !stopped) await sleep(100);
      if (!active.visible || stopped) throw new Error('Desktop did not acknowledge opening the conversation. No prompt was sent.');
      releaseEvents = ctx.on('session/event', (session, event) => {
        if (session.id !== targetId || !active || active.requestId !== requestId) return;
        if (event.type === 'turn/start' && active.turn === null) active.turn = event.data.turn;
        if (event.type === 'assistant/message' && event.data.turn === active.turn) {
          const parts = event.data.message.content || [];
          const text = typeof parts === 'string' ? parts : parts.filter(p => p.type === 'text').map(p => p.text).join('');
          if (text) active.answer = text;
          active.usage = event.data.usage || active.usage;
        }
        if (event.type === 'turn/end' && event.data.turn === active.turn) active.reason = event.data.reason;
      });
      await ctx.sessionController.prompt({
        requestId, sessionId: targetId, mode: 'queue',
        content: [{ type: 'text', text: prompt }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, AbortSignal.timeout(Math.max(1, deadline - Date.now())));
      active.admitted = true;
      await atomicJson(join(outbox, `${requestId}.progress.json`), { sessionId: targetId, state: 'running' });
      while (!active.reason && Date.now() < deadline && !stopped) await sleep(100);
      if (!active.reason || stopped) {
        ctx.sessionController.cancel({ sessionId: targetId });
        throw new Error('Desktop task timed out or bridge stopped; cancellation requested. Check the desktop conversation.');
      }
      if (active.reason.kind !== 'completed') throw new Error(`Desktop turn ended: ${JSON.stringify(active.reason)}`);
      return { ok: true, text: active.answer || '(Task completed without a text answer; see the desktop conversation.)', sessionId: targetId, usage: active.usage, mode: 'desktop' };
    } catch (error) {
      return { ok: false, text: active?.answer || '', sessionId: active?.sessionId || sessionId || null, error: error.message || String(error), mode: 'desktop' };
    } finally {
      releaseEvents?.();
      navigation = {};
      active = null;
      await heartbeat();
    }
  }

  async function scan() {
    if (stopped || scanning) return;
    scanning = true;
    try {
      for (const name of await readdir(inbox)) {
        if (!/^[0-9a-f-]{36}\.json$/i.test(name)) continue;
        const path = join(inbox, name);
        const claimed = path + '.processing';
        try { await rename(path, claimed); } catch { continue; }
        let result;
        try {
          const request = JSON.parse(await readFile(claimed, 'utf8'));
          if (request.requestId !== name.slice(0, -5)) throw new Error('Request id mismatch');
          result = await execute(request);
        } catch (error) { result = { ok: false, error: error.message, text: '', sessionId: null, mode: 'desktop' }; }
        await atomicJson(join(outbox, name), result);
        await rename(claimed, claimed + '.done');
      }
    } catch (error) { ctx.logger.warn(`Codex desktop bridge: ${error.message}`); }
    finally { scanning = false; }
  }
  const timer = setInterval(scan, 200);
  const healthTimer = setInterval(() => heartbeat().catch(error => ctx.logger.warn(error)), 1500);
  await heartbeat();
  ctx.effect(() => () => { stopped = true; clearInterval(timer); clearInterval(healthTimer); });
}


