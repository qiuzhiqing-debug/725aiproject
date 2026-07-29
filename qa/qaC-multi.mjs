// qaC-multi.mjs — 双客户端多人局 QA (v3)
// 两个独立 Edge 实例（独立 profile = 独立 localStorage），避免 token 冲突。
// 用法: node qa/qaC-multi.mjs

import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";

const EDGE  = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const PA    = 9720;   // port A
const PB    = 9721;   // port B
const PROF_A = process.env.TEMP + "/cdp-qa-A-" + PA;
const PROF_B = process.env.TEMP + "/cdp-qa-B-" + PB;
const Q     = "D:/AIgo/理想型加载中/满分男/qa/";
const BASE  = "http://127.0.0.1:8787";
const UA    = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
              "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const W = 390, H = 844;
const SCORE = 5;   // 固定打分；乙猜相同 → 分毫不差 → 国王机会触发

/* ─── 启动两个 Edge ─── */
function spawnEdge(port, profile) {
  return spawn(EDGE, [
    "--headless", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check",
    "--mute-audio", "--disable-sync", "--disable-extensions",
    "--disable-component-extensions-with-background-pages",
    "--disable-features=msImplicitSignin,msSeamlessWebToBrowserSignIn,msSyncConsentExperience",
    "about:blank",
  ], { stdio: "ignore" });
}
const childA = spawnEdge(PA, PROF_A);
const childB = spawnEdge(PB, PROF_B);

const KILL = setTimeout(() => {
  console.error("HARD TIMEOUT 5 min");
  childA.kill(); childB.kill(); process.exit(2);
}, 310_000);

/* ─── Tab 类 ─── */
class Tab {
  constructor(label) { this.label=label; this.sock=null; this.idc=0; this.logs=[]; this.errs=[]; }

  async connectTo(wsUrl) {
    this.sock = new WebSocket(wsUrl);
    await new Promise((res, rej) => { this.sock.onopen=res; this.sock.onerror=()=>rej(new Error(this.label+" ws")); });
    this.sock.addEventListener("message", ev => {
      try {
        const d = JSON.parse(ev.data);
        if (d.method === "Runtime.consoleAPICalled") {
          const t = (d.params.args||[]).map(a=>a.value??a.description??"").join(" ");
          this.logs.push(`[${d.params.type}] ${t}`);
        }
        if (d.method === "Runtime.exceptionThrown") {
          const s = d.params.exceptionDetails?.exception?.description || "?";
          this.errs.push(s); this.logs.push(`[exception] ${s}`);
        }
      } catch {}
    });
    await this._rpc("Runtime.enable");
    await this._rpc("Page.enable");
    await this._rpc("Emulation.setDeviceMetricsOverride", { width:W, height:H, deviceScaleFactor:2, mobile:true });
    await this._rpc("Emulation.setUserAgentOverride", { userAgent:UA });
    this.log("CDP connected");
  }

  _rpc(method, params={}, ms=30_000) {
    return new Promise((res, rej) => {
      const id = ++this.idc;
      const h = ev => { const d=JSON.parse(ev.data); if(d.id===id){ this.sock.removeEventListener("message",h); d.error?rej(new Error(method+": "+d.error.message)):res(d.result); } };
      this.sock.addEventListener("message", h);
      this.sock.send(JSON.stringify({ id, method, params }));
      setTimeout(() => rej(new Error(method+" timeout")), ms);
    });
  }

  async goto(url) {
    const loaded = new Promise(res => {
      const t = setTimeout(res, 8000);
      const h = ev => { try { const d=JSON.parse(ev.data); if(d.method==="Page.loadEventFired"){ clearTimeout(t); this.sock.removeEventListener("message",h); res(); } } catch{} };
      this.sock.addEventListener("message", h);
    });
    await this._rpc("Page.navigate", { url });
    await loaded;
    await this.wait(600);
  }

  wait(ms) { return new Promise(r => setTimeout(r, ms)); }

  async eval(expr) {
    const r = await this._rpc("Runtime.evaluate", { expression:expr, returnByValue:true, awaitPromise:true });
    if (r.exceptionDetails) throw new Error(`[${this.label}] `+(r.exceptionDetails.exception?.description||r.exceptionDetails.text));
    return r.result.value;
  }
  async tryEval(e, fb=null) { try { return await this.eval(e); } catch { return fb; } }

  async click(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return'NOT_FOUND';e.click();return'ok'})()`); }

  async type(sel, text) {
    return this.eval(
      `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return'NOT_FOUND';`+
      `e.focus();e.value=${JSON.stringify(text)};`+
      `e.dispatchEvent(new Event('input',{bubbles:true}));`+
      `e.dispatchEvent(new Event('change',{bubbles:true}));return'ok'})()`
    );
  }

  async shot(name) {
    await this.wait(350);
    const s = await this._rpc("Page.captureScreenshot", { format:"jpeg", quality:85 }, 45_000);
    await writeFile(Q+name, Buffer.from(s.data, "base64"));
    this.log("SHOT " + name);
  }

  log(...a) { console.log(`[${this.label}]`, ...a); }
}

/* ─── helpers ─── */
async function getPageTarget(port) {
  for (let i=0; i<30; i++) {
    await new Promise(r => setTimeout(r, 600));
    try {
      const list = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json`)).text());
      const t = list.find(x => x.type==="page");
      if (t) return t;
    } catch {}
  }
  throw new Error("CDP not reachable on port " + port);
}

async function waitFor(tab, expr, ms=20_000, step=350) {
  const t0 = Date.now();
  while (Date.now()-t0 < ms) {
    try { if (await tab.eval(expr)) return true; } catch {}
    await tab.wait(step);
  }
  tab.log("WAITFOR TIMEOUT:", expr.slice(0,80));
  return false;
}

/* ─── Phase detection (DOM-based, since ui is module-scoped) ─── */
// After joining, phase is detectable from the DOM:
//   lobby:             #startBtn exists
//   picking:           #shakeBtn or #tapBtn exists
//   protagonist_setup: no slider, no startBtn, no shakeBtn, has ".dim" with protagonist text
//   answering:         #slider exists
//   reveal:            .big-score exists
//   drinking:          .chug-stage exists
//   king:              .king-chance-stage exists and no slider and no big-score
//   aha:               .aha-stage exists
//   finished:          look for finished content

const PHASE_EXPR = `(()=>{
  // finished phase calls renderAha(isFinal=true): same .aha-stage DOM but:
  //   - #prevAha / #nextAha nav buttons are appended by renderFinished
  //   - #nextBtn is hidden (isFinal removes it)
  // Check these BEFORE the generic aha test.
  if(document.getElementById('prevAha')||document.getElementById('nextAha')) return 'finished';
  if(document.querySelector('.aha-stage')&&!document.getElementById('nextBtn')&&!document.querySelector('.dim.center')) return 'finished';
  if(document.querySelector('.aha-stage')) return 'aha';
  if(document.querySelector('.chug-stage')) return 'drinking';
  if(document.querySelector('.big-score')) return 'reveal';
  if(document.getElementById('slider')) return 'answering';
  if(document.getElementById('shakeBtn')||document.getElementById('tapBtn')) return 'picking';
  if(document.getElementById('startBtn')) return 'lobby';
  if(document.querySelector('.king-chance-stage')) return 'king';
  // protagonist_setup: .glass h2 no slider, no shakeBtn
  if(document.querySelector('.glass h2')) return 'protagonist_setup';
  return null;
})()`;

async function getPhase(tab) { return tab.tryEval(PHASE_EXPR); }

async function waitPhase(tab, ...phases) {
  return waitFor(tab, `(()=>{
    const p=${PHASE_EXPR};
    return ${JSON.stringify(phases)}.includes(p);
  })()`, 25_000, 350);
}

/* ─── Game actions ─── */
async function doShake(tab) {
  tab.log("摇签 start");
  const r1 = await tab.click("#shakeBtn");
  tab.log("shakeBtn:", r1);
  await tab.wait(1500);
  for (let i=0; i<25; i++) { await tab.eval(`(()=>{document.getElementById('tapBtn')?.click()})()`); await tab.wait(70); }
  const ok = await waitFor(tab, "!!document.getElementById('doneBtn')", 10_000);
  if (!ok) {
    for (let i=0; i<20; i++) { await tab.eval(`(()=>{document.getElementById('tapBtn')?.click()})()`); await tab.wait(70); }
    await waitFor(tab, "!!document.getElementById('doneBtn')", 6_000);
  }
  const stk = await tab.tryEval("document.querySelector('.stick-out,.stick-name')?.textContent?.trim()||''");
  tab.log("stick:", stk);
  await tab.click("#doneBtn");
}

async function submitScore(tab, val, label) {
  await tab.eval(`(()=>{const s=document.getElementById('slider');if(!s)return;s.value=${val};s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await tab.wait(300);
  tab.log(`${label} submit ${val}`);
  return tab.click("#submitBtn");
}

/* ─── MAIN ─── */
const R = {
  roomCode: null,
  kingChance: { triggered:false, numCard:null, seatNo:null, orderUI:null, orderIsAB:null },
  kingResult: { received:false, kingText:null, watcherText:null, instrText:null },
  lights: { burstA:false, offA:false, burstB:false, offB:false, gotFirstReveal:false },
  laok: [],
  finished: { reached:false, noKing:true },
  scrollWidths: {},
  consoleErrors: [],
};

try {
  /* 1. REST 建房 */
  console.log("=== 1. 建房 ===");
  const rj = await (await fetch(`${BASE}/api/room`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({deck:"man"}) })).json();
  if (!rj.code) throw new Error("建房失败: " + JSON.stringify(rj));
  R.roomCode = rj.code;
  console.log("room code:", R.roomCode);

  /* 2. CDP 连接 */
  console.log("=== 2. CDP ===");
  const tgA = await getPageTarget(PA);
  const tgB = await getPageTarget(PB);
  const tabA = new Tab("甲-A");
  const tabB = new Tab("乙-B");
  await tabA.connectTo(tgA.webSocketDebuggerUrl);
  await tabB.connectTo(tgB.webSocketDebuggerUrl);

  /* 3. 两端入座 */
  console.log("=== 3. join ===");
  const url = `${BASE}/?room=${R.roomCode}`;

  // TabA (host) joins first
  await tabA.goto(url);
  tabA.log("body preview:", await tabA.tryEval("document.body.innerText.slice(0,120)"));
  await tabA.type("#nameIn", "甲玩家");
  await tabA.wait(200);
  await tabA.click("#joinBtn");
  await waitPhase(tabA, "lobby");
  tabA.log("A phase:", await getPhase(tabA));
  await tabA.shot("qaC-01-甲-大厅.jpg");
  R.scrollWidths["lobby-A"] = await tabA.tryEval("document.documentElement.scrollWidth");

  // TabB joins
  await tabB.goto(url);
  tabB.log("body preview:", await tabB.tryEval("document.body.innerText.slice(0,120)"));
  await tabB.type("#nameIn", "乙玩家");
  await tabB.wait(200);
  await tabB.click("#joinBtn");
  await waitPhase(tabB, "lobby");
  tabB.log("B phase:", await getPhase(tabB));

  // Wait for 2 players in A's lobby
  await waitFor(tabA, "[...document.querySelectorAll('.player')].length>=2", 12_000);
  const players = await tabA.tryEval("[...document.querySelectorAll('.player b')].map(b=>b.textContent).join(',')");
  tabA.log("players:", players);
  await tabA.shot("qaC-02-甲-两人大厅.jpg");
  await tabB.shot("qaC-02-乙-两人大厅.jpg");

  /* 4. 开局 */
  console.log("=== 4. 开局 ===");
  await waitFor(tabA, "!document.getElementById('startBtn')?.disabled", 20_000);
  await tabA.eval(`(()=>{const s=document.getElementById('roundsSel');if(s){s.value='3';s.dispatchEvent(new Event('change',{bubbles:true}));}})()`);
  await tabA.wait(400);
  await tabA.click("#startBtn");
  tabA.log("startBtn clicked");

  await waitPhase(tabA, "picking");
  await waitPhase(tabB, "picking");
  tabA.log("picking confirmed on both");

  /* 5. 游戏循环 */
  let iter = 0;
  while (iter < 15) {
    iter++;
    const phA = await getPhase(tabA);
    tabA.log(`\n--- iter ${iter} phase:${phA} ---`);

    if (phA === "finished" || phA === null) {
      tabA.log("FINISHED or null => break");
      R.finished.reached = (phA === "finished");
      break;
    }

    if (phA === "aha") {
      await tabA.shot(`qaC-aha-${iter}-甲.jpg`);
      await tabA.wait(1500);
      // Only host sees nextBtn in aha phase (isFinal=false); absent when finished (isFinal=true)
      const hasNext = await tabA.tryEval("!!document.getElementById('nextBtn')");
      if (!hasNext) {
        tabA.log("aha: no #nextBtn → already finished");
        R.finished.reached = true;
        break;
      }
      const btnTxt = await tabA.tryEval("document.getElementById('nextBtn')?.textContent?.trim()||''");
      tabA.log("aha nextBtn text:", btnTxt);
      await tabA.click("#nextBtn");
      await tabA.wait(900);
      // Wait for DIFFERENT phase (picking=next protagonist, finished, or aha continue if somehow needed)
      await waitPhase(tabA, "picking","finished");
      const afterPhase = await getPhase(tabA);
      tabA.log("after aha click, phase:", afterPhase);
      if (afterPhase === "finished") { R.finished.reached = true; break; }
      if (afterPhase === "picking") continue;
      // If still aha (unusual), continue
      continue;
    }

    if (phA === "picking") {
      // Detect who is shaker: the one seeing "tapBtn" is the shaker
      // Actually shaker is the one whose shakeBtn is interactive; both see shake UI but only shaker can interact.
      // Simpler: check who sees "你是摇签人" or just try A first, if it doesn't respond try B.
      const shakerText = await tabA.tryEval("document.querySelector('.glass h2,.glass .dim')?.textContent?.trim()||''");
      tabA.log("shaker hint:", shakerText);
      await tabA.shot(`qaC-pick-${iter}-甲.jpg`);

      // Try shaking from A; if shakeBtn NOT there or tap doesn't progress, try B
      const shakeOnA = await tabA.tryEval("!!document.getElementById('shakeBtn')");
      const shakeOnB = await tabB.tryEval("!!document.getElementById('shakeBtn')");
      tabA.log(`shakeBtn: A=${shakeOnA} B=${shakeOnB}`);

      // Both see shakeBtn; we need to know who is the shaker.
      // Check current shaker text from each perspective
      const shakerNameA = await tabA.tryEval("document.querySelector('.glass h2')?.textContent?.includes('摇签') ? 'yes':'no'");
      const youAreShaker = await tabA.tryEval(
        "[...document.querySelectorAll('.glass .dim,.glass h2')].some(e=>e.textContent.includes('你来摇'))||" +
        "document.querySelector('#shakeBtn:not([disabled])')!==null"
      );
      tabA.log("A youAreShaker hint:", youAreShaker);

      // Best approach: try A first since A is host and should be shaker on first round
      // If shake stalls, the non-shaker's tapBtn won't progress; we detect and try B.
      const beforeTaps = await tabA.tryEval("!!document.getElementById('doneBtn')");
      if (!beforeTaps) {
        await doShake(tabA);
        const doneA = await tabA.tryEval("!!document.getElementById('doneBtn')");
        if (!doneA) {
          tabA.log("doneBtn not on A, trying B");
          await doShake(tabB);
        }
      } else {
        await tabA.click("#doneBtn");
      }
      await waitPhase(tabA, "protagonist_setup", "answering");
      continue;
    }

    if (phA === "protagonist_setup") {
      // protagonist auto-sends set_gender via app.js; just wait
      await waitPhase(tabA, "answering");
      continue;
    }

    if (phA === "answering") {
      // Who is protagonist? Protagonist sees "youAreProtagonist" hint
      const protHintA = await tabA.tryEval(
        "document.querySelector('.glass h2')?.textContent?.includes('你来打') || " +
        "document.body.innerText.includes('你来打') || " +
        "document.body.innerText.includes('主角是你')"
      );
      const protHintB = await tabB.tryEval(
        "document.querySelector('.glass h2')?.textContent?.includes('你来打') || " +
        "document.body.innerText.includes('你来打') || " +
        "document.body.innerText.includes('主角是你')"
      );
      // More reliable: protagonist has submit button but the page header shows "打分"
      const aBodyText = await tabA.tryEval("document.body.innerText.slice(0,300)");
      const bBodyText = await tabB.tryEval("document.body.innerText.slice(0,300)");
      tabA.log("A answering body:", aBodyText?.slice(0,100));
      tabB.log("B answering body:", bBodyText?.slice(0,100));
      tabA.log(`protHint A=${protHintA} B=${protHintB}`);

      // Protagonist has the slider AND the prot-specific header
      // In app.js: protagonist sees "主角是你" in setup, then just slider+submit in answering
      // Guesser also sees slider+submit but the header says "猜猜 [name] 的分"
      // Let's check body text for "猜猜" to identify guesser
      // Guesser sees "盲猜 <name> 会打几分"; protagonist sees "你的真实打分"
      const aIsGuesser = !!(aBodyText && (aBodyText.includes("盲猜") || aBodyText.includes("猜猜")));
      const bIsGuesser = !!(bBodyText && (bBodyText.includes("盲猜") || bBodyText.includes("猜猜")));
      tabA.log(`aIsGuesser=${aIsGuesser} bIsGuesser=${bIsGuesser}`);

      await tabA.shot(`qaC-answer-${iter}-甲.jpg`);
      await tabB.shot(`qaC-answer-${iter}-乙.jpg`);

      if (aIsGuesser) {
        // B is protagonist
        await submitScore(tabB, SCORE, "乙(prot)");
        await tabB.wait(400);
        await submitScore(tabA, SCORE, "甲(guess-exact)");
      } else {
        // A is protagonist (or unknown — default to A prot)
        await submitScore(tabA, SCORE, "甲(prot)");
        await tabA.wait(400);
        await submitScore(tabB, SCORE, "乙(guess-exact)");
      }

      await waitPhase(tabA, "reveal");
      tabA.log("reveal reached");

      /* ── reveal ── */
      await tabA.wait(1500);
      await tabA.shot(`qaC-reveal-${iter}-甲.jpg`);
      await tabB.shot(`qaC-reveal-${iter}-乙.jpg`);
      R.scrollWidths[`rv${iter}-A`] = await tabA.tryEval("document.documentElement.scrollWidth");
      R.scrollWidths[`rv${iter}-B`] = await tabB.tryEval("document.documentElement.scrollWidth");

      /* 爆灯/灭灯 */
      const bA = await tabA.tryEval("!!document.getElementById('roundBurstBtn')");
      const oA = await tabA.tryEval("!!document.getElementById('roundOffBtn')");
      const bB = await tabB.tryEval("!!document.getElementById('roundBurstBtn')");
      const oB = await tabB.tryEval("!!document.getElementById('roundOffBtn')");
      tabA.log(`lights: A burst=${bA} off=${oA}  B burst=${bB} off=${oB}`);
      if (!R.lights.gotFirstReveal) {
        R.lights = { burstA:!!bA, offA:!!oA, burstB:!!bB, offB:!!oB, gotFirstReveal:true };
      }
      // Non-protagonist clicks burst
      // Non-protagonist (guesser) gets to vote lights; protagonist cannot
      // aIsGuesser=true → A is guesser and should vote (A has burst/off buttons)
      // bIsGuesser=true → B is guesser and should vote (B has burst/off buttons)
      if (aIsGuesser && bA) { await tabA.click("#roundBurstBtn"); tabA.log("A 爆灯 (guesser)"); }
      else if (bIsGuesser && bB) { await tabB.click("#roundBurstBtn"); tabB.log("B 爆灯 (guesser)"); }
      else if (bA) { await tabA.click("#roundBurstBtn"); tabA.log("A 爆灯 (fallback)"); }
      else if (bB) { await tabB.click("#roundBurstBtn"); tabB.log("B 爆灯 (fallback)"); }

      /* 老K 锐评 */
      await tabA.wait(4000);
      const ltA = await tabA.tryEval("document.querySelector('.laok-text')?.textContent?.trim()||''");
      const ltB = await tabB.tryEval("document.querySelector('.laok-text')?.textContent?.trim()||''");
      tabA.log(`laok A:"${ltA}" B:"${ltB}"`);
      if (ltA) R.laok.push({ iter, who:"A", text:ltA });
      if (ltB) R.laok.push({ iter, who:"B", text:ltB });
      if (ltA||ltB) await tabA.shot(`qaC-laok-${iter}-甲.jpg`);

      /* 号码国王 */
      const hasKC = await tabA.tryEval("!!document.querySelector('.king-numcard')");
      const hasKCB = await tabB.tryEval("!!document.querySelector('.king-numcard')");
      tabA.log("king-numcard A:", hasKC, " B:", hasKCB);

      if ((hasKC || hasKCB) && !R.kingChance.triggered) {
        R.kingChance.triggered = true;
        // King is the exact guesser
        const kingTab   = aIsGuesser ? tabA : tabB;
        const watchTab  = aIsGuesser ? tabB : tabA;

        /* 号码牌 */
        const seatNo   = await kingTab.tryEval("window.ui?.state?.you?.seatNo"); // may be undefined (module scope)
        // Try via DOM
        const ncNum    = await kingTab.tryEval("document.querySelector('.knc-num')?.textContent?.trim()");
        const ncHint   = await kingTab.tryEval("document.querySelector('.knc-hint')?.textContent?.trim()");
        const ncPresent= await kingTab.tryEval("!!document.querySelector('.king-numcard')");
        // Check if king is current (iAmCurrent shows king-report UI)
        const isCurrentKing = await kingTab.tryEval("!!document.querySelector('.king-report,.king-chance-stage.king-report')");
        tabA.log(`numCard present=${ncPresent} num="${ncNum}" hint="${ncHint}" isCurrent=${isCurrentKing}`);
        R.kingChance.numCard = { present:ncPresent, num:ncNum, hint:ncHint };
        R.kingChance.seatNo = ncNum; // use the displayed number

        await kingTab.shot(`qaC-king-numcard-${iter}-国王.jpg`);
        await watchTab.shot(`qaC-king-numcard-${iter}-旁观.jpg`);

        /* 指令卡 */
        const orderCards = await kingTab.tryEval("[...document.querySelectorAll('.king-option')].map(b=>b.textContent?.trim()).join(' | ')");
        R.kingChance.orderUI = orderCards;
        R.kingChance.orderIsAB = !!(orderCards && orderCards.includes("号"));
        kingTab.log("order cards:", orderCards);
        kingTab.log("king-nums buttons:", await kingTab.tryEval("!!document.getElementById('kingNums')"));

        if (isCurrentKing) {
          /* 选号码 */
          const n1 = await kingTab.eval(`(()=>{const b=[...document.querySelectorAll('.king-num')].find(x=>x.dataset.num==='1');if(b){b.click();return'ok';}return'NOT_FOUND'})()`);
          await kingTab.wait(300);
          const n2 = await kingTab.eval(`(()=>{const b=[...document.querySelectorAll('.king-num')].find(x=>x.dataset.num==='2');if(b){b.click();return'ok';}return'NOT_FOUND'})()`);
          await kingTab.wait(300);
          kingTab.log("num clicks: 1->"+n1+" 2->"+n2);

          /* 选指令卡 */
          const oTxt = await kingTab.eval(`(()=>{const b=document.querySelector('.king-option');if(!b)return'NOT_FOUND';b.click();return b.textContent?.trim()||''})()`);
          await kingTab.wait(300);
          kingTab.log("picked order:", oTxt);

          await kingTab.shot(`qaC-king-reportUI-${iter}-国王.jpg`);

          /* 发报号 */
          const sDisabled = await kingTab.tryEval("document.getElementById('kingSendBtn')?.disabled");
          kingTab.log("kingSendBtn disabled:", sDisabled);
          await kingTab.click("#kingSendBtn");
          await kingTab.wait(800);

          /* 等揭晓 */
          await waitFor(kingTab, "!!document.querySelector('.king-result-line')", 8_000);
          const rTextK = await kingTab.tryEval("document.querySelector('.king-result-line')?.innerText?.trim()||''");
          const rTextW = await watchTab.tryEval("document.querySelector('.king-result-line')?.innerText?.trim()||''");
          const instrTxt = await kingTab.tryEval("document.querySelector('.king-order-text')?.textContent?.trim()||''");
          R.kingResult = { received:!!(rTextK||rTextW), kingText:rTextK, watcherText:rTextW, instrText:instrTxt };
          kingTab.log(`result: king="${rTextK}" watcher="${rTextW}" instr="${instrTxt}"`);

          await kingTab.shot(`qaC-king-result-${iter}-国王.jpg`);
          await watchTab.shot(`qaC-king-result-${iter}-旁观.jpg`);
        } else {
          kingTab.log("WARNING: not iAmCurrent king despite having numcard");
        }
      }

      /* host clicks next */
      await tabA.wait(600);
      const nextRes = await tabA.click("#nextBtn");
      tabA.log("nextBtn:", nextRes);
      await tabA.wait(700);
      continue;
    }

    if (phA === "drinking") {
      tabA.log("drinking");
      await tabA.shot(`qaC-drink-${iter}.jpg`);
      const dA = await tabA.tryEval("!!document.getElementById('drinkDoneBtn')");
      const dB = await tabB.tryEval("!!document.getElementById('drinkDoneBtn')");
      if (dA) await tabA.click("#drinkDoneBtn");
      if (dB) await tabB.click("#drinkDoneBtn");
      await tabA.wait(600);
      // Host skips drinking
      await tabA.click("#skipDrinkBtn");
      await tabA.wait(300);
      await tabA.click("#nextBtn");
      await tabA.wait(700);
      continue;
    }

    if (phA === "king") {
      tabA.log("king phase");
      await tabA.shot(`qaC-kingphase-${iter}-甲.jpg`);
      await tabB.shot(`qaC-kingphase-${iter}-乙.jpg`);
      // Handle remaining king_chance reporting if needed
      const kcPresent = await tabA.tryEval("!!document.querySelector('.king-report')");
      if (kcPresent) {
        // Whoever is current king should report
        const kingOnA = await tabA.tryEval("!!document.querySelector('.king-report')");
        const kt = kingOnA ? tabA : tabB;
        const n1 = await kt.eval(`(()=>{const b=[...document.querySelectorAll('.king-num')].find(x=>x.dataset.num==='1');if(b){b.click();return'ok';}return'NF'})()`);
        await kt.wait(250);
        const n2 = await kt.eval(`(()=>{const b=[...document.querySelectorAll('.king-num')].find(x=>x.dataset.num==='2');if(b){b.click();return'ok';}return'NF'})()`);
        await kt.wait(250);
        await kt.eval(`(()=>{document.querySelector('.king-option')?.click()})()`);
        await kt.wait(300);
        await kt.click("#kingSendBtn");
        await kt.wait(600);
      }
      await tabA.wait(500);
      await tabA.click("#nextBtn");
      await tabA.wait(700);
      continue;
    }

    tabA.log("unknown phase:", phA, "— waiting");
    await tabA.wait(1500);
  }

  /* 6. 终局验证 */
  console.log("\n=== 6. 终局验证 ===");
  const fpA = await getPhase(tabA);
  const fpB = await getPhase(tabB);
  tabA.log("final phase A:", fpA, " B:", fpB);
  if (fpA === "finished" || fpB === "finished") R.finished.reached = true;

  // king=null check: if state is accessible; else check DOM for king elements
  const kingInFin = await tabA.tryEval(
    "window.ui?.state?.phase==='finished'&&!!(window.ui?.state?.king)"
  ) || false;
  const kingDomInFin = await tabA.tryEval("!!document.querySelector('.king-chance-stage,.king-game')&&!document.querySelector('.big-score')") || false;
  R.finished.noKing = !kingInFin && !kingDomInFin;

  await tabA.shot("qaC-finished-甲.jpg");
  await tabB.shot("qaC-finished-乙.jpg");
  R.scrollWidths["fin-A"] = await tabA.tryEval("document.documentElement.scrollWidth");
  R.scrollWidths["fin-B"] = await tabB.tryEval("document.documentElement.scrollWidth");

  R.consoleErrors = [
    ...tabA.errs.map(e=>"[A] "+e),
    ...tabB.errs.map(e=>"[B] "+e),
  ];

} catch(e) {
  console.error("FLOW ERROR:", e.message);
  R.flowError = e.message;
} finally {
  clearTimeout(KILL);
  try { childA.kill(); } catch {}
  try { childB.kill(); } catch {}
}

/* ─── 结构化报告 ─── */
console.log("\n═══════════════ 多人局 QA 报告 ═══════════════");
console.log(`\n房间码: ${R.roomCode}`);

console.log("\n【1. 号码国王 R2.5】");
if (!R.kingChance.triggered) {
  console.log("  ❌ king_chance 未触发（exact 猜分未生效或流程中断）");
} else {
  console.log("  ✅ king_chance 触发");
  const nc = R.kingChance.numCard;
  console.log(nc?.present ? "  ✅ 号码牌 .king-numcard 存在" : "  ❌ 号码牌未找到");
  console.log(`     knc-num="${nc?.num}"  hint="${nc?.hint}"`);
  console.log(`  指令卡: ${R.kingChance.orderUI}`);
  console.log(R.kingChance.orderIsAB ? "  ✅ 指令卡含「号」字（甲号乙号对抗式）" : "  ⚠️  指令卡未见「号」字");
  console.log(R.kingResult.received ? "  ✅ 揭晓收到" : "  ❌ 揭晓未收到");
  if (R.kingResult.received) {
    console.log(`     国王端: "${R.kingResult.kingText}"`);
    console.log(`     旁观端: "${R.kingResult.watcherText}"`);
    console.log(`     指令:   "${R.kingResult.instrText}"`);
  }
}

console.log("\n【2. 每题爆灯/灭灯】");
const lr = R.lights;
const lightOK = lr.burstA||lr.offA||lr.burstB||lr.offB;
console.log(lightOK ? "  ✅ 有爆灯/灭灯按钮" : "  ❌ 两端均无按钮");
console.log(`     A: burst=${lr.burstA} off=${lr.offA}  B: burst=${lr.burstB} off=${lr.offB}`);

console.log("\n【3. 老K每题锐评】");
if (R.laok.length) {
  console.log(`  ✅ ${R.laok.length} 条锐评:`);
  R.laok.forEach(t => console.log(`     [iter${t.iter} ${t.who}] "${t.text}"`));
} else {
  console.log("  ❌ 未收到老K锐评");
}

console.log("\n【4. 终局无大国王】");
console.log(R.finished.reached ? "  ✅ 到达 finished" : "  ⚠️  未到 finished");
console.log(R.finished.noKing ? "  ✅ 终局无大国王（king=null 或 DOM 无 king 元素）" : "  ❌ 终局仍有 king 元素");

console.log("\n【5. 溢出检查 scrollWidth】");
const over = Object.entries(R.scrollWidths).filter(([,v])=>v&&v>390);
if (!over.length) { console.log("  ✅ 全部 ≤390"); Object.entries(R.scrollWidths).forEach(([k,v])=>console.log(`     ${k}: ${v}`)); }
else { over.forEach(([k,v])=>console.log(`  ❌ ${k}: ${v}`)); }

console.log("\n【6. Console 报错】");
const ce = [...R.consoleErrors, ...(R.flowError?["FLOW_ERROR: "+R.flowError]:[])];
if (!ce.length) console.log("  ✅ 无 JS 异常");
else ce.forEach(l => console.log("  ⚠️ ", l));

console.log("\n═════════════════ 总判 ═════════════════");
const pass = R.kingChance.triggered && R.kingChance.numCard?.present && R.kingResult.received && R.laok.length>0 && R.finished.reached && R.finished.noKing;
console.log(pass ? "✅ R2.5 号码国王在真多人局成立" : "⚠️  存在未通过项：");
if (!pass) {
  if (!R.kingChance.triggered) console.log("  - 号码国王未触发");
  if (!R.kingChance.numCard?.present) console.log("  - 号码牌UI异常");
  if (!R.kingResult.received) console.log("  - 揭晓未收到");
  if (!R.laok.length) console.log("  - 老K锐评为空");
  if (!R.finished.reached) console.log("  - 未到终局");
  if (!R.finished.noKing) console.log("  - 终局存在大国王");
}
console.log("═══════════════════════════════════════\n");
process.exit(0);
