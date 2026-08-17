const zhLandingPage = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="EZdeploy 是安装一次、以后一句话发布的个人应用部署中心。">
  <title>EZdeploy — 一句话，部署到应用中心</title>
  <style>
    :root{font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17120f;background:#fff;--orange:#f6821f;--ink:#17120f;--cream:#fff8ef;--line:#d8d0c7;--muted:#655d57}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;overflow-x:hidden}a{color:inherit}.top{height:66px;display:flex;align-items:center;position:absolute;inset:0 0 auto;z-index:5;border-bottom:1px solid #17120f33}.nav{width:min(1200px,calc(100% - 40px));margin:auto;display:flex;align-items:center;gap:30px}.logo{font-weight:900;font-size:22px;letter-spacing:-.07em;text-decoration:none}.logo span{background:#17120f;color:var(--orange);padding:3px 5px;margin-right:2px}.nav-links{margin-left:auto;display:flex;align-items:center;gap:28px;font-size:13px;font-weight:700}.nav-links a{text-decoration:none}.nav-cta{border:1px solid var(--ink);padding:10px 16px;background:#fff;box-shadow:4px 4px 0 var(--ink);transition:.18s}.nav-cta:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 var(--ink)}
    .hero{min-height:92svh;background:var(--orange);padding:138px max(24px,calc((100vw - 1200px)/2)) 70px;position:relative;overflow:hidden;border-bottom:1px solid var(--ink);display:grid;grid-template-columns:minmax(0,1.25fr) minmax(380px,.75fr);align-items:center;gap:50px}.hero:before{content:"";position:absolute;inset:0;background-image:linear-gradient(#17120f20 1px,transparent 1px),linear-gradient(90deg,#17120f20 1px,transparent 1px);background-size:44px 44px;mask-image:linear-gradient(90deg,transparent 15%,#000)}.hero-copy,.network{position:relative}.tag{display:inline-flex;gap:9px;align-items:center;border:1px solid var(--ink);padding:7px 10px;font:700 12px/1 monospace;text-transform:uppercase;background:#ffac60}.tag:before{content:"";width:8px;height:8px;border-radius:50%;background:#17120f;animation:pulse 1.7s infinite}.hero h1{font-size:clamp(62px,8.5vw,126px);line-height:.83;letter-spacing:-.085em;margin:28px 0 30px;max-width:900px;font-weight:950}.hero h1 em{font-style:normal;color:#fff8ef;display:block}.hero p{font-size:clamp(19px,2vw,25px);line-height:1.45;max-width:680px;margin:0;color:#2b211c}.actions{display:flex;gap:14px;margin-top:34px}.btn{min-height:52px;display:inline-flex;align-items:center;justify-content:center;padding:0 22px;border:1px solid var(--ink);font-weight:800;text-decoration:none;transition:.18s}.btn.dark{background:var(--ink);color:#fff;box-shadow:6px 6px 0 #fff8ef}.btn.light{background:transparent}.btn:hover{transform:translateY(-3px)}
    .network{height:540px;border:1px solid var(--ink);background:#fff8ef33;overflow:hidden}.network:before,.network:after{content:"";position:absolute;inset:-20%;background:repeating-radial-gradient(circle at 50% 50%,transparent 0 50px,#17120f33 51px 52px);animation:drift 16s linear infinite}.network:after{background:linear-gradient(35deg,transparent 49.7%,#17120f 50%,transparent 50.3%);transform:rotate(42deg)}.node{position:absolute;z-index:2;border:1px solid var(--ink);background:var(--cream);padding:13px 16px;font:800 13px monospace;box-shadow:5px 5px 0 var(--ink)}.node.core{left:50%;top:47%;transform:translate(-50%,-50%);background:var(--ink);color:white;font-size:18px;padding:22px}.node.a{left:7%;top:12%}.node.b{right:6%;top:23%}.node.c{left:10%;bottom:15%}.node.d{right:8%;bottom:10%}.flow-dot{position:absolute;z-index:3;width:12px;height:12px;background:white;border:2px solid var(--ink);border-radius:50%;offset-path:path("M 40 80 C 240 0 110 390 390 430");animation:travel 4s ease-in-out infinite}
    .marquee{border-bottom:1px solid var(--ink);background:var(--ink);color:white;overflow:hidden;white-space:nowrap;padding:13px 0;font:700 12px monospace}.marquee div{display:inline-block;animation:slide 24s linear infinite}.marquee span{margin:0 28px;color:#ffb16d}
    section.block{padding:120px max(24px,calc((100vw - 1200px)/2));border-bottom:1px solid var(--line)}.section-label{font:800 12px monospace;color:#bf4b00;letter-spacing:.08em;text-transform:uppercase}.block h2{font-size:clamp(42px,6vw,78px);line-height:.94;letter-spacing:-.065em;margin:16px 0 52px;max-width:920px}.steps{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid var(--ink)}.step{min-height:270px;padding:25px;border-right:1px solid var(--ink);position:relative}.step:last-child{border:0}.num{font:800 12px monospace;color:#a54200}.step h3{font-size:25px;letter-spacing:-.04em;margin:78px 0 12px}.step p{color:var(--muted);line-height:1.55;margin:0}.step.active{background:var(--orange);transition:background .3s}
    .phrase{background:var(--cream);display:grid;grid-template-columns:1fr 1fr;gap:70px;align-items:center}.terminal{background:#17120f;color:#eee;border:1px solid #000;box-shadow:12px 12px 0 var(--orange);font:14px/1.65 monospace}.terminal-top{padding:12px 16px;border-bottom:1px solid #ffffff2a;color:#8f8883}.terminal-body{padding:28px;min-height:260px}.terminal .user{color:#ff9c4b}.terminal .ok{color:#77d79a}.caret{display:inline-block;width:8px;height:16px;background:var(--orange);vertical-align:-3px;animation:blink 1s steps(1) infinite}.phrase h2{margin-bottom:24px}.phrase p{font-size:20px;line-height:1.55;color:var(--muted)}
    .trust{background:#fff}.trust-grid{display:grid;grid-template-columns:1.25fr .75fr;border-top:1px solid var(--ink)}.trust-main{padding:42px 42px 42px 0}.trust-side{border-left:1px solid var(--ink);padding:42px}.trust h3{font-size:34px;letter-spacing:-.045em;margin:0 0 16px}.trust p{font-size:18px;line-height:1.6;color:var(--muted)}.badge{display:inline-block;border:1px solid var(--ink);padding:8px 11px;margin:5px 3px 0 0;font:700 12px monospace}.final{background:var(--orange);text-align:center;padding:120px 24px}.final h2{font-size:clamp(52px,8vw,104px);line-height:.9;letter-spacing:-.075em;margin:0 auto 35px;max-width:1050px}.final .btn{background:#17120f;color:white;box-shadow:7px 7px 0 white}.footer{padding:25px max(24px,calc((100vw - 1200px)/2));display:flex;justify-content:space-between;font:12px monospace}
    @keyframes pulse{50%{opacity:.25}}@keyframes drift{to{transform:rotate(360deg)}}@keyframes travel{50%{offset-distance:100%}100%{offset-distance:0}}@keyframes blink{50%{opacity:0}}@keyframes slide{to{transform:translateX(-50%)}}
    @media(max-width:850px){.nav-links a:not(.nav-cta){display:none}.hero{grid-template-columns:1fr;padding-top:120px}.network{height:390px}.steps{grid-template-columns:1fr 1fr}.step:nth-child(2){border-right:0}.step:nth-child(-n+2){border-bottom:1px solid var(--ink)}.phrase{grid-template-columns:1fr}.trust-grid{grid-template-columns:1fr}.trust-main{padding-right:0}.trust-side{border-left:0;border-top:1px solid var(--ink);padding-left:0}.hero h1{font-size:66px}}@media(max-width:520px){.steps{grid-template-columns:1fr}.step{border-right:0!important;border-bottom:1px solid var(--ink)!important;min-height:220px}.step:last-child{border-bottom:0!important}.actions{flex-direction:column}.network{height:320px}.node{font-size:10px;padding:9px}.node.core{font-size:14px}.hero h1{font-size:52px}.block h2{font-size:42px}.footer{display:block}.footer span{display:block;margin-top:8px}}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
  </style>
</head><body>
  <header class="top"><nav class="nav"><a class="logo" href="/"><span>EZ</span>deploy</a><div class="nav-links"><a href="#how">工作方式</a><a href="#security">安全设计</a><a href="/en" lang="en">EN</a><a class="nav-cta" href="/center">进入应用中心 →</a></div></nav></header>
  <main>
    <section class="hero"><div class="hero-copy"><div class="tag">Personal deployment network</div><h1>一句话，<em>应用就上线。</em></h1><p>安装一次 EZdeploy Skill，保存一个长期 Key。以后在 Codex 或 WorkBuddy 里说“部署到应用中心”，就能获得可访问的正式链接。</p><div class="actions"><a class="btn dark" href="/deploy">安装部署 Skill</a><a class="btn light" href="#how">看看怎么工作 ↓</a></div></div><div class="network" aria-label="应用从 Agent 流向个人部署中心的网络图"><div class="node a">CODEX</div><div class="node b">WORKBUDDY</div><div class="node core">EZdeploy</div><div class="node c">AI / DB</div><div class="node d">apps.wali.uno</div><i class="flow-dot"></i></div></section>
    <div class="marquee"><div>INSTALL ONCE <span>◆</span> SAY “部署到应用中心” <span>◆</span> CONFIRM PLAN <span>◆</span> GET A HEALTHY URL <span>◆</span> INSTALL ONCE <span>◆</span> SAY “部署到应用中心” <span>◆</span> CONFIRM PLAN <span>◆</span> GET A HEALTHY URL <span>◆</span></div></div>
    <section class="block" id="how"><div class="section-label">01 / Deployment flow</div><h2>第一次设置。此后只负责表达想法。</h2><div class="steps"><article class="step active"><span class="num">01</span><h3>安装 Skill</h3><p>复制安装提示词，让 Agent 认识你的个人应用中心。</p></article><article class="step"><span class="num">02</span><h3>保存长期 Key</h3><p>只配置一次，直到你在管理页主动撤销。</p></article><article class="step"><span class="num">03</span><h3>说出部署意图</h3><p>“部署到应用中心”会触发项目识别和部署计划。</p></article><article class="step"><span class="num">04</span><h3>确认并上线</h3><p>确认资源与访问范围后，等待健康链接返回。</p></article></div></section>
    <section class="block phrase"><div><div class="section-label">02 / Agent native</div><h2>不记命令。说人话。</h2><p>Skill 会识别项目类型、构建方式以及数据库、对象存储和 AI 能力需求。你只需要确认计划，不需要每次安装工具或重新授权。</p></div><div class="terminal"><div class="terminal-top">workbuddy · current project</div><div class="terminal-body"><span class="user">YOU</span> 部署到应用中心<br><br><span class="ok">EZDEPLOY</span> 已识别 Vite 应用<br>运行时 static · 公开访问<br>不需要数据库 / 存储 / AI<br><br>确认后将发布到 apps.wali.uno<br><span class="caret"></span></div></div></section>
    <section class="block trust" id="security"><div class="section-label">03 / Personal control plane</div><h2>长期有效，不等于失去控制。</h2><div class="trust-grid"><div class="trust-main"><h3>密钥只显示一次，随时可以撤销。</h3><p>部署 Key 保存在项目目录之外，服务端只存哈希。它不会进入代码、构建产物或聊天回复；每次发布仍需确认部署计划。</p><span class="badge">REVOCABLE KEY</span><span class="badge">PLAN DIGEST</span><span class="badge">HEALTH CHECK</span></div><aside class="trust-side"><h3>统一基础能力</h3><p>AI Provider、数据库和对象存储由控制面集中管理，应用按需获得最小权限。</p></aside></div></section>
    <section class="final"><h2>下一次发布，只说一句话。</h2><a class="btn" href="/deploy">设置我的部署 Skill →</a></section>
  </main><footer class="footer">EZdeploy · 开源个人应用部署中心 <span>Agent-native · Self-hostable · Cloudflare</span></footer>
  <script>const steps=[...document.querySelectorAll('.step')];if('IntersectionObserver'in window){new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){steps.forEach(x=>x.classList.remove('active'));e.target.classList.add('active')}}),{threshold:.65}).observe(steps[0]);steps.slice(1).forEach(x=>new IntersectionObserver(es=>es.forEach(e=>e.isIntersecting&&steps.forEach(y=>y.classList.toggle('active',y===e.target))),{threshold:.65}).observe(x))}</script>
</body></html>`;

const englishLandingTranslations: Array<[string, string]> = [
  ["EZdeploy 是安装一次、以后一句话发布的个人应用部署中心。", "EZdeploy is your personal app deployment center: install once, then publish with one sentence."],
  ["EZdeploy — 一句话，部署到应用中心", "EZdeploy — Deploy with one sentence"],
  ["应用从 Agent 流向个人部署中心的网络图", "Network showing an app flowing from an agent to your personal deployment center"],
  ["安装一次 EZdeploy Skill，保存一个长期 Key。以后在 Codex 或 WorkBuddy 里说“部署到应用中心”，就能获得可访问的正式链接。", "Install the EZdeploy Skill once and save one persistent key. Then tell Codex or WorkBuddy to “deploy to my app center” and get a production-ready URL."],
  ["第一次设置。此后只负责表达想法。", "Set it up once. Then focus on your ideas."],
  ["复制安装提示词，让 Agent 认识你的个人应用中心。", "Copy the setup prompt so your agent knows your personal app center."],
  ["只配置一次，直到你在管理页主动撤销。", "Configure it once; it remains valid until you revoke it."],
  ["“部署到应用中心”会触发项目识别和部署计划。", "“Deploy to my app center” triggers project detection and a deployment plan."],
  ["确认资源与访问范围后，等待健康链接返回。", "Confirm resources and access, then receive a healthy app URL."],
  ["Skill 会识别项目类型、构建方式以及数据库、对象存储和 AI 能力需求。你只需要确认计划，不需要每次安装工具或重新授权。", "The Skill detects the project type, build method, and database, storage, or AI needs. You only confirm the plan—no repeated setup or authorization."],
  ["密钥只显示一次，随时可以撤销。", "Your key is shown once and can be revoked anytime."],
  ["部署 Key 保存在项目目录之外，服务端只存哈希。它不会进入代码、构建产物或聊天回复；每次发布仍需确认部署计划。", "The deployment key stays outside the project and only its hash is stored server-side. It never enters source code, build output, or chat replies; every release still requires plan confirmation."],
  ["AI Provider、数据库和对象存储由控制面集中管理，应用按需获得最小权限。", "AI providers, databases, and object storage are managed centrally, while each app receives only the permissions it needs."],
  ["一句话，<em>应用就上线。</em>", "One sentence.<em>Your app is live.</em>"],
  ["工作方式", "How it works"], ["安全设计", "Security"], ["进入应用中心 →", "Open app center →"],
  ["安装部署 Skill", "Install deployment Skill"], ["看看怎么工作 ↓", "See how it works ↓"],
  ["部署到应用中心", "deploy to my app center"], ["安装 Skill", "Install the Skill"],
  ["保存长期 Key", "Save a persistent key"], ["说出部署意图", "Ask to deploy"], ["确认并上线", "Confirm and publish"],
  ["不记命令。说人话。", "No commands. Just ask."], ["长期有效，不等于失去控制。", "Persistent does not mean uncontrolled."],
  ["统一基础能力", "Shared platform services"], ["下一次发布，只说一句话。", "Publish next time with one sentence."],
  ["设置我的部署 Skill →", "Set up my deployment Skill →"], ["开源个人应用部署中心", "Open-source personal app deployment center"],
  ["YOU</span> 部署到应用中心", "YOU</span> deploy to my app center"], ["已识别 Vite 应用", "Vite app detected"],
  ["运行时 static · 公开访问", "Runtime: static · Public access"], ["不需要数据库 / 存储 / AI", "No database / storage / AI required"],
  ["确认后将发布到 apps.wali.uno", "After confirmation, publish to apps.wali.uno"],
  ["SAY “部署到应用中心”", "SAY “DEPLOY TO MY APP CENTER”"],
];

function translatePage(page: string, translations: Array<[string, string]>): string {
  return [...translations].sort((a, b) => b[0].length - a[0].length)
    .reduce((output, [source, target]) => output.replaceAll(source, target), page);
}

export function landingPageFor(locale: "zh" | "en" = "zh"): string {
  if (locale === "zh") return zhLandingPage;
  return translatePage(zhLandingPage, englishLandingTranslations)
    .replace('<html lang="zh-CN">', '<html lang="en">')
    .replace('href="/en" lang="en">EN</a>', 'href="/" lang="zh-CN">中文</a>')
    .replaceAll('href="/center"', 'href="/en/center"')
    .replaceAll('href="/deploy"', 'href="/en/deploy"')
    .replace('href="/"', 'href="/en"');
}

export const landingPage = landingPageFor("zh");
