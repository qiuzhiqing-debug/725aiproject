// qaB 任务一 v3：使用时间戳昵称避免 409；在注册前截 recoverLink
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

export default async function (ctx) {
  const waitFor = async (expr, timeout = 15000, step = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { if (await ctx.eval(expr)) return true; } catch {}
      await ctx.wait(step);
    }
    ctx.log("WAITFOR TIMEOUT:", expr);
    return false;
  };

  // ── STEP 0: 清空 ──
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");

  // ── STEP 1: 打开 / → 跳转调酒页 ──
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.wait(2000);
  const url1 = await ctx.url();
  ctx.log("STEP1 url:", url1);
  const redirectedToCocktail = url1.includes("cocktail");
  ctx.log("自动跳转到调酒页:", redirectedToCocktail);
  await ctx.shot(Q + "qaB-01-landing-390.jpg");

  if (!redirectedToCocktail) {
    await ctx.goto("http://127.0.0.1:8787/v2/cocktail.html");
    await ctx.wait(1500);
  }

  // ── STEP 2: 调酒页首屏 ──
  await waitFor("document.getElementById('questionTitle')?.textContent?.length > 0", 10000);
  ctx.log("hostLine:", await ctx.eval("document.getElementById('hostLine')?.textContent"));
  ctx.log("Q1 title:", await ctx.eval("document.getElementById('questionTitle')?.textContent"));
  // 检查 recoverLink（应在答题期间可见）
  const rlVisible = await ctx.eval("!document.getElementById('recoverLink')?.classList.contains('hidden')");
  ctx.log("recoverLink 在答题期间可见:", rlVisible);
  ctx.log("recoverLink 文案:", await ctx.eval("document.getElementById('recoverLink')?.textContent||''"));
  await ctx.shot(Q + "qaB-02-cocktail-390.jpg");

  // ── STEP 3: 答4题 ──
  await ctx.clickText(".quiz-option", "威士忌");
  await ctx.wait(500);
  ctx.log("Q2:", await ctx.eval("document.getElementById('questionTitle')?.textContent"));
  await ctx.clickText(".quiz-option", "鲜榨青柠");
  await ctx.wait(500);
  ctx.log("Q3:", await ctx.eval("document.getElementById('questionTitle')?.textContent"));
  await ctx.clickText(".quiz-option", "一颗酒渍樱桃");
  await ctx.wait(500);
  ctx.log("Q4:", await ctx.eval("document.getElementById('questionTitle')?.textContent"));
  await ctx.clickText(".quiz-option", "一颗大方冰");
  await ctx.wait(900);

  // ── STEP 4: 等摇酒区 + 检查 recoverLink 状态 ──
  await waitFor("!document.getElementById('mixing')?.classList.contains('hidden')", 8000);
  ctx.log("mixCaption:", await ctx.eval("document.getElementById('mixCaption')?.textContent"));
  ctx.log("recoverLink 在摇酒期间:", await ctx.eval("!document.getElementById('recoverLink')?.classList.contains('hidden')"));
  await ctx.shot(Q + "qaB-03-shaker-390.jpg");

  // ── STEP 5: 摇酒 (SHAKE_TARGET=130, 每次+14, 首次click触发降级后续也每次+14) ──
  await waitFor("document.getElementById('mixShaker')?.innerHTML?.length > 100", 6000);
  await ctx.click("#mixShaker");
  await ctx.wait(1200);
  for (let i = 0; i < 14; i++) { await ctx.click("#mixShaker"); await ctx.wait(150); }
  ctx.log("mixCaption after shake:", await ctx.eval("document.getElementById('mixCaption')?.textContent"));
  await ctx.shot(Q + "qaB-04-shaking-390.jpg");
  await ctx.wait(4000); // 等倒酒动画完成
  ctx.log("mixCaption after pour:", await ctx.eval("document.getElementById('mixCaption')?.textContent"));

  // ── STEP 6: 结果卡 ──
  await waitFor("document.getElementById('result')&&!document.getElementById('result').classList.contains('hidden')", 12000);
  await ctx.shot(Q + "qaB-05-result-card-390.jpg");
  ctx.log("result name:", await ctx.eval("document.getElementById('resultName')?.textContent"));
  ctx.log("result recipe:", await ctx.eval("document.getElementById('resultRecipe')?.textContent"));
  ctx.log("result intro:", await ctx.eval("document.getElementById('resultIntro')?.textContent"));

  // ── STEP 7: 注册 ──
  await ctx.click("#resultGo");
  await ctx.wait(1500);
  await waitFor("document.getElementById('register')&&!document.getElementById('register').classList.contains('hidden')", 8000);
  await ctx.shot(Q + "qaB-06-register-390.jpg");

  // 用唯一昵称（时间戳后4位）
  const nick = "qa" + String(Date.now()).slice(-4);
  ctx.log("用昵称:", nick);
  await ctx.type("#regName", nick);
  await ctx.type("#regPass", "1234");
  await ctx.eval("(()=>{const b=document.querySelector('#regGender button[data-v=\"f\"]');if(b)b.click();return!!b})()");
  await ctx.wait(300);
  await ctx.eval("(()=>{const b=document.querySelector('#regSeeking button[data-v=\"m\"]');if(b)b.click();return!!b})()");
  await ctx.wait(300);
  ctx.log("pick state:", await ctx.eval("JSON.stringify({g:document.querySelector('#regGender button.on')?.dataset?.v,s:document.querySelector('#regSeeking button.on')?.dataset?.v})"));
  await ctx.shot(Q + "qaB-07-register-filled-390.jpg");

  await ctx.click("#regSubmit");
  await ctx.wait(4000);
  const regMsg = await ctx.eval("document.getElementById('regMsg')?.textContent||''");
  ctx.log("regMsg:", regMsg);
  ctx.log("after submit url:", await ctx.url());
  const lsAfter = await ctx.eval("JSON.stringify({uid:localStorage.getItem('ideal_userId'),tok:!!localStorage.getItem('ideal_token'),name:localStorage.getItem('mfn_name'),cocktail:!!localStorage.getItem('ideal_cocktail')})");
  ctx.log("localStorage after reg:", lsAfter);

  // 等跳转到 lobby
  await waitFor("location.href.includes('lobby')", 8000);
  const lobbyUrl = await ctx.url();
  ctx.log("lobby URL:", lobbyUrl);

  // ── STEP 8: 大厅 ──
  if (!lobbyUrl.includes("lobby")) {
    ctx.log("! 未到大厅，手动导航");
    await ctx.goto("http://127.0.0.1:8787/v2/lobby.html");
    await ctx.wait(2000);
  }
  await ctx.shot(Q + "qaB-08-lobby-390.jpg");
  ctx.log("lobby text:", await ctx.eval("document.body.innerText.slice(0,300)"));

  // ── STEP 9: solo 入口文案 ──
  const soloHint = await ctx.eval("document.querySelector('.solo-hint')?.textContent||'NOT FOUND'");
  const soloLabel = await ctx.eval("document.querySelector('.solo-label')?.textContent||'NOT FOUND'");
  ctx.log("solo-hint:", soloHint);
  ctx.log("solo-label:", soloLabel);
  ctx.log("soloSeat title:", await ctx.eval("document.getElementById('soloSeat')?.title||'NOT FOUND'"));
  ctx.log("有'每人轮数':", (soloHint+soloLabel).includes("每人轮数"));
  ctx.log("有老K对聊:", (soloHint+soloLabel).includes("老K") || (soloHint+soloLabel).includes("聊"));
  await ctx.shot(Q + "qaB-09-solo-seat-390.jpg");

  // ── STEP 10: 进 solo ──
  await ctx.click("#soloSeat");
  await ctx.wait(2000);
  const soloUrl = await ctx.url();
  ctx.log("solo url:", soloUrl);
  ctx.log("solo param OK:", soloUrl.includes("solo=1"));
  await ctx.shot(Q + "qaB-10-solo-home-390.jpg");
  ctx.log("solo home text:", await ctx.eval("document.body.innerText.slice(0,300)"));

  // nameIn 预填情况
  const preFill = await ctx.eval("document.getElementById('nameIn')?.value||''");
  ctx.log("nameIn preFilled:", preFill);
  if (!preFill) await ctx.type("#nameIn", nick);

  await ctx.click("#createBtn");
  await ctx.wait(3000);
  ctx.log("after create text:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // solo 模式：createBtn 后显示房间等候区，需要点 #startBtn 开局
  const hasStartBtn = await ctx.eval("!!document.getElementById('startBtn')");
  ctx.log("hasStartBtn:", hasStartBtn);
  if (hasStartBtn) {
    // 选3轮（最快）
    await ctx.eval("(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change'));}return'ok'})()");
    await ctx.wait(400);
    await ctx.click("#startBtn");
    await ctx.wait(2000);
    ctx.log("after startBtn text:", await ctx.eval("document.body.innerText.slice(0,300)"));
  }

  // ── STEP 11: 摇签 ──
  await waitFor("document.getElementById('shakeBtn')", 12000);
  await ctx.shot(Q + "qaB-11-solo-shake-390.jpg");
  ctx.log("shakeBtn:", await ctx.eval("document.getElementById('shakeBtn')?.textContent"));
  await ctx.click("#shakeBtn");
  await ctx.wait(2000);
  for (let i = 0; i < 12; i++) { await ctx.click("#tapBtn"); await ctx.wait(90); }
  await waitFor("document.getElementById('doneBtn')", 8000);
  ctx.log("drawn:", await ctx.eval("document.querySelector('.stick-out')?.textContent||document.body.innerText.slice(0,200)"));
  await ctx.shot(Q + "qaB-12-solo-drawn-390.jpg");
  await ctx.click("#doneBtn");

  // 选人设
  await waitFor("document.querySelector('[data-g]')", 8000);
  await ctx.click('[data-g="m"]');

  // ── STEP 12: 2轮答题 ──
  for (let round = 1; round <= 2; round++) {
    await waitFor("document.getElementById('submitBtn')", 12000);
    const qText = await ctx.eval("document.querySelector('.question-card')?.innerText||document.querySelector('h2')?.innerText||'?'");
    ctx.log(`Q${round}:`, qText.slice(0, 100));
    const laok = await ctx.eval("(()=>{const els=[...document.querySelectorAll('[class*=laok],[class*=bartender],[class*=king]')];return els.map(e=>e.textContent.trim()).filter(Boolean).slice(0,3).join(' | ')||'(无老K文字区)'})()");
    ctx.log(`Q${round} 老K(开题):`, laok.slice(0, 150));
    await ctx.shot(Q + `qaB-13-solo-q${round}-390.jpg`);

    await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));return'ok'})()");
    await ctx.click("#submitBtn");
    await ctx.wait(800);
    await waitFor("document.getElementById('nextBtn')", 12000);
    const reveal = await ctx.eval("document.body.innerText.slice(0,500)");
    ctx.log(`Q${round} 开牌文本:`, reveal.slice(0, 200));
    const laokReveal = await ctx.eval("(()=>{const els=[...document.querySelectorAll('[class*=laok],[class*=bartender],[class*=king]')];return els.map(e=>e.textContent.trim()).filter(Boolean).slice(0,3).join(' | ')||'(无老K文字区)'})()");
    ctx.log(`Q${round} 老K(开牌):`, laokReveal.slice(0, 200));
    await ctx.shot(Q + `qaB-14-solo-reveal${round}-390.jpg`);
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  const userId = await ctx.eval("localStorage.getItem('ideal_userId')");
  ctx.log("=== 任务一完成 ===");
  ctx.log("userId:", userId);
  ctx.log("nick:", nick);
}
