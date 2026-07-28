// P0 修复验证: solo 全流程 → aha 三页 → 海报 → finished 判重 → 深链 table 文案
const Q = "d:/AIgo/理想型加载中/满分男/qa/";
const BASE = "http://127.0.0.1:8787";

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

  // 干净起局: 清 localStorage(新用户档案, 判重从零验证)
  await ctx.goto(BASE + "/?solo=1");
  await ctx.eval("localStorage.clear()");
  await ctx.eval(`localStorage.setItem('ideal_cocktail', JSON.stringify({name:'雾中花园·防火墙',glass:'highball'}))`);
  await ctx.goto(BASE + "/?solo=1");
  await ctx.wait(1200);

  await ctx.type("#nameIn", "独酌客");
  await ctx.click("#createBtn");
  await waitFor("document.body.innerText.includes('开局')", 10000);
  ctx.log("deck row:", await ctx.eval("document.querySelector('#deckSel')?.selectedOptions?.[0]?.textContent || 'none'"));

  await ctx.eval("(()=>{const s=document.getElementById('roundsSel'); if(s){s.value='3'; s.dispatchEvent(new Event('change'));} return 'ok'})()");
  await ctx.wait(400);
  await ctx.click("#startBtn");
  await waitFor("document.getElementById('shakeBtn')||document.getElementById('tapBtn')", 10000);
  await ctx.shot(Q + "g-fix-sticks-390.jpg");
  ctx.log("sticks progress text:", await ctx.eval("document.getElementById('chargeBar')?.textContent"));

  await ctx.click("#shakeBtn");
  await ctx.wait(1600);
  for (let i = 0; i < 12; i++) { await ctx.click("#tapBtn"); await ctx.wait(90); }
  await waitFor("document.getElementById('doneBtn')", 8000);
  await ctx.click("#doneBtn");
  await waitFor("document.querySelector('[data-g]')", 8000);
  await ctx.click('[data-g="m"]');

  for (let round = 1; round <= 3; round++) {
    await waitFor("document.getElementById('submitBtn')", 10000);
    await ctx.eval("(()=>{const s=document.getElementById('slider'); s.value=8; s.dispatchEvent(new Event('input')); return 'ok'})()");
    await ctx.click("#submitBtn");
    await waitFor("document.getElementById('nextBtn')", 10000);
    if (round === 1) {
      await ctx.shot(Q + "g-fix-reveal-solo-390.jpg");
      ctx.log("solo reveal has results panel:", await ctx.eval("!!document.querySelector('.reveal-row')"));
      ctx.log("solo reveal has comment input:", await ctx.eval("!!document.getElementById('cmtIn')"));
    }
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  // aha 第 1 页
  await waitFor("document.querySelector('.aha-stage')", 20000);
  await ctx.wait(3000);
  await ctx.shot(Q + "g-fix-aha1-390.jpg");
  ctx.log("aha1 chip:", await ctx.eval("document.querySelector('.archetype-chip')?.textContent || 'NO-CHIP'"));
  ctx.log("solo light panel hidden:", await ctx.eval("!document.querySelector('.light-panel')"));

  // 第 2 页(旧崩溃点)
  await ctx.click("#stageNext");
  await ctx.wait(900);
  await ctx.shot(Q + "g-fix-aha2-390.jpg");
  ctx.log("aha2 keywords:", await ctx.eval("[...document.querySelectorAll('.keyword-row span')].map(x=>x.textContent).join('/')||'NONE'"));
  ctx.log("aha2 grid:", await ctx.eval("[...document.querySelectorAll('.profile-grid b')].map(x=>x.textContent).join(' | ')||'NONE'"));
  ctx.log("aha2 fiction note visible:", await ctx.eval("(()=>{const n=document.querySelector('.fiction-note');if(!n)return 'MISSING';const r=n.getBoundingClientRect();return r.height>0?('VISIBLE: '+n.textContent):'ZERO-HEIGHT'})()"));

  // 第 3 页
  await ctx.click("#stageNext");
  await ctx.wait(900);
  await ctx.shot(Q + "g-fix-aha3-390.jpg");
  ctx.log("aha3 heading:", await ctx.eval("document.querySelector('.relationship-stage h2')?.textContent"));
  ctx.log("aha3 chemistry:", await ctx.eval("document.querySelector('.chemistry-tag')?.textContent"));
  ctx.log("aha3 details count:", await ctx.eval("document.querySelectorAll('.relationship-list .detail-item').length"));

  // 海报
  await ctx.click("#posterBtn");
  await waitFor("document.querySelector('.poster-img')", 30000);
  await ctx.shot(Q + "g-fix-poster-390.jpg");
  ctx.log("poster ok:", await ctx.eval("!!document.querySelector('.poster-img')"));

  // 等 KV 写入(立绘加载确认或 10s 兜底) → 收局
  await ctx.wait(11000);
  await ctx.click("#nextBtn");
  await ctx.wait(2000);
  ctx.log("finished text:", await ctx.eval("document.body.innerText.slice(0,200).replace(/\\n/g,' | ')"));
  // finished 阶段复用 renderAha, 停 12s 给旧 bug 的第二次写入机会
  await ctx.wait(12000);

  // 判重验证: 该用户本局应只有 1 条记录
  const userId = await ctx.eval("localStorage.getItem('ideal_userId')");
  const token = await ctx.eval("localStorage.getItem('ideal_token')");
  ctx.log("userId:", userId);
  const view = await ctx.eval(`fetch('/api/user/${userId}?token=${token}').then(r=>r.json())`);
  ctx.log("playCount:", view?.playCount, "records:", JSON.stringify(Object.entries(view?.showcase || {}).map(([k, v]) => k + "x" + v.length)));

  // 深链 table 文案
  const roomUrl = await ctx.url();
  const code = new URL(roomUrl).searchParams.get("room");
  await ctx.eval(`localStorage.removeItem('mfn_token_${code}')`);
  await ctx.goto(`${BASE}/?room=${code}&table=3`);
  await ctx.wait(1200);
  ctx.log("table deeplink text:", await ctx.eval("document.body.innerText.includes('3 号桌，位子给你留着')"));
  ctx.log("table deeplink no-another:", await ctx.eval("!document.querySelector('.link-btn')"));
  await ctx.shot(Q + "g-fix-table-deeplink-390.jpg");
}
