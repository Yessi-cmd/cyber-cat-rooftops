# M3 发布视觉记录

日期：2026-07-18  
范围：控制图标、标题锁定组合、favicon 与 Open Graph 分享卡

## 1. 运行时 UI

- 声音开启、声音关闭和暂停统一使用 `24×24` 代码原生 SVG 像素网格，按钮触控区域继续保持 `44×44` CSS px。
- 图标只作视觉表达，按钮状态仍通过 `aria-label` 与 `aria-pressed` 提供给辅助技术。
- 开始、暂停和失败面板共用 36px 猫头像标记、英文眉题和中文主标题；正文继续使用高可读系统字体，不引入字体下载。
- 主标题只增加克制的像素阴影与紧凑字距，不使用持续动画，不影响减少动态偏好。

## 2. Favicon

- 文件：`public/favicon.svg`
- 画布：`32×32` 逻辑像素，全部由矩形色块构成并使用 `shape-rendering="crispEdges"`。
- 内容：夜紫底、橘白猫头、珊瑚围巾和暖黄屋顶线。
- 作者/来源：项目内代码原生设计。

## 3. Open Graph 分享卡

- 文件：`public/og-card.jpg`
- 尺寸：`1200×630`，JPEG 约 132 KB。
- 作者/来源：OpenAI 内置图像生成，以本项目 M3 概念板作为风格参考；为本项目生成的新构图。生成原图经本地等比微调至标准分享尺寸并压缩，不加载到正常游戏首屏。
- 权属：项目原创生成素材，无第三方商标、角色或游戏素材。

最终生成提示：

```text
Use case: stylized-concept
Asset type: Open Graph social share card background for the web game “Cyber Cat Rooftops”
Input images: Image 1 is a style and palette reference only; create a new original composition, do not copy its layout
Primary request: a warm pixel-art night rooftop scene with one small cream-orange cat wearing a coral scarf, caught mid-jump between rooftops
Scene/backdrop: deep indigo-violet night sky, layered low-contrast city silhouettes, a few warm windows, one water tank and one short antenna as secondary rooftop details
Style/medium: crisp handcrafted 16-bit pixel-art illustration, hard pixel edges, no antialiasing, limited palette matching deep navy, violet, warm amber, cream orange, and coral
Composition/framing: exact wide 1200×630 share-card composition; reserve the left 44% as calm dark negative space for later title typography; place the cat near the right-center, clearly above a warm continuous roof edge; keep all important subjects inside a 70px safe margin
Lighting/mood: cozy, adventurous, inviting rather than dystopian; warm window light against a calm night
Constraints: no text, no letters, no logos, no watermark; exactly one cat; scarf clearly trails opposite the jump direction; readable silhouette at thumbnail size; platform edges must remain horizontal and clear
Avoid: photorealism, 3D rendering, dense neon, cold cyberpunk clutter, violence, recognizable commercial game characters, tiny noisy details in the left negative-space area
```

当前 `og:image` 使用站点根路径 `/og-card.jpg`。正式域名尚未确定，M4 部署时再补绝对分享 URL，避免提前硬编码错误域名。
