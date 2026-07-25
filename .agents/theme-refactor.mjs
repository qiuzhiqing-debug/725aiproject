// 一次性重构脚本：把 style.css 的字面值替换为 theme.css 变量引用。
import fs from "node:fs";

const P = "D:/\u6ee1\u5206\u7537/public/style.css";
let css = fs.readFileSync(P, "utf8");

/* 1. 删掉旧的 :root 块（已迁到 theme.css） */
const rootStart = css.indexOf(":root {");
const rootEnd = css.indexOf("}", rootStart);
css = css.slice(0, rootStart) + css.slice(rootEnd + 2).replace(/^\n/, "");

/* 2. 旧变量名 -> 新语义名（长名优先） */
const renames = {
  "--paper-blue": "--c-paper-blue",
  "--paper": "--c-paper",
  "--card-solid": "--c-card-solid",
  "--card": "--c-card",
  "--ink-soft": "--c-ink-soft",
  "--ink-dim": "--c-ink-dim",
  "--ink": "--c-ink",
  "--line-soft": "--c-line-soft",
  "--line": "--c-line",
  "--blue-deep": "--c-blue-deep",
  "--blue": "--c-blue",
  "--cyan": "--c-cyan",
  "--ice": "--c-ice",
  "--silver": "--c-silver",
  "--yellow": "--c-yellow",
  "--red": "--c-red",
  "--purple": "--c-purple",
  "--shadow-sm": "--shadow-soft-sm",
  "--shadow": "--shadow-soft",
  "--focus": "--focus-ring",
  "--r-lg": "--radius-card",
  "--r-md": "--radius-btn",
  "--r-sm": "--radius-sm",
};
for (const k of Object.keys(renames).sort((a, b) => b.length - a.length)) {
  css = css.split(`var(${k})`).join(`var(${renames[k]})`);
  css = css.split(`var(${k},`).join(`var(${renames[k]},`);
  css = css.split(`, var(${k}))`).join(`, var(${renames[k]}))`);
}

/* 3. 色值 -> 变量 */
const colorMap = {
  "#ffffff": "--c-white",
  "#dbeeff": "--c-page-bg",
  "#f7fbff": "--c-paper",
  "#eaf5ff": "--c-paper-blue",
  "#eff8ff": "--c-mist",
  "#dff2ff": "--c-mist-deep",
  "#edf7ff": "--c-mist-mobile",
  "#0b1427": "--c-rail-dark",
  "#78b8ff": "--c-blue-mid",
  "#98caff": "--c-blue-pale",
  "#9adfff": "--c-cyan-soft",
  "#ddf719": "--c-yellow-deep",
  "#53647e": "--c-ink-dim",
  "#60718b": "--c-ink-mute",
  "#f6fbff": "--c-tint-emoji",
  "#eef5fc": "--c-tint-chip",
  "#f8fcff": "--c-tint-flip-back",
  "#e6f2ff": "--c-tint-shimmer-a",
  "#cbe9ff": "--c-tint-shimmer-b",
  "#d8eaff": "--c-tint-track",
  "#dcecff": "--c-tint-cup-top",
  "#b9e2ff": "--c-tint-sky",
  "#fff1f4": "--c-tint-drink",
  "#fbffd5": "--c-tint-exact",
  "#7a8799": "--c-disabled-fg",
  "#dfe7f0": "--c-disabled-bg",
  "#9cabbd": "--c-disabled-line",
  "#667892": "--c-placeholder",
  "#8997a9": "--c-offline",
  "rgba(7,93,255,0.1)": "--c-grid-bold",
  "rgba(7,93,255,0.09)": "--c-grid-strong",
  "rgba(7,93,255,0.08)": "--c-grid",
  "rgba(7,93,255,0.075)": "--c-grid-mobile",
  "rgba(7,93,255,0.07)": "--c-grid-h-strong",
  "rgba(7,93,255,0.06)": "--c-grid-h",
  "rgba(7,93,255,0.055)": "--c-grid-h-soft",
  "rgba(7,93,255,0.16)": "--c-glow-blue-16",
  "rgba(7,93,255,0.18)": "--c-glow-blue-18",
  "rgba(7,93,255,0.2)": "--c-glow-blue-20",
  "rgba(7,93,255,0.22)": "--c-glow-blue-22",
  "rgba(7,93,255,0.25)": "--c-glow-blue-25",
  "rgba(7,93,255,0.28)": "--c-glow-blue-28",
  "rgba(7,93,255,0.3)": "--c-glow-blue-30",
  "rgba(39,220,255,0.95)": "--c-glow-cyan",
  "rgba(39,220,255,0.4)": "--c-glow-cyan-soft",
  "rgba(237,255,61,0.7)": "--c-glow-yellow",
  "rgba(237,255,61,0.35)": "--c-glow-yellow-soft",
  "rgba(195,220,0,0.22)": "--c-glow-lime",
  "rgba(10,16,32,0.14)": "--c-ink-a14",
  "rgba(10,16,32,0.16)": "--c-ink-a16",
  "rgba(10,16,32,0.2)": "--c-ink-a20",
  "rgba(10,16,32,0.25)": "--c-ink-a25",
  "rgba(10,16,32,0.28)": "--c-ink-a28",
  "rgba(10,16,32,0.45)": "--c-ink-a45",
  "rgba(10,16,32,0.52)": "--c-ink-a52",
  "rgba(17,26,45,0.25)": "--c-line-a25",
  "rgba(16,55,111,0.13)": "--c-shade-blue",
  "rgba(16,55,111,0.11)": "--c-shade-blue-sm",
  "rgba(22,60,111,0.08)": "--c-shade-card",
  "rgba(22,60,111,0.12)": "--c-shade-card-md",
  "rgba(0,32,126,0.28)": "--c-cup-inner",
  "rgba(255,255,255,0.94)": "--c-card",
  "rgba(255,255,255,0.92)": "--c-card-glass",
  "rgba(255,255,255,0.96)": "--c-card-frost",
  "rgba(255,255,255,0.97)": "--c-card-bar",
  "rgba(255,255,255,0.9)": "--c-white-a90",
  "rgba(255,255,255,0.7)": "--c-white-a70",
  "rgba(255,255,255,0.22)": "--c-white-a22",
};

const norm = (raw) => {
  let s = raw.toLowerCase().replace(/\s+/g, "");
  if (/^#[0-9a-f]{3}$/.test(s)) s = "#" + s.slice(1).split("").map((c) => c + c).join("");
  return s;
};

const unknown = new Map();
css = css.replace(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g, (raw) => {
  const n = norm(raw);
  if (n === "transparent") return raw;
  if (colorMap[n]) return `var(${colorMap[n]})`;
  unknown.set(n, (unknown.get(n) || 0) + 1);
  return raw;
});

/* 4. 字体栈 */
css = css.replace(
  /font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;/,
  "font-family: var(--font-sans);"
);

/* 5. 描边宽度 */
css = css.replace(/(border[a-z-]*:[^;]*?)\b1\.5px\b/g, "$1var(--stroke)");
css = css.replace(/(border[a-z-]*:[^;]*?)\b1px solid\b/g, "$1var(--stroke-thin) solid");
css = css.replace(/(border[a-z-]*:[^;]*?)\b2px solid\b/g, "$1var(--stroke-bold) solid");

/* 6. 圆角 */
css = css.replace(/border-radius: 999px;/g, "border-radius: var(--radius-pill);");

/* 7. 硬阴影偏移：Npx Npx 0 (方形位移) 与 0 Npx 0 (纯下沉) */
const hs = (n) => "var(--hs-" + String(n).replace(".", "-") + ")";
css = css.replace(/\b(\d+(?:\.\d+)?)px \1px 0\b/g, (m, n) => `${hs(n)} ${hs(n)} 0`);
css = css.replace(/\b0 (\d+(?:\.\d+)?)px 0 var\(/g, (m, n) => `0 ${hs(n)} 0 var(`);
css = css.replace(/\b0 (\d+(?:\.\d+)?)px 0 #/g, (m, n) => `0 ${hs(n)} 0 #`);
css = css.replace(/box-shadow: (\d+)px 0 0 var\(/g, (m, n) => `box-shadow: ${hs(n)} 0 0 var(`);
css = css.replace(/box-shadow: -(\d+)px 0 0 var\(/g, (m, n) => `box-shadow: calc(-1 * ${hs(n)}) 0 0 var(`);
css = css.replace(/box-shadow: (\d+)px 0 0 rgba/g, (m, n) => `box-shadow: ${hs(n)} 0 0 rgba`);

fs.writeFileSync(P, css);
console.log("unknown colors:", [...unknown.entries()]);
