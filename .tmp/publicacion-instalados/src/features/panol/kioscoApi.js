import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";

/**
 * La caja del pañol: egreso e ingreso de consumibles.
 *
 * Hasta ahora los consumibles salian del pañol sin registro: el sistema tiene
 * 191 cargados, uno solo con codigo de barra y stock de cuatro. Este modulo
 * existe para cortar eso con la regla mas simple que hay: para llevarte algo,
 * pasa por la pistola.
 *
 * El flujo es el de una caja de kiosco y no el de un formulario: quien retira,
 * escanear, escanear, escanear, confirmar. Todo lo demas -elegir el material de
 * una lista, escribir cantidades, buscar por nombre- es lo que hace que la
 * gente no lo use y se lleve las cosas igual.
 *
 * El egreso se escribe en el mismo ledger que todo el pañol
 * (panol_obra_materiales_snapshot), asi que el stock lo sigue calculando
 * rowDelta y no hay una segunda verdad.
 */

const limpio = (v) => String(v ?? "").trim();

/** Codigo de barra normalizado: los lectores agregan espacios y caracteres de control. */
// eslint-disable-next-line no-control-regex -- son justo los que hay que sacar
export const normalizarCodigo = (v) => limpio(v).replace(/[\u0000-\u001F\s]/g, "").toUpperCase();

async function traerTodo(tabla, select) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from(tabla).select(select).range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

/**
 * Todo lo que el kiosco necesita para funcionar sin volver a la red.
 *
 * Se carga una vez y queda en memoria: el pañol no siempre tiene buena señal y
 * un escaneo que espera dos segundos a la red es un escaneo que no se hace.
 */
export async function cargarKiosco() {
  const [materiales, categorias, barras, ledger, perfiles, obras, conTarjeta] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,codigo_barra,unidad_medida,categoria_id,es_consumible,activo,imagen_url"),
    supabase.from("panol_categorias").select("id,nombre").limit(500).then(({ data }) => data ?? []),
    traerTodo("panol_material_codigos_barra", "material_id,codigo,activo"),
    traerTodo("panol_obra_materiales_snapshot", "material_id,obra_id,cantidad,cantidad_egresada,estado,source,recepcion_estado"),
    supabase.from("profiles").select("id,username,role").order("username").then(({ data }) => data ?? []),
    supabase.from("produccion_obras").select("id,codigo,estado").eq("estado", "activa").order("codigo").then(({ data }) => data ?? []),
    supabase.from("rrhh_empleados").select("id", { count: "exact", head: true }).not("nfc_uid", "is", null).then(({ count }) => count ?? 0),
  ]);

  const rubro = new Map(categorias.map((c) => [c.id, c.nombre]));

  // Stock libre: lo que no esta apartado para una obra es lo que el pañol puede
  // entregar. Mismo criterio que usa compras, para que no se contradigan.
  const stock = new Map();
  for (const f of ledger) {
    if (!f.material_id || f.obra_id) continue;
    const d = rowDelta(f);
    if (d) stock.set(f.material_id, (stock.get(f.material_id) || 0) + d);
  }

  const consumibles = materiales
    .filter((m) => m.activo !== false && m.es_consumible === true)
    .map((m) => ({
      id: m.id,
      descripcion: m.descripcion || "Sin nombre",
      codigo: m.codigo || "",
      unidad: m.unidad_medida || "unidad",
      rubro: rubro.get(m.categoria_id) || "Sin rubro",
      imagenUrl: m.imagen_url || "",
      stock: Math.round((stock.get(m.id) || 0) * 100) / 100,
    }))
    .sort((a, b) => a.descripcion.localeCompare(b.descripcion, "es"));

  const porId = new Map(consumibles.map((c) => [c.id, c]));

  // El indice de codigos: la tabla dedicada y el campo suelto del material.
  const porCodigo = new Map();
  const anota = (codigo, materialId) => {
    const k = normalizarCodigo(codigo);
    if (!k || !porId.has(materialId)) return;
    if (!porCodigo.has(k)) porCodigo.set(k, materialId);
  };
  for (const b of barras) if (b.activo !== false) anota(b.codigo, b.material_id);
  for (const m of materiales) if (m.codigo_barra) anota(m.codigo_barra, m.id);

  return {
    consumibles,
    porId,
    porCodigo,
    obras: obras.map((o) => ({ id: o.id, codigo: o.codigo })),
    personas: perfiles.filter((p) => p.username).map((p) => ({ id: p.id, nombre: p.username, rol: p.role })),
    conCodigo: new Set(porCodigo.values()).size,
    conTarjeta,
  };
}

/**
 * Vincula un codigo de barra a un consumible.
 *
 * Es la mitad del valor del kiosco: cada codigo desconocido que alguien
 * resuelve en el momento queda cargado para siempre. Con 1 de 191 cargados
 * hoy, el sistema se va a llenar solo a fuerza de usarlo.
 */
export async function vincularCodigo({ materialId, codigo }) {
  const k = normalizarCodigo(codigo);
  if (!k) throw new Error("El código vino vacío.");
  if (!materialId) throw new Error("Elegí a qué consumible pertenece.");
  const { error } = await supabase
    .from("panol_material_codigos_barra")
    // La tabla no tiene columna de origen: la etiqueta cumple ese rol.
    .insert({ material_id: materialId, codigo: k, etiqueta: "kiosco", activo: true });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("Ese código ya está usado por otro producto.");
    throw error;
  }
  return k;
}

/**
 * Registra el carrito entero, un renglon por consumible.
 *
 * Los dos sentidos pasan por aca porque son el mismo gesto -escanear y contar-
 * y lo unico que cambia es el signo. Va todo junto y no de a uno para que si
 * algo falla no quede medio carrito movido: o pasa entero o no pasa.
 *
 * El SOURCE es lo que define el signo para rowDelta, que es quien calcula el
 * stock en todo el sistema:
 *
 *   egreso_kiosco   empieza con "egreso" -> resta
 *   stock_kiosco    empieza con "stock"  -> suma, igual que una recepcion
 */
export async function registrarMovimiento({ modo = "egreso", items = [], quien = "", dni = "", sector = "", obraId = null, nota = "" }) {
  const limpios = items.filter((i) => Number(i.cantidad) > 0);
  if (!limpios.length) throw new Error("El carrito está vacío.");
  const sale = modo !== "ingreso";
  if (sale && !limpio(quien)) throw new Error("Falta quién se lo lleva.");

  const ahora = new Date().toISOString();
  const firma = [limpio(quien), limpio(dni) ? `DNI ${limpio(dni)}` : ""].filter(Boolean).join(" · ");
  const detalle = [sale ? "Retiro por caja de pañol" : "Ingreso por caja de pañol", firma, limpio(nota)].filter(Boolean).join(" · ");

  const filas = limpios.map((i) => ({
    obra_id: obraId || null,
    material_id: i.id,
    descripcion: i.descripcion,
    codigo: i.codigo || null,
    cantidad: Number(i.cantidad),
    cantidad_egresada: sale ? Number(i.cantidad) : 0,
    unidad: i.unidad || "unidad",
    tipo: "consumible",
    tipo_label: sale ? "Retiro de consumible" : "Ingreso de consumible",
    source: sale ? "egreso_kiosco" : "stock_kiosco",
    // En el ingreso el estado tiene que contar como stock: rowCountsAsStock
    // pide 'en_panol' y recepcion 'recibido' para sumarlo.
    estado: sale ? "egresado" : "en_panol",
    recepcion_estado: sale ? null : "recibido",
    recepcion_updated_at: sale ? null : ahora,
    notas: detalle,
    egreso_at: sale ? ahora : null,
    egreso_nota: sale ? detalle : null,
    retirado_por: limpio(quien) || null,
    sector_destino: limpio(sector) || null,
    es_adicional: false,
  }));

  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .insert(filas)
    .select("id");
  if (error) throw error;
  return { registrados: data?.length ?? filas.length };
}

/** Lo ultimo que paso por la caja, en los dos sentidos. */
export async function ultimosMovimientos(limite = 25) {
  const { data, error } = await supabase
    .from("panol_obra_materiales_snapshot")
    .select("id,descripcion,cantidad,cantidad_egresada,unidad,retirado_por,sector_destino,egreso_at,created_at,source")
    .in("source", ["egreso_kiosco", "stock_kiosco"])
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data ?? []).map((r) => ({ ...r, egreso_at: r.egreso_at || r.created_at }));
}
