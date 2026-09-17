import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";
import { ConsultationService } from "./service.js";
import { digest } from "./security.js";
import type { Database } from "./database.js";
import { loadWebAi } from "./ai-runtime.js";

if (process.env.NODE_ENV === "production") throw new Error("本地预览不能用于生产环境");
const directory = resolve("logs/web-local");
await mkdir(directory, { recursive: true });
const engine = new PGlite(resolve(directory, "database"));
const db: Database = {
  async exec(sql) { await engine.exec(sql); },
  query: (sql, params) => engine.query(sql, params),
  transaction: (work) => engine.transaction((tx) => work({ query: (sql, params) => tx.query(sql, params), async exec(sql) { await tx.exec(sql); } })),
  close: () => engine.close(),
};
await migrate(db);
const invitePath = resolve(directory, "invitation.txt");
let invitation = await readFile(invitePath, "utf8").catch(() => "");
const valid = await db.query("SELECT code_hash FROM invitations WHERE code_hash=$1 AND claimed_by IS NULL AND NOT revoked AND expires_at>now()", [digest(invitation.trim())]);
if (!valid.rows.length) {
  invitation = await new ConsultationService(db).createInvitation(2, 2);
  await writeFile(invitePath, invitation, { mode: 0o600 });
}
const ai = await loadWebAi(db);
const app = await createApp(db, { origin: "http://localhost:5173", secureCookies: false, ...(ai ? { ai } : {}) });
const vite = await createServer({ configFile: resolve("apps/web/vite.config.ts") });
const close = async () => { await ai?.close(); await vite.close(); await app.close(); await db.close(); };
try {
  await app.listen({ host: "127.0.0.1", port: 3000 });
  await vite.listen();
  ai?.start();
  console.log(ai ? "AI 解读与追问已启用（仅点击生成时调用模型）。" : "未配置 AI 密钥，排盘功能仍可使用。");
  console.log(`网页：http://localhost:5173\n本地邀请码文件：${invitePath}\n数据持久保存在 logs/web-local，仅供本机预览。`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void close(); });
} catch (error) { await close(); throw error; }
