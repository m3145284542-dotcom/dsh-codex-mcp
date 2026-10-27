# Research provenance

GitHub star snapshots were checked on 2026-10-26; they are popularity signals, not evidence of reliability or measured model quality. These source files informed the local adaptation. Upstream frameworks, hooks, agent registries and CLI wrappers were not installed.

| Source | Snapshot | Method adapted |
| --- | --- | --- |
| [obra/superpowers](https://github.com/obra/superpowers) | 305,416 stars | Isolated work packages, selecting work by complexity, and evidence-based acceptance |
| [wshobson/agents](https://github.com/wshobson/agents) | 41,756 stars | File ownership, dependencies, explicit interfaces and acceptance criteria |
| [Yeachan-Heo/oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) | 33,637 stars | Focused external advisor calls and preserving the handoff/result context |

Pinned source files:

- [Superpowers: subagent-driven-development](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/subagent-driven-development/SKILL.md)
- [Superpowers: dispatching-parallel-agents](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/dispatching-parallel-agents/SKILL.md)
- [Superpowers: verification-before-completion](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/verification-before-completion/SKILL.md)
- [Agents: task-coordination-strategies](https://github.com/wshobson/agents/blob/0874a27b17a22e2b7c2e2bcd725768e0803cad06/plugins/agent-teams/skills/task-coordination-strategies/SKILL.md)
- [OMX: ask](https://github.com/Yeachan-Heo/oh-my-codex/blob/6b1c110ec06b45a5644ceb6ee60788f7ccae6c46/skills/ask/SKILL.md)

Compatibility decisions:

- The existing Windows desktop bridge is sequential, so upstream parallel fan-out instructions were not adopted.
- OMX's researched README identifies macOS/Linux Codex CLI as its main supported path and native Windows/Codex App as less supported. Its `ask` skill calls Claude/Gemini CLI, not the user's Harness MCP.
- [Claude Octopus](https://github.com/nyldn/claude-octopus), 4,307 stars at the snapshot, has useful explicit escalation ideas but requires WSL/SSH on Windows. It was not installed.
- [claude-code-router](https://github.com/musistudio/claude-code-router), 37,860 stars at the snapshot, routes model requests; it does not replace whole-task delegation to the installed Harness desktop.

The local skill describes task selection and verification, not a benchmark claiming one provider is categorically better or cheaper.
