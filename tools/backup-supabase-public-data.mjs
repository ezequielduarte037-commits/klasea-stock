import fs from "fs";
import pg from "pg";

const stamp = process.argv[2];
if (!stamp) throw new Error("Usage: node tools/backup-supabase-public-data.mjs <stamp>");

const dryPath = `backups/supabase-dryrun-${stamp}.txt`;
const outPath = `backups/supabase-klasea-${stamp}.public-data.sql`;
const tmpPath = `${outPath}.tmp`;
const summaryPath = `backups/supabase-klasea-${stamp}.public-data.summary.json`;

function readDryRun(path) {
  const raw = fs.readFileSync(path);
  return raw.toString(raw[0] === 0xff && raw[1] === 0xfe ? "utf16le" : "utf8");
}

function grab(text, name) {
  const match = text.match(new RegExp(`export ${name}=\\\"([^\\\"]*)\\\"`));
  return match?.[1] || "";
}

function qi(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function ql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function main() {
  const dryRun = readDryRun(dryPath);
  const client = new pg.Client({
    host: grab(dryRun, "PGHOST"),
    port: Number(grab(dryRun, "PGPORT")),
    user: grab(dryRun, "PGUSER"),
    password: grab(dryRun, "PGPASSWORD"),
    database: grab(dryRun, "PGDATABASE"),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query("set role postgres");

  const schema = "public";
  const tablesRes = await client.query(`
    select c.oid, n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p') and n.nspname = $1
    order by c.relname
  `, [schema]);
  const tableByName = new Map(tablesRes.rows.map((table) => [`${table.schema_name}.${table.table_name}`, table]));

  const fkRes = await client.query(`
    select ns.nspname child_schema, child.relname child_table, nr.nspname parent_schema, parent.relname parent_table
    from pg_constraint con
    join pg_class child on child.oid = con.conrelid
    join pg_namespace ns on ns.oid = child.relnamespace
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace nr on nr.oid = parent.relnamespace
    where con.contype = 'f' and ns.nspname = $1 and nr.nspname = $1
  `, [schema]);

  const edges = new Map([...tableByName.keys()].map((key) => [key, new Set()]));
  const indeg = new Map([...tableByName.keys()].map((key) => [key, 0]));
  for (const fk of fkRes.rows) {
    const parent = `${fk.parent_schema}.${fk.parent_table}`;
    const child = `${fk.child_schema}.${fk.child_table}`;
    if (edges.has(parent) && edges.has(child) && parent !== child && !edges.get(parent).has(child)) {
      edges.get(parent).add(child);
      indeg.set(child, indeg.get(child) + 1);
    }
  }

  const queue = [...indeg.entries()].filter(([, degree]) => degree === 0).map(([key]) => key).sort();
  const ordered = [];
  while (queue.length) {
    const key = queue.shift();
    ordered.push(key);
    for (const child of [...edges.get(key)].sort()) {
      indeg.set(child, indeg.get(child) - 1);
      if (indeg.get(child) === 0) queue.push(child);
    }
    queue.sort();
  }
  for (const key of [...tableByName.keys()].sort()) {
    if (!ordered.includes(key)) ordered.push(key);
  }

  fs.rmSync(tmpPath, { force: true });
  const out = fs.createWriteStream(tmpPath, { encoding: "utf8" });
  out.write("-- KlaseA Supabase logical data backup\n");
  out.write("-- Project: fiwugzjeegzlgclfayfd\n");
  out.write(`-- Generated: ${new Date().toISOString()}\n`);
  out.write("-- Scope: public schema data only. Restore after applying repo migrations.\n\n");
  out.write("BEGIN;\nSET client_min_messages = warning;\nSET check_function_bodies = false;\nSET CONSTRAINTS ALL DEFERRED;\n\n");

  let totalRows = 0;
  const summary = [];
  const batchSize = 1000;

  for (const key of ordered) {
    const table = tableByName.get(key);
    const full = `${qi(table.schema_name)}.${qi(table.table_name)}`;
    const colsRes = await client.query(`
      select a.attname as column_name, a.attidentity
      from pg_attribute a
      where a.attrelid = $1 and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      order by a.attnum
    `, [table.oid]);
    const cols = colsRes.rows.map((row) => row.column_name);
    if (!cols.length) continue;

    const countRes = await client.query(`select count(*)::bigint as n from ${full}`);
    const count = Number(countRes.rows[0].n || 0);
    summary.push({ table: key, rows: count });
    totalRows += count;
    console.log(`${key}: ${count}`);

    out.write(`--\n-- Data for ${full} (${count} rows)\n--\n`);
    if (!count) {
      out.write("\n");
      continue;
    }

    const pkRes = await client.query(`
      select a.attname
      from pg_index i
      join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = $1 and i.indisprimary
      order by array_position(i.indkey, a.attnum)
    `, [table.oid]);
    const orderSql = pkRes.rows.length ? ` order by ${pkRes.rows.map((row) => qi(row.attname)).join(", ")}` : "";
    const columnsSql = cols.map(qi).join(", ");
    const valuesExpr = cols.map((col) => `quote_nullable(${qi(col)}::text)`).join(" || ', ' || ");
    const overriding = colsRes.rows.some((row) => row.attidentity === "a") ? " OVERRIDING SYSTEM VALUE" : "";
    const valueSql = `select '(' || ${valuesExpr} || ')' as value_tuple from ${full}${orderSql} limit $1 offset $2`;

    let offset = 0;
    while (offset < count) {
      const rows = await client.query(valueSql, [batchSize, offset]);
      if (!rows.rowCount) break;
      out.write(`INSERT INTO ${full} (${columnsSql})${overriding} VALUES\n`);
      out.write(rows.rows.map((row) => row.value_tuple).join(",\n"));
      out.write(";\n");
      offset += rows.rowCount;
    }
    out.write("\n");
  }

  const seqRes = await client.query(`
    select schemaname, sequencename, last_value
    from pg_sequences
    where schemaname = $1 and last_value is not null
    order by schemaname, sequencename
  `, [schema]);
  if (seqRes.rows.length) {
    out.write("--\n-- Sequence values\n--\n");
    for (const seq of seqRes.rows) {
      const reg = `${qi(seq.schemaname)}.${qi(seq.sequencename)}`;
      out.write(`SELECT setval(${ql(reg)}::regclass, ${Number(seq.last_value)}, true);\n`);
    }
    out.write("\n");
  }

  out.write("COMMIT;\n");
  await new Promise((resolve, reject) => {
    out.end(resolve);
    out.on("error", reject);
  });
  await client.end();

  fs.renameSync(tmpPath, outPath);
  fs.writeFileSync(summaryPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    project: "fiwugzjeegzlgclfayfd",
    schema,
    tableCount: summary.length,
    totalRows,
    tables: summary,
  }, null, 2));

  fs.rmSync(dryPath, { force: true });
  fs.rmSync(`backups/supabase-klasea-${stamp}.sql`, { force: true });

  const size = fs.statSync(outPath).size;
  console.log(JSON.stringify({ outPath, summaryPath, tableCount: summary.length, totalRows, size }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
