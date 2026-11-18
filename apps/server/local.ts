import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer as createNetServer } from "node:net";
import { resolve } from "node:path";
import { createServer } from "vite";
import { createApp } from "./app.js";
import { migrate } from "./migrate.js";
import { ConsultationService } from "./service.js";
import { digest } from "./security.js";
import type { Database } from "./database.js";
import { loadWebAi } from "./ai-runtime.js";
import { quotaEnforced } from "./quota.js";

if (process.env.NODE_ENV === "production") throw new Error("本地预览不能用于生产环境");

/** True when nothing is listening on the port on either loopback address (Vite binds "localhost", which may be ::1). */
async function isFree(port: number) {
  for (const host of ["127.0.0.1", "::1"]) {
    const free = await new Promise<boolean>((done) => {
      const probe = createNetServer().once("error", (error: NodeJS.ErrnoException) => done(error.code === "EADDRNOTAVAIL"))
        .once("listening", () => probe.close(() => done(true)));
      probe.listen(port, host);
    });
    if (!free) return false;
  }
  return true;
}
function portFromEnv(name: string) {
  const raw = process.env[name];
  if (!raw) return null;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`${name} 必须是 1–65535 之间的整数，当前为 ${raw}`);
  return port;
}
/** A port set in the environment is used as is; otherwise take the first free one from the default upward. */
async function choosePort(name: string, preferred: number, skip: number[] = []) {
  const fixed = portFromEnv(name);
  if (fixed !== null) return fixed;
  for (let port = preferred; port < preferred + 20; port++) {
    if (!skip.includes(port) && await isFree(port)) return port;
  }
  throw new Error(`${preferred}–${preferred + 19} 端口都被占用，请设置 ${name} 指定一个空闲端口`);
}
const apiPort = await choosePort("API_PORT", 3000);
// 5174 is reserved for the isolated UI preview (logs/ui-check/serve.ts).
const webPort = await choosePort("WEB_PORT", 5173, [apiPort, 5174]);
const webOrigin = `http://localhost:${webPort}`;
process.env.API_PORT = String(apiPort); // read by vite.config.ts for the /api proxy

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
const app = await createApp(db, { origin: webOrigin, secureCookies: false, quotaEnforced, ...(ai ? { ai } : {}) });
const vite = await createServer({ configFile: resolve("apps/web/vite.config.ts"), server: { port: webPort } });
const close = async () => { await ai?.close(); await vite.close(); await app.close(); await db.close(); };
try {
  await app.listen({ host: "127.0.0.1", port: apiPort });
  await vite.listen();
  ai?.start();
  console.log(ai ? "AI 解读与追问已启用（仅点击生成时调用模型）。" : "未配置 AI 密钥，排盘功能仍可使用。");
  if (webPort !== 5173 && !process.env.WEB_PORT) console.log(`5173 端口已被其它程序占用，改用 ${webPort}。`);
  console.log(`网页：${webOrigin}\n本地邀请码文件：${invitePath}\n数据持久保存在 logs/web-local，仅供本机预览。`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void close(); });
} catch (error) { await close(); throw error; }
