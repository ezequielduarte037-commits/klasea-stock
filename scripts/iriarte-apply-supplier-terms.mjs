import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*)\s*$/);
    return match ? [[match[1], match[2].replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const env = { ...readEnv(path.resolve(".env")), ...readEnv(path.resolve(".env.backup.local")) };
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const IRIARTE = "5ee14014-e761-4ff0-98e6-4f8f19ec2cf5";
const QUOTE_DATE = "2026-09-14";

const part = (cantidad, codigo, descripcion) => ({ cantidad, codigo, descripcion, unidad: "unidad" });
const assembly = [
  part(1, "C 68 1/4 X 1/2", "UNION 1/4 VIROLA X 1/2 GAS MACHO"),
  part(1, "C 60 1/4", "VIROLA 1/4"),
  part(1, "C 61 1/4", "TUERCA VIR. 1/4"),
];
const filterAssembly = [
  part(1, "FAG-FIL-MED3/4INOX", "FILTRO MEDIUM 3/4 AC. INOX."),
  part(1, "FAG-REP-SOP.PL", "SOPORTE PLASTICO FILTRO AGUA"),
];

const confirmed = [
  ["4d87ffbe-6cce-4b13-82c4-bc5be233d595", "UNION 1/4 VIROLA X 1/2 GAS MACHO + TUERCA Y VIROLA", "", 9128.94, assembly],
  ["dbfe155b-4775-4b8d-93c1-4943871c96b0", "TUBAMID 1/4 SP", "M PA6SP1/4", 1544.07, [], { unidad_medida: "metro" }],
  ["97c11bea-c6cd-4c3e-af70-f29bfe269bba", "CODO MACHO HEMBRA 1 FUND", "C 116 1 FU", 11355.06],
  ["121fc3b6-26b3-4ceb-9de0-3d4a9b5201d2", "CODO MACHO HEMBRA 1/2 FUND", "C 116 1/2 FU", 5687.96],
  ["f1b5cc19-0a95-434c-a0ce-5a993ee365ce", "CODO MACHO HEMBRA 3/4 FUND", "C 116 3/4 FU", 7676.30],
  ["6c5a29a1-1713-4934-90f5-03ce70c448ae", "CODO MH 90° 11/2 PX", "PX COD90MH11/2", 3096.14, [], { descripcion: 'Codo 90° MH plástico 1 1/2"', notas: null }],
  ["d9719cfb-867e-4ef2-b028-f520400f22c1", "UNION RACOR DOBLE 1 PX", "PX UNRAC1", 322.83],
  ["916936d8-865a-4393-bb69-155ad254b08d", "ENTRERROSCA 3/4 FUND", "C 112 3/4 FU", 4709.00],
  ["99af01d7-a758-40ab-90df-5583cd0dbd95", "RACOR CODO R.HEMBRA 11/2 PX", "PX CODRAC11/2H", 3025.76, [], { notas: null }],
  ["c3878c6d-e520-4d68-b75f-ea8cf3c40d7d", "RACOR CODO R.HEMBRA 1 PX", "PX CODRAC1H", 998.57],
  ["1423da69-292c-43c4-8c4b-dceca50aebe2", "RACOR CODO R.HEMBRA 3/4 PX", "PX CODRAC3/4H", 370.85],
  ["41f382a3-a607-4993-9adf-b8948eb79ed1", "RACOR MACHO 1 X 1 MANGUERA FUND LR", "C127 1X1 FU LR", 21826.56],
  ["ea90e114-7151-4647-92cd-12a20126e289", "RACOR MACHO 3/4 X 3/4 MANG.FUNDIDO LR", "C127 3/4X3/4 FU LR", 14281.05],
  ["668fa92e-afb2-4924-8c98-858bb6bfe15c", "RACOR CODO 1 MANGUERA X ROSCA 1 MACHO", "", 795.84, [], { notas: "Denominación confirmada en Iriarte 68359; código completo pendiente porque salió truncado en el presupuesto." }],
  ["2a9c3070-55a5-41a1-987c-434b17d4c8ea", "RACOR CODO 1/2 MANGUERA X 1/2 MACHO", "", 497.19, [], { notas: "Denominación confirmada en Iriarte 68359; código completo pendiente porque salió truncado en el presupuesto." }],
  ["f3e88136-de87-43eb-8fdb-d01220710902", "RACOR CODO 3/4 ROSC MACHO X 3/4 MANGUERA", "", 646.51, [], { notas: "Denominación confirmada en Iriarte 68359; código completo pendiente porque salió truncado en el presupuesto." }],
  ["85ca5b29-7008-4a34-a701-5406c399cc6b", "RACOR ROSCA MACHO 1 PX", "PX RAC1M", 336.80, [], { notas: null }],
  ["f0ee8532-c1d6-4bd3-b8f7-de12839abb0e", "RACOR ROSCA MACHO 3/4 PX", "PX RAC3/4M", 234.29, [], { notas: null }],
  ["e273380b-9298-4743-a949-27e308a4e45c", "RACOR MACHO 11/2 X 11/2 MANG.FUNDIDO LR", "C127 11/2X11/2 FU LR", 53713.80],
  ["841a3628-5af0-4a6b-bf78-5dc24091a90a", "ENCH.DOBLE TEE R.HEMBRA 1 PX", "PX TEERAC1RH", 1664.64, [], { notas: null }],
  ["af6594e5-6511-4545-9ec4-f512170dde2c", "TEE RACOR 11/2 PX", "PX TEERAC11/2", 1679.68, [], { notas: null }],
  ["ea15a6a2-1a99-44c3-9b1e-873c08f9b4b0", "TOMA PASAC 11/2 CROMADA", "TO11/2C", 87696.00, [], { notas: null }],
  ["0d3ba5ed-e6e9-41f5-938a-77a20437cad0", 'TOMA PASAC 1" CROMADA', 'TO1"C', 60900.00, [], { notas: null }],
  ["4b5668ec-7f50-4c9d-9893-6e729e249c9a", "TOMA PASAC 3/4 CROMADA", "TO3/4C", 58464.00, [], { notas: null }],
  ["e4167e8a-9537-44ff-a35c-e8844d20f614", "UNION 1/4 VIROLA X 1/2 GAS MACHO + TUERCA Y VIROLA", "", 9128.94, assembly],
  ["c878cad9-cff6-4ca9-8c5c-04707c93dfce", "VALVULA RETENCION 11/2 VAST. PL.", "VALRET11/2 COM", 40215.13, [], { notas: null }],
  ["c3f8e2f9-83b7-4e97-977a-e03b490d4bd5", "VALVULA RETENCION 1 VASTAGO PL COM", "VALRET 1 COM", 16482.28],
  ["41d63574-fe31-4cf4-97d2-04fe7dfdca5b", "VALVULA ESFERICA 3/4 JULON", "VAE3/4J", 7491.41],
  ["56990c06-2345-4039-9743-b6be04711462", "FILTRO MEDIUM 3/4 AC. INOX. + SOPORTE", "", 97718.25, filterAssembly],
  ["76d76221-4755-4c61-99b5-fd67f84787f7", 'TOMA PASACASCO 1" POLIAMIDA', 'TO1"POL', 6024.26],
  ["a0865236-5648-49bd-b343-6a61be2c798f", "BUJES DE REDUCCION 11/2 X 3/4 PX", "PX BUJRED11/2X3/4", 678.20, [], { notas: null }],
  ["962ec250-7247-4c34-9b42-450d196c5a9e", "FLEX.AGUA AC.INOX 1/2 X 40 CM.", "FLAG-AF2076-1/2X40", 6478.08, [], { notas: null }],
  ["dc64d35f-128d-494c-bdf2-401c722a338f", "FLEX.AGUA AC.INOX 1/2 X 50 CM.", "FLAG-AF2076-1/2X50", 7045.56, [], { notas: null }],
].map(([id, description, code, price, components = [], materialPatch = {}]) => ({ id, description, code, price, components, materialPatch }));

const pending = [
  {
    id: "dc9c422f-275a-4426-8274-cc2db661cc97",
    notas: 'Pendiente con Casa Iriarte: se pidió codo HH 90° 1 1/4", pero el presupuesto 68359 cotizó uno de 45° (PX COD45HH11/4).',
  },
  {
    id: "d487f214-b286-4bc2-92ad-7ca26e4eca97",
    notas: 'Pendiente con Casa Iriarte: para el racor hembra a codo de 1/2" repitieron el renglón de 1 1/2" en el presupuesto 68359.',
  },
];

const ids = [...confirmed.map((row) => row.id), ...pending.map((row) => row.id)];
const { data: materials, error: readError } = await supabase.from("panol_materiales").select("id,descripcion,codigo,notas,unidad_medida").in("id", ids);
if (readError) throw readError;
const found = new Set((materials || []).map((row) => row.id));
const missing = ids.filter((id) => !found.has(id));
if (missing.length) throw new Error(`No se encontraron ${missing.length} materiales esperados: ${missing.join(", ")}`);

if (!process.argv.includes("--apply")) {
  process.stdout.write(`DRY RUN: ${confirmed.length} equivalencias confirmadas y ${pending.length} observaciones pendientes.\n`);
  process.stdout.write("Usá --apply para grabar.\n");
  process.exit(0);
}

for (const row of confirmed) {
  if (!Object.keys(row.materialPatch).length) continue;
  const { error } = await supabase.from("panol_materiales").update(row.materialPatch).eq("id", row.id);
  if (error) throw error;
}
for (const row of pending) {
  const { error } = await supabase.from("panol_materiales").update({ notas: row.notas }).eq("id", row.id);
  if (error) throw error;
}

const supplierRows = confirmed.map((row) => ({
  material_id: row.id,
  proveedor_id: IRIARTE,
  precio: row.price,
  moneda: "ARS",
  denominacion_proveedor: row.description,
  codigo_proveedor: row.code || null,
  componentes_pedido: row.components,
}));
const { error: supplierError } = await supabase.from("panol_material_proveedores").upsert(supplierRows, { onConflict: "material_id,proveedor_id" });
if (supplierError) throw supplierError;

const { data: existingPrices, error: priceReadError } = await supabase
  .from("panol_precios")
  .select("material_id,precio_unitario,fecha,fuente")
  .eq("proveedor_id", IRIARTE)
  .eq("fecha", QUOTE_DATE)
  .in("material_id", confirmed.map((row) => row.id));
if (priceReadError) throw priceReadError;
const existingKeys = new Set((existingPrices || []).map((row) => `${row.material_id}:${Number(row.precio_unitario)}`));
const priceRows = confirmed.filter((row) => !existingKeys.has(`${row.id}:${Number(row.price)}`)).map((row) => ({
  material_id: row.id,
  proveedor_id: IRIARTE,
  proveedor: "Casa Iriarte",
  precio_unitario: row.price,
  moneda: "ARS",
  fuente: "Presupuesto Iriarte 68359/68361",
  fecha: QUOTE_DATE,
}));
if (priceRows.length) {
  const { error } = await supabase.from("panol_precios").insert(priceRows);
  if (error) throw error;
}

process.stdout.write(`Aplicadas ${confirmed.length} equivalencias, ${priceRows.length} precios y ${pending.length} alertas sin adivinar códigos.\n`);
