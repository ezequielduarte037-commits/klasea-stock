#!/usr/bin/env node
/**
 * Lista de precios de Rebollar → migración de carga (sin aplicar) + planilla de
 * conciliación.
 *
 *   node scripts/consumibles/lista-rebollar.mjs --excel <lista.xlsx> [opciones]
 *
 *   --excel     ruta del Excel (obligatorio)
 *   --hoja      nombre de la hoja (por defecto, la que tiene el encabezado)
 *   --vigente   fecha de vigencia AAAA-MM-DD (por defecto, la del título)
 *   --dolar     dólar oficial vendedor BNA (por defecto lo busca para la fecha
 *               de vigencia en api.argentinadatos.com)
 *   --archivo   nombre del archivo a guardar en la lista (por defecto, el del Excel)
 *   --version   versión de la migración (por defecto 20261010140000)
 *   --csv       planilla de dudosos y sin par (por defecto
 *               docs/consumibles/conciliacion-rebollar.csv)
 *   --ensayo    además escribe un SQL de ensayo: corre la carga DOS veces
 *               (idempotencia), verifica conteos y termina con una excepción
 *               para que no quede nada. Se corre con
 *               `npx supabase db query --linked -f <archivo>`.
 *
 * Lee la base solo para consultar (consumibles, historial de retiros y el id
 * del proveedor). No escribe nada: la migración la revisa y la aplica el
 * coordinador. Con la lista siguiente se vuelve a correr cambiando --excel,
 * --vigente y --version.
 *
 * La normalización (unidades, moneda, costo) es la misma que usa la pestaña
 * Precios: src/features/consumibles/precios/normalizarLista.js. El cruce con
 * los consumibles es el de src/features/consumibles/catalogo/emparejar.js.
 */

import { createRequire } from "node:module";
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { normalizarLista, elegirHoja, factorCompra, costoUnitario, normalizarUnidad } = await import(
  pathToFileURL(path.join(RAIZ, "src/features/consumibles/precios/normalizarLista.js")).href
);
const { emparejarTodo } = await import(
  pathToFileURL(path.join(RAIZ, "src/features/consumibles/catalogo/emparejar.js")).href
);
const { formaEntregaSugerida } = await import(
  pathToFileURL(path.join(RAIZ, "src/features/consumibles/catalogo/reglas.js")).href
);

// ── Argumentos ──────────────────────────────────────────────────────────────

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
    args[k] = v;
  }
}
if (!args.excel) {
  console.error("Falta --excel <ruta del Excel de Rebollar>");
  process.exit(1);
}
const VERSION = args.version || "20261010140000";
const SALIDA = path.join(RAIZ, "supabase/migrations", `${VERSION}_consumibles_lista_rebollar.sql`);
const CSV = path.resolve(RAIZ, args.csv || "docs/consumibles/conciliacion-rebollar.csv");
const PROVEEDOR = "Rebollar";

// ── Excel ───────────────────────────────────────────────────────────────────

const libro = XLSX.readFile(args.excel);
const filasDe = (n) => XLSX.utils.sheet_to_json(libro.Sheets[n], { header: 1, raw: true, defval: null });
const hoja = args.hoja || elegirHoja(libro.SheetNames, filasDe);
if (!hoja) {
  console.error("No encontré una hoja con el encabezado Código / Descripción / Precio.");
  process.exit(1);
}
const filas = filasDe(hoja);
const previa = normalizarLista(filas);
const VIGENTE = args.vigente || previa.vigenteDesde;
if (!/^\d{4}-\d{2}-\d{2}$/.test(VIGENTE || "")) {
  console.error("No pude leer la fecha de vigencia del título: pasala con --vigente AAAA-MM-DD.");
  process.exit(1);
}

// ── Dólar ───────────────────────────────────────────────────────────────────

async function dolarDelDia(fecha) {
  const r = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial");
  if (!r.ok) throw new Error(`argentinadatos respondió ${r.status}`);
  const lista = await r.json();
  // El de ese día o, si fue feriado, el último anterior.
  const previos = lista.filter((x) => x.fecha <= fecha && Number(x.venta) > 0).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const d = previos.at(-1);
  if (!d) throw new Error(`sin cotización para ${fecha}`);
  return { venta: Number(d.venta), fecha: d.fecha };
}

let DOLAR = args.dolar ? Number(args.dolar) : null;
let DOLAR_FECHA = VIGENTE;
if (!DOLAR) {
  try {
    const d = await dolarDelDia(VIGENTE);
    DOLAR = d.venta;
    DOLAR_FECHA = d.fecha;
  } catch (e) {
    console.warn(`No conseguí el dólar (${e.message}). Los renglones en USD quedan sin costo en pesos.`);
  }
}

const lista = normalizarLista(filas, { dolar: DOLAR });
for (const a of lista.avisos) console.warn("Aviso:", a);

// ── Base (solo lectura) ─────────────────────────────────────────────────────

function consultar(sql) {
  const tmp = path.join(os.tmpdir(), `klasea-consumibles-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    const out = execSync(`npx supabase db query --linked -o json -f "${tmp}"`, {
      cwd: RAIZ,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
    });
    return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const [datos] = consultar(`
select json_build_object(
  'proveedor', (
    select json_build_object('id', id, 'nombre', nombre)
      from public.panol_proveedores
     where nombre ilike '%rebollar%'
     order by (lower(trim(nombre)) = 'rebollar') desc, coalesce(activo, true) desc, nombre
     limit 1),
  'materiales', (
    select coalesce(json_agg(json_build_object(
      'id', m.id, 'descripcion', m.descripcion, 'unidad_medida', m.unidad_medida,
      'rubro', c.nombre, 'rubro_padre', p.nombre) order by m.descripcion), '[]'::json)
      from public.panol_materiales m
      left join public.panol_categorias c on c.id = m.categoria_id
      left join public.panol_categorias p on p.id = c.parent_id
     where m.es_consumible = true and coalesce(m.activo, true)),
  'retiros', (
    select coalesce(json_object_agg(material_id, n), '{}'::json) from (
      select s.material_id, count(*) as n
        from public.panol_obra_materiales_snapshot s
       where s.source = 'solicitud_consumible_retiro'
         and s.material_id is not null
         and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
       group by s.material_id) t)
) as r;`);
const { proveedor, materiales, retiros } = datos.r;

// ── Cruce ───────────────────────────────────────────────────────────────────

const { seguros, dudosos, sinPar } = emparejarTodo(materiales, lista.renglones);
const vinculoDe = new Map(seguros.map((s) => [s.material.id, s]));
const materialDeCodigo = new Map(seguros.map((s) => [s.renglon.codigo, s.material.id]));

// ── Config por consumible ───────────────────────────────────────────────────

// Forma de entrega por regla: la misma que sugiere la pestaña Catálogo.
const formaEntrega = (m) => formaEntregaSugerida(m.descripcion, m.rubro);

const compararTexto = (a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
// Los que cuelgan directo de "Consumibles" (sin subrubro) van al final.
const rubroDe = (m) => (m.rubro_padre ? m.rubro : null);
const ordenados = [...materiales].sort((a, b) => {
  const ra = rubroDe(a);
  const rb = rubroDe(b);
  if (ra !== rb) return ra == null ? 1 : rb == null ? -1 : compararTexto(ra, rb);
  return compararTexto(a.descripcion, b.descripcion);
});

const favoritos = [...materiales]
  .map((m) => ({ id: m.id, descripcion: m.descripcion, n: Number(retiros[m.id] || 0) }))
  .filter((x) => x.n > 0)
  .sort((a, b) => (b.n - a.n) || compararTexto(a.descripcion, b.descripcion))
  .slice(0, 30);
const favoritoDe = new Map(favoritos.map((f, i) => [f.id, i + 1]));

const configs = ordenados.map((m, i) => {
  const v = vinculoDe.get(m.id);
  const unidadEntrega = normalizarUnidad(m.unidad_medida || "unidad");
  let factor = null;
  let costo = null;
  if (v) {
    factor = factorCompra({ unidadEntrega, unidadCompra: v.renglon.unidad_compra, contenido: v.renglon.contenido, granel: v.renglon.granel });
    costo = costoUnitario(v.renglon.costo_ars, factor);
  }
  return {
    ord: i + 1,
    material: m,
    forma: formaEntrega(m),
    unidadEntrega,
    proveedorCodigo: v?.renglon.codigo ?? null,
    unidadCompra: v?.renglon.unidad_compra ?? null,
    factor,
    costo,
    favorito: favoritoDe.get(m.id) ?? null,
  };
});

// ── SQL ─────────────────────────────────────────────────────────────────────

const q = (s) => (s == null || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const n = (x) => (x == null || !Number.isFinite(Number(x)) ? "null" : String(Number(x)));
const fechaHoy = new Date().toISOString().slice(0, 10);
const archivo = args.archivo || path.basename(args.excel);
const listaWhere = `proveedor_nombre = ${q(PROVEEDOR)} and vigente_desde = date ${q(VIGENTE)}`;

const filasItems = lista.renglones.map((r, i) => {
  const cast = i === 0;
  return `  (${q(r.codigo)}${cast ? "::text" : ""}, ${q(r.descripcion)}${cast ? "::text" : ""}, ${q(r.medida)}${cast ? "::text" : ""}, `
    + `${n(r.precio)}${cast ? "::numeric" : ""}, ${q(r.moneda)}${cast ? "::text" : ""}, ${q(r.condicion)}${cast ? "::text" : ""}, `
    + `${n(r.costo_ars)}${cast ? "::numeric" : ""}, ${q(r.unidad_compra)}${cast ? "::text" : ""}, ${n(r.contenido)}${cast ? "::numeric" : ""}, `
    + `${q(materialDeCodigo.get(r.codigo))}${cast ? "::uuid" : ""})`;
});

const filasConfig = configs.map((c, i) => {
  const cast = i === 0;
  return `  (${c.ord}${cast ? "::int" : ""}, ${q(c.material.id)}${cast ? "::uuid" : ""}, ${q(c.forma)}${cast ? "::text" : ""}, `
    + `${q(c.unidadEntrega)}${cast ? "::text" : ""}, ${q(c.proveedorCodigo)}${cast ? "::text" : ""}, ${q(c.unidadCompra)}${cast ? "::text" : ""}, `
    + `${n(c.factor)}${cast ? "::numeric" : ""}, ${n(c.costo)}${cast ? "::numeric" : ""}, ${n(c.favorito)}${cast ? "::int" : ""})`
    + `  -- ${String(c.material.descripcion).replace(/\s+/g, " ")}`;
});
// El comentario va después de la coma: se arma la lista a mano.
const valoresConfig = filasConfig
  .map((f, i) => {
    const corte = f.indexOf("  -- ");
    return f.slice(0, corte) + (i < filasConfig.length - 1 ? "," : "") + f.slice(corte);
  })
  .join("\n");

const cuerpo = `-- ── 1. La lista ─────────────────────────────────────────────────────────────
-- Una por proveedor y fecha de vigencia: si ya está (cargada a mano desde la
-- pestaña Precios, o porque esto ya corrió), se usa esa.
insert into public.consumibles_listas (proveedor_id, proveedor_nombre, vigente_desde, archivo_nombre, dolar_vendedor, notas)
select
  (select p.id from public.panol_proveedores p where p.id = ${q(proveedor?.id)}::uuid),
  ${q(PROVEEDOR)},
  date ${q(VIGENTE)},
  ${q(archivo)},
  ${n(DOLAR)},
  ${q([
    `Carga inicial (${fechaHoy}) desde "${archivo}", hoja "${hoja}".`,
    DOLAR ? `Dólar oficial vendedor BNA del ${DOLAR_FECHA}: ${DOLAR} (api.argentinadatos.com).` : "Sin dólar: los renglones en USD quedan sin costo en pesos.",
    ...lista.notas.map((t) => `Nota de la lista: ${t}`),
  ].join("\n"))}
where not exists (select 1 from public.consumibles_listas where ${listaWhere});

-- ── 2. Los renglones ────────────────────────────────────────────────────────
-- costo_ars = precio en pesos sin IVA por unidad de compra ("+IVA" y "Final"
-- van igual; USD × dólar). material_id solo en los vínculos inequívocos.
drop table if exists pg_temp._cns_items;
create temp table _cns_items (
  codigo text, descripcion text, medida text, precio numeric, moneda text,
  condicion text, costo_ars numeric, unidad_compra text, contenido numeric, material_id uuid
) on commit drop;

insert into _cns_items values
${filasItems.join(",\n")};

insert into public.consumibles_lista_items
  (lista_id, codigo, descripcion, medida, precio, moneda, condicion, costo_ars, unidad_compra, contenido, material_id)
select
  l.id, i.codigo, i.descripcion, i.medida, i.precio, i.moneda, i.condicion, i.costo_ars, i.unidad_compra, i.contenido,
  (select m.id from public.panol_materiales m where m.id = i.material_id)
from _cns_items i
cross join lateral (
  select id from public.consumibles_listas where ${listaWhere} order by created_at limit 1
) l
on conflict (lista_id, codigo) do update
  -- Si alguien ya lo concilió a mano, se respeta.
  set material_id = coalesce(public.consumibles_lista_items.material_id, excluded.material_id);

-- ── 3. Config de cada consumible ────────────────────────────────────────────
-- En orden de rubro y descripción, así los códigos KA quedan agrupados en el
-- estante y en las etiquetas. El código se calcula acá (no con el default de
-- la secuencia) para que el orden sea exacto; después se corre la secuencia.
drop table if exists pg_temp._cns_config;
create temp table _cns_config (
  ord int, material_id uuid, forma_entrega text, unidad_entrega text, proveedor_codigo text,
  unidad_compra text, factor_compra numeric, costo_unitario_ars numeric, favorito_orden int
) on commit drop;

insert into _cns_config values
${valoresConfig}
;

insert into public.consumibles_config (
  material_id, codigo_etiqueta, forma_entrega, unidad_entrega,
  proveedor_nombre, proveedor_codigo, unidad_compra, factor_compra,
  costo_unitario_ars, costo_lista_item_id, costo_actualizado_at, favorito_orden
)
select
  n.material_id,
  'KA' || lpad((b.base + n.rn)::text, 4, '0'),
  n.forma_entrega,
  n.unidad_entrega,
  case when li.id is not null then ${q(PROVEEDOR)} end,
  case when li.id is not null then n.proveedor_codigo end,
  case when li.id is not null then n.unidad_compra end,
  case when li.id is not null then n.factor_compra end,
  case when li.id is not null then n.costo_unitario_ars end,
  li.id,
  case when li.id is not null then now() end,
  n.favorito_orden
from (
  select c.*, row_number() over (order by c.ord) as rn
  from _cns_config c
  join public.panol_materiales m on m.id = c.material_id
  where not exists (select 1 from public.consumibles_config x where x.material_id = c.material_id)
) n
cross join (
  select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) as base
  from public.consumibles_config
) b
left join public.consumibles_lista_items li
  on li.lista_id = (select id from public.consumibles_listas where ${listaWhere} order by created_at limit 1)
 and li.codigo = n.proveedor_codigo
 and li.material_id = n.material_id;

-- Los que ya tenían config (creada desde la app): solo se completa lo vacío.
update public.consumibles_config c
   set proveedor_nombre = coalesce(c.proveedor_nombre, ${q(PROVEEDOR)}),
       proveedor_codigo = v.proveedor_codigo,
       unidad_compra = coalesce(c.unidad_compra, v.unidad_compra),
       factor_compra = coalesce(c.factor_compra, v.factor_compra),
       costo_unitario_ars = coalesce(c.costo_unitario_ars, v.costo_unitario_ars),
       costo_lista_item_id = coalesce(c.costo_lista_item_id, li.id),
       costo_actualizado_at = coalesce(c.costo_actualizado_at, now())
  from _cns_config v
  join public.consumibles_lista_items li
    on li.lista_id = (select id from public.consumibles_listas where ${listaWhere} order by created_at limit 1)
   and li.codigo = v.proveedor_codigo
   and li.material_id = v.material_id
 where c.material_id = v.material_id
   and c.proveedor_codigo is null
   and v.proveedor_codigo is not null;

update public.consumibles_config c
   set favorito_orden = v.favorito_orden
  from _cns_config v
 where c.material_id = v.material_id
   and c.favorito_orden is null
   and v.favorito_orden is not null
   and not exists (select 1 from public.consumibles_config x where x.favorito_orden = v.favorito_orden);

-- La secuencia sigue desde el último código usado.
select setval(
  'public.consumibles_codigo_seq',
  (select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) + 1 from public.consumibles_config),
  false
);
`;

const resumenFormas = configs.reduce((acc, c) => ((acc[c.forma] = (acc[c.forma] || 0) + 1), acc), {});
const conCosto = configs.filter((c) => c.costo != null).length;

const encabezado = `-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: lista de precios de Rebollar (CMR Insumos Industriales),
-- vigente desde el ${VIGENTE}.
--
-- GENERADA por scripts/consumibles/lista-rebollar.mjs (${fechaHoy}) a partir de
-- "${archivo}". No editar a mano: se regenera con la lista siguiente.
--
--   · 1 lista (proveedor_id = panol_proveedores "${proveedor?.nombre ?? "—"}"),
--     dólar oficial vendedor BNA ${DOLAR ?? "—"} (${DOLAR_FECHA}).
--   · ${lista.renglones.length} renglones (${lista.notas.length} notas al pie quedan en la lista, no son productos).
--   · ${seguros.length} renglones vinculados a un consumible (cruce inequívoco).
--     ${dudosos.length} dudosos y ${sinPar.length} sin par van a
--     docs/consumibles/conciliacion-rebollar.csv para resolver en la pestaña
--     Catálogo → Conciliar.
--   · Config para los ${configs.length} consumibles activos, en orden de rubro y
--     descripción (KA0001…), forma de entrega por regla
--     (${Object.entries(resumenFormas).map(([k, v]) => `${k} ${v}`).join(", ")}),
--     ${conCosto} con costo por unidad de entrega y ${favoritos.length} favoritos del mostrador
--     (los más retirados por solicitud).
--
-- Idempotente: se puede correr dos veces. La lista se reconoce por proveedor y
-- fecha; los renglones por (lista, código); la config por material, y en una
-- config que ya existía solo se completan los campos vacíos.
-- ═════════════════════════════════════════════════════════════════════════════
`;

fs.writeFileSync(SALIDA, `${encabezado}\nbegin;\n\n${cuerpo}\ncommit;\n`);

if (args.ensayo) {
  const primero = configs[0];
  // setval no se deshace con el rollback: el ensayo guarda la secuencia al
  // empezar y la devuelve antes de la excepción final.
  const ensayo = `-- ENSAYO de ${path.basename(SALIDA)}: corre la carga dos veces, verifica y se deshace.
begin;

create temp table _cns_seq_antes on commit drop as
  select last_value, is_called from public.consumibles_codigo_seq;

${cuerpo}
-- Segunda pasada: no tiene que duplicar nada.
${cuerpo}
do $$
declare
  v_lista uuid := (select id from public.consumibles_listas where ${listaWhere} order by created_at limit 1);
  v_json json;
begin
  v_json := (select json_build_object(
    'listas', (select count(*) from public.consumibles_listas where ${listaWhere}),
    'items', (select count(*) from public.consumibles_lista_items where lista_id = v_lista),
    'items_con_material', (select count(*) from public.consumibles_lista_items where lista_id = v_lista and material_id is not null),
    'items_sin_costo', (select count(*) from public.consumibles_lista_items where lista_id = v_lista and costo_ars is null),
    'items_usd', (select count(*) from public.consumibles_lista_items where lista_id = v_lista and moneda = 'USD'),
    'config', (select count(*) from public.consumibles_config),
    'config_con_proveedor', (select count(*) from public.consumibles_config where proveedor_codigo is not null),
    'config_con_costo', (select count(*) from public.consumibles_config where costo_unitario_ars is not null),
    'config_con_item', (select count(*) from public.consumibles_config where costo_lista_item_id is not null),
    'favoritos', (select count(*) from public.consumibles_config where favorito_orden is not null),
    'favoritos_distintos', (select count(distinct favorito_orden) from public.consumibles_config),
    'codigos_distintos', (select count(distinct codigo_etiqueta) from public.consumibles_config),
    'codigo_min', (select min(codigo_etiqueta) from public.consumibles_config),
    'codigo_max', (select max(codigo_etiqueta) from public.consumibles_config),
    'ka0001', (select m.descripcion from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where c.codigo_etiqueta = 'KA0001'),
    'ka0001_esperado', ${q(primero?.material.descripcion)},
    'formas', (select json_object_agg(forma_entrega, n) from (select forma_entrega, count(*) n from public.consumibles_config group by 1) t),
    'proximo_codigo', (select last_value from public.consumibles_codigo_seq),
    'proximo_is_called', (select is_called from public.consumibles_codigo_seq),
    'proveedor_id', (select proveedor_id from public.consumibles_listas where id = v_lista),
    'dolar', (select dolar_vendedor from public.consumibles_listas where id = v_lista),
    'muestra_usd', (select json_build_object('codigo', codigo, 'precio', precio, 'costo_ars', costo_ars) from public.consumibles_lista_items where lista_id = v_lista and codigo = 'F0002'),
    'muestra_cfg', (select json_build_object('codigo', c.codigo_etiqueta, 'prov', c.proveedor_codigo, 'factor', c.factor_compra, 'costo', c.costo_unitario_ars, 'forma', c.forma_entrega, 'fav', c.favorito_orden)
                      from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where m.descripcion = 'Lija Al Agua 600' limit 1)
  ));
  perform setval('public.consumibles_codigo_seq', (select last_value from _cns_seq_antes), (select is_called from _cns_seq_antes));
  raise exception 'ENSAYO_OK %', v_json;
end $$;
`;
  fs.writeFileSync(path.resolve(args.ensayo), ensayo);
}

// ── Planilla de conciliación ────────────────────────────────────────────────

const celda = (v) => {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const descRenglon = (r) => (r.medida ? `${r.descripcion} [${r.medida}]` : r.descripcion);
const cab = ["estado", "consumible", "rubro", "unidad", "material_id", "motivo"];
for (let i = 1; i <= 3; i++) cab.push(`cand${i}_codigo`, `cand${i}_descripcion`, `cand${i}_puntaje`);
const filasCsv = [
  ...dudosos.map((d) => ({ estado: "dudoso", ...d })),
  ...sinPar.map((d) => ({ estado: "sin_par", ...d })),
]
  .sort((a, b) => (a.estado === b.estado ? 0 : a.estado === "dudoso" ? -1 : 1)
    || compararTexto(rubroDe(a.material) ?? "~", rubroDe(b.material) ?? "~")
    || compararTexto(a.material.descripcion, b.material.descripcion))
  .map((d) => {
    const fila = [d.estado, d.material.descripcion, rubroDe(d.material) ?? "(sin subrubro)", d.material.unidad_medida, d.material.id, d.motivo];
    for (let i = 0; i < 3; i++) {
      const c = d.candidatos[i];
      fila.push(c?.renglon.codigo ?? "", c ? descRenglon(c.renglon) : "", c ? Math.round(c.puntaje * 100) : "");
    }
    return fila.map(celda).join(";");
  });
fs.mkdirSync(path.dirname(CSV), { recursive: true });
// Con BOM y punto y coma: así lo abre bien el Excel en castellano.
fs.writeFileSync(CSV, `﻿${cab.join(";")}\n${filasCsv.join("\n")}\n`);

// ── Resumen ─────────────────────────────────────────────────────────────────

console.log(JSON.stringify({
  hoja,
  vigente: VIGENTE,
  dolar: DOLAR,
  dolar_fecha: DOLAR_FECHA,
  proveedor,
  renglones: lista.renglones.length,
  notas: lista.notas.length,
  consumibles: materiales.length,
  vinculados: seguros.length,
  dudosos: dudosos.length,
  sin_par: sinPar.length,
  config_con_costo: conCosto,
  vinculados_sin_factor: configs.filter((c) => c.proveedorCodigo && c.factor == null).map((c) => c.material.descripcion),
  formas: resumenFormas,
  favoritos: favoritos.map((f, i) => `${i + 1}. ${f.descripcion} (${f.n})`),
  migracion: path.relative(RAIZ, SALIDA),
  csv: path.relative(RAIZ, CSV),
}, null, 2));
