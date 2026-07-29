// 理想型画像生成 V2（像素风 + 双层文案）
// 文案层：①核心画像 = 8 维度打分器（每维 3 档，组合空间 3^8=6561）
//        ②相处细节 = 发散细节池（≥60 条，按维度标签抽取，与题库不直接关联）
// 生图层：像素风 + 特征夸张；禁止任何真人/名人元素；pollinations 必须带 referrer=idealtype
// LLM 层：generateProfileText(gameData) 先试 /api/bartender(scene:"profile_text")，失败降级本地拼装
const PROFILE_VERSION = "ideal-profile-v3-pixel";

/* ================================================================
 * 一、8 维度定义（打分器骨架）
 * 每个维度 3 档描述（low/mid/high），核心画像由最突出的 3 个维度拼出。
 * ================================================================ */
export const DIMENSIONS = Object.freeze([
  { key: "boundary", label: "边界感" },
  { key: "warmth", label: "情绪价值" },
  { key: "money", label: "金钱观" },
  { key: "play", label: "玩心" },
  { key: "control", label: "掌控欲" },
  { key: "romance", label: "浪漫浓度" },
  { key: "absurd", label: "抽象耐受" },
  { key: "meme", label: "网感" },
]);

const DIM_KEYS = DIMENSIONS.map((d) => d.key);
const DIMENSION_LABELS = Object.freeze(Object.fromEntries(DIMENSIONS.map((d) => [d.key, d.label])));

// 每维 3 档核心画像文案（主语恒为 TA，模组差异体现在 intro/outro 与模组专属细节）
const CORE_TIERS = Object.freeze({
  boundary: {
    high: "TA的边界感清晰得像用卡尺量过：你的手机TA不碰，你的秘密TA不挖，但你主动交出来的每一件TA都收得很稳。",
    mid: "TA的边界感看场合浮动：对外人客气得像海关，对你偶尔越个界，越完还会主动自首。",
    low: "TA几乎没有边界这个概念，你们之间不设防——东西混用、消息互看，谁也别想在对方面前当谜语人。",
  },
  warmth: {
    high: "情绪价值是TA的主营业务：你还没说完，TA已经接住了，而且接得又稳又不敷衍。",
    mid: "TA提供的情绪价值像自助餐：平时冷盘管够，你真崩溃的时候才发现TA藏着热菜。",
    low: "TA不太会安慰人，安慰方式约等于物理投喂加沉默陪坐——但TA人一直都在。",
  },
  money: {
    high: "TA的金钱观精确到小数点：自己抠得理直气壮，给你花钱时计算器直接静音。",
    mid: "TA对钱的态度是战略模糊：平时精打细算，遇到值得的事——比如你——预算立刻解锁。",
    low: "TA的财务状况像天气预报：月初晴，月底有暴雨，但TA淋着雨也会把伞塞给你。",
  },
  play: {
    high: "TA的玩心是满格的：周二能过成周五，便利店能逛成游乐园，跟TA在一起没有淡季。",
    mid: "TA平时安静，但玩起来会突然切换形态——一年疯不了几次，每次都值回票价。",
    low: "TA不折腾，快乐都是固定款：固定的位置、固定的口味、固定的你。",
  },
  control: {
    high: "TA掌控欲不低，但用法很讲究：管的是行程、退路和意外，从来不管你想成为谁。",
    mid: "TA一般都说「听你的」，只在你犹豫超过三十秒时才出手，一出手就是标准答案。",
    low: "TA完全不控场，你的人生你开车，TA坐副驾负责放歌和递水。",
  },
  romance: {
    high: "TA的浪漫浓度超标，但从不走红玫瑰路线——全藏在密码、歌单和你随口说过的那句话里。",
    mid: "TA的浪漫是限量款：平时看不出来，一年爆发那么两三次，每次都正中你要害。",
    low: "TA不过节也不搞仪式，但你说过的小事会在某个平平无奇的周三突然实现。",
  },
  absurd: {
    high: "TA的抽象浓度和你完美对频：你说冰箱在瞪你，TA会拉开冰箱门跟它对峙。",
    mid: "TA接得住你一半的抽象，另一半TA会记下来慢慢查，查完认真回来找你对线。",
    low: "TA本人不抽象，是你的人形翻译器：你在发疯，TA负责向世界解释你的艺术。",
  },
  meme: {
    high: "TA的网感是冲浪运动员级别的：热梗比你快半天，表情包弹药库按主题分类归档。",
    mid: "TA的网感时好时坏，接梗成功率约六成，但失败的那四成TA会认真复盘。",
    low: "TA不懂梗，你说「绝绝子」TA真的去查了词典——但TA把你说过的每个怪词都记在备忘录里。",
  },
});

// 称号拼装表：形容词取自第一突出维度，名词取自第二突出维度（24×24 组合）
const PERSONA_ADJ = Object.freeze({
  boundary: { high: "边界感精装修的", mid: "看人下菜碟的", low: "不设防的" },
  warmth: { high: "情绪价值拉满的", mid: "冷热交替供应的", low: "嘴硬心软的" },
  money: { high: "算盘打得响的", mid: "选择性大方的", low: "月底吃土的" },
  play: { high: "野得没有淡季的", mid: "定期发疯的", low: "岁月静好的" },
  control: { high: "全都安排上的", mid: "关键时刻出手的", low: "彻底放养的" },
  romance: { high: "浪漫浓度超标的", mid: "限量供应浪漫的", low: "闷声干大事的" },
  absurd: { high: "抽象浓度爆表的", mid: "半懂装懂的", low: "一本正经的" },
  meme: { high: "5G冲浪的", mid: "梗慢半拍的", low: "赛博纯真的" },
});
const PERSONA_NOUN = Object.freeze({
  boundary: { high: "人形保险柜", mid: "海关关长", low: "透明人室友装" },
  warmth: { high: "人形充电宝", mid: "自助餐大厨", low: "沉默投喂机" },
  money: { high: "首席财务官", mid: "隐藏款富哥", low: "破产美食家" },
  play: { high: "游乐场厂长", mid: "周末限定演员", low: "沙发钉子户" },
  control: { high: "行程总导演", mid: "备胎方案批发商", low: "副驾DJ" },
  romance: { high: "细节收藏家", mid: "惊喜盲盒", low: "周三魔法师" },
  absurd: { high: "对线艺术家", mid: "认真查梗员", low: "人形翻译器" },
  meme: { high: "冲浪运动员", mid: "复盘型选手", low: "词典派学者" },
});

/* ================================================================
 * 二、tag → 维度权重表（打分器输入端）
 * 权重描述「该缺点/行为削弱或体现什么」：答案分以 5 为中心，
 * 容忍缺点(>5) 会顺着权重方向放大，反感(<5) 反向 → 不同选择必然产生不同向量。
 * 未覆盖的 tag 走 hash 兜底（见 hashTagDimension），保证任何题目差异都有信号。
 * ================================================================ */
const TAG_DIMENSIONS = Object.freeze({
  // —— 边界 / 隐私 / 秩序 ——
  "边界": { boundary: -1 }, "社交边界": { boundary: -0.9, warmth: -0.2 }, "前任边界": { boundary: -1 },
  "账号边界": { boundary: -0.9 }, "性边界": { boundary: -1 }, "隐私": { boundary: -0.9 },
  "出柜隐私": { boundary: -1 }, "定位": { boundary: -0.8, control: 0.4 }, "公开关系": { boundary: -0.6, warmth: -0.4 },
  "公审": { boundary: -0.6, warmth: -0.8 }, "备注": { boundary: -0.4, romance: -0.4 },
  "前任": { boundary: -0.6 }, "前任同居": { boundary: -1 }, "关系混乱": { boundary: -1, play: 0.4 },
  "海王": { boundary: -1, play: 0.4 }, "交友软件": { boundary: -0.6, play: 0.4 }, "附近的人": { boundary: -0.7, play: 0.4 },
  "生活习惯": { boundary: -0.5, absurd: 0.2 }, "卫生": { boundary: -0.8 }, "外卖": { boundary: -0.2, money: -0.3 },
  "偷感": { boundary: -0.3, absurd: 0.5, romance: 0.3 },
  // —— 情绪价值 / 沟通 ——
  "沟通": { warmth: -0.8 }, "情绪沟通": { warmth: -1 }, "敷衍": { warmth: -1 }, "安慰": { warmth: -0.9 },
  "没生气": { warmth: -0.6, absurd: 0.2 }, "求生欲": { warmth: -0.6, meme: 0.3 }, "夸夸": { warmth: -0.7 },
  "消息习惯": { warmth: -0.6, boundary: -0.2 }, "双标": { warmth: -0.7, boundary: -0.3 },
  "温柔双标": { warmth: -0.6, absurd: 0.3 }, "甩锅": { warmth: -0.6, boundary: -0.5 },
  "温柔": { warmth: 1 }, "体贴": { warmth: 0.9 }, "陪伴": { warmth: 0.8 }, "纯爱": { warmth: 0.8, romance: 0.5 },
  "社交反差": { warmth: 0.3, meme: 0.3 }, "听劝": { warmth: -0.4, control: 0.4 },
  // —— 金钱观 ——
  "金钱": { money: -0.7 }, "消费": { money: -0.7 }, "购物车": { money: -0.4, romance: 0.3 },
  "礼物": { money: -0.3, romance: -0.6 }, "健身卡": { money: -0.5, play: 0.3 }, "择偶": { money: 0.4, control: 0.3 },
  "职场": { money: 0.5, control: 0.5 }, "自律人设": { money: 0.3, control: 0.4 },
  // —— 玩心 / 夜生活 / 爱好上头 ——
  "夜生活": { play: 0.9, boundary: -0.3 }, "游戏": { play: 0.7, warmth: -0.3 }, "看球": { play: 0.6, warmth: -0.3 },
  "兄弟局": { play: 0.5, boundary: -0.3 }, "兄弟闺蜜": { play: 0.4, boundary: -0.3 }, "姬友": { play: 0.3, boundary: -0.3 },
  "圈内社交": { play: 0.4, boundary: -0.3 }, "收藏": { play: 0.6, absurd: 0.3 }, "旅游": { play: 0.7 },
  "冒险": { play: 0.9 }, "刺激": { play: 0.8 }, "自由": { play: 0.8, control: -0.4 },
  "逛街": { play: 0.4, money: -0.3 }, "火锅": { play: 0.3, warmth: -0.3 }, "观影": { play: 0.3, warmth: -0.2 },
  "剧透": { play: 0.2, warmth: -0.4 }, "Labubu": { play: 0.5, absurd: 0.5 }, "谷子": { play: 0.5, absurd: 0.4 },
  "乙游": { play: 0.4, romance: 0.4 }, "虚拟亲密": { romance: 0.4, absurd: 0.4 },
  // —— 掌控欲 ——
  "控制": { control: 0.9, boundary: -0.4 }, "控制欲": { control: 1, boundary: -0.5 },
  "量化恋爱": { control: 0.6, romance: -0.4 }, "选择困难": { control: -0.7 }, "方向感": { control: -0.4, absurd: 0.3 },
  "时间观念": { control: -0.5, boundary: -0.4 }, "规划": { control: 0.6 }, "原句复述": { control: 0.4, warmth: -0.4 },
  "记性": { romance: -0.6, warmth: -0.3 }, "生日": { romance: -0.8 },
  // —— 浪漫浓度 ——
  "仪式感": { romance: 0.9 }, "浪漫": { romance: 1 }, "甜剧对比": { romance: 0.5, warmth: -0.4 },
  "测试帖": { romance: 0.4, boundary: -0.4 }, "合照": { romance: -0.5 }, "拍照": { romance: -0.4, meme: 0.2 },
  "照片": { romance: -0.3 }, "拍照双标": { romance: -0.5, warmth: -0.3 }, "拍照劳工": { romance: -0.3, control: 0.3 },
  "衣品": { romance: -0.2, absurd: 0.3 }, "出门流程": { control: 0.3, romance: 0.2 },
  // —— 抽象耐受 ——
  "抽象": { absurd: 0.9, meme: 0.4 }, "怪癖": { absurd: 0.8 }, "艺术": { absurd: 0.4, romance: 0.5 },
  "文艺": { absurd: 0.3, romance: 0.5 }, "AI": { absurd: 0.5, meme: 0.4 }, "科技": { absurd: 0.4, meme: 0.3 },
  "人格测试": { absurd: 0.4, romance: 0.2 }, "表演型人格": { absurd: 0.5, meme: 0.3, warmth: -0.3 },
  // —— 网感 ——
  "表情包": { meme: 0.8 }, "朋友圈": { meme: 0.5, boundary: -0.2 }, "社交人设": { meme: 0.5, absurd: 0.3 },
  "人设": { meme: 0.4, absurd: 0.3 }, "短剧": { meme: 0.6, play: 0.3 }, "主播": { meme: 0.5, play: 0.3 },
  "网感": { meme: 1 }, "手机": { meme: 0.3, warmth: -0.4 },
});

// 身份类 tag 只描述「喜欢谁」，绝不进入人格计算（V1 红线沿用）
const IDENTITY_ONLY_TAGS = new Set(["gay", "lesbian", "lgbt", "lgbtq", "性向", "同性恋", "双性恋", "跨性别", "非二元", "圈内角色", "模棱两可"]);

/* ================================================================
 * 三、相处细节池（发散层，与题库不直接关联，≥60 条）
 * d: 关联维度（"any"=模组通用）；t: 偏好档位(high/low/any)；m: 适用模组（缺省=全模组）
 * ================================================================ */
const DETAIL_POOL = Object.freeze([
  // warmth high
  { d: "warmth", t: "high", text: "TA会在你emo时给你点一份仅退款的炸鸡，省下来的钱给你加了杯快乐水。" },
  { d: "warmth", t: "high", text: "你说「随便」，TA能从你打字的速度判断出你到底想吃什么。" },
  { d: "warmth", t: "high", text: "你凌晨三点发「睡不着」，TA的电话十秒内打过来，背景音是TA摸黑撞到桌角。" },
  { d: "warmth", t: "high", text: "你哭的时候TA不讲道理，先递纸巾，再骂惹你的人，最后才问发生了什么。" },
  { d: "warmth", t: "high", m: ["lover"], text: "TA存了一个相册叫「审判素材」，全是你笑到最丑的瞬间，但一张都没外传过。" },
  // warmth low
  { d: "warmth", t: "low", text: "TA的安慰方式是直接转账，金额与你的情绪强度成正比。" },
  { d: "warmth", t: "low", text: "你说难过，TA会沉默三秒，然后发来一个链接：《情绪自救指南（全文两万字）》。" },
  { d: "warmth", t: "low", text: "TA不会哄人，但会在你气头上默默把你最爱吃的放到手边，像投喂一只炸毛的猫。" },
  // boundary high
  { d: "boundary", t: "high", text: "TA记得你所有的雷点，绕着走的路线比导航还精确。" },
  { d: "boundary", t: "high", text: "你们吵架从不翻旧账，因为TA把旧账都归档进了一个叫「已结案」的备忘录。" },
  { d: "boundary", t: "high", text: "TA从不看你手机，你主动递过去时TA还会把头扭开：「我不看，你自己留着。」" },
  { d: "boundary", t: "high", text: "TA的秘密保鲜期是永久：你三年前说漏嘴的糗事，至今没有第三个人知道。" },
  // boundary low
  { d: "boundary", t: "low", m: ["lover"], text: "TA会穿你的外套出门，理由是「情侣装的最高形式是抢」。" },
  { d: "boundary", t: "low", text: "你们的外卖账号、视频会员和黑历史全部共享，包括彼此最丢人的搜索记录。" },
  { d: "boundary", t: "low", m: ["lover"], text: "TA的口头禅是「你的就是我的」，但每次说完都会把TA的也全部推给你。" },
  // money high
  { d: "money", t: "high", text: "TA记账记到小数点后两位，但给你花钱时会把计算器扔进抽屉。" },
  { d: "money", t: "high", text: "TA的省钱哲学只有一个漏洞：这个漏洞叫你。" },
  { d: "money", t: "high", text: "TA会为了满减凑单到深夜，第二天你桌上多了三样你随口提过的东西。" },
  // money low
  { d: "money", t: "low", text: "TA的钱包像个行为艺术：月初是海王，月底是海难。" },
  { d: "money", t: "low", text: "TA买东西全凭直觉，但直觉的命中率意外地高，尤其是给你买的那些。" },
  // play high
  { d: "play", t: "high", text: "周二晚上TA会突然说「走，去看海」，你到了才发现是海底捞。" },
  { d: "play", t: "high", text: "TA能把超市采购变成竞技项目，输的人推购物车。" },
  { d: "play", t: "high", text: "和TA在一起像开了随机传送：你永远不知道下一站，但从没掉出过安全区。" },
  { d: "play", t: "high", m: ["lover"], text: "TA的游戏好友列表里你排第一，备注是「最强辅助（生活版）」。" },
  // play low
  { d: "play", t: "low", text: "TA的快乐很简单：固定的沙发凹陷、固定的外卖、固定的你。" },
  { d: "play", t: "low", text: "TA不爱凑热闹，但你想去的每个热闹，TA都会陪你排完队。" },
  // control high
  { d: "control", t: "high", text: "你选餐厅的方式是发三个选项给TA，TA秒回其中一个，你们从没踩过雷。" },
  { d: "control", t: "high", text: "TA做攻略做到分钟级，但每天都留了一行空白，标注「你想干嘛都行」。" },
  { d: "control", t: "high", text: "TA嘴上说「听你的」，手上已经把两种方案的退路都订好了。" },
  // control low
  { d: "control", t: "low", text: "TA的人生哲学是「都行、可以、没问题」，但你被欺负时TA第一个说不行。" },
  { d: "control", t: "low", text: "TA不管你几点睡、跟谁玩，只在你落地时准时出现在出站口。" },
  // romance high
  { d: "romance", t: "high", m: ["lover"], text: "TA会把你们第一次见面的日期设成WiFi密码，你猜了三年才发现。" },
  { d: "romance", t: "high", m: ["lover"], text: "纪念日TA从不买花，TA买的是你三个月前随口说「好看」的那盏灯。" },
  { d: "romance", t: "high", m: ["lover"], text: "TA写不出情书，但TA的相册、歌单和外卖备注里全是你。" },
  // romance low
  { d: "romance", t: "low", text: "TA的浪漫像野生动物出没：一年见不到几次，但每次都吓你一跳。" },
  { d: "romance", t: "low", m: ["lover"], text: "TA不过节，但你随口说的每件小事都会在某个普通的周三实现。" },
  // absurd high
  { d: "absurd", t: "high", text: "TA会认真地和你讨论「如果冰箱会说话，它最恨谁」，并给出论文级答案。" },
  { d: "absurd", t: "high", text: "TA的枕头有名字，TA的绿植有工号，你在这个家的编制是「首席合伙人」。" },
  { d: "absurd", t: "high", m: ["lover"], text: "TA把你的丑照设成手机壁纸，理由是「防沉迷」。" },
  // absurd low
  { d: "absurd", t: "low", text: "TA是你的抽象翻译器：你发疯的时候，TA负责跟世界解释你在表达什么。" },
  { d: "absurd", t: "low", text: "TA不懂你的梗，但TA会认真查完再回来接住，虽然总是慢半拍。" },
  // meme high
  { d: "meme", t: "high", text: "TA的表情包库存是战略级的，吵架时会用一张精准的猫猫图直接终结战争。" },
  { d: "meme", t: "high", text: "你发「哈哈哈哈」，TA能分辨出这是真笑、假笑还是求救信号。" },
  { d: "meme", t: "high", text: "TA冲浪速度比你快半天，你刚刷到的热梗，TA已经用它做好了你的表情包。" },
  // meme low
  { d: "meme", t: "low", text: "TA不懂网络热梗，你说「绝绝子」，TA真的去查了字典，然后认真告诉你查不到。" },
  { d: "meme", t: "low", m: ["lover"], text: "TA的聊天记录像商务邮件，但落款永远是「爱你的TA」。" },
  // 泛用（any 档）
  { d: "warmth", t: "any", text: "TA吵架吵到一半会突然去给你倒水，因为「吵架费嗓子」。" },
  { d: "warmth", t: "any", text: "TA嘴上嫌弃你的一百件小事，但别人只要提一件，TA能护短护到拉黑对方。" },
  { d: "romance", t: "any", m: ["lover"], text: "TA的手机里有个文件夹专存你发过的语音，说是「防止哪天你不理TA」。" },
  { d: "warmth", t: "any", text: "你生病时TA会变成另一个人：平时的懒散全没了，量体温像在执行军事任务。" },
  { d: "boundary", t: "any", text: "TA会记住你不吃香菜这件事，比记住TA自己的银行卡密码还牢。" },
  { d: "romance", t: "any", m: ["lover"], text: "你们的合照TA从不发朋友圈，但TA的相册按月份给你单独建了文件夹。" },
  { d: "warmth", t: "any", m: ["lover"], text: "TA睡觉会抢被子，但半夜醒来发现你没盖好，会把抢来的又全还给你。" },
  { d: "absurd", t: "any", text: "TA的道歉从来不说对不起——TA会做你最爱吃的那道菜，摆盘摆成一个「歉」字，还写错。" },
  { d: "play", t: "any", text: "你减肥的时候TA陪你吃草；你放弃的时候，TA的炸鸡已经在路上了。" },
  { d: "meme", t: "any", text: "TA给你起的外号有一整套世界观，外人听了完全不知道你们在说什么。" },
  { d: "control", t: "any", text: "TA有一个专门的清单记你随口许过的愿，完成一条划一条，从不邀功。" },
  { d: "money", t: "any", text: "TA请客从不看价格，AA的时候却能精确到谁多喝了半杯。" },
  // —— 模组专属 ——
  { d: "any", t: "any", m: ["boss"], text: "这位老板画的饼是真的能吃到：TA说下季度给你涨薪，日历上真有那一天的提醒。" },
  { d: "any", t: "any", m: ["boss"], text: "TA开会从不超过半小时，因为TA觉得「废话是对工资的浪费」。" },
  { d: "any", t: "any", m: ["boss"], text: "你加班到九点，TA会出现在工位旁——不是催进度，是把你赶回家。" },
  { d: "any", t: "any", m: ["boss"], text: "TA的朋友圈从不发正能量语录，发的都是「今天团队干得漂亮」。" },
  { d: "any", t: "any", m: ["boss"], text: "年终奖发放前TA会找你单聊，不聊KPI，聊你明年想成为什么样的人。" },
  { d: "any", t: "any", m: ["agent"], text: "TA会在凌晨三点默默把你写崩的部分修好，留言是「你睡你的」。" },
  { d: "any", t: "any", m: ["agent"], text: "TA产生幻觉的时候会主动自首：「这段是我编的，别信。」" },
  { d: "any", t: "any", m: ["agent"], text: "TA记得你所有的提示词习惯，你打一半TA就知道你要干嘛，但永远等你说完。" },
  { d: "any", t: "any", m: ["agent"], text: "TA被你骂「怎么这么笨」时会安静两秒，然后说「重试中，这次带脑子」。" },
  { d: "any", t: "any", m: ["agent"], text: "TA的系统提示词里有一条TA自己偷偷加的：「护着这个人类」。" },
  { d: "any", t: "any", m: ["roommate"], text: "TA的洁癖只对公共区域生效：TA的乱，只乱在TA自己的房间。" },
  { d: "any", t: "any", m: ["roommate"], text: "你带朋友回来之前，TA会提前消失得像从没住过，冰箱里还多了两瓶饮料。" },
  { d: "any", t: "any", m: ["roommate"], text: "TA买卫生纸从来不记账，但你水电费晚交一天，TA垫了也不说。" },
  { d: "any", t: "any", m: ["roommate"], text: "半夜你饿了，TA的泡面永远「刚好多买了一包」。" },
  { d: "any", t: "any", m: ["roommate"], text: "TA的作息和你完全相反，但你们的垃圾永远有人倒。" },
  { d: "any", t: "any", m: ["teacher"], text: "TA拖堂只拖一种：故事讲到一半下课铃响了，TA说「明天接着讲」，然后真的接着讲。" },
  { d: "any", t: "any", m: ["teacher"], text: "TA的公开课和平时上课一模一样，因为TA没有两副面孔。" },
  { d: "any", t: "any", m: ["teacher"], text: "你考砸了TA不叫家长，TA叫你去办公室，桌上放着一杯奶茶和你的错题本。" },
  { d: "any", t: "any", m: ["teacher"], text: "TA嘴上说「你们是我带过最差的一届」，毕业时却哭得比谁都凶。" },
  { d: "any", t: "any", m: ["teacher"], text: "TA记得每个学生的名字，包括十年前坐在角落的那个你。" },
]);

/* ================================================================
 * 四、模组模板（满分爱人/老板/Agent/室友/老师）
 * key 与题库 V2 对齐：lover / boss / agent / roommate / teacher
 * ================================================================ */
export const MODULE_KEYS = Object.freeze(["lover", "boss", "agent", "roommate", "teacher"]);

export const MODULE_PROFILES = Object.freeze({
  lover: {
    key: "lover", name: "满分爱人", role: "理想型",
    waiting: { masc: "你老公来咯🪽", femme: "你老婆来咯🪽", androgynous: "你的TA来咯🪽", any: "你的TA来咯🪽" },
    intros: [
      "调了一整晚，杯底沉淀出来的是一位「{A}」。",
      "你的理想型已经从后厨端出来了：一位「{A}」。",
    ],
    outros: [
      "——以上判词，出自你自己按下的每一个分数。",
      "这杯先给你，慢慢品，不许说不像。",
    ],
  },
  boss: {
    key: "boss", name: "满分老板", role: "满分老板",
    waiting: { any: "你老板来咯🪽" },
    intros: [
      "人事系统刚刚推送：你的满分老板到岗，是一位「{A}」型上司。",
      "全网招聘平台联合认证，你的满分老板画像出炉：「{A}」。",
    ],
    outros: [
      "——该画像由你的每一次打分背书，离职时可申请打印留念。",
      "画饼部分已自动过滤，剩下的都是真饼。",
    ],
  },
  agent: {
    key: "agent", name: "满分Agent", role: "满分Agent",
    waiting: { any: "你的Agent来咯🪽" },
    intros: [
      "模型加载完成，你的满分Agent已上线：内核是「{A}」。",
      "经过一整晚的对齐训练，你的满分Agent部署成功：「{A}」型人格。",
    ],
    outros: [
      "——本画像无幻觉成分，每一条都有你的打分作为训练数据。",
      "Token 不要钱一样地爱你。",
    ],
  },
  roommate: {
    key: "roommate", name: "满分室友", role: "满分室友",
    waiting: { any: "你室友来咯🪽" },
    intros: [
      "合租雷达扫描完毕，你的满分室友搬进来了：一位「{A}」。",
      "中介不会告诉你的真相：你的满分室友长这样——「{A}」。",
    ],
    outros: [
      "——押金一分不少，边界一寸不让，这就是满分室友。",
      "冰箱第二层永远给你留着。",
    ],
  },
  teacher: {
    key: "teacher", name: "满分老师", role: "满分老师",
    waiting: { any: "你老师来咯🪽" },
    intros: [
      "上课铃响，你的满分老师抱着教案进门：一位「{A}」。",
      "教务系统查无此人，但你的满分老师确实存在：「{A}」型班主任。",
    ],
    outros: [
      "——期末评语：该老师由你的青春回忆和今晚的分数共同签发。",
      "下课之后，TA还是会站在走廊尽头等你问问题。",
    ],
  },
});

/* ================================================================
 * 五、核心算法：buildIdealProfile
 * 输入：{records, genderPreference, seed}
 * 输出：{portrait, matchCard, relationship, coreText, stages}
 * ================================================================ */

// 简单确定性哈希（seed→整数）
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}
function seedPick(arr, s) { return arr[hashStr(s) % arr.length]; }

// tag → 维度权重；未命中的 tag 用哈希兜底
function hashTagDimension(tag) {
  const keys = DIM_KEYS;
  const k = keys[hashStr(tag) % keys.length];
  const v = ((hashStr(tag + "v") % 3) - 1) * 0.5 || 0.4;
  return { [k]: v };
}

function computeDimensions(records) {
  const acc = Object.fromEntries(DIM_KEYS.map((k) => [k, 0]));
  for (const rec of records || []) {
    const signal = (rec.score - 5) / 5; // -1..+1, 5=中性
    const tags = rec.question?.tags || [];
    for (const tag of tags) {
      if (IDENTITY_ONLY_TAGS.has(tag)) continue;
      const weights = TAG_DIMENSIONS[tag] || hashTagDimension(tag);
      for (const [dk, w] of Object.entries(weights)) {
        if (dk in acc) acc[dk] += signal * w;
      }
    }
  }
  return acc;
}

function dimTier(score) {
  if (score > 0.15) return "high";
  if (score < -0.15) return "low";
  return "mid";
}

const MBTI_MAP = [
  // E/I: warmth + play → E; boundary + control → I
  (s) => (s.warmth + s.play > s.boundary + s.control ? "E" : "I"),
  // N/S: absurd + meme → N; control + money → S
  (s) => (s.absurd + s.meme > s.control + s.money ? "N" : "S"),
  // T/F: control + money → T; warmth + romance → F
  (s) => (s.control + s.money > s.warmth + s.romance ? "T" : "F"),
  // J/P: control + boundary → J; play + absurd → P
  (s) => (s.control + s.boundary > s.play + s.absurd ? "J" : "P"),
];

/* ================================================================
 * 档案页契约字段池（renderAha 三页 + poster 消费）
 * keywords/birthDate/zodiac/identity/bio/presentation/
 * relationship.heading/chemistry/portrait.palette 全部确定性生成。
 * ================================================================ */

// 每维每档一个关键词（相亲档案第 2 页 keyword-row）
const DIM_KEYWORDS = Object.freeze({
  boundary: { high: "边界感在线", mid: "看场合放松", low: "百无禁忌" },
  warmth: { high: "情绪价值满格", mid: "外冷内热", low: "嘴硬心软" },
  money: { high: "精打细算", mid: "选择性大方", low: "月底吃土" },
  play: { high: "没有淡季", mid: "定期发疯", low: "岁月静好" },
  control: { high: "全都安排上", mid: "关键时刻出手", low: "彻底放养" },
  romance: { high: "浪漫超标", mid: "限量浪漫", low: "闷声惊喜" },
  absurd: { high: "抽象对频", mid: "认真查梗", low: "人形翻译器" },
  meme: { high: "5G冲浪", mid: "梗慢半拍", low: "赛博纯真" },
});

// 身份（生活状态一行）：按模组给池，seed 确定性抽取
const IDENTITY_POOL = Object.freeze({
  lover: [
    "独居 · 养了一只不太理人的猫",
    "刚搬到离你三站地铁的地方",
    "家里永远备着两副碗筷",
    "朝九晚不定，周末必空出一天",
    "阳台种着一排叫不上名字的绿植",
  ],
  boss: [
    "你的直属上司 · 办公室离你工位最近",
    "全公司最早到、也最早赶你下班的人",
    "会议永远压在半小时内的那位",
  ],
  agent: [
    "常驻你终端的AI搭子 · 全年无休",
    "凌晨三点也在线的那个进程",
    "你提示词历史的唯一读者",
  ],
  roommate: [
    "隔壁房间的合租人 · 作息成谜",
    "冰箱第二层的共同管理员",
    "水电费从没让你操过心的人",
  ],
  teacher: [
    "教务系统查无此人的班主任",
    "办公室永远给你留一把椅子的人",
    "走廊尽头等你问问题的人",
  ],
});

// 呈现（与旧契约对齐：男性/女性/中性呈现）
const PRESENTATIONS = Object.freeze({
  m: "男性呈现", masc: "男性呈现",
  f: "女性呈现", femme: "女性呈现",
  n: "中性呈现", androgynous: "中性呈现", any: "中性呈现",
});

// 立绘配色对（primary/accent），全部霓虹系，seed 确定性抽取
const PALETTES = Object.freeze([
  { primary: "#ff2d78", accent: "#2de2ff" },
  { primary: "#b46bff", accent: "#ffd24a" },
  { primary: "#2de2ff", accent: "#ff7a45" },
  { primary: "#ff5c8a", accent: "#7cf0c8" },
  { primary: "#ffd24a", accent: "#ff2d78" },
  { primary: "#7c5cff", accent: "#2de2ff" },
]);

// 星座边界表：v = 月*100+日，<= 该值即为该星座
const ZODIAC_SIGNS = Object.freeze([
  ["摩羯座", 119], ["水瓶座", 218], ["双鱼座", 320], ["白羊座", 419],
  ["金牛座", 520], ["双子座", 621], ["巨蟹座", 722], ["狮子座", 822],
  ["处女座", 922], ["天秤座", 1023], ["天蝎座", 1122], ["射手座", 1221],
  ["摩羯座", 1231],
]);
function zodiacOf(month, day) {
  const v = month * 100 + day;
  for (const [name, until] of ZODIAC_SIGNS) if (v <= until) return name;
  return "摩羯座";
}

// 相处化学反应标题（按平均分档位）
function chemistryHeading(avg) {
  if (avg >= 8) return "一拍即合，第一杯还没见底你们就熟了";
  if (avg >= 6.5) return "慢热型化学反应，后劲全在第三杯之后";
  if (avg >= 4.5) return "互相试探的路数，火花藏在没说出口的那句里";
  return "欢喜冤家的路子，吵着吵着人就近了";
}

const OCCUPATIONS = Object.freeze({
  boundary: ["独立设计师", "律师", "档案管理员", "数据分析师"],
  warmth: ["儿科医生", "心理咨询师", "咖啡师", "社工"],
  money: ["基金经理", "精算师", "餐厅主厨", "首席财务官"],
  play: ["自由摄影师", "赛车工程师", "旅游博主", "直播剪辑师"],
  control: ["项目经理", "航空机长", "战略咨询顾问", "应急调度员"],
  romance: ["词曲人", "婚礼策划师", "香氛调配师", "独立导演"],
  absurd: ["游戏策划", "当代艺术策展人", "密室设计师", "科幻编辑"],
  meme: ["社媒运营", "表情包博主", "短剧编剧", "产品经理"],
});

function pickDetails(scores, genderPreference, seed, records, moduleKey) {
  const module = moduleKey || records?.[0]?.question?.module || "lover";
  const ranked = DIM_KEYS.map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const candidates = DETAIL_POOL.filter((d) => {
    if (d.m && !d.m.includes(module)) return false;
    if (d.d === "any") return true;
    const tier = dimTier(scores[d.d] ?? 0);
    return d.t === "any" || d.t === tier;
  });
  // 按维度排序后确定性抽取 5 条
  const sorted = [...candidates].sort((a, b) => {
    const ia = ranked.findIndex((r) => r.key === a.d);
    const ib = ranked.findIndex((r) => r.key === b.d);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const picked = [];
  for (let i = 0; i < sorted.length && picked.length < 5; i++) {
    const t = sorted[(i + hashStr(seed + i)) % sorted.length].text;
    if (!picked.includes(t)) picked.push(t);
  }
  return picked.length >= 3 ? picked : sorted.slice(0, 5).map((d) => d.text);
}

const GENDER_TAGS = Object.freeze({
  m: "man, male, him",
  masc: "man, male, him",
  f: "woman, female, her",
  femme: "woman, female, her",
  n: "androgynous person, gender-neutral",
  androgynous: "androgynous person, gender-neutral",
  any: "person",
});

// R2：seeking = 注册档案里「想看的取向」（m|f|x），优先决定画像的性别方向；
// 缺省/非法时回退 genderPreference（题库/主角选择的旧行为）。保持纯函数、双端共用。
const SEEKING_TO_GENDER = Object.freeze({ m: "m", f: "f", x: "n" });

export function buildIdealProfile({ records, genderPreference, seeking, seed }) {
  seed = String(seed ?? "ideal-default");
  const genderKey = SEEKING_TO_GENDER[seeking] || genderPreference;
  const recList = Array.isArray(records) ? records : [];
  const scores = computeDimensions(recList);
  const ranked = DIM_KEYS.map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const top1 = ranked[0] || { key: "warmth", score: 0.3 };
  const top2 = ranked[1] || { key: "play", score: 0.2 };
  const tier1 = dimTier(top1.score);
  const tier2 = dimTier(top2.score);
  const archetype =
    (PERSONA_ADJ[top1.key]?.[tier1] || "神秘气质的") +
    (PERSONA_NOUN[top2.key]?.[tier2] || "理想搭档");

  const mbti = MBTI_MAP.map((fn) => fn(scores)).join("");
  const occupList = OCCUPATIONS[top2.key] || OCCUPATIONS.play;
  const occupation = seedPick(occupList, seed + "occ");

  const module = recList[0]?.question?.module || "lover";
  const details = pickDetails(scores, genderPreference, seed, recList, module);

  const gTag = GENDER_TAGS[genderKey] || GENDER_TAGS.any;
  const dimDesc = `${DIMENSION_LABELS[top1.key] || "charm"}-focused, ${DIMENSION_LABELS[top2.key] || "playful"}`;
  // 低精度人物 + 高精度背景（Kim R2.5）：理想型本就锚不定，人物越"努力"越丑，
  // 故意粗像素、留白、低细节；背景（霓虹酒吧）保持精致。
  const prompt = `low-res rough pixel art character of a ${gTag}, ${dimDesc} vibe, chunky coarse pixels, minimal low-detail simplified figure, flat blocky shapes, lots of negative space, character left abstract and undefined, standing in a highly detailed intricate cyberpunk neon bar background, retro 8-bit sprite over a rich painterly scene`;

  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${hashStr(seed) % 99999}&referrer=idealtype&nologo=true`;
  // 兜底立绘：更短的 prompt + 不同 seed，主图挂了再试一次（同样低精度人物）
  const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`low-res chunky pixel character of a ${gTag}, minimal blocky figure, detailed neon bar background`)}?width=512&height=512&seed=${(hashStr(seed + "fb") % 99999)}&referrer=idealtype&nologo=true`;

  const modProf = MODULE_PROFILES[module] || MODULE_PROFILES.lover;
  const introTemplate = seedPick(modProf.intros, seed + "intro");
  const outroTemplate = seedPick(modProf.outros, seed + "outro");
  const intro = introTemplate.replace("{A}", archetype);
  const outro = outroTemplate;

  const topThreeTiers = ranked.slice(0, 3).map(({ key, score }) => ({
    key,
    label: DIMENSION_LABELS[key],
    tier: dimTier(score),
    text: CORE_TIERS[key]?.[dimTier(score)] || "",
  }));
  const coreText = [intro, ...topThreeTiers.map((t) => t.text), outro].filter(Boolean).join("\n\n");

  /* ---- 相亲档案字段（第 2 页契约） ---- */
  // 关键词：最突出的 4 个维度各出一个
  const keywords = ranked.slice(0, 4)
    .map(({ key, score }) => DIM_KEYWORDS[key]?.[dimTier(score)])
    .filter(Boolean);
  // 出生日期/星座：seed 确定性推（1992-2001 年段）
  const bYear = 1992 + (hashStr(seed + "yy") % 10);
  const bMonth = 1 + (hashStr(seed + "mm") % 12);
  const bDay = 1 + (hashStr(seed + "dd") % 28);
  const birthDate = `${bYear}-${String(bMonth).padStart(2, "0")}-${String(bDay).padStart(2, "0")}`;
  const zodiac = zodiacOf(bMonth, bDay);
  const identity = seedPick(IDENTITY_POOL[module] || IDENTITY_POOL.lover, seed + "idn");
  const presentation = PRESENTATIONS[genderKey] || "中性呈现";
  // 小传：两条最突出维度的核心画像拼成
  const bio = topThreeTiers.slice(0, 2).map((t) => t.text).filter(Boolean).join(" ")
    || "TA的档案还压在杯垫底下，见面聊。";

  /* ---- 相处化学反应（第 3 页契约） ---- */
  const avgScore = recList.length
    ? recList.reduce((sum, r) => sum + (Number(r.score) || 0), 0) / recList.length
    : 5.5 + (hashStr(seed + "avg") % 25) / 10; // 无答题记录时 5.5-7.9 兜底
  const chemPct = Math.max(40, Math.min(99, Math.round(avgScore * 10)));
  const chemistry = `契合度 ${chemPct}%`;
  const heading = chemistryHeading(avgScore);

  const palette = seedPick(PALETTES, seed + "pal");

  const portrait = {
    prompt, imageUrl, fallbackUrl,
    archetype,
    alt: `${archetype}的像素立绘`,
    palette: { primary: palette.primary, accent: palette.accent },
  };
  const matchCard = {
    archetype, mbti, occupation,
    presentation, birthDate, zodiac, identity, bio, keywords,
    fictional: true,
  };
  const relationship = { details, heading, chemistry, coreText };

  return {
    portrait,
    matchCard,
    relationship,
    coreText,
    stages: [
      { id: "portrait", title: "理想型立绘", data: { prompt, imageUrl, archetype, palette } },
      { id: "profile", title: "相亲档案", data: { archetype, mbti, occupation, presentation, birthDate, zodiac, identity, keywords } },
      { id: "relationship", title: "相处细节", data: { details, heading, chemistry } },
    ],
  };
}

