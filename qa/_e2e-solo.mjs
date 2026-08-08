// PM 终检：真实点击打穿一局 solo（首页→开桌1人→开局→摇签→方向→答题→揭晓→爆灯→亮相→海报）
import { chromium } from "playwright";
const B="http://127.0.0.1:8787";
const b=await chromium.launch({args:["--no-proxy-server"]});
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage();
const errs=[];p.on("pageerror",e=>errs.push(String(e).slice(0,150)));
await p.route(/image\.pollinations\.ai/,r=>r.abort()); // 生图外链掐掉,走占位
const shots=[];let step=0;
async function shot(tag){const f=`qa/_e2e-${String(++step).padStart(2,"0")}-${tag}.jpg`;await p.screenshot({path:f,quality:80,type:"jpeg"});shots.push(f);}
async function clickText(re,desc){
  const btns=await p.$$("button, a, [role=button], .btn");
  for(const el of btns){const t=((await el.textContent())||"").trim();
    if(re.test(t)&&await el.isVisible()){await el.click();console.log(`  点[${t.slice(0,14)}] ${desc||""}`);return true;}}
  return false;}
const log=async(tag)=>{const t=await p.evaluate(()=>document.body.innerText.replace(/\s+/g," ").slice(0,90));console.log(`[${tag}] ${t}`)};

await p.goto(B+"/",{waitUntil:"domcontentloaded"});await p.waitForTimeout(1200);await log("首页");await shot("home");
if(!await clickText(/^玩一局$/))throw"没找到玩一局";
await p.waitForTimeout(800);await shot("table");
// 四连问：称呼/杯子/罚酒/想品鉴谁 + 人数选1
await p.fill("input[placeholder*='coco'], input[placeholder*='称呼'], #nameInput","满分测试员").catch(()=>{});
const grids=await p.$$(".emoji-grid");
for(const g of grids){const first=await g.$("button");if(first&&await first.isVisible())await first.click().catch(()=>{});}
await p.evaluate(()=>{[...document.querySelectorAll("button")].find(x=>/^💃?女$/.test(x.textContent.trim()))?.click();});
const seat1=await p.$$eval("button",(bs)=>{const b=bs.find(x=>/一个人玩|^1$/.test(x.textContent.trim())&&!x.disabled);if(b){b.click();return true}return false}).catch(()=>false);
console.log("  选1人桌:",seat1);
await p.waitForTimeout(400);await shot("table-filled");
if(!await clickText(/坐下，跟雪克|生成房间码/))throw"没找到入桌CTA";
await p.waitForTimeout(2500);await log("入房");await shot("lobby");
if(!await clickText(/开始，就我们俩|^开局$/))console.log("  ! 开局按钮没直接找到，重试");
await p.waitForTimeout(2000);await log("开局后");await shot("after-start");
// 摇签：点 #cup 本体充能（首点授权降级，之后每点+16 到130出签）
for(let k=0;k<16;k++){
  await p.evaluate(()=>document.getElementById("cup")?.click());
  await p.waitForTimeout(200);
  if(await p.evaluate(()=>/今晚主角/.test(document.body.innerText))){console.log("  出签(第"+k+"点)");break;}
}
await p.waitForTimeout(600);
await clickText(/就是 TA，上桌/,"确认主角");
await p.waitForTimeout(2500);await log("摇签后");await shot("sticks");
// 方向确认弹层：默认已选，直接「就这个方向」
await clickText(/就这个方向/,"方向确认");
await p.waitForTimeout(1500);await shot("direction-or-q1");
// 答题循环：滑分+锁定，最多 12 轮防死循环
for(let r=0;r<12;r++){
  const locked=await p.$$eval("button",bs=>{const b=bs.find(x=>/锁定我的分/.test(x.textContent));if(b&&!b.disabled){b.click();return true}return false}).catch(()=>false);
  if(locked){console.log(`  R${r+1} 锁分`);await p.waitForTimeout(2200);
    // 揭晓页 → 继续/下一题
    await clickText(/继续|下一题|下一轮|GO|再来/);await p.waitForTimeout(2200);continue;}
  // 没有锁分按钮：可能已进 aha 或需要点继续
  const body=await p.evaluate(()=>document.body.innerText);
  if(/亮相|来咯/.test(body)){console.log("  已到亮相");break;}
  if(!await clickText(/继续|下一|查看|揭晓|开牌/))break;
  await p.waitForTimeout(1800);}
await clickText(/看/,"终局推进");await p.waitForTimeout(4000);
await clickText(/看|继续|揭晓/,"再推进兜底");await p.waitForTimeout(3500);
await log("亮相");await shot("aha");
// 爆灯
const burst=await clickText(/^爆灯$/,"投爆灯");console.log("  爆灯可点:",burst);
await p.waitForTimeout(800);await shot("aha-lamp");
// 翻到档案/相处/海报
await clickText(/相亲人物档案|档案/);await p.waitForTimeout(1200);await shot("profile");
await clickText(/相处细节/);await p.waitForTimeout(1200);await shot("chemistry");
const body2=await p.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
const hasPoster=/海报|保存|长按|我的主页/.test(body2);
await p.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));await p.waitForTimeout(800);await shot("poster-area");
console.log("\n=== 终检结论 ===");
console.log("到达亮相:", /来咯|亮相|MATCH/.test(await p.evaluate(()=>document.body.innerText))?"✓":"✗");
console.log("爆灯可交互:",burst?"✓":"✗","| 海报/主页区:",hasPoster?"✓":"✗");
console.log("pageerror:",errs.length?errs.join("||"):"0 ✓");
console.log("shots:",shots.length,"张");
await b.close();
