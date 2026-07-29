// 公网上线验收流程 — 手机视口 390×844
// 目标: https://ideal-type-loading.kimnin-iup.workers.dev/
// 覆盖: 进站 → 调酒 → 注册 → 大厅 → solo单人局(多题) → 海报 → 主页
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

  // ── STEP 1: 进站 ──────────────────────────────────────────────────
  ctx.log("=== STEP 1: 进站 ===");
  await ctx.goto(BASE + "/");
  await ctx.eval("try{localStorage.clear()}catch(e){}");
  await ctx.wait(500);
  await ctx.goto(BASE + "/");
  await ctx.wait(3000);

  const step1URL = await ctx.url();
  ctx.log("step1 URL:", step1URL);
  ctx.log("redirected to cocktail:", step1URL.includes("cocktail") || step1URL.includes("/?"));

  const hostLine = await ctx.eval("document.getElementById('hostLine')?.textContent || document.querySelector('.host-line,.intro-line,.laok-line')?.textContent || 'NOT FOUND'");
  ctx.log("老K开场台词:", hostLine);

  const bodyText1 = await ctx.eval("document.body.innerText.slice(0,400)");
  ctx.log("page text:", bodyText1);

  const has99 = await ctx.eval("document.body.innerText.includes('99%')");
  const hasOldName = await ctx.eval("document.body.innerText.includes('老K的酒吧')");
  ctx.log("店名含99%:", has99);
  ctx.log("BAD: 含'老K的酒吧':", hasOldName);

  const hasEmojiFlood = await ctx.eval("(document.body.innerText.match(/[\\uD800-\\uDFFF]/g)||[]).length > 10");
  ctx.log("BAD: emoji泛滥(>10):", hasEmojiFlood);

  ctx.log("step1 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-01-进站-390.jpg");

  // ── STEP 2: 调酒四题 ──────────────────────────────────────────────
  ctx.log("=== STEP 2: 调酒 ===");

  await waitFor(ctx, "document.querySelectorAll('.quiz-option').length > 0", 12000);

  const q1Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || 'NO TITLE'");
  ctx.log("Q1 title:", q1Title);

  // 检查"连点摇签"文字（不应存在）
  const hasBadShakeText = await ctx.eval("document.body.innerText.includes('连点摇签')");
  ctx.log("BAD TEXT '连点摇签' on Q1:", hasBadShakeText);

  // Q1 基酒 → 金酒
  let clickRes = await ctx.clickText(".quiz-option", "金酒");
  ctx.log("Q1 click 金酒:", clickRes);
  await ctx.wait(900);

  // Q2 辅料 → 苏打气泡
  const q2Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q2 title:", q2Title);
  clickRes = await ctx.clickText(".quiz-option", "苏打气泡");
  ctx.log("Q2 click 苏打气泡:", clickRes);
  await ctx.wait(900);

  // Q3 装饰 → 一颗酒渍樱桃
  const q3Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q3 title:", q3Title);
  clickRes = await ctx.clickText(".quiz-option", "一颗酒渍樱桃");
  ctx.log("Q3 click 樱桃:", clickRes);
  await ctx.wait(900);

  // Q4 冰量 → 不加冰
  const q4Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q4 title:", q4Title);
  clickRes = await ctx.clickText(".quiz-option", "不加冰");
  ctx.log("Q4 click 不加冰:", clickRes);
  await ctx.wait(900);

  // 等摇壶出现
  await waitFor(ctx, "!document.getElementById('mixing')?.classList.contains('hidden') || !!document.getElementById('mixShaker')", 8000);
  ctx.log("mixing area visible:", await ctx.eval("!document.getElementById('mixing')?.classList.contains('hidden')"));

  // 检查"连点摇签"不应在摇壶页出现
  const hasBadShakeNow = await ctx.eval("document.body.innerText.includes('连点摇签')");
  ctx.log("BAD TEXT '连点摇签' in mixing:", hasBadShakeNow);

  ctx.log("mixCaption:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));
  ctx.log("mixShaker cursor:", await ctx.eval("getComputedStyle(document.getElementById('mixShaker')||document.createElement('span'))?.cursor || 'unknown'"));

  ctx.log("step2 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-02-调酒摇壶-390.jpg");

  // 摇壶：点 #mixShaker 触发摇动
  await ctx.click("#mixShaker");
  await ctx.wait(1800); // 等传感器超时 → 降级为点击充能

  ctx.log("caption after first click:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));

  // 连续点充能
  for (let i = 0; i < 18; i++) {
    await ctx.click("#mixShaker");
    await ctx.wait(100);
  }
  await ctx.wait(1000);
  ctx.log("caption after charge:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));

  // 等倒酒和结果卡
  await ctx.wait(3500);
  await ctx.shot(Q + "pub-03-倒酒-390.jpg");

  await waitFor(ctx, "!document.getElementById('result')?.classList.contains('hidden')", 12000);
  const resultVisible = await ctx.eval("!document.getElementById('result')?.classList.contains('hidden')");
  ctx.log("result visible:", resultVisible);

  const resultName = await ctx.eval("document.getElementById('resultName')?.textContent || 'NOT FOUND'");
  const resultRecipe = await ctx.eval("document.getElementById('resultRecipe')?.textContent || ''");
  ctx.log("result name:", resultName);
  ctx.log("result recipe:", resultRecipe);

  ctx.log("result scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-04-出酒结果-390.jpg");

  // ── STEP 3: 注册 ───────────────────────────────────────────────────
  ctx.log("=== STEP 3: 注册 ===");

  await ctx.click("#resultGo");
  await ctx.wait(2000);

  await waitFor(ctx, "!document.getElementById('register')?.classList.contains('hidden')", 10000);
  const regVisible = await ctx.eval("!document.getElementById('register')?.classList.contains('hidden')");
  ctx.log("register visible:", regVisible);

  // 检查 placeholder
  const namePlaceholder = await ctx.eval("document.getElementById('regName')?.placeholder || 'NOT FOUND'");
  ctx.log("name placeholder:", namePlaceholder);
  ctx.log("BAD: placeholder contains '嘉欣':", namePlaceholder.includes("嘉欣"));
  ctx.log("placeholder contains 'coco':", namePlaceholder.includes("coco"));

  ctx.log("register scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-05-注册表单-390.jpg");

  // 填写
  await ctx.type("#regName", "testpub");
  await ctx.wait(300);
  await ctx.type("#regPass", "pub123");
  await ctx.wait(300);

  // 性别选 女
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regGender button')].find(x=>x.dataset.v==='f'||x.textContent.includes('女'));b&&b.click();return b?'ok':'not found'})()");
  await ctx.wait(300);

  // 取向选 满分男 (m)
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regSeeking button')].find(x=>x.dataset.v==='m'||x.textContent.includes('满分男'));b&&b.click();return b?'ok':'not found'})()");
  await ctx.wait(300);

  await ctx.shot(Q + "pub-06-注册填写-390.jpg");

  // 提交注册
  await ctx.eval("document.getElementById('registerForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await ctx.wait(5000);

  const afterRegURL = await ctx.url();
  ctx.log("after register URL:", afterRegURL);
  ctx.log("redirected to lobby:", afterRegURL.includes("lobby"));

  await ctx.shot(Q + "pub-07-注册提交后-390.jpg");

  // ── STEP 4: 大厅 ──────────────────────────────────────────────────
  ctx.log("=== STEP 4: 大厅 ===");

  if (!afterRegURL.includes("lobby")) {
    ctx.log("未跳转大厅，强制跳转...");
    await ctx.goto(BASE + "/v2/lobby.html");
    await ctx.wait(3000);
  } else {
    await ctx.wait(2500);
  }

  const lobbyURL = await ctx.url();
  ctx.log("lobby URL:", lobbyURL);
  ctx.log("lobby scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  ctx.log("lobby body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  const tablesExist = await ctx.eval("!!document.querySelector('.table[data-table]')");
  ctx.log("table elements exist:", tablesExist);

  await ctx.shot(Q + "pub-08-大厅-390.jpg");

  // 点第一号桌
  if (tablesExist) {
    await ctx.click('.table[data-table="1"]');
    await ctx.wait(3000);
    await ctx.shot(Q + "pub-09-点桌后-390.jpg");
  }

  // ── STEP 5: solo单人局入口 ─────────────────────────────────────────
  ctx.log("=== STEP 5: solo单人局 ===");

  // 直接走 ?solo=1 入口
  await ctx.goto(BASE + "/?solo=1");
  await ctx.wait(2500);

  const soloURL = await ctx.url();
  ctx.log("solo URL:", soloURL);
  ctx.log("solo body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // "一个人？那你和我聊"文案检查
  const hasSoloLine = await ctx.eval("document.body.innerText.includes('一个人') || document.body.innerText.includes('和我聊')");
  ctx.log("solo entrance line present:", hasSoloLine);

  await ctx.shot(Q + "pub-10-solo入口-390.jpg");

  // 等单人房间界面
  await waitFor(ctx, "!!document.getElementById('nameIn')||!!document.getElementById('createBtn')", 10000);
  const nameInVal = await ctx.eval("document.getElementById('nameIn')?.value || ''");
  ctx.log("nameIn prefilled:", nameInVal);
  if (!nameInVal) {
    await ctx.type("#nameIn", "testpub");
  }
  await ctx.wait(300);
  await ctx.click("#createBtn");
  await waitFor(ctx, "document.body.innerText.includes('开局')||!!document.getElementById('startBtn')", 12000);
  ctx.log("room body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 设为3题最快
  await ctx.eval("(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change'));}})()");
  await ctx.wait(400);

  await ctx.shot(Q + "pub-11-solo房间-390.jpg");

  await ctx.click("#startBtn");
  await waitFor(ctx, "document.getElementById('shakeBtn')||document.getElementById('submitBtn')||document.getElementById('slider')", 15000);

  // 签筒阶段
  const inSticks = await ctx.eval("!!document.getElementById('shakeBtn') && !!document.getElementById('chargeBar')");
  ctx.log("in sticks phase:", inSticks);

  if (inSticks) {
    ctx.log("sticks body:", await ctx.eval("document.body.innerText.slice(0,300)"));
    await ctx.shot(Q + "pub-12-摇签-390.jpg");

    await ctx.click("#shakeBtn");
    await ctx.wait(1500);

    for (let i = 0; i < 15; i++) {
      await ctx.eval("(()=>{const b=document.getElementById('tapBtn');b&&b.click()})()");
      await ctx.wait(90);
    }

    await waitFor(ctx, "document.getElementById('doneBtn')", 8000);
    const stickDrawn = await ctx.eval("document.querySelector('.stick-out,.stick-name')?.textContent?.trim() || 'none'");
    ctx.log("drawn:", stickDrawn);
    await ctx.shot(Q + "pub-13-出签-390.jpg");

    await ctx.click("#doneBtn");
    await ctx.wait(1500);

    await waitFor(ctx, "document.querySelector('[data-g]')", 8000);
    await ctx.eval("(()=>{const b=document.querySelector('[data-g=\"m\"]');b&&b.click()})()");
    ctx.log("selected deck:", await ctx.eval("document.querySelector('[data-g=\"m\"]')?.textContent || 'not found'"));
    await ctx.wait(1000);
  }

  // ── STEP 5b: 游戏题目页 ─────────────────────────────────────────
  ctx.log("=== STEP 5b: 游戏题目页 ===");
  await waitFor(ctx, "document.getElementById('submitBtn')||document.getElementById('slider')", 15000);

  // 顶栏 logo 检查
  const brandMarkHTML = await ctx.eval("document.querySelector('.brand-mark')?.outerHTML || 'not found'");
  ctx.log("brand-mark HTML:", brandMarkHTML.slice(0, 400));

  const logoIsK = await ctx.eval("(()=>{const bm=document.querySelector('.brand-mark');return bm?bm.textContent.trim()==='K':false})()");
  ctx.log("BAD: logo is letter K:", logoIsK);

  const logoHasSVGPath = await ctx.eval("!!document.querySelector('.brand-mark svg path')");
  ctx.log("logo has SVG path (martini cup):", logoHasSVGPath);

  // 进度文字检查
  const allDims = await ctx.eval("[...document.querySelectorAll('.dim')].map(e=>e.textContent.trim()).filter(Boolean).join(' | ')");
  ctx.log("all .dim texts:", allDims);

  const hasQProgress = await ctx.eval("!!document.body.innerText.match(/第\\s*\\d+\\s*\\/\\s*\\d+\\s*题/)");
  ctx.log("'第X/Y题' regex match:", hasQProgress);

  const hasRoundsBad = await ctx.eval("document.body.innerText.includes('每人轮数')");
  ctx.log("BAD TEXT '每人轮数':", hasRoundsBad);

  ctx.log("game scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-14-游戏题目-390.jpg");

  // ── STEP 6: 答题循环(3轮) ─────────────────────────────────────────
  ctx.log("=== STEP 6: 答题循环 ===");

  for (let r = 1; r <= 3; r++) {
    ctx.log(`--- Round ${r} ---`);

    await waitFor(ctx, "document.getElementById('slider')||document.getElementById('submitBtn')", 12000);

    const hasSlider = await ctx.eval("!!document.getElementById('slider')");
    if (hasSlider) {
      await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));})()");
      await ctx.wait(500);
    }

    const questText = await ctx.eval("document.querySelector('.question-card,.glass')?.innerText?.slice(0,200) || document.body.innerText.slice(0,200)");
    ctx.log(`R${r} question:`, questText);

    await ctx.shot(Q + `pub-15-R${r}题目-390.jpg`);

    await ctx.click("#submitBtn");
    await ctx.wait(1500);

    await waitFor(ctx, "document.getElementById('nextBtn')||document.querySelector('.aha-stage')", 15000);

    const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
    if (atAha) {
      ctx.log(`R${r}: arrived at aha early`);
      break;
    }

    // 结算页：老K锐评检查
    const revealBody = await ctx.eval("document.body.innerText.slice(0,800)");
    ctx.log(`R${r} reveal body:`, revealBody);

    // 检查老K锐评框有字
    const laokByClass = await ctx.eval("[...document.querySelectorAll('[class*=laok],[class*=k-line],[class*=kline],[class*=king-line]')].map(e=>e.textContent?.trim()).filter(Boolean).join(' | ') || 'none by class'");
    ctx.log(`R${r} laok by class:`, laokByClass);

    const laokById = await ctx.eval("document.getElementById('laokBox')?.innerText || document.getElementById('laok')?.innerText || document.querySelector('.laok-box')?.innerText || 'not found by id'");
    ctx.log(`R${r} laok by id:`, laokById);

    // 找含文字的锐评（更宽泛搜索）
    const laokAny = await ctx.eval("(()=>{ const candidates = [...document.querySelectorAll('p,div,span')].filter(e=>e.childElementCount===0&&e.textContent.trim().length>8&&e.closest('[class*=laok],[class*=reveal],[class*=result]'));return candidates.map(e=>e.textContent.trim().slice(0,50)).join(' | ') || 'none found' })()");
    ctx.log(`R${r} laok any candidates:`, laokAny);

    if (r === 1) {
      ctx.log("R1 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
      await ctx.shot(Q + "pub-16-R1揭晓-390.jpg");
    }
    if (r === 2) await ctx.shot(Q + "pub-17-R2揭晓-390.jpg");
    if (r === 3) await ctx.shot(Q + "pub-18-R3揭晓-390.jpg");

    const nextText = await ctx.eval("document.getElementById('nextBtn')?.textContent || 'none'");
    ctx.log(`R${r} nextBtn:`, nextText);
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  // ── aha + 档案 ────────────────────────────────────────────────────
  await waitFor(ctx, "document.querySelector('.aha-stage')||document.getElementById('posterBtn')", 20000);
  const atAha2 = await ctx.eval("!!document.querySelector('.aha-stage')");
  ctx.log("at aha stage:", atAha2);

  if (atAha2) {
    await ctx.wait(2500);
    ctx.log("aha body:", await ctx.eval("document.body.innerText.slice(0,600)"));
    ctx.log("aha scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "pub-19-理想型亮相-390.jpg");

    if (await ctx.eval("!!document.getElementById('stageNext')")) {
      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "pub-20-相亲档案-390.jpg");

      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "pub-21-相处细节-390.jpg");
    }
  }

  // ── STEP 6(海报): 生成海报 ─────────────────────────────────────────
  ctx.log("=== STEP 6: 海报 ===");

  await waitFor(ctx, "!!document.getElementById('posterBtn')", 10000);
  const hasPosterBtn = await ctx.eval("!!document.getElementById('posterBtn')");
  ctx.log("posterBtn present:", hasPosterBtn);

  if (hasPosterBtn) {
    await ctx.click("#posterBtn");
    await waitFor(ctx, "document.querySelector('.poster-img,.poster-wrap,.poster-canvas')", 30000);
    await ctx.wait(2500);

    const posterBody = await ctx.eval("document.body.innerText.slice(0,500)");
    ctx.log("poster body:", posterBody);

    // 检查"进入我的主页"按钮
    const profileBtnText = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.textContent?.trim() || 'not found'");
    ctx.log("进入我的主页 btn:", profileBtnText);

    // 检查按钮类型（可点击性）
    const profileBtnTag = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.tagName || 'none'");
    ctx.log("进入我的主页 btn tag:", profileBtnTag);

    ctx.log("poster scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "pub-22-海报-390.jpg");

    // ── STEP 7: 点"进入我的主页" ──────────────────────────────────
    ctx.log("=== STEP 7: 进入我的主页 ===");
    const profileBtnHref = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.href || ''");
    ctx.log("进入我的主页 href:", profileBtnHref);

    const clickProfile = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.click() || 'none'");
    ctx.log("click profile result:", clickProfile);
    await ctx.wait(3000);

    const profileURL = await ctx.url();
    ctx.log("profile URL:", profileURL);
    ctx.log("at /u page:", profileURL.includes("/u") || profileURL.includes("user"));

  } else {
    ctx.log("NO posterBtn found — stuck");
    ctx.log("current body:", await ctx.eval("document.body.innerText.slice(0,400)"));
    await ctx.shot(Q + "pub-22-海报未找到-390.jpg");
  }

  // ── STEP 7b: /u 主页 ──────────────────────────────────────────────
  ctx.log("=== STEP 7b: /u 主页 ===");
  await ctx.goto(BASE + "/u");
  await ctx.wait(4000);

  const uURL = await ctx.url();
  ctx.log("u URL:", uURL);
  const uBody = await ctx.eval("document.body.innerText.slice(0,600)");
  ctx.log("u body:", uBody);
  ctx.log("u scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-23-主页u-390.jpg");

  // ── 汇总 console 报错 ─────────────────────────────────────────────
  ctx.log("=== CONSOLE ERRORS / EXCEPTIONS ===");
  const errors = ctx.logs.filter(l => l.startsWith('[error]') || l.startsWith('[exception]') || l.startsWith('[warn]'));
  ctx.log(errors.length > 0 ? errors.join("\n") : "(none)");
  ctx.log("=== ALL LOGS END ===");
}
