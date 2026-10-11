#!/usr/bin/env node
/**
 * Consumibles desde la lista de Rebollar → migración (sin aplicar).
 *
 *   node scripts/consumibles/productos-desde-lista.mjs [--version 20261010190000] [--ensayo <archivo.sql>] [--fecha 10/10/2026]
 *
 * Criterio (Ezequiel, 10/10/2026): el módulo arranca DE CERO con los
 * productos de la lista vigente de Rebollar.
 *   1. Renglón ya vinculado a un consumible viejo: se reutiliza ese material
 *      (id, historial, códigos, favorito) con el nombre de Rebollar; el nombre
 *      viejo pasa al alias.
 *   2. Renglón sin material: alta como consumible (material + config).
 *   3. Consumible viejo que es claramente un producto de la lista: se fusiona
 *      (consumibles_fusionar_interno) en el de Rebollar.
 *   4. El resto de los viejos sale del módulo (activo = false), sin borrarse.
 *   5. Códigos KA renumerados en orden de rubro y descripción.
 *
 * Lee la base solo para consultar (la lista ya está cargada por la migración
 * 20261010140000). Con --ensayo escribe además un SQL que corre todo dos
 * veces, verifica, devuelve la secuencia y termina con una excepción.
 */

import { execSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const imp = (rel) => import(pathToFileURL(path.join(RAIZ, rel)).href);
const { factorCompra, costoUnitario, interpretarContenido, normalizarUnidad } = await imp("src/features/consumibles/precios/normalizarLista.js");
const { candidatos, indiceDeRareza, prepararConsumible, prepararRenglon, porTamano } = await imp("src/features/consumibles/catalogo/emparejar.js");
const { formaEntregaSugerida, nombreProducto, rubroSugerido, unidadEntregaSugerida } = await imp("src/features/consumibles/catalogo/reglas.js");

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a.startsWith("--")) args[a.slice(2)] = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[++i] : true;
}
const VERSION = args.version || "20261010190000";
const FECHA = args.fecha || "10/10/2026";
const SALIDA = path.join(RAIZ, "supabase/migrations", `${VERSION}_consumibles_productos_desde_lista.sql`);
const NOTA_FUERA = `Fuera de la lista de Rebollar (${FECHA})`;

// Decisiones a mano, con su porqué. Se aplican además del cruce automático.
const FUSIONES_A_MANO = {
  // "Cinta Fina Verde 18mm" ya es la de papel verde 18 mm (C0031): la ancha
  // es la misma de 48 mm. La aisladora verde no es "ancha".
  "Cinta Ancha Verde": "C0032",
  // Rebollar tiene un solo disco de desbaste (4 1/2"); el 7" no existe.
  'Disco Desbaste Chico 4"': "D0065",
};
// El cruce dice Grower, pero también puede ser una plana repetida: que decida
// una persona.
const NO_FUSIONAR = new Set(["Arandela 1/2"]);

// ── Base (solo lectura) ─────────────────────────────────────────────────────

function consultar(sql) {
  const tmp = path.join(os.tmpdir(), `klasea-consumibles-${process.pid}-${Date.now()}.sql`);
  fs.writeFileSync(tmp, sql);
  try {
    const out = execSync(`npx supabase db query --linked -o json -f "${tmp}"`, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    return JSON.parse(out.slice(out.indexOf("{"))).rows ?? [];
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

const [{ r: datos }] = consultar(`
with lista as (
  select * from public.consumibles_listas
   where proveedor_nombre ilike 'rebollar'
   order by vigente_desde desc, created_at desc limit 1
), raiz as (
  select id from public.panol_categorias where parent_id is null and lower(btrim(nombre)) = 'consumibles' limit 1
)
select json_build_object(
  'lista', (select json_build_object('id', id, 'proveedor_nombre', proveedor_nombre, 'vigente_desde', vigente_desde) from lista),
  'items', (select coalesce(json_agg(json_build_object(
      'id', i.id, 'codigo', i.codigo, 'descripcion', i.descripcion, 'medida', i.medida, 'costo_ars', i.costo_ars,
      'unidad_compra', i.unidad_compra, 'contenido', i.contenido, 'material_id', i.material_id) order by i.codigo), '[]'::json)
      from public.consumibles_lista_items i where i.lista_id = (select id from lista)),
  'materiales', (select coalesce(json_agg(json_build_object(
      'id', m.id, 'descripcion', m.descripcion, 'alias', m.alias, 'unidad_medida', m.unidad_medida,
      'categoria_id', m.categoria_id, 'rubro', c.nombre, 'rubro_padre', p.nombre, 'activo', coalesce(m.activo, true),
      'unidad_entrega', cfg.unidad_entrega, 'notas', cfg.notas) order by m.descripcion), '[]'::json)
      from public.panol_materiales m
      left join public.panol_categorias c on c.id = m.categoria_id
      left join public.panol_categorias p on p.id = c.parent_id
      left join public.consumibles_config cfg on cfg.material_id = m.id
     where m.es_consumible = true),
  'raiz', (select id from raiz),
  'subrubros', (select coalesce(json_agg(json_build_object('id', id, 'nombre', nombre)), '[]'::json)
      from public.panol_categorias where parent_id = (select id from raiz)),
  'retiros', (select coalesce(json_object_agg(material_id, n), '{}'::json) from (
      select s.material_id, count(*) as n from public.panol_obra_materiales_snapshot s
       where s.source = 'solicitud_consumible_retiro' and s.material_id is not null
         and lower(coalesce(s.notas, '') || ' ' || coalesce(s.egreso_nota, '')) not like '%[anulado]%'
       group by s.material_id) t)
) as r;`);

const { lista, items, materiales, raiz, subrubros, retiros } = datos;
if (!lista || !items.length) throw new Error("No hay lista de Rebollar cargada.");
const catPorNombre = new Map(subrubros.map((c) => [c.nombre, c.id]));
const nombreCat = new Map([[raiz, "Consumibles"], ...subrubros.map((c) => [c.id, c.nombre])]);
const matPorId = new Map(materiales.map((m) => [m.id, m]));
const categoriaDe = (texto) => catPorNombre.get(rubroSugerido(texto)) ?? raiz;

// Id fijo por código de Rebollar: la migración se puede correr dos veces y
// regenerar sin cambiar los ids.
function idDeCodigo(codigo) {
  const h = crypto.createHash("sha1").update(`klasea:consumibles:rebollar:${codigo}`).digest("hex").split("");
  h[12] = "5";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

// ── 1 y 2: reutilizados y nuevos ────────────────────────────────────────────

// Nombres repetidos en la lista (las mangueras vienen sin medida): se les
// agrega el código de Rebollar para poder distinguirlas en el mostrador.
const vecesNombre = items.reduce((m, it) => m.set(nombreProducto(it).toLowerCase(), (m.get(nombreProducto(it).toLowerCase()) ?? 0) + 1), new Map());
const nombreUnico = (it) => (vecesNombre.get(nombreProducto(it).toLowerCase()) > 1 ? `${nombreProducto(it)} (${it.codigo})` : nombreProducto(it));

const reutilizados = [];
const nuevos = [];
const materialDeItem = new Map();
for (const it of items) {
  const nombre = nombreUnico(it);
  const cont = interpretarContenido(it.descripcion);
  if (it.material_id && matPorId.has(it.material_id)) {
    const m = matPorId.get(it.material_id);
    const sug = catPorNombre.get(rubroSugerido(nombre));
    reutilizados.push({ item: it, material: m, nombre, categoriaId: sug ?? m.categoria_id });
    materialDeItem.set(it.id, m.id);
    continue;
  }
  const unidad = unidadEntregaSugerida(it.descripcion, cont);
  const factor = factorCompra({ unidadEntrega: unidad, unidadCompra: it.unidad_compra, contenido: it.contenido, granel: cont.granel });
  const n = {
    id: idDeCodigo(it.codigo),
    item: it,
    nombre,
    categoriaId: categoriaDe(nombre),
    unidad,
    forma: formaEntregaSugerida(it.descripcion),
    factor,
    costo: costoUnitario(it.costo_ars, factor),
  };
  nuevos.push(n);
  materialDeItem.set(it.id, n.id);
}

// ── 3: fusiones ─────────────────────────────────────────────────────────────

const vinculados = new Set(reutilizados.map((r) => r.material.id));
// Solo los activos que todavía no son de la lista (al regenerar después de
// aplicada, los que ya salieron no vuelven a mirarse).
const viejos = materiales.filter((m) => m.activo && !vinculados.has(m.id) && !nuevos.some((n) => n.id === m.id));
const rs = items.map((it) => prepararRenglon({ ...it, descripcion: it.descripcion, medida: it.medida }));
const rareza = indiceDeRareza(rs);
const itemPorCodigo = new Map(items.map((it) => [it.codigo, it]));
const fusiones = [];
const salen = [];
for (const v of viejos) {
  let destino = null;
  let motivo = "";
  if (FUSIONES_A_MANO[v.descripcion]) {
    destino = itemPorCodigo.get(FUSIONES_A_MANO[v.descripcion]);
    motivo = "a mano";
  } else if (!NO_FUSIONAR.has(v.descripcion) && !/\s(y|e)\s/i.test(v.descripcion)) {
    const cands = candidatos(prepararConsumible(v), rs, { max: 0, minimo: 0.2, rareza });
    const aptos = cands.filter((c) => c.apto).sort((a, b) => (b.puntaje - a.puntaje) || (b.precision - a.precision));
    const conCabeza = cands.filter((c) => c.cabezaOk).length;
    const mejor = aptos[0];
    if (mejor && mejor.puntaje >= (conCabeza === 1 ? 0.5 : 0.6)) {
      const empatados = aptos.filter((c) => c.puntaje >= mejor.puntaje - 0.15);
      if (empatados.length === 1) {
        destino = mejor.renglon;
        motivo = "único renglón con esas palabras y medidas";
      } else {
        const porMedida = porTamano(v, empatados);
        // Si entre los empatados todos menos uno ya son de otro consumible
        // viejo (p. ej. "Cutter" vs. la hoja de cutter, que ya es "HOJA
        // CUTER"), el que queda es este.
        const libres = empatados.filter((c) => !c.renglon.material_id);
        if (porMedida) { destino = porMedida.renglon; motivo = "chico/grande entre dos medidas"; }
        else if (libres.length === 1) { destino = libres[0].renglon; motivo = "el otro parecido ya es de otro producto"; }
      }
    }
  }
  if (destino) fusiones.push({ viejo: v, item: destino, nuevoId: materialDeItem.get(destino.id), motivo });
  else salen.push(v);
}

// ── 5: orden de los códigos KA ──────────────────────────────────────────────

const comparar = (a, b) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });
const activosFinal = [
  ...reutilizados.map((r) => ({ id: r.material.id, nombre: r.nombre, cat: r.categoriaId })),
  ...nuevos.map((n) => ({ id: n.id, nombre: n.nombre, cat: n.categoriaId })),
].sort((a, b) => {
  const ra = a.cat === raiz ? null : nombreCat.get(a.cat) ?? null;
  const rb = b.cat === raiz ? null : nombreCat.get(b.cat) ?? null;
  if (ra !== rb) return ra == null ? 1 : rb == null ? -1 : comparar(ra, rb);
  return comparar(a.nombre, b.nombre);
});

// ── SQL ─────────────────────────────────────────────────────────────────────

const q = (s) => (s == null || s === "" ? "null" : `'${String(s).replace(/'/g, "''")}'`);
const n = (x) => (x == null || !Number.isFinite(Number(x)) ? "null" : String(Number(x)));
const comentario = (s) => String(s).replace(/\s+/g, " ").replace(/\*\//g, "");
const valores = (filas, columnas) => filas.map((f, i) => {
  const celdas = columnas.map(([k, tipo]) => {
    const v = f[k];
    const lit = tipo === "numeric" || tipo === "int" ? n(v) : q(v);
    return i === 0 ? `${lit}::${tipo}` : lit;
  });
  return `  (${celdas.join(", ")})${i < filas.length - 1 ? "," : ""}${f._c ? `  -- ${comentario(f._c)}` : ""}`;
}).join("\n");
const listaId = `(select id from public.consumibles_listas where id = ${q(lista.id)}::uuid)`;

const funciones = `-- ── Funciones ───────────────────────────────────────────────────────────────

-- Suma un nombre al alias sin duplicar ni pisar lo que había. Si el nombre
-- es la descripción misma, no hace falta.
create or replace function public.consumibles_alias_sumar(p_alias text, p_nombre text, p_descripcion text)
returns text
language sql
immutable
as $$
  select case
    when nullif(btrim(coalesce(p_nombre, '')), '') is null then p_alias
    when lower(btrim(p_nombre)) = lower(btrim(coalesce(p_descripcion, ''))) then p_alias
    when nullif(btrim(coalesce(p_alias, '')), '') is null then btrim(p_nombre)
    when position(lower(btrim(p_nombre)) in lower(p_alias)) > 0 then p_alias
    else btrim(p_alias) || ' · ' || btrim(p_nombre)
  end
$$;

-- Fusiona un consumible viejo en el producto de Rebollar que es lo mismo:
-- el nombre viejo va al alias, los códigos de barras pasan al nuevo, y el
-- favorito, el mínimo, la ubicación y el peso también si el nuevo no tiene.
-- El viejo queda dado de baja (no se borra: conserva su historial). Si el
-- viejo tiene movimientos no se fusiona: se perdería su stock.
create or replace function public.consumibles_fusionar_interno(p_viejo uuid, p_nuevo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viejo public.panol_materiales;
  v_nuevo public.panol_materiales;
  v_cv public.consumibles_config;
  v_codigos int := 0;
  v_agregados int := 0;
begin
  if p_viejo is null or p_nuevo is null or p_viejo = p_nuevo then
    raise exception 'Elegí dos productos distintos';
  end if;
  select * into v_viejo from public.panol_materiales where id = p_viejo for update;
  select * into v_nuevo from public.panol_materiales where id = p_nuevo for update;
  if v_viejo.id is null or v_nuevo.id is null then
    raise exception 'No encontré alguno de los dos productos';
  end if;
  if not coalesce(v_viejo.es_consumible, false) or not coalesce(v_nuevo.es_consumible, false) then
    raise exception 'Los dos tienen que ser consumibles';
  end if;
  if v_nuevo.activo = false then
    raise exception '"%" está dado de baja: elegí un producto activo', v_nuevo.descripcion;
  end if;
  -- Ya fusionado (reintento o segunda corrida): no se hace nada.
  if v_viejo.activo = false
     and position(lower(btrim(v_viejo.descripcion)) in lower(coalesce(v_nuevo.alias, ''))) > 0 then
    return jsonb_build_object('ya_fusionado', true, 'viejo', p_viejo, 'nuevo', p_nuevo);
  end if;
  if exists (select 1 from public.consumibles_movimientos where material_id = p_viejo and anulado_at is null) then
    raise exception '"%" ya tiene movimientos: contá su stock en el producto nuevo y anulalos antes de fusionar', v_viejo.descripcion;
  end if;

  select * into v_cv from public.consumibles_config where material_id = p_viejo for update;
  insert into public.consumibles_config (material_id) values (p_nuevo) on conflict (material_id) do nothing;

  -- El viejo suelta su favorito antes de dárselo al nuevo.
  update public.consumibles_config
     set activo_mostrador = false,
         favorito_orden = null,
         codigo_etiqueta = case when codigo_etiqueta like 'BAJA-%' then codigo_etiqueta else 'BAJA-' || codigo_etiqueta end,
         notas = btrim(coalesce(notas || E'\\n', '') || 'Fusionado en "' || v_nuevo.descripcion || '"')
   where material_id = p_viejo;

  update public.consumibles_config
     set favorito_orden = coalesce(favorito_orden, v_cv.favorito_orden),
         stock_maximo = coalesce(stock_maximo, v_cv.stock_maximo),
         cupo_diario = coalesce(cupo_diario, v_cv.cupo_diario)
   where material_id = p_nuevo;

  update public.panol_materiales
     set alias = public.consumibles_alias_sumar(public.consumibles_alias_sumar(alias, v_viejo.descripcion, descripcion), v_viejo.alias, descripcion),
         codigo_barra = coalesce(codigo_barra, v_viejo.codigo_barra),
         stock_minimo = coalesce(stock_minimo, v_viejo.stock_minimo),
         ubicacion = coalesce(ubicacion, v_viejo.ubicacion),
         peso_unitario_g = coalesce(peso_unitario_g, v_viejo.peso_unitario_g),
         peso_muestra_piezas = case when peso_unitario_g is null then v_viejo.peso_muestra_piezas else peso_muestra_piezas end,
         peso_calibrado_at = case when peso_unitario_g is null then v_viejo.peso_calibrado_at else peso_calibrado_at end
   where id = p_nuevo
   returning * into v_nuevo;

  -- Códigos de barras: los de la tabla se mudan; el código y el código de
  -- barras sueltos del viejo se agregan a la tabla del nuevo (el lector los
  -- sigue encontrando).
  update public.panol_material_codigos_barra b
     set material_id = p_nuevo, updated_at = now()
   where b.material_id = p_viejo
     and not exists (select 1 from public.panol_material_codigos_barra x where x.material_id = p_nuevo and x.codigo = b.codigo);
  get diagnostics v_codigos = row_count;
  update public.panol_material_codigos_barra set activo = false, updated_at = now() where material_id = p_viejo and activo;

  insert into public.panol_material_codigos_barra (material_id, codigo, etiqueta, activo)
  select p_nuevo, t.c, left('De ' || v_viejo.descripcion, 120), true
    from (select distinct btrim(c) as c from unnest(array[v_viejo.codigo_barra, v_viejo.codigo]) as c) t
   where nullif(t.c, '') is not null
     and t.c is distinct from v_nuevo.codigo_barra
     and t.c is distinct from v_nuevo.codigo
     and not exists (select 1 from public.panol_material_codigos_barra x where x.material_id = p_nuevo and x.codigo = t.c);
  get diagnostics v_agregados = row_count;

  -- Si el viejo estaba en una lista y el nuevo no, el renglón pasa al nuevo.
  update public.consumibles_lista_items li
     set material_id = case when exists (
           select 1 from public.consumibles_lista_items x where x.lista_id = li.lista_id and x.material_id = p_nuevo
         ) then null else p_nuevo end
   where li.material_id = p_viejo;

  update public.panol_materiales set activo = false, codigo_barra = null where id = p_viejo;

  return jsonb_build_object('viejo', p_viejo, 'nuevo', p_nuevo, 'codigos_movidos', v_codigos + v_agregados, 'alias', v_nuevo.alias);
end;
$$;

-- Lo que usa la pantalla: mismo trabajo, con permiso de listas.
create or replace function public.consumibles_fusionar(p_viejo uuid, p_nuevo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_panol_manager(auth.uid()) then
    raise exception 'Fusionar productos lo pueden hacer admin, Compras y Técnica';
  end if;
  return public.consumibles_fusionar_interno(p_viejo, p_nuevo);
end;
$$;

revoke all on function public.consumibles_fusionar_interno(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consumibles_fusionar(uuid, uuid) to authenticated;
grant execute on function public.consumibles_alias_sumar(text, text, text) to authenticated;
`;

const bloqueFusiones = fusiones.length ? `select public.consumibles_fusionar_interno(f.viejo, f.nuevo)
  from (values
${fusiones.map((f, i) => `    (${q(f.viejo.id)}${i === 0 ? "::uuid" : ""}, ${q(f.nuevoId)}${i === 0 ? "::uuid" : ""})${i < fusiones.length - 1 ? "," : ""}  -- ${comentario(f.viejo.descripcion)} → ${f.item.codigo} (${comentario(f.motivo)})`).join("
")}
  ) as f(viejo, nuevo)
  join public.panol_materiales m on m.id = f.viejo;` : "-- (ninguna)";

const cuerpo = `-- ── 1. Los ${reutilizados.length} vinculados: mismo material, nombre de Rebollar ─────────
drop table if exists pg_temp._cns_reuso;
create temp table _cns_reuso (material_id uuid, descripcion text, alias_viejo text, categoria_id uuid) on commit drop;
insert into _cns_reuso values
${valores(reutilizados.map((r) => ({ material_id: r.material.id, descripcion: r.nombre, alias_viejo: r.material.descripcion === r.nombre ? null : r.material.descripcion, categoria_id: r.categoriaId, _c: r.item.codigo })), [["material_id", "uuid"], ["descripcion", "text"], ["alias_viejo", "text"], ["categoria_id", "uuid"]])}
;

update public.panol_materiales m
   set alias = public.consumibles_alias_sumar(m.alias, r.alias_viejo, r.descripcion),
       descripcion = r.descripcion,
       proveedor = ${q(lista.proveedor_nombre)},
       categoria_id = coalesce(r.categoria_id, m.categoria_id),
       activo = true
  from _cns_reuso r
 where m.id = r.material_id
   and (m.descripcion is distinct from r.descripcion
        or m.proveedor is distinct from ${q(lista.proveedor_nombre)}
        or m.categoria_id is distinct from coalesce(r.categoria_id, m.categoria_id)
        or m.alias is distinct from public.consumibles_alias_sumar(m.alias, r.alias_viejo, r.descripcion));

-- ── 2. Los ${nuevos.length} renglones sin material: alta ─────────────────────────────────
drop table if exists pg_temp._cns_alta;
create temp table _cns_alta (
  material_id uuid, codigo text, descripcion text, categoria_id uuid, unidad text,
  forma_entrega text, unidad_compra text, factor_compra numeric, costo_unitario_ars numeric
) on commit drop;
insert into _cns_alta values
${valores(nuevos.map((x) => ({ material_id: x.id, codigo: x.item.codigo, descripcion: x.nombre, categoria_id: x.categoriaId, unidad: x.unidad, forma_entrega: x.forma, unidad_compra: x.item.unidad_compra, factor_compra: x.factor, costo_unitario_ars: x.costo })), [["material_id", "uuid"], ["codigo", "text"], ["descripcion", "text"], ["categoria_id", "uuid"], ["unidad", "text"], ["forma_entrega", "text"], ["unidad_compra", "text"], ["factor_compra", "numeric"], ["costo_unitario_ars", "numeric"]])}
;

insert into public.panol_materiales (id, descripcion, unidad_medida, categoria_id, proveedor, es_consumible, origen, revisado, activo)
select a.material_id, a.descripcion, a.unidad, a.categoria_id, ${q(lista.proveedor_nombre)}, true, 'consumibles', true, true
  from _cns_alta a
on conflict (id) do nothing;

-- Código provisorio: el definitivo sale de la renumeración del punto 5.
insert into public.consumibles_config (
  material_id, codigo_etiqueta, forma_entrega, unidad_entrega, proveedor_nombre, proveedor_codigo,
  unidad_compra, factor_compra, costo_unitario_ars, costo_lista_item_id, costo_actualizado_at
)
select a.material_id, 'TMP-' || a.material_id, a.forma_entrega, a.unidad, ${q(lista.proveedor_nombre)}, a.codigo,
       a.unidad_compra, a.factor_compra, a.costo_unitario_ars, li.id, now()
  from _cns_alta a
  join public.consumibles_lista_items li on li.lista_id = ${listaId} and li.codigo = a.codigo
on conflict (material_id) do nothing;

update public.consumibles_lista_items li
   set material_id = a.material_id
  from _cns_alta a
 where li.lista_id = ${listaId}
   and li.codigo = a.codigo
   and li.material_id is null;

-- ── 3. Fusiones de viejos claros (${fusiones.length}) ────────────────────────────────────────
${bloqueFusiones}

-- ── 4. Los ${salen.length} viejos sin par salen del módulo (no se borran) ───────────────
update public.panol_materiales
   set activo = false
 where id in (
${salen.map((v, i) => `  ${q(v.id)}${i === 0 ? "::uuid" : ""}${i < salen.length - 1 ? "," : ""}  -- ${comentario(v.descripcion)} (${retiros[v.id] || 0} retiros)`).join("\n")}
 )
   and coalesce(activo, true);

update public.consumibles_config c
   set activo_mostrador = false,
       favorito_orden = null,
       notas = case
         when c.notas ilike '%' || ${q(NOTA_FUERA)} || '%' then c.notas
         else btrim(coalesce(c.notas || E'\\n', '') || ${q(NOTA_FUERA)})
       end
  from public.panol_materiales m
 where m.id = c.material_id
   and m.es_consumible
   and m.activo = false
   and coalesce(c.notas, '') not ilike '%Fusionado en%'
   and m.id in (${salen.map((v) => `${q(v.id)}::uuid`).join(", ") || "null::uuid"});

-- ── 5. Códigos KA en orden de rubro y descripción ────────────────────────────
-- Dos pasos para no chocar con el unique: primero un código provisorio a
-- todos, después el definitivo. Los dados de baja quedan con BAJA-.
drop table if exists pg_temp._cns_orden;
create temp table _cns_orden (material_id uuid, ord int) on commit drop;
insert into _cns_orden values
${valores(activosFinal.map((a, i) => ({ material_id: a.id, ord: i + 1 })), [["material_id", "uuid"], ["ord", "int"]])}
;

update public.consumibles_config c
   set codigo_etiqueta = case when c.codigo_etiqueta like 'BAJA-%' then c.codigo_etiqueta else 'BAJA-' || c.codigo_etiqueta end
  from public.panol_materiales m
 where m.id = c.material_id
   and m.activo = false
   and c.codigo_etiqueta not like 'BAJA-%';

update public.consumibles_config c
   set codigo_etiqueta = 'TMP-' || c.material_id
  from public.panol_materiales m
 where m.id = c.material_id
   and coalesce(m.activo, true)
   and c.codigo_etiqueta not like 'TMP-%';

-- Si alguien dio de alta un consumible entre que se generó esto y se
-- aplicó, va al final por descripción.
update public.consumibles_config c
   set codigo_etiqueta = 'KA' || lpad(o.rn::text, 4, '0')
  from (
    select c2.material_id, row_number() over (order by coalesce(x.ord, 1000000), m.descripcion) as rn
      from public.consumibles_config c2
      join public.panol_materiales m on m.id = c2.material_id
      left join _cns_orden x on x.material_id = c2.material_id
     where coalesce(m.activo, true)
  ) o
 where o.material_id = c.material_id;

select setval(
  'public.consumibles_codigo_seq',
  (select coalesce(max(substring(codigo_etiqueta from '^KA([0-9]+)$')::int), 0) + 1 from public.consumibles_config),
  false
);
`;

const formas = nuevos.reduce((a, x) => ((a[x.forma] = (a[x.forma] || 0) + 1), a), {});
const unidades = nuevos.reduce((a, x) => ((a[x.unidad] = (a[x.unidad] || 0) + 1), a), {});
const rubrosNuevos = nuevos.reduce((a, x) => { const k = nombreCat.get(x.categoriaId) ?? "?"; a[k] = (a[k] || 0) + 1; return a; }, {});
const cambianRubro = reutilizados.filter((r) => r.categoriaId !== r.material.categoria_id);
const hoy = new Date().toISOString().slice(0, 10);

const encabezado = `-- ═════════════════════════════════════════════════════════════════════════════
-- Consumibles: los productos salen de la lista de Rebollar (vigente ${lista.vigente_desde}).
--
-- GENERADA por scripts/consumibles/productos-desde-lista.mjs (${hoy}). No
-- editar a mano. Criterio de Ezequiel (10/10/2026): el módulo arranca de cero
-- con los ${items.length} productos de la lista.
--
--   1. ${reutilizados.length} renglones ya vinculados: se reutiliza el material (id, historial,
--      códigos, favorito) con el nombre de Rebollar + medida; el nombre viejo
--      va al alias; proveedor Rebollar.${cambianRubro.length ? ` ${cambianRubro.length} cambian de rubro por regla.` : ""}
--   2. ${nuevos.length} renglones sin material: alta (material + config con código,
--      factor y costo). Rubro, unidad y forma de entrega por regla.
--   3. ${fusiones.length} consumibles viejos que son claramente un producto de la lista se
--      fusionan en él (consumibles_fusionar_interno). Queda el RPC
--      consumibles_fusionar(viejo, nuevo) para la pantalla (admin, Compras,
--      Técnica).
--   4. ${salen.length} viejos sin par salen del módulo: activo = false, fuera del
--      mostrador y nota "${NOTA_FUERA}". No se borran.
--   5. Códigos KA0001…KA${String(activosFinal.length).padStart(4, "0")} en orden de rubro y descripción; la
--      secuencia queda en el siguiente.
--
-- Idempotente: ids fijos por código de Rebollar, altas con on conflict, la
-- fusión no repite lo hecho y la renumeración da siempre lo mismo.
-- ═════════════════════════════════════════════════════════════════════════════
`;

fs.writeFileSync(SALIDA, `${encabezado}\nbegin;\n\n${funciones}\n${cuerpo}\ncommit;\n`);

if (args.ensayo) {
  const ensayo = `-- ENSAYO de ${path.basename(SALIDA)}: todo dos veces, verifica, devuelve la secuencia y se deshace.
begin;

create temp table _cns_seq_antes on commit drop as
  select last_value, is_called from public.consumibles_codigo_seq;

${funciones}
${cuerpo}
-- Segunda pasada: no tiene que cambiar nada.
${cuerpo}
do $$
declare
  v_json json;
begin
  v_json := (select json_build_object(
    'activos', (select count(*) from public.panol_materiales where es_consumible and coalesce(activo, true)),
    'activos_con_codigo_proveedor', (select count(*) from public.panol_materiales m join public.consumibles_config c on c.material_id = m.id where m.es_consumible and coalesce(m.activo, true) and c.proveedor_codigo is not null),
    'activos_proveedor_rebollar', (select count(*) from public.panol_materiales where es_consumible and coalesce(activo, true) and proveedor = ${q(lista.proveedor_nombre)}),
    'activos_sin_config', (select count(*) from public.panol_materiales m where m.es_consumible and coalesce(m.activo, true) and not exists (select 1 from public.consumibles_config c where c.material_id = m.id)),
    'items_con_material', (select count(*) from public.consumibles_lista_items where lista_id = ${listaId} and material_id is not null),
    'items_material_distinto', (select count(distinct material_id) from public.consumibles_lista_items where lista_id = ${listaId}),
    'fusionados', (select count(*) from public.consumibles_config where notas ilike '%Fusionado en%'),
    'fuera_de_lista', (select count(*) from public.consumibles_config where notas ilike '%' || ${q(NOTA_FUERA)} || '%'),
    'bajas', (select count(*) from public.panol_materiales where es_consumible and activo = false),
    'ka_activos', (select count(*) from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true) and c.codigo_etiqueta ~ '^KA[0-9]{4}$'),
    'ka_max', (select max(c.codigo_etiqueta) from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true)),
    'ka_baja_con_ka', (select count(*) from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where m.activo = false and c.codigo_etiqueta !~ '^BAJA-'),
    'tmp_restantes', (select count(*) from public.consumibles_config where codigo_etiqueta like 'TMP-%'),
    'ka0001', (select m.descripcion from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where c.codigo_etiqueta = 'KA0001'),
    'ka0001_esperado', ${q(activosFinal[0]?.nombre)},
    'seq_despues', (select last_value from public.consumibles_codigo_seq),
    'favoritos_activos', (select count(*) from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true) and c.favorito_orden is not null),
    'activos_sin_costo', (select count(*) from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true) and c.costo_unitario_ars is null),
    'codigos_barra_activos', (select count(*) from public.panol_material_codigos_barra b join public.panol_materiales m on m.id = b.material_id where m.es_consumible and coalesce(m.activo, true) and b.activo),
    'formas', (select json_object_agg(forma_entrega, n) from (select c.forma_entrega, count(*) n from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true) group by 1) t),
    'unidades', (select json_object_agg(unidad_entrega, n) from (select c.unidad_entrega, count(*) n from public.consumibles_config c join public.panol_materiales m on m.id = c.material_id where coalesce(m.activo, true) group by 1) t),
    'muestra_fusion', (select json_build_object('desc', m.descripcion, 'alias', m.alias, 'fav', c.favorito_orden, 'ka', c.codigo_etiqueta) from public.panol_materiales m join public.consumibles_config c on c.material_id = m.id where m.id = ${q(fusiones.find((f) => f.viejo.descripcion === "Cinta Ancha Verde")?.nuevoId ?? fusiones[0]?.nuevoId)}::uuid),
    'muestra_reuso', (select json_build_object('desc', m.descripcion, 'alias', m.alias, 'ka', c.codigo_etiqueta, 'prov', m.proveedor) from public.panol_materiales m join public.consumibles_config c on c.material_id = m.id where m.id = ${q(reutilizados.find((r) => r.material.descripcion === "Lija Al Agua 600")?.material.id ?? reutilizados[0]?.material.id)}::uuid)
  ));
  perform setval('public.consumibles_codigo_seq', (select last_value from _cns_seq_antes), (select is_called from _cns_seq_antes));
  raise exception 'ENSAYO_OK %', v_json;
end $$;
`;
  fs.writeFileSync(path.resolve(args.ensayo), ensayo);
}

console.log(JSON.stringify({
  lista: lista.vigente_desde,
  renglones: items.length,
  reutilizados: reutilizados.length,
  cambian_rubro: cambianRubro.map((r) => `${r.material.descripcion} : ${r.material.rubro} → ${nombreCat.get(r.categoriaId)}`),
  nuevos: nuevos.length,
  rubros_nuevos: rubrosNuevos,
  formas_nuevos: formas,
  unidades_nuevos: unidades,
  nuevos_sin_costo: nuevos.filter((x) => x.costo == null).map((x) => `${x.item.codigo} ${x.nombre} (${x.unidad} ← ${x.item.contenido} ${x.item.unidad_compra})`),
  fusiones: fusiones.map((f) => `${f.viejo.descripcion} → ${f.item.codigo} ${nombreProducto(f.item)} [${f.motivo}] (${retiros[f.viejo.id] || 0} retiros)`),
  salen: salen.map((v) => ({ descripcion: v.descripcion, rubro: v.rubro_padre ? v.rubro : "(sin subrubro)", retiros: Number(retiros[v.id] || 0) })).sort((a, b) => b.retiros - a.retiros),
  ka: activosFinal.length,
  migracion: path.relative(RAIZ, SALIDA),
}, null, 2));
