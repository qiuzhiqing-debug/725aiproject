# WORKLOG — 满分男酒桌局

## 2026-07-25
- Brief 对齐完成：0-10 标准满分制；题库百无禁忌但要好笑、多网梗（赛百诺/麦当劳、嘉欣嘉豪）；部署白嫖（选 Cloudflare）；立绘可用免费生图但 PM 必须人审。
- 事实：wrangler 未登录，部署步骤需 Kim 跑一次 `wrangler login`。
- PRD v1 落盘（PRD.md）。
- 追加需求：题库多网梗（赛百诺/麦当劳、嘉欣嘉豪等），已写入 PRD §5。
- 并行子线程已启动：①题库生成 → public/questions.js；②全栈实现（Worker+DO+前端，验收=wrangler dev + ws 冒烟脚本）。
- 立绘管线 PM 人审通过：Pollinations 3 张样图（art-review/sample-{m,f,n}.jpg）风格质量合格，接口抽象为 generateImage 便于后续换 image2。
- 下一步：等两线程完成 → 集成 → 视觉打磨线程 → 本地端到端 → 找 Kim 做 wrangler login 部署 → 双视口 QA → push GitHub（等 Kim 给仓库）。

## 2026-07-25（续建：M2 本地完整可玩）
- 接手时状态：后端 worker.js（Worker+RoomDO）基本完整；questions.js/qrcode.js/poster.js/style.css 已有；index.html 为可用 stub；缺 app.js、摇签协议、音效、smoke 测试。
- 前任 bug 修复：①kick 消息需要 token 但 viewFor 不下发（踢人功能失效）→ 房主视角 players 附带 token；②stick_done 只允许房主（需求是摇签人=上任主角或房主）；③picking 阶段提前泄露主角名 → 出签前隐藏；④start 时题目全被过滤会导致 drawQuestion 崩溃 → 加空题库守卫；⑤缺「精确命中指定一人喝」→ 新增 assign_drink。
- 新增：public/app.js（全部屏幕 SPA：首页/大厅+QR/抽签/设定/打分/开牌/aha 翻转卡+海报/收局回看）；public/fx.js（WebAudio 纯合成竹签哗啦+出签「嗒」、摇一摇 devicemotion 检测含 iOS≥13 requestPermission 分支[未真机验证，已注释]与点按降级）；worker 新增 shake（强度节流转发不落盘）/draw_stick/stick_done 权限改摇签人/lastProtagonist 追踪。
- 冒烟：test/smoke.mjs（node+ws，3 玩家）29/29 通过——建房/入房/重名拒/开局/摇签广播/出签/打分猜分/|2-7|=5 罚酒/精确命中懂TA+1/指定喝/补刀/3轮→aha（prompt+细节≥3+称号+最懂TA）/断线重连回座/第二轮摇签人=上任主角。wrangler dev 无报错，首页与全部静态资源 200，全部 JS node --check 通过。
## 2026-07-25（续：M3.5 非诚勿扰互动体系，PRD §9）
- 后端（src/worker.js）新增消息：`chat`（120 字、600ms 轻限频、DO 内滚动保留 100 条，随 state 下发→断线重连自动恢复）、`react`（飞书式 emoji 回应，同人同 emoji 再点=取消）、`danmaku`（30 字/3 秒限频，仅 answering/reveal/aha/finished，事件广播不落盘）、`light`（aha 屏爆灯/灭灯，主角除外，每人一盏按下不可反悔，计入 aha.stats.lights 供海报）。下发新增事件：`danmaku`、`light_fx`（发起者本地即时播特效，服务端只广播给其他人）。灯的 token→灯 原始映射不出 DO，viewFor 折算为 light{burst,off,total,yours,burstNames}。旧存档兼容补齐 chat 字段。
- 前端：app.js 新增全局覆盖层（弹幕层 + 弹幕输入条含 🍺😅💔🔥 快捷 reaction + 聊天抽屉 FAB/未读徽标/emoji 回应选择器）；aha 屏灯板（灯泡行 + 爆灯/灭灯大按钮 + 计数）；fx.js 新增纯 WebAudio 原创音效 burst（爆灯五声琶音+shimmer）/buzz（灭灯方波哔）/riff（理想型入场小连复段）与 heartBurst/lampOffFx 全屏特效，沿用音效开关；poster.js 海报加「非诚勿扰灯光席 💗 X/Y 爆灯」卡；style.css 全部按亮色 Y2K（粗描边+硬阴影）补齐。preview=aha 种入演示弹幕/灯数据供截图 QA。
- 验证：node --check 全部改动 JS 通过；smoke.mjs 扩到 40/40 全绿（聊天入 state+重连恢复、回应贴/取消、弹幕广播+限频拦截、爆灯灭灯计数/不可反悔/主角无灯/stats.lights、light_fx 广播、灯状态重连恢复）；wrangler dev 热更未重启；双视口截图 qa/aha-390.png + qa/aha-desktop.png 自审通过（弹幕三态、灯板、快捷 reaction、聊天 FAB 均可见）。

- 遗留：①iOS 真机摇一摇授权路径未验证（fx.js 有注释）；②立绘 imageUrl 依赖 Pollinations 在线服务，浏览器端加载失败有兜底占位；③M3 视觉打磨/双视口截图 QA 未做（需浏览器）；④questions.placeholder.js 为前任占位文件，待 M3 确认后可删；⑤部署需 Kim wrangler login（M4）。

## 2026-07-25（Codex 接管：M3-M6）
- 先将可玩基线提交并推送到 GitHub `main`：`bc03846 Initialize 满分男 multiplayer game`；后续改动集中在 `codex/experience-overhaul` 分支。
- 三条子线程并行交付并由主线程集成：①高对比白蓝视觉重做；②聊天室/弹幕/快捷 reaction/消息 emoji/爆灯灭灯可改票；③6 类乙游原型、16 MBTI 穿搭配色与三段式理想型档案。
- Aha 流程升级为「立绘亮相 → 相亲档案 → 相处细节」；海报同步加入真实立绘、MBTI、原型、星座、职业与爆灯率。Pollinations 不可达时 2.2 秒切换已人审的本地立绘，避免空白。
- Cloudflare 静态资产路由修正为 SPA fallback，并让 Worker 优先处理 `/api/*`；公网环境完整冒烟 57/57 通过。
- 自动化验证：`test/ideal-profile.mjs` 7/7；本地与公网多人流程均 57/57；覆盖重名拒绝、断线回座、摇签广播、3 轮计分、档案生成、互动协议、改票和历史回看。
- 视觉 QA：390×844 与 1400×900 共 11 个状态无横向溢出、脚本错误 0、可见按钮均 ≥44px；最终证据在 `qa/final-*`、`qa/online-*` 与 `qa/visual-v3-*`。
- 公网预览：`https://manfen-nan.pentagonal-whippoorwill.workers.dev`（Cloudflare 临时账号部署，需在认领链接过期前由 Kim 接管）。
- 剩余真实设备风险：iOS DeviceMotion 授权与不同 Android 机型的传感器阈值仍需至少一台真机各跑一次；无传感器或拒绝授权时已有点按降级。
