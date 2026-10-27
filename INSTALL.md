# Agent 自动安装入口

此文档供用户明确要求安装本仓库时使用。只查看或评估仓库时不要执行安装。已有用户/系统指令优先。

## 目标

在用户电脑上安装 MCP、Harness 桌面插件和委派 skill；让 Codex 可以自动打开已安装的 DeepSeek Harness，并把任务放进可见桌面对话。它不是独立 GUI 软件，不需要编译或安装 npm 依赖。

## 前提

- 当前稳定使用路径为 Windows + Node.js 20+ + Codex + DeepSeek Harness 桌面版。
- Harness 必须安装过、打开过并由用户完成登录/模型设置。不要获取或复制登录凭证，不代做认证。
- 不要因为安装本项目就安装其他编排框架、修改用户默认模型或放宽权限。

## 执行步骤

1. 检查 Node.js 与用户的 Harness desktop profile（默认 `~/.dsh/profiles/desktop/package.json`）。不存在时，只说明需要先安装并初始化 Harness；不要伪造 profile。
2. 将本仓库完整下载/克隆到用户可持久保存的本地目录。使用现有 checkout 时先检查未提交改动，避免覆盖。不要只下载 `skills/deepseek-delegation`：仅有路由技能不能提供 MCP 工具。
3. 从仓库根目录执行 `node scripts/install.mjs --dry-run`。该操作只输出目标目录，不修改配置。安装脚本查找常见安装路径以及正在运行的 Harness 进程，所以先使用自动发现，不要求用户手填路径。
4. 检查输出的应用路径与预期一致，然后执行 `node scripts/install.mjs`。如果应用路径未发现，通过当前 Harness 的已知安装目录/快捷方式定位真实可执行文件；找到后使用结构化参数运行 `node scripts/install.mjs --app <真实绝对路径>`。确实无法定位才询问用户。不要猜一个文件存在的路径。
5. 告知用户重开 Codex 以加载 MCP。Harness 首次需打开/重开一次以加载插件；已有桌面支持配置热加载时可以直接就绪，未就绪则重开。
6. 有可用的工具后，用 `dsh_open` 或 `dsh_status` 确认就绪即可。只有需要检验任务执行且用户允许时，发一个“不使用工具、不修改文件，只回复连接成功”的短测试；不要自动跑大型测试或真实项目任务。

安装脚本将运行文件复制到 `<CODEX_HOME>/mcp/dsh-codex-mcp/`，将技能复制到 `<CODEX_HOME>/skills/deepseek-delegation/`，并备份、合并 Codex MCP 与 Harness 插件配置。无需 npm install、npm 全局安装或 npm 发布包。

## 认证与连接排查

保留用户已经选择的模型和认证方式，不要因为发现环境变量就自动改成 API Key 模式。Harness 登录管理的授权走 `deepseek-account`；手工 Key 走 `deepseek-official`。平台上的 HarnessApp-managed 项目无需复制到 Key 输入框。

当前 Harness 的官方 Messages 地址为 `https://api.deepseek.com/anthropic`。连接报 404 时核对这个地址；缺少密钥时先核对 provider 和凭据来源。切勿把字面变量名 `DEEPSEEK_API_KEY` 保存成实际密钥，也不要输出用户的 Key、token 或完整凭据文件。更多说明见 [README：账号登录与 API Key](README.md#账号登录与-api-key)。

安装后复用一个 Codex 工作区，新任务仅新增会话。Windows 的桌面启动与 MCP 宿主进程组独立，关闭两款应用互不联动。检查就绪无需重复搜索已确认的安装路径。

## 完成后说明

向用户简短报告：实际安装位置、是否成功找到 Harness 应用、是否需要重开 Codex/Harness，以及可用工具 `dsh_open`、`dsh_status`、`dsh_task`、`dsh_resume`。用户可以直接说“把这部分交给 DeepSeek”，也可显式使用 `$deepseek-delegation`。

若尚未重开宿主导致当前工具不可用，明确区分“文件与配置已安装”和“当前会话已加载”。不要把安装脚本成功当作实际任务测试成功。
