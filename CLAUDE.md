# 满分男 · 协作规则（人和 agent 都必须遵守）

线上地址：https://manfen-nan.kimnin-iup.workers.dev/
仓库：https://github.com/qiuzhiqing-debug/725aiproject

## 一、分工按「文件所有权」切，不按功能切

两条线并行：**功能线（Kim）** 和 **样式线（同事）**。每个文件只有一个主人，
不是自己的文件**一行都不许改**，需要改就在 commit message 里写清楚请对方改。

| 文件 | 主人 | 说明 |
|---|---|---|
| `public/theme.css` | 样式线 | **配色/字体/圆角/阴影的唯一真源**，随便改，永不冲突 |
| `public/style.css` | 样式线 | 布局与组件样式 |
| `public/index.html` | 功能线 | 结构；样式线要新 class 钩子请提 issue/口头说 |
| `public/app.js` | 功能线 | 前端逻辑 |
| `public/fx.js` | 功能线 | 音效与特效 |
| `public/questions.js` | 功能线 | 题库 |
| `public/poster.js` | 功能线 | 海报绘制（配色从 theme.css 变量读，见下） |
| `src/worker.js` | 功能线 | 后端 |
| `test/` | 功能线 | 冒烟测试 |

**样式线的硬约束：只改 CSS，不改 JS/HTML。** 想换颜色 → 改 `theme.css` 变量；
想改布局 → 改 `style.css`。这样两条线的改动永远落在不同文件，git 自动合并，零整合成本。

`poster.js` 画海报时从 `theme.css` 的 CSS 变量取色（`getComputedStyle`），所以样式线
改 `theme.css` 海报配色会跟着变，不需要动 JS。

## 二、Git 流程：都推 main，不开 PR，小步快推

主干只有 `main` 一条。**不要开长命分支，不要走 PR 评审**——两个 agent 干活，
PR 的等待时间就是最大的整合成本。

每个 agent 每次动手前后各一条命令：

```bash
# 动手前（拉最新，rebase 不产生合并提交）
git pull --rebase

# 自验通过后立刻推（一个小改动一个 commit，别攒）
git add -A && git commit -m "style: 换主色为汽水橙" && git pull --rebase && git push
```

已配置 `pull.rebase=true`，直接 `git pull` 就是 rebase。

**推送频率决定整合痛苦程度**：改完一处、自验通过就推，不要攒一天。
攒得越久越容易撞车。

懒人一键：`sync.ps1`（拉取 → 提交 → 推送，一步到位）

```powershell
.\sync.ps1 "style: 调整弹幕字号"
```

## 三、撞车了怎么办

按上面的分工基本不会撞。真撞了（同一文件同一段）：

- CSS 冲突 → **样式线说了算**，功能线 `git checkout --theirs public/style.css`
- JS 冲突 → **功能线说了算**
- 谁都别用 `git push --force`，会把对方的提交冲掉

## 四、交付前必做

改了任何用户可见页面，报告"完成"之前必须跑双视口截图 QA（390×844 手机图更重要）：
`D:\skills\web-delivery-qa\SKILL.md`。没有截图不算完成。

后端/逻辑改动必须跑 `node test/smoke.mjs` 全绿才算完成。
