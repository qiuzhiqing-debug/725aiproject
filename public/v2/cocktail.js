/* ==========================================================================
   调酒仪式 cocktail.js （pixel-bar 风）
   - 数据层：resolveCocktail(answers) 纯函数，4 题索引 → 杯型/配色/名字
   - 表现层：问答流程 → 摇壶 → 分层倒酒 → 落冰 → 发光定格 → 结果卡
   - 完成回调：window.onCocktailDone(cocktail)
   ========================================================================== */

/* ---------------- 数据层 ---------------- */

// 4 道快问（基酒=性格底色 / 辅料=社交能量 / 装饰=今晚心情 / 冰量=边界感）
export const QUESTIONS = [
  {
    key: "base",
    step: "PART 1 / 基酒",
    title: "性格打底，先选你的基酒",
    hint: "别想太久，第一眼看中的就是你",
    options: [
      { label: "陈年威士忌", desc: "话不多，但每句都有后劲" },
      { label: "银标伏特加", desc: "看起来没脾气，上头最快的就是我" },
      { label: "金汤力的金酒", desc: "社交平衡大师，跟谁都能碰杯" },
      { label: "陈酿朗姆", desc: "浪过，甜过，现在只想坐着听歌" },
    ],
  },
  {
    key: "mixer",
    step: "PART 2 / 辅料",
    title: "今晚的社交电量，兑点什么？",
    hint: "辅料决定你今晚被搭话的概率",
    options: [
      { label: "苏打气泡拉满", desc: "谁的瓜我都想凑，气氛组在此" },
      { label: "青柠汁提酸", desc: "可以聊，但请先过我这关" },
      { label: "蜂蜜糖浆", desc: "对熟人无限甜，对生人礼貌微笑" },
      { label: "纯饮不兑", desc: "电量 1%，勿扰模式，谢谢配合" },
    ],
  },
  {
    key: "garnish",
    step: "PART 3 / 装饰",
    title: "杯口插点什么？——今晚的心情",
    hint: "装饰是给别人看的，也是给自己打的旗号",
    options: [
      { label: "一颗酒渍樱桃", desc: "有点期待，又装作不期待" },
      { label: "一片焦皮柠檬", desc: "微苦，带电，今晚不好惹" },
      { label: "一把小纸伞", desc: "来度假的，天塌了也先喝完这杯" },
      { label: "一根荧光搅拌棒", desc: "蹦迪预备状态，随时可以起飞" },
    ],
  },
  {
    key: "ice",
    step: "PART 4 / 冰量",
    title: "最后一步：加多少冰？",
    hint: "冰量 = 你的边界感刻度",
    options: [
      { label: "不加冰", desc: "滚烫直给，受不了是你的事" },
      { label: "一颗大方冰", desc: "有分寸，但值得的人可以慢慢化" },
      { label: "半杯碎冰", desc: "保持凉爽，别问我周末在干嘛" },
      { label: "满杯冰山", desc: "先做同事吧，朋友的事下辈子再说" },
    ],
  },
];

// 名字前缀：由 [基酒×装饰] 决定（16 种）
const NAME_PREFIX = [
  // 威士忌 ×（樱桃/柠檬/纸伞/荧光棒）
  "深夜电台", "焦糖闪电", "旧码头", "琥珀蹦迪",
  // 伏特加 ×
  "像素心跳", "银色警报", "极地假日", "霓虹放逐",
  // 金酒 ×
  "月台告白", "青柠防线", "热带信号", "氖光快门",
  // 朗姆 ×
  "甜心走私", "浪子回航", "日落巴士", "低保真火焰",
];

// 名字后缀：由 [辅料×冰量] 决定（16 种）
const NAME_SUFFIX = [
  // 苏打 ×（无冰/大冰/碎冰/冰山）
  "起泡宣言", "气泡协议", "碎冰狂欢", "雪崩预警",
  // 青柠 ×
  "酸甜审判", "分寸特调", "冷静补丁", "防火墙",
  // 蜂蜜 ×
  "热恋原浆", "慢炖月光", "微糖结界", "甜心冷链",
  // 纯饮 ×
  "直球烈焰", "独角戏", "静音模式", "绝对零度",
];

// 12 套分层液体配色（bottom→mid→top），索引 = (基酒*4+辅料)%12
const LIQUID_PALETTES = [
  ["#7a1b4d", "#ff2d78", "#ffb648"], // 霓虹粉→琥珀
  ["#1b3f7a", "#2d8cff", "#2de2ff"], // 深海蓝→电青
  ["#503097", "#a86bff", "#ff6ea8"], // 紫→粉
  ["#0c5c48", "#2ecf9a", "#c0ff58"], // 深绿→酸绿
  ["#7a4a1b", "#e08a1e", "#ffd28a"], // 陈酿琥珀渐层
  ["#801c1c", "#ff4141", "#ffb0cd"], // 罚酒红→樱粉
  ["#173a63", "#3a6fd8", "#a86bff"], // 蓝→紫电
  ["#5c1660", "#c22ecf", "#2de2ff"], // 品红→青（赛博经典）
  ["#274b12", "#7ab648", "#f4ff8a"], // 苦艾绿渐层
  ["#5c2f10", "#c26a2e", "#ff2d78"], // 焦糖→霓虹粉
  ["#123c5c", "#1e9ec2", "#58ff9b"], // 海青→荧光绿
  ["#3c1c66", "#7848ff", "#ffb648"], // 夜紫→暖琥珀
];

// 杯型：由装饰题决定（心情选杯）
const GLASS_TYPES = ["martini", "highball", "rocks", "coupe"];

// 酒保介绍词模板（占位：后续接 LLM，用 {name} 插值）
const INTRO_TEMPLATES = [
  "老K擦着杯子瞥了你一眼：「{name}？行，这杯上头慢、后劲长——跟你一样，不好懂，但值得等。」",
  "老K把杯垫推过来：「{name}，本店不常调。上一个点这杯的人，后来在吧台哭着讲了三小时初恋。」",
  "老K挑了挑眉：「{name}。配方我就调过两次，一次给自己，一次给你。慢点喝。」",
  "老K把酒推到你面前：「{name}——甜是真的，辣也是真的。今晚遇到什么人，都别怪酒。」",
];

/**
 * 纯函数：4 题答案索引 → 一杯确定的鸡尾酒
 * @param {number[]} answers 长度 4，每项 0..3
 * @returns {{name, prefix, suffix, glass, palette, paletteId, ice, garnish, intro, answers}}
 */
export function resolveCocktail(answers) {
  if (!Array.isArray(answers) || answers.length !== 4 ||
      answers.some((a) => !Number.isInteger(a) || a < 0 || a > 3)) {
    throw new Error("resolveCocktail: answers 必须是 4 个 0..3 的整数");
  }
  const [base, mixer, garnish, ice] = answers;
  const prefix = NAME_PREFIX[base * 4 + garnish];
  const suffix = NAME_SUFFIX[mixer * 4 + ice];
  const paletteId = (base * 4 + mixer) % 12;
  const name = `${prefix}·${suffix}`;
  return {
    name,
    prefix,
    suffix,
    glass: GLASS_TYPES[garnish],
    palette: LIQUID_PALETTES[paletteId],
    paletteId,
    ice,            // 0..3 = 冰块数量
    garnish,        // 0 樱桃 / 1 柠檬 / 2 纸伞 / 3 荧光棒
    intro: INTRO_TEMPLATES[(base + mixer + garnish + ice) % INTRO_TEMPLATES.length]
      .replace("{name}", name),
    answers: [...answers],
  };
}

/* ---------------- 像素杯型 SVG ---------------- */

// 每种杯型返回 { svg, layerSel } —— 液体层带 .liquid-layer，冰带 .ice-cube
function glassSVG(type, [c1, c2, c3], iceCount, garnishIdx) {
  // 通用液体层生成：在给定 clip 区域内三层横带（下→上）
  const layers = (x, w, yBottom, totalH) => {
    const h1 = totalH * 0.42, h2 = totalH * 0.34, h3 = totalH * 0.24;
    return `
      <g clip-path="url(#bowl)">
        <rect class="liquid-layer" data-i="0" x="${x}" y="${yBottom - h1}" width="${w}" height="${h1}" fill="${c1}"/>
        <rect class="liquid-layer" data-i="1" x="${x}" y="${yBottom - h1 - h2}" width="${w}" height="${h2}" fill="${c2}"/>
        <rect class="liquid-layer" data-i="2" x="${x}" y="${yBottom - h1 - h2 - h3}" width="${w}" height="${h3}" fill="${c3}"/>
        <rect class="liquid-layer" data-i="2" x="${x}" y="${yBottom - h1 - h2 - h3}" width="${w}" height="3" fill="#ffffff" opacity="0.5"/>
      </g>`;
  };
  const ices = (cx, yTop, n) => {
    let s = "";
    for (let i = 0; i < n; i++) {
      const ix = cx - 26 + (i % 2) * 26 + (i > 1 ? 8 : 0);
      const iy = yTop + Math.floor(i / 2) * 20;
      s += `<g class="ice-cube" data-i="${i}">
        <rect x="${ix}" y="${iy}" width="18" height="18" rx="2" fill="#cfeaff" opacity="0.8"/>
        <rect x="${ix + 3}" y="${iy + 3}" width="5" height="5" fill="#ffffff" opacity="0.9"/>
      </g>`;
    }
    return s;
  };
  const garnishes = (cx, rimY) => {
    switch (garnishIdx) {
      case 0: // 樱桃
        return `<g class="garnish"><circle cx="${cx + 34}" cy="${rimY - 6}" r="8" fill="#ff2d5e"/>
          <rect x="${cx + 33}" y="${rimY - 30}" width="2.5" height="18" fill="#58ff9b"/></g>`;
      case 1: // 柠檬片
        return `<g class="garnish"><circle cx="${cx + 40}" cy="${rimY - 4}" r="12" fill="#ffd84d" stroke="#e0a010" stroke-width="3"/>
          <circle cx="${cx + 40}" cy="${rimY - 4}" r="5" fill="#fff3b0"/></g>`;
      case 2: // 小纸伞
        return `<g class="garnish">
          <polygon points="${cx + 30},${rimY - 34} ${cx + 62},${rimY - 34} ${cx + 46},${rimY - 52}" fill="#ff6ea8"/>
          <polygon points="${cx + 36},${rimY - 34} ${cx + 56},${rimY - 34} ${cx + 46},${rimY - 46}" fill="#ffd7e6"/>
          <rect x="${cx + 45}" y="${rimY - 34}" width="2.5" height="28" fill="#d8c9a6"/></g>`;
      default: // 荧光搅拌棒
        return `<g class="garnish"><rect x="${cx + 26}" y="${rimY - 44}" width="5" height="52" rx="2"
          fill="#58ff9b" transform="rotate(14 ${cx + 28} ${rimY})"/>
          <rect x="${cx + 26}" y="${rimY - 44}" width="5" height="14" rx="2" fill="#c0ffdc"
          transform="rotate(14 ${cx + 28} ${rimY})"/></g>`;
    }
  };
  const GLASS_LINE = "#bfe8ff";
  const LW = 4;

  if (type === "martini") {
    // 三角杯：碗区 y 30..96
    return `<svg viewBox="0 0 220 220">
      <defs><clipPath id="bowl"><polygon points="40,32 180,32 110,98"/></clipPath></defs>
      ${layers(40, 140, 98, 62)}
      ${ices(110, 40, iceCount)}
      <polygon points="40,32 180,32 110,98" fill="none" stroke="${GLASS_LINE}" stroke-width="${LW}"/>
      <rect x="107" y="98" width="6" height="66" fill="${GLASS_LINE}"/>
      <rect x="72" y="164" width="76" height="6" rx="2" fill="${GLASS_LINE}"/>
      ${garnishes(110, 34)}
    </svg>`;
  }
  if (type === "highball") {
    // 高杯：碗区 y 28..170
    return `<svg viewBox="0 0 220 220">
      <defs><clipPath id="bowl"><rect x="66" y="28" width="88" height="142"/></clipPath></defs>
      ${layers(66, 88, 170, 128)}
      ${ices(110, 44, iceCount)}
      <path d="M 66 28 L 66 170 L 154 170 L 154 28" fill="none" stroke="${GLASS_LINE}" stroke-width="${LW}"/>
      ${garnishes(110, 30)}
    </svg>`;
  }
  if (type === "rocks") {
    // 矮杯：碗区 y 82..168
    return `<svg viewBox="0 0 220 220">
      <defs><clipPath id="bowl"><rect x="56" y="82" width="108" height="86"/></clipPath></defs>
      ${layers(56, 108, 168, 74)}
      ${ices(110, 92, iceCount)}
      <path d="M 56 82 L 56 168 L 164 168 L 164 82" fill="none" stroke="${GLASS_LINE}" stroke-width="${LW}"/>
      <rect x="52" y="166" width="116" height="8" rx="2" fill="${GLASS_LINE}"/>
      ${garnishes(110, 84)}
    </svg>`;
  }
  // coupe 浅碟杯：碗区 y 40..92
  return `<svg viewBox="0 0 220 220">
    <defs><clipPath id="bowl"><path d="M 42 40 L 178 40 L 172 70 Q 160 92 110 92 Q 60 92 48 70 Z"/></clipPath></defs>
    ${layers(42, 136, 92, 50)}
    ${ices(110, 46, Math.min(iceCount, 2))}
    <path d="M 42 40 L 178 40 L 172 70 Q 160 92 110 92 Q 60 92 48 70 Z"
      fill="none" stroke="${GLASS_LINE}" stroke-width="${LW}"/>
    <rect x="107" y="92" width="6" height="70" fill="${GLASS_LINE}"/>
    <rect x="74" y="162" width="72" height="6" rx="2" fill="${GLASS_LINE}"/>
    ${garnishes(110, 42)}
  </svg>`;
}

/* ---------------- 表现层（仅在页面环境执行） ---------------- */

if (typeof document !== "undefined" && document.getElementById("quiz")) {
  const $ = (id) => document.getElementById(id);
  const answers = [];
  let qi = 0;

  window.onCocktailDone = window.onCocktailDone || ((c) => {
    console.log("[cocktail] onCocktailDone（占位回调）", c);
  });

  // 进度条
  const progress = $("progress");
  QUESTIONS.forEach(() => progress.appendChild(document.createElement("i")));
  const updateProgress = () => {
    [...progress.children].forEach((dot, i) => {
      dot.className = i < qi ? "done" : i === qi ? "now" : "";
    });
  };

  function renderQuestion() {
    const q = QUESTIONS[qi];
    $("stepLabel").textContent = q.step;
    $("questionTitle").textContent = q.title;
    $("questionHint").textContent = q.hint;
    const wrap = $("options");
    wrap.innerHTML = "";
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quiz-option";
      btn.innerHTML = `<b>${"ABCD"[i]}</b><span>${opt.label}<small>${opt.desc}</small></span>`;
      btn.addEventListener("click", () => {
        btn.classList.add("picked");
        answers.push(i);
        setTimeout(() => {
          qi++;
          if (qi < QUESTIONS.length) {
            $("quizCard").style.animation = "none";
            void $("quizCard").offsetWidth; // 重触发入场动画
            $("quizCard").style.animation = "";
            renderQuestion();
            updateProgress();
          } else {
            startMixing(resolveCocktail(answers));
          }
        }, 260);
      });
      wrap.appendChild(btn);
    });
    updateProgress();
  }

  // ---- 调酒动画序列（约 3 秒） ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function startMixing(cocktail) {
    $("quiz").classList.add("hidden");
    const mixing = $("mixing");
    mixing.classList.remove("hidden");

    const shaker = $("mixShaker");
    const stream = $("pourStream");
    const zone = $("glassZone");
    const caption = $("mixCaption");

    zone.innerHTML = glassSVG(cocktail.glass, cocktail.palette, cocktail.ice, cocktail.garnish);

    // 1) 摇壶 ~1s
    caption.textContent = "摇匀中…";
    shaker.classList.add("shake");
    await sleep(1000);
    shaker.classList.remove("shake");

    // 2) 倾倒 + 三层液体依次升起 ~1.6s
    shaker.classList.add("tilt");
    await sleep(300);
    const layers = [...zone.querySelectorAll(".liquid-layer")];
    const colors = cocktail.palette;
    for (let i = 0; i < 3; i++) {
      stream.style.setProperty("--pour-color", colors[i]);
      stream.classList.add("on");
      caption.textContent = ["倒入基酒…", "兑入辅料…", "封顶一层…"][i];
      layers.filter((l) => +l.dataset.i === i).forEach((l) => l.classList.add("rise"));
      await sleep(480);
    }
    stream.classList.remove("on");
    shaker.style.opacity = "0";
    shaker.style.transition = "opacity 0.3s";

    // 3) 落冰 ~0.5s
    const cubes = [...zone.querySelectorAll(".ice-cube")];
    if (cubes.length) {
      caption.textContent = "冰块入杯——";
      cubes.forEach((c, i) => setTimeout(() => c.classList.add("drop"), i * 130));
      await sleep(400 + cubes.length * 130);
    }

    // 4) 发光定格
    zone.classList.add("glow");
    caption.textContent = cocktail.name;
    await sleep(900);

    // 5) 结果卡
    $("resultName").textContent = cocktail.name;
    $("resultIntro").textContent = cocktail.intro;
    $("result").classList.remove("hidden");
    $("resultGo").addEventListener("click", () => window.onCocktailDone(cocktail), { once: true });
  }

  renderQuestion();
}
