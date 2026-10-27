# Repository guidance

This repository bundles a local MCP server, a DeepSeek Harness desktop plugin,
and the `deepseek-delegation` skill. It is not a separate desktop GUI app.

When the user asks to install it, read `INSTALL.md` and use the bundled Node
installer. Do not install anything merely because you are browsing the repo.
Preserve unrelated user configuration, installed skills and workspaces.

For development, keep changes focused and run the relevant small check:
`npm run test:unit` covers the installer and a simulated desktop Host. A live
task check uses `node test-client.mjs` and consumes the user's model usage.
Do not start live tasks without authorization or treat a simulation as a live
integration test.

Never commit local backups, credentials, session logs, absolute user-home
paths, or generated task output. Public examples should use placeholder paths.
