// 诊断流程 — 单人局进入后DOM元素调查
const BASE = "https://ideal-type-loading.kimnin-iup.workers.dev";
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

const waitFor = async (ctx, expr, timeout = 15000, step = 500) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ctx.eval(expr)) return true; } catch {}
    await ctx.wait(step);
  }
  ctx.log("WAITFOR TIMEOUT:", expr);
  return false;
};

export default async function (ctx) {

  // 预置 localStorage（模拟已完成调酒的用户）
  await ctx.goto(BASE + "/?solo=1");
  await ctx.eval(`
    localStorage.setItem('ideal_cocktail', JSON.stringify({
      name:'雾中花园·起泡宣言', glass:'highball',
      palette:['#16536e','#2ea8c8','#c2f3ff'], ice:0, garnish:0,
      intro:'入口干净。',
      recipe:'金酒 · 苏打气泡 · 酒渍樱桃 · 不加冰', answers:[0,0,0,0]
    }));
    localStorage.setItem('mfn_name', 'diaguser');
    localStorage.setItem('ideal_userId', 'diag-uid-001');
    localStorage.setItem('ideal_token', 'diag-token-001');
    localStorage.setItem('ideal_gender', 'f');
    localStorage.setItem('ideal_seeking', 'm');
  `);
  await ctx.goto(BASE + "/?solo=1");
  await ctx.wait(3000);

  ctx.log("solo home URL:", await ctx.url());
  ctx.log("solo home body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 找 nameIn
  await waitFor(ctx, "!!document.getElementById('nameIn')||!!document.getElementById('createBtn')", 10000);
  const nameVal = await ctx.eval("document.getElementById('nameIn')?.value || ''");
  ctx.log("nameIn value:", nameVal);
  if (!nameVal) await ctx.type("#nameIn", "diaguser");

  await ctx.click("#createBtn");
  await waitFor(ctx, "document.getElementById('startBtn')||document.body.innerText.includes('开始')", 12000);
  ctx.log("room body:", await ctx.eval("document.body.innerText.slice(0,500)"));
  await ctx.shot(Q + "pub-diag-01-room-390.jpg");

  // 设3题
  await ctx.eval("(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change'));}})()");
  await ctx.wait(400);

  // 点开始
  const startRes = await ctx.click("#startBtn");
  ctx.log("startBtn click:", startRes);
  await ctx.wait(3000);

  ctx.log("after start URL:", await ctx.url());
  ctx.log("after start body:", await ctx.eval("document.body.innerText.slice(0,500)"));
  await ctx.shot(Q + "pub-diag-02-afterstart-390.jpg");

  // 深度检查DOM
  ctx.log("=== DOM ELEMENT IDs ===");
  const allIDs = await ctx.eval("(()=>{const els=[...document.querySelectorAll('[id]')];return els.map(e=>e.id+'('+e.tagName+')').join(', ')})()");
  ctx.log("All IDs:", allIDs);

  ctx.log("=== BUTTONS ===");
  const allBtns = await ctx.eval("[...document.querySelectorAll('button,input[type=button],input[type=submit]')].map(b=>`${b.id||'no-id'}[${b.className.slice(0,30)}]: '${b.textContent.trim().slice(0,30)}'`).join(' | ')");
  ctx.log("All buttons:", allBtns);

  ctx.log("=== INTERACTIVE ELEMENTS ===");
  const clickables = await ctx.eval("[...document.querySelectorAll('[onclick],[class*=btn],[class*=shake],[class*=stick],[class*=tap],[class*=shaker],[class*=charge]')].map(e=>e.id+'['+e.className.slice(0,40)+']').join(' | ')");
  ctx.log("Clickables:", clickables);

  // 摇签区详查
  ctx.log("=== STICKS / SHAKE UI ===");
  const sticksArea = await ctx.eval("(()=>{const area=document.querySelector('[class*=stick],[class*=shake],[class*=sign],#stickContainer,#shakeArea,#stickArea');return area?area.outerHTML.slice(0,500):'not found'})()");
  ctx.log("Sticks area:", sticksArea);

  // 寻找任何看起来像充能按钮的东西
  ctx.log("=== CHARGE/SHAKE BUTTONS ===");
  const shakeUI = await ctx.eval("[...document.querySelectorAll('*')].filter(e=>e.id&&(e.id.toLowerCase().includes('shake')||e.id.toLowerCase().includes('tap')||e.id.toLowerCase().includes('charge')||e.id.toLowerCase().includes('stick'))).map(e=>e.id+'['+e.tagName+']: '+e.className.slice(0,40)).join(' | ')");
  ctx.log("Shake/tap/charge by ID:", shakeUI);

  ctx.log("=== FULL OUTERHTML (first 2000) ===");
  ctx.log(await ctx.eval("document.body.outerHTML.slice(0,2000)"));

  await ctx.shot(Q + "pub-diag-03-stuck-390.jpg");

  // 等待更长时间看是否自动出现
  ctx.log("waiting 5s for any dynamic elements...");
  await ctx.wait(5000);

  ctx.log("=== AFTER 5s IDs ===");
  const allIDs2 = await ctx.eval("(()=>{const els=[...document.querySelectorAll('[id]')];return els.map(e=>e.id+'('+e.tagName+')').join(', ')})()");
  ctx.log("All IDs (5s later):", allIDs2);

  const allBtns2 = await ctx.eval("[...document.querySelectorAll('button')].map(b=>`${b.id||'no-id'}: '${b.textContent.trim().slice(0,30)}'`).join(' | ')");
  ctx.log("All buttons (5s later):", allBtns2);

  ctx.log("body (5s later):", await ctx.eval("document.body.innerText.slice(0,600)"));
  await ctx.shot(Q + "pub-diag-04-5slater-390.jpg");

  // 检查 console 错误
  ctx.log("=== CONSOLE ERRORS ===");
  const errors = ctx.logs.filter(l => l.startsWith('[error]') || l.startsWith('[exception]') || l.startsWith('[warn]'));
  ctx.log(errors.join("\n") || "(none)");
}
