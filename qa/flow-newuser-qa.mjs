// 新用户全流程 QA — 手机视口 390×844
// 覆盖: 进站 → 调酒(选+摇) → 注册 → 大厅 → 游戏 → 结算 → 国王 → 海报 → 主页
// 修正版：正确的选项文案、正确的摇壶交互(#mixShaker)
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

const waitFor = async (ctx, expr, timeout = 12000, step = 400) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ctx.eval(expr)) return true; } catch {}
    await ctx.wait(step);
  }
  ctx.log("WAITFOR TIMEOUT:", expr);
  return false;
};

export default async function (ctx) {

  // ── STEP 1: 进站 ─────────────────────────────────────────────────
  ctx.log("=== STEP 1: 进站 ===");
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.eval("localStorage.clear()");
  await ctx.wait(300);
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.wait(2500);

  const step1URL = await ctx.url();
  ctx.log("step1 URL:", step1URL);
  const redirectedCocktail = step1URL.includes("cocktail");
  ctx.log("redirected to cocktail:", redirectedCocktail);

  const hostLine = await ctx.eval("document.getElementById('hostLine')?.textContent || 'NOT FOUND'");
  ctx.log("老K开场台词:", hostLine);

  const bodyText1 = await ctx.eval("document.body.innerText.slice(0,300)");
  ctx.log("page text:", bodyText1);

  // 检查店名：不应出现"老K的酒吧"，应出现"99%"
  const has99 = await ctx.eval("document.body.innerText.includes('99%')");
  const hasOldName = await ctx.eval("document.body.innerText.includes('老K的酒吧')");
  ctx.log("店名含99%:", has99, "含'老K的酒吧'(bad):", hasOldName);

  ctx.log("step1 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-01-进站-390.jpg");

  // ── STEP 2: 选酒 (4题) ───────────────────────────────────────────
  ctx.log("=== STEP 2: 选酒 ===");

  // 等第一题选项
  await waitFor(ctx, "document.querySelectorAll('.quiz-option').length > 0", 8000);

  const q1Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || 'NO TITLE'");
  ctx.log("Q1 title:", q1Title);

  // 检查"连点摇签"文字（不应在 Q1 出现）
  const hasBadShakeText = await ctx.eval("document.body.innerText.includes('连点摇签')");
  ctx.log("BAD TEXT '连点摇签' on Q1:", hasBadShakeText);

  // Q1 基酒 → 选金酒
  await ctx.clickText(".quiz-option", "金酒");
  await ctx.wait(900);

  // Q2 辅料 → 选苏打气泡
  const q2Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q2 title:", q2Title);
  await ctx.clickText(".quiz-option", "苏打气泡");
  await ctx.wait(900);

  // Q3 装饰 → 选一颗酒渍樱桃
  const q3Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q3 title:", q3Title);
  await ctx.clickText(".quiz-option", "一颗酒渍樱桃");
  await ctx.wait(900);

  // Q4 冰量 → 选不加冰
  const q4Title = await ctx.eval("document.getElementById('questionTitle')?.textContent || ''");
  ctx.log("Q4 title:", q4Title);
  await ctx.clickText(".quiz-option", "不加冰");
  await ctx.wait(900);

  // 等调酒动画区出现
  await waitFor(ctx, "!document.getElementById('mixing').classList.contains('hidden')", 8000);
  const mixingVisible = await ctx.eval("!document.getElementById('mixing').classList.contains('hidden')");
  ctx.log("mixing visible:", mixingVisible);

  await ctx.shot(Q + "qaA-02-摇壶初始-390.jpg");

  const captionBefore = await ctx.eval("document.getElementById('mixCaption')?.textContent || ''");
  ctx.log("caption before shake:", captionBefore);

  // 检查是否有"连点摇签"文字
  const hasBadShakeNow = await ctx.eval("document.body.innerText.includes('连点摇签')");
  ctx.log("BAD TEXT '连点摇签' in mixing:", hasBadShakeNow);

  // 验证摇壶可点（无文字提示，靠进度条）
  const shakeUIVisible = await ctx.eval("!!document.querySelector('.shake-ui:not(.hidden)')");
  ctx.log("shake-ui visible (bar):", shakeUIVisible);
  const shakerCursor = await ctx.eval("getComputedStyle(document.getElementById('mixShaker'))?.cursor || 'unknown'");
  ctx.log("shaker cursor:", shakerCursor);

  // 摇壶：点 #mixShaker 触发，然后继续点充能（桌面降级）
  await ctx.click("#mixShaker");
  await ctx.wait(1500); // 等传感器超时 → 降级为点击充能

  ctx.log("caption after first click:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));
  ctx.log("shakeUI hidden:", await ctx.eval("document.getElementById('shakeUI')?.classList.contains('hidden')"));

  await ctx.shot(Q + "qaA-03-摇壶中-390.jpg");

  // 连续点击充能（每次 +14，总目标 130 → 需 10 次）
  for (let i = 0; i < 15; i++) {
    await ctx.click("#mixShaker");
    await ctx.wait(100);
  }
  await ctx.wait(800);
  ctx.log("caption after charge:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));

  // 等出酒动画
  await ctx.wait(3000);
  await ctx.shot(Q + "qaA-04-倒酒-390.jpg");

  // 等结果卡
  await waitFor(ctx, "!document.getElementById('result').classList.contains('hidden')", 10000);
  const resultVisible = await ctx.eval("!document.getElementById('result').classList.contains('hidden')");
  ctx.log("result visible:", resultVisible);

  const resultName = await ctx.eval("document.getElementById('resultName')?.textContent || 'NOT FOUND'");
  const resultRecipe = await ctx.eval("document.getElementById('resultRecipe')?.textContent || ''");
  const resultIntro = await ctx.eval("document.getElementById('resultIntro')?.textContent || ''");
  ctx.log("result name:", resultName);
  ctx.log("result recipe:", resultRecipe);
  ctx.log("result intro:", resultIntro);

  ctx.log("result scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-05-出酒结果-390.jpg");

  // ── STEP 3: 注册 ─────────────────────────────────────────────────
  ctx.log("=== STEP 3: 注册 ===");

  // 点"端着它进场"
  await ctx.click("#resultGo");
  await ctx.wait(1500);

  // 等注册区出现
  await waitFor(ctx, "!document.getElementById('register').classList.contains('hidden')", 8000);
  const regVisible = await ctx.eval("!document.getElementById('register').classList.contains('hidden')");
  ctx.log("register visible:", regVisible);

  // 检查 placeholder
  const namePlaceholder = await ctx.eval("document.getElementById('regName')?.placeholder || 'NOT FOUND'");
  ctx.log("name placeholder:", namePlaceholder);
  const hasJiaxin = namePlaceholder.includes("嘉欣");
  ctx.log("BAD: placeholder contains '嘉欣':", hasJiaxin);
  const hasCocoPlaceholder = namePlaceholder.includes("coco");
  ctx.log("placeholder has 'coco':", hasCocoPlaceholder);

  ctx.log("register scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-06-注册表单-390.jpg");

  // 填写
  await ctx.type("#regName", "coco");
  await ctx.wait(300);
  await ctx.type("#regPass", "1234");
  await ctx.wait(300);

  // 性别选 女
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regGender button')].find(x=>x.dataset.v==='f');b&&b.click();return b?'ok':'not found'})()");
  await ctx.wait(300);

  // 取向选 满分男 (m)
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regSeeking button')].find(x=>x.dataset.v==='m');b&&b.click();return b?'ok':'not found'})()");
  await ctx.wait(300);

  await ctx.shot(Q + "qaA-07-注册填写-390.jpg");

  // 提交注册（触发 form submit 事件，因为 button type=submit）
  await ctx.eval("document.getElementById('registerForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await ctx.wait(4000);

  const afterRegURL = await ctx.url();
  ctx.log("after register URL:", afterRegURL);
  const inLobby = afterRegURL.includes("lobby");
  ctx.log("redirected to lobby:", inLobby);

  await ctx.shot(Q + "qaA-08-注册提交后-390.jpg");

  // ── STEP 4: 大厅 ─────────────────────────────────────────────────
  ctx.log("=== STEP 4: 大厅 ===");

  // 如果没到大厅，强制导航
  if (!inLobby) {
    ctx.log("未跳转大厅，强制跳转...");
    await ctx.goto("http://127.0.0.1:8787/v2/lobby.html");
    await ctx.wait(2500);
  } else {
    await ctx.wait(2500);
  }

  const lobbyURL = await ctx.url();
  ctx.log("lobby URL:", lobbyURL);
  ctx.log("lobby scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  ctx.log("lobby body:", await ctx.eval("document.body.innerText.slice(0,300)"));

  const tablesExist = await ctx.eval("!!document.querySelector('.table[data-table]')");
  ctx.log("table elements exist:", tablesExist);

  await ctx.shot(Q + "qaA-09-大厅-390.jpg");

  // 点第 1 号桌
  if (tablesExist) {
    await ctx.click('.table[data-table="1"]');
    await ctx.wait(3000);
  }

  const afterTableURL = await ctx.url();
  ctx.log("after table click URL:", afterTableURL);
  await ctx.shot(Q + "qaA-10-点桌后-390.jpg");

  // 如果游戏页需要输昵称
  const needNameInput = await ctx.eval("!!document.getElementById('nameIn')");
  if (needNameInput) {
    ctx.log("need name input");
    const existingName = await ctx.eval("localStorage.getItem('mfn_name') || ''");
    ctx.log("saved name:", existingName);
    await ctx.type("#nameIn", existingName || "coco");
    await ctx.wait(200);
    await ctx.eval("(()=>{const b=document.getElementById('joinBtn')||document.getElementById('createBtn');b&&b.click();return b?.textContent||'none'})()");
    await ctx.wait(2500);
    await ctx.shot(Q + "qaA-11-入座后-390.jpg");
  }

  // 检查"今晚聊什么"卡组
  const deckVisible = await ctx.eval("!!document.querySelector('[data-g],.deck-card,.aha-select')");
  ctx.log("deck/aha-select visible:", deckVisible);

  if (deckVisible) {
    ctx.log("deck body:", await ctx.eval("document.body.innerText.slice(0,400)"));
    await ctx.shot(Q + "qaA-12-选卡组-390.jpg");
    // 选满分男(m)卡组
    const deckClick = await ctx.eval("(()=>{const b=document.querySelector('[data-g=\"m\"]');if(b){b.click();return b.textContent}return 'not found'})()");
    ctx.log("clicked deck:", deckClick);
    await ctx.wait(1000);
  }

  // ── STEP 5: 游戏 ─────────────────────────────────────────────────
  ctx.log("=== STEP 5: 游戏 ===");

  // 可能有 startBtn（开始游戏）
  const startBtnText = await ctx.eval("document.getElementById('startBtn')?.textContent || 'none'");
  ctx.log("startBtn:", startBtnText);
  if (startBtnText !== 'none') {
    await ctx.click("#startBtn");
    await ctx.wait(2000);
  }

  // 等签筒（sticks）或答题滑块
  await waitFor(ctx, "document.getElementById('shakeBtn')||document.getElementById('submitBtn')||document.getElementById('slider')", 15000);

  // 检查是否在签筒页（游戏内 #shakeBtn = 摇签，非调酒）
  const inSticksPhase = await ctx.eval("!!document.getElementById('shakeBtn') && !!document.getElementById('chargeBar')");
  ctx.log("in sticks phase:", inSticksPhase);

  if (inSticksPhase) {
    ctx.log("sticks phase body:", await ctx.eval("document.body.innerText.slice(0,300)"));
    await ctx.shot(Q + "qaA-13-摇签-390.jpg");

    // 摇签
    await ctx.click("#shakeBtn");
    await ctx.wait(1500);
    for (let i = 0; i < 15; i++) {
      await ctx.eval("(()=>{const b=document.getElementById('tapBtn');b&&b.click()})()");
      await ctx.wait(90);
    }

    await waitFor(ctx, "document.getElementById('doneBtn')", 8000);
    const drawnName = await ctx.eval("document.querySelector('.stick-out,.stick-name,[class*=stick]')?.textContent?.trim() || 'none'");
    ctx.log("drawn stick name:", drawnName);
    await ctx.shot(Q + "qaA-14-出签-390.jpg");

    await ctx.click("#doneBtn");
    await ctx.wait(1500);

    // 选卡组
    await waitFor(ctx, "document.querySelector('[data-g]')", 8000);
    await ctx.eval("(()=>{const b=document.querySelector('[data-g=\"m\"]');b&&b.click();return 'ok'})()");
    await ctx.wait(1000);
  }

  // 等答题界面
  await waitFor(ctx, "document.getElementById('submitBtn')||document.getElementById('slider')", 15000);

  // ── 顶栏 logo + 进度检查 ──
  const headerLogoSVG = await ctx.eval("document.querySelector('.brand-mark svg')?.outerHTML?.slice(0,200) || document.querySelector('.brand-title')?.outerHTML?.slice(0,300) || 'none'");
  ctx.log("header logo SVG:", headerLogoSVG);

  // 检查 logo 是否含霓虹杯路径（path 含 M 30 8 L 102 8 = 马天尼杯路径）
  const logoHasPath = await ctx.eval("document.querySelector('.brand-mark svg path')?.getAttribute('d')?.includes('M 30') || false");
  ctx.log("logo has martini path (good):", logoHasPath);

  // 检查是否有字母 K logo（坏）
  const logoIsK = await ctx.eval("(()=>{const bm=document.querySelector('.brand-mark');return bm?bm.textContent.trim()==='K':false})()");
  ctx.log("BAD: logo is letter K:", logoIsK);

  // 进度文字：应含"第 X/Y 题"，不含"每人轮数"
  const dimTexts = await ctx.eval("[...document.querySelectorAll('.dim')].map(e=>e.textContent).join(' | ')");
  ctx.log("all .dim texts:", dimTexts);
  const hasRoundsBad = await ctx.eval("document.body.innerText.includes('每人轮数')");
  ctx.log("BAD TEXT '每人轮数' present:", hasRoundsBad);
  const hasQProgress = await ctx.eval("document.body.innerText.includes('第') && document.body.innerText.includes('题')");
  ctx.log("has '第X/Y题' style progress:", hasQProgress);

  ctx.log("game scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-15-游戏题目-390.jpg");

  // ── STEP 6: 答题 + 每题结算 ──────────────────────────────────────
  ctx.log("=== STEP 6: 答题+结算 ===");

  const hasSlider = await ctx.eval("!!document.getElementById('slider')");
  const hasScore = await ctx.eval("!!document.querySelector('[data-score],input[type=range]')");
  ctx.log("has slider:", hasSlider, "has score input:", hasScore);

  if (hasSlider) {
    await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));return 'ok'})()");
    await ctx.wait(500);
    ctx.log("slider value set to 8");
  }

  await ctx.click("#submitBtn");
  await ctx.wait(2000);
  ctx.log("after submit body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 等揭晓页（单人直接开牌）
  await waitFor(ctx, "document.getElementById('nextBtn')||document.getElementById('revealBtn')||document.querySelector('.reveal')", 15000);

  // 检查爆灯/灭灯效果
  const revealBody = await ctx.eval("document.body.innerText.slice(0,800)");
  ctx.log("reveal body:", revealBody);

  const lightElems = await ctx.eval("[...document.querySelectorAll('*')].filter(e=>['light-on','light-off','bulb','reveal-lights','lamp','爆灯','灭灯'].some(k=>e.className?.includes?.(k)||e.textContent?.includes?.(k))).map(e=>e.className+'|'+e.textContent?.slice(0,30)).slice(0,5).join(' || ')");
  ctx.log("light elements:", lightElems);

  // 老K锐评
  const laokText = await ctx.eval("[...document.querySelectorAll('.laok-line,.laok-text,.laok-comment,.laok-box,.laok,.k-line')].map(e=>e.textContent?.trim()).filter(Boolean).join(' | ') || 'none found'");
  ctx.log("laok comment:", laokText);

  ctx.log("reveal scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-16-每题结算-390.jpg");

  // ── STEP 7: 国王游戏（尝试触发）────────────────────────────────
  ctx.log("=== STEP 7: 国王游戏 ===");

  const kingVisible = await ctx.eval("!!document.querySelector('.king-card,.king-container,.kc-head,.king-numcard')");
  ctx.log("king UI visible:", kingVisible);

  if (kingVisible) {
    const numcardText = await ctx.eval("document.querySelector('.king-numcard')?.textContent?.trim() || 'not found'");
    ctx.log("numcard text:", numcardText);

    const hasNumCardHint = await ctx.eval("document.querySelector('.knc-hint')?.textContent || 'not found'");
    ctx.log("numcard hint:", hasNumCardHint);

    const numCardNum = await ctx.eval("document.querySelector('.knc-num')?.textContent || 'not found'");
    ctx.log("king number:", numCardNum);

    await ctx.shot(Q + "qaA-17-国王游戏-390.jpg");
  } else {
    ctx.log("国王游戏本题未触发（需分毫不差才触发）");
    await ctx.shot(Q + "qaA-17-国王未触发-390.jpg");
  }

  // ── STEP 8: 完成游戏到海报 ───────────────────────────────────────
  ctx.log("=== STEP 8: 完成游戏→海报 ===");

  // 最多 6 轮，直到到达 aha 或 poster
  for (let round = 0; round < 6; round++) {
    const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
    const atPoster = await ctx.eval("!!document.querySelector('.poster-img,.poster-wrap')||!!document.getElementById('posterBtn')");
    if (atAha || atPoster) {
      ctx.log(`round ${round}: arrived at aha/poster`);
      break;
    }

    // 有 nextBtn
    if (await ctx.eval("!!document.getElementById('nextBtn')")) {
      await ctx.click("#nextBtn");
      await ctx.wait(1500);
      continue;
    }

    // 有滑块（答题中）
    if (await ctx.eval("!!document.getElementById('slider')")) {
      await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));})()");
      await ctx.click("#submitBtn");
      await waitFor(ctx, "document.getElementById('nextBtn')||document.querySelector('.aha-stage')||document.getElementById('posterBtn')", 12000);
      continue;
    }

    const stuckBody = await ctx.eval("document.body.innerText.slice(0,100)");
    ctx.log(`round ${round}: stuck — `, stuckBody);
    break;
  }

  // aha 理想型
  const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
  ctx.log("at aha stage:", atAha);

  if (atAha) {
    await ctx.wait(2500);
    await ctx.shot(Q + "qaA-18-理想型亮相-390.jpg");
    ctx.log("aha text:", await ctx.eval("document.body.innerText.slice(0,600)"));

    const stageNext = await ctx.eval("!!document.getElementById('stageNext')");
    if (stageNext) {
      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "qaA-19-相亲档案-390.jpg");

      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "qaA-20-相处细节-390.jpg");
    }
  }

  // 海报
  const hasPosterBtn = await ctx.eval("!!document.getElementById('posterBtn')");
  ctx.log("has posterBtn:", hasPosterBtn);

  if (hasPosterBtn) {
    await ctx.click("#posterBtn");
    await waitFor(ctx, "document.querySelector('.poster-img,.poster-wrap')", 25000);
    await ctx.wait(2000);

    // 检查"进入我的主页"按钮
    const profileBtnText = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('我的主页'))?.textContent || 'not found'");
    ctx.log("进入我的主页 button:", profileBtnText);

    const posterBody = await ctx.eval("document.body.innerText.slice(0,400)");
    ctx.log("poster body:", posterBody);
    ctx.log("poster scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "qaA-21-海报-390.jpg");
  } else {
    ctx.log("posterBtn not found");
    await ctx.shot(Q + "qaA-21-未到海报-390.jpg");
    ctx.log("current body:", await ctx.eval("document.body.innerText.slice(0,400)"));
  }

  // ── STEP 9: 我的主页 ─────────────────────────────────────────────
  ctx.log("=== STEP 9: 我的主页 ===");
  await ctx.goto("http://127.0.0.1:8787/u.html");
  await ctx.wait(3500);

  const uURL = await ctx.url();
  ctx.log("u.html URL:", uURL);
  const uBody = await ctx.eval("document.body.innerText.slice(0,600)");
  ctx.log("u.html body:", uBody);
  ctx.log("u.html scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-22-主页-390.jpg");

  // ── 最终日志汇总 ──────────────────────────────────────────────────
  ctx.log("=== ALL CONSOLE LOGS ===");
  ctx.log(ctx.logs.join("\n"));
}
