import {
  adminConfigured,
  authenticateAdmin,
  loginAdmin,
  logoutAdmin,
  requestHasSameOrigin,
  setupAdmin,
} from "./auth.js";
import { applicationPage, authPage, landingPage } from "./ui.js";

interface Env {
  DB: D1Database;
  AI_PROXY?: Fetcher;
  CONTROL_PLANE_URL: string;
  AGENT_GATEWAY_URL: string;
  AI_PROXY_URL: string;
  AI_ADMIN_TOKEN: string;
  OWNER_ID: string;
}

const responseHeaders = {
  "cache-control": "no-store",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
};

const legacyPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EZdeploy 个人应用中心</title>
  <style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172019;background:#f3f5f2;--ink:#172019;--muted:#667168;--line:#dce2dc;--surface:#fff;--accent:#17743d;--accent-soft:#e2f3e7}
    *{box-sizing:border-box}body{margin:0;min-height:100vh}button,input{font:inherit}button{cursor:pointer}
    .layout{display:grid;grid-template-columns:248px 1fr;min-height:100vh}
    .sidebar{background:#0b1710;color:#e9f4ec;padding:28px 20px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}
    .brand{font-size:19px;font-weight:760;letter-spacing:-.02em;padding:4px 10px 30px}.brand span{color:#78e59a}
    nav{display:grid;gap:4px}.nav{border:0;background:transparent;color:#8fa096;text-align:left;padding:11px 12px;border-radius:9px;transition:.16s ease}.nav:hover,.nav.active{background:#14271a;color:white;transform:translateX(2px)}
    .identity{margin-top:auto;border-top:1px solid #243329;padding:18px 10px 0;font-size:12px;color:#91a298;word-break:break-all}
    main{padding:46px 5vw 72px;max-width:1320px;width:100%}.view{display:none;animation:enter .24s ease both}.view.active{display:block}
    @keyframes enter{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    header{display:flex;justify-content:space-between;align-items:end;gap:24px;padding-bottom:26px;border-bottom:1px solid var(--line)}
    h1{font-size:34px;letter-spacing:-.035em;margin:0 0 6px}header p{margin:0;color:var(--muted)}
    .button{border:0;border-radius:9px;padding:11px 15px;font-weight:680;transition:.16s ease}.button:hover{transform:translateY(-1px)}
    .primary{background:var(--accent);color:white}.secondary{background:#e8ece8;color:var(--ink)}.danger{background:#f8e8e8;color:#a52d2d}
    .toolbar{display:flex;gap:10px;margin:24px 0}.search{width:min(440px,100%);border:1px solid var(--line);background:white;border-radius:9px;padding:11px 13px}
    .apps{border-top:1px solid var(--line)}.app{display:grid;grid-template-columns:minmax(220px,1.3fr) minmax(180px,.8fr) minmax(180px,.8fr) 120px;gap:24px;align-items:center;padding:22px 4px;border-bottom:1px solid var(--line);transition:.16s ease}.app:hover{padding-left:10px;background:#eef2ee}
    .app h2{font-size:17px;margin:0 0 5px}.meta,.small{font-size:13px;color:var(--muted)}.caps{display:flex;gap:6px;flex-wrap:wrap}.cap{font-size:11px;background:#e3e8e3;padding:4px 7px;border-radius:5px}.ready{color:#14733a;font-weight:700}.open{color:var(--accent);text-decoration:none;font-weight:720;text-align:right}
    .connect-grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:48px;margin-top:34px}.steps{counter-reset:step}.step{display:grid;grid-template-columns:34px 1fr;gap:15px;padding:24px 0;border-bottom:1px solid var(--line)}.step:before{counter-increment:step;content:counter(step);width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:var(--ink);color:white;font-size:12px}.step h2{font-size:17px;margin:3px 0 6px}.step p{margin:0;color:var(--muted);line-height:1.6;font-size:14px}
    .connections{background:var(--surface);padding:24px;border-radius:14px;align-self:start;position:sticky;top:38px}.connections h2{font-size:17px;margin:0}.connection{padding:16px 0;border-bottom:1px solid var(--line);display:grid;gap:7px}.connection:last-child{border:0}.connection-head{display:flex;justify-content:space-between;gap:12px}.connection button{border:0;background:none;color:#ad3333;padding:0;font-size:12px}.empty{padding:32px 0;color:var(--muted)}
    dialog{border:0;border-radius:16px;padding:0;width:min(720px,calc(100% - 32px));box-shadow:0 28px 80px #08150b44}dialog::backdrop{background:#07100a99;backdrop-filter:blur(4px)}.modal{padding:28px}.modal h2{margin:0 0 8px;font-size:24px}.modal>p{color:var(--muted);margin:0 0 22px}.key{display:flex;gap:8px;background:#101c14;color:#c7f4d4;padding:13px;border-radius:9px}.key code{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}.copy{border:0;border-radius:6px;background:#2e7042;color:white;padding:6px 10px}.prompt{width:100%;height:210px;margin-top:14px;border:1px solid var(--line);border-radius:9px;padding:13px;resize:vertical;line-height:1.5;background:#f7f9f7}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
    .notice{margin-top:18px;padding:12px 14px;border-left:3px solid #d39a26;background:#fff9e8;color:#70520f;font-size:13px}
    @media(max-width:900px){.layout{grid-template-columns:1fr}.sidebar{position:static;height:auto;padding:16px;flex-direction:row;align-items:center;gap:14px}.brand{padding:0}.identity{display:none}nav{display:flex;margin-left:auto}.connect-grid{grid-template-columns:1fr}.connections{position:static}.app{grid-template-columns:1fr 1fr}.open{text-align:left}}@media(max-width:560px){main{padding:28px 20px}.nav{font-size:0}.nav:after{content:attr(data-short);font-size:13px}.app{grid-template-columns:1fr}header{align-items:start;flex-direction:column}.connect-grid{gap:24px}}
  </style>
</head>
<body>
<div class="layout">
  <aside class="sidebar">
    <div class="brand"><span>EZ</span>deploy</div>
    <nav>
      <button class="nav active" data-view="catalog" data-short="应用">我的应用</button>
      <button class="nav" data-view="connect" data-short="部署">让 AI 帮你部署</button>
    </nav>
    <div class="identity" id="identity">正在读取登录身份…</div>
  </aside>
  <main>
    <section class="view active" id="catalog">
      <header><div><h1>我的应用</h1><p>查找并打开你已经发布的应用。</p></div></header>
      <div class="toolbar"><input class="search" id="search" placeholder="搜索应用、负责人或能力"></div>
      <div class="apps" id="apps"><div class="empty">正在读取应用目录…</div></div>
    </section>
    <section class="view" id="connect">
      <header>
        <div><h1>让 AI 帮你部署</h1><p>复制一段提示词给 Codex、WorkBuddy 或其他编码 Agent，无需提前安装或配置 MCP。</p></div>
        <button class="button primary" id="create">生成部署提示词</button>
      </header>
      <div class="connect-grid">
        <div class="steps">
          <div class="step"><div><h2>生成一次性连接码</h2><p>连接码与你的管理员身份绑定，2 小时内有效且只能兑换一次。</p></div></div>
          <div class="step"><div><h2>复制整段提示词</h2><p>提示词包含公开部署说明 URL 和一次性连接码，直接发送给正在处理项目的 Agent。</p></div></div>
          <div class="step"><div><h2>确认部署计划</h2><p>Agent 会读取说明、分析项目并展示运行时、资源和访问范围；确认后完成部署。</p></div></div>
          <div class="step"><div><h2>获得应用链接</h2><p>只有健康检查通过后，Agent 才会返回你的应用域名下的正式访问链接。</p></div></div>
          <div class="notice">连接码不是长期密钥。Agent 兑换后得到的短期凭证不得写入项目文件、构建产物或聊天回复。</div>
        </div>
        <aside class="connections">
          <h2>最近 Agent 会话</h2>
          <div id="connections"><div class="empty">正在读取…</div></div>
        </aside>
      </div>
    </section>
  </main>
</div>
<dialog id="keyDialog"><div class="modal">
  <h2>部署提示词已生成</h2>
  <p>一次性连接码 2 小时内有效且只能使用一次。推荐直接复制下方整段提示词。</p>
  <div class="key"><code id="keyValue"></code><button class="copy" data-copy="keyValue">复制连接码</button></div>
  <textarea class="prompt" id="agentPrompt" readonly></textarea>
  <div class="modal-actions"><button class="button secondary" data-copy="agentPrompt">复制给 Agent</button><button class="button primary" id="done">完成</button></div>
</div></dialog>
<script>
const state={apps:[],me:null};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
document.querySelectorAll('.nav').forEach(button=>button.onclick=()=>{document.querySelectorAll('.nav,.view').forEach(x=>x.classList.remove('active'));button.classList.add('active');document.querySelector('#'+button.dataset.view).classList.add('active');history.replaceState(null,'','#'+button.dataset.view)});
if(location.hash==='#connect')document.querySelector('[data-view=connect]').click();
async function loadMe(){const r=await fetch('/api/me');state.me=await r.json();document.querySelector('#identity').textContent=state.me.username;await loadConnections()}
async function loadApps(){state.apps=await fetch('/api/apps').then(r=>r.json());drawApps()}
function drawApps(){const q=document.querySelector('#search').value.toLowerCase();const rows=state.apps.filter(x=>JSON.stringify(x).toLowerCase().includes(q));document.querySelector('#apps').innerHTML=rows.length?rows.map(x=>'<article class="app"><div><h2>'+esc(x.application.displayName)+'</h2><div class="meta">'+esc(x.application.description||x.application.slug)+'</div></div><div><div class="small">负责人</div>'+esc(x.application.ownerId)+'</div><div><div class="small">状态与能力</div><span class="ready">'+esc(x.deployment?.status||'未发布')+'</span><div class="caps">'+x.resources.map(r=>'<span class="cap">'+esc(r.kind)+'</span>').join('')+'</div></div>'+(x.deployment?.url?'<a class="open" href="'+encodeURI(x.deployment.url)+'" target="_blank">打开应用 →</a>':'<span></span>')+'</article>').join(''):'<div class="empty">暂无符合条件的应用</div>'}
document.querySelector('#search').oninput=drawApps;
async function loadConnections(){const rows=await fetch('/api/connections').then(r=>r.json());document.querySelector('#connections').innerHTML=rows.length?rows.map(x=>'<div class="connection"><div class="connection-head"><strong>'+esc(x.label||'Agent 会话')+'</strong><button onclick="revokeConnection(\\''+x.id+'\\')">撤销</button></div><div class="small">创建于 '+new Date(x.createdAt).toLocaleString()+'</div><div class="small">'+(x.expiresAt?'有效至 '+new Date(x.expiresAt).toLocaleString():(x.lastUsedAt?'最近使用 '+new Date(x.lastUsedAt).toLocaleString():'长期连接'))+'</div></div>').join(''):'<div class="empty">暂无有效 Agent 会话</div>'}
document.querySelector('#create').onclick=async()=>{const r=await fetch('/api/connect-codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:'Codex / WorkBuddy'})});const data=await r.json();if(!r.ok)return alert(data.error?.message||'创建失败');document.querySelector('#keyValue').textContent=data.connectCode;document.querySelector('#agentPrompt').value=data.agentPrompt;document.querySelector('#keyDialog').showModal();await loadConnections()};
async function revokeConnection(id){if(!confirm('撤销后，使用这枚 Key 的 Agent 将立即无法部署。继续吗？'))return;await fetch('/api/connections/'+id,{method:'DELETE'});await loadConnections()}
document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{const target=document.querySelector('#'+button.dataset.copy);await navigator.clipboard.writeText(target.value??target.textContent);const old=button.textContent;button.textContent='已复制';setTimeout(()=>button.textContent=old,1200)});
document.querySelector('#done').onclick=()=>document.querySelector('#keyDialog').close();
Promise.all([loadMe(),loadApps()]).catch(error=>{document.querySelector('#apps').innerHTML='<div class="empty">加载失败：'+esc(error.message)+'</div>'});
</script>
</body></html>`;

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: responseHeaders });
}

async function proxyAiAdmin(request: Request, env: Env, upstreamPath: string): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${env.AI_ADMIN_TOKEN}` });
  if (request.headers.get("content-type")) headers.set("content-type", request.headers.get("content-type")!);
  const init: RequestInit = {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
  };
  const response = env.AI_PROXY
    ? await env.AI_PROXY.fetch(new Request(`https://ai-proxy.internal${upstreamPath}`, init))
    : await fetch(`${env.AI_PROXY_URL}${upstreamPath}`, init);
  return new Response(response.body, {
    status: response.status,
    headers: { ...responseHeaders, "content-type": response.headers.get("content-type") ?? "application/json" },
  });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function connectionKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `zao_${encoded}`;
}

export function createConnectCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const part = (offset: number) => [...bytes.slice(offset, offset + 4)]
    .map((byte) => alphabet[byte % alphabet.length]).join("");
  return `ZAO-${part(0)}-${part(4)}`;
}

async function listApps(env: Env) {
  const result = await env.DB.prepare(`SELECT a.id,a.slug,a.display_name,a.description,a.owner_id,e.id AS environment_id,e.name AS environment_name,
    d.status,d.url,d.sequence,d.updated_at FROM cloud_applications a JOIN cloud_environments e ON e.application_id=a.id
    LEFT JOIN cloud_deployments d ON d.id=e.active_deployment_id WHERE e.deleted_at IS NULL ORDER BY a.display_name`).all<Record<string, unknown>>();
  const output = [];
  for (const row of result.results) {
    const resources = await env.DB.prepare("SELECT kind FROM cloud_resources WHERE application_id=? AND environment_id=? ORDER BY kind")
      .bind(row.id, row.environment_id).all<{ kind: string }>();
    const versions = await env.DB.prepare("SELECT d.id,d.sequence,d.status,d.url,d.created_at,d.updated_at FROM cloud_deployments d WHERE d.environment_id=? ORDER BY d.sequence DESC LIMIT 5")
      .bind(row.environment_id).all();
    const policy = await env.DB.prepare("SELECT mode,allowed_groups_json FROM cloud_access_policies WHERE application_id=? AND environment_id=?")
      .bind(row.id, row.environment_id).first<{ mode: string; allowed_groups_json: string }>();
    output.push({
      application: { id: row.id, slug: row.slug, displayName: row.display_name, description: row.description, ownerId: row.owner_id },
      environment: { name: row.environment_name },
      deployment: row.url ? { status: row.status, url: row.url, sequence: row.sequence, updatedAt: row.updated_at } : null,
      access: policy ? { mode: policy.mode, allowedGroups: JSON.parse(policy.allowed_groups_json) } : null,
      resources: resources.results,
      recentDeployments: versions.results,
    });
  }
  return output;
}

export function buildAgentPrompt(code: string, env: Pick<Env, "AGENT_GATEWAY_URL">): string {
  return `请把当前项目部署到我的 EZdeploy 个人应用中心。

部署说明：
${env.AGENT_GATEWAY_URL}/agent.md

一次性连接码：
${code}

请先读取部署说明并分析当前项目，创建或更新 ezdeploy.yaml，然后向我展示简洁的部署计划，包括：
- 应用名称与运行时
- 需要的数据库、对象存储和 AI 能力
- 公开访问或受保护访问

我确认后，请按照说明完成构建、部署、自定义域激活和健康检查，并返回我的应用域名下可访问的正式应用链接。

在我确认部署计划之前，不要兑换连接码或开始部署。确认后必须使用计划返回的 planDigest，确保部署内容与我看到的计划一致。

不要把连接码或兑换得到的短期凭证写入项目文件、构建产物或最终回复。`;
}

export function buildPersistentAgentPrompt(key: string, env: Pick<Env, "AGENT_GATEWAY_URL">): string {
  return `请为我安装并配置 EZdeploy Deployment Skill。以后当我说“部署到应用中心”、“发布到 EZdeploy”、“上线这个应用”或意思相近的话时，直接使用这个 Skill。

安装与部署说明：
${env.AGENT_GATEWAY_URL}/agent.md

Skill：
${env.AGENT_GATEWAY_URL}/skill/ezdeploy-deploy/SKILL.md

我的长期部署 Key：
${key}

请把 Skill 安装到当前 Agent 的个人 Skill 目录，并把 API 地址与 Key 保存到用户级凭证目录；权限必须仅限当前用户。不要把 Key 写入项目、源码、构建产物、日志或最终回复。

安装完成后请告诉我已支持哪些触发语。以后部署时先分析项目并展示部署计划，等我确认后再构建和发布，最终返回健康检查通过的应用链接。`;
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return json({ status: "ok", service: "ezdeploy-app-center" });
    if (url.pathname === "/") return new Response(landingPage, { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });

    if (url.pathname === "/api/auth/status" && request.method === "GET") {
      const admin = await authenticateAdmin(request, env);
      return json({ configured: await adminConfigured(env), authenticated: Boolean(admin), username: admin?.username });
    }
    if (url.pathname === "/setup" && request.method === "GET") {
      if (await adminConfigured(env)) return Response.redirect(new URL("/login", url), 302);
      return new Response(authPage("setup"), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/login" && request.method === "GET") {
      const admin = await authenticateAdmin(request, env);
      if (admin) return Response.redirect(new URL("/center", url), 302);
      if (!await adminConfigured(env)) return Response.redirect(new URL("/setup", url), 302);
      return new Response(authPage("login"), { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (["/api/auth/setup", "/api/auth/login", "/api/auth/logout"].includes(url.pathname)) {
      if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "POST required" } }, 405);
      if (!requestHasSameOrigin(request)) return json({ error: { code: "FORBIDDEN", message: "Same-origin request required" } }, 403);
      if (url.pathname === "/api/auth/logout") {
        return new Response(JSON.stringify({ loggedOut: true }), {
          headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": await logoutAdmin(request, env) },
        });
      }
      const input = await request.json<{ username?: string; password?: string }>()
        .catch((): { username?: string; password?: string } => ({}));
      try {
        if (url.pathname === "/api/auth/setup") {
          const result = await setupAdmin(env, input.username?.trim() ?? "", input.password ?? "");
          return new Response(JSON.stringify({ username: result.admin.username }), {
            status: 201,
            headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": result.setCookie },
          });
        }
        const result = await loginAdmin(request, env, input.username?.trim() ?? "", input.password ?? "");
        if (!result) return json({ error: { code: "INVALID_CREDENTIALS", message: "账号或密码不正确" } }, 401);
        return new Response(JSON.stringify({ username: result.admin.username }), {
          headers: { ...responseHeaders, "content-type": "application/json", "set-cookie": result.setCookie },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "认证失败";
        return json({ error: { code: message.includes("尝试过多") ? "RATE_LIMITED" : "AUTH_FAILED", message } }, message.includes("尝试过多") ? 429 : 400);
      }
    }

    const admin = await authenticateAdmin(request, env);
    if (!admin) {
      if (!url.pathname.startsWith("/api/")) {
        return Response.redirect(new URL(await adminConfigured(env) ? "/login" : "/setup", url), 302);
      }
      return json({ error: { code: "UNAUTHORIZED", message: "Administrator login required" } }, 401);
    }
    if (!["GET", "HEAD"].includes(request.method) && !requestHasSameOrigin(request)) {
      return json({ error: { code: "FORBIDDEN", message: "Same-origin request required" } }, 403);
    }
    if (["/center", "/deploy", "/settings/ai"].includes(url.pathname)) {
      return new Response(applicationPage, { headers: { ...responseHeaders, "content-type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/api/apps") return json(await listApps(env));
    if (url.pathname === "/api/me") return json({ username: admin.username, administrator: true });
    if (url.pathname.startsWith("/api/ai/providers")) {
      return proxyAiAdmin(request, env, url.pathname.replace("/api/ai", "/admin/v1"));
    }

    if (url.pathname === "/api/connections" && request.method === "GET") {
      const rows = await env.DB.prepare(`SELECT id,label,created_at,last_used_at,expires_at,token_kind FROM cloud_agent_tokens
        WHERE owner_id=? AND active=1 AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC`)
        .bind(admin.ownerId, new Date().toISOString()).all<Record<string, unknown>>();
      return json(rows.results.map((row) => ({
        id: row.id, label: row.label, createdAt: row.created_at, lastUsedAt: row.last_used_at,
        expiresAt: row.expires_at, kind: row.token_kind,
      })));
    }
    if (url.pathname === "/api/connect-codes" && request.method === "POST") {
      const input: { label?: string } = await request.json<{ label?: string }>().catch(() => ({}));
      const code = createConnectCode();
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
      await env.DB.prepare(`INSERT INTO cloud_connect_codes
        (id,code_hash,owner_id,label,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(
          crypto.randomUUID(),
          await sha256(code),
          admin.ownerId,
          input.label?.slice(0, 80) || "Codex / WorkBuddy",
          expiresAt,
          createdAt,
        ).run();
      return json({
        connectCode: code,
        documentationUrl: `${env.AGENT_GATEWAY_URL}/agent.md`,
        agentPrompt: buildAgentPrompt(code, env),
        expiresAt,
      }, 201);
    }
    if (url.pathname === "/api/connections" && request.method === "POST") {
      const count = await env.DB.prepare("SELECT count(*) AS value FROM cloud_agent_tokens WHERE owner_id=? AND active=1 AND token_kind='persistent'")
        .bind(admin.ownerId).first<{ value: number }>();
      if (Number(count?.value ?? 0) >= 5) return json({ error: { code: "LIMIT_REACHED", message: "最多保留 5 个有效连接，请先撤销旧连接" } }, 409);
      const input: { label?: string } = await request.json<{ label?: string }>().catch(() => ({}));
      const key = connectionKey();
      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      await env.DB.prepare(`INSERT INTO cloud_agent_tokens
        (id,token_hash,owner_id,label,active,created_at,expires_at,token_kind,scopes_json)
        VALUES (?,?,?,?,1,?,NULL,'persistent',?)`)
        .bind(
          id,
          await sha256(key),
          admin.ownerId,
          input.label?.slice(0, 80) || "Codex / WorkBuddy",
          createdAt,
          JSON.stringify(["plan", "deploy", "read", "logs", "manage"]),
        ).run();
      return json({
        id,
        connectionKey: key,
        documentationUrl: `${env.AGENT_GATEWAY_URL}/agent.md`,
        skillUrl: `${env.AGENT_GATEWAY_URL}/skill/ezdeploy-deploy/SKILL.md`,
        agentPrompt: buildPersistentAgentPrompt(key, env),
        createdAt,
        expiresAt: null,
      }, 201);
    }
    const match = /^\/api\/connections\/([0-9a-f-]{36})$/.exec(url.pathname);
    if (match && request.method === "DELETE") {
      await env.DB.prepare("UPDATE cloud_agent_tokens SET active=0 WHERE id=? AND owner_id=?")
        .bind(match[1], admin.ownerId).run();
      return json({ id: match[1], revoked: true });
    }
    return json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404);
  },
} satisfies ExportedHandler<Env>;
