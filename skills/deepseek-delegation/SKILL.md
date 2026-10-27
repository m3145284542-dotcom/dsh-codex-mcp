---
name: deepseek-delegation
description: Decide when Codex should delegate to the user's installed DeepSeek Harness desktop MCP. Use proactively for substantial tasks with bounded implementation, batch extraction, long-log analysis, document drafting or a focused second opinion; also use for 打开dsh、打开DeepSeek Harness、交给DeepSeek、分工、省额度、让DeepSeek干. Keep trivial changes, unresolved requirements, tightly coupled integration and final acceptance in Codex.
---

# DeepSeek delegation

Use the existing Harness desktop MCP as a worker. Codex owns task selection, interfaces, integration and the final answer. The user's standing preference permits appropriate delegation within the work they authorized; it does not expand permissions or override a request to use a particular provider.

For this user, consider delegation without waiting for them to name DeepSeek on every substantial task. Briefly say what package is being handed off and why, then proceed within the existing authorization. Do not add a confirmation step just for model selection. A request to handle the task in Codex or avoid delegation takes precedence.

## Open dsh and reuse known locations

For “打开 dsh”, “打开 DeepSeek Harness”, or an equivalent request to launch the app, call the available `dsh_open({})` tool directly (currently `mcp__dsh__dsh_open`). A launch-only request does not require delegation or a model prompt. Discover its schema if needed; do not list the current folder, search for an executable, or inspect the adapter README before trying the installed tool.

After the first successful setup/open, retain already confirmed installation or working-directory paths in the skill's local `references/local-installation.md`, with the successful tool and date. The user authorizes maintaining this local skill note for that purpose. Record only paths actually established; opening the app does not reveal its executable path, and a task's working directory is not its app installation directory. Read this note only when a later request needs a path. Reuse the configured bridge and known paths across tasks; repeat discovery only if a needed path is missing, fails, or the user requests a different installation.

Keep machine-specific absolute paths in that local note, outside shared GitHub commits and distributable skill copies. Shared copies retain this procedure so each machine records its own confirmed locations. If executable discovery is necessary, persist the confirmed executable through the installer's existing `--app` / `DSH_DESKTOP_APP` configuration, preserving other settings. A successful `dsh_open` is sufficient confirmation of launch/readiness; do not add a model task just to verify it.

## Decide before dispatch

Delegate when the work can be explained with a compact brief, completed independently and checked from concrete evidence. Prefer a useful batch over many tiny calls. Compare handoff, waiting and review effort with doing it locally; do not assume a second model is faster, cheaper or more capable without measurements.

| Work | Default choice |
| --- | --- |
| Extract fields from many supplied files; summarize long logs into a bounded report | DeepSeek, with input paths and an output schema |
| Implement a small, well-specified module or repeated mechanical edits | DeepSeek, with file ownership and acceptance criteria |
| Run an existing test suite, classify failures or reproduce a specified bug | DeepSeek, with exact commands and evidence to return |
| Draft content from supplied facts or format an existing document | DeepSeek when substantial; retain applicable document skills and render checks |
| Independent critique of a concrete design or diff | DeepSeek for a scoped second opinion; Codex adjudicates findings |
| One-line fix, short explanation or one cheap local command | Codex |
| Unclear requirements, architecture tradeoffs, shared interfaces, tightly coupled debugging | Codex first; delegate a bounded investigation only after defining its question |
| A task requiring a connected account or tool available only in Codex | Use that capability in Codex; hand off only appropriate task inputs |
| Final integration, deciding whether evidence supports a claim, publishing or other consequential actions | Codex retains responsibility and existing authorization requirements |

Do not send the entire conversation or whole repository as the brief. Send relevant paths, requirements and settled interface decisions. Never delegate merely because a task is long; missing scope makes a poor work package.

For this user's document, paper, MATLAB and coding tasks, read only the relevant example in [references/personal-routing.md](references/personal-routing.md) when the domain boundary needs clarification. Existing subject-specific skills remain authoritative for that work; delegate execution without dropping their source, rendering or evidence requirements.

## Prepare a work package

State the objective, absolute working directory, input paths, allowed output paths, requirements, applicable user/project instructions, and how success will be checked. Distinguish read-only investigation from permission to edit. Include exact identifiers and expected formats where errors would matter.

For code edits, record the relevant working-tree baseline and assign explicit files. Codex must not edit the worker's files while the worker runs. Preserve pre-existing user changes. Work on dependent parts after the preceding contract is settled; use an isolated worktree only when appropriate for that repository.

Example brief, tailored to the actual task:

```text
Objective: <one bounded outcome>
Working directory: <absolute path>
Read: <specific files or artifacts>
May modify: <specific files or output directory; or read-only>
Requirements and interfaces: <facts, exact values, applicable instructions>
Acceptance: <observable behavior, command, schema or rendered artifact>
Return: summary, changed/output paths, validation commands and results,
        unresolved issues, and whether the acceptance criteria were met.
Do not expand the assignment, spawn other agents or publish anything.
```

Only add a confidentiality or external-action restriction when relevant to the work; existing permissions remain binding on both agents. Omit credentials and unrelated personal material from the handoff.

## Call the installed bridge

Discover the available `dsh_task` and `dsh_resume` tools; their current fully qualified names are `mcp__dsh__dsh_task` and `mcp__dsh__dsh_resume`. Use MCP directly rather than typing messages through the UI or running another CLI adapter.

- Start unrelated work with `dsh_task({prompt, cwd, timeout_sec})` and an absolute `cwd`.
- Continue or correct the same work with `dsh_resume({session_id, prompt, cwd, timeout_sec})`, using the returned ID and original directory.
- Select a timeout appropriate to the package. The current bridge defaults to 600 seconds and accepts up to 3600 seconds; the live tool schema is authoritative.
- The desktop bridge processes one task at a time. Keep at most one outstanding Harness call. This skill does not authorize a worker fan-out or recursive delegation.
- The bridge opens the installed Harness desktop app automatically when needed, then waits for its plugin and UI. You may also call dsh_open explicitly or dsh_status for a read-only readiness check. Complete login/setup manually if required. Keep its configured model and approvals; do not silently substitute headless mode.

This machine's adapter is documented at `<CODEX_HOME>/mcp/dsh-codex-mcp/README.md`. Read it only for a bridge failure or maintenance question, not at the start of every task. Do not open another Codex chat for a Harness assignment.

Harness does not inherit Codex's chat history. Reuse a session for focused follow-ups, not for an unrelated assignment. For a long or multi-package task, keep the session ID, scope, owned files and status in the task's existing progress record, or `work/deepseek-handoffs.md` if no record exists, so compaction does not cause duplicate dispatch.

If auto-start cannot make Harness ready, or it is busy, report the concrete limitation and continue useful independent work in Codex where permitted. Do not reinstall or reconfigure the bridge merely to retry. If the user explicitly required DeepSeek, keep that choice and request the missing app action. On timeout, interruption or an uncertain result, inspect the returned session and relevant artifacts before retrying; the task may already have changed files.

Respect the task's quota and stop/continuation instructions. Record active worker ownership before a checkpoint; do not use delegation to evade a requested stop.

## Accept results

Read `isError` and the result's `ok` field, answer and session ID. For student prototypes and test projects, prefer a short scope review and one relevant smoke check; avoid production-grade hardening, broad regression suites or extra reviewer rounds unless requested or a concrete failure requires them. Keep source claims and real execution evidence truthful.

- For code, inspect the relevant diff against the baseline and confirm scope and interface compliance. Inspect reported test evidence and run a targeted independent check when correctness or integration warrants it; do not rerun every passing check without a reason.
- For extraction, verify counts, schema and representative source-to-output matches. Reject invented facts or sources.
- For documents and figures, apply the task's existing rendering, visual review and export requirements.
- For an advisory review, assess findings against the actual source; disagreement alone does not establish a defect.

Return a focused correction to the same worker session when an otherwise sound result misses a clear requirement. If a repeated attempt makes no meaningful progress, refine the task or take over locally instead of entering an open-ended retry loop. Do not mark incomplete or unverifiable work as finished.

Tell the user briefly which part DeepSeek handled, what Codex verified, and any remaining limitation. Do not dump intermediate transcripts or claim measured savings without evidence.

## Provenance

This is a local adaptation for the installed desktop bridge, not an installation of an upstream orchestration framework. Read [references/sources.md](references/sources.md) only to inspect the researched source methods and compatibility decisions.
