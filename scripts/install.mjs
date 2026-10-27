#!/usr/bin/env node
import { cp, mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { findDesktopApp } from '../desktop-runtime.mjs';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const runtimeFiles = ['server.mjs', 'desktop-client.mjs', 'desktop-runtime.mjs', 'desktop-plugin', 'README.md', 'INSTALL.md', 'LICENSE', 'package.json'];

export function upsertMcp(text, nodePath, serverPath, environment = {}) {
  const table = `[mcp_servers.dsh]\ncommand = ${JSON.stringify(nodePath)}\nargs = [${JSON.stringify(serverPath)}]\nenabled = true\nstartup_timeout_sec = 30.0\ntool_timeout_sec = 3660.0\n`;
  const sections = text.split(/(?=^\[)/m);
  const index = sections.findIndex(section => /^\[mcp_servers\.dsh\]\s*(?:\r?\n|$)/.test(section));
  if (index >= 0) sections[index] = table + '\n';
  else sections.push('\n' + table + '\n');
  let envIndex = sections.findIndex(section => /^\[mcp_servers\.dsh\.env\]\s*(?:\r?\n|$)/.test(section));
  if (Object.keys(environment).length && envIndex < 0) {
    sections.push('[mcp_servers.dsh.env]\n');
    envIndex = sections.length - 1;
  }
  for (const [key, value] of Object.entries(environment)) {
    const line = `${key} = ${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}\\s*=.*$`, 'm');
    if (pattern.test(sections[envIndex])) sections[envIndex] = sections[envIndex].replace(pattern, line);
    else sections[envIndex] = sections[envIndex].trimEnd() + '\n' + line + '\n\n';
  }
  return sections.join('');
}

export function upsertDesktopPlugin(text, pluginPath) {
  text = text.replace(/^\[\]\s*$/m, '');
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex(line => /^\s*- id: codex-desktop-bridge\s*$/.test(line));
  const specifier = JSON.stringify(pathToFileURL(pluginPath).href);
  if (index >= 0) {
    const indent = lines[index].match(/^\s*/)[0];
    let nameIndex = index + 1;
    while (nameIndex < lines.length && !/^\s*- /.test(lines[nameIndex])) {
      if (/^\s*name:/.test(lines[nameIndex])) break;
      nameIndex++;
    }
    if (nameIndex >= lines.length || !/^\s*name:/.test(lines[nameIndex])) throw new Error('Existing bridge entry has no name; inspect the desktop patch before reinstalling.');
    lines[nameIndex] = `${indent}  name: ${specifier}`;
    return lines.join('\n');
  }
  return text.trimEnd() + `\n\n- insert:\n    - id: codex-desktop-bridge\n      name: ${specifier}\n`;
}

async function readOr(path, fallback) {
  try { return await readFile(path, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

async function backupWrite(path, content) {
  await mkdir(dirname(path), { recursive: true });
  try { await cp(path, path + `.bak-dsh-${Date.now()}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path, content, 'utf8');
}

async function main() {
  const { values } = parseArgs({ options: { app: { type: 'string' }, 'dry-run': { type: 'boolean' } } });
  const codexHome = process.env.CODEX_HOME || join(homedir(), '.codex');
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
  const destination = join(codexHome, 'mcp', 'dsh-codex-mcp');
  const desktopProfile = join(dshHome, 'profiles', 'desktop');
  try { await access(join(desktopProfile, 'package.json')); }
  catch { throw new Error('Harness desktop profile does not exist. Install Harness, open it once and complete setup, then retry.'); }
  let app;
  if (values.app) { app = resolve(values.app); await access(app); }
  else { try { app = await findDesktopApp(); } catch { /* manual launch remains usable */ } }
  const configPath = join(codexHome, 'config.toml');
  const patchPath = join(desktopProfile, 'cordis.patch.yml');
  const environment = { DSH_HOME: dshHome };
  if (app) environment.DSH_DESKTOP_APP = app;
  const config = upsertMcp(await readOr(configPath, ''), process.execPath, join(destination, 'server.mjs'), environment);
  const patch = upsertDesktopPlugin(await readOr(patchPath, ''), join(destination, 'desktop-plugin', 'index.mjs'));
  if (values['dry-run']) {
    console.log(JSON.stringify({ dryRun: true, destination, configPath, patchPath, skill: join(codexHome, 'skills', 'deepseek-delegation'), autoStartApp: app || 'not detected; pass --app' }, null, 2));
    return;
  }
  await mkdir(destination, { recursive: true });
  if (resolve(repo) !== resolve(destination)) {
    for (const name of runtimeFiles) await cp(join(repo, name), join(destination, name), { recursive: true });
  }
  const skillPath = join(codexHome, 'skills', 'deepseek-delegation');
  try { await access(skillPath); await cp(skillPath, join(codexHome, 'skill-backups', `deepseek-delegation-${Date.now()}`), { recursive: true }); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await cp(join(repo, 'skills', 'deepseek-delegation'), skillPath, { recursive: true });
  await backupWrite(configPath, config);
  await backupWrite(patchPath, patch);
  console.log('Installed MCP, Harness desktop plugin and deepseek-delegation skill.');
  console.log(app ? 'Auto-start is configured.' : 'For automatic opening, rerun with --app <absolute executable path>.');
  console.log('Restart Codex to load the MCP tools. Open/restart Harness once to load the plugin. Later tasks can open it automatically.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
