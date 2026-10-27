import assert from 'node:assert/strict';
import { upsertMcp, upsertDesktopPlugin } from '../scripts/install.mjs';

const original = '# user setting\nmodel = "keep-me"\n\n[mcp_servers.dsh]\ncommand = "old"\nargs = []\n\n[mcp_servers.dsh.env]\nCUSTOM = "keep"\n\n[mcp_servers.other]\ncommand = "other"\n';
const result = upsertMcp(original, 'C:\\Node\\node.exe', 'C:\\bridge\\server.mjs', { DSH_DESKTOP_APP: 'D:\\Apps\\Harness.exe' });
assert.ok(result.includes('model = "keep-me"'));
assert.ok(result.includes('CUSTOM = "keep"'));
assert.ok(result.includes('[mcp_servers.other]\ncommand = "other"'));
assert.equal((result.match(/\[mcp_servers\.dsh\]/g) || []).length, 1);
assert.equal(upsertMcp(result, 'C:\\Node\\node.exe', 'C:\\bridge\\server.mjs', { DSH_DESKTOP_APP: 'D:\\Apps\\Harness.exe' }), result);
const patch = upsertDesktopPlugin('[]', '/bridge/desktop-plugin/index.mjs');
assert.ok(!patch.includes('[]'));
assert.equal(upsertDesktopPlugin(patch, '/bridge/desktop-plugin/index.mjs'), patch);
const changed = upsertDesktopPlugin(patch, '/new/desktop-plugin/index.mjs');
assert.ok(changed.includes('/new/'));
assert.equal((changed.match(/id: codex-desktop-bridge/g) || []).length, 1);
console.log('PASS: installer preserves unrelated settings, updates paths and is idempotent');
