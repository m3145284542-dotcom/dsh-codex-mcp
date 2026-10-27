# dsh-codex-mcp

给 Codex 接上 DeepSeek Harness，让两个助手一起干活。

你在 Codex 里交代任务，Codex 可以把整理日志、批量处理文件、实现一个模块等工作交给 DeepSeek，再接回结果继续处理。Harness 会打开对应的桌面对话，你能看到它在做什么，也能接着聊。

新任务开新会话，共用一个 Codex 工作区。两个应用各自运行，关掉 Codex 后，Harness 也可以继续开着。

## 怎么用

装好后，在 Codex 里直接说：

```text
打开 DeepSeek Harness。
把这批日志的分类整理交给 DeepSeek，只允许写 work/log-summary.md。
继续刚才那个 DeepSeek 会话，把第二条遗漏补上。
使用 $deepseek-delegation 判断哪些部分适合交给 DeepSeek。
```

一起安装的 `deepseek-delegation` skill 会帮助 Codex 判断哪些工作值得交出去。小修改直接做，适合独立完成的任务再分给 DeepSeek。

## 安装

目前主要在 Windows 上使用，需要 Node.js 20+、Codex，以及已经安装并完成登录和模型设置的 DeepSeek Harness。

最省事的方式是把下面这段话发给 Codex：

```text
请读取 https://github.com/m3145284542-dotcom/dsh-codex-mcp/blob/main/INSTALL.md，
把这个仓库下载到本地并完成安装，尽量自动找到本机 DeepSeek Harness。
保留我的其他配置；完成后告诉我是否需要重开应用。
```

安装会配置 MCP、Harness 桌面插件和 skill，自动查找本机 Harness，并保留原有设置。完整步骤见 [INSTALL.md](INSTALL.md)。

<details>
<summary>也可以自己安装</summary>

在 PowerShell 中执行：

```powershell
git clone https://github.com/m3145284542-dotcom/dsh-codex-mcp.git
cd dsh-codex-mcp
node scripts/install.mjs --app 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe'
```

把 `--app` 后的路径换成实际安装位置。如果 Harness 正在运行，或安装在常见目录，可以省略 `--app`。加上 `--dry-run` 可以先查看安装位置。

默认会安装到：

```text
~/.codex/mcp/dsh-codex-mcp/          MCP 与桌面插件
~/.codex/skills/deepseek-delegation/ Codex 技能
~/.codex/config.toml                dsh MCP 条目
~/.dsh/profiles/desktop/cordis.patch.yml  桌面插件条目
```

支持 `CODEX_HOME` 和 `DSH_HOME`。安装脚本会备份已有配置。

</details>

首次安装后，重开 Codex 和 Harness，让它们加载插件。之后说“打开 dsh”就可以直接启动；任务执行时也会按需打开。

## 模型怎么选

在 Harness 里选好账号、模型和权限即可，桥接会沿用这些设置。账号登录和 API Key 两种方式都可以使用。

新建会话使用当时的默认模型；已有会话可以在 Harness 的模型选择器里调整。

## 项目里有什么

- 一个 MCP 服务，负责启动应用、发送任务和接收结果。
- 一个 Harness 桌面插件，负责创建会话、显示对话和执行任务。
- 一个 Codex skill，负责分工和交接。
- 一个 Node 安装脚本，无需另外安装 npm 依赖。

MCP 提供四个工具：

| 工具 | 用途 |
| --- | --- |
| `dsh_open` | 打开 Harness |
| `dsh_status` | 查看连接和忙碌状态 |
| `dsh_task` | 开始一个新任务 |
| `dsh_resume` | 继续已有会话 |

桥接一次处理一个任务，通过本地文件交接。会话和任务记录保存在本机的 `~/.dsh/codex-desktop-bridge/`。

## 开发、更新与卸载

本地模拟测试和 Windows 进程生命周期测试：

```powershell
npm run test:unit
npm run test:windows-lifecycle
```

真实桌面测试可使用 `test-client.mjs`，会调用你在 Harness 中配置的模型并消耗相应用量。

更新时拉取仓库，再运行安装脚本并重开 Codex；桌面插件有变化时，也重开 Harness。卸载方式见 [INSTALL.md](INSTALL.md#卸载)。

分工 skill 参考了 [Superpowers](https://github.com/obra/superpowers)、[wshobson/agents](https://github.com/wshobson/agents) 和 [oh-my-codex](https://github.com/Yeachan-Heo/oh-my-codex) 的一些做法，具体来源见 [references/sources.md](skills/deepseek-delegation/references/sources.md)。

MIT License。社区项目，与 DeepSeek、OpenAI 无隶属关系。其他系统和 Harness 版本尚未充分测试。
