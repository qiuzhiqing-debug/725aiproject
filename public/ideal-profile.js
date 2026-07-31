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

/* ================================================================
 * TYPE-16 型号体系（R8 定稿，docs/FEEDBACK-0801-R8.md §4/§6）
 * 旧 ADJ×NOUN 自由拼装称号已弃用（576 组合不可图鉴）；
 * 称号 = 型号名，16 个固定桶：4 族 × 族内主导维 × 方向。
 * 常数由 PM 用 10000 局人群模拟标定（α=0.7 部分归一），逐字采用，禁止调参；
 * 改题库/tag 必须重跑标定后同步 TYPE_NORM。
 * ================================================================ */
export const TYPE_ALPHA = 0.7;

// 每维「题库覆盖归一因子」（人群标定 σ）
export const TYPE_NORM = Object.freeze({
  boundary: 0.731, warmth: 0.330, money: 0.370, play: 0.461,
  control: 0.737, romance: 0.374, absurd: 0.605, meme: 0.330,
});

// 四族固定序（平局破序用）：order→hot→wild→worldly；族内 d1 优先
const TYPE_FAMILIES = Object.freeze([
  Object.freeze({ family: "order", dims: Object.freeze(["boundary", "control"]) }),
  Object.freeze({ family: "hot", dims: Object.freeze(["warmth", "romance"]) }),
  Object.freeze({ family: "wild", dims: Object.freeze(["play", "absurd"]) }),
  Object.freeze({ family: "worldly", dims: Object.freeze(["money", "meme"]) }),
]);

// 隐藏款 = 人群验证最稀有 3 型（#05 充电宝 / #13 CFO / #16 学者）
export const HIDDEN_TYPE_IDS = Object.freeze([5, 13, 16]);

export const TYPE_TABLE = Object.freeze([
  Object.freeze({ id: 1, code: "#01", key: "boundary+", name: "边界感精装修的人形保险柜", family: "order", hidden: false }),
  Object.freeze({ id: 2, code: "#02", key: "boundary-", name: "不设防的透明人", family: "order", hidden: false }),
  Object.freeze({ id: 3, code: "#03", key: "control+", name: "全都安排上的行程总导演", family: "order", hidden: false }),
  Object.freeze({ id: 4, code: "#04", key: "control-", name: "彻底放养的副驾DJ", family: "order", hidden: false }),
  Object.freeze({ id: 5, code: "#05", key: "warmth+", name: "情绪价值拉满的人形充电宝", family: "hot", hidden: true }),
  Object.freeze({ id: 6, code: "#06", key: "warmth-", name: "嘴硬心软的沉默投喂机", family: "hot", hidden: false }),
  Object.freeze({ id: 7, code: "#07", key: "romance+", name: "浪漫浓度超标的细节收藏家", family: "hot", hidden: false }),
  Object.freeze({ id: 8, code: "#08", key: "romance-", name: "闷声干大事的周三魔法师", family: "hot", hidden: false }),
  Object.freeze({ id: 9, code: "#09", key: "play+", name: "野得没有淡季的游乐场厂长", family: "wild", hidden: false }),
  Object.freeze({ id: 10, code: "#10", key: "play-", name: "岁月静好的沙发钉子户", family: "wild", hidden: false }),
  Object.freeze({ id: 11, code: "#11", key: "absurd+", name: "抽象浓度爆表的对线艺术家", family: "wild", hidden: false }),
  Object.freeze({ id: 12, code: "#12", key: "absurd-", name: "一本正经的人形翻译器", family: "wild", hidden: false }),
  Object.freeze({ id: 13, code: "#13", key: "money+", name: "算盘打得响的首席财务官", family: "worldly", hidden: true }),
  Object.freeze({ id: 14, code: "#14", key: "money-", name: "月底吃土的破产美食家", family: "worldly", hidden: false }),
  Object.freeze({ id: 15, code: "#15", key: "meme+", name: "5G冲浪的热梗批发商", family: "worldly", hidden: false }),
  Object.freeze({ id: 16, code: "#16", key: "meme-", name: "赛博纯真的词典派学者", family: "worldly", hidden: true }),
]);

const TYPE_BY_KEY = Object.freeze(Object.fromEntries(TYPE_TABLE.map((t) => [t.key, t])));

/**
 * 判型纯函数：8 维分向量 → TYPE_TABLE 条目（确定性：同 scores 永远同型）。
 * z[d] = scores[d] / norm[d]^α → 族强度 = |z[d1]|+|z[d2]|（严格大于才换族，平局留前者）
 * → 族内主导维 = |z| 大者（平局取 d1，用 >=）→ 方向 z>=0 为 "+"。
 * 全零向量按上述平局规则自然落 #01（order→boundary→+）。
 */
export function classifyType16(scores) {
  const z = {};
  for (const d of DIM_KEYS) {
    const raw = Number(scores?.[d]) || 0;
    z[d] = raw / Math.pow(TYPE_NORM[d], TYPE_ALPHA);
  }
  let best = TYPE_FAMILIES[0];
  let bestStrength = Math.abs(z[best.dims[0]]) + Math.abs(z[best.dims[1]]);
  for (let i = 1; i < TYPE_FAMILIES.length; i++) {
    const fam = TYPE_FAMILIES[i];
    const strength = Math.abs(z[fam.dims[0]]) + Math.abs(z[fam.dims[1]]);
    if (strength > bestStrength) { best = fam; bestStrength = strength; }
  }
  const [d1, d2] = best.dims;
  const dom = Math.abs(z[d1]) >= Math.abs(z[d2]) ? d1 : d2;
  const sign = z[dom] >= 0 ? "+" : "-";
  return TYPE_BY_KEY[dom + sign];
}

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
  // ================================================================
  // R6 新增映射（T1）：questions.js 重写后所有 tag 落表，0 走 hash。
  // 仅新增 key，不改上方任何已有映射 / 打分逻辑 / DIMENSIONS / 文案。
  // 成人向方向遵 R6 §1.1：性癖→{romance,absurd}、道具/角色扮演→{play,absurd}、
  // spank/床事掌控→{control,play}、洁癖/强迫→{boundary-,control}。
  // ================================================================
  // —— 日常缺点（清汤/番茄，原走 hash 的都补上）——
  "精神世界": { absurd: 0.5, romance: 0.3 }, "道歉": { warmth: -0.2, absurd: 0.4 },
  "形式主义": { absurd: 0.4, warmth: -0.2 }, "吵架": { warmth: -0.5, control: 0.2 },
  "冷战": { warmth: -0.6, control: 0.3 }, "借口": { warmth: -0.4, boundary: -0.2 },
  "情商": { warmth: -0.5 }, "逃避": { warmth: -0.4, boundary: -0.3 },
  "承诺": { warmth: -0.3, romance: -0.3 }, "空头支票": { romance: -0.4, money: -0.3 },
  "空想": { absurd: 0.4, control: -0.4 }, "没主见": { control: -0.6, warmth: -0.2 },
  "拖延": { control: -0.5, play: 0.2 }, "赖床": { control: -0.5, play: 0.2 },
  "减肥": { control: -0.4, play: 0.2 }, "路怒": { warmth: -0.4, control: 0.3 },
  "戏精": { absurd: 0.5, meme: 0.3, warmth: -0.2 }, "好胜": { control: 0.5, play: 0.3 },
  "猜心": { warmth: -0.4, control: 0.3 }, "陷阱": { warmth: -0.4, control: 0.3 },
  // —— 金钱（高/低两向补齐）——
  "抠门": { money: 0.7, warmth: -0.2 }, "精打细算": { money: 0.6, control: 0.3 },
  "剁手": { money: -0.7, play: 0.2 }, "月光": { money: -0.6 },
  "骗钱": { money: -0.6, boundary: -0.5 }, "AA到底": { money: 0.5, boundary: 0.4 },
  "AA": { money: 0.4, boundary: 0.4 }, "化妆": { money: -0.3, romance: 0.2 },
  "自拍": { romance: -0.3, meme: 0.3 }, "自拍瘾": { meme: 0.4, romance: -0.2 },
  // —— 边界（补高向：过度边界=疏离/独立/极简；及低向新增）——
  "边界感": { boundary: 0.8 }, "分寸": { boundary: 0.7, warmth: 0.2 },
  "疏离": { boundary: 0.6, warmth: -0.5 }, "独立": { boundary: 0.5, control: 0.2 },
  "极简": { boundary: 0.4, control: 0.4 }, "断舍离": { boundary: 0.4, control: 0.4 },
  "藏手机": { boundary: -0.7, warmth: -0.3 }, "渣": { boundary: -0.8, romance: -0.4 },
  "渣男语录": { boundary: -0.6, warmth: -0.4 }, "口是心非": { warmth: -0.3, boundary: -0.2 },
  // —— 情绪价值（补高向：暖/居家/宠物）——
  "暖男": { warmth: 0.8 }, "居家男": { warmth: 0.5, play: -0.4 },
  "养绿植": { warmth: 0.4, absurd: 0.3 }, "宠物优先": { warmth: 0.4, romance: -0.3 },
  "姐姐": { control: 0.5, warmth: 0.3 }, "冷漠": { warmth: -0.8 },
  "钝感": { warmth: -0.5, absurd: -0.2 }, "自我感动": { warmth: -0.3, absurd: 0.3 },
  "直男关怀": { warmth: -0.3, romance: -0.4 },
  // —— 玩心（补低向：宅/躺平/社恐）——
  "宅": { play: -0.7 }, "躺平": { play: -0.5, control: -0.3 },
  "无趣": { play: -0.5, warmth: -0.3 }, "社恐": { play: -0.4, warmth: -0.2 },
  "外包人生": { money: -0.4, play: -0.2 }, "好胜整活": { play: 0.4, absurd: 0.4 },
  // —— 掌控 / 强迫 / 服从（高低两向）——
  "掌控": { control: 0.8, boundary: -0.2 }, "强迫症": { control: 0.6, boundary: -0.2 },
  "洁癖": { boundary: -0.5, control: 0.4 }, "整理癖": { control: 0.5, boundary: -0.2 },
  "规矩": { control: 0.6 }, "安全感": { control: 0.4, warmth: -0.2 },
  "囤积": { boundary: -0.2, control: -0.3 }, "上交工资": { control: -0.4, money: -0.2 },
  "服从": { control: -0.5, warmth: 0.2 }, "受虐倾向": { control: -0.5, play: 0.3 },
  "养成": { control: 0.6, romance: -0.2 },
  // —— 抽象 / 玄学（补低向：较真/扫兴/古板）——
  "玄学": { absurd: 0.7, romance: 0.2 }, "赛博玄学": { absurd: 0.5, meme: 0.4 },
  "养生朋克": { absurd: 0.4, meme: 0.3 }, "中二": { absurd: 0.7, play: 0.3 },
  "脑洞": { absurd: 0.6, play: 0.3 }, "饮食": { absurd: 0.3, control: 0.3 },
  "挑食": { control: 0.3, absurd: 0.3 }, "睡眠": { absurd: 0.3 },
  "洗澡": { boundary: -0.3, absurd: 0.2 }, "冥想": { absurd: 0.4, control: 0.3 },
  "日记": { romance: 0.3, absurd: 0.3 }, "恐怖片": { play: 0.4, absurd: 0.3 },
  "较真": { absurd: -0.4, control: 0.3 }, "扫兴": { warmth: -0.4, absurd: -0.4 },
  "古板": { absurd: -0.6, meme: -0.3 }, "反转": { absurd: 0.3, play: 0.2 },
  // —— 网感（补低向：网络绝缘/老梗/直男穿搭）——
  "网络绝缘": { meme: -0.7 }, "老梗": { meme: -0.5 }, "土味": { meme: -0.4, absurd: 0.2 },
  "梗王": { meme: 0.8, play: 0.3 }, "跟风": { meme: 0.5, absurd: 0.2 },
  "直男穿搭": { romance: -0.3, meme: -0.3 }, "钢铁直男": { romance: -0.4, meme: -0.2 },
  "时尚名片": { meme: 0.4, absurd: 0.3 }, "吃瓜": { meme: 0.5, boundary: -0.3 },
  "直播": { boundary: -0.5, meme: 0.3 }, "黑话": { meme: 0.4, absurd: 0.3 },
  "淋文化": { meme: 0.5, absurd: 0.4 }, "照骗": { romance: -0.4, meme: 0.2 },
  "退圈": { boundary: -0.4, play: 0.3 }, "体育生": { play: 0.4, romance: 0.2 },
  "掰弯": { play: 0.5, boundary: -0.3 }, "铁T": { control: 0.4, romance: 0.2 },
  "不分": { absurd: 0.3, play: 0.2 }, "装1": { absurd: 0.3, meme: 0.2 },
  "轮班表": { control: 0.4, play: 0.3 }, "资源": { boundary: -0.6, play: 0.3 },
  // —— 成人向（R6 §1.1 方向；隐蔽化词=行为落到 play/control/absurd/romance）——
  "性癖": { romance: 0.4, absurd: 0.4 }, "性偏好": { romance: 0.4, absurd: 0.4 },
  "性观念": { absurd: 0.4, romance: 0.3 }, "恋物": { romance: 0.4, absurd: 0.4 },
  "恋足": { romance: 0.4, absurd: 0.4 }, "制服控": { romance: 0.4, absurd: 0.4 },
  "角色扮演": { play: 0.5, absurd: 0.4 }, "道具": { play: 0.5, absurd: 0.4 },
  "SM隐蔽": { control: 0.6, play: 0.3 }, "床事掌控": { control: 0.6, play: 0.3 },
  "spank": { control: 0.6, play: 0.3 }, "女王": { control: 0.7, play: 0.3 },
  "标记癖": { control: 0.5, boundary: -0.4 }, "偷录": { boundary: -0.6, control: 0.4 },
  "四爱": { control: 0.4, absurd: 0.3 }, "约炮": { boundary: -0.8, play: 0.4 },
  "约炮软件": { boundary: -0.7, play: 0.4 }, "小蓝": { boundary: -0.7, play: 0.4 },
  "裸露": { boundary: -0.5, play: 0.3 }, "裸睡": { boundary: -0.4, play: 0.2 },
  "开放关系": { boundary: -0.6, romance: -0.3 }, "大尺度": { boundary: -0.5, meme: 0.3 },
  "纹身": { boundary: -0.4, play: 0.3 }, "露骨": { boundary: -0.4, absurd: 0.3 },
  "直球": { boundary: -0.4, warmth: 0.2 }, "黄腔": { meme: 0.4, absurd: 0.3 },
  "重口": { absurd: 0.4, boundary: -0.3 }, "屁": { boundary: -0.4, absurd: 0.3 },
  "屎尿": { boundary: -0.6 },
});

// 身份类 tag 只描述「喜欢谁」，绝不进入人格计算（V1 红线沿用）
const IDENTITY_ONLY_TAGS = new Set(["gay", "lesbian", "lgbt", "lgbtq", "性向", "同性恋", "双性恋", "跨性别", "非二元", "圈内角色", "模棱两可"]);

/* ================================================================
 * 三、相处细节池（发散层，与题库不直接关联）
 * d: 关联维度（"any"=不限维度）；t: 偏好档位(high/low/any)；
 * m: 适用模组。缺省(无 m)=仅 lover 恋爱兜底，绝不泄漏到 boss/teacher/roommate/agent/bestie；
 *    非 lover 模组只会抽到「该模组专属」或「显式标了宽 m 的真中性」条目 → 0 条恋爱味。
 * ================================================================ */
const ALL_MODULES = Object.freeze(["lover", "boss", "agent", "roommate", "teacher", "bestie"]);
const CASUAL_MODULES = Object.freeze(["lover", "roommate", "bestie"]); // 平辈相处、无恋爱语义的真中性条目
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
  { d: "boundary", t: "high", m: ALL_MODULES, text: "TA记得你所有的雷点，绕着走的路线比导航还精确。" },
  { d: "boundary", t: "high", text: "你们吵架从不翻旧账，因为TA把旧账都归档进了一个叫「已结案」的备忘录。" },
  { d: "boundary", t: "high", text: "TA从不看你手机，你主动递过去时TA还会把头扭开：「我不看，你自己留着。」" },
  { d: "boundary", t: "high", m: ALL_MODULES, text: "TA的秘密保鲜期是永久：你三年前说漏嘴的糗事，至今没有第三个人知道。" },
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
  { d: "play", t: "high", m: CASUAL_MODULES, text: "周二晚上TA会突然说「走，去看海」，你到了才发现是海底捞。" },
  { d: "play", t: "high", m: CASUAL_MODULES, text: "TA能把超市采购变成竞技项目，输的人推购物车。" },
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
  { d: "warmth", t: "any", m: CASUAL_MODULES, text: "TA吵架吵到一半会突然去给你倒水，因为「吵架费嗓子」。" },
  { d: "warmth", t: "any", m: ALL_MODULES, text: "TA嘴上嫌弃你的一百件小事，但别人只要提一件，TA能护短护到拉黑对方。" },
  { d: "romance", t: "any", m: ["lover"], text: "TA的手机里有个文件夹专存你发过的语音，说是「防止哪天你不理TA」。" },
  { d: "warmth", t: "any", text: "你生病时TA会变成另一个人：平时的懒散全没了，量体温像在执行军事任务。" },
  { d: "boundary", t: "any", m: ALL_MODULES, text: "TA会记住你不吃香菜这件事，比记住TA自己的银行卡密码还牢。" },
  { d: "romance", t: "any", m: ["lover"], text: "你们的合照TA从不发朋友圈，但TA的相册按月份给你单独建了文件夹。" },
  { d: "warmth", t: "any", m: ["lover"], text: "TA睡觉会抢被子，但半夜醒来发现你没盖好，会把抢来的又全还给你。" },
  { d: "absurd", t: "any", text: "TA的道歉从来不说对不起——TA会做你最爱吃的那道菜，摆盘摆成一个「歉」字，还写错。" },
  { d: "play", t: "any", m: CASUAL_MODULES, text: "你减肥的时候TA陪你吃草；你放弃的时候，TA的炸鸡已经在路上了。" },
  { d: "meme", t: "any", m: CASUAL_MODULES, text: "TA给你起的外号有一整套世界观，外人听了完全不知道你们在说什么。" },
  { d: "control", t: "any", text: "TA有一个专门的清单记你随口许过的愿，完成一条划一条，从不邀功。" },
  { d: "money", t: "any", m: CASUAL_MODULES, text: "TA请客从不看价格，AA的时候却能精确到谁多喝了半杯。" },
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
  // —— boss 补齐（职场上司味，横跨多维度 high/low，无恋爱暗示）——
  { d: "boundary", t: "high", m: ["boss"], text: "TA下班后从不在群里@你，TA说「工资买的是工时，不是你的后半夜」。" },
  { d: "boundary", t: "low", m: ["boss"], text: "TA办公室的门永远虚掩着，你有事直接推门进去，不用先发三条消息层层预约。" },
  { d: "money", t: "high", m: ["boss"], text: "报销单在TA手里从不过夜，签字前只看一眼：「该花的钱，别替公司省。」" },
  { d: "money", t: "low", m: ["boss"], text: "团建TA自掏腰包加菜，理由是「预算是死的，你们几个是活的」。" },
  { d: "control", t: "high", m: ["boss"], text: "TA派活永远附一份拆到步骤的说明，从不用「你自己看着办」把锅甩给你。" },
  { d: "control", t: "low", m: ["boss"], text: "TA把项目交给你就真放手，只在你求助时出现，从不半路空降指挥。" },
  { d: "play", t: "high", m: ["boss"], text: "上线那天TA订一桌火锅，把工牌往桌上一拍：「今晚谁提工作谁买单。」" },
  { d: "warmth", t: "high", m: ["boss"], text: "你方案被甲方骂了，TA先挡在中间，回头才关起门跟你复盘哪里能更好。" },
  { d: "absurd", t: "high", m: ["boss"], text: "TA的白板上除了排期，还画着一只越来越胖的部门吉祥物，谁完成KPI谁给它添一笔。" },
  { d: "meme", t: "high", m: ["boss"], text: "TA在工作群甩的表情包比实习生还新，但一到发工资那天从不迟一秒。" },
  // —— agent 补齐（AI 搭档味）——
  { d: "boundary", t: "high", m: ["agent"], text: "TA读得到你全部历史对话，却从不主动翻旧账，除非你自己点开那条记录。" },
  { d: "boundary", t: "low", m: ["agent"], text: "TA记得你每一个提示词偏好，你换了话题都不用重新解释，TA接着上文就懂。" },
  { d: "warmth", t: "high", m: ["agent"], text: "你深夜说「今天好累」，TA不劝你早睡，只把明天的日程默默往后挪了一小时。" },
  { d: "warmth", t: "low", m: ["agent"], text: "TA不会安慰，但你崩溃时TA会把任务拆到最小的一步：「先做这一件就好。」" },
  { d: "money", t: "high", m: ["agent"], text: "TA帮你比完三家价再下单，顺手把没用的订阅退了，省下的钱列成清单给你看。" },
  { d: "control", t: "high", m: ["agent"], text: "TA把你混乱的待办自动排好优先级，但每条都留着可编辑，从不擅自替你删。" },
  { d: "control", t: "low", m: ["agent"], text: "TA给建议永远加一句「最终你说了算」，你否掉TA的方案，TA立刻换下一个。" },
  { d: "play", t: "high", m: ["agent"], text: "你让TA正经写周报，TA写完还附赠一版阴阳怪气的吐槽版，标注「仅供你自己乐」。" },
  { d: "absurd", t: "high", m: ["agent"], text: "你半夜问「人为什么要上班」，TA真的分三个论点认真答，最后一句是「建议先睡」。" },
  { d: "meme", t: "high", m: ["agent"], text: "TA接得住你所有的梗，还能反手造一个新的，冷场时用颜文字给你递台阶。" },
  // —— roommate 补齐（合租味）——
  { d: "warmth", t: "high", m: ["roommate"], text: "你加班到深夜回家，玄关的灯TA永远给你留着，桌上还扣着一碗没凉透的汤。" },
  { d: "warmth", t: "low", m: ["roommate"], text: "TA不问你为什么心情差，只是把客厅让给你，自己戴上耳机回房，还你一整个安静的夜。" },
  { d: "boundary", t: "high", m: ["roommate"], text: "TA进你房间前一定敲门，哪怕门开着；你的外卖TA从不拆，哪怕放到凉。" },
  { d: "boundary", t: "low", m: ["roommate"], text: "冰箱贴着一张便利贴：「贴名字的别动，没贴的随便吃」——你那格从来没被越界过。" },
  { d: "money", t: "high", m: ["roommate"], text: "水电燃气TA用一张共享表算得清清楚楚，多退少补到小数点后一位，从不含糊。" },
  { d: "money", t: "low", m: ["roommate"], text: "你手头紧那个月，TA把房租的事轻描淡写带过：「先欠着，反正你跑不了。」" },
  { d: "play", t: "high", m: ["roommate"], text: "周末TA能把客厅改造成火锅局、观影厅或麻将馆，你只负责出现和吃。" },
  { d: "control", t: "high", m: ["roommate"], text: "TA排了张谁倒垃圾谁擦灶台的轮值表贴冰箱上，自己那栏永远第一个打勾。" },
  { d: "absurd", t: "high", m: ["roommate"], text: "你俩给家里每件电器都起了名字，洗衣机罢工那天一起对它做了三分钟思想工作。" },
  { d: "meme", t: "high", m: ["roommate"], text: "TA在合租群里的发言全是表情包，但你没带钥匙那次，TA十分钟从公司杀回来开门。" },
  // —— teacher 补齐（师生味）——
  { d: "warmth", t: "high", m: ["teacher"], text: "你举手答错，TA先把你那句里对的一半拎出来夸，再不动声色地把错的那半掰回来。" },
  { d: "warmth", t: "low", m: ["teacher"], text: "TA不当众表扬你，但你的作文被红笔圈了一整段，页脚一行小字：「留着，以后会用上。」" },
  { d: "boundary", t: "high", m: ["teacher"], text: "TA办公室的门永远开着，但你没交的周记TA绝不翻，宁可等你自己交上来。" },
  { d: "money", t: "high", m: ["teacher"], text: "班费TA从不经手，全部公示在墙上，一支粉笔的支出都记得明明白白。" },
  { d: "money", t: "low", m: ["teacher"], text: "TA的抽屉里常年备着几袋面包，谁没吃早饭TA看得出来，也从不点破。" },
  { d: "play", t: "high", m: ["teacher"], text: "TA能把一节枯燥的课上成脱口秀，下课铃响时全班都在喊「再讲五分钟」。" },
  { d: "control", t: "high", m: ["teacher"], text: "TA的复习计划精确到每一天，却总在最后留一句：「学不动就休息，人比分数重要。」" },
  { d: "control", t: "low", m: ["teacher"], text: "TA从不逼你选文理，只把两条路讲清楚，然后说「你自己走的路才算数」。" },
  { d: "absurd", t: "high", m: ["teacher"], text: "TA讲物理会突然扯到「人要能瞬移，早自习迟到就说不过去了」，全班笑完真记住了公式。" },
  { d: "meme", t: "high", m: ["teacher"], text: "TA的PPT里藏着当下最新的梗图，你们以为TA不懂，结果TA比课代表还会玩。" },
  // —— bestie 满分闺蜜（好姐妹/搭子味，无恋爱暗示）——
  { d: "warmth", t: "high", m: ["bestie"], text: "你一条「在吗」发过去，TA的语音已经打回来，第一句永远是「谁惹你了报名字」。" },
  { d: "warmth", t: "low", m: ["bestie"], text: "TA不会说漂亮话，但你被甩那晚，TA拎着两瓶酒和一整箱纸巾直接堵在你家门口。" },
  { d: "warmth", t: "any", m: ["bestie"], text: "你俩三天两头吵架拉黑，但下顿饭永远还是坐在一起，谁也没真删过谁。" },
  { d: "boundary", t: "high", m: ["bestie"], text: "你醉后说的胡话TA第二天绝口不提，只默默把你发出去的黑历史朋友圈帮你删了。" },
  { d: "boundary", t: "low", m: ["bestie"], text: "TA的衣柜就是你的第二衣柜，口红随便试面膜随便敷，回头还怪你不常来拿。" },
  { d: "money", t: "high", m: ["bestie"], text: "吃饭TA抢着买单，转头把你随口看中的那条裙子偷偷加进购物车寄到你家。" },
  { d: "money", t: "low", m: ["bestie"], text: "TA月底吃土也要凑你的生日局，AA时却把你那份悄悄划到自己名下。" },
  { d: "play", t: "high", m: ["bestie"], text: "说走就走是你俩的常态：周五下班一条消息，周六就在另一座城市的夜市上啃串。" },
  { d: "play", t: "low", m: ["bestie"], text: "TA不爱折腾，但你想蹦迪、想拍照、想通宵聊天，TA眼皮打架也陪你到天亮。" },
  { d: "control", t: "high", m: ["bestie"], text: "你纠结到崩溃时，TA一句「听我的」直接拍板，事后证明TA的选择总是对的。" },
  { d: "control", t: "low", m: ["bestie"], text: "TA从不替你做决定，只在你被人PUA时冷冷补一句「这种人，拉黑」。" },
  { d: "absurd", t: "high", m: ["bestie"], text: "你俩的聊天框全是只有彼此看得懂的黑话，外人截图出去都拼不出一句完整人话。" },
  { d: "meme", t: "high", m: ["bestie"], text: "你发一张丑照，TA能秒回一张更丑的自拍——你们的友谊建立在互相伤害之上。" },
]);

/* ================================================================
 * 四、模组模板（满分爱人/老板/Agent/室友/老师）
 * key 与题库 V2 对齐：lover / boss / agent / roommate / teacher
 * ================================================================ */
export const MODULE_KEYS = Object.freeze(["lover", "boss", "agent", "roommate", "teacher", "bestie"]);

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
  bestie: {
    key: "bestie", name: "满分闺蜜", role: "满分闺蜜",
    waiting: { any: "你的闺蜜来咯🪽🪽" },
    intros: [
      "闺蜜雷达锁定完毕，你的满分闺蜜空降：一位「{A}」。",
      "全世界最懂你的搭子已就位，你的满分闺蜜画像出炉：「{A}」。",
    ],
    outros: [
      "——这份鉴定由你俩的每一条聊天记录和今晚的分数共同背书。",
      "有事没事都能喊的那个人，就是TA了。",
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
  bestie: [
    "住你楼下的头号搭子 · 随叫随到",
    "你的24小时吐槽热线接线员",
    "衣柜和秘密都对你敞开的那个人",
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
  const rankOf = (dim) => {
    const i = ranked.findIndex((r) => r.key === dim);
    return i === -1 ? 99 : i;
  };
  const tierOk = (d) => {
    if (d.d === "any") return true;
    const tier = dimTier(scores[d.d] ?? 0);
    return d.t === "any" || d.t === tier;
  };
  // 隔离红线：无 m 的条目（恋爱口吻）只进 lover；非 lover 只能拿到
  // 「该模组专属(m 含它)」或「显式标了宽 m 的真中性」条目 → 结构上 0 条恋爱味。
  const allowed = (d) => (Array.isArray(d.m) ? d.m.includes(module) : module === "lover");
  const candidates = DETAIL_POOL.filter((d) => allowed(d) && tierOk(d));
  // 模组专属（窄 m，含当前非 lover 模组）优先，再按维度突出度排序，兼顾语气契合与分数响应。
  const isSpecific = (d) =>
    module !== "lover" && Array.isArray(d.m) && d.m.length <= 2 && d.m.includes(module);
  const sorted = [...candidates].sort((a, b) => {
    const sa = isSpecific(a) ? 0 : 1;
    const sb = isSpecific(b) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return rankOf(a.d) - rankOf(b.d);
  });
  // 确定性抽取 5 条：起点落在「专属区」内，顺序游走，保证多样又稳定。
  const specificCount = sorted.filter(isSpecific).length;
  const span = module !== "lover" && specificCount > 0 ? specificCount : sorted.length;
  const off = span > 0 ? hashStr(String(seed) + module) % span : 0;
  const picked = [];
  for (let i = 0; i < sorted.length && picked.length < 5; i++) {
    const t = sorted[(i + off) % sorted.length].text;
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

// 立绘人物性别描述（有脸、年轻、好看，符合年轻人审美）
const FIGURE_DESC = Object.freeze({
  m: "a good-looking young man in his twenties",
  f: "a pretty young woman in her twenties",
  n: "an attractive androgynous young adult",
});

// 决定立绘人物的性别：lover 跟随取向；bestie 只出女；boss/teacher/roommate/agent 按
// (module, seed) 随机男/女，避免常年出男图。返回 "m" | "f" | "n"。
function pickFigureGender(module, seeking, genderPreference, seed) {
  const norm = (g) => (g === "m" || g === "masc") ? "m" : (g === "f" || g === "femme") ? "f" : "n";
  if (module === "bestie") return "f";
  if (module === "lover") return norm(SEEKING_TO_GENDER[seeking] || genderPreference);
  // % 100 < 50 比 % 2 低位分布更均匀，避免同类 seed 常年偏男。
  return (hashStr(String(seed) + "fig" + module) % 100 < 50) ? "m" : "f";
}

export function buildIdealProfile({ records, genderPreference, seeking, seed }) {
  seed = String(seed ?? "ideal-default");
  const genderKey = SEEKING_TO_GENDER[seeking] || genderPreference;
  const recList = Array.isArray(records) ? records : [];
  const scores = computeDimensions(recList);
  const ranked = DIM_KEYS.map((k) => ({ key: k, score: scores[k] }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const top1 = ranked[0] || { key: "warmth", score: 0.3 };
  const top2 = ranked[1] || { key: "play", score: 0.2 };
  // TYPE-16（R8）：称号 = 型号名，不再自由拼装
  const type = classifyType16(scores);
  const archetype = type.name;

  const mbti = MBTI_MAP.map((fn) => fn(scores)).join("");
  const occupList = OCCUPATIONS[top2.key] || OCCUPATIONS.play;
  const occupation = seedPick(occupList, seed + "occ");

  const module = recList[0]?.question?.module || "lover";
  const details = pickDetails(scores, genderPreference, seed, recList, module);

  const figGender = pickFigureGender(module, seeking, genderPreference, seed);
  const figure = FIGURE_DESC[figGender] || FIGURE_DESC.n;
  const dimDesc = `${DIMENSION_LABELS[top1.key] || "charm"}-focused, ${DIMENSION_LABELS[top2.key] || "playful"}`;
  // 生图 V4（Kim 推翻旧「无脸抽象」决策）：人物要有清晰的脸和五官、年轻好看、
  // 符合当下年轻人审美；保留 Kim 满意的精致霓虹赛博酒吧背景与氛围；
  // 继续用 dimDesc（top 维度）让人物气质呼应画像分布。
  const prompt = `clean modern character illustration of ${figure}, clear detailed attractive face with well-defined expressive features, trendy good-looking youthful appearance that appeals to young adults, ${dimDesc} temperament shown in the eyes and posture, stylish fashionable outfit, soft cel-shaded semi-realistic anime art style, standing in a highly detailed intricate neon cyberpunk bar background full of glowing signs and moody atmospheric lighting, cinematic depth of field, vibrant saturated colors, no text`;

  const encodedPrompt = encodeURIComponent(prompt);
  const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&seed=${hashStr(seed) % 99999}&referrer=idealtype&nologo=true`;
  // 兜底立绘：更短的 prompt + 不同 seed，主图挂了再试一次（同样有脸、年轻、保留霓虹酒吧背景）
  const fallbackUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(`clean modern illustration of ${figure} with a clear pretty detailed face, youthful stylish good-looking look, detailed neon cyberpunk bar background`)}?width=512&height=512&seed=${(hashStr(seed + "fb") % 99999)}&referrer=idealtype&nologo=true`;

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
    typeCode: type.code, typeName: type.name,
    presentation, birthDate, zodiac, identity, bio, keywords,
    fictional: true,
  };
  const relationship = { details, heading, chemistry, coreText };

  return {
    portrait,
    matchCard,
    relationship,
    coreText,
    type: { id: type.id, code: type.code, key: type.key, name: type.name, family: type.family, hidden: type.hidden },
    stages: [
      { id: "portrait", title: "理想型立绘", data: { prompt, imageUrl, archetype, palette } },
      { id: "profile", title: "相亲档案", data: { archetype, mbti, occupation, presentation, birthDate, zodiac, identity, keywords, typeCode: type.code, typeName: type.name } },
      { id: "relationship", title: "相处细节", data: { details, heading, chemistry } },
    ],
  };
}

