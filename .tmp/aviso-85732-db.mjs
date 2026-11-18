import fs from 'node:fs';
import pg from '../tmp/codex-pg/node_modules/pg/lib/index.js';

const env = Object.fromEntries(fs.readFileSync('.env.audit.local', 'utf8').split(/\r?\n/).flatMap((line) => {
  const m = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
  return m ? [[m[1], m[2].replace(/^['"]|['"]$/g, '')]] : [];
}));
const client = new pg.Client({
  host: env.KLASEA_AUDIT_DB_HOST, port: Number(env.KLASEA_AUDIT_DB_PORT || 5432),
  database: env.KLASEA_AUDIT_DB_NAME || 'postgres', user: env.KLASEA_AUDIT_DB_USER,
  password: env.KLASEA_AUDIT_DB_PASSWORD, ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000, statement_timeout: 20000,
});
await client.connect();
try {
  await client.query(process.argv.includes('--apply') ? 'begin' : 'begin read only');
  const result = await client.query(fs.readFileSync(process.argv[2], 'utf8'));
  await client.query(process.argv.includes('--apply') ? 'commit' : 'rollback');
  for (const part of [result].flat()) if (part.rows.length) console.log(JSON.stringify(part.rows));
} catch (e) {
  await client.query('rollback');
  throw e;
} finally { await client.end(); }
