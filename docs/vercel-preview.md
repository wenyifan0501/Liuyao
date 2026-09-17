# Vercel 前端预览

将 Git 仓库导入 Vercel，Root Directory 保持仓库根目录（不是 apps/web）。
仓库根目录的 vercel.json 指定 npm ci、npm run web:build 和 dist/web。
建议选择 Node.js 22.x。页面采用 hash 路由，不需要将所有请求重写到 index.html。

## 当前部署范围

此配置仅发布前端静态资源。可以查看书斋、烛火与信笺交互。
未连接后端时，页面会显示服务连接错误，不能登录、保存问题、继续完整起卦流程或使用 AI。
它不是完整产品的线上部署配置，也不包含演示账号或本地记录。

完整体验需要另行部署 apps/server 的 Fastify 常驻服务和 PostgreSQL，执行数据库迁移，
再把 Vercel 的 /api/:path* 转发至实际 HTTPS 后端的 /api/:path*。
后端 APP_ORIGIN 必须与访问前端的固定 HTTPS 域名一致；NODE_ENV=production。
AI worker 当前依赖常驻进程，不能直接把 apps/server/local.ts 当作 Vercel 函数。
真实后端域名尚未提供，因此本次配置未写入虚假的 API 转发地址。

密钥和 DATABASE_URL 仅放在后端环境变量中，不要使用 VITE_ 前缀，也不要上传 .env 或 logs/。

参考：https://vercel.com/docs/frameworks/frontend/vite
配置：https://vercel.com/docs/project-configuration
