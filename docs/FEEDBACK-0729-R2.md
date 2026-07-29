# Kim 反馈拆解 R2 · 2026-07-29 早 · 全线程必读

上一轮见 docs/FEEDBACK-0729.md（文案红线、题库红线仍然生效）。

## Kim 拍板（已确认，不再问）
1. **Logo = 霓虹马天尼杯**。游戏页顶栏现在的字母"K" brand-mark（app.js:423）换成 logo.svg 里那只霓虹马天尼杯，全站统一。国王扑克牌面的 K♥ 是牌面元素不算 logo，保留。
1b. **酒吧不叫"老K的酒吧"**（Kim 0729 早追加）：店名由 P 线在 COPY-PACK-R2.md 定稿（与 LOADING 99% 梗一脉相承），老K 是店里的人，不是店名。所有线程写文案时店名以 COPY-PACK 为准。
2. **老K生文 = 实时API + 预写兜底**。后端加 LLM 代理端点（text.pollinations.ai，带 referrer），5s 超时降级到预写语录池。
3. **注册 = 昵称 + 4-6位口令，可跨设备找回**。昵称全局查重（重名提示换一个）。
4. **国王游戏 = 只留每题触发**。每道题结算时，完全猜对的人获得国王机会；终局大国王环节删除。

## 需求清单（R2）

### 流程重构（最大项）
完整动线定稿：
**进站 → 老K自我介绍（"欢迎来到××酒吧，在这里看看你想要的人生"气质）→ 调酒（选酒）→ 告诉老K你是谁 = 用户注册（昵称查重+口令+性别+想看的取向）→ 选桌 → 选想聊的话题（卡组）→ 游戏 → 海报（底部"进入我的主页"按钮）**

| # | 项 | 线程 |
|---|---|---|
| 1 | 老K人设重蒸馏（Kim：还没抓住）+ 全站文案包重写 + 锐评预写池 | P |
| 2 | 老K头像重画（现版不行） | R |
| 3 | 摇酒壶造型重画（还是不对，找真实三段式 cobbler 参考图逐件比对） | R 出图 + C 接入 |
| 4 | 调酒页动线：老K自介开场 → 选酒 → 注册段（"告诉老K你是谁"） | C |
| 5 | 用户注册：昵称查重 + 4-6位口令 + 性别 + 想看的取向（决定"我的理想型"方向，不是看TA的） | A 后端 + C 前端 |
| 6 | 卡组选择：开桌/入座后选"今晚聊什么"（满分男/满分女/满分Agent…），不再默认只有男女二选 | A + E |
| 7 | 老K = 游戏内置锐评NPC：每题结算后老K来一句（实时API+兜底池） | A(/api/laok) + E(UI) + P(prompt+池) |
| 8 | 爆灯/灭灯：现在流程里根本看不到，核查后端状态并做进每题体验 | A 核查 + E UI |
| 9 | 国王游戏改为每题触发：完全猜对者当场获得国王机会（指令卡：点人+指令）；终局大国王删除 | A + E |
| 10 | 一个人喝 = 和老K对聊。文案"那你和我聊"方向；solo 局老K全程当对话对象；禁止"每人轮数"这类流程说明文案 | D 入口文案 + E 局内 |
| 11 | 手机端样式仍有错（"每人轮数"区域等）：零上下文移动端QA逐屏 | QA + E |
| 12 | 主页入口全站打通：海报底部"进入我的主页"、大厅/游戏页常驻入口 | E + F |
| 13 | 口令找回 UI（换设备输入 昵称+口令 恢复身份） | F + C |
| 14 | 游戏页顶栏 K 字 logo → 霓虹马天尼杯 | E |

## 接口契约（先定死，各线程照此写，不许私改）

- `POST /api/register` body `{name, passcode, gender, seeking}` →
  `201 {userId, token}`；重名 → `409 {error:"name_taken"}`；口令格式 4-6 位数字。
  gender: `m|f|x`；seeking: `m|f|x`（"我想看的理想型方向"）。写入 KV USERS，profile 含 gender/seeking。
- `POST /api/recover` body `{name, passcode}` → `200 {userId, token}` / `404` / `403`。
- `GET /api/laok?scene=<id>&ctx=<urlencoded json>` → `200 {text, source:"llm"|"pool"}`。
  后端调 text.pollinations.ai（system prompt 来自 P 线交付的 docs/LAOK-PROMPT.md），5s 超时/失败 → 从 P 线预写池取。永不 5xx。
- 建房 `POST /api/room` body 增加 `deck: "man"|"woman"|"agent"`；房间 state 广播含 deck；前端按 deck 出题。
- 每题结算：后端在 reveal 消息里带 `exact: [playerIds]`（分毫不差者）。若 exact 非空 → 广播 `{type:"king_chance", winners, questionIdx}`；winner 客户端发 `{type:"king_order", target, orderId}`（指令来自预置指令卡池，P 线出 12 条）→ 广播 `{type:"king_result", ...}`。终局 king 流程与 UI 删除。
- buildIdealProfile 增加输入 `seeking`（画像的性别方向按 seeking，不再按题库默认）。保持纯函数、双端共用、named export 不变。

## 文件所有权（本轮）
- P：docs/LAOK-PERSONA.md（重写）、docs/COPY-PACK-R2.md（新）、docs/LAOK-PROMPT.md（新）、public/laok-lines.js（新：预写池+指令卡，纯数据模块，前后端共用）
- A：src/worker.js、test/smoke.mjs
- R：public/assets-v2/shaker.svg（新）、public/v2/bartender.js
- C：public/v2/cocktail.html/js/css
- D：public/v2/lobby.html/js/css（本轮改动小：solo 文案 + 主页入口）
- E：public/index.html、app.js、style.css、poster.js、fx.js、public/ideal-profile.js
- F：public/u.html
- 不是自己的文件一行不许改；跨文件需求写进报告由 PM 转交。

## 红线（继承 R1）
- 全部文案过 docs/LAOK-PERSONA.md（P 线重写后的新版）
- 交付前：`node test/smoke.mjs` 全绿 + 双视口截图（390×844 优先）
- 展示柜/生图/罚酒分差≥2 等 R1 已上线逻辑不许回退

---

## R2.5 追加反馈（Kim 看 QA 图后 · 0729 · 违者返工）

> 元规则（Kim 明令）：**每次收到反馈，先改这份 PRD，再动手。** 上下文一多容易忘，PRD 是唯一真源。

1. **国王游戏改玩法：匿名发号 + 国王报号，不点人。** 关键：
   - 每次触发国王机会时，给全桌每人发一张**匿名号码牌**（1..N，只有本人看得到自己的号）。
   - 国王（猜得分毫不差者）**不点具体的人**，而是**报号码 + 指令**，例：「7号和5号斗鸡（对喝）」。国王报号时**不知道每个号是谁**——这就是乐趣。
   - 揭晓：系统公布「7号是XX，5号是YY，执行：<指令卡>」。
   - 指令卡池（laok-lines.js KING_ORDERS）改成**面向"两个号码"的对抗/互动指令**（斗鸡、对喝、互相说一句真心话…），不再是"点一个人让TA喝"。
   - ⚠️ 这推翻 A 线已实现的 `king_order{target:playerId}` 和 E 线的点人 UI，需要后端重发号 + 前端号码牌 UI 重做。
2. **满分男/理想型的生成图：别太努力，要低精度。** 理由（Kim）：用户眼里的理想型本就锚不定，图显得越努力越丑；低精度反而更耐看、更"留白让人自己脑补"。
3. **人物低精度 + 背景高精度**（参考经典像素游戏的做法：角色是粗像素，场景/背景精致）。老K立绘同理——**脸不用那么沧桑**，别过度刻画法令纹/风霜感。
4. **占位名不要用"嘉欣"**，换 coco 这类（轻盈、去具体化的名字）。
5. **签筒/摇壶交互：去掉"连点摇签"的文字提示**，只保留交互本身——**手机端摇动，电脑端点击**，不解释。
6. 视觉总方针：低精度人物 + 高精度背景，是本轮美术的统一基调（R 线 + E 线生图 prompt 都按此调整）。

### 修订后的国王游戏契约（覆盖上文 R2 契约里的 king 部分）
- reveal 带 `exact:[playerIds]`（不变）。exact 非空 → 服务端给每个在座玩家分配本轮匿名号 `seat: {playerId:number}`（每题重发），广播 `{type:"king_chance", winners, questionIdx, seatCount:N}`；每个客户端只从自己的 `state.you.seatNo` 读到自己的号。
- 国王客户端发 `{type:"king_order", nums:[a,b], orderId}`（报号，不是 target）。服务端校验发送者在 winners、nums 在 1..N 且互不相同、orderId 存在。
- 广播 `{type:"king_result", king, nums:[a,b], names:[realNameA,realNameB], orderId, questionIdx}`，前端公布"X号是谁"。
- KING_ORDERS 文案改为双号对抗式（P 线重写这 12 条）。
- **Kim 已拍板（0729）**：① 号码**每题重新发**（每次触发国王机会重新洗牌发号，号背后是谁每题都变）。② 一题**多人分毫不差 → 都当国王，按座次轮流报号**（每人各报一组号+一张指令卡，惩罚可叠加）。
- 实现补充：`king_chance` 广播带 `winners`（有序，按座次），前端按顺序让每个 winner 依次报号；每个 winner 报完 → 下一个；全部报完流程继续。号码分配 `seat` 每题触发时重置。
