import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "../tmp/codex-pg/node_modules/pg/lib/index.js";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^['"]|['"]$/g, "")]];
  }));
}

const migrationArg = process.argv[2];
if (!migrationArg) throw new Error("Indicá el archivo de migración.");
const migrationPath = path.resolve(migrationArg);
const env = {
  ...readEnv(path.resolve(".env")),
  ...readEnv(path.resolve(".env.audit.local")),
};
const client = new pg.Client({
  host: env.KLASEA_AUDIT_DB_HOST,
  port: Number(env.KLASEA_AUDIT_DB_PORT || 5432),
  database: env.KLASEA_AUDIT_DB_NAME || "postgres",
  user: env.KLASEA_AUDIT_DB_USER,
  password: env.KLASEA_AUDIT_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

await client.connect();
try {
  await client.query("begin");
  await client.query(fs.readFileSync(migrationPath, "utf8"));
  await client.query("commit");
  process.stdout.write(`Migración aplicada: ${path.basename(migrationPath)}\n`);
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
