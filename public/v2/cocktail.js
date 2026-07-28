/* ==========================================================================
   调酒仪式 cocktail.js （pixel-bar 风 · 老K对话体）
   - 数据层：resolveCocktail(answers) 纯函数，4 题索引 → 杯型/配色/名字/酒谱
     第 1 题基酒 7 选（六大基酒 + 无酒精彩蛋），其余 3 题 4 选
   - 表现层：老K开场 → 问答（可回退）→ 摇一摇物理交互（devicemotion，点按降级）
             → 分层倒酒 → 落冰 → 发光定格 → 结果卡
   - 完成回调：window.onCocktailDone(cocktail)（契约字段 name/glass/intro… 不变）
   - 调试参数：?preview=shake | ?preview=result 直达对应状态（QA 截图用）
   ========================================================================== */

import { createShaker } from "../fx.js";
import { createBartender } from "./bartender.js";

/* ---------------- 数据层 ---------------- */

// 4 道快问（基酒=性格底色 / 辅料=社交能量 / 装饰=今晚心情 / 冰量=边界感）
// 所有文案 = 老K在说话（docs/LAOK-PERSONA.md）
export const QUESTIONS = [
  {
    key: "base",
    step: "PART 1 / 基酒",
    title: "吧台后面这排瓶子，总有一瓶像你。挑吧。",
    hint: "别想太久。第一眼停在哪，就是哪。",
    options: [
      { label: "金酒",   desc: "闻着像雨后的植物园。清爽，跟谁都合得来。" },
      { label: "伏特加", desc: "没什么味道，劲儿都收在后面。" },
      { label: "朗姆",   desc: "甜口，晒过太阳的味道。适合有故事的人。" },
      { label: "威士忌", desc: "第一口冲，坐一会儿就顺了。" },
      { label: "龙舌兰", desc: "不爱绕弯子。看着烈，其实直接。" },
      { label: "白兰地", desc: "壁炉边的酒。急不得，也没人急。" },
      { label: "无酒精特调", desc: "今晚想清醒着看热闹？行，我也有招。" },
    ],
  },
  {
    key: "mixer",
    step: "PART 2 / 辅料",
    title: "兑点什么？看你今晚想聊到哪一步。",
    hint: "这杯越顺口，你今晚话越多。吧台的老经验。",
    options: [
      { label: "苏打气泡", desc: "多来点气泡，今晚想热闹热闹。" },
      { label: "鲜榨青柠", desc: "带点酸。聊得来，就再深聊。" },
      { label: "蜂蜜糖浆", desc: "来点甜。对熟人一向舍得。" },
      { label: "什么都不兑", desc: "今晚就想安安静静喝一杯。" },
    ],
  },
  {
    key: "garnish",
    step: "PART 3 / 装饰",
    title: "杯口给你放点什么？心情这东西，藏不住的。",
    hint: "客人嘴上不说的，都插在杯口上。",
    options: [
      { label: "一颗酒渍樱桃", desc: "有点期待，先不说出口。" },
      { label: "一片焦皮柠檬", desc: "今晚想清醒一点，利落一点。" },
      { label: "一把小纸伞", desc: "放假心态。天大的事，明天再说。" },
      { label: "一根荧光搅拌棒", desc: "音乐一响，就想跟上的那种心情。" },
    ],
  },
  {
    key: "ice",
    step: "PART 4 / 冰量",
    title: "最后一件事——冰，加多少？",
    hint: "冰不是温度，是距离。我从不替客人做主。",
    options: [
      { label: "不加冰", desc: "想到什么说什么，趁热。" },
      { label: "一颗大方冰", desc: "慢慢化，不着急。" },
      { label: "半杯碎冰", desc: "留点凉爽，节奏自己定。" },
      { label: "满杯冰", desc: "今晚先保持点距离，熟了再说。" },
    ],
  },
];

// 七支基酒 → 七杯有名字有杯型的成品酒（酒谱见 recipe 拼装）
// intro = 出酒时老K直接说的话（无舞台说明；酒名只在结果卡标题出现一次，intro 不重复报名）
const BASES = [
  {
    label: "金酒", glass: "highball", prefix: "雾中花园",
    palette: ["#16536e", "#2ea8c8", "#c2f3ff"],
    intro: "入口干净，回头带一点杜松子的苦香。今晚适合聊点真的。",
  },
  {
    label: "伏特加", glass: "martini", prefix: "无声极光",
    palette: ["#233a6b", "#4a7fd8", "#dce9ff"],
    intro: "看着没脾气，后劲我只提醒这一遍。慢点喝。",
  },
  {
    label: "朗姆", glass: "coupe", prefix: "旧码头",
    palette: ["#5c2f10", "#c26a2e", "#ffd28a"],
    intro: "糖和风浪一起蒸出来的。有故事就着它讲，我听着。",
  },
  {
    label: "威士忌", glass: "rocks", prefix: "深夜电台",
    palette: ["#7a4a1b", "#e08a1e", "#ffd28a"],
    intro: "第一口冲，第二口就懂了。有些人也是。",
  },
  {
    label: "龙舌兰", glass: "coupe", prefix: "沙漠日出",
    palette: ["#801c1c", "#ff6a2e", "#ffd84d"],
    intro: "日落的颜色，上头的速度。今晚别答应任何奇怪的事。",
  },
  {
    label: "白兰地", glass: "rocks", prefix: "壁炉余温",
    palette: ["#4a1c10", "#a8431e", "#e08a1e"],
    intro: "这杯不赶时间，你也别赶。",
  },
  {
    label: "无酒精特调", glass: "highball", prefix: "白日梦航班",
    palette: ["#7a1b4d", "#ff2d78", "#ffb0cd"],
    intro: "一滴酒精没有，该有的都有。清醒着心动，算你本事。",
  },
];

// 辅料给顶层液体换色（纯饮保留基酒原色）
const MIXER_TOP = ["#d8f6ff", "#b8e858", "#ffb648", null];

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

// 酒谱词表（recipe 拼装用）
const MIXER_NAMES   = ["苏打气泡", "鲜榨青柠", "蜂蜜糖浆", "纯饮不兑"];
const GARNISH_NAMES = ["酒渍樱桃", "焦皮柠檬", "小纸伞", "荧光搅拌棒"];
const ICE_NAMES     = ["不加冰", "一颗大方冰", "半杯碎冰", "满杯冰"];

/**
 * 纯函数：4 题答案索引 → 一杯确定的鸡尾酒
 * @param {number[]} answers 长度 4：[基酒 0..6, 辅料 0..3, 装饰 0..3, 冰量 0..3]
 * @returns {{name, prefix, suffix, glass, palette, paletteId, ice, garnish, intro, recipe, answers}}
 */
export function resolveCocktail(answers) {
  const valid =
    Array.isArray(answers) && answers.length === 4 &&
    answers.every((a, i) => Number.isInteger(a) && a >= 0 &&
      a < QUESTIONS[i].options.length);
  if (!valid) {
    throw new Error("resolveCocktail: answers 必须是 [0..6, 0..3, 0..3, 0..3]");
  }
  const [base, mixer, garnish, ice] = answers;
  const B = BASES[base];
  const suffix = NAME_SUFFIX[mixer * 4 + ice];
  const name = `${B.prefix}·${suffix}`;
  const palette = [...B.palette];
  if (MIXER_TOP[mixer]) palette[2] = MIXER_TOP[mixer];
  return {
    name,
    prefix: B.prefix,
    suffix,
    glass: B.glass,
    palette,
    paletteId: base * 4 + mixer,
    ice,            // 0..3 = 冰块数量
    garnish,        // 0 樱桃 / 1 柠檬 / 2 纸伞 / 3 荧光棒
    intro: B.intro.replace("{name}", name),
    recipe: `${B.label} · ${MIXER_NAMES[mixer]} · ${GARNISH_NAMES[garnish]} · ${ICE_NAMES[ice]}`,
    answers: [...answers],
  };
}

/* ---------------- 像素杯型 SVG ---------------- */

// 每种杯型返回 svg 字符串 —— 液体层带 .liquid-layer，冰带 .ice-cube
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
  // 装饰物统一锚在杯口右缘 (rimX, rimY)：贴沿不悬空，每种杯型传自己的杯沿坐标
  const garnishes = (rimX, rimY) => {
    switch (garnishIdx) {
      case 0: // 樱桃：坐在杯沿上，梗朝上
        return `<g class="garnish">
          <rect x="${rimX - 2.5}" y="${rimY - 24}" width="2.5" height="16" fill="#58ff9b"/>
          <circle cx="${rimX - 1}" cy="${rimY - 6}" r="8" fill="#ff2d5e"/>
          <circle cx="${rimX - 4}" cy="${rimY - 9}" r="2.2" fill="#ffb0cd"/></g>`;
      case 1: // 柠檬片：卡在杯沿上（半内半外）
        return `<g class="garnish">
          <circle cx="${rimX}" cy="${rimY}" r="12" fill="#ffd84d" stroke="#e0a010" stroke-width="3"/>
          <circle cx="${rimX}" cy="${rimY}" r="5" fill="#fff3b0"/></g>`;
      case 2: // 小纸伞：伞杆插进杯里，斜靠杯沿
        return `<g class="garnish" transform="rotate(-14 ${rimX - 12} ${rimY + 8})">
          <rect x="${rimX - 13.2}" y="${rimY - 28}" width="2.5" height="36" fill="#d8c9a6"/>
          <polygon points="${rimX - 28},${rimY - 28} ${rimX + 4},${rimY - 28} ${rimX - 12},${rimY - 46}" fill="#ff6ea8"/>
          <polygon points="${rimX - 22},${rimY - 28} ${rimX - 2},${rimY - 28} ${rimX - 12},${rimY - 40}" fill="#ffd7e6"/></g>`;
      default: // 荧光搅拌棒：插在杯里，斜搭杯沿
        return `<g class="garnish" transform="rotate(16 ${rimX - 9.5} ${rimY + 8})">
          <rect x="${rimX - 12}" y="${rimY - 36}" width="5" height="44" rx="2" fill="#58ff9b"/>
          <rect x="${rimX - 12}" y="${rimY - 36}" width="5" height="13" rx="2" fill="#c0ffdc"/></g>`;
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
      ${garnishes(176, 32)}
    </svg>`;
  }
  if (type === "highball") {
    // 高杯：碗区 y 28..170
    return `<svg viewBox="0 0 220 220">
      <defs><clipPath id="bowl"><rect x="66" y="28" width="88" height="142"/></clipPath></defs>
      ${layers(66, 88, 170, 128)}
      ${ices(110, 44, iceCount)}
      <path d="M 66 28 L 66 170 L 154 170 L 154 28" fill="none" stroke="${GLASS_LINE}" stroke-width="${LW}"/>
      ${garnishes(152, 28)}
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
      ${garnishes(162, 82)}
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
    ${garnishes(174, 40)}
  </svg>`;
}

/* ---------------- 表现层（仅在页面环境执行） ---------------- */

if (typeof document !== "undefined" && document.getElementById("quiz")) {
  const $ = (id) => document.getElementById(id);
  const answers = [];
  let qi = 0;
  let locked = false; // 答题切换动画期间禁点

  window.onCocktailDone = window.onCocktailDone || ((c) => {
    console.log("[cocktail] onCocktailDone（占位回调）", c);
  });

  /* ---- 老K 登场：像素立绘 + 两句自我引入 ---- */
  const HOST_LINES = [
    "第一次来吧。我是老K，这个吧台归我管。",
    "先调杯酒。你怎么选，比你怎么说诚实。",
  ];
  let bartender = null;
  try {
    bartender = createBartender($("hostSprite"), "talk");
    setTimeout(() => {
      $("hostLine").textContent = HOST_LINES[1];
      setTimeout(() => bartender && bartender.setState("idle"), 2600);
    }, 2600);
  } catch { /* 立绘挂了也不拦流程 */ }

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
      btn.innerHTML = `<b>${"ABCDEFG"[i]}</b><span>${opt.label}<small>${opt.desc}</small></span>`;
      btn.addEventListener("click", () => {
        if (locked) return;
        locked = true;
        btn.classList.add("picked");
        wrap.classList.add("locking"); // 其余选项压暗，选中项亮 420ms
        answers.push(i);
        setTimeout(() => {
          locked = false;
          wrap.classList.remove("locking");
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
        }, 420);
      });
      wrap.appendChild(btn);
    });
    // 上一题
    $("backBtn").classList.toggle("hidden", qi === 0);
    updateProgress();
  }

  $("backBtn").addEventListener("click", () => {
    if (locked || qi === 0) return;
    qi--;
    answers.pop();
    $("quizCard").style.animation = "none";
    void $("quizCard").offsetWidth;
    $("quizCard").style.animation = "";
    renderQuestion();
    updateProgress();
  });

  // ---- 调酒序列 ----
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---- 摇一摇阶段：devicemotion 物理交互，降级为连点 ----
     复用 fx.js createShaker（摇签同款）：iOS 需在手势里请求权限；
     无传感器 1.2s 超时自动降级。TARGET=130 与摇签一致。 */
  const SHAKE_TARGET = 130;

  function shakePhase() {
    return new Promise((resolve) => {
      const shakerEl = $("mixShaker");
      const caption = $("mixCaption");
      const btn = $("shakeBtn");
      const fill = $("shakeFill");
      const ui = $("shakeUI");
      const motion = createShaker();
      let calmTimer = null;
      let done = false;

      caption.textContent = "料都齐了。摇匀，才有得喝。";

      const setProgress = (ratio) => {
        const p = Math.min(1, ratio);
        fill.style.width = `${Math.round(p * 100)}%`;
        if (p >= 0.66) caption.textContent = "冰都在唱歌了，再来一点。";
        else if (p >= 0.33) caption.textContent = "有点样子了。再狠一点。";
      };

      // 摇动视觉：强度 → 振幅/角度，260ms 没新动作就归于平静
      const kick = (intensity) => {
        const amp = 6 + intensity * 16;
        const rot = 8 + intensity * 12;
        shakerEl.style.setProperty("--amp", `${amp.toFixed(1)}px`);
        shakerEl.style.setProperty("--rot", `${rot.toFixed(1)}deg`);
        shakerEl.classList.add("shake");
        clearTimeout(calmTimer);
        calmTimer = setTimeout(() => shakerEl.classList.remove("shake"), 300);
      };

      const finish = () => {
        if (done) return;
        done = true;
        motion.stop();
        clearTimeout(calmTimer);
        shakerEl.classList.remove("shake");
        setProgress(1);
        caption.textContent = "行了，再摇就淡了。";
        ui.classList.add("hidden");
        setTimeout(resolve, 600);
      };

      // 首次点击 = 用户手势：申请传感器；拿不到就把按钮变成连点充能
      btn.addEventListener("click", async function onFirst() {
        btn.removeEventListener("click", onFirst);
        btn.disabled = true;
        btn.textContent = "……";
        const ok = await motion.requestAndStart({
          onIntensity: (v) => {
            kick(v);
            setProgress(motion.charge() / SHAKE_TARGET);
          },
          onCharged: finish,
        });
        if (done) return;
        if (ok) {
          // 摇一摇模式：按钮退场，指令交给手腕
          btn.classList.add("hidden");
          caption.textContent = "就这样，手腕带上劲。";
        } else {
          // 降级：连点充能（桌面端 / 无传感器 / 权限被拒）
          let charge = 0;
          btn.disabled = false;
          btn.textContent = "摇不了就连点它";
          caption.textContent = "这台机器不认摇晃。手指快点，一样出酒。";
          const tap = () => {
            if (done) return;
            charge += 14;
            kick(0.8);
            setProgress(charge / SHAKE_TARGET);
            if (charge >= SHAKE_TARGET) finish();
          };
          btn.addEventListener("click", tap);
          shakerEl.addEventListener("click", tap);
          shakerEl.style.cursor = "pointer";
        }
      });
    });
  }

  async function startMixing(cocktail, opts = {}) {
    $("quiz").classList.add("hidden");
    $("host").classList.add("hidden");
    const mixing = $("mixing");
    mixing.classList.remove("hidden");

    const shaker = $("mixShaker");
    const stream = $("pourStream");
    const zone = $("glassZone");
    const caption = $("mixCaption");

    zone.innerHTML = glassSVG(cocktail.glass, cocktail.palette, cocktail.ice, cocktail.garnish);
    zone.className = `glass-zone glass--${cocktail.glass}`; // 杯口高度按杯型对齐摇壶

    // 1) 摇一摇（物理交互；preview=result 时跳过）
    if (!opts.skipShake) {
      await shakePhase();
    } else {
      $("shakeUI").classList.add("hidden");
    }

    // 2) 倾倒 + 三层液体依次升起
    shaker.classList.add("tilt");
    await sleep(opts.fast ? 60 : 300);
    const layers = [...zone.querySelectorAll(".liquid-layer")];
    const colors = cocktail.palette;
    for (let i = 0; i < 3; i++) {
      stream.style.setProperty("--pour-color", colors[i]);
      stream.classList.add("on");
      caption.textContent = ["先倒基酒。", "兑上。", "封顶。"][i];
      layers.filter((l) => +l.dataset.i === i).forEach((l) => l.classList.add("rise"));
      await sleep(opts.fast ? 90 : 480);
    }
    stream.classList.remove("on");
    shaker.style.opacity = "0";
    shaker.style.transition = "opacity 0.3s";

    // 3) 落冰
    const cubes = [...zone.querySelectorAll(".ice-cube")];
    if (cubes.length) {
      caption.textContent = "冰，进去。";
      cubes.forEach((c, i) => setTimeout(() => c.classList.add("drop"), i * (opts.fast ? 40 : 130)));
      await sleep(opts.fast ? 200 : 400 + cubes.length * 130);
    }

    // 4) 发光定格（酒名只在结果卡出现一次，这里不再报名字）
    zone.classList.add("glow");
    caption.textContent = "成了。";
    await sleep(opts.fast ? 200 : 900);

    // 5) 结果卡：老K直接说话，无舞台说明
    mixing.classList.add("done"); // 收起摇壶占位，杯子上移
    $("resultName").textContent = cocktail.name;
    $("resultRecipe").textContent = cocktail.recipe;
    $("resultIntro").textContent = cocktail.intro;
    $("result").classList.remove("hidden");
    caption.classList.add("hidden"); // 杯下字幕退场，名字只留一处
    $("resultGo").addEventListener("click", () => window.onCocktailDone(cocktail), { once: true });
  }

  /* ---- QA 直达参数（可选 &a=基酒,辅料,装饰,冰 覆盖默认答案，方便验各杯型） ---- */
  const qs = new URLSearchParams(location.search);
  const preview = qs.get("preview");
  const aRaw = (qs.get("a") || "").split(",").map((n) => parseInt(n, 10));
  let previewAnswers = [3, 1, 0, 1];
  if (aRaw.length === 4 && aRaw.every(Number.isInteger)) {
    try { resolveCocktail(aRaw); previewAnswers = aRaw; } catch { /* 非法就用默认 */ }
  }
  if (preview === "shake") {
    startMixing(resolveCocktail(previewAnswers));
  } else if (preview === "result") {
    startMixing(resolveCocktail(previewAnswers), { skipShake: true, fast: true });
  } else {
    renderQuestion();
  }
}
