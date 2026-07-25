# 理想型立绘资产

本目录是乙游人物立绘的项目资产位。当前会话没有暴露内置 `image_gen`，所以没有私自切换到 CLI/API，也没有用 SVG 或低质占位图冒充最终立绘。

`../../ideal-profile.js` 已提供：

- 6 种一眼可辨的乙游人物原型；
- 16 种 MBTI 穿搭主色；
- 不含昵称、自由文本、联系方式的安全 Prompt；
- 可直接用于 `<img>` 的稳定远程生图 URL；
- 立绘 → 相亲人物档案 → 相处细节三段式数据。

`prompts.json` 保存 6 张基准立绘的完整生产 Prompt。以后内置生图能力可用时，应逐张生成、人工检查脸/手/服装/高对比度，再以只增不删方式保存为：

```text
power-ceo-v1.webp
sunny-puppy-v1.webp
steady-guardian-v1.webp
frost-scholar-v1.webp
wild-charmer-v1.webp
gentle-artist-v1.webp
```

基准方向：亮白高键背景、电光蓝结构色、MBTI 决定服装主色、硬朗干净阴影。禁止低对比灰雾、米色主导、紫色渐变糊成一片，以及对现有乙游角色的复刻。

