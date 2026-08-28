import { supabase } from "@/supabaseClient";
import { rowDelta } from "@/features/panol/panolMovimientos";

/**
 * Qué hay que comprar, calculado en vez de cargado.
 *
 * El stock minimo existe como campo hace meses y esta en cero para los 1748
 * materiales: nadie va a definirlos a mano, y no tiene sentido seguir esperando
 * que pase. Pero el dato para calcularlo ya esta: cada egreso del pañol dice
 * cuanto se consume, y cada pedido recibido dice cuanto tarda el proveedor.
 *
 * punto de pedido = consumo por mes x plazo de entrega
 *
 * Medido sobre 227 pedidos recibidos, el plazo es de 29 dias en la mediana y 55
 * en el percentil 90. Se usa el p90 a proposito: quedarse corto significa frenar
 * una obra, y pedir un poco antes solo significa tener el material guardado unas
 * semanas.
 */

/** Con menos salidas que esto no hay senal, hay ruido. */
const MINIMO_DE_SALIDAS = 3;
/** Cuando un proveedor no tiene historial propio suficiente. */
const PLAZO_POR_DEFECTO_DIAS = 55;
const MINIMO_PEDIDOS_PARA_PLAZO_PROPIO = 4;
const DIAS_POR_MES = 30.4;

/** Trae una tabla entera, de a mil, sin que PostgREST corte en la primera pagina. */
async function traerTodo(tabla, select, filtro = "") {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from(tabla)
      .select(select)
      .range(desde, desde + 999);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filtro ? filas.filter(filtro) : filas;
}

/** El percentil de una lista de numeros ya ordenada. */
function percentil(ordenados, p) {
  if (!ordenados.length) return null;
  const i = Math.min(ordenados.length - 1, Math.floor(ordenados.length * p));
  return ordenados[i];
}

/**
 * Cuanto tarda cada proveedor, de sus propios pedidos recibidos.
 * Con pocos pedidos el numero propio es una casualidad, asi que se usa el general.
 */
async function plazosPorProveedor() {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("proveedor,status,created_at,updated_at")
    .eq("status", "recibido")
    .limit(1000);
  if (error) return { general: PLAZO_POR_DEFECTO_DIAS, porProveedor: new Map() };

  const porProv = new Map();
  const todos = [];
  for (const p of data ?? []) {
    const dias = (new Date(p.updated_at) - new Date(p.created_at)) / (1000 * 60 * 60 * 24);
    // Un pedido de mas de 200 dias o de menos de cero es un dato sucio, no un plazo.
    if (!Number.isFinite(dias) || dias < 0 || dias > 200) continue;
    todos.push(dias);
    const nombre = String(p.proveedor || "").trim().toLowerCase();
    if (!nombre) continue;
    porProv.set(nombre, [...(porProv.get(nombre) ?? []), dias]);
  }

  todos.sort((a, b) => a - b);
  const general = Math.round(percentil(todos, 0.9) ?? PLAZO_POR_DEFECTO_DIAS);

  const mapa = new Map();
  for (const [nombre, dias] of porProv) {
    if (dias.length < MINIMO_PEDIDOS_PARA_PLAZO_PROPIO) continue;
    dias.sort((a, b) => a - b);
    mapa.set(nombre, { dias: Math.round(percentil(dias, 0.9)), pedidos: dias.length });
  }
  return { general, porProveedor: mapa, muestra: todos.length };
}

/**
 * Todo lo que compras necesita para decidir, agrupado por proveedor.
 *
 * Devuelve tambien los materiales que estan bien, para poder mirar el catalogo
 * completo de un proveedor cuando se le va a hacer un pedido igual.
 */
export async function calcularReposicion() {
  const [materiales, ledger, plazos] = await Promise.all([
    traerTodo("panol_materiales", "id,descripcion,codigo,proveedor,unidad_medida,precio_unitario,moneda,es_consumible,activo")
      .then((filas) => filas.filter((m) => m.activo !== false)),
    traerTodo("panol_obra_materiales_snapshot", "material_id,cantidad,cantidad_egresada,estado,source,recepcion_estado,created_at"),
    plazosPorProveedor(),
  ]);

  const porId = new Map(materiales.map((m) => [m.id, m]));

  // Stock LIBRE, con la logica canonica del pañol (rowDelta): no reimplementarla
  // aca, o compras ve un numero distinto al que ve el pañolero para el mismo item.
  const stockLibre = new Map();
  for (const fila of ledger) {
    if (!fila.material_id) continue;
    const delta = rowDelta(fila);
    // Lo apartado para una obra esta en el pañol pero tiene dueño: para comprar
    // no cuenta. Y se suman TODAS las filas, que rowDelta ya pone el signo:
    // filtrando antes, lo que salio del pañol nunca se restaba.
    if (!delta || fila.obra_id) continue;
    stockLibre.set(fila.material_id, (stockLibre.get(fila.material_id) || 0) + delta);
  }

  // Consumo: solo lo que efectivamente salio del pañol.
  const egresos = ledger.filter((f) => f.estado === "egresado" && f.material_id);
  const fechas = egresos
    .map((f) => new Date(f.created_at))
    .filter((d) => !Number.isNaN(+d))
    .sort((a, b) => a - b);
  const mesesDeHistoria = fechas.length > 1
    ? Math.max(0.5, (fechas[fechas.length - 1] - fechas[0]) / (1000 * 60 * 60 * 24 * DIAS_POR_MES))
    : 1;

  const consumo = new Map();
  for (const f of egresos) {
    // Hay filas marcadas como egresadas con cantidad_egresada en 0 y la cantidad
    // real en "cantidad": 12 de cada 400. Con ?? esas cuentan como cero y el
    // consumo sale 14 veces mas chico -el botazo pasaba de 47 unidades a 3-. Si
    // el estado dice egresado, lo que salio es la cantidad.
    const cant = Number(f.cantidad_egresada || f.cantidad || 0);
    if (!cant) continue;
    const v = consumo.get(f.material_id) ?? { total: 0, salidas: 0, ultima: null };
    v.total += cant;
    v.salidas += 1;
    const cuando = new Date(f.created_at);
    if (!v.ultima || cuando > v.ultima) v.ultima = cuando;
    consumo.set(f.material_id, v);
  }

  const items = [];
  for (const [id, c] of consumo) {
    if (c.salidas < MINIMO_DE_SALIDAS) continue;
    const material = porId.get(id);
    if (!material) continue;

    const proveedor = String(material.proveedor || "").trim();
    const plazoPropio = plazos.porProveedor.get(proveedor.toLowerCase());
    const plazoDias = plazoPropio?.dias ?? plazos.general;

    const porMes = c.total / mesesDeHistoria;
    const puntoDePedido = Math.ceil(porMes * (plazoDias / DIAS_POR_MES));
    const hay = Math.round(Math.max(0, stockLibre.get(id) || 0) * 100) / 100;
    // Cuantas semanas de consumo quedan: es lo que de verdad dice si urge.
    const semanasRestantes = porMes > 0 ? (hay / porMes) * 4.33 : Infinity;

    items.push({
      id,
      descripcion: material.descripcion || "",
      codigo: material.codigo || "",
      unidad: material.unidad_medida || "unidad",
      esConsumible: material.es_consumible === true,
      precio: material.precio_unitario,
      moneda: material.moneda || "ARS",
      proveedor: proveedor || "",
      hay,
      puntoDePedido,
      porMes: Math.round(porMes * 10) / 10,
      salidas: c.salidas,
      ultimaSalida: c.ultima,
      plazoDias,
      plazoEsPropio: Boolean(plazoPropio),
      semanasRestantes,
      // Cuanto conviene traer: reponer hasta cubrir el plazo mas un mes de aire,
      // redondeado para arriba. Pedir exactamente el punto de pedido deja al
      // proximo consumo otra vez en cero.
      sugerido: Math.max(1, Math.ceil(porMes * (plazoDias / DIAS_POR_MES + 1)) - hay),
      urge: hay <= puntoDePedido,
    });
  }

  items.sort((a, b) => a.semanasRestantes - b.semanasRestantes);

  // Agrupado por proveedor, que es como se compra de verdad.
  const grupos = new Map();
  for (const item of items) {
    const clave = item.proveedor || "";
    if (!grupos.has(clave)) grupos.set(clave, { proveedor: clave, items: [], urgentes: 0 });
    const g = grupos.get(clave);
    g.items.push(item);
    if (item.urge) g.urgentes += 1;
  }

  const porProveedor = [...grupos.values()]
    .map((g) => ({
      ...g,
      plazoDias: g.items[0]?.plazoDias ?? plazos.general,
      plazoEsPropio: g.items[0]?.plazoEsPropio ?? false,
    }))
    .sort((a, b) => {
      // Primero los que tienen algo urgente; los sin proveedor al final, porque
      // no se pueden pedir hasta resolver a quien.
      if (!a.proveedor !== !b.proveedor) return a.proveedor ? -1 : 1;
      if (a.urgentes !== b.urgentes) return b.urgentes - a.urgentes;
      return a.proveedor.localeCompare(b.proveedor);
    });

  return {
    items,
    porProveedor,
    resumen: {
      analizados: items.length,
      urgentes: items.filter((i) => i.urge).length,
      sinProveedor: items.filter((i) => i.urge && !i.proveedor).length,
      mesesDeHistoria: Math.round(mesesDeHistoria * 10) / 10,
      plazoGeneral: plazos.general,
      pedidosMedidos: plazos.muestra ?? 0,
      proveedoresConPlazoPropio: plazos.porProveedor.size,
    },
  };
}
