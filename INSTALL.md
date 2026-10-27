# 安装教程

## 环境要求

- Windows
- Git
- Node.js 20+
- Codex
- DeepSeek Harness 桌面版

先打开一次 Harness，完成登录并选择模型。

## 1. 下载项目

打开 PowerShell，进入准备存放项目的目录，执行：

```powershell
git clone https://github.com/m3145284542-dotcom/dsh-codex-mcp.git
cd dsh-codex-mcp
```

## 2. 运行安装脚本

```powershell
node scripts/install.mjs
```

脚本会查找正在运行或安装在常见目录的 Harness，安装 MCP、桌面插件和 Codex skill，并备份、合并已有配置。

如果没有找到 Harness，指定实际应用路径：

```powershell
node scripts/install.mjs --app 'D:\Apps\DeepSeek Harness\DeepSeek Harness.exe'
```

将示例路径换成电脑上的安装位置。

如需先查看安装位置，执行：

```powershell
node scripts/install.mjs --dry-run
```

## 3. 重启应用

安装完成后，重开 Codex 和 Harness，加载 MCP 和桌面插件。

## 4. 确认连接

在 Codex 中输入：

```text
打开 dsh
```

连接成功后，就可以发送任务：

```text
把这批日志交给 DeepSeek 分类，结果写到 work/log-summary.md。
```

任务会出现在 Harness 的桌面对话中。新任务创建新会话，共用一个 Codex 工作区。

## 模型设置

在 Harness 的模型选择器中选择提供方和模型。账号登录使用 `deepseek-account`，API Key 使用 `deepseek-official`。桥接沿用这些设置。

当前 Harness 的官方 Messages 地址为：

```text
https://api.deepseek.com/anthropic
```

## 安装位置

| 位置 | 内容 |
| --- | --- |
| `~/.codex/mcp/dsh-codex-mcp/` | MCP 和桌面插件 |
| `~/.codex/skills/deepseek-delegation/` | Codex skill |
| `~/.codex/config.toml` | MCP 配置 |
| `~/.dsh/profiles/desktop/cordis.patch.yml` | Harness 插件配置 |

可通过 `CODEX_HOME` 和 `DSH_HOME` 指定用户目录。

## 更新

在项目目录中执行：

```powershell
git pull
node scripts/install.mjs
```

完成后重开 Codex 和 Harness。

## 卸载

1. 从 `~/.codex/config.toml` 中移除 `mcp_servers.dsh` 和对应的 env 子表。
2. 从 `~/.dsh/profiles/desktop/cordis.patch.yml` 中移除 `id: codex-desktop-bridge` 条目。
3. 重开 Codex 和 Harness。
4. 删除 MCP 和 skill 的安装目录。

工作区和会话可以继续保留。需要恢复原配置时，使用安装脚本生成的备份。
