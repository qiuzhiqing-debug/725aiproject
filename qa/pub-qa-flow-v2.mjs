// 公网上线验收流程 v2 — 手机视口 390×844
// 修正: 摇签交互使用 .glass.stick-stage / #cup，非 #shakeBtn
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

// 敲签筒 N 次（每次点 #cup / .stick-stage）
async function tapStick(ctx, n) {
  for (let i = 0; i < n; i++) {
    await ctx.eval("(()=>{const e=document.getElementById('cup')||document.querySelector('.glass.stick-stage,.stick-cup');e&&e.click();})()");
    await ctx.wait(120);
  }
}

export default async function (ctx) {

  // ── STEP 1: 进站 ──────────────────────────────────────────────────
  ctx.log("=== STEP 1: 进站 ===");
  await ctx.goto(BASE + "/");
  await ctx.eval("try{localStorage.clear()}catch(e){}");
  await ctx.wait(500);
  await ctx.goto(BASE + "/");
  await ctx.wait(3500);

  const step1URL = await ctx.url();
  ctx.log("step1 URL:", step1URL);
  ctx.log("redirected to cocktail:", step1URL.includes("cocktail"));

  const bodyText1 = await ctx.eval("document.body.innerText.slice(0,400)");
  ctx.log("page text:", bodyText1);

  const has99 = await ctx.eval("document.body.innerText.includes('99%')");
  const hasOldName = await ctx.eval("document.body.innerText.includes('老K的酒吧')");
  ctx.log("店名含99%:", has99);
  ctx.log("BAD: 含'老K的酒吧':", hasOldName);

  const hostLine = await ctx.eval(
    "document.getElementById('hostLine')?.textContent || " +
    "document.querySelector('[id*=host],[class*=host],[class*=intro]')?.textContent?.trim() || " +
    "'check body above'"
  );
  ctx.log("老K开场:", hostLine);

  ctx.log("step1 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-01-进站-390.jpg");

  // ── STEP 2: 调酒四题 ──────────────────────────────────────────────
  ctx.log("=== STEP 2: 调酒 ===");
  await waitFor(ctx, "document.querySelectorAll('.quiz-option').length > 0", 12000);

  ctx.log("Q1:", await ctx.eval("document.getElementById('questionTitle')?.textContent || ''"));
  ctx.log("BAD '连点摇签':", await ctx.eval("document.body.innerText.includes('连点摇签')"));

  // 4题选择
  await ctx.clickText(".quiz-option", "金酒"); await ctx.wait(900);
  ctx.log("Q2:", await ctx.eval("document.getElementById('questionTitle')?.textContent || ''"));
  await ctx.clickText(".quiz-option", "苏打气泡"); await ctx.wait(900);
  ctx.log("Q3:", await ctx.eval("document.getElementById('questionTitle')?.textContent || ''"));
  await ctx.clickText(".quiz-option", "一颗酒渍樱桃"); await ctx.wait(900);
  ctx.log("Q4:", await ctx.eval("document.getElementById('questionTitle')?.textContent || ''"));
  await ctx.clickText(".quiz-option", "不加冰"); await ctx.wait(900);

  // 摇壶阶段
  await waitFor(ctx, "!document.getElementById('mixing')?.classList.contains('hidden') || !!document.getElementById('mixShaker')", 8000);
  ctx.log("BAD '连点摇签' in mixing:", await ctx.eval("document.body.innerText.includes('连点摇签')"));
  ctx.log("mixCaption:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));
  ctx.log("mixShaker cursor:", await ctx.eval("getComputedStyle(document.getElementById('mixShaker')||document.createElement('span')).cursor"));
  ctx.log("step2 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-02-调酒摇壶-390.jpg");

  // 摇壶充能
  await ctx.click("#mixShaker");
  await ctx.wait(1800);
  ctx.log("caption after first click:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));
  for (let i = 0; i < 20; i++) { await ctx.click("#mixShaker"); await ctx.wait(100); }
  await ctx.wait(1000);
  ctx.log("caption after charge:", await ctx.eval("document.getElementById('mixCaption')?.textContent || ''"));

  await ctx.wait(3500);
  await ctx.shot(Q + "pub-03-倒酒-390.jpg");

  await waitFor(ctx, "!document.getElementById('result')?.classList.contains('hidden')", 12000);
  ctx.log("result visible:", await ctx.eval("!document.getElementById('result')?.classList.contains('hidden')"));
  ctx.log("result name:", await ctx.eval("document.getElementById('resultName')?.textContent || 'NOT FOUND'"));
  ctx.log("result recipe:", await ctx.eval("document.getElementById('resultRecipe')?.textContent || ''"));
  ctx.log("result scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-04-出酒结果-390.jpg");

  // ── STEP 3: 注册 ───────────────────────────────────────────────────
  ctx.log("=== STEP 3: 注册 ===");
  await ctx.click("#resultGo");
  await ctx.wait(2000);
  await waitFor(ctx, "!document.getElementById('register')?.classList.contains('hidden')", 10000);
  ctx.log("register visible:", await ctx.eval("!document.getElementById('register')?.classList.contains('hidden')"));

  const namePlaceholder = await ctx.eval("document.getElementById('regName')?.placeholder || 'NOT FOUND'");
  ctx.log("name placeholder:", namePlaceholder);
  ctx.log("BAD placeholder '嘉欣':", namePlaceholder.includes("嘉欣"));
  ctx.log("placeholder 'coco':", namePlaceholder.includes("coco"));

  ctx.log("register scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-05-注册表单-390.jpg");

  // 生成唯一用户名避免冲突
  const ts = Date.now().toString().slice(-6);
  const testUser = "qa" + ts;
  ctx.log("registering as:", testUser);

  await ctx.type("#regName", testUser);
  await ctx.wait(300);
  await ctx.type("#regPass", "qa1234");
  await ctx.wait(300);

  // 性别选 女
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regGender button')].find(x=>x.dataset.v==='f'||x.textContent.includes('女'));b&&b.click()})()");
  await ctx.wait(300);
  // 取向选 满分男
  await ctx.eval("(()=>{const b=[...document.querySelectorAll('#regSeeking button')].find(x=>x.dataset.v==='m'||x.textContent.includes('满分男'));b&&b.click()})()");
  await ctx.wait(300);

  await ctx.shot(Q + "pub-06-注册填写-390.jpg");

  // 提交 (form submit event)
  await ctx.eval("document.getElementById('registerForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
  await ctx.wait(5000);

  const afterRegURL = await ctx.url();
  ctx.log("after register URL:", afterRegURL);
  ctx.log("redirected to lobby:", afterRegURL.includes("lobby"));
  await ctx.shot(Q + "pub-07-注册提交后-390.jpg");

  // 检查是否有错误提示
  const regError = await ctx.eval("document.querySelector('.error-msg,.reg-error,[class*=error]')?.textContent?.trim() || 'no error msg found'");
  ctx.log("reg error msg:", regError);

  // ── STEP 4: 大厅 ──────────────────────────────────────────────────
  ctx.log("=== STEP 4: 大厅 ===");
  if (!afterRegURL.includes("lobby")) {
    ctx.log("강제 goto lobby...");
    await ctx.goto(BASE + "/v2/lobby");
    await ctx.wait(3000);
  } else {
    await ctx.wait(2500);
  }

  ctx.log("lobby URL:", await ctx.url());
  ctx.log("lobby scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  ctx.log("lobby body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  const tablesExist = await ctx.eval("!!document.querySelector('.table[data-table]')");
  ctx.log("tables exist:", tablesExist);

  // 选卡组选项是否存在
  const decksExist = await ctx.eval("!!document.querySelector('[data-g],.deck-card')");
  ctx.log("deck cards exist in lobby:", decksExist);

  await ctx.shot(Q + "pub-08-大厅-390.jpg");

  // 点第1号桌
  if (tablesExist) {
    await ctx.click('.table[data-table="1"]');
    await ctx.wait(3000);
    ctx.log("after table click URL:", await ctx.url());
    ctx.log("after table body:", await ctx.eval("document.body.innerText.slice(0,400)"));
    await ctx.shot(Q + "pub-09-点桌后-390.jpg");
  }

  // ── STEP 5: solo单人局 ──────────────────────────────────────────────
  ctx.log("=== STEP 5: solo单人局 ===");

  // 先预置 localStorage（保证调酒数据存在）
  await ctx.goto(BASE + "/?solo=1");
  await ctx.eval(`
    localStorage.setItem('ideal_cocktail', JSON.stringify({
      name:'雾中花园·起泡宣言', glass:'highball',
      palette:['#16536e','#2ea8c8','#c2f3ff'], ice:0, garnish:0,
      intro:'入口干净。今晚适合聊点真的。',
      recipe:'金酒 · 苏打气泡 · 酒渍樱桃 · 不加冰', answers:[0,0,0,0]
    }));
  `);
  await ctx.goto(BASE + "/?solo=1");
  await ctx.wait(3000);

  ctx.log("solo URL:", await ctx.url());
  ctx.log("solo entrance body:", await ctx.eval("document.body.innerText.slice(0,400)"));
  ctx.log("solo entrance line:", await ctx.eval("document.body.innerText.includes('一个人') || document.body.innerText.includes('和我聊')"));
  ctx.log("solo scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-10-solo入口-390.jpg");

  // 创建单人房间
  await waitFor(ctx, "!!document.getElementById('nameIn')||!!document.getElementById('createBtn')", 10000);
  const nameVal = await ctx.eval("document.getElementById('nameIn')?.value || ''");
  if (!nameVal) await ctx.type("#nameIn", testUser);
  await ctx.wait(300);
  await ctx.click("#createBtn");
  await waitFor(ctx, "!!document.getElementById('startBtn')||document.body.innerText.includes('开始')", 12000);
  ctx.log("room body:", await ctx.eval("document.body.innerText.slice(0,500)"));
  await ctx.shot(Q + "pub-11-solo房间-390.jpg");

  // 设3题
  await ctx.eval("(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change'));}})()");
  await ctx.wait(400);
  await ctx.click("#startBtn");
  await ctx.wait(3000);

  ctx.log("after start URL:", await ctx.url());
  ctx.log("after start body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 签筒阶段 — 用 #cup / .glass.stick-stage
  const inSticks = await ctx.eval("!!document.querySelector('.glass.stick-stage')||!!document.getElementById('cup')");
  ctx.log("in sticks phase (cup visible):", inSticks);

  if (inSticks) {
    ctx.log("sticks body:", await ctx.eval("document.body.innerText.slice(0,300)"));
    ctx.log("chargeBar visible:", await ctx.eval("!!document.getElementById('chargeBar')"));
    ctx.log("chargeFill width:", await ctx.eval("document.getElementById('chargeFill')?.style.width || '?'"));
    await ctx.shot(Q + "pub-12-摇签-390.jpg");

    // 点签筒充能 (30次)
    await tapStick(ctx, 30);
    await ctx.wait(1500);

    ctx.log("chargeFill after tap:", await ctx.eval("document.getElementById('chargeFill')?.style.width || '?'"));

    // 等 doneBtn 或签筒消失
    await waitFor(ctx, "document.getElementById('doneBtn')||!document.querySelector('.glass.stick-stage')||document.querySelector('[data-g]')", 12000);

    const doneBtnText = await ctx.eval("document.getElementById('doneBtn')?.textContent || 'NOT FOUND'");
    ctx.log("doneBtn:", doneBtnText);

    const drawnStick = await ctx.eval("document.querySelector('.stick-out,.stick-name,[class*=drawn]')?.textContent?.trim() || 'none'");
    ctx.log("drawn stick:", drawnStick);

    await ctx.shot(Q + "pub-13-出签-390.jpg");

    if (doneBtnText !== 'NOT FOUND') {
      await ctx.click("#doneBtn");
      await ctx.wait(1500);
    }

    // 选卡组
    await waitFor(ctx, "document.querySelector('[data-g]')", 8000);
    const deckText = await ctx.eval("document.querySelector('[data-g=\"m\"]')?.textContent?.trim() || 'not found'");
    ctx.log("deck m:", deckText);
    await ctx.eval("(()=>{const b=document.querySelector('[data-g=\"m\"]');b&&b.click()})()");
    await ctx.wait(1000);
    await ctx.shot(Q + "pub-13b-选卡组-390.jpg");
  }

  // ── STEP 5b: 游戏题目页 ─────────────────────────────────────────
  ctx.log("=== STEP 5b: 游戏题目页 ===");
  await waitFor(ctx, "document.getElementById('submitBtn')||document.getElementById('slider')", 15000);

  ctx.log("game body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 顶栏 logo
  const brandMarkHTML = await ctx.eval("document.querySelector('.brand-mark')?.outerHTML?.slice(0,300) || 'not found'");
  ctx.log("brand-mark:", brandMarkHTML.slice(0,200));
  ctx.log("BAD: logo is K text:", await ctx.eval("(()=>{const bm=document.querySelector('.brand-mark');return bm?bm.textContent.trim()==='K':false})()"));
  ctx.log("logo has SVG path:", await ctx.eval("!!document.querySelector('.brand-mark svg path')"));

  // 进度
  const allDims = await ctx.eval("[...document.querySelectorAll('.dim')].map(e=>e.textContent.trim()).filter(Boolean).join(' | ')");
  ctx.log("dim texts:", allDims);
  ctx.log("'第X/Y题' match:", await ctx.eval("!!document.body.innerText.match(/第\\s*\\d+\\s*\\/\\s*\\d+\\s*题/)"));
  ctx.log("BAD '每人轮数':", await ctx.eval("document.body.innerText.includes('每人轮数')"));

  ctx.log("game scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-14-游戏题目-390.jpg");

  // ── STEP 6: 答题循环(3轮，每轮截图) ──────────────────────────────
  ctx.log("=== STEP 6: 答题循环 ===");

  for (let r = 1; r <= 3; r++) {
    ctx.log(`--- Round ${r} ---`);
    await waitFor(ctx, "document.getElementById('slider')||document.getElementById('submitBtn')", 12000);

    const hasSlider = await ctx.eval("!!document.getElementById('slider')");
    if (hasSlider) {
      await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));})()");
      await ctx.wait(500);
    }

    const questText = await ctx.eval(
      "document.querySelector('.question-card')?.innerText?.slice(0,200) || " +
      "document.body.innerText.slice(0,200)"
    );
    ctx.log(`R${r} question:`, questText);

    await ctx.shot(Q + `pub-15-R${r}题目-390.jpg`);

    // 提交
    const submitRes = await ctx.click("#submitBtn");
    ctx.log(`R${r} submit:`, submitRes);
    await ctx.wait(1500);

    // 等揭晓（单人无猜分直接开牌）
    await waitFor(ctx, "document.getElementById('nextBtn')||document.querySelector('.aha-stage')", 15000);

    const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
    if (atAha) { ctx.log(`R${r}: aha early`); break; }

    const revealBody = await ctx.eval("document.body.innerText.slice(0,600)");
    ctx.log(`R${r} reveal:`, revealBody);

    // 老K锐评检查
    const laokByClass = await ctx.eval("[...document.querySelectorAll('[class*=laok],[class*=k-line],[class*=kline],[class*=king-line]')].map(e=>e.textContent?.trim()).filter(Boolean).join(' | ') || 'none'");
    ctx.log(`R${r} laok by class:`, laokByClass);
    const laokById = await ctx.eval("document.getElementById('laokBox')?.innerText || document.getElementById('laok')?.innerText || document.querySelector('.laok-box')?.innerText || 'not found'");
    ctx.log(`R${r} laok by id:`, laokById);
    // 宽泛搜索：reveal 区域内所有叶子文字 > 8字符
    const laokWide = await ctx.eval("(()=>{ const r=document.querySelector('[class*=reveal],[class*=result-area],[class*=round-result]'); if(!r) return 'no reveal area'; return [...r.querySelectorAll('p,div,span')].filter(e=>e.childElementCount===0&&e.textContent.trim().length>8).map(e=>e.textContent.trim().slice(0,60)).join(' | ') || 'none'})()");
    ctx.log(`R${r} laok wide:`, laokWide);

    ctx.log(`R${r} scrollWidth:`, await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + `pub-16-R${r}揭晓-390.jpg`);

    const nextText = await ctx.eval("document.getElementById('nextBtn')?.textContent || 'none'");
    ctx.log(`R${r} nextBtn:`, nextText);
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  // ── aha 理想型 + 档案 ──────────────────────────────────────────
  await waitFor(ctx, "document.querySelector('.aha-stage')||document.getElementById('posterBtn')", 20000);
  const atAha2 = await ctx.eval("!!document.querySelector('.aha-stage')");
  ctx.log("at aha:", atAha2);

  if (atAha2) {
    await ctx.wait(2500);
    ctx.log("aha body:", await ctx.eval("document.body.innerText.slice(0,500)"));
    ctx.log("aha scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "pub-19-理想型亮相-390.jpg");

    if (await ctx.eval("!!document.getElementById('stageNext')")) {
      await ctx.click("#stageNext"); await ctx.wait(1000);
      await ctx.shot(Q + "pub-20-相亲档案-390.jpg");
      await ctx.click("#stageNext"); await ctx.wait(1000);
      await ctx.shot(Q + "pub-21-相处细节-390.jpg");
    }
  }

  // ── STEP 6b: 海报 ──────────────────────────────────────────────
  ctx.log("=== STEP 6b: 海报 ===");
  await waitFor(ctx, "!!document.getElementById('posterBtn')", 10000);
  const hasPosterBtn = await ctx.eval("!!document.getElementById('posterBtn')");
  ctx.log("posterBtn present:", hasPosterBtn);

  if (hasPosterBtn) {
    await ctx.click("#posterBtn");
    await waitFor(ctx, "document.querySelector('.poster-img,.poster-wrap,.poster-canvas')", 30000);
    await ctx.wait(2500);

    ctx.log("poster body:", await ctx.eval("document.body.innerText.slice(0,500)"));
    const profileBtnText = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.textContent?.trim() || 'not found'");
    ctx.log("进入我的主页 btn:", profileBtnText);
    const profileBtnTag = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.tagName || 'none'");
    ctx.log("进入我的主页 tag:", profileBtnTag);
    ctx.log("poster scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "pub-22-海报-390.jpg");

    // ── STEP 7: 点"进入我的主页" ──────────────────────────────────
    ctx.log("=== STEP 7: 进入我的主页 ===");
    await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.click()");
    await ctx.wait(3500);

    const profileURL = await ctx.url();
    ctx.log("profile URL:", profileURL);
    ctx.log("at /u page:", profileURL.includes("/u") || profileURL.includes("user"));
    await ctx.shot(Q + "pub-23-点主页后-390.jpg");
  } else {
    ctx.log("NO posterBtn — stuck at:");
    ctx.log(await ctx.eval("document.body.innerText.slice(0,400)"));
    await ctx.shot(Q + "pub-22-海报未找到-390.jpg");
  }

  // ── STEP 7b: /u 主页 ──────────────────────────────────────────────
  ctx.log("=== STEP 7b: /u 主页 ===");
  await ctx.goto(BASE + "/u");
  await ctx.wait(4000);

  ctx.log("u URL:", await ctx.url());
  ctx.log("u body:", await ctx.eval("document.body.innerText.slice(0,600)"));
  ctx.log("u scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "pub-24-主页u-390.jpg");

  // ── 汇总 ────────────────────────────────────────────────────────
  ctx.log("=== CONSOLE ERRORS ===");
  const errs = ctx.logs.filter(l => l.startsWith('[error]') || l.startsWith('[exception]') || l.startsWith('[warn]'));
  ctx.log(errs.length ? errs.join("\n") : "(none)");
}
