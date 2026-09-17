import { readFile } from "node:fs/promises";
import type { Database } from "./database.js";

export async function migrate(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    // Serialize migration processes before creating or reading the version table.
    await tx.query("SELECT pg_advisory_xact_lock(78213460)");
    await tx.query("CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    for (const [index, filename] of ["001-foundation.sql", "002-ai-runs.sql", "003-consultation-library.sql"].entries()) {
      const version = index + 1;
      const applied = await tx.query("SELECT version FROM schema_migrations WHERE version=$1", [version]);
      if (applied.rows.length) continue;
      await tx.exec(await readFile(new URL(`../../db/${filename}`, import.meta.url), "utf8"));
      await tx.query("INSERT INTO schema_migrations(version) VALUES ($1)", [version]);
    }
  });
}
