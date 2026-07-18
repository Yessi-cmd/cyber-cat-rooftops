# M3 素材清单与权属记录

状态值：`planned`、`draft`、`review`、`approved`、`rejected`。只有 `approved` 素材可以进入发布构建。

## 概念与方向

| ID | 文件 | 用途 | 状态 | 作者/来源 | 许可 |
| --- | --- | --- | --- | --- | --- |
| CONCEPT-M3-V1 | `docs/assets/m3-visual-concept-board-v1.png` | 轮廓、调色板和场景层级参考；不进入生产包 | approved | OpenAI 内置图像生成，为本项目生成 | 项目设计参考 |

## 角色

| ID | 建议文件 | 单元格 | 帧数 | 优先级 | 状态 | 作者/来源 | 许可 |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| CAT-IDLE | `src/render/cat-animation.ts` | 32×32 | 4 | P0 | review | 代码原生像素帧，已通过状态与减少动态测试 | 项目原创 |
| CAT-RUN | `src/render/cat-animation.ts` | 32×32 | 6 | P0 | review | 代码原生像素帧，已通过 360px 与桌面切片检查 | 项目原创 |
| CAT-JUMP | `src/render/cat-animation.ts` | 32×32 | 2 | P0 | review | 代码原生上升帧，已通过速度边界测试 | 项目原创 |
| CAT-APEX | `src/render/cat-animation.ts` | 32×32 | 1 | P0 | review | 代码原生顶点帧 | 项目原创 |
| CAT-FALL | `src/render/cat-animation.ts` | 32×32 | 2 | P0 | review | 代码原生下落帧，已通过速度边界测试 | 项目原创 |
| CAT-LAND | `src/render/cat-animation.ts` | 32×32 | 3 | P0 | review | 代码原生 132ms 落地帧，脚底与碰撞盒对齐 | 项目原创 |
| CAT-FAIL | `src/render/cat-animation.ts` | 32×32 | 4 | P0 | review | 代码原生失败帧，减少动态时冻结 | 项目原创 |

角色元数据记录在 `src/render/cat-animation.ts`：底部以 `24×28` 碰撞盒为锚点，并集中定义帧数、帧率、落地时长和是否循环。PNG 文件名保留为未来需要导出精灵表时的建议，不是 MVP 的发布依赖。

## 屋顶与场景模块

| ID | 建议文件 | 尺寸 | 变体 | 优先级 | 状态 | 作者/来源 | 许可 |
| --- | --- | ---: | ---: | --- | --- | --- | --- |
| ROOF-TOP | `roof-top.png` | 16×16 | 4 | P0 | review | 当前 Canvas 原型，已通过四视口切片检查 | 项目原创 |
| ROOF-BRICK | `roof-brick.png` | 16×16 | 6 | P0 | review | 当前 Canvas 原型，已通过四视口切片检查 | 项目原创 |
| ROOF-EDGE | `src/render/renderer.ts` | 3×8 边帽 | 2 | P0 | review | 代码原生像素模块，四视口边界检查通过 | 项目原创 |
| PROP-VENT | `src/render/renderer.ts` | 24×20 | 1 | P1 | review | 代码原生像素模块，确定性位置与安全边距测试通过 | 项目原创 |
| PROP-ANTENNA | `src/render/renderer.ts` | 18×36 | 1 | P1 | review | 代码原生像素模块，使用低对比轮廓 | 项目原创 |
| PROP-WATER-TANK | `src/render/renderer.ts` | 44×48 | 1 | P1 | review | 代码原生像素模块，仅出现于至少 196px 宽平台 | 项目原创 |
| PROP-LAUNDRY | `prop-laundry.png` | 64×32 | 2 | P2 | planned | 待制作 | 项目原创 |
| PROP-PLANT | `prop-plant.png` | 16×20 | 3 | P2 | planned | 待制作 | 项目原创 |
| HAZARD-01 | `hazard-electric.png` | 待定 | 1 套 | P2 | planned | 需求待确认 | 项目原创 |

## 背景与环境

| ID | 建议文件 | 目标宽度 | 层级 | 优先级 | 状态 | 作者/来源 | 许可 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| BG-SKY | 代码渐变或 `bg-sky.png` | 可扩展 | 天空 | P0 | review | 当前 Canvas 渐变，已检查手机与 1055 逻辑宽度 | 项目原创 |
| BG-FAR | `bg-city-far.png` | ≥1100 | 远景 | P0 | review | 当前 Canvas 生成层，已检查无空白或明显接缝 | 项目原创 |
| BG-MID | `bg-city-mid.png` | ≥1100 | 中景 | P0 | review | 当前 Canvas 生成层，已检查不与平台顶边竞争 | 项目原创 |
| BG-TRANSIT | `bg-transit.png` | 128×48 | 远景动画 | P2 | planned | 待制作 | 项目原创 |
| FX-STEAM | `src/render/renderer.ts` | ≤21×34 | 近景效果 | P1 | review | 代码原生低对比像素块；减少动态时关闭 | 项目原创 |
| FX-LAND-DUST | `fx-land-dust.png` | 32×16 | 落地效果 | P1 | planned | 待制作 | 项目原创 |
| FX-SPARK | `fx-spark.png` | 16×16 | 危险提示 | P2 | planned | 待制作 | 项目原创 |

背景必须在 390 与约 1055 逻辑宽度下检查平铺接缝。远景不能包含与可玩平台相似的高亮长横线。

## UI 与发布素材

| ID | 建议文件 | 尺寸 | 优先级 | 状态 | 作者/来源 | 许可 |
| --- | --- | ---: | --- | --- | --- | --- |
| UI-LOGO | `public/favicon.svg` + DOM | 32/40px | P1 | review | 代码原生猫头像与标题锁定组合，待实机复验 | 项目原创 |
| UI-ICONS | `src/ui/icons.ts` | 24×24 网格 | P1 | review | 代码原生 SVG 像素图标，含声音开/关与暂停 | 项目原创 |
| UI-PANEL | DOM/CSS 优先 | 可扩展 | P0 | review | 当前代码，已通过 360/390/430/桌面检查 | 项目原创 |
| FONT-TITLE | 字体文件 | 子集化 | P1 | planned | 待选择 | 必须记录具体许可 |
| OG-CARD | `public/og-card.jpg` | 1200×630 | P1 | review | OpenAI 内置图像生成；M3 概念板仅作风格参考；本地缩放压缩 | 项目原创生成素材 |
| FAVICON | `public/favicon.svg` | 32×32 viewBox | P1 | review | 代码原生矩形像素图，未加载第三方素材 | 项目原创 |

UI 可以由 DOM/CSS 实现时优先保留代码形式，不为像素风强行把正文和按钮烘焙成图片。

## 音效

| ID | 实现 | 用途 | 优先级 | 状态 | 作者/来源 | 许可 |
| --- | --- | --- | --- | --- | --- | --- |
| SFX-JUMP | Web Audio 振荡器 | 起跳反馈 | P0 | approved | 项目内原创程序化音色 | 项目原创 |
| SFX-LAND | Web Audio 振荡器 | 落地反馈 | P0 | approved | 项目内原创程序化音色 | 项目原创 |
| SFX-SCORE | Web Audio 振荡器 | 新平台得分反馈 | P0 | approved | 项目内原创程序化音色 | 项目原创 |
| SFX-FAIL | Web Audio 振荡器 | 失败反馈 | P0 | approved | 项目内原创程序化音色 | 项目原创 |
| AMBIENCE-LOOP | 待定 | 极轻环境循环音 | P1 | planned | 待制作 | 项目原创 |

程序化短音效不加载外部文件，不产生第三方素材许可依赖；无法创建或恢复音频上下文时静默降级，不阻塞玩法。

## 每项素材的完成定义

- 符合 `docs/ART_DIRECTION.md` 的调色板、网格和信息层级。
- 在手机与桌面宽屏中以实际尺寸检查过，而非只在绘图软件中放大检查。
- 透明边缘无抗锯齿脏像素，平铺素材无可见接缝。
- 文件名、帧顺序、锚点和动画速度已记录。
- 作者、原始来源、许可和修改说明完整。
- 进入 `review` 后经过至少一次视觉与玩法联合检查。
- 标记为 `approved` 后才接入生产资源加载流程。

## 权属记录格式

原创素材填写实际制作人和日期。第三方字体或音效必须追加：

```text
名称：
作者/组织：
原始链接：
许可证名称与版本：
许可证文件或归档位置：
是否允许商用与修改：
是否需要署名：
项目内修改：
核对日期：
```
