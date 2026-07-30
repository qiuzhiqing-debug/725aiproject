# Kim 反馈拆解 R5 · 2026-07-31 · 全线程必读（施工图）

前序：R1/R2/R2.5/R3/R4 仍生效。**本轮 R5 只改「爆灯灭灯」的触发点 + 新增展示柜爆灯率，冲突处以 R5 为准。**
元规则（Kim 明令，已落记忆）：**每次收到反馈，先改这份 PRD，再动手。**

---

## 0. 认账：R3 把爆灯灭灯做错了

- **第一版 PRD.md §9 就写清楚了**：爆灯/灭灯是「理想型立绘亮相那一刻」（aha / 非诚勿扰环节，海报底下那块），**除主角外人人一盏灯**，可改票，结果进海报「理想型收获 X/Y 爆灯」。
- **R2.5/R3 错误地把它做成了「每题结束都投一次灯」**：`app.js renderReveal` 里有 `round-light-panel`（每题爆/灭灯），`worker.js case "light"` 里有「有当前题 → `cur.lights[me.id]` 每题快照」分支。**这不是 Kim 要的，删掉。**
- Kim 原话：「爆灯灭灯不是第一版就写过了吗，就是最后那个出海报底下有个非诚勿扰的地方……不要每题结束都搞。」

---

## 1. Kim 拍板（R5，已确认不再问）

### 1.1 爆灯灭灯只在 aha 一刻（删每题）
- **触发点**：理想型立绘亮相（aha / renderAha 的非诚勿扰灯板）**唯一一次**。答题每一轮的 reveal **不再有任何爆灯灭灯 UI/投票**。
- **多人局**：除主角外，**同桌每人一盏灯**，给「这一位满分XX（本轮主角）」投爆灯/灭灯；**可改票**，以最后一票为准（沿用现有 aha 改票逻辑）。
- **单人局（solo）**：无同桌 → **玩家本人在 aha 给这张理想型卡投一次**爆灯/灭灯（不是每题）。**口径不变**：total=1，本人爆灯 = 1/1 = **100% 爆灯率**，本人灭灯 = 0%。
- 海报：沿用 `poster.js:211`「非诚勿扰灯光席 💗 理想型收获 X/Y 爆灯」，solo 也走同一张卡（total=1）。

### 1.2 展示柜：每个被展出的满分XX都有「同桌爆灯率」（新增）
- **需求**：`u.html` 每张被展出的满分XX记录卡，显示该主角当晚**同桌爆灯率**。
- **口径（钉死，solo/多人统一，不许改口径）**：
  - `爆灯率 = 爆灯数 / 总投灯数 × 100%`，四舍五入取整。
  - 多人局：分子=同桌爆灯人数，分母=同桌投灯总人数（爆+灭）。
  - solo：分子/分母来自本人那一票，本人爆灯=100%、灭灯=0%（total=1）。
  - **无人投灯（分母=0）**：显示「—」或「暂无爆灯」，不显示 0%（避免误解成全灭灯）。
- **文案**：卡片上标「同桌爆灯率 XX%」（solo 记录同样用「同桌爆灯率」这个词，不另造名词——Kim：不要改口径）。

### 1.3 展示柜：点赞 + 评论（新增，UI 从简）
- Kim：「展示柜再加个点赞评论功能，整个 ui 简单点……展示柜这块现在没大问题，就加键位就行了。」→ **只加键位/控件，不重构展示柜其它部分**。
- **点赞**：每张被展出的满分XX记录卡一个 👍 按钮 + 计数。同一访客对同一条只计一次（前端 `localStorage` 去重 + 后端计数）。无需登录。
- **评论**：记录卡下一个极简评论区——一个输入框（≤80 字）+ 已有评论列表（昵称 + 内容，倒序，最多展示 20 条）。昵称取当前 `ideal_userId` 对应昵称，无则「路人」。
- **UI 原则**：极简，不加弹窗/复杂交互，风格沿用站内暗紫霓虹；移动端 390 优先，按钮 ≥44px。
- **反滥用**：评论走后端 `esc()` XSS 防护 + 长度截断 + 轻限频（同 IP/用户 3 秒 1 条）。

---

## 2. 字段契约（钉死，三线程共用，不许私改字段名）

**复用现有白名单字段，不新增**（`sanitizeRecordProfile` 已放行 `burstTotal`/`offTotal`）：

- `record.profile.burstTotal` = 该主角本局收获的**爆灯数**（多人=同桌爆灯人数；solo=本人爆灯则 1 否则 0）。
- `record.profile.offTotal` = **灭灯数**（多人=同桌灭灯人数；solo=本人灭灯则 1 否则 0）。
- **展示柜爆灯率** = `burstTotal / (burstTotal + offTotal)`；分母 0 → 显示「—」。
- 数据来源：`app.js` 的 `saveAha`/`maybeSaveAhaProfile` 上报 `profile.burstTotal`/`offTotal`，取自 **aha 阶段**灯结果（`aha.light.burst`/`aha.light.off`），**不再取每题聚合**。
- solo 必须真正产生 aha 灯结果（本人一票）→ 才有数据落 KV → 展示柜才有率。

**点赞/评论（后端 KV，ENG 定义，F 消费）**：
- 每条展出记录有稳定 id（沿用 record 现有 id/key）。
- `POST /api/showcase/like { recordId }` → 计数 +1，返回 `{ likes }`；前端 localStorage 记 `liked:<recordId>` 去重。
- `POST /api/showcase/comment { recordId, text }` → 存评论（`{ name, text, ts }`，text `esc()`+截断 80，轻限频），返回最新列表。
- `GET`（或随 record 一并下发）返回 `record.likes:number` 与 `record.comments:[{name,text,ts}]`（最多 20，倒序）。
- 存储：挂在 USERS KV 展出记录同一份数据上，不新建 namespace。

---

## 3. 逐文件改法（写手照做，可优化不得低于此）

### 3.1 ENG-A：`src/worker.js`
- **删**：`case "light"` 里「有当前题 `cur` → `cur.lights[me.id]` 每题快照 + 每题 `light_fx` 广播 + `rec.lights` 每题写入」整支（约 1753-1785）。
- **留**：aha 阶段「`r.aha.lights[token]` 单票可改票 → burst/off/total 广播」整支（约 1787+）。
- **solo 放开**：aha 灯允许主角本人投一票（solo 无他人）；`aha.lightTotal` solo 给基数 **1**（多人=活跃人数-1，沿用）。确保 solo aha 也下发 `light:{burst,off,total,mine}`。
- viewFor 折算（1207+）保持：下发 `aha.light`。清掉 reveal.lights 相关下发（每题灯没了）。
- **新增展示柜点赞/评论端点**（§2 契约）：`/api/showcase/like`、`/api/showcase/comment`，数据挂展出记录（USERS KV），`esc()`+截断+轻限频，record 下发带 `likes`/`comments`。
- 冒烟：`test/smoke.mjs` 全绿；补/改断言——「每题无灯票、aha 单次投灯+改票、solo 主角自投 total=1、点赞+1去重、评论存取+限频」。

### 3.2 ENG-E：`public/app.js`
- **删**：`renderReveal` 里整个 `round-light-panel`（约 1272-1381：rowLamp/myLight/lightLocked/burstCount/castRoundLight/roundBurstBtn/roundOffBtn）+ 第 480-481「每题爆灯本地状态重置 `ui.lightSent`」+ 顶部 `ui.lightSent` 字段（173）。答题 reveal 页不再有任何灯 UI。
- **留 + 放开 solo**：`renderAha` 非诚勿扰灯板（1569+）——去掉 `${solo?"":...}` 门控，**solo 也显示**灯板：solo 文案「你给这张理想型：💗 爆灯 / 🖤 灭灯（点了可改）」，投完调 `light` 协议，total=1。多人局文案不变（同桌给主角投）。
- **saveAha 上报**（1522-1524）：`burstTotal`/`offTotal` 改为取 `aha.light.burst`/`aha.light.off`（aha 真实灯结果），不再取 `aha.stats.lights`（每题聚合已废）。
- `lightVotePayload` 若含每题语义，统一为 aha 单票语义。
- 交付：CDP 真跑 solo 全流程（答题 3 轮 reveal **无灯** → aha 立绘 → 本人爆灯 → 海报显示 1/1 爆灯 → 写 KV）。

### 3.3 F：`public/u.html`
- 每张 record 卡渲染「**同桌爆灯率 XX%**」：读 `p.burstTotal`/`p.offTotal`，`rate = round(burstTotal/(burstTotal+offTotal)*100)`；分母 0 → 「同桌爆灯率 —」。
- 位置：记录卡数据行（与称号/职业同区），暗紫霓虹调，与站内一致。
- **点赞**：每卡 👍 按钮 + 计数，点后调 `/api/showcase/like`，localStorage 去重置灰。
- **评论**：每卡极简评论区（输入框 ≤80 字 + 倒序列表 ≤20 条），调 `/api/showcase/comment`；`esc()` 渲染。
- UI 从简，只加键位，不动展示柜其它布局；390 优先，按钮 ≥44px。
- 交付：双视口截图 u.html（390 优先）显示某记录爆灯率 + 点赞 + 一条评论。

### 3.4 poster.js（E，通常无需改）
- `poster.js:211` 已显示「非诚勿扰灯光席 X/Y 爆灯」，solo total=1 时也会显示，**确认即可**，无改动。

---

## 4. 红线
- 交付=真上线：`node test/smoke.mjs` 全绿 + solo/多人 CDP 各跑一遍（reveal 无灯、aha 有灯、海报爆灯率、u.html 爆灯率）+ 双视口截图（390 优先）。
- 部署仍到新 worker `ideal-type-loading`，旧 manfen-nan 不动。
- **不许改爆灯率口径**：solo 与多人统一「同桌爆灯率 = 爆/（爆+灭）」，solo 本人爆灯=100%。
- R1-R4 已上线逻辑（题库隔离/展示柜记录/号码国王/罚酒/生图/注册找回）不许回退。
- 答题 reveal 页彻底无灯 UI（这是本轮验收硬指标）。
