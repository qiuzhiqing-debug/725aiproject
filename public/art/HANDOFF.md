# 《理想型加载中》美术资产交接

## 当前批次

- 批次：R12 / 第一批 / #01-#04 m 版
- 执行模式：Image 2 / built-in image generation
- 状态：首批已完成，8 张均通过基础视觉验收，等待 Kim 审美会签
- 约束：仅制作 #01-#04 男版，每型号 2 张候选；不改代码、不接线、不部署。
- 盘点：开始时 `public/art` 不存在，无既有同名资产。

## 统一提示词骨架

```text
Use case: stylized-concept
Asset type: retro dating-sim male character sprite for game
Scene/backdrop: dark purple night bar backdrop with pink and cyan neon glow
Style/medium: flat modern pixel art, chunky visible pixels, limited retro palette, 2D flat shading, stylish y2k fashion illustration, clean silhouette, retro dating-sim character sprite
Composition/framing: 2:3 vertical portrait, waist-up, centered, confident pose, generous safe margins, readable at game UI size
Constraints: one young adult man only; exact required prop/action; clearly masculine presentation; no text; no logo; no watermark
Avoid: anime CG face, 3D render, photorealistic, painterly, soft gradient skin, guofeng, delicate detailed face, high detail, extra people, malformed hands, irrelevant props
```

## 资产记录

| 文件 | 型号 | 变体 | 提示词差异 | 状态 | 检查/原因 |
|---|---|---|---|---|---|
| `type-01-m-a.png` | 01 人形保险柜 | a | composed, guarded, buttoned-up; arms crossed; closed collar | 待选 | 通过：守备感强、交叉手臂与闭领准确；男向、粗像素、夜吧、构图与无字水印均合格 |
| `type-01-m-b.png` | 01 人形保险柜 | b | 同上，独立候选 | 待选 | 通过：更制服化、表情克制；动作/领口/男向/风格/构图均合格 |
| `type-02-m-a.png` | 02 透明人 | a | open, unguarded, easygoing; loose shirt; open palms | 待选 | 通过：双掌开放、衬衫松弛，外向易接近；男向与游戏构图合格 |
| `type-02-m-b.png` | 02 透明人 | b | 同上，独立候选 | 待选 | 通过：双掌开放、白色宽松衬衫，形象更明快；无文字/水印 |
| `type-03-m-a.png` | 03 行程总导演 | a | organized, commanding planner; checklist and pen | 待选 | 通过：清单方框/线条无可读文字，笔与握持清楚；指挥感较强 |
| `type-03-m-b.png` | 03 行程总导演 | b | 同上，独立候选 | 待选 | 通过：清单和笔准确，神情更严谨；男向、像素风、构图合格 |
| `type-04-m-a.png` | 04 副驾DJ | a | carefree passenger vibe; headphones around neck; thumbs up | 待选 | 通过：耳机在颈部、单手点赞准确；轻松但相对内敛 |
| `type-04-m-b.png` | 04 副驾DJ | b | 同上，独立候选 | 待选 | 通过：耳机在颈部、单手点赞准确；笑容更有副驾玩伴感 |

## 文件规格与淘汰记录

- 8 张均为 PNG，`1024×1536`，严格 2:3 竖版。
- 全部通过：型号辨识度、统一粗像素风、男性方向、指定道具/动作、游戏可用构图、无水印/乱码/多余文字。
- 本批没有淘汰图，因此未创建空的 `discarded/`；若后续出现失败候选，将保留到该子目录并记录原因。
- 视觉判断提示：同型号 a/b 的轮廓与气质差异可供选择，但整体美术语言保持紧密一致；本记录只做基础专业验收，不替代 Kim 的审美会签。

## 下一步

1. Kim / 总控审美会签 #01-#04 的 a/b 候选。
2. 收到会签后再决定是否继续 #05-#16 m 版或对首批做单点迭代。
3. 未经会签不生成 f 版，也不改产品代码、不接线、不部署。
