# 企业账户与成员管理

EZdeploy 不保存员工密码。生产环境使用 Cloudflare Access 作为身份网关，
由企业现有身份系统验证员工，EZdeploy 只接收已经验证的邮箱身份。

## 当前身份链路

```text
员工打开 /center 或 /deploy
  -> Cloudflare Access
  -> 企业身份提供商或邮件一次性验证码
  -> Access 校验员工组
  -> 将已验证邮箱传给 EZdeploy
  -> EZdeploy 以邮箱记录应用所有者和 Agent 会话
```

公开首页 `/` 不需要登录。应用目录、部署页面和 `/api/*` 继续受 Access 保护。

## 如何让员工使用

### 小团队：邮件邀请

1. 在 Cloudflare Zero Trust 中启用 One-time PIN。
2. 打开 Access 规则组 `EZdeploy Employees`。
3. 将员工邮箱加入允许列表。
4. 把 `https://apps.example.com/center` 发给员工。
5. 员工输入企业邮箱并使用邮件验证码登录。

员工不需要在 EZdeploy 注册账号或设置另一套密码。只有已被 Access 策略允许的
邮箱会收到可用验证码。

### 正式企业：连接现有 SSO

推荐连接 Google Workspace、Microsoft Entra ID、Okta 或其他 OIDC/SAML 身份提供商，
然后让 Access 规则组引用企业目录中的员工组：

- `EZdeploy Users`：允许进入应用中心和发起部署；
- `EZdeploy Admins`：平台配置、成员和审计管理；
- 按部门建立的组：用于限制特定内部应用。

员工入职、离职和部门变更都在企业身份目录中处理。Access 会在登录时重新判断组
成员关系；从企业组移除员工即可撤销入口权限。

## 当前权限边界

当前线上版本已经具备：

- Access 负责登录和员工准入；
- 员工邮箱是应用与部署的所有者；
- 一次性连接码和短期 Agent 会话与员工邮箱绑定；
- 普通员工不能管理其他员工的部署；
- 控制面管理员使用独立管理凭证。

当前尚未提供 EZdeploy 页面内的成员邀请、角色切换和部门管理。第一版中成员准入
通过 Cloudflare Access 或企业 IdP 管理。

## 推荐的下一阶段角色

| 角色 | 建议权限 |
|---|---|
| Organization Admin | 成员、身份源、AI Provider、域名、配额和审计 |
| Developer | 部署应用，管理自己或所在团队的应用 |
| Viewer | 打开应用并查看目录，不能创建部署连接 |

建议后续增加 `organizations`、`members`、`teams` 和 `application_members`，但身份验证
仍交给 Access/SSO。EZdeploy 只管理授权关系，不保存密码。

## 管理员操作示例

应用中心的 Access Application 可以命名为 `ezdeploy-app-center`，并保护：

- `apps.example.com/center`
- `apps.example.com/deploy`
- `apps.example.com/api/*`

管理员在 Cloudflare Zero Trust 的 Access 规则组中增加员工邮箱或企业目录组后，
员工即可直接登录使用。
