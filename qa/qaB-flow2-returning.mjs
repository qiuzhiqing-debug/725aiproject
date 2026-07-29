// qaB 任务二：老客重新进站
// 测A：保留 localStorage 重开 / → 应跳过注册直接进游戏首页
// 测B：清空 localStorage → 调酒页找"我来过，对暗号" → 正确口令恢复 → 错口令有提示
// 截图命名 qaB-20-* 至 qaB-29-*
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

export default async function (ctx) {
  const waitFor = async (expr, timeout = 12000, step = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await ctx.eval(expr)) return true; } catch {}
      await ctx.wait(step);
    }
    ctx.log("WAITFOR TIMEOUT:", expr);
    return false;
  };

  // ─────────────────────────────────────────────────────
  // 测 A：保留完整 localStorage，重新打开 /
  // 预置一个完整身份（模拟任务一结束后状态）
  // ─────────────────────────────────────────────────────
  ctx.log("=== 测A START: 预置完整 localStorage（模拟任务一完成后） ===");
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");

  // 注册一个账号，获取真实 userId/token
  await ctx.goto("http://127.0.0.1:8787/v2/cocktail.html");
  await ctx.eval(`
    localStorage.setItem('ideal_cocktail', JSON.stringify({
      name:'深夜电台·分寸特调', glass:'rocks',
      palette:['#7a4a1b','#e08a1e','#b8e858'],
      recipe:'威士忌 · 鲜榨青柠 · 酒渍樱桃 · 一颗大方冰',
      answers:[3,1,0,1]
    }));
  `);
  await ctx.wait(500);

  // 注册 → 拿到真实 userId
  let preUserId = null;
  try {
    const regRes = await ctx.eval(`
      (async () => {
        const r = await fetch('/api/user', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            nick: 'coco',
            passcode: '1234',
            gender: 'f',
            seeking: 'm',
            cocktail: { name:'深夜电台·分寸特调', glass:'rocks', answers:[3,1,0,1] }
          })
        });
        const d = await r.json();
        return JSON.stringify(d);
      })()
    `);
    ctx.log("register API result:", regRes);
    const regData = JSON.parse(regRes);
    if (regData.userId) {
      preUserId = regData.userId;
      await ctx.eval(`
        localStorage.setItem('ideal_userId', '${regData.userId}');
        localStorage.setItem('ideal_token', '${regData.token}');
        localStorage.setItem('mfn_name', 'coco');
      `);
      ctx.log("预置 userId:", regData.userId);
    }
  } catch(e) {
    ctx.log("register API failed:", e.message);
  }

  // 现在模拟「重新进站」：导航到 /
  ctx.log("=== 测A: 重新打开 / ===");
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.wait(2000);
  const urlA = await ctx.url();
  ctx.log("URL after reopen /:", urlA);
  await ctx.shot(Q + "qaB-20-returning-home-390.jpg");
  ctx.log("page text:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 关键检测：是否停在 / 或直接去 lobby（不应跳到 cocktail 让重新调酒/注册）
  const isOnCocktail = urlA.includes("cocktail");
  const isOnLobby = urlA.includes("lobby");
  ctx.log("测A结论 - 被迫去调酒页:", isOnCocktail);
  ctx.log("测A结论 - 跳到大厅:", isOnLobby);
  ctx.log("测A结论 - 停在游戏首页:", !isOnCocktail && !isOnLobby);
  // 检查显示了昵称还是空表单
  const nameVal = await ctx.eval("document.getElementById('nameIn')?.value||'NOT FOUND'");
  const cocktailChip = await ctx.eval("document.querySelector('.cocktail-chip')?.textContent?.trim()||'NONE'");
  ctx.log("nameIn value:", nameVal);
  ctx.log("cocktail chip:", cocktailChip.slice(0, 100));

  // 如果在 cocktail 页，检查老K是否识别了 (checkReturning)
  if (isOnCocktail) {
    ctx.log("! 被迫去了 cocktail 页，检查 checkReturning...");
    await ctx.wait(3000); // 等异步校验
    const hostLine = await ctx.eval("document.getElementById('hostLine')?.textContent||''");
    ctx.log("hostLine (应含又是你/欢迎回来):", hostLine);
    const isReturningGreet = hostLine.includes("又是你") || hostLine.includes("欢迎") || hostLine.includes("记得");
    ctx.log("老K 识别老客:", isReturningGreet);
    await ctx.shot(Q + "qaB-21-cocktail-returning-390.jpg");
  }

  // ─────────────────────────────────────────────────────
  // 测 B1：对暗号找回 - 正确口令
  // ─────────────────────────────────────────────────────
  ctx.log("=== 测B1 START: 清 localStorage → 对暗号找回（正确） ===");
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");
  await ctx.wait(500);
  await ctx.goto("http://127.0.0.1:8787/v2/cocktail.html");
  await ctx.wait(2000);
  await ctx.shot(Q + "qaB-22-cocktail-fresh-390.jpg");
  ctx.log("cocktail page host:", await ctx.eval("document.getElementById('hostLine')?.textContent"));

  // 找"我来过，对暗号"入口
  const recoverLinkVisible = await ctx.eval("!document.getElementById('recoverLink')?.classList.contains('hidden')");
  ctx.log("recoverLink visible:", recoverLinkVisible);
  ctx.log("recoverLink text:", await ctx.eval("document.getElementById('recoverLink')?.textContent"));
  await ctx.shot(Q + "qaB-23-recover-link-390.jpg");

  if (!recoverLinkVisible) {
    ctx.log("! recoverLink 不可见，尝试直接点击...");
  }
  await ctx.click("#recoverLink");
  await ctx.wait(800);
  const recoverPanelVisible = await ctx.eval("!document.getElementById('recover')?.classList.contains('hidden')");
  ctx.log("recover panel visible:", recoverPanelVisible);
  await ctx.shot(Q + "qaB-24-recover-panel-390.jpg");
  ctx.log("recover panel text:", await ctx.eval("document.getElementById('recover')?.innerText?.slice(0,200)||'NOT FOUND'"));

  // 输入正确口令
  await ctx.type("#rcName", "coco");
  await ctx.type("#rcPass", "1234");
  await ctx.shot(Q + "qaB-25-recover-filled-390.jpg");
  await ctx.click("#rcGo");
  await ctx.wait(3000);
  const rcMsg = await ctx.eval("document.getElementById('rcMsg')?.textContent||''");
  ctx.log("recover msg (正确口令):", rcMsg);
  const recoverSuccess = rcMsg.includes("对上了") || rcMsg.includes("认得") || rcMsg.includes("柜子");
  ctx.log("正确口令恢复成功:", recoverSuccess);
  await ctx.shot(Q + "qaB-26-recover-correct-result-390.jpg");
  const urlAfterRecover = await ctx.url();
  ctx.log("URL after recover:", urlAfterRecover);
  await ctx.wait(2000); // 等跳转
  ctx.log("URL after recover redirect:", await ctx.url());

  // ─────────────────────────────────────────────────────
  // 测 B2：对暗号找回 - 错口令
  // ─────────────────────────────────────────────────────
  ctx.log("=== 测B2 START: 错口令 ===");
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");
  await ctx.wait(300);
  await ctx.goto("http://127.0.0.1:8787/v2/cocktail.html");
  await ctx.wait(1500);
  await ctx.click("#recoverLink");
  await ctx.wait(600);
  await ctx.type("#rcName", "coco");
  await ctx.type("#rcPass", "9999"); // 错误口令
  await ctx.click("#rcGo");
  await ctx.wait(2500);
  const rcMsgWrong = await ctx.eval("document.getElementById('rcMsg')?.textContent||''");
  ctx.log("recover msg (错口令):", rcMsgWrong);
  const wrongHasKingTone = rcMsgWrong.includes("暗号") || rcMsgWrong.includes("想想") || rcMsgWrong.includes("对不上");
  ctx.log("错口令有老K口吻提示:", wrongHasKingTone);
  await ctx.shot(Q + "qaB-27-recover-wrong-390.jpg");

  // 验证仍在 cocktail 页（没有跳转）
  const stillOnCocktail = (await ctx.url()).includes("cocktail");
  ctx.log("错口令后仍在 cocktail 页:", stillOnCocktail);

  ctx.log("=== 任务二完成 ===");
  ctx.log("preUserId for reference:", preUserId);
}
