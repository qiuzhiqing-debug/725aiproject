// 流程4: 第二人加入既有房间 5776,验证多人同房可见性
const Q = "d:/AIgo/理想型加载中/满分男/qa/";
export default async function (ctx) {
  await ctx.goto("http://127.0.0.1:8787/?room=5776&table=3");
  await ctx.wait(1500);
  await ctx.shot(Q + "qa2-27-深链首页-390.jpg");
  ctx.log("deep home text:", await ctx.eval("document.body.innerText.slice(0,260)"));
  await ctx.type("#nameIn", "第二位");
  await ctx.click("#joinBtn");
  await ctx.wait(2500);
  ctx.log("room text:", await ctx.eval("document.body.innerText.slice(0,500)"));
  await ctx.shot(Q + "qa2-28-第二人入座-390.jpg");
}
