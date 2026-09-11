import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();

function arg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

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

function norm(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9./+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function specificityScore(row) {
  const description = String(row.descripcion ?? "");
  const modelTokens = description.match(/\b[A-Z]{2,}[A-Z0-9]*[- ]?\d{2,}(?:[./-]\d+)*\b/g) ?? [];
  const mixedTokens = description.match(/\b(?=[A-Z0-9/-]*[A-Z])(?=[A-Z0-9/-]*\d)[A-Z0-9]+(?:[./-][A-Z0-9]+)+\b/g) ?? [];
  const brandTokens = description.match(/\b(KOHINOOR|SEAFLO|LOFRANS|RAYMARINE|WEBASTO|AUTOTERM|OSCULATI|PERKO|QUICK|JABSCO|SAMSUNG|LG|PHILIPS|SCHNEIDER|VICTRON|DOMETIC|VETUS|CRAFTSMAN|ATTWOOD|LOWRANCE|GARMIN)\b/gi) ?? [];
  return modelTokens.length * 25 + mixedTokens.length * 18 + brandTokens.length * 12 + (row.codigo ? 8 : 0);
}

const env = { ...readEnvFile(".env"), ...readEnvFile(".env.backup.local"), ...process.env };
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Faltan credenciales locales de Supabase.");
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const searchTokens = norm(arg("search")).split(" ").filter(Boolean);
const limit = Math.max(1, Number.parseInt(arg("limit", "80"), 10) || 80);
const { data, error } = await supabase
  .from("panol_materiales")
  .select("id,codigo,descripcion,proveedor,imagen_url,activo")
  .eq("activo", true)
  .order("descripcion");
if (error) throw error;

const rows = (data ?? [])
  .filter((row) => !String(row.imagen_url ?? "").trim())
  .filter((row) => searchTokens.every((token) => norm(`${row.codigo ?? ""} ${row.descripcion ?? ""} ${row.proveedor ?? ""}`).includes(token)))
  .map((row) => ({ ...row, specificity: specificityScore(row) }))
  .filter((row) => searchTokens.length || row.specificity >= 25)
  .sort((a, b) => b.specificity - a.specificity || a.descripcion.localeCompare(b.descripcion, "es", { numeric: true }))
  .slice(0, limit);

console.log(JSON.stringify({ search: arg("search"), count: rows.length, rows }, null, 2));
