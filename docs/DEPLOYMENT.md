# RackNerd VPS 部署手册

生产地址：`https://game.norliva.top/`

## 架构

- Cloudflare 管理 `norliva.top` DNS，并代理 `game` 子域流量。
- RackNerd VPS 通过 SSH 别名 `racknerd-vps` 管理。
- Caddy 监听 80/443、申请源站证书、压缩响应并提供安全与缓存响应头。
- 静态文件保存在 `/var/www/cyber-cat-rooftops/releases/<时间>-<commit>`。
- `/var/www/cyber-cat-rooftops/current` 原子指向当前版本，服务器保留最近 5 个 release。

## 首次安装

1. 在 Cloudflare 为 `game.norliva.top` 创建 proxied `A` 记录，内容指向 RackNerd VPS IPv4，TTL 为 Auto。
2. 将 `deploy/Caddyfile.game.norliva.top` 上传到 `/etc/caddy/sites-enabled/game.norliva.top.caddy`。
3. 在 `/etc/caddy/Caddyfile` 末尾加入：

   ```caddyfile
   import /etc/caddy/sites-enabled/*.caddy
   ```

4. 执行 `caddy validate --config /etc/caddy/Caddyfile`，验证通过后运行 `systemctl reload caddy`。

## 日常发布

从干净且已推送的 `main` 分支运行：

```bash
npm run deploy:vps
```

脚本会重新运行单测与生产构建，上传到新的 release 目录，再原子切换 `current`。它不会修改 DNS 或 Caddy 配置。

## 验证

```bash
curl -I https://game.norliva.top/
curl -I https://game.norliva.top/assets/<当前哈希文件>
```

确认首页为 `200`、HTTPS 正常、HTML 为 `Cache-Control: no-cache`，哈希资源为一年 immutable 缓存。还需在真实浏览器完成开始、暂停、静音、失败与重开路径。

## 回滚

在服务器列出版本：

```bash
find /var/www/cyber-cat-rooftops/releases -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r
```

将 `current` 原子切回目标绝对路径：

```bash
ln -s /var/www/cyber-cat-rooftops/releases/<目标版本> /var/www/cyber-cat-rooftops/current.next
mv -Tf /var/www/cyber-cat-rooftops/current.next /var/www/cyber-cat-rooftops/current
```

静态文件切换不需要重启 Caddy。回滚后重新检查首页、哈希资源和核心游戏路径。
