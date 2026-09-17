import "dotenv/config";
import { postgresDatabase } from "./database.js";
import { migrate } from "./migrate.js";
import { ConsultationService } from "./service.js";
import { digest } from "./security.js";

if (!process.env.DATABASE_URL) throw new Error("请配置 DATABASE_URL");
const db = postgresDatabase(process.env.DATABASE_URL);
try {
  const command = process.argv[2];
  if (command === "migrate") { await migrate(db); console.log("数据库迁移完成"); }
  else if (command === "invite") {
    const code = await new ConsultationService(db).createInvitation(Number(process.argv[3] ?? 2), Number(process.argv[4] ?? 2));
    console.log(`一次性邀请码（有效期 7 天，请私下交给测试用户）：${code}`);
  } else if (command === "revoke" && process.argv[3]) {
    const result = await db.query("UPDATE invitations SET revoked=true WHERE code_hash=$1 AND claimed_by IS NULL RETURNING code_hash", [digest(process.argv[3])]);
    console.log(result.rows.length ? "未领取邀请码已撤销" : "邀请码不存在或已经领取");
  } else throw new Error("用法：admin.ts migrate | invite [免费咨询数] [每次追问数] | revoke <邀请码>");
} finally { await db.close(); }
