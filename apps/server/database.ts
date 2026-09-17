import { Pool } from "pg";

export interface Queryable {
  exec(sql: string): Promise<void>;
  query<T extends Record<string, unknown> = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
export interface Database extends Queryable {
  transaction<T>(work: (connection: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export function postgresDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000 });
  return {
    async exec(sql) { await pool.query(sql); },
    query: (sql, params) => pool.query(sql, params),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const value = await work({ query: (sql, params) => client.query(sql, params), async exec(sql) { await client.query(sql); } });
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    },
    close: () => pool.end(),
  };
}
