#!/usr/bin/env node
/**
 * dsh-codex-mcp — a Model Context Protocol server that lets an MCP client
 * (Codex, Claude Code, ...) drive DeepSeek Harness (dsh).
 *
 * Desktop mode submits tasks to the local Harness desktop plugin, opening
 * the installed app when needed. DSH_MODE=headless retains the optional CLI:
 *
 *     dsh --profile headless --json "<task>"        (or `-` for stdin)
 *
 * and turns the newline-delimited run events into an MCP tool result. Because
 * it reuses the `headless` profile's persisted Session support
 * (`--session-id`), a caller can hold a real multi-turn conversation with dsh.
 *
 * No dependencies: the MCP stdio transport is newline-delimited JSON-RPC 2.0.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { runDesktop } from './desktop-client.mjs';
import { ensureDesktop, desktopStatus } from './desktop-runtime.mjs';

const SERVER_NAME = 'dsh';
const SERVER_VERSION = '0.3.0';
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const DEFAULT_TIMEOUT_SEC = 600;
const MAX_TIMEOUT_SEC = 3600;

// ── locating the dsh CLI ────────────────────────────────────────────────────

function resolveDshEntry() {
	if (process.env.DSH_CLI_ENTRY) return process.env.DSH_CLI_ENTRY;
	const candidates = [];
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
		candidates.push(
			join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
		);
	} else {
		candidates.push(
			join('/usr', 'local', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
			join('/usr', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
		);
	}
	candidates.push(
		join(homedir(), '.npm-global', 'lib', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
	);
	return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const DSH_ENTRY = resolveDshEntry();
const NODE_BIN = process.env.DSH_NODE || process.execPath;

// ── running one dsh task ────────────────────────────────────────────────────

/**
 * Run one headless dsh task and collect its run events.
 * @param {{prompt: string, cwd?: string, sessionId?: string, timeoutMs: number}} options
 */
function runDsh({ prompt, cwd, sessionId, timeoutMs }) {
	return new Promise((resolve) => {
		if (DSH_ENTRY === null) {
			resolve({
				ok: false,
				text: '',
				sessionId: sessionId ?? null,
				usage: null,
				stderr: '',
				error:
					'dsh CLI not found. Install it with `npm i -g @deepseek-ai/dsh@next` ' +
					'or point DSH_CLI_ENTRY at .../@deepseek-ai/dsh/lib/bin.js.',
			});
			return;
		}

		const args = ['--profile', 'headless', '--json'];
		if (sessionId) args.push('--session-id', sessionId);
		args.push('-');

		const child = spawn(NODE_BIN, [DSH_ENTRY, ...args], {
			cwd: cwd && existsSync(cwd) ? cwd : process.cwd(),
			env: {
				...process.env,
				// An MCP host may launch us with a scrubbed environment; make sure the
				// child dsh still finds the profile, credentials, and session store.
				DSH_HOME: process.env.DSH_HOME ?? join(homedir(), '.dsh'),
			},
			windowsHide: true,
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		let finalText = '';
		let streamed = '';
		let seenSession = sessionId ?? null;
		let usage = null;
		let stderr = '';
		let timedOut = false;

		const timer = setTimeout(() => {
			timedOut = true;
			child.kill('SIGKILL');
		}, timeoutMs);

		let stdout = '';
		child.stdout.setEncoding('utf8');
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
			if (stdout.length > 4_000_000) stdout = stdout.slice(-4_000_000);
		});

		child.stderr.setEncoding('utf8');
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
			if (stderr.length > 200_000) stderr = stderr.slice(-200_000);
		});
		child.stdin.on('error', () => {});
		child.stdin.end(`${prompt}\n`);

		child.on('error', (error) => {
			clearTimeout(timer);
			resolve({
				ok: false,
				text: finalText || streamed,
				sessionId: seenSession,
				usage,
				stderr,
				error: `failed to start dsh: ${error.message}`,
			});
		});

		child.on('close', (code) => {
			clearTimeout(timer);
			for (const line of stdout.split(/\r?\n/)) {
				const trimmed = line.trim();
				if (trimmed === '' || !trimmed.startsWith('{')) continue;
				let event;
				try {
					event = JSON.parse(trimmed);
				} catch {
					continue;
				}
				if (event.type === 'session' && typeof event.sessionId === 'string') seenSession = event.sessionId;
				else if (event.type === 'text' && typeof event.text === 'string') streamed += event.text;
				else if (event.type === 'final' && typeof event.text === 'string') finalText = event.text;
				else if (event.type === 'status' && event.usage && typeof event.usage === 'object') usage = event.usage;
			}
			if (timedOut) {
				resolve({
					ok: false,
					text: finalText || streamed,
					sessionId: seenSession,
					usage,
					stderr,
					error: `dsh timed out after ${Math.round(timeoutMs / 1000)}s (partial output returned).`,
				});
				return;
			}
			const text = finalText || streamed;
			if (code !== 0 || text === '') {
				const noise = stderr
					.split(/\r?\n/)
					.filter((line) => line.trim() !== '' && !line.startsWith('['))
					.slice(-20)
					.join('\n');
				resolve({
					ok: false,
					text,
					sessionId: seenSession,
					usage,
					stderr,
					error: noise || `dsh exited with code ${code} and produced no answer.`,
				});
				return;
			}
			resolve({ ok: true, text, sessionId: seenSession, usage, stderr });
		});
	});
}

// ── tool definitions ────────────────────────────────────────────────────────

const tools = [
	{
		name: 'dsh_open',
		title: 'Open DeepSeek Harness desktop',
		description: 'Open the installed Harness desktop app and wait for its bridge. Does not send a model prompt or create a conversation.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'dsh_status',
		title: 'Read Harness desktop status',
		description: 'Check desktop bridge readiness and whether a task is running, without opening the app.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
	},
	{
		name: 'dsh_task',
		title: 'Run a task on DeepSeek Harness',
		description:
			'Run a self-contained task in DeepSeek Harness on this machine. Desktop mode opens a visible conversation in the Harness app. ' +
			'dsh has its own tools (files, PowerShell, web search, office documents, subagents, workflows) ' +
			'and its own workspace, so use it for long or tool-heavy work you want off your own context. ' +
			'The bridge automatically opens the installed Harness desktop app when needed. Each call creates a new session unless session_id is given. Returns dsh\'s final answer ' +
			'plus a session id you can pass to dsh_resume for a follow-up turn.',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: {
					type: 'string',
					description: 'The task, question, or instruction for the dsh agent. Be specific and self-contained.',
				},
				cwd: {
					type: 'string',
					description:
						'Absolute path to the working directory the dsh agent starts in. Defaults to the directory this server was launched from.',
				},
				session_id: {
					type: 'string',
					description: 'Continue an existing dsh session instead of starting a new one.',
				},
				timeout_sec: {
					type: 'number',
					description: `Hard timeout in seconds (default ${DEFAULT_TIMEOUT_SEC}, max ${MAX_TIMEOUT_SEC}).`,
				},
			},
			required: ['prompt'],
			additionalProperties: false,
		},
	},
	{
		name: 'dsh_resume',
		title: 'Continue a DeepSeek Harness session',
		description:
			'Send another turn to an existing dsh session created by dsh_task. Keeps its history, files, and its own agent context.',
		inputSchema: {
			type: 'object',
			properties: {
				session_id: { type: 'string', description: 'The session id returned by an earlier dsh_task call.' },
				prompt: { type: 'string', description: 'The next instruction for that session.' },
				cwd: { type: 'string', description: 'Working directory to run in. Defaults to this server\'s launch directory.' },
				timeout_sec: { type: 'number', description: `Hard timeout in seconds (default ${DEFAULT_TIMEOUT_SEC}).` },
			},
			required: ['session_id', 'prompt'],
			additionalProperties: false,
		},
	},
];

function clampTimeout(value) {
	const seconds = typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_TIMEOUT_SEC;
	return Math.min(Math.max(seconds, 5), MAX_TIMEOUT_SEC) * 1000;
}

// ── MCP plumbing ────────────────────────────────────────────────────────────

function send(message) {
	process.stdout.write(`${JSON.stringify(message)}\n`);
}

function reply(id, result) {
	send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
	send({ jsonrpc: '2.0', id, error: { code, message } });
}

function textResult(text, structured, isError = false) {
	const result = { content: [{ type: 'text', text }] };
	if (structured) result.structuredContent = structured;
	if (isError) result.isError = true;
	return result;
}

async function callTool(name, args) {
	if (name === 'dsh_open' || name === 'dsh_status') {
		try {
			const status = name === 'dsh_open' ? await ensureDesktop() : await desktopStatus();
			return textResult(JSON.stringify(status), { ...status, mode: 'desktop' });
		} catch (error) { return textResult(error.message, { ok: false }, true); }
	}
	const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : '';
	const sessionId =
		name === 'dsh_resume'
			? typeof args.session_id === 'string'
				? args.session_id
				: ''
			: typeof args.session_id === 'string' && args.session_id !== ''
				? args.session_id
				: undefined;

	if (prompt === '') return textResult('`prompt` must be a non-empty string.', null, true);
	if (name === 'dsh_resume' && !sessionId) return textResult('`session_id` is required.', null, true);

	const runner = process.env.DSH_MODE === 'headless' ? runDsh : runDesktop;
	const run = await runner({
		prompt,
		cwd: typeof args.cwd === 'string' && args.cwd !== '' ? args.cwd : undefined,
		sessionId,
		timeoutMs: clampTimeout(args.timeout_sec),
	});

	const header = run.ok ? '' : `dsh error: ${run.error}\n\n`;
	const footerParts = [];
	if (run.sessionId) footerParts.push(`session: ${run.sessionId}`);
	if (run.usage?.totalTokens) footerParts.push(`tokens: ${run.usage.totalTokens}`);
	const footer = footerParts.length > 0 ? `\n\n---\n${footerParts.join(' · ')}` : '';

	return textResult(
		`${header}${run.text || '(no output)'}${footer}`,
		{
			session_id: run.sessionId ?? null,
			answer: run.text,
			ok: run.ok,
			usage: run.usage ?? null,
		},
		!run.ok,
	);
}

async function handleRequest(method, params, id) {
	switch (method) {
		case 'initialize': {
			const requested = params?.protocolVersion;
			const protocolVersion = SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0];
			reply(id, {
				protocolVersion,
				capabilities: { tools: { listChanged: false } },
				serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
				instructions:
					'dsh exposes DeepSeek Harness agents. Call dsh_task to delegate a task; pass the returned ' +
					'session id to dsh_resume for follow-up turns.',
			});
			return;
		}
		case 'ping':
			reply(id, {});
			return;
		case 'tools/list':
			reply(id, { tools });
			return;
		case 'tools/call': {
			const name = params?.name;
			const args = params?.arguments ?? {};
			if (!tools.some(tool => tool.name === name)) {
				replyError(id, -32602, `unknown tool: ${String(name)}`);
				return;
			}
			try {
				reply(id, await callTool(name, args));
			} catch (error) {
				reply(id, textResult(`dsh bridge failed: ${error?.message ?? String(error)}`, null, true));
			}
			return;
		}
		default:
			if (id !== undefined) replyError(id, -32601, `method not found: ${method}`);
	}
}

function main() {
	if (DSH_ENTRY === null && process.env.DSH_MODE === 'headless') {
		process.stderr.write('[dsh-mcp] warning: dsh CLI not found; tools will return an error.\n');
	}
	process.stderr.write(`[dsh-mcp] ready · node=${NODE_BIN} · dsh=${DSH_ENTRY ?? 'missing'}\n`);

	const rl = createInterface({ input: process.stdin });
	rl.on('line', (line) => {
		const trimmed = line.trim();
		if (trimmed === '') return;
		let message;
		try {
			message = JSON.parse(trimmed);
		} catch {
			process.stderr.write('[dsh-mcp] ignoring non-JSON input line\n');
			return;
		}
		if (message.method === undefined) return; // a response to us; nothing to do
		const isNotification = message.id === undefined || message.id === null;
		if (isNotification) return; // notifications/initialized, cancelled, ...
		handleRequest(message.method, message.params, message.id).catch((error) => {
			replyError(message.id, -32603, `internal error: ${error?.message ?? String(error)}`);
		});
	});
	rl.on('close', () => process.exit(0));
}

main();
