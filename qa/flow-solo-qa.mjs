// 补充QA — 游戏内容验证（单人模式）
// 验证: logo/进度/老K评论/爆灯/国王牌/海报"进入我的主页"按钮
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

  // ── 预置调酒身份（模拟已注册用户进单人模式）────────────────────
  await ctx.goto("http://127.0.0.1:8787/?solo=1");
  await ctx.eval(`
    localStorage.setItem('ideal_cocktail', JSON.stringify({
      name:'雾中花园·起泡宣言', glass:'highball',
      palette:['#16536e','#2ea8c8','#c2f3ff'], ice:0, garnish:0,
      intro:'入口干净，后面有点杜松子的苦。今晚适合聊点真的。',
      recipe:'金酒 · 苏打气泡 · 酒渍樱桃 · 不加冰', answers:[0,0,0,0]
    }));
    localStorage.setItem('mfn_name', 'coco');
    localStorage.setItem('ideal_userId', 'test-user-qa');
    localStorage.setItem('ideal_token', 'test-token-qa');
    localStorage.setItem('ideal_gender', 'f');
    localStorage.setItem('ideal_seeking', 'm');
  `);
  await ctx.goto("http://127.0.0.1:8787/?solo=1");
  await ctx.wait(2000);

  ctx.log("solo home URL:", await ctx.url());
  ctx.log("solo home body:", await ctx.eval("document.body.innerText.slice(0,400)"));

  // 创建单人房间
  await waitFor(ctx, "!!document.getElementById('nameIn')||!!document.getElementById('createBtn')", 8000);
  const curName = await ctx.eval("document.getElementById('nameIn')?.value || ''");
  if (!curName) {
    await ctx.type("#nameIn", "coco");
  }
  await ctx.wait(300);
  await ctx.click("#createBtn");
  await waitFor(ctx, "document.body.innerText.includes('开局')||document.getElementById('startBtn')", 10000);
  ctx.log("room body:", await ctx.eval("document.body.innerText.slice(0,400)"));
  await ctx.shot(Q + "qaA-solo-01-单人房间-390.jpg");

  // 设为3题（最快）
  await ctx.eval("(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change'));}})()");
  await ctx.wait(400);

  await ctx.click("#startBtn");
  await waitFor(ctx, "document.getElementById('shakeBtn')||document.getElementById('submitBtn')||document.getElementById('slider')", 12000);

  // 签筒阶段
  const inSticks = await ctx.eval("!!document.getElementById('shakeBtn') && !!document.getElementById('chargeBar')");
  ctx.log("in sticks phase:", inSticks);

  if (inSticks) {
    await ctx.shot(Q + "qaA-solo-02-摇签-390.jpg");
    ctx.log("sticks body:", await ctx.eval("document.body.innerText.slice(0,300)"));

    await ctx.click("#shakeBtn");
    await ctx.wait(1500);

    for (let i = 0; i < 15; i++) {
      await ctx.eval("(()=>{const b=document.getElementById('tapBtn');b&&b.click()})()");
      await ctx.wait(90);
    }

    await waitFor(ctx, "document.getElementById('doneBtn')", 8000);
    const stickDrawn = await ctx.eval("document.querySelector('.stick-out,.stick-name')?.textContent?.trim() || 'none'");
    ctx.log("drawn:", stickDrawn);
    await ctx.shot(Q + "qaA-solo-03-出签-390.jpg");

    await ctx.click("#doneBtn");
    await ctx.wait(1500);

    // 选卡组
    await waitFor(ctx, "document.querySelector('[data-g]')", 8000);
    await ctx.eval("(()=>{const b=document.querySelector('[data-g=\"m\"]');b&&b.click()})()");
    await ctx.wait(1000);
  }

  // ── STEP 5: 游戏题目页面 ────────────────────────────────────────
  ctx.log("=== STEP 5: 游戏题目 ===");
  await waitFor(ctx, "document.getElementById('submitBtn')||document.getElementById('slider')", 12000);

  const gameBodyText = await ctx.eval("document.body.innerText.slice(0,600)");
  ctx.log("game body:", gameBodyText);

  // 顶栏 logo 检查
  const brandMarkHTML = await ctx.eval("document.querySelector('.brand-mark')?.outerHTML || 'not found'");
  ctx.log("brand-mark HTML:", brandMarkHTML.slice(0, 300));

  const logoPath = await ctx.eval("document.querySelector('.brand-mark svg path')?.getAttribute('d') || 'none'");
  ctx.log("logo path d:", logoPath);

  const logoIsK = await ctx.eval("(()=>{const bm=document.querySelector('.brand-mark');return bm?bm.textContent.trim()==='K':false})()");
  ctx.log("BAD: logo is letter K:", logoIsK);

  // 进度检查
  const allDims = await ctx.eval("[...document.querySelectorAll('.dim,.row .dim')].map(e=>e.textContent.trim()).join(' | ')");
  ctx.log("dim texts:", allDims);

  const hasQProgress = await ctx.eval("document.body.innerText.match(/第\\s*\\d+\\s*\\/\\s*\\d+\\s*题/)");
  ctx.log("'第X/Y题' regex match:", hasQProgress);

  const hasRoundsBad = await ctx.eval("document.body.innerText.includes('每人轮数')");
  ctx.log("BAD TEXT '每人轮数':", hasRoundsBad);

  ctx.log("game scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "qaA-solo-04-游戏题目-390.jpg");

  // ── STEP 6: 答题循环（3题）────────────────────────────────────────
  ctx.log("=== STEP 6: 答题循环 ===");

  for (let r = 1; r <= 3; r++) {
    ctx.log(`--- Round ${r} ---`);

    // 等滑块
    await waitFor(ctx, "document.getElementById('slider')||document.getElementById('submitBtn')", 12000);

    const hasSlider = await ctx.eval("!!document.getElementById('slider')");
    if (hasSlider) {
      await ctx.eval("(()=>{const s=document.getElementById('slider');s.value=8;s.dispatchEvent(new Event('input'));})()");
      await ctx.wait(500);
    }

    const questText = await ctx.eval("document.querySelector('.question-card,.glass.question-card')?.innerText?.slice(0,200) || 'none'");
    ctx.log(`R${r} question:`, questText);

    if (r === 1) {
      await ctx.shot(Q + "qaA-solo-05-游戏R1题目-390.jpg");
    }

    await ctx.click("#submitBtn");
    await ctx.wait(1500);

    // 单人无猜分者 → 直接开牌
    await waitFor(ctx, "document.getElementById('nextBtn')||document.querySelector('.aha-stage')", 12000);

    const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
    if (atAha) {
      ctx.log(`R${r}: arrived at aha early`);
      break;
    }

    // 结算页检查（第1题详细检查）
    if (r === 1) {
      ctx.log("R1 reveal body:", await ctx.eval("document.body.innerText.slice(0,800)"));

      // 爆灯/灭灯效果
      const lightOn = await ctx.eval("!!document.querySelector('.light-on,.lamp-on,.bulb-on,[class*=light]')");
      ctx.log("light-on element:", lightOn);

      const lightOff = await ctx.eval("!!document.querySelector('.light-off,.lamp-off,.bulb-off')");
      ctx.log("light-off element:", lightOff);

      // 找任何含"爆灯"或"灭灯"的元素
      const lightText = await ctx.eval("[...document.querySelectorAll('*')].filter(e=>e.childElementCount===0&&(e.textContent.includes('爆灯')||e.textContent.includes('灭灯'))).map(e=>e.textContent).join('|') || 'none'");
      ctx.log("爆灯/灭灯 text:", lightText);

      // 老K锐评
      const laokEls = await ctx.eval("[...document.querySelectorAll('[class*=laok],[class*=k-line],[class*=kline]')].map(e=>e.textContent?.trim()).filter(Boolean).join(' | ') || 'none'");
      ctx.log("laok elements:", laokEls);

      // 更广泛找老K评论（找含特定属性或id的）
      const laokById = await ctx.eval("document.getElementById('laokBox')?.innerText || document.getElementById('laok')?.innerText || document.querySelector('.laok-box')?.innerText || 'not found by id/class'");
      ctx.log("laok by id:", laokById);

      ctx.log("R1 scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
      await ctx.shot(Q + "qaA-solo-06-R1结算-390.jpg");
    }

    // 国王游戏（第1题结算时检查，分毫不差才触发）
    const kingUI = await ctx.eval("!!document.querySelector('.king-card,.kc-head,.king-numcard')");
    ctx.log(`R${r} king UI:`, kingUI);

    if (kingUI) {
      const myNum = await ctx.eval("document.querySelector('.knc-num')?.textContent || 'none'");
      const hint = await ctx.eval("document.querySelector('.knc-hint')?.textContent || 'none'");
      const headLine = await ctx.eval("document.querySelector('.kc-head')?.textContent?.trim() || 'none'");
      ctx.log("king numcard num:", myNum);
      ctx.log("king hint:", hint);
      ctx.log("king headline:", headLine);
      await ctx.shot(Q + `qaA-solo-07-R${r}国王-390.jpg`);
    }

    // 下一题
    const nextText = await ctx.eval("document.getElementById('nextBtn')?.textContent || 'none'");
    ctx.log(`R${r} nextBtn:`, nextText);
    await ctx.click("#nextBtn");
    await ctx.wait(800);
  }

  // ── aha 理想型 ──────────────────────────────────────────────────
  await waitFor(ctx, "document.querySelector('.aha-stage')||document.getElementById('posterBtn')", 20000);
  const atAha = await ctx.eval("!!document.querySelector('.aha-stage')");
  ctx.log("at aha:", atAha);

  if (atAha) {
    await ctx.wait(2500);
    ctx.log("aha body:", await ctx.eval("document.body.innerText.slice(0,600)"));
    await ctx.shot(Q + "qaA-solo-08-理想型亮相-390.jpg");

    if (await ctx.eval("!!document.getElementById('stageNext')")) {
      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "qaA-solo-09-相亲档案-390.jpg");

      await ctx.click("#stageNext");
      await ctx.wait(1000);
      await ctx.shot(Q + "qaA-solo-10-相处细节-390.jpg");
    }
  }

  // ── 海报 ────────────────────────────────────────────────────────
  ctx.log("=== STEP 8: 海报 ===");
  const hasPosterBtn = await ctx.eval("!!document.getElementById('posterBtn')");
  ctx.log("posterBtn:", hasPosterBtn);

  if (hasPosterBtn) {
    await ctx.click("#posterBtn");
    await waitFor(ctx, "document.querySelector('.poster-img,.poster-wrap,.poster-canvas')", 25000);
    await ctx.wait(2500);

    const posterBody = await ctx.eval("document.body.innerText.slice(0,500)");
    ctx.log("poster body:", posterBody);

    // 检查"进入我的主页"按钮
    const profileLink = await ctx.eval("[...document.querySelectorAll('button,a')].find(e=>e.textContent.includes('进入我的主页')||e.textContent.includes('主页'))?.textContent?.trim() || 'not found'");
    ctx.log("进入我的主页 btn:", profileLink);

    ctx.log("poster scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
    await ctx.shot(Q + "qaA-solo-11-海报-390.jpg");
  } else {
    ctx.log("no posterBtn found");
    ctx.log("current body:", await ctx.eval("document.body.innerText.slice(0,400)"));
    await ctx.shot(Q + "qaA-solo-11-海报未找到-390.jpg");
  }

  // console 汇总
  ctx.log("=== CONSOLE ERRORS ===");
  ctx.log(ctx.logs.filter(l => l.startsWith('[error]') || l.startsWith('[exception]') || l.startsWith('[warn]')).join("\n") || "(none)");
}
