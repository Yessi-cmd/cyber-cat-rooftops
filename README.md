# 赛博小猫跳楼顶（Cyber Cat Rooftops）

一款面向公开用户的竖屏像素风跑酷网页游戏：可爱的小猫在温暖的赛博城市楼顶间持续跳跃。画面向下滚动，速度与难度随分数提升。

## 项目状态

M1/M2 工程校准已完成，iPhone Safari 最新修复回归通过；Android 验证保留到 M4，当前正在推进 M3 美术、音效与可访问性。当前包含：

- 固定步长游戏循环、状态机、自动奔跑和单次跳跃。
- 确定性且经过批量种子验证的平台生成。
- 键盘、鼠标、单指触控、自动暂停、失败与一键重开。
- 原创 Canvas 像素视觉垂直切片、响应式布局和本地最高分。
- 桌面宽屏扩展视野：保持相同物理尺度，同时展示更多前方楼顶。
- 原生 Web Audio 程序化短音效、持久化静音和减少动态效果支持。

当前视觉切片已经通过四个目标视口检查；代码原生像素动画已覆盖待机、跑动、上升、顶点、下落、落地和失败，确定性屋顶模块已包含屋檐边帽、通风口、天线、水箱和可关闭蒸汽。发布视觉现已包含统一像素控制图标、标题锁定组合、favicon 与 1200×630 Open Graph 卡；环境音和低性能设备检查仍在 M3 范围内。校准参数和实机检查方法见 [试玩记录](docs/PLAYTEST.md)。

M3 制作依据：

- [视觉规范](docs/ART_DIRECTION.md)
- [素材清单与权属记录](docs/ASSET_MANIFEST.md)
- [真实手机验收手册](docs/PHONE_ACCEPTANCE.md)
- [M2 实机验收记录](docs/M2_ACCEPTANCE_REPORT.md)
- [M3 概念板与方向记录](docs/M3_CONCEPT_NOTES.md)
- [M3 阶段验收记录](docs/M3_ACCEPTANCE_REPORT.md)
- [M3 发布视觉记录](docs/M3_RELEASE_VISUALS.md)

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

质量检查：

```bash
npm run typecheck
npm test
npm run build
```

## 目标体验

- 打开链接后立刻能玩，无需账号或教程。
- 单次操作：跳跃；失败后可一键重开。
- 手机触屏与电脑键盘/鼠标同样顺手。
- 一局约 20–90 秒，适合分享、反复挑战和冲榜。

详见 [详细计划书](docs/PLAN.md)。
