# M4 首次部署验收记录

日期：2026-07-18
生产地址：`https://game.norliva.top/`
部署提交：`25ec5d6e762f`
服务器 release：`20260718T124235Z-25ec5d6e762f`

## 基础设施

- Cloudflare DNS：`game.norliva.top` 独立 `A` 记录，代理开启，TTL Auto；未修改 `norliva.top` 原有 Tunnel 记录。
- RackNerd VPS：SSH 别名 `racknerd-vps`，Caddy `v2.11.4` 监听 80/443。
- Caddy 主配置保留原有 `laoxitv.top`、`www.laoxitv.top` 和 `chat.laoxitv.top`，新增 `/etc/caddy/sites-enabled/*.caddy` import；修改前配置已在服务器带时间戳备份。
- `game.norliva.top` 的正式 ACME 证书签发成功，Caddy 配置验证通过且服务保持 active。
- 静态文件位于版本化 release 目录，`current` 通过绝对软链接原子切换；部署脚本保留最近 5 个版本。

## 响应与缓存

| 路径 | 结果 | 缓存 |
| --- | --- | --- |
| `/` | HTTPS 200，HTML | `Cache-Control: no-cache` |
| `/assets/index-1vTlxZDM.js` | HTTPS 200 | `public, max-age=31536000, immutable`；Cloudflare HIT 已观察到 |
| `/og-card.jpg` | HTTPS 200，133172 bytes | `public, max-age=86400` |
| 源站 HTTP `/` | 308 到正式 HTTPS URL | 不适用 |

响应包含 CSP、Permissions Policy、Referrer Policy、HSTS、`nosniff` 和 `DENY` frame 策略。HTML 内 canonical、`og:url`、`og:image` 与 `twitter:image` 均使用 `https://game.norliva.top/` 绝对地址。

## 公网浏览器验收

- 新标签页可加载标题“赛博小猫跳楼顶”，准备态分数为 `0000`。
- 开始后出现暂停按钮；暂停显示“稍作休息”，继续后返回游玩态。
- 游玩中静音切换为“开启声音”且 `aria-pressed=true`，没有误触跳跃。
- 不操作时正常进入游戏结束，本次 20 分；“再来一局”后分数重置并可再次暂停。
- 首次 DNS 传播期间曾短暂出现连接关闭/525；Caddy 在记录可解析后完成正式证书签发，随后新建浏览器标签页完整路径通过。

## 尚未完成

- 用户需直接在生产地址完成 iPhone 环境音、减少动态与连续三局签字。
- Android Chrome 真实设备仍未覆盖。
- Chrome/Safari/Edge 完整矩阵、Lighthouse/Web Vitals、断网与错误页检查属于后续 M4 工作。
