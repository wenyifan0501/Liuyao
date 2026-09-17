import "dotenv/config";
import { postgresDatabase } from "./database.js";
import { createApp } from "./app.js";
import { loadWebAi } from "./ai-runtime.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("请配置 DATABASE_URL，并先运行 npm run db:migrate");
const production = process.env.NODE_ENV === "production";
if (production && !process.env.APP_ORIGIN) throw new Error("生产环境需要显式配置 APP_ORIGIN");
const db = postgresDatabase(connectionString);
const ai = await loadWebAi(db);
const app = await createApp(db, { origin: process.env.APP_ORIGIN ?? "http://localhost:3000", secureCookies: production, logger: true, ...(ai ? { ai } : {}) });
app.addHook("onClose", async () => { await ai?.close(); await db.close(); });
for (const signal of ["SIGINT", "SIGTERM"] as const) process.once(signal, () => { void app.close(); });
try { await app.listen({ host: process.env.HOST ?? "127.0.0.1", port: Number(process.env.PORT ?? 3000) }); ai?.start(); }
catch (error) { await app.close(); throw error; }
