import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dirname, "..");

function readEnvFile(fileName) {
  const filePath = path.join(ROOT, fileName);
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const splitAt = line.indexOf("=");
        return [line.slice(0, splitAt), line.slice(splitAt + 1).replace(/^['"]|['"]$/g, "")];
      }),
  );
}

const env = {
  ...readEnvFile(".env"),
  ...readEnvFile(".env.local"),
  ...readEnvFile(".env.backup.local"),
  ...process.env,
};

if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

async function fetchAll(table, select, order = "id") {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order(order)
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

const terms = [
  "poliamida", "codo 90", "empalme espiga", "entrerrosca", "racor",
  "pasacasco", "toma de casco", "toma 1", "valvula", "válvula",
  "filtro agua", "buje reduc", "reduccion", "reducción", "flexible mallado",
  "tee 4", "tee hembra", "tee plast", "t plast", "toma casco", "toma de casco", "espiga rosca central",
  "tapon rosca", "tapón rosca",
];

const materials = await fetchAll(
  "panol_materiales",
  "id,descripcion,alias,codigo,proveedor_id,proveedor,unidad_medida,precio_unitario,moneda,activo,notas,created_at",
  "descripcion",
);
const suppliers = await fetchAll("panol_proveedores", "id,nombre,activo", "nombre");
const supplierById = new Map(suppliers.map((row) => [row.id, row.nombre]));
const links = await fetchAll(
  "panol_material_proveedores",
  "material_id,proveedor_id,precio,moneda,denominacion_proveedor,codigo_proveedor,componentes_pedido",
  "material_id",
);
const linksByMaterial = new Map();
for (const link of links) {
  const list = linksByMaterial.get(link.material_id) || [];
  list.push({ ...link, proveedor: supplierById.get(link.proveedor_id) || null });
  linksByMaterial.set(link.material_id, list);
}

const onlyIriarte = process.argv.includes("--iriarte");
const matches = materials
  .filter((material) => {
    const haystack = normalize(`${material.descripcion} ${material.alias} ${material.codigo} ${material.notas}`);
    const linkedToIriarte = normalize(material.proveedor).includes("iriarte")
      || (linksByMaterial.get(material.id) || []).some((row) => normalize(row.proveedor).includes("iriarte"));
    return (onlyIriarte ? linkedToIriarte : true)
      && terms.some((term) => haystack.includes(normalize(term)));
  })
  .map((material) => ({
    ...material,
    proveedores: linksByMaterial.get(material.id) || [],
  }));

if (process.argv.includes("--compact")) {
  process.stdout.write(`${matches.map((row) => [
    row.id,
    row.activo === false ? "INACTIVO" : "ACTIVO",
    row.descripcion,
    row.codigo || "",
    String(row.notas || "").replace(/\r?\n/g, " / "),
    (row.proveedores || []).find((provider) => normalize(provider.proveedor).includes("iriarte"))?.codigo_proveedor || "",
  ].join(" | ")).join("\n")}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ total: matches.length, matches }, null, 2)}\n`);
}
