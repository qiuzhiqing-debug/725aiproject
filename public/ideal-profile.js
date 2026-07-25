const PROFILE_VERSION = "ideal-profile-v2";

const ARCHETYPE_LIST = [
  {
    id: "power-ceo",
    label: "高压掌舵者",
    shortLabel: "霸总挂",
    identity: "把全场节奏握在手里的决策者",
    visualSignature: "利落肩线、克制表情、像刚结束一场董事会",
    visualPrompt: "commanding adult with sharp clean facial features, controlled gaze, immaculate tailored silhouette, quiet authority",
    scenePrompt: "a bright architectural penthouse with white stone and electric-blue light panels",
    tags: ["霸总", "职场", "钱", "精英", "控制", "总裁", "权力", "事业"],
    occupations: ["新消费品牌联合创始人", "投资机构合伙人", "科技公司战略负责人", "建筑集团项目总监"],
    keywords: ["行动派", "边界清楚", "护短", "高标准"],
    relationshipBeats: [
      "TA 会把约会排进最高优先级，临时会议也得给你让路。",
      "吵架时 TA 先解决问题，等你消气后再把情绪一条条接住。",
      "朋友面前冷得像发布会，转身却记得你喝什么温度的水。",
      "你说一句想见面，TA 的车已经停在楼下。",
    ],
  },
  {
    id: "sunny-puppy",
    label: "直球陪伴者",
    shortLabel: "小奶狗挂",
    identity: "把喜欢写在脸上的快乐充电器",
    visualSignature: "蓬松发梢、明亮眼神、笑起来没有防备",
    visualPrompt: "radiant adult with soft layered hair, open bright eyes, an unguarded smile, athletic youthful energy without looking underage",
    scenePrompt: "a sunlit white studio with cobalt-blue blocks and a vivid citrus accent",
    tags: ["纯爱", "可爱", "黏人", "陪伴", "体贴", "恋爱脑", "小奶狗", "直球"],
    occupations: ["运动康复师", "纪录片剪辑师", "宠物友好空间主理人", "户外社群运营"],
    keywords: ["直球", "高回应", "会撒娇", "情绪透明"],
    relationshipBeats: [
      "TA 每次见你都像久别重逢，开心这件事完全藏不住。",
      "你发一个句号，TA 能回三条语音确认你是不是累了。",
      "冷战在你们这里活不过十分钟，因为 TA 会先抱着枕头来投降。",
      "TA 的相册里你永远是置顶，丑照也被夸得很认真。",
    ],
  },
  {
    id: "steady-guardian",
    label: "年上守护者",
    shortLabel: "爹系挂",
    identity: "稳定得像随身携带的安全屋",
    visualSignature: "成熟轮廓、平静目光、衣领和袖口永远妥帖",
    visualPrompt: "mature adult with composed features, calm protective gaze, understated confidence, elegant long coat and impeccable cuffs",
    scenePrompt: "a high-key white hotel lobby with cobalt glass, daylight and crisp cinematic shadows",
    tags: ["年上", "稳重", "照顾", "安全感", "成熟", "家务", "爹系", "靠谱"],
    occupations: ["建筑事务所项目主理人", "品牌法务负责人", "城市规划顾问", "精品酒店运营总监"],
    keywords: ["稳定", "会照顾人", "耐心", "说到做到"],
    relationshipBeats: [
      "TA 不替你做决定，但会把每条退路都提前铺好。",
      "你喝多时只需要报位置，剩下的事 TA 已经安排完。",
      "TA 很少说漂亮话，却会在你忙到忘记吃饭时准时出现。",
      "你的狼狈不会被评判，只会被安静接住。",
    ],
  },
  {
    id: "frost-scholar",
    label: "清冷解题者",
    shortLabel: "学神挂",
    identity: "看起来难接近，实际上把你研究得最认真",
    visualSignature: "冷白感轮廓、专注眼神、极简层次穿搭",
    visualPrompt: "cool intellectual adult with refined features, focused distant gaze, minimalist styling, subtle rimless glasses, precise posture",
    scenePrompt: "a luminous white research library with electric-blue translucent shelves and hard-edged daylight",
    tags: ["学神", "学习", "知识", "理性", "清冷", "AI", "科技", "聪明"],
    occupations: ["人工智能研究员", "材料工程师", "大学青年讲师", "数据产品架构师"],
    keywords: ["高智感", "慢热", "专注", "反差温柔"],
    relationshipBeats: [
      "TA 不会说土味情话，但会认真研究你为什么不开心。",
      "你随口提过的小事，会在几周后以完整解决方案回到你手里。",
      "外人只见过 TA 的礼貌，你见过 TA 因为你笑到失去表情管理。",
      "你们最浪漫的时刻，可能是并肩安静做各自的事。",
    ],
  },
  {
    id: "wild-charmer",
    label: "痞帅破局者",
    shortLabel: "浪子挂",
    identity: "看似不按牌理，关键时刻从不掉链子",
    visualSignature: "凌乱发丝、半笑眼神、松弛但有攻击性的轮廓",
    visualPrompt: "charismatic adult with tousled hair, a dangerous half-smile, relaxed confident posture, rebellious edge with a trustworthy gaze",
    scenePrompt: "a bright white rooftop at noon with saturated cobalt signage and one neon-red graphic plane",
    tags: ["浪子", "痞帅", "冒险", "夜生活", "抽象", "自由", "社牛", "刺激"],
    occupations: ["户外品牌创意总监", "现场音乐制作人", "自由摄影师", "赛车工程师"],
    keywords: ["松弛", "会玩", "反套路", "关键时刻靠谱"],
    relationshipBeats: [
      "TA 能把普通周二过成公路电影，但回家时间会主动报备。",
      "你负责提出离谱想法，TA 负责把它安全落地。",
      "TA 嘴上总爱逗你，真正的边界却守得比谁都清楚。",
      "全场都以为 TA 不认真，只有你知道每次承诺 TA 都记得。",
    ],
  },
  {
    id: "gentle-artist",
    label: "温柔造梦者",
    shortLabel: "艺术家挂",
    identity: "能把琐碎日常过成独家展览的人",
    visualSignature: "舒展眉眼、流动衣料、手指和配饰带一点创作痕迹",
    visualPrompt: "gentle artistic adult with expressive eyes, elegant hands, softly textured hair, fluid fashion silhouette, quietly magnetic presence",
    scenePrompt: "a brilliant white gallery with cobalt-blue sculptures, coral accent panels and clean daylight",
    tags: ["艺术", "文艺", "浪漫", "审美", "音乐", "电影", "温柔", "创作"],
    occupations: ["独立策展人", "舞台美术设计师", "声音艺术创作者", "香氛品牌创意主理人"],
    keywords: ["共情", "会表达", "浪漫", "审美在线"],
    relationshipBeats: [
      "TA 会把你说过的梦画进下一件作品，却不会在公众面前解释。",
      "你们的纪念日不靠昂贵礼物，而靠只有彼此看得懂的细节。",
      "TA 能听出你一句没事里的停顿，然后陪你把情绪慢慢说完。",
      "和 TA 生活久了，连便利店夜宵都像电影片尾。",
    ],
  },
];

export const ARCHETYPES = Object.freeze(
  Object.fromEntries(ARCHETYPE_LIST.map((item) => [item.id, Object.freeze(item)]))
);

export const MBTI_STYLES = Object.freeze({
  INTJ: { primary: "#164BFF", secondary: "#F7FAFF", accent: "#00D7FF", outfit: "architectural cobalt suit over a pure white high-neck layer", mood: "冷静蓝图" },
  INTP: { primary: "#006CFF", secondary: "#FFFFFF", accent: "#65F5FF", outfit: "minimal ultramarine technical jacket with crisp white layers", mood: "理性漫游" },
  ENTJ: { primary: "#071A52", secondary: "#FFFFFF", accent: "#2F6BFF", outfit: "deep navy power tailoring with a sharp electric-blue accent", mood: "强势秩序" },
  ENTP: { primary: "#171C26", secondary: "#F8FFFA", accent: "#B8FF2C", outfit: "graphic ink-black tailoring with one acid-lime statement detail", mood: "破局实验" },
  INFJ: { primary: "#8E1B3D", secondary: "#FFFFFF", accent: "#39D8FF", outfit: "clean burgundy draping with a cool cyan jewel accent", mood: "深层共鸣" },
  INFP: { primary: "#EF5D68", secondary: "#F9FCFF", accent: "#146BFF", outfit: "soft coral tailoring with a vivid cobalt-blue inner layer", mood: "柔软理想" },
  ENFJ: { primary: "#C61C70", secondary: "#FFFFFF", accent: "#004CFF", outfit: "confident magenta coat with a precise royal-blue accent", mood: "耀眼共情" },
  ENFP: { primary: "#F05223", secondary: "#FFFFFF", accent: "#00CFE8", outfit: "bright tangerine statement jacket with clean cyan details", mood: "热烈灵感" },
  ISTJ: { primary: "#12326B", secondary: "#FFFFFF", accent: "#2C77FF", outfit: "disciplined navy tailoring with immaculate white structure", mood: "可靠坐标" },
  ISFJ: { primary: "#087A69", secondary: "#FFFFFF", accent: "#FF4F72", outfit: "polished emerald layers with one precise coral-red accent", mood: "安静守护" },
  ESTJ: { primary: "#0047CC", secondary: "#FFFFFF", accent: "#FF304F", outfit: "commanding royal-blue suit with a narrow signal-red detail", mood: "高效掌控" },
  ESFJ: { primary: "#E83F5B", secondary: "#FFFFFF", accent: "#0066FF", outfit: "bright coral-red tailoring with a clean cobalt accessory", mood: "温暖主场" },
  ISTP: { primary: "#242B33", secondary: "#FFFFFF", accent: "#37E06F", outfit: "graphite utility tailoring with a sharp neon-green technical accent", mood: "冷感行动" },
  ISFP: { primary: "#008A9A", secondary: "#FFFFFF", accent: "#FF6A55", outfit: "fluid teal fashion layers with a vivid coral accent", mood: "自由感官" },
  ESTP: { primary: "#D71936", secondary: "#FFFFFF", accent: "#1557FF", outfit: "bold signal-red jacket with a saturated blue structural layer", mood: "即刻心跳" },
  ESFP: { primary: "#E51B8D", secondary: "#FFFDF5", accent: "#FFD400", outfit: "high-impact fuchsia fashion with a clean yellow statement detail", mood: "全场焦点" },
});

const PRESENTATIONS = Object.freeze({
  masc: { label: "男性呈现", subject: "an adult man", names: ["沈砚", "周屿", "陆时序", "裴知白", "林越", "许铎", "程述", "江临"] },
  femme: { label: "女性呈现", subject: "an adult woman", names: ["许昼", "林栀", "程雾", "苏弥", "周遥", "沈澄", "陆弦", "江岚"] },
  androgynous: { label: "中性呈现", subject: "an androgynous adult", names: ["简川", "闻青", "时安", "顾野", "予川", "迟光", "云舟", "景和"] },
});

const PORTRAIT_FALLBACKS = Object.freeze({
  masc: "/assets/ideal/fallback-m.jpg",
  femme: "/assets/ideal/fallback-f.jpg",
  androgynous: "/assets/ideal/fallback-n.jpg",
});

const SAFE_TRAITS = Object.freeze({
  "纯爱": "直球纯爱",
  "抽象": "抽象幽默",
  "职场": "事业心",
  "钱": "金钱观",
  "怪癖": "生活怪癖",
  "浪漫": "仪式感",
  "艺术": "审美表达",
  "文艺": "文艺气质",
  "社牛": "社交能量",
  "宅": "独处需求",
  "家务": "生活能力",
  "AI": "科技浓度",
  "吃": "吃饭哲学",
  "短剧": "戏剧感",
  "控制": "掌控欲",
  "自由": "自由度",
  "温柔": "情绪照顾",
  "冒险": "冒险倾向",
});

const MBTI_SIGNALS = Object.freeze({
  E: ["社交", "社牛", "聚会", "热闹", "直球", "夜生活"],
  I: ["宅", "安静", "独处", "慢热", "清冷", "阅读"],
  N: ["抽象", "艺术", "文艺", "AI", "想象", "创作", "浪漫"],
  S: ["家务", "吃", "现实", "稳定", "实用", "生活"],
  T: ["理性", "职场", "钱", "逻辑", "科技", "控制"],
  F: ["温柔", "纯爱", "体贴", "陪伴", "情绪", "共情"],
  J: ["规划", "稳定", "靠谱", "秩序", "准时", "控制", "事业"],
  P: ["自由", "冒险", "抽象", "刺激", "即兴", "浪子"],
});

const DIMENSION_LABELS = Object.freeze({
  agency: "行动与掌控",
  warmth: "回应与共情",
  stability: "稳定与边界",
  intellect: "理性与智识",
  spontaneity: "自由与新鲜感",
  creativity: "审美与表达",
  sociability: "社交能量",
});

// These vectors describe relationship style, not gender or sexual orientation.
const ARCHETYPE_DIMENSIONS = Object.freeze({
  "power-ceo": Object.freeze({ agency: 1, warmth: -0.15, stability: 0.55, intellect: 0.3, spontaneity: -0.4, creativity: 0, sociability: 0.2 }),
  "sunny-puppy": Object.freeze({ agency: 0.1, warmth: 1, stability: 0.1, intellect: 0, spontaneity: 0.45, creativity: 0.15, sociability: 0.65 }),
  "steady-guardian": Object.freeze({ agency: 0.3, warmth: 0.7, stability: 1, intellect: 0.15, spontaneity: -0.5, creativity: 0, sociability: -0.15 }),
  "frost-scholar": Object.freeze({ agency: 0.1, warmth: 0.05, stability: 0.4, intellect: 1, spontaneity: -0.25, creativity: 0.25, sociability: -0.45 }),
  "wild-charmer": Object.freeze({ agency: 0.25, warmth: 0.05, stability: -0.45, intellect: 0, spontaneity: 1, creativity: 0.25, sociability: 0.8 }),
  "gentle-artist": Object.freeze({ agency: -0.1, warmth: 0.75, stability: 0.05, intellect: 0.1, spontaneity: 0.35, creativity: 1, sociability: 0.05 }),
});

// A positive weight means the scenario embodies the dimension. Because answer
// scores are centred at 5, rejecting a negative behaviour reverses its signal.
const TAG_DIMENSIONS = Object.freeze({
  "沟通": { warmth: -0.8 }, "情绪沟通": { warmth: -1, stability: -0.2 }, "敷衍": { warmth: -1 },
  "时间观念": { stability: -0.9 }, "记性": { stability: -0.7, warmth: -0.25 }, "选择困难": { agency: -0.7, stability: -0.2 },
  "生活习惯": { stability: -0.45 }, "卫生": { stability: -1 }, "外卖": { stability: -0.15 },
  "社交边界": { warmth: -0.5, stability: -0.9 }, "边界": { warmth: -0.35, stability: -0.8 }, "前任边界": { warmth: -0.45, stability: -1 },
  "账号边界": { warmth: -0.35, stability: -0.9 }, "性边界": { warmth: -0.6, stability: -1 }, "公开关系": { warmth: -0.7, stability: -0.55 },
  "隐私": { warmth: -0.75, stability: -0.8 }, "出柜隐私": { warmth: -0.85, stability: -0.9 }, "定位": { warmth: -0.55, stability: -0.7 },
  "公审": { warmth: -0.9, stability: -0.6 }, "双标": { warmth: -0.7, stability: -0.6 }, "甩锅": { warmth: -0.6, stability: -0.75 },
  "前任": { stability: -0.45 }, "前任同居": { stability: -0.9 }, "关系混乱": { stability: -1, spontaneity: 0.45 }, "海王": { stability: -1, sociability: 0.5 },
  "AI": { intellect: 1 }, "科技": { intellect: 1 }, "理性": { intellect: 0.85 }, "学习": { intellect: 0.9 }, "知识": { intellect: 0.9 },
  "职场": { agency: 0.8, stability: 0.45 }, "控制": { agency: 0.9, stability: 0.4, warmth: -0.2 }, "控制欲": { agency: 1, stability: 0.45, warmth: -0.3 },
  "量化恋爱": { intellect: 0.5, agency: 0.45, warmth: -0.35 }, "自律人设": { agency: 0.45, stability: 0.25 }, "金钱": { agency: 0.35, stability: 0.35 },
  "消费": { agency: 0.15, stability: -0.45 }, "择偶": { agency: 0.4, stability: 0.2 },
  "夜生活": { spontaneity: 0.9, sociability: 1, stability: -0.25 }, "圈内社交": { sociability: 0.75 }, "姬友": { sociability: 0.45 },
  "朋友圈": { sociability: 0.5, creativity: 0.15 }, "社交人设": { sociability: 0.45, creativity: 0.3, stability: -0.2 }, "人设": { sociability: 0.2, creativity: 0.35 },
  "附近的人": { sociability: 0.55, spontaneity: 0.5 }, "交友软件": { sociability: 0.55, spontaneity: 0.4 }, "兄弟闺蜜": { sociability: 0.45 },
  "旅游": { spontaneity: 0.65 }, "游戏": { spontaneity: 0.35, intellect: 0.15 }, "怪癖": { spontaneity: 0.65, stability: -0.3 },
  "抽象": { spontaneity: 0.75, creativity: 0.45 }, "自由": { spontaneity: 1 }, "冒险": { spontaneity: 1 }, "刺激": { spontaneity: 0.9 },
  "艺术": { creativity: 1 }, "文艺": { creativity: 0.9 }, "拍照": { creativity: 0.45 }, "照片": { creativity: 0.25 }, "合照": { creativity: 0.25, warmth: -0.2 },
  "表情包": { creativity: 0.45, spontaneity: 0.3 }, "剧透": { warmth: -0.35, intellect: 0.15 }, "短剧": { creativity: 0.55, spontaneity: 0.35 },
  "乙游": { creativity: 0.5, warmth: 0.2 }, "虚拟亲密": { creativity: 0.35, warmth: 0.15 }, "仪式感": { creativity: 0.65, warmth: 0.55 },
  "表演型人格": { creativity: 0.45, sociability: 0.4, warmth: -0.25 }, "主播": { sociability: 0.55 },
  "温柔": { warmth: 1 }, "体贴": { warmth: 0.9 }, "陪伴": { warmth: 0.85 }, "纯爱": { warmth: 0.8, stability: 0.35 },
  "稳定": { stability: 1 }, "靠谱": { stability: 0.9 }, "家务": { stability: 0.75 }, "规划": { agency: 0.45, stability: 0.7 },
});

// Identity describes who someone is attracted to, not what kind of partner they
// prefer. These tags are therefore deliberately excluded from personality math.
const IDENTITY_ONLY_TAGS = new Set(["gay", "lesbian", "lgbt", "lgbtq", "性向", "同性恋", "双性恋", "跨性别", "非二元", "圈内角色"]);

function hashString(value) {
  let hash = 0x811c9dc5;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function rngFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

function clampScore(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : 5;
}

function normalizeRecords(input) {
  const records = Array.isArray(input?.records)
    ? input.records
    : Array.isArray(input?.answers)
      ? input.answers
      : [];
  return records.slice(0, 20).map((record, index) => {
    const question = record?.question || {};
    const tags = Array.isArray(question.tags)
      ? question.tags
      : Array.isArray(record?.tags)
        ? record.tags
        : [];
    return {
      id: String(question.id || record?.questionId || `round-${index + 1}`).slice(0, 40),
      text: String(question.text || question.variant || record?.questionText || `第 ${index + 1} 题`).trim().slice(0, 100),
      score: clampScore(record?.score ?? record?.value),
      tags: tags.slice(0, 8).map((tag) => String(tag).trim().slice(0, 20)).filter(Boolean),
    };
  });
}

function normalizeGender(value) {
  const key = String(value || "any").trim().toLowerCase();
  if (["m", "male", "man", "masc", "男", "男性"].includes(key)) return "masc";
  if (["f", "female", "woman", "femme", "女", "女性"].includes(key)) return "femme";
  if (["n", "neutral", "nonbinary", "androgynous", "中性", "非二元"].includes(key)) return "androgynous";
  return "any";
}

function canonicalSeed(input, records, gender) {
  const publicRoundData = records.map((record) => `${record.id}:${record.score}`).join("|");
  const explicitSeed = input?.seed == null ? "" : String(input.seed).slice(0, 80);
  return `${PROFILE_VERSION}|${gender}|${publicRoundData || "empty"}|${explicitSeed}`;
}

function tagAffinity(records, keywords) {
  let result = 0;
  for (const record of records) {
    const haystack = record.tags.join("|").toLowerCase();
    const preference = (record.score - 5) / 5;
    for (const keyword of keywords) {
      if (haystack.includes(keyword.toLowerCase())) result += preference;
    }
  }
  return result;
}

function roundMetric(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function dimensionsFor(records) {
  const totals = Object.fromEntries(Object.keys(DIMENSION_LABELS).map((key) => [key, 0]));
  for (const record of records) {
    const preference = (record.score - 5) / 5;
    if (!preference) continue;
    for (const tag of record.tags) {
      if (IDENTITY_ONLY_TAGS.has(tag.toLowerCase())) continue;
      const dimensions = TAG_DIMENSIONS[tag];
      if (!dimensions) continue;
      for (const [dimension, weight] of Object.entries(dimensions)) {
        totals[dimension] += preference * weight;
      }
    }
  }
  return totals;
}

function archetypeScore(archetype, dimensions) {
  const vector = ARCHETYPE_DIMENSIONS[archetype.id];
  return Object.entries(dimensions).reduce(
    (sum, [dimension, value]) => sum + value * (vector[dimension] || 0),
    0,
  );
}

function inferenceEvidence(records, archetype) {
  const vector = ARCHETYPE_DIMENSIONS[archetype.id];
  return records
    .map((record) => {
      const preference = (record.score - 5) / 5;
      let impact = 0;
      const matchedSignals = [];
      for (const tag of record.tags) {
        if (IDENTITY_ONLY_TAGS.has(tag.toLowerCase())) continue;
        const dimensions = TAG_DIMENSIONS[tag];
        if (!dimensions) continue;
        for (const [dimension, weight] of Object.entries(dimensions)) {
          const contribution = preference * weight * (vector[dimension] || 0);
          impact += contribution;
          if (Math.abs(contribution) >= 0.03) {
            matchedSignals.push(`${tag} → ${DIMENSION_LABELS[dimension]}`);
          }
        }
      }
      return {
        question: record.text,
        score: record.score,
        matchedSignals: [...new Set(matchedSignals)],
        impact: roundMetric(impact),
      };
    })
    .filter((item) => item.matchedSignals.length && Math.abs(item.impact) >= 0.01)
    .sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact) || a.question.localeCompare(b.question, "zh-CN"))
    .slice(0, 6);
}

function inferenceChoice(archetype, score) {
  return Object.freeze({
    id: archetype.id,
    label: archetype.label,
    shortLabel: archetype.shortLabel,
    score: roundMetric(score),
  });
}

function deriveArchetype(records, hint) {
  const dimensions = dimensionsFor(records);
  const ranked = ARCHETYPE_LIST
    .map((archetype, index) => ({ archetype, index, score: archetypeScore(archetype, dimensions) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const hasAnswerSignal = Object.values(dimensions).some((value) => Math.abs(value) >= 0.0001);
  const hinted = hint && ARCHETYPES[hint] ? ranked.find((item) => item.archetype.id === hint) : null;
  const chosen = hinted || (hasAnswerSignal
    ? ranked[0]
    : ranked.find((item) => item.archetype.id === "steady-guardian"));
  const runnerUp = ranked.find((item) => item.archetype.id !== chosen.archetype.id);
  const dimensionScores = Object.freeze(Object.fromEntries(
    Object.entries(dimensions).map(([key, value]) => [key, Object.freeze({ label: DIMENSION_LABELS[key], value: roundMetric(value) })]),
  ));
  const inference = Object.freeze({
    method: hinted ? "explicit-hint" : hasAnswerSignal ? "answer-dimensions" : "neutral-default",
    chosen: inferenceChoice(chosen.archetype, chosen.score),
    runnerUp: inferenceChoice(runnerUp.archetype, runnerUp.score),
    dimensions: dimensionScores,
    evidence: Object.freeze(inferenceEvidence(records, chosen.archetype).map((item) => Object.freeze({
      ...item,
      matchedSignals: Object.freeze(item.matchedSignals),
    }))),
  });
  return { archetype: chosen.archetype, inference };
}

function deriveMbti(records, seedText, override) {
  const normalized = String(override || "").toUpperCase();
  if (MBTI_STYLES[normalized]) return normalized;
  const decide = (positive, negative, salt) => {
    const score = tagAffinity(records, MBTI_SIGNALS[positive]) - tagAffinity(records, MBTI_SIGNALS[negative]);
    if (Math.abs(score) > 0.0001) return score > 0 ? positive : negative;
    return hashString(`${seedText}|${salt}`) % 2 === 0 ? positive : negative;
  };
  return [decide("E", "I", "energy"), decide("N", "S", "information"), decide("T", "F", "decision"), decide("J", "P", "rhythm")].join("");
}

function deriveTraits(records) {
  const totals = new Map();
  for (const record of records) {
    for (const tag of record.tags) {
      if (!SAFE_TRAITS[tag]) continue;
      const current = totals.get(tag) || { sum: 0, count: 0 };
      current.sum += record.score;
      current.count += 1;
      totals.set(tag, current);
    }
  }
  const ranked = [...totals.entries()]
    .map(([tag, value]) => ({ tag, label: SAFE_TRAITS[tag], average: value.sum / value.count }))
    .sort((a, b) => b.average - a.average || a.tag.localeCompare(b.tag, "zh-CN"));
  return {
    embraced: ranked.find((item) => item.average >= 6.5) || null,
    boundary: [...ranked].reverse().find((item) => item.average <= 3.5) || null,
  };
}

function presentationFor(gender, seedText) {
  if (PRESENTATIONS[gender]) return { id: gender, ...PRESENTATIONS[gender] };
  const ids = Object.keys(PRESENTATIONS);
  const id = ids[hashString(`${seedText}|presentation`) % ids.length];
  return { id, ...PRESENTATIONS[id] };
}

function birthdayFor(rng) {
  const year = 1992 + Math.floor(rng() * 11);
  const month = 1 + Math.floor(rng() * 12);
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = 1 + Math.floor(rng() * maxDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function zodiacFor(date) {
  const [, monthText, dayText] = date.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  const bounds = [20, 19, 21, 20, 21, 22, 23, 23, 23, 24, 23, 22];
  const signs = ["摩羯座", "水瓶座", "双鱼座", "白羊座", "金牛座", "双子座", "巨蟹座", "狮子座", "处女座", "天秤座", "天蝎座", "射手座", "摩羯座"];
  return day < bounds[month - 1] ? signs[month - 1] : signs[month];
}

function mbtiRelationshipBeat(mbti) {
  const beats = {
    E: "热闹散场后，TA 仍会把最后一格社交电量留给你。",
    I: "你们会把周日晚留给彼此，安静也不需要找话题。",
    N: "你抛出一个离谱脑洞，TA 会认真陪你把世界观补完。",
    S: "TA 的爱很具体：到家的灯、温好的饭和永远有电的充电宝。",
    T: "分歧出现时 TA 对事不对人，也会记得先照顾你的感受。",
    F: "TA 能听懂你没说出口的部分，但不会替你定义情绪。",
    J: "TA 会为旅行做表格，也会专门留一格给临时起意。",
    P: "你们总有计划外惊喜，重要承诺却从不被随性带过。",
  };
  return pick([...mbti].map((letter) => beats[letter]), rngFromSeed(hashString(`beat|${mbti}`)));
}

function relationshipDetails(archetype, mbti, traits, rng) {
  const details = [];
  const beats = [...archetype.relationshipBeats];
  details.push(beats.splice(Math.floor(rng() * beats.length), 1)[0]);
  details.push(beats.splice(Math.floor(rng() * beats.length), 1)[0]);
  details.push(mbtiRelationshipBeat(mbti));
  if (traits.embraced) {
    details.push(`你对「${traits.embraced.label}」接受度很高，TA 会放心把真实又好笑的一面交给你。`);
  }
  if (traits.boundary) {
    details.push(`你对「${traits.boundary.label}」边界清楚，TA 不会用“开玩笑”测试你的底线。`);
  }
  while (details.length < 5 && beats.length) details.push(beats.shift());
  return details.slice(0, 5);
}

export function buildPortraitPrompt({ archetype, presentation, mbti } = {}) {
  const archetypeData = typeof archetype === "string" ? ARCHETYPES[archetype] : archetype;
  const presentationData = typeof presentation === "string" ? PRESENTATIONS[presentation] : presentation;
  const mbtiData = typeof mbti === "string" ? MBTI_STYLES[mbti] : mbti;
  if (!archetypeData || !presentationData || !mbtiData) throw new TypeError("Invalid portrait prompt inputs");
  return [
    "Use case: stylized-concept",
    "Asset type: premium mobile game character portrait card",
    `Primary request: an original East Asian otome-game-inspired character archetype, ${archetypeData.shortLabel}, clearly readable at first glance`,
    `Scene/backdrop: ${archetypeData.scenePrompt}`,
    `Subject: ${presentationData.subject}, age 24 to 34, ${archetypeData.visualPrompt}`,
    "Style/medium: premium original 2.5D anime character key art, refined painterly rendering, sophisticated fashion editorial finish, not based on any existing franchise or celebrity",
    "Composition/framing: vertical 2:3 poster, full body three-quarter hero pose, face and both hands clearly visible, generous breathing room around the silhouette, mobile-card legibility",
    "Lighting/mood: brilliant high-key studio daylight, crisp rim light, hard clean shadows, very high visual contrast, luminous skin without overexposure",
    `Color palette: outfit is ${mbtiData.outfit}; bright white and electric cobalt environment; use the outfit color as the dominant character signal`,
    "Materials/textures: realistic premium fabric texture, clean metal details, natural hair strands, polished but not plastic skin",
    "Constraints: one adult character only; original design; unmistakable archetype; tasteful and fully clothed; no text; no logo; no watermark; no frame; no UI; no extra limbs or fingers",
    "Avoid: underage appearance, school uniform, muddy pastel wash, beige-dominant palette, low contrast, purple gradient background, generic stock-anime face, photoreal celebrity likeness, copied game character, cluttered scenery",
  ].join("\n");
}

export function buildRemotePortraitUrl(prompt, { seed = 1, width = 1024, height = 1536 } = {}) {
  const safeWidth = Math.max(512, Math.min(1536, Math.round(Number(width) || 1024)));
  const safeHeight = Math.max(768, Math.min(2048, Math.round(Number(height) || 1536)));
  const safeSeed = Math.abs(Math.trunc(Number(seed) || 1)) % 2147483647;
  const compactPrompt = String(prompt).replace(/\s+/g, " ").trim().slice(0, 3500);
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(compactPrompt)}?width=${safeWidth}&height=${safeHeight}&seed=${safeSeed}&nologo=true&enhance=true`;
}

export function buildIdealProfile(input = {}) {
  const records = normalizeRecords(input);
  const requestedGender = normalizeGender(input.genderPreference ?? input.targetGender ?? input.gender);
  const seedText = canonicalSeed(input, records, requestedGender);
  const seed = hashString(seedText);
  const rng = rngFromSeed(seed);
  const archetypeResult = deriveArchetype(records, input.archetypeHint);
  const archetype = archetypeResult.archetype;
  const mbti = deriveMbti(records, seedText, input.mbtiHint ?? input.mbti);
  const style = MBTI_STYLES[mbti];
  const presentation = presentationFor(requestedGender, seedText);
  const traits = deriveTraits(records);
  const birthday = birthdayFor(rng);
  const name = pick(presentation.names, rng);
  const portraitPrompt = buildPortraitPrompt({ archetype, presentation, mbti: style });
  const relationship = Object.freeze({
    heading: `你和 ${name} 的相处细节`,
    details: Object.freeze(relationshipDetails(archetype, mbti, traits, rng)),
    chemistry: `${style.mood} × ${archetype.shortLabel}`,
  });
  const matchCard = Object.freeze({
    name,
    mbti,
    birthDate: birthday,
    zodiac: zodiacFor(birthday),
    occupation: pick(archetype.occupations, rng),
    identity: archetype.identity,
    presentation: presentation.label,
    archetype: archetype.shortLabel,
    keywords: Object.freeze([...new Set([...archetype.keywords, style.mood])].slice(0, 5)),
    bio: `${archetype.visualSignature}。${archetype.identity}。`,
    fictional: true,
  });
  const portrait = Object.freeze({
    id: `${archetype.id}-${mbti.toLowerCase()}-${seed.toString(16).padStart(8, "0")}`,
    archetypeId: archetype.id,
    archetype: archetype.shortLabel,
    visualSignature: archetype.visualSignature,
    mbti,
    presentation: presentation.label,
    palette: Object.freeze({ primary: style.primary, secondary: style.secondary, accent: style.accent }),
    prompt: portraitPrompt,
    promptVersion: PROFILE_VERSION,
    seed,
    aspectRatio: "2 / 3",
    imageUrl: buildRemotePortraitUrl(portraitPrompt, { seed }),
    fallbackUrl: PORTRAIT_FALLBACKS[presentation.id],
    source: "pollinations-remote-fallback",
    alt: `${name}，${archetype.shortLabel}理想型立绘，${mbti} 配色`,
  });
  const stages = Object.freeze([
    Object.freeze({ id: "portrait", step: 1, label: "理想型亮相", data: portrait }),
    Object.freeze({ id: "profile", step: 2, label: "相亲人物档案", data: matchCard }),
    Object.freeze({ id: "relationship", step: 3, label: "相处细节", data: relationship }),
  ]);

  return Object.freeze({
    version: PROFILE_VERSION,
    synthetic: true,
    disclaimer: "本档案由游戏答案生成，角色、生日、职业与身份均为虚构。",
    portrait,
    matchCard,
    relationship,
    inference: archetypeResult.inference,
    stages,
  });
}

export const IDEAL_PROFILE_VERSION = PROFILE_VERSION;
