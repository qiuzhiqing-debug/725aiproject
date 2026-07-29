// 聚焦复验：公网注册流程（坏口令→报错提示；合法口令→201→跳大厅）
const BASE = "https://ideal-type-loading.kimnin-iup.workers.dev";
const Q = "d:/AIgo/理想型加载中/满分男/qa/";

const waitFor = async (ctx, expr, timeout = 15000, step = 400) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await ctx.eval(expr)) return true; } catch {}
    await ctx.wait(step);
  }
  ctx.log("WAITFOR TIMEOUT:", expr);
  return false;
};

export default async function (ctx) {
  // 进站 + 清空
  await ctx.goto(BASE + "/");
  await ctx.eval("try{localStorage.clear()}catch(e){}");
  await ctx.wait(400);
  await ctx.goto(BASE + "/");
  await ctx.wait(2500);
  ctx.log("URL after entry:", await ctx.url());

  // 调酒四题
  await waitFor(ctx, "document.querySelectorAll('.quiz-option').length > 0", 12000);
  for (const t of ["金酒", "苏打气泡", "酒渍樱桃", "不加冰"]) {
    await ctx.clickText(".quiz-option", t);
    await ctx.wait(900);
  }

  // 摇壶充能（点 #mixShaker 直到出现结果/ resultGo）
  ctx.log("shaker present:", await ctx.eval("!!document.getElementById('mixShaker')"));
  for (let i = 0; i < 40; i++) {
    await ctx.eval("(()=>{const e=document.getElementById('mixShaker');e&&e.click();})()");
    await ctx.wait(150);
    if (await ctx.eval("!!document.getElementById('resultGo') && !document.getElementById('resultGo').closest('.hidden')")) break;
  }
  const gotResult = await waitFor(ctx, "!!document.getElementById('resultGo')", 8000);
  ctx.log("resultGo present:", gotResult);
  await ctx.shot(Q + "reg-01-result.jpg");

  // 进注册段
  await ctx.click("#resultGo");
  await ctx.wait(1200);
  const regShown = await waitFor(ctx, "!!document.getElementById('regName') && !document.getElementById('register').classList.contains('hidden')", 8000);
  ctx.log("register panel shown:", regShown);
  ctx.log("regPass placeholder:", await ctx.eval("document.getElementById('regPass')?.placeholder || ''"));
  ctx.log("regName placeholder:", await ctx.eval("document.getElementById('regName')?.placeholder || ''"));
  await ctx.shot(Q + "reg-02-form.jpg");

  const uname = "qacoco" + (Date.now() % 100000);

  // 选性别/取向 chip（#regGender / #regSeeking 下的 [data-v]）
  await ctx.eval("(()=>{const e=document.querySelector('#regGender [data-v]');e&&e.click();})()");
  await ctx.eval("(()=>{const e=document.querySelector('#regSeeking [data-v]');e&&e.click();})()");
  ctx.log("gender chips:", await ctx.eval("[...document.querySelectorAll('#regGender [data-v]')].map(x=>x.dataset.v).join(',')"));
  ctx.log("seeking chips:", await ctx.eval("[...document.querySelectorAll('#regSeeking [data-v]')].map(x=>x.dataset.v).join(',')"));

  // ── 子测A：坏口令（含字母，QA 用的 qa1234）→ 应报错，不跳转 ──
  await ctx.type("#regName", uname);
  await ctx.type("#regPass", "qa1234");
  await ctx.click("#regSubmit");
  await ctx.wait(1800);
  const badMsg = await ctx.eval("document.getElementById('regMsg')?.textContent || ''");
  const badHidden = await ctx.eval("document.getElementById('regMsg')?.classList.contains('hidden')");
  const badURL = await ctx.url();
  ctx.log("A) badpass regMsg:", JSON.stringify(badMsg));
  ctx.log("A) badpass regMsg hidden:", badHidden);
  ctx.log("A) badpass URL (应仍在 cocktail):", badURL);
  await ctx.shot(Q + "reg-03-badpass.jpg");

  // ── 子测B：合法数字口令 → 201 → 跳大厅 ──
  await ctx.type("#regPass", "8842");
  await ctx.click("#regSubmit");
  await ctx.wait(3500);
  const okURL = await ctx.url();
  const uid = await ctx.eval("localStorage.getItem('ideal_userId')");
  const tok = await ctx.eval("localStorage.getItem('ideal_token')");
  ctx.log("B) validpass URL (应到 lobby):", okURL);
  ctx.log("B) at lobby:", okURL.includes("lobby"));
  ctx.log("B) ideal_userId set:", !!uid, uid);
  ctx.log("B) ideal_token set:", !!tok);
  ctx.log("B) scrollWidth:", await ctx.eval("document.documentElement.scrollWidth"));
  await ctx.shot(Q + "reg-04-afterlobby.jpg");
}
