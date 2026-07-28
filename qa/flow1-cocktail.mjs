// 流程1: 首页 → 调酒答题(含回退) → 摇酒 → 结果卡 → 进大厅
const Q = "d:/AIgo/理想型加载中/满分男/qa/";
export default async function (ctx) {
  await ctx.goto("http://127.0.0.1:8787/");
  await ctx.wait(1500);
  ctx.log("URL after / :", await ctx.url());

  // Q1 选 D 威士忌
  await ctx.clickText(".quiz-option", "威士忌");
  await ctx.wait(800);
  ctx.log("Q2 title:", await ctx.eval("document.getElementById('questionTitle').textContent"));
  await ctx.shot(Q + "qa2-02-第二题-390.jpg");

  // 回退测试
  await ctx.click("#backBtn");
  await ctx.wait(500);
  ctx.log("after back title:", await ctx.eval("document.getElementById('questionTitle').textContent"));
  ctx.log("back btn hidden on Q1:", await ctx.eval("document.getElementById('backBtn').classList.contains('hidden')"));

  // 重新答完 4 题
  await ctx.clickText(".quiz-option", "威士忌");
  await ctx.wait(700);
  await ctx.clickText(".quiz-option", "鲜榨青柠");
  await ctx.wait(700);
  await ctx.shot(Q + "qa2-03-第三题-390.jpg");
  await ctx.clickText(".quiz-option", "一颗酒渍樱桃");
  await ctx.wait(700);
  await ctx.clickText(".quiz-option", "一颗大方冰");
  await ctx.wait(900);

  // 摇酒界面
  await ctx.shot(Q + "qa2-04-摇酒初始-390.jpg");
  ctx.log("shake caption:", await ctx.eval("document.getElementById('mixCaption').textContent"));
  ctx.log("shake btn:", await ctx.eval("document.getElementById('shakeBtn').textContent"));

  // 第一次点击 → 桌面降级
  await ctx.click("#shakeBtn");
  await ctx.wait(2000);
  ctx.log("after first click btn:", await ctx.eval("document.getElementById('shakeBtn').textContent"));
  ctx.log("after first click caption:", await ctx.eval("document.getElementById('mixCaption').textContent"));

  // 连点几下截中途
  for (let i = 0; i < 4; i++) { await ctx.click("#shakeBtn"); await ctx.wait(120); }
  await ctx.shot(Q + "qa2-05-摇酒中-390.jpg");
  ctx.log("mid caption:", await ctx.eval("document.getElementById('mixCaption').textContent"));
  // 点满
  for (let i = 0; i < 8; i++) { await ctx.click("#shakeBtn"); await ctx.wait(100); }
  await ctx.wait(1200);
  ctx.log("post-shake caption:", await ctx.eval("document.getElementById('mixCaption').textContent"));
  // 倒酒动画
  await ctx.wait(1500);
  await ctx.shot(Q + "qa2-06-倒酒-390.jpg");
  await ctx.wait(3500);

  // 结果卡
  await ctx.shot(Q + "qa2-07-结果卡-390.jpg");
  ctx.log("result name:", await ctx.eval("document.getElementById('resultName').textContent"));
  ctx.log("result recipe:", await ctx.eval("document.getElementById('resultRecipe').textContent"));
  ctx.log("result intro:", await ctx.eval("document.getElementById('resultIntro').textContent"));

  // 进大厅
  await ctx.click("#resultGo");
  await ctx.wait(2500);
  ctx.log("URL after go:", await ctx.url());
  ctx.log("localStorage:", await ctx.eval("JSON.stringify({c:!!localStorage.getItem('ideal_cocktail'),uid:localStorage.getItem('ideal_userId'),tok:!!localStorage.getItem('ideal_token'),name:localStorage.getItem('mfn_name')})"));
  await ctx.shot(Q + "qa2-08-大厅竖屏-390.jpg");
}
