#!/usr/bin/env node
/**
 * Histórico de consumibles retirados por solicitud de papel (desde el 04/08/2026
 * hasta el arranque del registro nuevo), a Excel y valorizado a costo de hoy.
 *
 * Es un PISO, no el consumo real: solo aparece lo que pasó por la hoja de papel
 * y pañol cargó. Lo que salió sin papel no está en ningún lado. El consumo real
 * sale del historial de ventas de Rebollar; este archivo sirve para comparar.
 *
 * Valoriza con `consumibles_config.costo_unitario_ars` (la lista de Rebollar
 * vigente, por unidad de entrega). Lo que todavía no está vinculado a la lista
 * queda sin valor y se cuenta aparte, para que se vea cuánto falta conciliar.
 *
 * Solo lee la base (CLI de Supabase ya logueada). Uso:
 *   node scripts/consumibles-historico.mjs [carpeta-de-salida]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const salida = resolve(process.argv[2] || "entregables/consumibles");

const SQL = `
select json_agg(t order by t.fecha, t.numero) as filas from (
  select
    coalesce(sol.retirado_at, s.egreso_at, s.created_at) as fecha,
    sol.numero,
    sol.fecha_pedido,
    sol.created_at as solicitud_creada,
    coalesce(nullif(sol.retirado_por_nombre, ''), nullif(sol.retira, ''), s.retirado_por) as retira,
    sol.solicita,
    coalesce(nullif(s.sector_destino, ''), nullif(sol.sector, '')) as sector,
    coalesce(o.codigo, nullif(sol.obra_texto, '')) as obra,
    s.material_id,
    coalesce(m.descripcion, s.descripcion) as producto,
    coalesce(cfg.unidad_entrega, m.unidad_medida, s.unidad) as unidad,
    coalesce(c.nombre, '(sin rubro)') as rubro,
    abs(coalesce(nullif(s.cantidad_egresada, 0), s.cantidad, 0)) as cantidad,
    cfg.proveedor_codigo as codigo_rebollar,
    cfg.costo_unitario_ars as costo_unitario
  from public.panol_obra_materiales_snapshot s
  left join public.panol_solicitudes sol on sol.id = s.panol_solicitud_id
  left join public.produccion_obras o on o.id = coalesce(s.obra_id, sol.obra_id)
  left join public.panol_materiales m on m.id = s.material_id
  left join public.panol_categorias c on c.id = m.categoria_id
  left join public.consumibles_config cfg on cfg.material_id = s.material_id
  where s.source = 'solicitud_consumible_retiro'
    and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
) t;
`;

function consultar(sql) {
  const dir = mkdtempSync(join(tmpdir(), "consumibles-historico-"));
  const archivo = join(dir, "q.sql");
  writeFileSync(archivo, sql);
  // La CLI a veces falla el primer intento con TransportError: se reintenta.
  for (let intento = 1; ; intento++) {
    try {
      const out = execFileSync("npx", ["supabase", "db", "query", "--linked", "-o", "json", "-f", archivo], {
        encoding: "utf8",
        shell: process.platform === "win32",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const json = JSON.parse(out.slice(out.indexOf("{")));
      return json.rows?.[0]?.filas ?? [];
    } catch (e) {
      if (intento >= 3) throw e;
    }
  }
}

const mes = (iso) => String(iso || "").slice(0, 7);
const redondear = (n) => Math.round(n * 100) / 100;

function agrupar(filas, clave) {
  const map = new Map();
  for (const f of filas) {
    const k = clave(f) ?? "(sin dato)";
    const a = map.get(k) ?? { renglones: 0, valorizado: 0, sinValor: 0 };
    a.renglones += 1;
    if (f.valor != null) a.valorizado += f.valor;
    else a.sinValor += 1;
    map.set(k, a);
  }
  return [...map.entries()]
    .map(([k, a]) => ({ k, ...a, valorizado: redondear(a.valorizado) }))
    .sort((x, y) => y.valorizado - x.valorizado || y.renglones - x.renglones);
}

function hoja(filas, columnas) {
  const ws = XLSX.utils.json_to_sheet(filas, { header: columnas.map((c) => c.k) });
  XLSX.utils.sheet_add_aoa(ws, [columnas.map((c) => c.t)], { origin: "A1" });
  ws["!cols"] = columnas.map((c) => ({ wch: c.w ?? 14 }));
  ws["!autofilter"] = { ref: ws["!ref"] };
  return ws;
}

const crudas = consultar(SQL);
const filas = crudas.map((r) => {
  const cantidad = Number(r.cantidad) || 0;
  const costo = r.costo_unitario == null ? null : Number(r.costo_unitario);
  return {
    fecha: String(r.fecha || "").slice(0, 10),
    hora: String(r.fecha || "").slice(11, 16),
    mes: mes(r.fecha),
    numero: r.numero,
    retira: r.retira || "",
    solicita: r.solicita || "",
    sector: r.sector || "",
    obra: r.obra || "",
    rubro: r.rubro,
    producto: r.producto,
    unidad: r.unidad || "",
    cantidad,
    codigo_rebollar: r.codigo_rebollar || "",
    costo_unitario: costo,
    valor: costo == null ? null : redondear(costo * cantidad),
  };
});

if (!filas.length) {
  console.error("No hay retiros de consumibles por solicitud.");
  process.exit(1);
}

const total = filas.reduce((s, f) => s + (f.valor ?? 0), 0);
const sinValor = filas.filter((f) => f.valor == null);
const desde = filas[0].fecha;
const hasta = filas.at(-1).fecha;

const wb = XLSX.utils.book_new();

XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
  ["Consumibles retirados por solicitud de papel"],
  [`Del ${desde} al ${hasta}`],
  [],
  ["Renglones retirados", filas.length],
  ["Solicitudes", new Set(filas.map((f) => f.numero)).size],
  ["Personas distintas que retiraron", new Set(filas.map((f) => f.retira).filter(Boolean)).size],
  ["Valorizado a costo de hoy (pesos sin IVA)", redondear(total)],
  ["Renglones sin valorizar (producto sin vincular a la lista)", sinValor.length],
  [],
  ["Es un piso, no el consumo real: solo está lo que pasó por la hoja de papel."],
  ["El consumo real sale del historial de ventas de Rebollar."],
  [`Generado el ${new Date().toISOString().slice(0, 10)} con scripts/consumibles-historico.mjs`],
]), "Resumen");

XLSX.utils.book_append_sheet(wb, hoja(filas, [
  { k: "fecha", t: "Fecha", w: 11 }, { k: "hora", t: "Hora", w: 7 }, { k: "numero", t: "Solicitud", w: 9 },
  { k: "retira", t: "Retira", w: 24 }, { k: "sector", t: "Sector", w: 14 }, { k: "obra", t: "Obra", w: 10 },
  { k: "rubro", t: "Rubro", w: 20 }, { k: "producto", t: "Producto", w: 32 }, { k: "cantidad", t: "Cantidad", w: 9 },
  { k: "unidad", t: "Unidad", w: 9 }, { k: "codigo_rebollar", t: "Código Rebollar", w: 14 },
  { k: "costo_unitario", t: "Costo unitario", w: 13 }, { k: "valor", t: "Valor", w: 12 },
]), "Detalle");

const cols = (titulo) => [
  { k: "k", t: titulo, w: 32 }, { k: "renglones", t: "Renglones", w: 11 },
  { k: "valorizado", t: "Valorizado ($)", w: 15 }, { k: "sinValor", t: "Renglones sin valor", w: 18 },
];
XLSX.utils.book_append_sheet(wb, hoja(agrupar(filas, (f) => f.sector || null), cols("Sector")), "Por sector");
XLSX.utils.book_append_sheet(wb, hoja(agrupar(filas, (f) => f.rubro), cols("Rubro")), "Por rubro");
XLSX.utils.book_append_sheet(wb, hoja(agrupar(filas, (f) => f.retira || null), cols("Persona")), "Por persona");
XLSX.utils.book_append_sheet(wb, hoja(agrupar(filas, (f) => f.obra || null), cols("Obra")), "Por obra");
XLSX.utils.book_append_sheet(wb, hoja(agrupar(filas, (f) => `${f.mes} · ${f.rubro}`), cols("Mes · rubro")), "Por mes y rubro");

const productos = new Map();
for (const f of filas) {
  const a = productos.get(f.producto) ?? { producto: f.producto, unidad: f.unidad, rubro: f.rubro, codigo: f.codigo_rebollar, renglones: 0, cantidad: 0, valor: 0, conValor: f.valor != null };
  a.renglones += 1;
  a.cantidad += f.cantidad;
  a.valor += f.valor ?? 0;
  productos.set(f.producto, a);
}
XLSX.utils.book_append_sheet(wb, hoja(
  [...productos.values()].map((p) => ({ ...p, cantidad: redondear(p.cantidad), valor: p.conValor ? redondear(p.valor) : null }))
    .sort((a, b) => b.renglones - a.renglones),
  [
    { k: "producto", t: "Producto", w: 32 }, { k: "rubro", t: "Rubro", w: 20 }, { k: "codigo", t: "Código Rebollar", w: 14 },
    { k: "renglones", t: "Veces pedido", w: 12 }, { k: "cantidad", t: "Cantidad total", w: 13 }, { k: "unidad", t: "Unidad", w: 9 },
    { k: "valor", t: "Valorizado ($)", w: 15 },
  ],
), "Por producto");

mkdirSync(salida, { recursive: true });
const archivo = join(salida, `historico-consumibles-${hasta}.xlsx`);
XLSX.writeFile(wb, archivo);
console.log(`Listo: ${archivo}`);
console.log(`${filas.length} renglones, ${desde} a ${hasta}; valorizado $ ${redondear(total).toLocaleString("es-AR")}; sin valorizar ${sinValor.length}.`);
