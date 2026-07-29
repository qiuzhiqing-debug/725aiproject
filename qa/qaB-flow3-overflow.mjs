// qaB 任务三：全站手机端破版扫描 (390×844)
// 截图命名 qaB-30-* 至 qaB-39-*
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

export default async function (ctx) {
  // 先获取一个有效 userId
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");
  // 预置调酒身份
  await ctx.eval(`
    localStorage.setItem('ideal_cocktail', JSON.stringify({
      name:'深夜电台·分寸特调', glass:'rocks',
      palette:['#7a4a1b','#e08a1e','#b8e858'],
      recipe:'威士忌 · 鲜榨青柠 · 酒渍樱桃 · 一颗大方冰',
      answers:[3,1,0,1]
    }));
    localStorage.setItem('mfn_name','coco');
  `);
  // 尝试注册获取 userId
  let userId = null;
  try {
    const r = await ctx.eval(`
      (async () => {
        const resp = await fetch('/api/user', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            nick:'coco', passcode:'1234', gender:'f', seeking:'m',
            cocktail:{name:'深夜电台·分寸特调',glass:'rocks',answers:[3,1,0,1]}
          })
        });
        const d = await resp.json();
        if(d.userId){ localStorage.setItem('ideal_userId',d.userId); localStorage.setItem('ideal_token',d.token); }
        return d.userId||'';
      })()
    `);
    userId = r;
    ctx.log("userId for overflow test:", userId);
  } catch(e) {
    ctx.log("userId fetch failed:", e.message);
  }

  const checkOverflow = async (label, url, shotFile) => {
    await ctx.goto(url);
    await ctx.wait(2500);
    const sw = await ctx.eval("document.documentElement.scrollWidth");
    const cw = await ctx.eval("document.documentElement.clientWidth");
    const overflow = sw > 390;
    ctx.log(`[${label}] scrollWidth=${sw} clientWidth=${cw} overflow=${overflow}`);
    // 收集可见文本概要
    const text = await ctx.eval("document.body?.innerText?.slice(0,200)||''");
    ctx.log(`[${label}] text:`, text.replace(/\n/g,' ').slice(0,150));
    // console errors
    const errs = ctx.logs.filter(l => l.startsWith('[error]') || l.startsWith('[exception]'));
    if (errs.length) ctx.log(`[${label}] ERRORS:`, errs.join(' | '));
    await ctx.shot(shotFile);
    return { label, url, sw, overflow };
  };

  const results = [];

  // 1. / → 调酒页（localStorage 无 cocktail）
  await ctx.eval("localStorage.removeItem('ideal_cocktail')");
  results.push(await checkOverflow("/ 无cocktail→调酒页", "http://127.0.0.1:8787/", Q + "qaB-30-root-nocktl-390.jpg"));
  // 恢复 cocktail
  await ctx.eval(`localStorage.setItem('ideal_cocktail', JSON.stringify({name:'深夜电台·分寸特调',glass:'rocks',palette:['#7a4a1b','#e08a1e','#b8e858'],recipe:'威士忌',answers:[3,1,0,1]}))`);

  // 2. / 有 cocktail → game home
  results.push(await checkOverflow("/ 有cocktail→game home", "http://127.0.0.1:8787/", Q + "qaB-31-root-game-390.jpg"));

  // 3. /v2/lobby.html
  results.push(await checkOverflow("/v2/lobby.html", "http://127.0.0.1:8787/v2/lobby.html", Q + "qaB-32-lobby-390.jpg"));

  // 4. /u.html?id=<userId>
  const uUrl = userId ? `http://127.0.0.1:8787/u.html?id=${encodeURIComponent(userId)}` : "http://127.0.0.1:8787/u.html";
  results.push(await checkOverflow("/u.html", uUrl, Q + "qaB-33-profile-390.jpg"));

  // 5. /?solo=1
  results.push(await checkOverflow("/?solo=1", "http://127.0.0.1:8787/?solo=1", Q + "qaB-34-solo-home-390.jpg"));

  // 6. /v2/cocktail.html
  await ctx.eval("localStorage.removeItem('ideal_cocktail')");
  results.push(await checkOverflow("/v2/cocktail.html", "http://127.0.0.1:8787/v2/cocktail.html", Q + "qaB-35-cocktail-390.jpg"));

  // 7. preview=reveal
  await ctx.eval(`localStorage.setItem('ideal_cocktail', JSON.stringify({name:'深夜电台·分寸特调',glass:'rocks',palette:['#7a4a1b','#e08a1e','#b8e858'],recipe:'威士忌',answers:[3,1,0,1]}))`);
  results.push(await checkOverflow("/?preview=reveal", "http://127.0.0.1:8787/?preview=reveal", Q + "qaB-36-preview-reveal-390.jpg"));

  // 8. preview=poster
  results.push(await checkOverflow("/?preview=poster", "http://127.0.0.1:8787/?preview=poster", Q + "qaB-37-preview-poster-390.jpg"));

  // ── 汇总 ──
  ctx.log("=== 溢出扫描汇总 ===");
  for (const r of results) {
    ctx.log(`${r.overflow ? "❌ 溢出" : "✅ 正常"} [${r.label}] scrollWidth=${r.sw}`);
  }
  const overflowPages = results.filter(r => r.overflow);
  ctx.log(`溢出页面共 ${overflowPages.length} 个`);
  ctx.log("=== 任务三完成 ===");
}
