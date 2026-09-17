# 网页基础版本

已实现 React + Vite 网页、Fastify API、PostgreSQL 版本迁移、邀请码注册、服务端会话、咨询历史、程序排盘、免费额度账本及 AI 后台任务。最新 AI 流程与成本控制见 [AI 接入说明](./web-ai.md)。AI 能力取决于服务端密钥配置；支付尚未开放。本次版本不能作为公开收费网站直接上线。

## 一条命令打开网页

安装依赖后运行 `npm run web:local`，打开 `http://localhost:5173`。该命令同时启动 Vite、API 和持久化 PGlite，不需要 Docker 或单独安装 PostgreSQL。

一次性邀请码写在 `logs/web-local/invitation.txt`，用于网页的注册表单。启动时仅在现有邀请码已领取、过期或失效时生成新的邀请码。账户、登录会话和卦盘存入 `logs/web-local/database`；不要同时启动两个本地预览进程，也不要删除该目录，除非明确要清除所有本地测试数据。停止终端进程即停止网页服务。

页面包括：主题与示例问题、可选背景和时间范围、邀请码注册与登录、一次模拟六次铜钱、手动录入六爻、卦象和六神/六亲/世应/旬空表格、历史咨询、移动侧栏和卦盘弹窗。咨询地址使用 hash 路由，可直接刷新恢复。页面暂用“观爻”作为产品名称，文案引导为流程说明，不模拟 AI 回答。

本地预览仅监听 loopback，且生产环境变量下拒绝启动。现在会读取 `.env` 中的模型配置，仅在点击问题确认、解读或追问时调用模型；设置 `WEB_AI_ENABLED=false` 可禁用。开发用嵌入式数据库不能代替正式 PostgreSQL 多连接部署。

前端构建：`npm run web:build`，输出 `dist/web`。前端使用公开类型导入，不包含 Skill、Node 排盘代码或 API Key。单独用 Vite 连接 PostgreSQL API 时，运行 `npm run web:dev`，并将后端 APP_ORIGIN 设置为 `http://localhost:5173`。

## 本地运行

此节是独立 PostgreSQL 模式：需要 Node.js 24 和 PostgreSQL 17。依赖通过 `npm ci` 安装。没有数据库时，可使用 Docker Compose；无 Docker 用户可使用上面的一键本地预览。

1. 复制 `deploy/.env.example` 为 `deploy/.env`，设置随机数据库密码和对应的容器连接串。
2. 在项目根目录执行：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d postgres
```

3. 在根目录现有 `.env` 中增加以下字段，保留现有模型配置。密码含特殊字符时需对 URL 中的密码部分编码。

```dotenv
DATABASE_URL=postgresql://liuyao:你的密码@127.0.0.1:5432/liuyao
APP_ORIGIN=http://localhost:3000
HOST=127.0.0.1
PORT=3000
```

4. 初始化并启动：

```sh
npm run db:migrate
npm run invite:create -- 2 2
npm run server:dev
```

邀请码有效期 7 天，命令只输出一次明文，数据库只存摘要。两个参数分别是免费咨询数、每次咨询的追问上限，这只是测试配置，不代表最终商业政策。已生成但未领取的邀请码可以用 `npm run invite:revoke -- <邀请码>` 撤销。勿公开命令输出。

## 接口协议

所有写请求必须携带 `Origin: http://localhost:3000`（与 APP_ORIGIN 一致）。浏览器正常同源请求会自动携带；跨域开发前端应通过 Vite /api 代理访问。JSON 请求使用 `Content-Type: application/json`。会话由 HttpOnly Cookie 传递。

| 方法与路径 | 内容 |
| --- | --- |
| GET /api/health | 数据库连通检查 |
| POST /api/auth/register | `{ username, password, invitation }`，成功后再登录 |
| POST /api/auth/login | `{ username, password }`，设置会话 Cookie |
| POST /api/auth/logout | 撤销当前服务端会话 |
| GET /api/me | 用户、可用免费咨询数、能力开关 |
| POST /api/consultations | 创建咨询，必须携带 Idempotency-Key |
| GET /api/consultations?offset=0 | 当前用户历史，每页最多 30 条 |
| GET /api/consultations/:id | 当前用户的一份完整咨询 |
| POST /api/consultations/:id/cast | 确认起卦，服务端保存完整卦盘快照 |

用户名支持 3–32 位英文、数字和下划线，大小写归一；密码 10–128 字符，以 Argon2id 存储。Cookie 7 天过期，生产模式要求 HTTPS 和 Secure Cookie。注册不会自动登录，也不会公开邀请码生成接口。

新建咨询示例（Idempotency-Key 使用每次新操作生成的 UUID；重试时沿用）：

```json
{
  "question": "未来三个月的工作发展如何？",
  "topic": "career",
  "background": ["正在考虑新的工作机会"],
  "timeWindow": "未来三个月",
  "timezone": "Asia/Shanghai"
}
```

模拟起卦请求为 `{ "method": "simulated_three_coins" }`；手动输入为 `{ "method": "manual", "values": [7,8,6,9,7,8] }`。服务端生成模拟随机数和起卦时间。相同咨询重复确认返回同一卦盘，改变已确认数据返回 409。此阶段是一次确认六爻，逐次投掷草稿接口尚未实现。

免费额度不在创建咨询或排盘时扣减。AI Worker 入队时在同一事务中预占权益和预算，完成后结算、失败退还。网页通过 `/api/consultations/:id/ai` 提交并读取生成任务，追问上限与每日预算已执行，细节见 AI 接入说明。

## 构建及容器

```sh
npm run server:build
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile api build api
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile api run --rm api node dist/apps/server/admin.js migrate
docker compose --env-file deploy/.env -f deploy/compose.yaml --profile api up -d
```

迁移单独执行，不在 API 启动时自动修改表结构。镜像内迁移文件已复制到 `dist/db`。Compose 仅作为本地基础验证，端口绑定 127.0.0.1；生产需增加 Caddy/HTTPS、生产 Cookie、私网数据库及备份配置。Docker 文件尚未经当前机器构建验证，因为当前机器未安装 Docker。

## 验证与限制

`npm run check`、`npm test`、`npm run server:build` 分别执行类型检查、测试和服务端编译。新增测试在 PGlite 中执行实际 PostgreSQL SQL 和事务，不是内存对象模拟；覆盖邀请码重复领取/过期/撤销、注册回滚、跨用户隔离、起卦幂等、登录限流、会话撤销、额度预占与扣退幂等。

PGlite 单连接会串行化并发请求；这些测试不能替代真实 PostgreSQL 多连接锁竞争、容器和重启恢复测试。后续上线前必须补测。当前速率限制使用进程内存，重启会清空，且默认不信任转发 IP；接入代理后须仅信任指定代理，补充账户维度和持久全站预算，不能直接设置 `trustProxy: true`。

本阶段采用可审查的版本化 SQL 迁移和 node-postgres，暂未引入架构建议中的 Drizzle；表较少时先避免同时维护 ORM 和 SQL 两套定义。现有 CLI 与 Skill 保留，没有修改模型表达或调用流程。
