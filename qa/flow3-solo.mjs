// 流程3: 单人模式 /?solo=1 全流程 → aha → 档案 u.html
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

export default async function (ctx) {
  const waitFor = async (expr, timeout = 15000, step = 400) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await ctx.eval(expr)) return true; } catch {}
      await ctx.wait(step);
    }
    ctx.log("WAITFOR TIMEOUT:", expr);
    return false;
  };

  await ctx.goto("http://127.0.0.1:8787/?solo=1");
  await ctx.eval(`localStorage.setItem('ideal_cocktail', JSON.stringify({name:'雾中花园·防火墙',glass:'highball',palette:['#16536e','#2ea8c8','#b8e858'],ice:3,garnish:1,intro:'x',recipe:'金酒 · 鲜榨青柠 · 焦皮柠檬 · 满杯冰',answers:[0,1,1,3]}))`);
  await ctx.goto("http://127.0.0.1:8787/?solo=1");
  await ctx.wait(1500);
  await ctx.shot(Q + "qa2-14-单人首页-390.jpg");
  ctx.log("solo home text:", await ctx.eval("document.body.innerText.slice(0,300)"));

  await ctx.type("#nameIn", "独酌客");
  await ctx.click("#createBtn");
  await waitFor("document.body.innerText.includes('开局')", 10000);
  await ctx.shot(Q + "qa2-15-单人房间-390.jpg");
  ctx.log("solo lobby text:", await ctx.eval("document.body.innerText.slice(0,500)"));

  // 3 轮更快
  await ctx.eval("(()=>{const s=document.getElementById('roundsSel'); if(s){s.value='3'; s.dispatchEvent(new Event('change'));} return 'ok'})()");
  await ctx.wait(400);
  await ctx.click("#startBtn");
  await waitFor("document.getElementById('shakeBtn')||document.getElementById('tapBtn')", 10000);
  await ctx.shot(Q + "qa2-16-摇签-390.jpg");

  // 摇签: 点主按钮 → 降级连点
  await ctx.click("#shakeBtn");
  await ctx.wait(2000);
  for (let i = 0; i < 12; i++) { await ctx.click("#tapBtn"); await ctx.wait(90); }
  await waitFor("document.getElementById('doneBtn')", 8000);
  ctx.log("drawn text:", await ctx.eval("document.querySelector('.stick-out')?.textContent"));
  await ctx.shot(Q + "qa2-17-出签-390.jpg");
  await ctx.click("#doneBtn");
  await waitFor("document.querySelector('[data-g]')", 8000);
  ctx.log("setup text:", await ctx.eval("document.body.innerText.slice(0,300)"));
  await ctx.click('[data-g="m"]');

  // 3 轮答题循环
  for (let round = 1; round <= 3; round++) {
    await waitFor("document.getElementById('submitBtn')", 10000);
    ctx.log(`R${round} question:`, await ctx.eval("document.querySelector('.question-card')?.innerText"));
    if (round === 1) await ctx.shot(Q + "qa2-18-单人答题-390.jpg");
    // 拖分数到 8
    await ctx.eval("(()=>{const s=document.getElementById('slider'); s.value=8; s.dispatchEvent(new Event('input')); return 'ok'})()");
    await ctx.click("#submitBtn");
    // 单人无猜分者 → 应直接开牌
    await waitFor("document.getElementById('nextBtn')", 10000);
    ctx.log(`R${round} reveal:`, await ctx.eval("document.body.innerText.slice(0,400)"));
    if (round === 1) await ctx.shot(Q + "qa2-19-单人开牌-390.jpg");
    ctx.log(`R${round} next btn:`, await ctx.eval("document.getElementById('nextBtn')?.textContent"));
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  // aha 理想型
  await waitFor("document.querySelector('.aha-stage')", 20000);
  await ctx.wait(3000); // 等立绘
  await ctx.shot(Q + "qa2-20-理想型亮相-390.jpg");
  ctx.log("aha text:", await ctx.eval("document.body.innerText.slice(0,500)"));
  // 翻到档案页
  await ctx.click("#stageNext");
  await ctx.wait(800);
  await ctx.shot(Q + "qa2-21-相亲档案-390.jpg");
  ctx.log("profile card:", await ctx.eval("document.body.innerText.slice(0,700)"));
  await ctx.click("#stageNext");
  await ctx.wait(800);
  await ctx.shot(Q + "qa2-22-相处细节-390.jpg");
  // 生成海报
  await ctx.click("#posterBtn");
  await waitFor("document.querySelector('.poster-img')", 25000);
  await ctx.shot(Q + "qa2-23-海报-390.jpg");

  // 收局
  await ctx.click("#nextBtn");
  await ctx.wait(1500);
  ctx.log("finished text:", await ctx.eval("document.body.innerText.slice(0,300)"));

  // 用户档案
  await ctx.goto("http://127.0.0.1:8787/u.html");
  await ctx.wait(3500);
  ctx.log("u URL:", await ctx.url());
  ctx.log("u text:", await ctx.eval("document.body.innerText.slice(0,600)"));
  await ctx.shot(Q + "qa2-24-用户档案-390.jpg");
  ctx.log("record img srcs:", await ctx.eval("[...document.querySelectorAll('.record-card-portrait')].map(i=>i.src+' natural='+i.naturalWidth).join(' | ')||'none'"));
}
