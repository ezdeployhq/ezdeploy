# AI Provider 管理

个人管理员通过 `https://apps.example.com/settings/ai` 管理模型供应商。应用不会直接
获得 DeepSeek、OpenAI 或其他供应商的主密钥；EZdeploy AI Proxy 为每个应用签发
可撤销的 `zai_` 虚拟密钥。

## 内置预设

- DeepSeek：`https://api.deepseek.com`
- OpenAI：`https://api.openai.com/v1`
- Anthropic OpenAI compatibility：`https://api.anthropic.com/v1`
- Google Gemini OpenAI compatibility：
  `https://generativelanguage.googleapis.com/v1beta/openai`
- OpenRouter：`https://openrouter.ai/api/v1`
- Cloudflare Workers AI
- 自定义 OpenAI-compatible API

预设只负责填写 Base URL 和建议模型，管理员可以在保存前修改。DeepSeek 默认使用
`deepseek-v4-flash`，并提供 `deepseek-v4-pro`；不要再为新配置使用即将退役的
`deepseek-chat` 和 `deepseek-reasoner`。

## 路由行为

应用继续请求 EZdeploy 的稳定模型别名：

- `default-chat`：路由到已启用的默认 Chat Provider；
- `embedding`：当前继续使用 Cloudflare Workers AI。

未配置自定义 Provider 时，`default-chat` 也继续使用 Cloudflare Workers AI，因此
升级管理功能不会中断现有应用。

## 密钥安全

Provider API Key 通过 TLS 发送到 AI Proxy，并使用独立的
`AI_PROVIDER_ENCRYPTION_KEY` 进行 AES-256-GCM 加密后保存到 D1。管理 API 和页面只
返回“已配置”和末四位，完整密钥不会回显、写入应用环境或进入 Agent 上下文。

用于代理管理请求的 `AI_ADMIN_TOKEN` 仅保存在应用中心 Worker Secret 中，并与 AI
Proxy 的 `CONTROL_PLANE_TOKEN` 对应。只有通过 EZdeploy 单管理员账号登录、持有有效
安全会话的请求可以调用管理接口。

## 添加自定义 Provider

自定义 Provider 必须：

1. 提供 HTTPS Base URL；
2. 支持 OpenAI-compatible `POST /chat/completions`；
3. 使用 `Authorization: Bearer <API_KEY>`；
4. 建议支持 `GET /models`，以便管理页面执行无推理费用的连接测试。

保存后点击“测试”。测试成功并设为默认后，新的 `default-chat` 请求会立即路由到该
Provider，不需要重新部署业务应用。
