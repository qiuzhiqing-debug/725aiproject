# 生图提示词包 R12（Kim 用 image2 生成 → 存入文件夹 → 我接线）

## 使用方法

1. 每个条目生成 **2-4 张**备选，全部丢进对应文件夹（我来筛，你不用挑）
2. 文件夹：`d:\AIgo\理想型加载中\满分男\public\art\`（不存在就建）
3. 命名规则（备选加 -a/-b/-c 后缀）：
   - 型号立绘：`type-01-m-a.png`（01-16 = 型号编号，m/f = 方向）
   - 雪克：`xueke-main-a.png`、`xueke-sticker-<情绪>-a.png`
   - 背景：`bg-home-a.png`、`bg-lobby-a.png`
4. 尺寸：立绘 **2:3 竖版**（832×1248 或 1024×1536）；贴纸 1:1；背景 9:16 竖版
5. 你生成完说一声"图放好了"，我派线接入（有文件用文件，缺的型号自动回退在线生图）

## 统一风格锚（每条提示词开头都带这段，保证整套一致）

```
flat modern pixel art, chunky visible pixels, limited retro palette,
2D flat shading, stylish y2k fashion illustration, dark purple night bar backdrop
with pink and cyan neon glow, clean silhouette, retro dating-sim character sprite
```

反向提示（你的工具若支持 negative prompt）：
```
anime CG face, 3D render, photorealistic, painterly, soft gradient skin,
guofeng, delicate detailed face, high detail
```

> 方向说明：平面、摩登、精度刻意低（Kim 定稿）。宁可像千禧年游戏立绘，不要国漫精修脸。

## 一、16 型号立绘（每型号 m/f 各一条，共 32 条）

模板（把【】换成型号气质词）：
```
<风格锚>, portrait of a 【气质描述】 young man(woman),
【标志性道具/动作】, confident pose, waist-up
```

| # | 型号 | 气质描述 (EN) | 标志道具/动作 |
|---|---|---|---|
| 01 | 人形保险柜 | composed, guarded, buttoned-up | arms crossed, closed collar |
| 02 | 透明人 | open, unguarded, easygoing | loose shirt, open palms |
| 03 | 行程总导演 | organized, commanding planner | holding a checklist and pen |
| 04 | 副驾DJ | carefree passenger vibe | headphones around neck, thumbs up |
| 05 | 人形充电宝 | warm, comforting, radiant | offering a warm drink |
| 06 | 沉默投喂机 | cool face, soft heart | holding out a snack, looking away |
| 07 | 细节收藏家 | romantic, observant | holding a small gift box |
| 08 | 周三魔法师 | quiet surpriser | hiding flowers behind back |
| 09 | 游乐场厂长 | playful, high energy | party popper in hand |
| 10 | 沙发钉子户 | cozy homebody | wrapped in blanket, holding remote |
| 11 | 对线艺术家 | witty, chaotic, meme lord | smug grin, phone in hand |
| 12 | 人形翻译器 | earnest, literal, serious | adjusting glasses |
| 13 | 首席财务官 | sharp, calculating | calculator and small ledger |
| 14 | 破产美食家 | broke but happy foodie | holding skewers, empty wallet peeking |
| 15 | 热梗批发商 | terminally online, trendy | scrolling phone, laughing |
| 16 | 词典派学者 | innocent, bookish, offline | holding a paper dictionary |

示例成品（#05 男版）：
```
flat modern pixel art, chunky visible pixels, limited retro palette, 2D flat shading,
stylish y2k fashion illustration, dark purple night bar backdrop with pink and cyan
neon glow, clean silhouette, retro dating-sim character sprite, portrait of a warm,
comforting, radiant young man, offering a warm drink, confident pose, waist-up
```

## 二、雪克（可选，SVG 版已能用，图版是升级）

主立绘 `xueke-main`：
```
<风格锚>, cute round-headed wooden robot bartender, warm wood body with brass
joints, bartender vest, antenna with a green olive on top, big round earnest eyes,
slightly serious deadpan expression, polishing a glass behind a bar counter
```
贴纸 8 情绪（shock / frown / deadpan / nod / cheers / smug / sleepy / sparkle）：主立绘句 + `chibi big-head sticker, exaggerated 【情绪】 expression, transparent background`

## 三、背景（可选）

`bg-home`（首页/通用竖版）：
```
<风格锚>, empty night bar interior, tall shelves full of liquor bottles,
hanging lamps, one pink neon martini sign, pixel art paintings on the wall,
no people, vertical composition, atmospheric
```
`bg-lobby`：同上 + `long bar counter in foreground, cozy booth seats along the wall`

## 优先级建议

1. **先出 #01-#16 的 m 版**（满分男是主打）→ 我接线立刻见效
2. 再补 f 版 → 满分女齐
3. 雪克贴纸/背景随缘，SVG 版本已经在线顶着
