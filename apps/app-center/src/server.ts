#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { ControlPlaneRepository } from "@ezdeploy/core";

export interface AppCenterOptions {
  apiToken?: string;
  trustCloudflareAccess?: boolean;
}

const page = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>EZdeploy 应用中心</title><style>
:root{font-family:Inter,ui-sans-serif,system-ui;color:#17211b;background:#f3f7f3}body{margin:0}.shell{max-width:1080px;margin:auto;padding:48px 24px}h1{font-size:34px;margin:0 0 8px}.sub{color:#607067;margin-bottom:30px}.bar{display:flex;gap:8px;margin:20px 0}.bar input{flex:1;padding:11px;border:1px solid #cbd7ce;border-radius:9px}.bar button{border:0;border-radius:9px;background:#19713e;color:white;padding:0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}.card{background:#fff;border:1px solid #dce7de;border-radius:14px;padding:20px;box-shadow:0 5px 18px #193b2310}.meta{font-size:13px;color:#708077;margin-top:4px}.status{display:inline-block;padding:3px 8px;background:#dff4e5;color:#126334;border-radius:99px;font-size:12px}.versions{font-size:12px;color:#52645a;margin-top:14px}.versions ul{list-style:none;padding:0;margin:6px 0}.versions li{display:flex;justify-content:space-between;border-top:1px solid #edf2ee;padding:5px 0}.card a{display:inline-block;margin-top:10px;color:#126334;font-weight:650}.empty{padding:30px;background:white;border-radius:14px}.error{color:#a52a2a}</style></head>
<body><main class="shell"><h1>企业应用中心</h1><div class="sub">由 EZdeploy 发布并验证的内部应用</div><div id="login" class="bar"><input id="token" type="password" placeholder="本地模式 API Token（Cloudflare Access 模式无需填写）"><button onclick="load()">进入</button></div><div id="message"></div><section id="apps" class="grid"></section></main>
<script>async function load(){const token=document.querySelector('#token').value;const headers=token?{authorization:'Bearer '+token}:{};const r=await fetch('/api/apps',{headers});if(!r.ok){document.querySelector('#message').innerHTML='<p class="error">无权访问，请登录企业身份或填写 API Token。</p>';return}const rows=await r.json();document.querySelector('#login').style.display='none';document.querySelector('#message').innerHTML=rows.length?'':'<div class="empty">暂无已发布应用</div>';document.querySelector('#apps').innerHTML=rows.map(x=>'<article class="card"><span class="status">'+esc(x.deployment?.status||'未发布')+'</span><h2>'+esc(x.application.displayName)+'</h2><div class="meta">负责人：'+esc(x.application.ownerId)+'</div><div class="meta">环境：'+esc(x.environment.name)+' · 访问：'+esc(x.access?.mode||'未配置')+'</div><div class="meta">能力：'+(x.resources.map(r=>esc(r.kind)).join(' · ')||'无')+'</div><div class="versions"><strong>最近版本</strong><ul>'+x.recentDeployments.slice(0,5).map(d=>'<li><span>#'+d.sequence+'</span><span>'+esc(d.status)+'</span></li>').join('')+'</ul></div>'+(x.deployment?.url?'<a href="'+encodeURI(x.deployment.url)+'" target="_blank" rel="noreferrer">打开应用 →</a>':'')+'</article>').join('')}function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}load()</script></body></html>`;

function authorized(request: IncomingMessage, options: AppCenterOptions): boolean {
  if (options.trustCloudflareAccess) {
    return typeof request.headers["cf-access-authenticated-user-email"] === "string";
  }
  const authorization = request.headers.authorization;
  return Boolean(options.apiToken && authorization === `Bearer ${options.apiToken}`);
}

export function createAppCenterServer(
  repository: ControlPlaneRepository,
  options: AppCenterOptions,
) {
  return createServer((request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("cache-control", "no-store");
    if (request.method === "GET" && request.url === "/health") {
      return send(response, 200, "application/json", JSON.stringify({ status: "ok" }));
    }
    if (request.method === "GET" && request.url === "/") {
      return send(response, 200, "text/html; charset=utf-8", page);
    }
    if (request.method === "GET" && request.url === "/api/apps") {
      if (!authorized(request, options)) {
        return send(response, 401, "application/json", JSON.stringify({ error: "unauthorized" }));
      }
      return send(response, 200, "application/json", JSON.stringify(repository.listCatalog()));
    }
    return send(response, 404, "application/json", JSON.stringify({ error: "not_found" }));
  });
}

function send(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.statusCode = status;
  response.setHeader("content-type", contentType);
  response.end(body);
}

function main(): void {
  const repository = new ControlPlaneRepository(
    path.resolve(process.env.ZAODEPLOY_DATABASE_PATH ?? ".zaodeploy/control-plane.db"),
  );
  const server = createAppCenterServer(repository, {
    apiToken: process.env.ZAODEPLOY_APP_CENTER_TOKEN,
    trustCloudflareAccess: process.env.ZAODEPLOY_TRUST_CLOUDFLARE_ACCESS === "true",
  });
  server.listen(Number(process.env.PORT ?? 8788), process.env.HOST ?? "127.0.0.1");
  const shutdown = () => server.close(() => repository.close());
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
