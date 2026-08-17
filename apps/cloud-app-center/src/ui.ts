export const landingPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="EZdeploy 是零安装、Agent 可发现的个人应用部署与管理中心。">
  <title>EZdeploy — 一句话，部署你的应用</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;background:#fff;--blue:#0071e3;--blue-hover:#0077ed;--muted:#6e6e73;--surface:#f5f5f7;--line:#d2d2d7}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;overflow-x:hidden}a{color:inherit}button,a{-webkit-tap-highlight-color:transparent}
    .nav{height:48px;position:fixed;inset:0 0 auto;z-index:20;background:rgba(250,250,252,.78);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,.05)}
    .nav-inner{width:min(1040px,calc(100% - 40px));height:100%;margin:auto;display:flex;align-items:center;gap:34px;font-size:12px}
    .brand{font-weight:700;font-size:17px;letter-spacing:-.04em;text-decoration:none;margin-right:auto}.brand i{font-style:normal;color:var(--blue)}
    .nav-link{text-decoration:none;color:#424245;transition:color .2s}.nav-link:hover{color:#000}.nav-cta{background:#1d1d1f;color:#fff;padding:7px 14px;border-radius:999px;text-decoration:none}
    .hero{min-height:100svh;padding:116px 24px 64px;display:grid;align-content:center;text-align:center;background:radial-gradient(circle at 50% 72%,#dcecff 0,rgba(232,243,255,.65) 25%,rgba(255,255,255,0) 57%),#fff;position:relative}
    .eyebrow{font-size:21px;font-weight:650;letter-spacing:-.02em;margin:0 0 15px;animation:rise .7s ease both}.hero h1{font-size:clamp(54px,8vw,104px);line-height:.94;letter-spacing:-.07em;margin:0 auto;max-width:1120px;font-weight:720;animation:rise .8s .08s ease both}.hero h1 span{display:block;background:linear-gradient(90deg,#0071e3,#5e5ce6 55%,#af52de);-webkit-background-clip:text;color:transparent}
    .hero-copy{font-size:clamp(20px,2.2vw,28px);line-height:1.35;letter-spacing:-.025em;color:var(--muted);max-width:720px;margin:28px auto 0;animation:rise .8s .16s ease both}
    .actions{display:flex;justify-content:center;gap:14px;margin-top:32px;animation:rise .8s .24s ease both}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:999px;text-decoration:none;font-size:17px;transition:transform .2s,background .2s}.button:hover{transform:scale(1.025)}.button.primary{background:var(--blue);color:#fff}.button.primary:hover{background:var(--blue-hover)}.button.text{color:var(--blue);padding-inline:12px}.button.text:after{content:" ›";font-size:24px;margin-left:4px}
    .product-scene{width:min(1120px,94vw);height:min(480px,42vw);min-height:310px;margin:68px auto -150px;position:relative;perspective:1600px;animation:sceneIn 1.1s .25s cubic-bezier(.2,.8,.2,1) both}
    .window{position:absolute;inset:0;border-radius:24px;background:rgba(255,255,255,.9);box-shadow:0 45px 100px rgba(20,45,90,.18),0 2px 0 rgba(255,255,255,.9) inset;border:1px solid rgba(0,0,0,.08);overflow:hidden;text-align:left;transform:rotateX(2deg);backdrop-filter:blur(24px)}
    .window-bar{height:48px;display:flex;align-items:center;padding:0 18px;border-bottom:1px solid #e5e5e7;gap:7px}.dot{width:10px;height:10px;border-radius:50%;background:#ff5f57}.dot:nth-child(2){background:#febc2e}.dot:nth-child(3){background:#28c840}.window-title{font-size:12px;color:#86868b;margin:auto}
    .window-body{display:grid;grid-template-columns:190px 1fr;height:calc(100% - 48px)}.mock-nav{background:#f6f6f8;padding:30px 20px}.mock-logo{font-weight:700;margin-bottom:34px}.mock-line{height:9px;width:72%;border-radius:10px;background:#d9d9de;margin:19px 0}.mock-line.active{height:32px;width:100%;margin-left:-8px;background:#e5effc}
    .mock-main{padding:34px 38px}.mock-head{display:flex;justify-content:space-between;align-items:center}.mock-head strong{font-size:28px;letter-spacing:-.04em}.mock-search{width:190px;height:34px;border-radius:10px;background:#f1f1f3}.mock-apps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:30px}.mock-app{height:190px;border-radius:18px;background:#f7f7f9;padding:22px;transition:transform .3s}.mock-app:first-child{background:linear-gradient(145deg,#e8f2ff,#f8fbff)}.mock-app:nth-child(2){background:linear-gradient(145deg,#eeeafd,#faf9ff)}.mock-app:nth-child(3){background:linear-gradient(145deg,#e9f8ef,#f8fcf9)}.mock-icon{width:48px;height:48px;border-radius:13px;background:#1677ff;box-shadow:inset 0 0 0 1px rgba(255,255,255,.4)}.mock-app:nth-child(2) .mock-icon{background:#7259d9}.mock-app:nth-child(3) .mock-icon{background:#34a853}.mock-name{height:11px;width:70%;background:#252529;border-radius:8px;margin-top:25px}.mock-meta{height:8px;width:50%;background:#c8c8cd;border-radius:8px;margin-top:10px}
    .section{padding:190px 24px 130px}.section.soft{background:var(--surface)}.section-inner{width:min(1040px,100%);margin:auto}.kicker{color:#bf4800;font-weight:650;font-size:21px;margin-bottom:12px}.section h2{font-size:clamp(44px,6vw,72px);line-height:1;letter-spacing:-.055em;margin:0;max-width:850px}.lead{font-size:24px;line-height:1.45;color:var(--muted);max-width:720px;margin:26px 0 0}
    .flow{display:grid;grid-template-columns:repeat(4,1fr);margin-top:80px;border-top:1px solid var(--line)}.flow-item{padding:28px 24px 20px 0;border-right:1px solid var(--line);min-height:200px}.flow-item:not(:first-child){padding-left:24px}.flow-item:last-child{border-right:0}.flow-num{color:#86868b;font-size:13px}.flow-item h3{font-size:22px;letter-spacing:-.035em;margin:38px 0 9px}.flow-item p{color:var(--muted);line-height:1.55;margin:0;font-size:15px}
    .capability{display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center}.orbit{aspect-ratio:1;position:relative;display:grid;place-items:center}.orbit:before,.orbit:after{content:"";position:absolute;border:1px solid #d9d9de;border-radius:50%;inset:7%}.orbit:after{inset:25%;border-style:dashed}.core{width:150px;height:150px;border-radius:38px;background:#1d1d1f;color:white;display:grid;place-items:center;text-align:center;font-size:19px;font-weight:680;box-shadow:0 28px 60px #0002;z-index:2}.sat{position:absolute;width:94px;height:94px;border-radius:28px;background:#fff;box-shadow:0 18px 50px #00000012;display:grid;place-items:center;font-weight:650;font-size:14px}.sat.db{top:2%;left:41%}.sat.storage{right:1%;top:43%}.sat.auth{bottom:1%;left:41%}.sat.ai{left:1%;top:43%}
    .privacy{background:#000;color:#f5f5f7;text-align:center;padding:140px 24px}.privacy h2{font-size:clamp(48px,7vw,86px);letter-spacing:-.065em;line-height:.95;margin:0 auto;max-width:900px}.privacy p{font-size:23px;line-height:1.45;color:#a1a1a6;max-width:700px;margin:28px auto 0}.privacy strong{color:#fff}
    .final{padding:150px 24px;text-align:center}.final h2{font-size:clamp(48px,7vw,82px);letter-spacing:-.06em;margin:0}.final p{font-size:23px;color:var(--muted);margin:22px 0 32px}
    footer{background:var(--surface);padding:28px 24px;color:#6e6e73;font-size:12px}.footer-inner{width:min(1040px,100%);margin:auto;display:flex;justify-content:space-between;gap:20px;border-top:1px solid var(--line);padding-top:20px}
    @keyframes rise{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}@keyframes sceneIn{from{opacity:0;transform:translateY(70px) scale(.94)}to{opacity:1;transform:none}}
    @media(max-width:780px){.nav-link{display:none}.hero{padding-top:100px}.hero h1{font-size:57px}.hero-copy{font-size:20px}.product-scene{height:330px;margin-top:48px;margin-bottom:-90px}.window{border-radius:18px}.window-body{grid-template-columns:70px 1fr}.mock-nav{padding:25px 12px}.mock-logo,.mock-line{font-size:0}.mock-line{width:30px}.mock-main{padding:25px 18px}.mock-head strong{font-size:21px}.mock-search{display:none}.mock-apps{grid-template-columns:1fr 1fr}.mock-app{height:150px}.mock-app:nth-child(3){display:none}.section{padding:130px 24px 100px}.flow{grid-template-columns:1fr 1fr}.flow-item:nth-child(2){border-right:0}.flow-item{border-bottom:1px solid var(--line)}.capability{grid-template-columns:1fr;gap:40px}.orbit{order:-1}.footer-inner{display:block}.footer-inner span{display:block;margin-top:8px}}
    @media(max-width:480px){.actions{flex-direction:column;align-items:center}.flow{grid-template-columns:1fr}.flow-item{border-right:0!important;padding-left:0!important}.hero h1{font-size:42px;letter-spacing:-.055em}.section h2{font-size:43px}.lead{font-size:20px}}
    @media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
  </style>
</head>
<body>
  <nav class="nav"><div class="nav-inner">
    <a class="brand" href="/"><i>EZ</i>deploy</a>
    <a class="nav-link" href="#workflow">工作方式</a>
    <a class="nav-link" href="#capabilities">基础能力</a>
    <a class="nav-link" href="/deploy">Agent 部署</a>
    <a class="nav-cta" href="/center">管理员登录</a>
  </div></nav>

  <main>
    <section class="hero">
      <p class="eyebrow">你的个人应用部署中心</p>
      <h1>一句话，<span>把想法变成链接。</span></h1>
      <p class="hero-copy">无需安装部署工具，也不用反复配置云平台。把一段提示词交给 Codex、WorkBuddy 或其他编码 Agent，几分钟后获得属于你的应用链接。</p>
      <div class="actions"><a class="button primary" href="/center">进入我的应用中心</a><a class="button text" href="#workflow">了解如何工作</a></div>
      <div class="product-scene" aria-label="EZdeploy 应用中心预览">
        <div class="window">
          <div class="window-bar"><i class="dot"></i><i class="dot"></i><i class="dot"></i><span class="window-title">apps.example.com</span></div>
          <div class="window-body">
            <div class="mock-nav"><div class="mock-logo">EZdeploy</div><div class="mock-line active"></div><div class="mock-line"></div><div class="mock-line"></div></div>
            <div class="mock-main"><div class="mock-head"><strong>我的应用</strong><div class="mock-search"></div></div><div class="mock-apps"><div class="mock-app"><div class="mock-icon"></div><div class="mock-name"></div><div class="mock-meta"></div></div><div class="mock-app"><div class="mock-icon"></div><div class="mock-name"></div><div class="mock-meta"></div></div><div class="mock-app"><div class="mock-icon"></div><div class="mock-name"></div><div class="mock-meta"></div></div></div></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section soft" id="workflow"><div class="section-inner">
      <div class="kicker">零安装部署</div><h2>从当前项目，到在线应用。只差一次确认。</h2>
      <p class="lead">EZdeploy 把云资源、构建和发布流程收进一段可复制的提示词，同时把每一步部署计划清楚地交给你确认。</p>
      <div class="flow">
        <div class="flow-item"><span class="flow-num">01</span><h3>复制提示词</h3><p>登录个人应用中心，生成两小时内有效的一次性连接码。</p></div>
        <div class="flow-item"><span class="flow-num">02</span><h3>Agent 识别项目</h3><p>自动判断运行时、构建方式以及数据库、存储和 AI 需求。</p></div>
        <div class="flow-item"><span class="flow-num">03</span><h3>确认部署计划</h3><p>在创建资源之前，清楚看到访问范围、能力绑定与健康检查。</p></div>
        <div class="flow-item"><span class="flow-num">04</span><h3>获得应用链接</h3><p>域名和健康验证全部通过后，才向你返回正式访问地址。</p></div>
      </div>
    </div></section>

    <section class="section" id="capabilities"><div class="section-inner capability">
      <div><div class="kicker">共享基础能力</div><h2>应用需要什么，你只配置一次。</h2><p class="lead">数据库、对象存储、管理员登录和 AI Provider 由你的部署中心统一管理。每个应用只获得自己的最小权限凭证。</p></div>
      <div class="orbit" aria-hidden="true"><div class="sat db">数据库</div><div class="sat storage">对象存储</div><div class="core">EZdeploy<br>Control Plane</div><div class="sat auth">管理员登录</div><div class="sat ai">AI Provider</div></div>
    </div></section>

    <section class="privacy"><h2>主密钥只留在你的控制面。</h2><p>云平台和模型供应商凭证不会进入项目或聊天。每个应用获得<strong>可撤销、可审计、最小权限</strong>的运行时能力。</p></section>
    <section class="final"><h2>让下一次发布，只有一句话。</h2><p>登录个人应用中心，生成第一段部署提示词。</p><a class="button primary" href="/center">进入我的应用中心</a></section>
  </main>
  <footer><div class="footer-inner">EZdeploy · 开源个人应用部署中心 <span>Agent-native · Zero-install · Self-hostable</span></div></footer>
  <script>
    const scene=document.querySelector('.product-scene');
    addEventListener('scroll',()=>{if(!scene||matchMedia('(prefers-reduced-motion: reduce)').matches)return;const y=Math.min(scrollY,700);scene.style.transform='translateY('+(y*.045)+'px) scale('+(1-y*.000035)+')'}, {passive:true});
  </script>
</body></html>`;

export function authPage(mode: "setup" | "login"): string {
  const setup = mode === "setup";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${setup ? "设置管理员" : "管理员登录"} · EZdeploy</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;background:#f5f5f7;--blue:#0071e3;--muted:#6e6e73;--line:#d2d2d7}
    *{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;grid-template-rows:auto 1fr;background:radial-gradient(circle at 50% 30%,#fff 0,#f5f5f7 58%)}
    .topbar{height:56px;border-bottom:1px solid #0000000d;background:#ffffffc9;backdrop-filter:blur(20px)}.topbar-inner{width:min(1040px,calc(100% - 40px));height:100%;margin:auto;display:flex;align-items:center;justify-content:space-between}.brand{font-size:18px;font-weight:720;letter-spacing:-.045em;text-decoration:none;color:inherit}.brand i{font-style:normal;color:var(--blue)}.back{font-size:13px;color:var(--muted);text-decoration:none}.back:hover{color:#1d1d1f}
    main{display:grid;place-items:center;padding:48px 20px 80px}.card{width:min(440px,100%);background:#fffc;border:1px solid #ffffffb8;border-radius:26px;padding:38px;box-shadow:0 26px 80px #0000000d;backdrop-filter:blur(24px)}
    .mark{width:50px;height:50px;border-radius:15px;background:#1d1d1f;color:#fff;display:grid;place-items:center;font-weight:760;font-size:18px;letter-spacing:-.04em;margin-bottom:26px}.eyebrow{color:#bf4800;font-weight:650;font-size:13px;margin:0 0 9px}.card h1{font-size:34px;line-height:1.04;letter-spacing:-.05em;margin:0}.intro{color:var(--muted);line-height:1.55;font-size:15px;margin:13px 0 28px}
    .field{display:grid;gap:7px;margin-top:17px}.field label{font-size:13px;font-weight:600}.field input{width:100%;height:48px;border:1px solid var(--line);border-radius:12px;padding:0 14px;background:#fff;outline:none;font-size:16px}.field input:focus{border-color:var(--blue);box-shadow:0 0 0 3px #0071e326}.hint{font-size:12px;color:var(--muted);line-height:1.45}
    .submit{width:100%;height:48px;border:0;border-radius:999px;background:var(--blue);color:#fff;font-weight:650;font-size:16px;margin-top:25px;cursor:pointer}.submit:hover{background:#0077ed}.submit:disabled{opacity:.55;cursor:wait}.error{min-height:20px;color:#d70015;font-size:13px;line-height:1.45;margin-top:14px;text-align:center}.privacy{text-align:center;color:#86868b;font-size:11px;line-height:1.5;margin:20px 14px 0}
    @media(max-width:520px){main{padding:28px 14px 60px;align-items:start}.card{padding:28px 22px;border-radius:22px}.card h1{font-size:30px}}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner"><a class="brand" href="/"><i>EZ</i>deploy</a><a class="back" href="/">返回首页</a></div></header>
  <main><section class="card" aria-labelledby="auth-title">
    <div class="mark" aria-hidden="true">EZ</div>
    <p class="eyebrow">${setup ? "FIRST-TIME SETUP" : "PERSONAL ADMIN"}</p>
    <h1 id="auth-title">${setup ? "创建你的管理员账号" : "欢迎回来"}</h1>
    <p class="intro">${setup ? "这是此部署中心唯一的管理账号。设置完成后，你可以管理应用、部署连接和 AI Provider。" : "登录你的个人应用中心，继续部署和管理应用。"}</p>
    <form id="authForm">
      <div class="field"><label for="username">管理员账号</label><input id="username" name="username" autocomplete="username" minlength="3" maxlength="48" required autofocus></div>
      <div class="field"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="${setup ? "new-password" : "current-password"}" minlength="10" maxlength="200" required>${setup ? '<div class="hint">至少 10 个字符。密码只用于生成不可逆派生值，不会明文保存。</div>' : ""}</div>
      ${setup ? '<div class="field"><label for="confirm">确认密码</label><input id="confirm" name="confirm" type="password" autocomplete="new-password" minlength="10" maxlength="200" required></div>' : ""}
      <button class="submit" id="submit" type="submit">${setup ? "完成设置并进入" : "登录"}</button>
      <div class="error" id="error" role="alert" aria-live="polite"></div>
    </form>
    <p class="privacy">会话使用 HttpOnly 安全 Cookie，密码和会话令牌均不会明文写入数据库。</p>
  </section></main>
  <script>
    const setup=${JSON.stringify(setup)};
    const form=document.querySelector('#authForm');const error=document.querySelector('#error');const button=document.querySelector('#submit');
    form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';const username=document.querySelector('#username').value.trim();const password=document.querySelector('#password').value;if(setup&&password!==document.querySelector('#confirm').value){error.textContent='两次输入的密码不一致';return}button.disabled=true;button.textContent=setup?'正在创建…':'正在登录…';try{const response=await fetch(setup?'/api/auth/setup':'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username,password})});const data=await response.json();if(!response.ok)throw Error(data.error?.message||'操作失败');location.href='/center'}catch(reason){error.textContent=reason.message||'操作失败';button.disabled=false;button.textContent=setup?'完成设置并进入':'登录'}});
  </script>
</body></html>`;
}

export const applicationPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>EZdeploy 应用中心</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#1d1d1f;background:#f5f5f7;--blue:#0071e3;--muted:#6e6e73;--line:#d2d2d7;--surface:rgba(255,255,255,.84);--green:#248a3d}
    *{box-sizing:border-box}body{margin:0;min-height:100vh}button,input,textarea{font:inherit}button{cursor:pointer}a{color:inherit}
    .topbar{height:56px;position:sticky;top:0;z-index:20;background:rgba(250,250,252,.8);backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid rgba(0,0,0,.06)}
    .topbar-inner{width:min(1180px,calc(100% - 40px));height:100%;margin:auto;display:flex;align-items:center;gap:28px}.brand{font-size:18px;font-weight:720;letter-spacing:-.045em;text-decoration:none}.brand i{font-style:normal;color:var(--blue)}
    .nav{display:flex;gap:6px}.nav a{text-decoration:none;font-size:13px;color:#515154;padding:7px 12px;border-radius:999px;transition:.2s}.nav a:hover,.nav a.active{background:#e8e8ed;color:#1d1d1f}.account{margin-left:auto;display:flex;align-items:center;gap:10px}.identity{font-size:12px;color:var(--muted);max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.logout{border:0;background:none;color:#515154;font-size:12px;padding:7px 9px;border-radius:999px}.logout:hover,.logout:focus-visible{background:#e8e8ed;outline:none}
    main{width:min(1180px,calc(100% - 40px));margin:auto;padding:64px 0 100px}.view{display:none;animation:enter .35s ease both}.view.active{display:block}@keyframes enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
    .page-head{display:flex;align-items:end;justify-content:space-between;gap:32px;margin-bottom:38px}.eyebrow{font-size:14px;color:#bf4800;font-weight:650;margin:0 0 10px}.page-head h1{font-size:clamp(42px,5vw,64px);line-height:1;letter-spacing:-.06em;margin:0}.page-head p{font-size:18px;line-height:1.45;color:var(--muted);margin:16px 0 0;max-width:620px}
    .primary{border:0;background:var(--blue);color:#fff;border-radius:999px;min-height:42px;padding:0 19px;font-weight:600;transition:transform .2s,background .2s}.primary:hover{background:#0077ed;transform:scale(1.02)}.secondary{border:0;background:#e8e8ed;color:#1d1d1f;border-radius:999px;min-height:40px;padding:0 17px}
    .catalog-tools{display:flex;align-items:center;gap:12px;margin-bottom:28px}.search-wrap{position:relative;flex:1;max-width:520px}.search-wrap svg{position:absolute;left:15px;top:13px;color:#86868b}.search{width:100%;height:44px;border:0;border-radius:12px;background:#fff;padding:0 16px 0 43px;box-shadow:0 0 0 1px rgba(0,0,0,.04);outline:none;transition:box-shadow .2s}.search:focus{box-shadow:0 0 0 3px rgba(0,113,227,.18)}.count{font-size:13px;color:var(--muted);margin-left:auto}
    .apps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.app{min-height:390px;border-radius:24px;background:var(--surface);box-shadow:0 1px 0 rgba(0,0,0,.04),0 12px 38px rgba(0,0,0,.035);display:flex;flex-direction:column;text-decoration:none;position:relative;overflow:hidden;transition:transform .28s cubic-bezier(.2,.8,.2,1),box-shadow .28s}.app:hover{transform:translateY(-5px);box-shadow:0 20px 55px rgba(0,0,0,.09)}.app:after{content:"↗";position:absolute;right:22px;top:208px;color:#86868b;font-size:18px;z-index:3}
    .app-preview{height:185px;position:relative;overflow:hidden;background:linear-gradient(145deg,#edf5ff,#f4f0ff);border-bottom:1px solid rgba(0,0,0,.05)}.app-preview iframe{position:absolute;left:0;top:0;width:320%;height:320%;border:0;transform:scale(.3125);transform-origin:0 0;pointer-events:none;background:#fff}.preview-fallback{position:absolute;inset:0;display:grid;place-items:center}.app-icon{width:62px;height:62px;border-radius:17px;display:grid;place-items:center;color:#fff;font-size:22px;font-weight:720;letter-spacing:-.04em;background:linear-gradient(145deg,#1685f8,#0055ca);box-shadow:inset 0 1px 1px #ffffff66,0 8px 20px #0071e329}.app:nth-child(3n+2) .app-icon{background:linear-gradient(145deg,#8069e8,#5841bf);box-shadow:inset 0 1px 1px #ffffff55,0 8px 20px #6554c029}.app:nth-child(3n) .app-icon{background:linear-gradient(145deg,#43b866,#1c7d39);box-shadow:inset 0 1px 1px #ffffff55,0 8px 20px #248a3d29}
    .app-body{padding:20px 24px 23px;display:flex;flex:1;flex-direction:column}.app h2{font-size:21px;letter-spacing:-.035em;margin:0 36px 6px 0}.description{font-size:14px;color:var(--muted);line-height:1.45;min-height:41px}.app-foot{margin-top:auto;padding-top:18px;border-top:1px solid #e8e8ed}.status-line{display:flex;align-items:center;justify-content:space-between;font-size:12px}.status{color:var(--green);font-weight:650}.status:before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:#30d158;margin-right:6px}.owner{color:#86868b;max-width:150px;overflow:hidden;text-overflow:ellipsis}.caps{display:flex;gap:6px;flex-wrap:wrap;margin-top:13px}.cap{font-size:11px;padding:5px 8px;border-radius:999px;background:#f0f0f2;color:#515154}.empty{grid-column:1/-1;text-align:center;padding:90px 20px;color:var(--muted)}
    .deploy-layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(330px,.7fr);gap:64px}.steps{border-top:1px solid var(--line)}.step{display:grid;grid-template-columns:46px 1fr;gap:14px;padding:25px 0;border-bottom:1px solid var(--line)}.num{width:32px;height:32px;border-radius:50%;background:#1d1d1f;color:#fff;display:grid;place-items:center;font-size:12px}.step h2{font-size:18px;margin:4px 0 6px;letter-spacing:-.025em}.step p{font-size:14px;color:var(--muted);line-height:1.55;margin:0}.safety{font-size:13px;color:#6e6e73;line-height:1.55;margin-top:20px}
    .session-panel{background:#fff;border-radius:24px;padding:25px;align-self:start;box-shadow:0 12px 40px rgba(0,0,0,.04)}.session-panel h2{font-size:18px;margin:0 0 6px}.session-panel>p{font-size:13px;color:var(--muted);margin:0 0 12px}.connection{padding:16px 0;border-bottom:1px solid #ececef}.connection:last-child{border:0}.connection-head{display:flex;justify-content:space-between;gap:10px;font-size:13px}.connection-head button{border:0;background:none;color:#ff3b30;font-size:12px;padding:0}.small{font-size:11px;color:#86868b;margin-top:6px}
    .provider-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:48px}.provider-list{border-top:1px solid var(--line)}.provider-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:16px;padding:20px 4px;border-bottom:1px solid var(--line)}.provider-mark{width:42px;height:42px;border-radius:12px;background:#1d1d1f;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:750}.provider-row h2{font-size:17px;margin:0 0 4px}.provider-meta{font-size:12px;color:var(--muted);display:flex;gap:8px;flex-wrap:wrap}.provider-actions{display:flex;gap:7px;align-items:center}.text-button{border:0;background:none;color:var(--blue);padding:7px;font-size:13px}.danger-button{color:#ff3b30}.provider-summary{background:#fff;border-radius:24px;padding:25px;align-self:start;box-shadow:0 12px 40px rgba(0,0,0,.04);position:sticky;top:88px}.provider-summary h2{font-size:18px;margin:0 0 6px}.provider-summary>p{font-size:13px;color:var(--muted);line-height:1.5;margin:0 0 20px}.route-line{padding:15px 0;border-top:1px solid #ececef}.route-label{font-size:11px;color:#86868b;margin-bottom:6px}.route-value{font-size:14px;font-weight:650;word-break:break-word}.provider-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;border-radius:999px;background:#eaf7ed;color:#248a3d;padding:5px 8px}.provider-status.failed{background:#fff0ef;color:#d70015}.provider-status.neutral{background:#f0f0f2;color:#6e6e73}
    .provider-dialog{width:min(650px,calc(100% - 28px))}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:grid;gap:7px}.field.wide{grid-column:1/-1}.field label{font-size:12px;font-weight:650;color:#515154}.field input,.field select{width:100%;height:44px;border:1px solid #d8d8dc;border-radius:11px;background:#fff;padding:0 12px;outline:none}.field input:focus,.field select:focus{border-color:var(--blue);box-shadow:0 0 0 3px #0071e320}.field-note{font-size:11px;color:#86868b;line-height:1.4}.check-line{display:flex;align-items:center;gap:8px;font-size:13px}.check-line input{width:17px;height:17px}.form-error{min-height:18px;color:#d70015;font-size:12px;margin-top:10px}
    dialog{border:0;border-radius:24px;padding:0;width:min(720px,calc(100% - 28px));box-shadow:0 35px 100px #0004}dialog::backdrop{background:#0007;backdrop-filter:blur(10px)}.modal{padding:30px}.modal h2{font-size:27px;letter-spacing:-.04em;margin:0 0 8px}.modal>p{color:var(--muted);line-height:1.45;margin:0 0 22px}.key{display:flex;align-items:center;gap:10px;background:#f5f5f7;border-radius:14px;padding:13px 15px}.key code{flex:1;overflow:hidden;text-overflow:ellipsis}.copy{border:0;color:var(--blue);background:none;font-weight:600}.prompt{width:100%;height:230px;border:0;background:#f5f5f7;border-radius:14px;padding:15px;margin-top:12px;resize:vertical;line-height:1.55;outline:none}.modal-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:16px}
    .mobile-create{display:none}.loading{animation:pulse 1.2s infinite}@keyframes pulse{50%{opacity:.45}}
    @media(max-width:900px){.apps{grid-template-columns:1fr 1fr}.deploy-layout,.provider-layout{grid-template-columns:1fr}.page-head{align-items:start}.session-panel{order:2}.provider-summary{position:static;order:-1}}@media(max-width:620px){.topbar-inner{width:calc(100% - 28px);gap:8px}.identity{display:none}.nav{margin-left:auto}.nav a{padding:7px 7px;font-size:12px}.page-head{display:block}.page-head .primary{display:none}main{width:calc(100% - 28px);padding-top:40px}.apps{grid-template-columns:1fr}.app{min-height:250px}.mobile-create{display:block;position:fixed;right:18px;bottom:20px;z-index:15;box-shadow:0 12px 30px #0071e344}.catalog-tools{align-items:start;flex-wrap:wrap}.count{width:100%;margin:0}.deploy-layout{gap:28px}.modal{padding:22px}.form-grid{grid-template-columns:1fr}.field.wide{grid-column:auto}.provider-row{grid-template-columns:42px 1fr}.provider-actions{grid-column:2;justify-content:flex-start}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
  </style>
</head>
<body>
  <header class="topbar"><div class="topbar-inner">
    <a class="brand" href="/"><i>EZ</i>deploy</a>
    <nav class="nav"><a data-path="/center" href="/center">我的应用</a><a data-path="/deploy" href="/deploy">AI 部署</a><a data-path="/settings/ai" href="/settings/ai">AI 设置</a></nav>
    <div class="account"><div class="identity" id="identity">正在验证身份…</div><button class="logout" id="logout" type="button">退出</button></div>
  </div></header>
  <main>
    <section class="view" id="catalog">
      <div class="page-head"><div><p class="eyebrow">My Application Center</p><h1>我的应用，一处打开。</h1><p>查看你已经发布的应用、基础能力和运行状态。</p></div><a class="primary" href="/deploy" style="display:inline-flex;align-items:center;text-decoration:none">部署新应用</a></div>
      <div class="catalog-tools"><div class="search-wrap"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input class="search" id="search" placeholder="搜索应用或基础能力"></div><span class="count" id="count"></span></div>
      <div class="apps" id="apps"><div class="empty loading">正在读取应用目录…</div></div>
    </section>
    <section class="view" id="deploy">
      <div class="page-head"><div><p class="eyebrow">Zero-install Deploy</p><h1>交给 AI，几分钟上线。</h1><p>生成一段部署提示词，发送给正在处理项目的 Codex、WorkBuddy 或其他编码 Agent。</p></div><button class="primary" id="create">生成部署提示词</button></div>
      <div class="deploy-layout">
        <div><div class="steps"><div class="step"><span class="num">1</span><div><h2>生成一次性连接码</h2><p>连接码只属于当前管理员，2 小时内有效且只能兑换一次。</p></div></div><div class="step"><span class="num">2</span><div><h2>复制给当前项目的 Agent</h2><p>Agent 通过公开说明页面发现协议，不需要提前安装 EZdeploy 或配置 MCP。</p></div></div><div class="step"><span class="num">3</span><div><h2>确认部署计划</h2><p>在创建资源之前查看运行时、数据库、存储、AI 和访问范围。</p></div></div><div class="step"><span class="num">4</span><div><h2>获得正式应用链接</h2><p>个人域名和健康检查全部通过后，应用自动出现在这里。</p></div></div></div><p class="safety">连接码不是长期密钥。Agent 兑换得到的会话在 12 小时内保持有效，且不得写入项目、构建产物或最终回复。</p></div>
        <aside class="session-panel"><h2>Agent 会话</h2><p>查看和撤销近期部署连接。</p><div id="connections"><div class="empty loading" style="padding:35px 0">正在读取…</div></div></aside>
      </div>
    </section>
    <section class="view" id="providers">
      <div class="page-head"><div><p class="eyebrow">Personal Settings</p><h1>AI Provider</h1><p>集中配置你的模型供应商、默认模型和 API Key。应用始终只使用 EZdeploy 签发的虚拟密钥。</p></div><button class="primary" id="addProvider">添加 Provider</button></div>
      <div class="provider-layout">
        <div class="provider-list" id="providerList"><div class="empty loading">正在读取 Provider…</div></div>
        <aside class="provider-summary"><h2>默认模型路由</h2><p>所有请求中的 <code>default-chat</code> 会路由到当前默认 Provider。Embedding 暂时继续使用 Cloudflare Workers AI。</p><div class="route-line"><div class="route-label">CHAT COMPLETIONS</div><div class="route-value" id="defaultRoute">未配置，使用 Cloudflare 默认模型</div></div><div class="route-line"><div class="route-label">密钥安全</div><div class="route-value">AES-256-GCM 加密 · 永不回显完整密钥</div></div></aside>
      </div>
    </section>
  </main>
  <button class="primary mobile-create" id="mobileCreate">生成提示词</button>
  <dialog id="keyDialog"><div class="modal"><h2>部署提示词已生成</h2><p>推荐复制整段内容给正在处理项目的 Agent。一次性连接码 2 小时内有效。</p><div class="key"><code id="keyValue"></code><button class="copy" data-copy="keyValue">复制连接码</button></div><textarea class="prompt" id="agentPrompt" readonly></textarea><div class="modal-actions"><button class="secondary" id="done">关闭</button><button class="primary" data-copy="agentPrompt">复制给 Agent</button></div></div></dialog>
  <dialog class="provider-dialog" id="providerDialog"><form class="modal" id="providerForm"><h2 id="providerDialogTitle">添加 AI Provider</h2><p>选择预设可自动填写官方兼容地址和推荐模型，保存前不会发出模型请求。</p><input type="hidden" id="providerId"><div class="form-grid"><div class="field"><label for="providerType">Provider</label><select id="providerType"></select></div><div class="field"><label for="providerName">显示名称</label><input id="providerName" maxlength="80" required></div><div class="field wide"><label for="providerBaseUrl">OpenAI-compatible Base URL</label><input id="providerBaseUrl" type="url" required></div><div class="field wide"><label for="providerApiKey">API Key</label><input id="providerApiKey" type="password" autocomplete="new-password" placeholder="编辑时留空表示保持原密钥"><div class="field-note">密钥通过 TLS 发送到 AI Proxy，随后使用独立加密密钥保存。</div></div><div class="field"><label for="providerDefaultModel">默认模型</label><input id="providerDefaultModel" required></div><div class="field"><label for="providerModels">可用模型</label><input id="providerModels" placeholder="逗号分隔"></div><div class="field wide"><label class="check-line"><input id="providerEnabled" type="checkbox" checked>启用这个 Provider</label><label class="check-line"><input id="providerDefault" type="checkbox">设为默认 Chat Provider</label></div></div><div class="form-error" id="providerError"></div><div class="modal-actions"><button class="secondary" type="button" id="cancelProvider">取消</button><button class="primary" type="submit">保存配置</button></div></form></dialog>
  <script>
    const state={apps:[],me:null,providers:[]};
    async function apiData(response){const text=await response.text();if(!text)return {};try{return JSON.parse(text)}catch{return {error:{message:'服务暂不可用（HTTP '+response.status+'）'}}}}
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const current=location.pathname==='/deploy'?'deploy':location.pathname==='/settings/ai'?'providers':'catalog';
    document.querySelector('#'+current).classList.add('active');
    document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('active',a.dataset.path===location.pathname));
    document.querySelector('#mobileCreate').style.display=current==='deploy'?'':'none';
    function initials(name){return String(name||'ZA').trim().split(/\\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase().slice(0,2)}
    async function loadMe(){const r=await fetch('/api/me');if(r.status===401){location.href='/login';return}if(!r.ok)throw Error('身份验证失败');state.me=await r.json();document.querySelector('#identity').textContent=state.me.username}
    async function loadApps(){const r=await fetch('/api/apps');if(!r.ok)throw Error('应用目录加载失败');state.apps=await r.json();drawApps()}
    function drawApps(){const q=(document.querySelector('#search')?.value||'').toLowerCase();const rows=state.apps.filter(x=>JSON.stringify(x).toLowerCase().includes(q));document.querySelector('#count').textContent=rows.length+' 个应用';document.querySelector('#apps').innerHTML=rows.length?rows.map((x,i)=>{const url=x.deployment?.url||'#';const status=x.deployment?.status||'未发布';const preview=x.deployment?.url?'<iframe src="'+esc(encodeURI(x.deployment.url))+'" title="'+esc(x.application.displayName)+' 页面预览" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>':'';return '<a class="app" href="'+encodeURI(url)+'" target="_blank" rel="noreferrer"><div class="app-preview"><div class="preview-fallback"><div class="app-icon">'+esc(initials(x.application.displayName))+'</div></div>'+preview+'</div><div class="app-body"><h2>'+esc(x.application.displayName)+'</h2><div class="description">'+esc(x.application.description||x.application.slug)+'</div><div class="app-foot"><div class="status-line"><span class="status">'+esc(status)+'</span></div><div class="caps">'+x.resources.map(r=>'<span class="cap">'+esc(({database:'数据库',storage:'对象存储',ai:'AI'}[r.kind]||r.kind))+'</span>').join('')+(x.access?.mode==='organization'?'<span class="cap">受保护访问</span>':'<span class="cap">公开访问</span>')+'</div></div></div></a>'}).join(''):'<div class="empty">还没有应用。生成部署提示词，把第一个项目交给 Agent 吧。</div>'}
    async function loadConnections(){const r=await fetch('/api/connections');if(!r.ok)throw Error('连接读取失败');const rows=await r.json();document.querySelector('#connections').innerHTML=rows.length?rows.map(x=>'<div class="connection"><div class="connection-head"><strong>'+esc(x.label||'Agent 会话')+'</strong><button onclick="revokeConnection(\\''+x.id+'\\')">撤销</button></div><div class="small">创建于 '+new Date(x.createdAt).toLocaleString()+'</div><div class="small">'+(x.expiresAt?'有效至 '+new Date(x.expiresAt).toLocaleString():(x.lastUsedAt?'最近使用 '+new Date(x.lastUsedAt).toLocaleString():'长期连接'))+'</div></div>').join(''):'<div class="empty" style="padding:35px 0">暂无有效 Agent 会话</div>'}
    const providerPresets={
      deepseek:{name:'DeepSeek',baseUrl:'https://api.deepseek.com',model:'deepseek-v4-flash',models:['deepseek-v4-flash','deepseek-v4-pro']},
      openai:{name:'OpenAI',baseUrl:'https://api.openai.com/v1',model:'gpt-5.4-mini',models:['gpt-5.4-mini','gpt-5.4']},
      anthropic:{name:'Anthropic Claude',baseUrl:'https://api.anthropic.com/v1',model:'claude-sonnet-4-6',models:['claude-sonnet-4-6','claude-opus-4-6']},
      gemini:{name:'Google Gemini',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai',model:'gemini-3.5-flash',models:['gemini-3.5-flash','gemini-3.1-pro']},
      openrouter:{name:'OpenRouter',baseUrl:'https://openrouter.ai/api/v1',model:'openai/gpt-5.4-mini',models:['openai/gpt-5.4-mini','anthropic/claude-sonnet-4.6']},
      cloudflare:{name:'Cloudflare Workers AI',baseUrl:'https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/ai/v1',model:'@cf/openai/gpt-oss-120b',models:['@cf/openai/gpt-oss-120b']},
      custom:{name:'自定义 Provider',baseUrl:'',model:'',models:[]}
    };
    function statusBadge(provider){if(provider.lastTestStatus==='ready')return '<span class="provider-status">● 连接正常</span>';if(provider.lastTestStatus==='failed')return '<span class="provider-status failed">● 测试失败</span>';return '<span class="provider-status neutral">尚未测试</span>'}
    async function loadProviders(){const r=await fetch('/api/ai/providers');const data=await apiData(r);if(!r.ok)throw Error(data.error?.message||'Provider 读取失败');state.providers=data;drawProviders()}
    function drawProviders(){const target=document.querySelector('#providerList');target.innerHTML=state.providers.length?state.providers.map(x=>'<div class="provider-row"><div class="provider-mark">'+esc(initials(x.name))+'</div><div><h2>'+esc(x.name)+(x.isDefault?' · 默认':'')+'</h2><div class="provider-meta"><span>'+esc(x.providerType)+'</span><span>'+esc(x.defaultModel)+'</span><span>Key ····'+esc(x.apiKeyLastFour)+'</span>'+statusBadge(x)+'</div></div><div class="provider-actions"><button class="text-button" onclick="testProvider(\\''+x.id+'\\')">测试</button><button class="text-button" onclick="editProvider(\\''+x.id+'\\')">编辑</button><button class="text-button danger-button" onclick="deleteProvider(\\''+x.id+'\\')">删除</button></div></div>').join(''):'<div class="empty">尚未添加 Provider。未配置时继续使用 Cloudflare Workers AI。</div>';const current=state.providers.find(x=>x.enabled&&x.isDefault)||state.providers.find(x=>x.enabled);document.querySelector('#defaultRoute').textContent=current?current.name+' / '+current.defaultModel:'未配置，使用 Cloudflare 默认模型'}
    const providerType=document.querySelector('#providerType');providerType.innerHTML=Object.entries(providerPresets).map(([id,x])=>'<option value="'+id+'">'+esc(x.name)+'</option>').join('');
    function applyPreset(type){const preset=providerPresets[type];document.querySelector('#providerName').value=preset.name;document.querySelector('#providerBaseUrl').value=preset.baseUrl;document.querySelector('#providerDefaultModel').value=preset.model;document.querySelector('#providerModels').value=preset.models.join(', ')}
    providerType.onchange=()=>applyPreset(providerType.value);
    function openProvider(provider){document.querySelector('#providerError').textContent='';document.querySelector('#providerForm').reset();document.querySelector('#providerEnabled').checked=true;document.querySelector('#providerId').value=provider?.id||'';document.querySelector('#providerDialogTitle').textContent=provider?'编辑 AI Provider':'添加 AI Provider';if(provider){providerType.value=provider.providerType;document.querySelector('#providerName').value=provider.name;document.querySelector('#providerBaseUrl').value=provider.baseUrl;document.querySelector('#providerDefaultModel').value=provider.defaultModel;document.querySelector('#providerModels').value=provider.models.join(', ');document.querySelector('#providerEnabled').checked=provider.enabled;document.querySelector('#providerDefault').checked=provider.isDefault}else{providerType.value='deepseek';applyPreset('deepseek')}document.querySelector('#providerDialog').showModal()}
    document.querySelector('#addProvider').onclick=()=>openProvider(null);document.querySelector('#cancelProvider').onclick=()=>document.querySelector('#providerDialog').close();
    function editProvider(id){openProvider(state.providers.find(x=>x.id===id))}window.editProvider=editProvider;
    async function testProvider(id){const r=await fetch('/api/ai/providers/'+id+'/test',{method:'POST'});const data=await apiData(r);await loadProviders();alert(data.message||data.error?.message||(r.ok?'连接成功':'连接失败'))}window.testProvider=testProvider;
    async function deleteProvider(id){if(!confirm('删除后，使用这个 Provider 的请求会立即切换到其他默认配置。继续吗？'))return;const r=await fetch('/api/ai/providers/'+id,{method:'DELETE'});if(!r.ok){const data=await apiData(r);return alert(data.error?.message||'删除失败')}await loadProviders()}window.deleteProvider=deleteProvider;
    document.querySelector('#providerForm').onsubmit=async event=>{event.preventDefault();const id=document.querySelector('#providerId').value;const body={providerType:providerType.value,name:document.querySelector('#providerName').value,baseUrl:document.querySelector('#providerBaseUrl').value,apiKey:document.querySelector('#providerApiKey').value,defaultModel:document.querySelector('#providerDefaultModel').value,models:document.querySelector('#providerModels').value.split(',').map(x=>x.trim()).filter(Boolean),enabled:document.querySelector('#providerEnabled').checked,isDefault:document.querySelector('#providerDefault').checked};const r=await fetch('/api/ai/providers'+(id?'/'+id:''),{method:id?'PUT':'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await apiData(r);if(!r.ok){document.querySelector('#providerError').textContent=data.error?.message||'保存失败';return}document.querySelector('#providerDialog').close();await loadProviders()};
    document.querySelector('#search')?.addEventListener('input',drawApps);
    async function createPrompt(){const r=await fetch('/api/connect-codes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:'Codex / WorkBuddy'})});const data=await r.json();if(!r.ok)return alert(data.error?.message||'创建失败');document.querySelector('#keyValue').textContent=data.connectCode;document.querySelector('#agentPrompt').value=data.agentPrompt;document.querySelector('#keyDialog').showModal();await loadConnections()}
    document.querySelector('#create')?.addEventListener('click',createPrompt);document.querySelector('#mobileCreate').addEventListener('click',createPrompt);
    async function revokeConnection(id){if(!confirm('撤销后，这个 Agent 会话将立即失效。继续吗？'))return;await fetch('/api/connections/'+id,{method:'DELETE'});await loadConnections()}window.revokeConnection=revokeConnection;
    document.querySelectorAll('[data-copy]').forEach(button=>button.onclick=async()=>{const target=document.querySelector('#'+button.dataset.copy);await navigator.clipboard.writeText(target.value??target.textContent);const old=button.textContent;button.textContent='已复制';setTimeout(()=>button.textContent=old,1200)});
    document.querySelector('#done').onclick=()=>document.querySelector('#keyDialog').close();
    document.querySelector('#logout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/login'};
    const jobs=[loadMe()];if(current==='catalog')jobs.push(loadApps());else if(current==='deploy')jobs.push(loadConnections());else jobs.push(loadProviders());Promise.all(jobs).catch(error=>{const target=document.querySelector(current==='catalog'?'#apps':current==='deploy'?'#connections':'#providerList');target.innerHTML='<div class="empty">加载失败：'+esc(error.message)+'</div>'});
  </script>
</body></html>`;
