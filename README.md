# DeepSeek Harness Desktop MCP + Codex Skill

让 Codex 把任务交给 **DeepSeek Harness 桌面端**：自动打开应用、创建并显示对话、执行任务、返回结果，并在同一会话中继续。

A local MCP bridge and a task-routing skill for visible delegation from Codex to the DeepSeek Harness desktop app. Experimental, Windows-first, zero runtime npm dependencies.

## 让 Agent 直接下载安装（推荐）

把这段话发给 Codex 等可访问本机文件、终端的 Agent：

```text
请读取 https://github.com/m3145284542-dotcom/dsh-codex-mcp/blob/main/INSTALL.md，
把这个仓库下载到本地并完成安装，尽量自动找到本机 DeepSeek Harness。
保留我的其他配置；完成后告诉我是否需要重开应用。
```

Agent 按 [INSTALL.md](INSTALL.md) 执行下载和配置即可。**不是让用户安装一个新小软件**；安装的是 Agent 的工具与技能。仅下载 skill 文件夹不能替代 MCP 和 Harness 插件，所以推荐安装整套仓库。

## 包含什么

- **MCP server**：`dsh_task`、`dsh_resume`、`dsh_open`、`dsh_status`。
- **Harness 插件**：在桌面 Host 中执行任务，Client 自动切换到对应对话，可见消息和执行过程。
- **Codex skill**：判断什么活值得委派、交接文件和验收条件；保留 Codex 的需求判断和最终验收。
- **本地安装脚本**：安装到用户目录，合并所需配置，修改前保存备份。

## 前提

1. Windows 上已安装 DeepSeek Harness 桌面版，至少打开过一次并完成账号/模型设置。
2. Node.js 20+，以及可用的 Codex。
3. 当前插件依赖 Harness 的 `sessionController`、`workspaceRegistry`、`connection` 和 `uiWorkspace` 接口。已在本机安装的桌面版验证，其他版本可能需要适配；不是 DeepSeek 或 OpenAI 官方项目。

本项目不会安装 Harness 本体，也不修改其安装包、登录凭证或审批策略。桌面模式不需要单独安装 dsh CLI。

## 安装

在 PowerShell 中：

```powershell
git clone https://github.com/m3145284542-dotcom/dsh-codex-mcp.git
cd dsh-codex-mcp
node scripts/install.mjs --app 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe'
```

将 `--app` 替换为实际可执行文件路径。默认目录或 Harness 正在运行时，可以省略该参数让安装脚本自动发现；未检测到时再带 `--app` 重跑安装即可启用自动打开。

先看将修改哪些位置：

```powershell
node scripts/install.mjs --app 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe' --dry-run
```

安装位置（默认）：

```text
~/.codex/mcp/dsh-codex-mcp/          MCP 与桌面插件
~/.codex/skills/deepseek-delegation/ Codex 技能
~/.codex/config.toml                dsh MCP 条目
~/.dsh/profiles/desktop/cordis.patch.yml  桌面插件条目
```

支持用 `CODEX_HOME`、`DSH_HOME` 指定用户目录。安装脚本保留其他 MCP 条目和配置；旧技能保存到 `~/.codex/skill-backups/`，配置备份文件名带 `.bak-dsh-时间戳`。

**首次安装后重开 Codex，并打开/重开 Harness 一次以加载插件。此后 Codex 调用任务时可以自行打开 Harness。** 遇到登录或其他启动对话，需要手动完成；不会代填认证。

## 使用

在 Codex 里直接说：

```text
打开 DeepSeek Harness。
把这批日志的分类整理交给 DeepSeek，只允许写 work/log-summary.md。
继续刚才那个 DeepSeek 会话，把第二条遗漏补上。
使用 $deepseek-delegation 判断哪些部分适合交给 DeepSeek。
```

| 工具 | 行为 |
| --- | --- |
| `dsh_open` | 打开已配置的桌面应用，等待桥接就绪；不发模型请求 |
| `dsh_status` | 读取桥接是否就绪、是否忙碌；不打开应用 |
| `dsh_task` | 必填 prompt；可传绝对 cwd、session_id、timeout_sec |
| `dsh_resume` | 用 session_id 和 prompt 继续已有对话，沿用原 cwd |

新任务使用新会话；同一任务纠正和补充沿用原 session_id。所有新会话复用同一个“Codex 工作区”，首次优先沿用已有同名工作区，选定 ID 保存在 `~/.dsh/codex-desktop-bridge/workspace.json`，重启或重命名后继续复用；工作区被删除时才选择或创建替代项。不同任务的 `cwd` 通过 Harness 的会话级工作目录接口设置，保留共用工作区归属。续聊请传会话当前目录，或省略 `cwd`。任务按顺序执行，不要让多个 worker 同时修改同一批文件。

## 自动打开

安装脚本将 `--app` 写入 dsh MCP 的环境变量 `DSH_DESKTOP_APP`。任务开始前，MCP 会检查桌面心跳；离线时启动这个已安装程序，等待最多 45 秒，桥接和 UI 就绪后再发送任务。已有连接可用时不会再次启动应用；同一 MCP 进程的并发启动请求共用一次启动。

Windows 上通过本地 WMI 独立启动 Harness，避免它继承 GPT/Codex 的进程组：退出 GPT/Codex 后 Harness 继续运行，关闭 Harness 也不会关闭 GPT/Codex。无需管理员权限；若系统策略禁用本地 WMI，启动会明确报错，可手动打开 Harness 后继续使用桥接，不会退回到会随宿主关闭的启动方式。

不希望自动启动时，在 `~/.codex/config.toml` 的 `[mcp_servers.dsh.env]` 中设置：

```toml
DSH_AUTO_START = "0"
```

`dsh_status` 始终只读。Windows 已实测；其他系统可以显式设置可执行文件路径，但桌面集成尚未验证，不承诺自动发现。

## 分工技能

`skills/deepseek-delegation` 参考了 [Superpowers](https://github.com/obra/superpowers)、[wshobson/agents](https://github.com/wshobson/agents) 和 [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) 的任务拆分与验收方法，适配本项目的 MCP；没有捆绑安装这些框架。

- DeepSeek：边界清楚的实现、批量提取、长日志分析、文档初稿、具体问题的第二意见。
- Codex：需求和架构判断、共享接口、集成、事实核验、最终结果。
- 小修改直接完成；学生原型和测试项目仅做适量的检查，不强制多轮审查或完整生产回归。

## 实现与本地数据

MCP 与 Harness Host 通过 `~/.dsh/codex-desktop-bridge/` 的原子 JSON 文件交接任务。Client 使用经过 Harness 原有认证、仅 owner 可访问的 Fetch 路由长轮询导航状态。未增加网络监听端口。

该本地目录包含提示词、结果和会话 ID；它不会被本仓库上传，但请按普通会话日志管理。超时会请求取消回合；若结果不确定，先检查桌面对话和文件，再重试，避免重复修改。不要把仓库“零依赖”理解为任务无需权限或无需模型用量：具体任务由你的 Harness 账号和设置执行。

## 检查与开发

```powershell
npm run test:unit
node test-client.mjs '不要使用工具，只回复：连接成功' '不要使用工具，复述上一轮回复'
```

第一条使用本地模拟 Host，检查安装合并、创建、续聊、忙碌与超时。第二条运行真实桌面任务，会消耗你配置的模型用量。原型阶段无需反复运行完整验证。

Windows 上修改启动逻辑后，可额外运行不消耗模型额度的进程生命周期检查：

```powershell
npm run test:windows-lifecycle
```

测试用临时桌面进程验证两个方向的关闭独立性、交互会话、环境变量及带空格/中文/单引号的路径，不会关闭实际 GPT/Codex 或 Harness。

后台 CLI 模式仍保留为显式选项 `DSH_MODE=headless`；它另需 `@deepseek-ai/dsh` CLI 及相应 headless profile 配置，不会自动代替桌面模式，也不保证出现在桌面列表中。

## 更新与卸载

更新：拉取仓库后重新运行安装脚本，再重开 Codex；如插件接口或路径改变，重开 Harness。重跑安装会更新已有桥接条目，不重复插入。

卸载：从 Codex 配置中移除 `mcp_servers.dsh` 和其 env 子表，从 Harness 桌面 patch 中移除 `id: codex-desktop-bridge` 那个条目，重开两款应用。然后可自行移除 MCP 和技能目录；保留既有工作区、会话和项目文件。需要恢复配置时使用安装脚本留下的备份。

License: MIT. Community project, not affiliated with DeepSeek or OpenAI.
