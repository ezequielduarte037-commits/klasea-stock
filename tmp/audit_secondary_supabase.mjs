import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function envFile(path) {
  const values = {};
  for (const raw of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const split = line.indexOf("=");
    values[line.slice(0, split).trim()] = line.slice(split + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

const publicEnv = envFile(".env");
const privateEnv = envFile(".env.backup.local");
const supabase = createClient(publicEnv.VITE_SUPABASE_URL, privateEnv.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fetchAll(table, select, configure = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await configure(supabase.from(table).select(select)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.code || ""} ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

function section(label, rows) {
  console.log(`\n## ${label} (${rows.length})`);
  for (const row of rows) console.log(JSON.stringify(row));
}

const [templates, woods, productionWorks, laminationWorks, laminationMoves, woodMoves] = await Promise.all([
  fetchAll(
    "linea_plantillas",
    "linea,nombre,activa,linea_plantilla_items(cantidad,laminacion_materiales(nombre,categoria,unidad))",
    (q) => q.in("linea", ["K37", "K52", "K55"]),
  ),
  fetchAll("materiales", "id,nombre,unidad_medida"),
  fetchAll("produccion_obras", "id,codigo,linea_nombre,estado"),
  fetchAll("laminacion_obras", "id,nombre,descripcion,estado,fecha_inicio,fecha_fin,created_at"),
  fetchAll("laminacion_movimientos", "material_id,tipo,cantidad,destino,obra,sede,created_at"),
  fetchAll("movimientos", "material_id,delta,obra,created_at"),
]);

section("plantillas laminacion", templates);
const woodPattern = /(terci|carpinter|fibro|okum|lenga|roble|ebano|ébano)/i;
section("catalogo maderas candidato", woods.filter((row) => woodPattern.test(row.nombre || "")));
section("obras produccion K52/K55", productionWorks.filter((row) => /^(K?52|K?55)/i.test(row.codigo || "") || ["K52", "K55"].includes(String(row.linea_nombre || "").toUpperCase())));
section("obras laminacion", laminationWorks.slice(0, 150));
section("egresos laminacion con destino", laminationMoves.filter((row) => row.tipo === "egreso" && (row.destino || row.obra)).slice(-250));
section("egresos maderas con destino", woodMoves.filter((row) => Number(row.delta) < 0 && row.obra).slice(-250));
