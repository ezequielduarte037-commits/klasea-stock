import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const apply = process.argv.includes("--apply");

function readEnvFile(file) {
  const fullPath = path.join(ROOT, file);
  if (!fs.existsSync(fullPath)) return {};
  return Object.fromEntries(
    fs.readFileSync(fullPath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
      }),
  );
}

function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./+\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const env = { ...readEnvFile(".env"), ...readEnvFile(".env.backup.local"), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales locales de Supabase.");

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase
  .from("panol_materiales")
  .select("id,descripcion,imagen_url,activo")
  .eq("activo", true);
if (error) throw error;

const groups = new Map();
for (const row of data ?? []) {
  const key = normalized(row.descripcion);
  if (!key) continue;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(row);
}

const updates = [];
const report = [];
for (const rows of groups.values()) {
  const withImage = rows.filter((row) => String(row.imagen_url ?? "").trim());
  const withoutImage = rows.filter((row) => !String(row.imagen_url ?? "").trim());
  const uniqueImages = [...new Set(withImage.map((row) => row.imagen_url))];
  if (!withoutImage.length || uniqueImages.length !== 1) continue;
  for (const row of withoutImage) updates.push({ id: row.id, imagen_url: uniqueImages[0] });
  report.push({ description: rows[0].descripcion, propagated: withoutImage.length, sourceRows: withImage.length });
}

if (apply) {
  for (let offset = 0; offset < updates.length; offset += 50) {
    const batch = updates.slice(offset, offset + 50);
    const results = await Promise.all(batch.map((row) => supabase.from("panol_materiales").update({ imagen_url: row.imagen_url }).eq("id", row.id)));
    const failure = results.find((result) => result.error);
    if (failure?.error) throw failure.error;
  }
}

console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", propagated: updates.length, groups: report }, null, 2));
