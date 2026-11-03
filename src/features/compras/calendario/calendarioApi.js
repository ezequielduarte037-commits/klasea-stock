import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";
import { claveProveedor, normalizarTexto } from "./calendario";

// Tablas de 20261103200000_compras_calendario.sql.

const LEDGER_STATES = ["en_panol", "recibido", "parcial", "egresado", "problema"];
// Laminación y madera van por su propio circuito de pedidos, y los consumibles
// los pide el pañol a Rebollar: no son parte del calendario de Compras.
const RUBROS_FUERA = new Set(["laminacion", "maderas"]);
// Desde cuándo hay registro confiable de llegadas: para sugerir semanas sólo
// sirven los barcos desmoldados después (antes, todo figura "llegado tarde").
const DESMOLDE_DESDE_PARA_SUGERIR = "2026-06-15";

async function traerTodo(construir) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await construir().range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

async function traerOpcional(tabla, select) {
  const { data, error } = await supabase.from(tabla).select(select).limit(5000);
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return { filas: [], falta: true };
    throw error;
  }
  return { filas: data ?? [], falta: false };
}

function lineaDeObra(obra) {
  const m = String(obra.linea_nombre || "").toUpperCase().match(/^K(\d+)$/);
  return m ? m[1] : null;
}

function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export async function cargarDatosCalendario() {
  const [obrasRaw, modelo, categorias, rubrosCfg, itemsCfg, plazosCfg, pedidos] = await Promise.all([
    traerTodo(() => supabase.from("produccion_obras").select("id,codigo,linea_nombre,estado,desmolde_real,desmolde_estimado").neq("estado", "terminada")),
    traerTodo(() => supabase.from("panol_material_modelo").select("material_id,modelo,cantidad,variante,material:panol_materiales!panol_material_modelo_material_id_fkey(id,descripcion,codigo,unidad_medida,proveedor,categoria_id,es_consumible,activo)")),
    traerTodo(() => supabase.from("panol_categorias").select("id,nombre")),
    traerOpcional("compras_calendario_rubros", "linea,categoria_id,semana,updated_at"),
    traerOpcional("compras_calendario_items", "linea,material_id,semana,nota"),
    traerOpcional("compras_plazos_proveedor", "proveedor,nombre,dias"),
    supabase.from("purchase_requests").select("proveedor,created_at,updated_at").eq("status", "recibido").limit(2000),
  ]);

  const rubroDe = new Map(categorias.map((c) => [c.id, c.nombre]));
  const lineasConMatriz = new Set(modelo.map((m) => String(m.modelo)));
  const obras = obrasRaw
    .map((o) => ({ id: o.id, codigo: o.codigo, linea: lineaDeObra(o), desmolde: o.desmolde_real || o.desmolde_estimado || null, desmoldeReal: !!o.desmolde_real }))
    .filter((o) => o.linea && lineasConMatriz.has(o.linea));
  const obraIds = obras.map((o) => o.id);

  let fueraDelCalendario = 0;
  const matriz = [];
  for (const m of modelo) {
    if (m.variante && m.variante !== "standard") continue;
    const mat = m.material;
    if (!mat || mat.activo === false) continue;
    const rubro = rubroDe.get(mat.categoria_id) || "Sin rubro";
    if (mat.es_consumible || RUBROS_FUERA.has(normalizarTexto(rubro))) { fueraDelCalendario += 1; continue; }
    matriz.push({
      linea: String(m.modelo), material_id: mat.id, descripcion: mat.descripcion, codigo: mat.codigo || "",
      unidad: mat.unidad_medida || "unidad", proveedor: String(mat.proveedor || "").trim(),
      categoria_id: mat.categoria_id, rubro, cantidad: Number(m.cantidad) || 0,
    });
  }

  const [filasObra, ledger] = obraIds.length ? await Promise.all([
    traerTodo(() => supabase.from("panol_obra_materiales_snapshot").select("obra_id,material_id,requisito_material_id,cantidad,estado,descripcion").eq("source", "matriz").in("obra_id", obraIds)),
    traerTodo(() => supabase.from("panol_obra_materiales_snapshot").select("obra_id,material_id,requisito_material_id,source,estado,recepcion_estado,cantidad,cantidad_egresada,created_at").in("estado", LEDGER_STATES).neq("source", "matriz")),
  ]) : [[], []];

  const obraFilas = new Map();
  for (const f of filasObra) {
    const id = f.requisito_material_id || f.material_id;
    if (id) obraFilas.set(`${f.obra_id}|${id}`, { cantidad: f.cantidad, estado: f.estado, descripcion: f.descripcion });
  }

  const obraPorId = new Map(obras.map((o) => [o.id, o]));
  const llegados = new Set();
  const libre = new Map();
  const primeraLlegada = new Map();
  for (const r of ledger) {
    if (r.obra_id) {
      for (const id of [r.material_id, r.requisito_material_id]) {
        if (!id) continue;
        const k = `${r.obra_id}|${id}`;
        llegados.add(k);
        const prev = primeraLlegada.get(k);
        if (!prev || r.created_at < prev) primeraLlegada.set(k, r.created_at);
      }
    } else if (r.material_id) {
      libre.set(r.material_id, (libre.get(r.material_id) || 0) + rowDelta(r));
    }
  }

  // Historia para sugerir semanas: cuándo llegó cada ítem de la matriz en los
  // barcos desmoldados desde que hay registro.
  const matrizPorLinea = new Map();
  for (const m of matriz) {
    if (!matrizPorLinea.has(m.linea)) matrizPorLinea.set(m.linea, new Map());
    matrizPorLinea.get(m.linea).set(m.material_id, m);
  }
  const llegadas = [];
  for (const [k, at] of primeraLlegada) {
    const [obraId, matId] = k.split("|");
    const obra = obraPorId.get(obraId);
    if (!obra?.desmolde || obra.desmolde < DESMOLDE_DESDE_PARA_SUGERIR) continue;
    const item = matrizPorLinea.get(obra.linea)?.get(matId);
    if (!item) continue;
    const semanas = (new Date(at) - new Date(`${obra.desmolde}T00:00:00`)) / (7 * 86400000);
    llegadas.push({ linea: obra.linea, categoria_id: item.categoria_id, semanas });
  }

  // Plazos medidos en pedidos recibidos (pocos tienen proveedor cargado).
  const medidos = new Map();
  const todos = [];
  for (const p of pedidos.data ?? []) {
    const dias = (new Date(p.updated_at) - new Date(p.created_at)) / 86400000;
    if (!Number.isFinite(dias) || dias < 0 || dias > 200) continue;
    todos.push(dias);
    const k = claveProveedor(p.proveedor);
    if (!k) continue;
    if (!medidos.has(k)) medidos.set(k, { dias: [] });
    medidos.get(k).dias.push(dias);
  }

  return {
    obras,
    matriz,
    obraFilas,
    llegados,
    libre,
    llegadas,
    medidos,
    plazoGeneral: Math.round(mediana(todos) ?? 21),
    pedidosMedidos: todos.length,
    semanasRubro: new Map(rubrosCfg.filas.map((r) => [`${r.linea}|${r.categoria_id}`, r.semana])),
    semanasItem: new Map(itemsCfg.filas.map((r) => [`${r.linea}|${r.material_id}`, r.semana])),
    plazos: new Map(plazosCfg.filas.map((r) => [r.proveedor, r.dias])),
    fueraDelCalendario,
    sinMigracion: rubrosCfg.falta || itemsCfg.falta || plazosCfg.falta,
  };
}

export async function guardarSemanaRubro(linea, categoriaId, semana) {
  const q = semana == null
    ? supabase.from("compras_calendario_rubros").delete().eq("linea", linea).eq("categoria_id", categoriaId)
    : supabase.from("compras_calendario_rubros").upsert({ linea, categoria_id: categoriaId, semana }, { onConflict: "linea,categoria_id" });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarSemanasRubro(filas = []) {
  if (!filas.length) return;
  const { error } = await supabase.from("compras_calendario_rubros").upsert(filas, { onConflict: "linea,categoria_id" });
  if (error) throw error;
}

export async function guardarSemanaItem(linea, materialId, semana) {
  const q = semana == null
    ? supabase.from("compras_calendario_items").delete().eq("linea", linea).eq("material_id", materialId)
    : supabase.from("compras_calendario_items").upsert({ linea, material_id: materialId, semana }, { onConflict: "linea,material_id" });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarPlazo(nombre, dias) {
  const proveedor = claveProveedor(nombre);
  if (!proveedor) return;
  const q = dias == null
    ? supabase.from("compras_plazos_proveedor").delete().eq("proveedor", proveedor)
    : supabase.from("compras_plazos_proveedor").upsert({ proveedor, nombre: String(nombre).trim(), dias }, { onConflict: "proveedor" });
  const { error } = await q;
  if (error) throw error;
}

export async function guardarPlazos(filas = []) {
  const payload = filas.map((f) => ({ proveedor: claveProveedor(f.nombre), nombre: String(f.nombre).trim(), dias: f.dias })).filter((f) => f.proveedor);
  if (!payload.length) return;
  const { error } = await supabase.from("compras_plazos_proveedor").upsert(payload, { onConflict: "proveedor" });
  if (error) throw error;
}
