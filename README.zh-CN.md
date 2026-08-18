# EZdeploy

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![CI](https://github.com/jingchang0623-crypto/ezdeploy/actions/workflows/ci.yml/badge.svg)](https://github.com/jingchang0623-crypto/ezdeploy/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](./LICENSE)

EZdeploy 是一个开源、Agent 原生的个人应用部署中心。只需安装一次部署 Skill 并保存一个可撤销的长期 Key，之后在 Codex、WorkBuddy 或其他编码 Agent 中说一句 **“部署到应用中心”** 即可。Agent 会分析项目、展示准确的部署计划、等待确认，然后发布到你的 Cloudflare 账号，完成健康检查，并返回你自有域名下的应用链接。

应用中心同时提供英文和简体中文界面。访问 `/en` 可打开英文版，也可以在任意页面使用语言切换入口；两种语言共享同一个管理员账号、应用数据、部署 Key 和 AI Provider 配置。

## 产品边界

首个版本聚焦静态站点、Vite/React 应用和 Cloudflare Workers。Cloudflare Pages/Workers 是主要运行时；D1、R2、可选的受保护访问和兼容 OpenAI 的 AI Proxy 作为应用资源绑定。

EZdeploy 不计划成为通用容器平台、Kubernetes 发行版、完整 CI/CD 产品或数据库实现。

## 开源状态

EZdeploy 正在为首个公开的 `0.1.0` 版本做准备，并采用 Apache-2.0 许可证。核心部署流程已经实现并通过测试；Cloudflare 安装仍需要使用部署者自己的基础设施，并完成安全审查。源码仓库位于 [jingchang0623-crypto/ezdeploy](https://github.com/jingchang0623-crypto/ezdeploy)。另请参阅 [CONTRIBUTING.md](./CONTRIBUTING.md)、[SECURITY.md](./SECURITY.md) 和[发布检查清单](./docs/open-source-release.md)。

## 快速安装

唯一的基础设施要求是一个 Cloudflare 账号。新账号需要先在 Cloudflare 控制台激活一次 R2（可能会要求绑定支付方式；只要用量在当前免费额度内就不会产生费用）。

    npm install
    npx wrangler login
    npm run setup:cloudflare

脚本会自动准备 D1 和 R2、生成 Worker 配置、部署全部四个 Worker、写入生成的密钥，并输出你的应用中心地址。API 令牌权限要求、非交互参数和等价的手动步骤见 [docs/cloudflare-setup.md](./docs/cloudflare-setup.md)。

## 部署契约

每次部署都遵循同一套可观察流程：

```text
检查项目
  -> 验证 ezdeploy.yaml
  -> 预览运行时、资源绑定、访问范围与风险
  -> 获得用户明确确认
  -> 使用计划摘要绑定已确认内容
  -> 创建或复用资源
  -> 部署
  -> 健康检查
  -> 保存应用状态
  -> 返回应用 URL
```

当配置了个人应用域名后缀时，只有部署状态为 `ready` 且 `*.apps.example.com` 地址验证通过才算成功。仅获得云厂商部署 ID 或备用托管地址不代表部署成功。

## 仓库结构

```text
apps/mcp-server            临时 npx 客户端和可选 MCP 网关
apps/control-plane         带认证的源码上传与部署 API
apps/cloud-control-plane   在线 Worker + D1/R2/Workflow 控制面
apps/agent-ingress         使用令牌认证的公开 Agent API 入口
apps/ai-proxy              兼容 OpenAI、具备权限隔离的 AI 网关
apps/app-center            带认证的本地应用目录
apps/cloud-app-center      单管理员在线应用中心
packages/contracts         带版本的清单与领域 Schema
packages/core              状态机、SQLite 仓库、编排与 Provider
skills/ezdeploy            Codex 部署工作流
```

生产控制面已经完全在线。Worker 将应用、环境、部署、资源绑定和事件保存在 D1，将部署包保存在 R2，并使用 Cloudflare Workflows 执行长时间发布步骤。Provider 凭证使用 Worker Secret 保存，绝不会进入应用仓库或 Agent 提示词。

## 已实现的完整链路

仓库同时包含用于测试的确定性 Mock 和真实 Cloudflare 适配器：

- 清单校验与安全默认值；
- 明确的部署状态转换；
- 重复部署时复用资源绑定；
- 以健康检查作为就绪条件，并保存结构化失败信息；
- 持久化控制面事件和结构化 Provider 错误；
- 支持显式删除，并选择保留或移除资源；
- 支持使用 D1/R2 运行时绑定部署 Pages 和 Workers；
- 由兼容 OpenAI 的 Proxy 签发范围受限的 AI 虚拟 Key，并以 Secret 注入；
- 可选的 Cloudflare Access 受保护应用策略；
- 不可变 Pages 构建产物、Worker 版本捕获和恢复；
- 单管理员应用中心，以及 MCP 列表、日志、回滚和删除工具；
- 完整的英文和简体中文应用中心路由，并在切换页面时保持当前语言；
- 支持在应用中心直接上传 ZIP 部署静态站点，手边没有 Agent 时也能发布。

不能把 Mock Provider 当作生产环境。生产安装需要 Cloudflare 账号；使用 AI 资源绑定时还需要部署 AI Proxy。Cloudflare Zero Trust 是可选能力，仅在应用需要受保护访问时使用。

## 本地开发

需要 Node.js 22 或更高版本。

```bash
npm install
npm run typecheck
npm test
npm run build
```

本地开发时启动 Mock MCP Server：

```bash
ZAODEPLOY_PROVIDER=mock \
ZAODEPLOY_DATABASE_PATH=.zaodeploy/control-plane.db \
npm --workspace @ezdeploy/agent run dev
```

Mock Provider 返回 `.example.test` 地址，必须显式选择。生产环境使用在线 `@ezdeploy/cloud-control-plane`。默认个人部署流程不要求每个项目提前安装工具或配置 MCP：应用中心会生成一个长期有效、可撤销的个人部署 Key，以及用于安装公开 EZdeploy Skill 的提示词。完成一次设置后，“部署到应用中心”或“deploy to my app center”等触发语即可启动流程。

具备终端能力的 Agent 会把带版本的独立客户端下载到操作系统临时目录；Remote MCP 和由运营者发布的 `@ezdeploy/agent` 包仍是可选的增强分发方式。用户不需要运行本地控制面守护进程，也不需要接触 Cloudflare Access Service Token。相同的规范流程可通过 `agent.md`、可安装 Skill、`skill.md`、`agents.md`、`llms.txt`、`/.well-known/ezdeploy.json` 和 `openapi.json` 发现。旧的 well-known 路径与 `ZAODEPLOY_*` 环境变量会继续作为稳定的兼容协议标识保留。

AI 和组织访问是可选的控制面能力，配置方式见 [`.env.example`](./.env.example)。AI Proxy 在服务端保存真实模型供应商 Key，并为每个应用签发可撤销的独立 Key。Vite/静态应用必须通过 Pages Functions 调用 D1、R2 和 AI，绝不能把 `ZAO_AI_API_KEY` 暴露给浏览器代码。

个人管理员可以在应用中心配置 DeepSeek、OpenAI、Anthropic、Gemini、OpenRouter、Cloudflare Workers AI，或任意兼容 OpenAI 的自定义服务。详见 [`docs/ai-provider-management.md`](./docs/ai-provider-management.md)。

Worker 和 Agent 安装方式见 [`docs/cloudflare-setup.md`](./docs/cloudflare-setup.md)。Gateway 会在最小环境中完成本地构建，并上传经过摘要校验的部署包，其中仅包含清单、构建产物、编译后的 Pages Functions、路由和迁移文件。项目构建脚本绝不会在持有云凭证的控制面中运行。

首次访问时，所有者需要创建该安装实例唯一的管理员账号。EZdeploy 只在 D1 中保存加盐 PBKDF2 密码派生值和哈希后的短期会话，不会保存明文密码或会话令牌。详见 [`docs/account-management.md`](./docs/account-management.md)。

使用同一数据库运行本地应用中心：

```bash
ZAODEPLOY_DATABASE_PATH=.zaodeploy/control-plane.db \
ZAODEPLOY_APP_CENTER_TOKEN='<personal owner token>' \
npm --workspace @ezdeploy/app-center run dev
```

如果应用中心只能通过 Cloudflare Access 访问，请使用 `ZAODEPLOY_TRUST_CLOUDFLARE_ACCESS=true` 替代本地 Token 模式。不要在可直接访问源站的环境中启用请求头信任模式。

## Manifest

从 [`ezdeploy.example.yaml`](./ezdeploy.example.yaml) 开始。Manifest 是部署意图的持久化来源，聊天记录不是。

## 许可证

Apache-2.0。
