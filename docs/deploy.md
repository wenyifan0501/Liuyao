# 发布部署（单机 Docker Compose）

网站与 API 必须同源：前端请求固定走相对路径 `/api`，服务端校验 `Origin` 严格等于 `APP_ORIGIN`，会话 Cookie 是 `SameSite=Strict; Secure`。因此不采用「前端 Vercel/Pages + 后端独立域名」的分离方案，而由一台服务器同时提供页面与接口。

## 结构

```text
浏览器 ──► Caddy (80/443, 自动 HTTPS)
              ├─ /api/*  ──► api:3000   (Fastify + AI Worker)
              └─ 其余路径 ──► /srv        (dist/web 静态文件)
                                api ──► postgres:5432 (仅内网)
```

PostgreSQL 不对公网暴露端口；API 不映射端口，只通过 `expose` 供 Caddy 访问。API 必须单实例：AI Worker 依赖进程内轮询与数据库 advisory lock，限流计数也在进程内存中，多副本会导致重复生成与限流失真。

## 固定成本

| 项目 | 参考 | 说明 |
| --- | --- | --- |
| 云主机 2C2G | 境外约 $6/月，境内/香港轻量按官网价 | Postgres + Node 合计常驻约 400–600 MB，2 GB 内存足够 |
| 域名 | `.com` 约 ¥70–100/年 | 需解析到该主机 |
| ICP 备案 | 免费 | 境内主机必须备案，约 7–20 天；香港等境外节点免备案 |
| TLS 证书 | 0 | Caddy 自动申请与续期 |

服务器本身不是成本大头，**模型调用才是**。按每次解读数万输入 token 计，日均几十次咨询的 token 费用通常已超过主机费，因此生产环境必须保留额度开关与日预算。

## 第一次部署

1. 准备服务器（装 Docker 与 Compose 插件），把域名 A 记录指向它，等 DNS 生效。
2. 拉取代码并配置环境变量：

```bash
git clone <repo> && cd Liuyao
cp deploy/.env.production.example deploy/.env.prod
# 编辑 deploy/.env.prod：SITE_ADDRESS、POSTGRES_PASSWORD/DATABASE_URL、DEEPSEEK_API_KEY
chmod 600 deploy/.env.prod
```

3. 构建并启动（首次会构建两个镜像，需要几分钟）：

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml up -d --build
```

4. 执行数据库迁移（特意不放进 API 启动流程，避免多实例并发改表）：

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml \
  exec api node dist/apps/server/admin.js migrate
```

5. 生成邀请码（参数为免费咨询数与每卦追问上限）：

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml \
  exec api node dist/apps/server/admin.js invite 10 5
```

6. 验证：

```bash
curl https://你的域名/api/health          # {"ok":true}
curl -I https://你的域名                   # 200，且带 Strict-Transport-Security
```

## 环境变量要点

- `APP_ORIGIN` 由 `SITE_ADDRESS` 推导为 `https://域名`，必须是 HTTPS，否则 `NODE_ENV=production` 下 API 直接拒绝启动。
- `TRUST_PROXY` 只允许填反向代理所在网段（默认 `172.16.0.0/12` 覆盖 Docker 私有网段）。填 `true` 会被启动检查拒绝：那等于允许任何人伪造 `X-Forwarded-For` 绕过按 IP 限流。
- `WEB_QUOTA_ENFORCED=true` 配合 `WEB_AI_USER_DAILY_CALLS`、`WEB_AI_DAILY_TOKEN_BUDGET` 一起使用。示例值（5 次/人/日、60 万 token/日）是偏保守的起步值，按真实账单调整。
- 数据库密码含特殊字符时，`DATABASE_URL` 里需要 URL 编码。

## 更新发布

```bash
git pull
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml up -d --build
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml \
  exec api node dist/apps/server/admin.js migrate   # 有新迁移时执行
```

Caddy 会随镜像重建继续使用原有证书卷，不会重复申请。回滚时切回上一个提交再执行同样命令；数据库迁移是向前兼容的，回滚代码不会自动回滚表结构。

## 数据备份

数据库是唯一不可再生的资产（账号、卦盘、解读全文都在里面），建议每日备份并保留 7 天：

```bash
docker compose --env-file deploy/.env.prod -f deploy/compose.prod.yaml \
  exec -T postgres pg_dump -U liuyao liuyao | gzip > backup-$(date +%F).sql.gz
```

把这条命令放进主机 cron，并把备份同步到对象存储或另一台机器。没有异地副本的备份不算备份。

## 常见问题

- **证书签发失败**：确认域名已解析到本机、80/443 未被占用、云厂商安全组已放行。若套了 Cloudflare 代理，先关闭代理（灰云）完成首次签发，再开启并设为 `Full (strict)`。
- **登录后立刻掉线**：检查 `APP_ORIGIN` 是否与浏览器地址完全一致（含协议、无端口、无尾斜杠），不一致会导致 Cookie 与 Origin 校验失败。
- **页面 502**：`docker compose ... logs api` 看是否启动失败；最常见原因是 `DATABASE_URL` 密码未编码或迁移未执行。
- **解读一直排队**：确认只有一个 API 实例，并查看 `docker compose ... logs api` 中 Worker 是否报错。
