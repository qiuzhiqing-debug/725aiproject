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

## 2026-07-25（M4 正式认证与永久部署）
- Cloudflare Wrangler OAuth 已认证到 Kim 自有账号；不记录账号密码、验证码或 OAuth 令牌到项目文件。
- 正式 Worker：`https://manfen-nan.kimnin-iup.workers.dev`，Cloudflare Version ID：`0920014b-72c5-4ae2-9dd6-d9f5f4b657a0`。Durable Object `RoomDO` 与静态资源均在同一正式 Worker 下。
- 永久地址多人端到端冒烟 57/57 通过。针对公网延迟，将 smoke 中固定毫秒等待改为有条件的状态等待，覆盖出签、聊天回应、灯票特效与断线重连，避免把网络抖动误判为产品失败。
- 正式地址双视口证据：`qa/production-home-390.png`（innerWidth/scrollWidth 390/390）与 `qa/production-home-1400.png`（1400/1400），脚本错误均为 0，人工复核通过。
- 本机代理对新域名使用 `198.18.*` Fake-IP，刚部署时曾造成仅本机的 TLS 假失败；使用公共 DoH 查得真实 Cloudflare 边缘地址后验证 HTTPS 200。代理映射刷新后，普通网络路径再次完成 57/57 与标准双视口截图；临时 QA 脚本已删除，未改系统网络设置。

## 2026-07-28 凌晨（Fable 接管：V2 红弦版）

### 已完成（授权项全部前置，Kim 可睡）
- ✅ 私密仓：https://github.com/kimniniup-creator/ideal-type-loading（原 725aiproject 不动，remote 保留为 old-shared）
- ✅ 新 Worker：https://ideal-type-loading.kimnin-iup.workers.dev（旧网址不动；配置文件 wrangler.new.jsonc）
- ✅ LLM secrets 配到新 Worker（LLM_API_KEY/LLM_BASE_URL）→ 酒保锐评/画像文案后端可调
- ✅ KV namespace USERS（id b9d212d3…）创建并绑定 → 用户档案/主页/展示柜存储
- ✅ 生图验证：pollinations + referrer 参数 200/1s 免费；裸调 429/524。必须带 referrer
- ✅ 酒吧玩耍系统评估：只借概念不合并。值得搬：问答→人格→专属鸡尾酒的数据结构、平票末题回溯计分、夜场情境题思路。酒图是店家实拍菜单（带价格品牌）不可用。商务留口子：映射做成可配置 JSON
- ✅ PRD-V2.md 落盘（含商业化前版权必删清单：红弦俱乐部/超天酱等全部要清）
- ❌ Vercel 不用：多人房间是 WebSocket+DO 有状态长连接，Vercel serverless 不支持

### V2 分工（文件所有权制）
| 线程 | 文件 | 任务 |
|---|---|---|
| Q 题库 | questions.js, qa/questions-qa.mjs | 5 模组×取向池×锅底，3局10轮无重复底线 |
| B 后端 | src/worker.js, test/smoke.mjs | KV 档案/酒保 LLM/强制下一轮/离场退出/国王游戏 |
| L 视觉 | theme.css, lobby/cocktail/bartender.js, assets-v2/ | 红弦风/大厅/调酒动画/酒保立绘/Logo/签筒 |
| F 整合 | app.js, index.html, style.css, fx.js | 整合+修 bug（锅底比例/房主转圈/emoji 面板） |
| P 主页 | profile.js, poster.js, ideal-profile.js | 结果页/海报（年报→海报）/用户主页/展示柜 |

### 未决问题（Kim 醒来看）
- 酒保名字暂定「老 K」浪子人设，可改
- 女同局/男同局：做成开桌时低调的「口味定制」选项，待确认

## 2026-07-28（续：后端 101/101 全绿）

### 已修复
- ✅ `buildIdealProfile` 实现完成（public/ideal-profile.js §五）：8 维度打分器 + PERSONA_ADJ/NOUN 原型组合 + 确定性 MBTI 推理 + DETAIL_POOL 细节抽取 + pollinations 生图 URL（带 referrer=idealtype）
- ✅ 修复 bug：`buildIdealProfile` 的 `GENDER_TAGS` 只识别 `"masc"`/`"femme"` 而 `cur.gender` 实际是 `"m"`/`"f"` → 加入短格式 key 映射
- ✅ 修复 bug：`webSocketClose` 在房主临时断线时立即移交房主权，导致 `finish_game` 被 `!me.isHost` 拦截 → 改为仅在 90s away 后或主动 leave 时移交，ensureRoleIntegrity 负责兜底
- ✅ `node test/smoke.mjs` → 101/101 全绿（含 V2 用户档案 KV、酒保端点、取向池隔离、国王游戏、force_next、离场/房主移交全部测到）
- ✅ `node qa/questions-qa.mjs` → 701 道题 0 处不达标

### 当前状态
- 后端全绿，已 push

## 2026-07-28（续：视觉整合 + 用户主页）

### 已完成
- ✅ 入场路由：index.html 第一次进入无 ideal_cocktail → 跳 /v2/cocktail.html；有 ?room/?solo → 直通游戏
- ✅ cocktail.html：onCocktailDone 存 ideal_cocktail + 静默建 KV 档案（POST /api/user）→ 跳大厅
- ✅ lobby.html：桌子点击 POST /api/room 得房间码 → 跳 /?room=CODE；单人位 → /?solo=1
- ✅ app.js：welcome 时静默同步昵称到 KV；aha 阶段主角静默写 KV 档案记录（maybeSaveAhaProfile）
- ✅ app.js：海报按钮文案 "生成年报海报" → "生成海报"
- ✅ public/u.html（新建）：用户档案页，展示柜按模组分行，双视口 QA 通过

### QA 自评（本次 session 结束状态）
| 维度 | 分 | 备注 |
|---|---|---|
| 功能完整性 | 9 | cocktail→lobby→game→u.html 全链路可走通；aha 写 KV 档案 |
| 视觉品质 | 8 | 三主页面双视口无溢出；desktop u.html 右侧留白偏多 |
| 交互体验 | 8 | 路由跳转清晰；错误态友好；桌子点击无 loading 指示 |
| 代码健壮性 | 9 | esc() XSS 防护；onerror 图片降级；所有异步操作静默失败不阻塞主流程 |
| 后端集成 | 9 | 101/101 smoke test；KV 写入经 seed 脚本端到端验证 |
| **综合** | **86/100** | |

### 剩余优化（非阻塞）
- lobby 桌子 loading 反馈（点击后按钮禁用/弹幕提示）
- desktop u.html 多列展示柜布局
- aha 后立绘 imageUrl 为空时 u.html 卡片仍显示占位符（需 pollinations 实际出图才有）

## 2026-07-29 凌晨（Fable PM 模式：六线并行大改版）

### 流程
Kim 定了 PM→Dev→QA 循环：零上下文子线程做真实体验 QA（第一轮 58/100）→ PM 拆解 Kim 深夜大反馈（docs/FEEDBACK-0729.md）→ 老K人设定稿（docs/LAOK-PERSONA.md）→ 六条开发线按文件所有权并行 → 集成 → QA 第二轮 → 部署新网址。

### 六线交付（全部 commit 未 push）
- A 后端 `1c31613`：桌子=固定房间（table-N 仲裁 DO，幂等）、公开/私密房+set_visibility、罚酒分差≥2、solo 1人全流程、展示柜记录 hidden 可见性端点、imageUrl/intro 白名单修补。smoke 125/125。
- B 题库 `eff0692`+`64a9b59`：满分男梗调研（He's a 10 but… 溯源+18场景）、满分Agent模组 105 道、PRD增补（点单接轨四层映射、图鉴 16 原型论证）。Kim 红线返工：梦女题只扎"傲慢+无知"、海王浓度 2%、逐题维度探针标注。
- C 调酒页 `8446117`：标语"差的那 1%，等的就是你"、老K开场自我介绍、六大基酒+无酒精彩蛋（448 组合校验）、cobbler 三段式 shaker+devicemotion 摇一摇、答题回退。
- D 大厅 `cee6646`：吧台凳区、OPEN 24/7 挂墙、竖屏空白压缩、酒柜/吧镜/灯光精致化、桌子实时人数+满/空桌灯光、找朋友电话（房间码校验）、假弹幕清理。
- E 游戏前端 `dfb49f9`：全站换肤 theme-v2（蓝白清零）、调酒身份带入（徽章+杯型预选）、solo 动线、?room 入座唯一主按钮、昵称同步修复（根因：建档请求被跳转打断）、aha 立绘 onload 后真实 URL 入柜、国王游戏渲染从零新建（烫金扑克牌）、"你老公来咯🪽🪽"、海报暗紫重制+QR 跳房间。
- F 展示柜 `2dfe923`：真图入柜（seed 验证）、小眼睛可见性端到端、特调杯型 SVG、desktop 网格、图鉴锁定占位。
- PM `1825ae6`：logo.svg 删"别急，好东西都压轴"居中 LOADING 99%、老K立绘重设计（夜班调酒师）纳入。

### 事故记录
- 两次子线程集体阵亡：403 账户余额不足（Kim 切模型后恢复）、上游 524 超时（120s 冷却后断点续跑）。断点续跑有效，未丢工作量。

### 待办
- QA 第二轮报告 → 修复 → wrangler deploy --config wrangler.new.jsonc（新网址 ideal-type-loading，不碰 manfen-nan）→ 公网双视口 QA → push GitHub。

## 2026-07-29 凌晨（续：QA2→修复→上线新网址）
- QA 第二轮（零上下文，62/100）揪出 P0：真实对局 aha 档案页必崩（buildIdealProfile 与 renderAha 字段契约不符）+ 档案重复写入；另有国王文案张冠李戴、幽灵罚酒杯、"锅底"火锅串场等。
- 三条修复线交付：G `52e8ce7`（契约补全+全字段防御+按 aha.id 判重+国王/罚酒/进桌/锅底→"今晚的酒劲"文案+solo 裁剪+CDP 真跑 solo 全流程零报错海报出图）；H `7cce5db`（空桌冷光呼吸脉冲可点性+老K名牌底衬+竖屏叠压修正）；I `8075626`（摇酒紧凑构图+四杯型装饰贴沿+u.html 文字logo/老K错误文案）。
- 集成 smoke 125/125 → **部署新 Worker：https://ideal-type-loading.kimnin-iup.workers.dev（Version edebd93d-41de-42a7-84b0-02a35f20dcd1）**，旧 manfen-nan 未动。
- 公网验证：桌子幂等（两次 join 同码 9273）、/api/tables 正常、双视口截图 qa/prod-*-390/1400.jpg 人工核对通过（调酒/大厅/游戏页全暗紫霓虹，零蓝白）。

## 2026-07-30 凌晨（R2+R2.5：Kim 大反馈重构，七线并行）
需求真源 docs/FEEDBACK-0729-R2.md（含 R2.5 追加段 + 修订后国王契约）。元规则已落记忆：收到反馈先改 PRD 再动手。

### Kim 反馈要点
- Logo=霓虹马天尼杯（非字母K）；店名不叫"老K的酒吧"→定为「99%」（差的那1%得是活人）。
- 老K人设重蒸馏（"还没抓住"→知世故而不世故、接话优先、见过所以不惊讶）+ 立绘重画（脸不沧桑）+ 摇酒壶真三段式 cobbler。
- 全流程重构：进站→老K自介→选酒→注册(昵称查重+口令+性别+取向)→选桌→选卡组→游戏→海报"进入我的主页"。
- 老K=游戏内每题锐评NPC（实时API+兜底）；爆灯灭灯做进每题；国王游戏只每题触发、终局大国王删除。
- R2.5：国王改**匿名发号+报号**（不点人，"7号5号斗鸡"）；理想型生图低精度、人物低精度背景高精度；老K脸不沧桑；占位名 coco（非嘉欣）；签筒/摇壶去文字提示（手机摇/电脑点）。

### 七线交付（文件所有权并行）
- P 文案/人设：docs/LAOK-PERSONA/COPY-PACK-R2/LAOK-PROMPT + public/laok-lines.js（预写池9场景80句 + KING_ORDERS 12张双号对抗指令卡）。
- A 后端 src/worker.js：/api/register+recover(昵称查重+4-6位口令跨设备找回)、/api/laok(text.pollinations 5s超时降级兜底池，永不5xx)、deck卡组、**匿名国王重做**(Fisher-Yates每题重发号 seat 1..N、king_chance{winners有序,questionIdx,seatCount}、king_order{nums,orderId}、多国王轮流报号)、handleUserGet 补 gender/seeking。smoke 158/0。
- R 美术：public/assets-v2/shaker.svg(三段式cobbler) + public/v2/bartender.js(低精度人物16px格/高精度霓虹酒柜背景/暖笑不沧桑)。
- D 大厅 public/v2/lobby.*：solo文案"一个人？那你和我聊"、"我的主页"入口、卡组徽章。
- C 调酒页 public/v2/cocktail.*：老K自介三句(店名99%)、shaker.svg接入、摇壶去文字提示、注册段(coco占位+口令+性别取向)、老客识别+对暗号找回。
- F 主页 public/u.html：对暗号找回、seeking徽章、无死路导航。
- E 游戏前端 public/index+app+style+poster+ideal-profile：**号码国王UI**(号码牌只本人可见/报两号+甲乙指令卡/揭晓X号是谁)、低精度生图prompt、coco占位、马天尼logo替换K、卡组选择、每题爆灯灭灯、老K NPC框、solo、手机修复。

### QA（零上下文子线程，真实用户体验）+ 修复
- 三轮 QA：A多人全流程 / B solo+老客+溢出扫8页 / **C双客户端真多人局**（房间4071，两独立Edge实例）。
- C 硬验证号码国王 R2.5 全通过：king_chance分毫不差触发、号码牌跨端隔离、报两号+甲乙对抗卡(非点人)、揭晓"1号是甲2号是乙"、每题爆灯灭灯两端可投(主角不可投)、老K锐评6题12次全非空(4s内)、终局无大国王、多人揭晓页全≤390、零console报错。
- QA 揪出 4 P0/P1 → E-fix 修复：①solo开牌页横向溢出490→390(根因 scoreSlam动画+backdrop-filter，html overflow-x:clip + .glass overflow:hidden)；②海报底部补"进入我的主页"按钮(goMyPage)；③签筒去"连点摇签/摇一摇"文字、签筒本体直接可点可摇；④老K锐评每题即时兜底(同步取LAOK_POOL)+LLM回来淡入替换。复验 158/0、solo reveal==390、四张截图人工核对。

### 事故
- QA-C 与多个生成线程撞上 api.aigocode.com 524 网关超时(原点过载)：120-130s 退避后 SendMessage 断点续跑，未丢工作量。

### 上线
- 部署新 Worker：**https://ideal-type-loading.kimnin-iup.workers.dev**（Version 091e6e0c-559a-4d92-9481-737be33232f4），旧 manfen-nan 未动。
- 公网验证：全页200、无扩展名路由正常、/api/laok池兜底、register往返返userId+token(真worker KV写入OK)、前门双视口截图 qa/pub-front-390/1400.jpg 人工核对通过(马天尼logo/店名99%/老K低精度立绘/六大基酒/零溢出)。公网全流程手机 QA（零上下文 a503d…）跑完：solo 主干(进门→调酒→solo→答题3轮→理想型→海报进入我的主页→/u)全绿、零 console 报错、全程 scrollWidth=390、文案违规逐项皆无、老K每题锐评有字、顶栏确为马天尼杯 SVG(非K)。

### 注册"P0"排查 → 误报，已自证
- 该轮 QA 报"注册提交静默失败弹回 cocktail 无提示(P0)"。溯源代码：注册绑 form submit(cocktail.js:564)，校验口令 `/^\d{4,6}$/` 纯数字；成功 201→onCocktailDone(cocktail.html:178,真回调，无条件 location.href=lobby)。
- 根因：QA 填的口令是 **`qa1234`(含字母)**，被前端校验正确拒绝，regError 写入 #regMsg(cocktail.js:556)——QA 未读到该元素故误判"静默"。
- 自证复验 qa/reg-verify.mjs(公网真机 CDP)：① 坏口令 `qa1234` → #regMsg="暗号要 4 到 6 个数字…" 且非 hidden、停在 cocktail（提示确实显示）；② 合法口令 `8842` → URL→/v2/lobby、ideal_userId=7e9d7526d2e1+token 写入、scrollWidth=390。截图 reg-03-badpass/reg-04-afterlobby.jpg 目视确认。**注册端到端跑通，P0 不成立。**

### 验收判定（Kim 三条硬标）
① 公网上线 ✅ https://ideal-type-loading.kimnin-iup.workers.dev  ② 全流程可体验 ✅(solo 主干+注册均自证通过)  ③ 老K人设定妥 ✅(店名99%/老K是人非店名/低精度立绘暖笑/每题锐评/文案零违规)。R2+R2.5 交付完成。

## 2026-08-07 通宵（Fable 方案 / Opus 执行：R9 一期 MVP）
- 战略：Kim 定位拍板「酒桌游戏，摊牌是心理测试」；PRD 模板升级（第一页 MVP 五问强制）；北极星=周完局桌数。
- 致命修复「题随被拷问者」：man/woman 合并 lover 恋爱局，每轮按主角 gender×seeking 抽池（allowedPoolsFor 去 deck 参数），current.renderGender 契约全桌渲染 满分男他/满分女她/理想型TA；入座第四问「今晚想品鉴谁」。跨性别架构原则：机制只问"想品鉴谁"，永不问玩家自己性别。
- PHASE1_FLAGS 关不删：gallery/lifeEntry/deckBoss/deckBestie/showcaseSocial；存档 tag archive/r8-full。
- 埋点：StatsDO(SQLite) 6 事件服务端直记为主，/api/track 白名单，/stats 仪表盘（北极星大数字+60%线+怎么读）；STATS_KEY=wrangler secret（值在 Kim 晨报里）。
- 验证：smoke 253/0（PM 亲跑）；隔离铁桶 6 档×300 抽零泄漏；三态变体/单卡/四问/亮相截图 390 零溢出；线上验证 7 项过（bestie 首测回 bestie 是部署边缘传播延迟，复测 lover；secret 首设含 \r 尾巴 403，bash printf 重设后通）。
- 部署：ideal-type-loading Version 4af0cc30。commit 248c0b0（main 已推）。
- 题库审计 docs/QUESTION-AUDIT-R9.md：数据层干净（中性池 0 视角假设、圈层池 4×18 变体全对），隔离坏在调用不坏在题——Kim review 可只看内容质量。
- 并行：ui-r9 worktree（去廉价感重设计+老K重绘，docs/UI-BRIEF-R9.md）跑 localhost 给 Kim 晨审，不上线。

## 2026-08-08 通宵（R10：故事圣经+四线大改版，Fable方案/Opus执行）
- 定稿：docs/STORY-BIBLE.md（99%酒吧/酒保九八=谐音酒吧差一趴/包厢的暗/海报法则UI精致→审美风）+ Kim定死常量（2-10人朋友局/H1前两周完局率≥75%/北极星周完局桌数）+ IP调研(Fable亲笔,docs/IP-AND-ART-RESEARCH.md)。
- BACK：seats 1-10缺省6(1=solo全链)/ready/allReady开局门/set_seats重开/confirm_direction(题随被拷问者自选)/api/feedback限频落StatsDO/75%达标线真源化。smoke 323/0。
- FRONT：新首页(玩一局/点一杯/玩法/反馈)/桌局双态/方向弹层/准备/开局终稿/CHUG真进度/灶台三档火/老K→九八(app/cocktail/lobby)。
- QBANK：180题全改短(最长47→24字)去SM化(11→3清晰款)，结构/池/辣度逐字守恒，PM复验绿。
- PERSONA：seedPick低位偏斜真bug修复(偶数池一半永不可达=撞款根因)；称号每档1→6条(火化大队长处决)；职业8×8/身份池扩容；生图prompt审美风。type16 9/9+profverify绿。
- SKIN：全站手绘暖系统(暖黑酒红#1a1014/琥珀主光/粉=心动时刻/木黄铜玻璃绒布)；组件拟物(菜单板/门牌/酒杯满上/三档火)；九八SVG三态(圆头黄铜/橄榄天线/正经的呆)；CHUG一张构图；海报审美风；repeating-gradient全站归零。
- PM终检：smoke 323/0亲跑；E2E真实点击打穿solo(首页→1人桌→摇签→方向→5轮→亮相#01→爆灯✓→档案→海报区)零pageerror；关键页目检过。
- 未部署（等Kim明早 localhost:8787 单人试玩点头后上线）。dev常驻8787。

## 2026-08-08 白天（R11：Kim试玩反馈全修+部署）
- 酒保终名【雪克】(Shaker雪克杯；九八=场景同义反复被否/马丁不够可爱被替)；表情v2圆睁圆眼去苦命；LLM prompt/文档全同步。
- 配色v2：威士忌木质→深夜紫黑+霓虹粉紫青主光(Kim:太安静不兴奋)；手绘场景保留重配光；大厅竖屏收窄(房码/成员/按钮三件事)；房码被牌面盖住真bug修复。
- 海报链路：等待页大字「你老公/老婆/TA来咯+🪽🪽」；prompt回退V1嘲弄风(a74d66e考古)；长按保存病因=立绘3.5s超时→15s+缓存优先；二维码改向落地首页。
- 「重新调一杯」入口(清13类本地key)；DIM_KEYWORDS 24格×4条扩池(60seed 53种组合,原恒1种)。
- 分布结论：α二次扫参证明压头部会毁隐藏款稳定性，同分同型=图鉴设计，重复感根治靠标签扩池。
- PM终检：smoke 323/0 + E2E solo全程重跑✓。部署 ideal-type-loading。

## 2026-08-08 晚（R12：Kim手机实测五线大修+部署）
- VOICE：雪克语言体系（≤20字计量腔，5分段池+LLM闸门xkGuard，错位机制性不可能）+10个SVG表情包(xueke-stickers.js)+xkBand契约；XUEKE-VOICE.md人设真源。
- FRONT3：贴纸接线(揭晓/亮相/聊天/弹幕)+?fresh=1清档+微信长按保存(blob+UA实话文案)+全站提示vs功能审查(6假承诺修真)+规则三行+反馈框键盘bug+删入座品鉴谁模块。
- SKIN3：签筒结构修复(考古发现露签是两版共有老bug；静止收筒内摇动才探出)+--tex-wood:none全站去木纹(滑轨钉保留)。
- PORTRAIT：考古真相=pollinations服务端换默认模型(V1 URL已逐字一致仍出国漫脸)；V7暴力低精度像素prompt+英文维度词，实拉20+张验证。Kim图池方案(docs/ART-PROMPTS-R12.md)为根治。
- LOBBY：大厅重构"走过卡座"(酒柜实体装饰/黑板价目/像素小画/99%霓虹/桌卡列表不封顶)+雪克透明根因(脸罩同背景色+5%透明)修复+材质v2木质为主。
- run_worker_first加/laok-lines.js(worker拦截老K本地池)。PM终检smoke 323/0+E2E全绿+目检。
