# 办公外观生产部署记录

部署时间：2026-10-02 21:22（Asia/Shanghai）。最终状态复核：2026-10-03。

- 生产地址：https://game.norliva.top/
- 分支：main；应用提交：b33a796f0243583993a6d95f6c0941ce3bb035a3，已推送 origin/main。
- 版本目录：/var/www/cyber-cat-rooftops/releases/20261002T132233Z-b33a796f0243。
- 前一版本：/var/www/cyber-cat-rooftops/releases/20261002T025727Z-fb9b9ea5975a，仍保留用于回滚。
- Git 作者按用户确认仅配置到当前仓库：Yessi-cmd <465948141@qq.com>。

## 发布方式

本机缺少 Bash/rsync，使用 PowerShell、Windows OpenSSH 和 SCP 执行等效发布：确认工作区干净且 HEAD 与上游一致，运行测试和构建，上传到全新版本目录，校验文件、设置 caddy 权属与权限，再通过 current.next 和 mv -Tf 原子切换 current。未修改 DNS 或 Caddy 配置。服务器当前只有三个版本，无需清理。

## 验证

- 42 项单测、TypeScript 检查、Vite 生产构建通过。
- 公网首页 HTTP 200，文档式标题与新脚本 index-nat0oGAE.js 已生效；HTML 使用 no-cache。
- 新脚本 HTTP 200，缓存为 public, max-age=31536000, immutable。
- 本地与源站脚本 SHA-256 一致：05ac2db0ea3f0938e217f8786c1f31249067e937a4a7b339b29daa48b756bbc0。
- 生产浏览器验证首次静音、开始、Esc/P 连续暂停不恢复、暂停收起画面、点击继续、失败、指针重开、暂停按钮和声音开启状态。
- 2026-10-03 复核 current 仍指向本次版本，公网首页仍返回新脚本。

## 尚未验证

iPhone Safari、Android Chrome 实机和完整跨浏览器矩阵尚未复验；不能以浏览器尺寸模拟替代实机验收。分享卡和 favicon 保留原猫品牌素材。

本记录为部署后的文档提交，不改变生产构建；线上应用版本以 b33a796 为准。
