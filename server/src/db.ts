import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@squadvault/shared";

neonConfig.webSocketConstructor = ws;

const connectionString = process.env.DATABASE_URL;

export const isDatabaseConfigured = Boolean(connectionString);

const pool = connectionString ? new Pool({ connectionString }) : null;

/**
 * `db` is null when DATABASE_URL isn't set yet, so the server can still boot
 * and serve /api/health during initial setup. Routes that touch the database
 * must check `isDatabaseConfigured` first (see requireDb middleware).
 */
export const db = pool ? drizzle(pool, { schema }) : (null as unknown as ReturnType<typeof drizzle>);
