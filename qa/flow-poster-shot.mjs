// 补拍: 海报滚动进视口的截图
const Q = "d:/AIgo/理想型加载中/满分男/qa/";
export default async function (ctx) {
  await ctx.goto("http://127.0.0.1:8787/?preview=poster");
  const t0 = Date.now();
  while (Date.now() - t0 < 30000) {
    if (await ctx.eval("!!document.querySelector('.poster-img')")) break;
    await ctx.wait(500);
  }
  await ctx.eval("document.querySelector('.poster-img')?.scrollIntoView({block:'center'})");
  await ctx.wait(600);
  await ctx.shot(Q + "g-fix-poster-visible-390.jpg");
  ctx.log("poster src:", await ctx.eval("document.querySelector('.poster-img')?.src?.slice(0,40)"));
}
