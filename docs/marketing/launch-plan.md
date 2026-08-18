# EZdeploy 公开发布作战手册

> 目标：让 `0.1.0` 的公开发布一次打透。发布只有一次，以下所有 P0 项完成前不要点 "Make public"。

## P0：公开之前（仓库内已完成的不重复列出）

### 1. 组织迁移（建议）

当前 URL `ezdeployhq/ezdeploy` 难记难拼，"crypto" 后缀对部分开发者是信任减分项。
GitHub 已确认 `ezdeployhq`、`ezdeploy-app` 组织名可用（`ezdeploy`/`ez-deploy` 已被占用）。

- [ ] 创建组织（如 `ezdeployhq`），在私有阶段迁移仓库（零外部链接，成本为零）
- [ ] 迁移后全局替换徽章与链接中的 `ezdeployhq/ezdeploy`（README ×2、package.json、docs/）
- [ ] 将 `docs/marketing/avatar.png` 设为组织头像

### 2. 仓库设置（公开后立即）

- **Description**：`Agent-native personal app deployment center — tell your coding agent "deploy to my app center", confirm the plan, and get a healthy URL on your own Cloudflare account.`
- **Topics**（填满）：`cloudflare-workers` `cloudflare-pages` `cloudflare-d1` `cloudflare-r2` `deployment` `ai-agents` `mcp-server` `codex` `developer-tools` `self-hosted` `self-hosting` `vite` `static-site` `agent-native` `llms-txt` `openai-compatible` `personal-paas` `cloudflare` `typescript` `bilingual`
- **Social preview**：Settings → General → Social preview → 上传 `docs/marketing/social-preview.png`（1280×640，已生成）
- 按 `docs/open-source-release.md` 开启 secret scanning、push protection、分支保护、私有漏洞报告

### 3. 抢占分发渠道名字

- [ ] npm：`@ezdeploy` scope 空闲（`ezdeploy` 单名已被 2022 年废弃包占用，直接用 scoped 包）
- [ ] Product Hunt 创作者账号、X/Twitter 账号、掘金/少数派/V2EX 账号完善资料

### 4. 真实演示视频（发布前一天录）

README 首屏的 SVG 主视觉是静态的；发布当天最有力的素材是一段 45–60 秒真实录屏：
打开 Codex → 输入「部署到应用中心」→ 展示计划预览 → 确认 → 返回健康 URL。
直接录屏（macOS `Cmd+Shift+5` 或 Kap），导出 MP4 上传到 Issue/PR 里拿到 `user-attachments` URL，
以 `<video>` 或 GIF 形式插入 README 主视觉之后。录前准备：干净的终端配色、一个小的 Vite 示例项目、
提前跑一次完整流程确保无报错。

## 发布日（建议周二至周四，UTC 14:00 前后）

### Show HN（英文主阵地）

**标题**：`Show HN: EZdeploy – Tell your coding agent "deploy to my app center", it ships to your own Cloudflare account`

**首条评论（作者自述，发布后立刻贴）**：

> Hi HN! I built EZdeploy because every "AI deploys your app" tool I tried wanted to own the hosting or skip the confirmation step. EZdeploy is different in three ways:
>
> 1. It runs entirely in your own Cloudflare account (Pages/Workers + D1/R2). Free tier covers personal use.
> 2. Nothing ships without your explicit confirmation. Every deploy previews the provider, bindings, access scope, and risks, and execution is cryptographically bound to the plan digest you approved.
> 3. It's agent-native by protocol, not by prompt hack: the workflow is discoverable via agent.md, skill.md, llms.txt, /.well-known/ezdeploy.json, and openapi.json, so any coding agent can find it.
>
> The control plane is 4 Workers + D1 + R2 + Cloudflare Workflows for long-running release steps. Ask me anything about the architecture.

### V2EX（分享创造节点）

**标题**：`[开源] EZdeploy：对 AI 说一句"部署到应用中心"，应用就上线到你自己的 Cloudflare`

**正文要点**：一句话演示 → 三条差异化（自己的 Cloudflare 账号 / 确认才发布 / Agent 原生发现协议）→
技术栈（4 Workers + D1 + R2 + Workflows）→ 中英双语界面 → 求 star 与反馈。附上主视觉图。

### Reddit（按社区调性分开投，间隔 1-2 天）

- **r/Cloudflare**：技术向。标题 `I built an open-source personal PaaS on Workers + Pages + D1 + R2 + Workflows — deploys are driven by coding agents`，正文讲架构决策（为什么用 Workflows 做长任务、D1 事务边界、R2 不可变产物）。
- **r/selfhosted**：主权向。标题 `EZdeploy – self-hosted personal app center: your coding agent deploys to YOUR Cloudflare account (free tier)`，强调数据与凭证不出账户、可撤销 Key、单管理员。

### 中文内容渠道（发布周内）

- **阮一峰周刊投稿**：`https://github.com/ruanyf/weekly` 提 issue，格式参照往期工具推荐。
- **掘金**：发《我把部署变成了一句话：EZdeploy 开源记》，叙事型，讲动机 + 架构 + 踩坑。
- **少数派**：偏产品向，《让 AI 帮你发应用，但每一步都经过你确认》。

### Cloudflare 生态（最重要的杠杆）

- [ ] 给 `irazasyed/awesome-cloudflare` 提 PR（Workers 分类）
- [ ] Cloudflare Developers Discord #showcase 发布：一段 GIF + 三行说明 + 仓库链接
- [ ] 投稿 Cloudflare 社区教程 / 申请 Workers Launchpad 或 Built with Workers 展示
- [ ] dev.to 交叉发布技术文 `How we deploy agent-built apps with Workers + D1 + R2 + Workflows`，canonical URL 指向仓库

## 发布后：增长飞轮

- **"Deployed with EZdeploy" 徽章**：给部署成功的用户一行 markdown，放进他们的 README：
  `[![Deployed with EZdeploy](https://img.shields.io/badge/deployed%20with-EZdeploy-f6821f)](<仓库URL>)`
- **issue 花园**：打 3-5 个 `good first issue`（示例：新 example、文档翻译、provider 适配器），置顶 roadmap issue，Discussions 开 Show and tell。
- **每个 example 一篇内容**：`examples/` 下三个示例各配一篇短文（dev.to + 掘金），文末链回仓库。
- **数据复盘**：用 star-history.com 记录每次投放后 48 小时增量，有效渠道加倍，无效砍掉。

## 素材清单（本目录）

| 文件 | 用途 |
| --- | --- |
| `social-preview.png` | GitHub 仓库 Social preview（1280×640） |
| `avatar.png` | GitHub 组织 / 社媒头像（512×512） |
| `../.github/assets/hero-en.svg` `hero-zh.svg` | README 主视觉（源文件可编辑） |
| `../.github/assets/logo.svg` `social-preview.svg` | Logo 与预览图源文件 |

