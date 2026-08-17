# 个人管理员账号

EZdeploy 只保留一个个人管理员账号，不提供员工注册、多账号、团队、角色或成员邀请。
公开首页无需登录；应用目录、AI 部署、AI Provider 设置和管理 API 均需要管理员会话。

## 首次设置

首次打开 `/center` 时，如果 D1 中尚未创建管理员，EZdeploy 会跳转到 `/setup`：

1. 设置唯一的管理员账号；
2. 设置至少 10 个字符的密码并再次确认；
3. 创建成功后自动登录并进入个人应用中心。

管理员创建后 `/setup` 永久关闭并跳转到 `/login`。数据库约束只允许存在一条管理员
记录，因此并发请求也不能创建第二个账号。

## 登录与会话

密码通过 PBKDF2-HMAC-SHA256 和独立随机盐派生后保存，D1 不保存明文密码。登录成功
后生成随机会话令牌；浏览器仅通过 `HttpOnly; Secure; SameSite=Lax` Cookie 保存令牌，
D1 只保存令牌哈希。会话默认 30 天过期，退出登录会立即删除当前会话。

所有写操作都要求同源 `Origin`，登录失败按来源 IP 做 15 分钟窗口限速。管理员账号
只决定应用中心登录名；部署所有权使用 Worker 配置中的固定 `OWNER_ID`，避免改名或
历史数据造成应用所有权漂移。

## 忘记密码

当前版本不提供邮件找回，因为系统没有第二个身份源。管理员遗忘密码时，需要由
Cloudflare 账号所有者直接在 D1 中删除 `personal_admin` 和 `personal_sessions` 记录，
然后重新访问 `/setup`。执行前应先备份 D1；应用与部署记录不会随管理员记录删除。

## Cloudflare Access

应用中心本身不再依赖 Cloudflare Access，也不会读取
`cf-access-authenticated-user-email`。如果某个已部署应用需要额外保护，仍可选择性地
为该应用配置 Cloudflare Access；这与 EZdeploy 管理员登录是两个独立的安全边界。
