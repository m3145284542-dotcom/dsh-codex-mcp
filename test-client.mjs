#!/usr/bin/env node
/**
 * Smoke test for the bridge: speaks MCP stdio to ./server.mjs exactly like
 * Codex does, then prints the tool list and one dsh_task result.
 *
 *   node test-client.mjs "optional prompt"
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const prompt = process.argv[2] ?? 'Reply with exactly: BRIDGE OK';

const child = spawn(process.execPath, [join(here, 'server.mjs')], {
	stdio: ['pipe', 'pipe', 'inherit'],
	windowsHide: true,
});

const pending = new Map();
let nextId = 1;

createInterface({ input: child.stdout }).on('line', (line) => {
	const trimmed = line.trim();
	if (trimmed === '') return;
	const message = JSON.parse(trimmed);
	if (message.id !== undefined && pending.has(message.id)) {
		const { resolve, reject } = pending.get(message.id);
		pending.delete(message.id);
		if (message.error) reject(new Error(JSON.stringify(message.error)));
		else resolve(message.result);
	}
});

function request(method, params) {
	const id = nextId++;
	return new Promise((resolve, reject) => {
		pending.set(id, { resolve, reject });
		child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
	});
}

function notify(method, params) {
	child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
}

const started = Date.now();

const init = await request('initialize', {
	protocolVersion: '2025-06-18',
	capabilities: {},
	clientInfo: { name: 'bridge-smoke-test', version: '0.1.0' },
});
console.log(`initialize ok · protocol ${init.protocolVersion} · ${init.serverInfo.name}@${init.serverInfo.version}`);
notify('notifications/initialized');

const list = await request('tools/list', {});
console.log(`tools: ${list.tools.map((tool) => tool.name).join(', ')}`);

const result = await request('tools/call', {
	name: 'dsh_task',
	arguments: { prompt, cwd: here, timeout_sec: 300 },
});

const text = result.content?.[0]?.text ?? '';
console.log(`\n--- dsh_task (${((Date.now() - started) / 1000).toFixed(1)}s, isError=${result.isError === true}) ---`);
console.log(text);
console.log(`\nsession_id: ${result.structuredContent?.session_id ?? '(none)'}`);

const sessionId = result.structuredContent?.session_id;
let followUpFailed = false;
if (sessionId && process.argv[3]) {
	const followUp = await request('tools/call', {
		name: 'dsh_resume',
		arguments: { session_id: sessionId, prompt: process.argv[3], cwd: here, timeout_sec: 300 },
	});
	console.log(`\n--- dsh_resume (isError=${followUp.isError === true}) ---`);
	console.log(followUp.content?.[0]?.text ?? '');
	followUpFailed = followUp.isError === true;
}

child.kill();
process.exit(result.isError === true || followUpFailed ? 1 : 0);
