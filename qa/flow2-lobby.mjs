// 流程2: 大厅(桌面横屏) → 找朋友 → 点桌 → 房间码一致性 → 游戏页入座
const Q = "d:/AIgo/理想型加载中/满分男/qa/";
export default async function (ctx) {
  // 预置调酒身份(模拟已完成调酒的用户)
  await ctx.goto("http://127.0.0.1:8787/v2/lobby.html");
  await ctx.eval(`localStorage.setItem('ideal_cocktail', JSON.stringify({name:'深夜电台·分寸特调',prefix:'深夜电台',suffix:'分寸特调',glass:'rocks',palette:['#7a4a1b','#e08a1e','#b8e858'],paletteId:13,ice:1,garnish:0,intro:'第一口冲，第二口就懂了。有些人也是。',recipe:'威士忌 · 鲜榨青柠 · 酒渍樱桃 · 一颗大方冰',answers:[3,1,0,1]}))`);
  await ctx.wait(3500);
  await ctx.shot(Q + "qa2-09-大厅-1400.jpg");

  // 点老K
  await ctx.click("#bartenderSlot");
  await ctx.wait(600);
  ctx.log("K quote:", await ctx.eval("[...document.querySelectorAll('.quote')].map(e=>e.textContent).join(' | ')"));

  // 找朋友弹层
  await ctx.click("#findFriendsBtn");
  await ctx.wait(400);
  await ctx.shot(Q + "qa2-10-找朋友-1400.jpg");
  await ctx.type("#codeInput", "12");
  await ctx.click("#codeGo");
  await ctx.wait(300);
  ctx.log("invalid msg:", await ctx.eval("document.getElementById('codeMsg').textContent"));
  await ctx.type("#codeInput", "0001");
  await ctx.click("#codeGo");
  await ctx.wait(1500);
  ctx.log("nonexist msg:", await ctx.eval("document.getElementById('codeMsg').textContent"));
  ctx.log("go btn text:", await ctx.eval("document.getElementById('codeGo').textContent"));
  await ctx.click("#codeClose");
  await ctx.wait(300);

  // 点 3 号桌
  await ctx.click('.table[data-table="3"]');
  await ctx.wait(2500);
  const url1 = await ctx.url();
  ctx.log("join#1 URL:", url1);
  await ctx.shot(Q + "qa2-11-游戏页首屏-1400.jpg");

  // 回大厅再点同一桌,验证房间码
  await ctx.goto("http://127.0.0.1:8787/v2/lobby.html");
  await ctx.wait(2000);
  await ctx.click('.table[data-table="3"]');
  await ctx.wait(2500);
  const url2 = await ctx.url();
  ctx.log("join#2 URL:", url2);

  // 起昵称入座
  await ctx.type("#nameIn", "挑刺员");
  await ctx.wait(200);
  ctx.log("join btn:", await ctx.eval("document.getElementById('joinBtn')?.textContent"));
  await ctx.click("#joinBtn");
  await ctx.wait(2500);
  ctx.log("after join phase:", await ctx.eval("document.body.innerText.slice(0,400)"));
  await ctx.shot(Q + "qa2-12-入座后房间-1400.jpg");
  ctx.log("URL after seat:", await ctx.url());
  ctx.log("localStorage nick sync:", await ctx.eval("JSON.stringify({name:localStorage.getItem('mfn_name'),uid:localStorage.getItem('ideal_userId')})"));
  // 大厅人数轮询验证:回 lobby 看 3 号桌人数
  await ctx.goto("http://127.0.0.1:8787/v2/lobby.html");
  await ctx.wait(2500);
  ctx.log("table3 seats:", await ctx.eval("document.querySelector('.table[data-table=\\'3\\'] .table-seats').textContent"));
  await ctx.shot(Q + "qa2-13-大厅有人-1400.jpg");
}
