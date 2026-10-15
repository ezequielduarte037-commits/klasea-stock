import { supabase } from "@/supabaseClient";
import { normalizarCodigo } from "@/features/panol/kioscoApi";

/**
 * Consumibles — el contrato que comparten todas las pantallas del apartado.
 *
 * El registro vive en `consumibles_movimientos` (migración
 * 20261010120000_consumibles_base.sql) y NO en panol_obra_materiales_snapshot:
 * hasta el 13/10/2026 los consumibles no tenían stock, y este apartado arranca
 * de cero. El stock sale de la vista `consumibles_stock`: lo contado en el
 * último conteo más lo que se movió después. Sin conteo en la sede es null
 * ("sin contar"), y lo que salió antes del primer conteo se informa aparte
 * como pre-conteo (migración 20261013160000).
 *
 * Reglas que no se discuten en cada pantalla:
 *   - Todo movimiento lleva sede. La del mostrador se guarda por equipo.
 *   - La cantidad va en la unidad de entrega del consumible, con signo: el
 *     retiro y la merma restan. Las funciones de acá reciben cantidades
 *     positivas y ponen el signo.
 *   - Un movimiento no se edita: se anula y se carga de nuevo.
 *   - El id de cada fila se genera acá: si se reintenta un envío, no duplica.
 *   - Un retiro repartido entre obras son varias filas con el mismo `lote`.
 */

export { normalizarCodigo };

export const SEDES = ["Chubut", "Pampa"];

export const FORMAS_ENTREGA = {
  unidad: { label: "Por cantidad", ayuda: "Se cuenta en su unidad: unidades, pares, rollos." },
  peso: { label: "Por peso", ayuda: "Se pesa en la balanza y el sistema pasa gramos a piezas." },
  fraccionado: { label: "Fraccionado", ayuda: "Sale en litros o metros desde un envase más grande." },
  canje: { label: "Canje 1 por 1", ayuda: "El nuevo se entrega contra el usado." },
  prestamo: { label: "Préstamo", ayuda: "Sale a nombre de la persona y tiene que volver." },
};

export const TIPOS_MOVIMIENTO = {
  inventario: "Conteo",
  ingreso: "Ingreso",
  retiro: "Retiro",
  devolucion: "Devolución",
  ajuste: "Ajuste",
  merma: "Merma",
};

export const CARRILES = {
  mostrador: "Mostrador",
  planificado: "Lista planificada",
  sector: "Punto de sector",
};

const SEDE_KEY = "klasea.consumibles.sede";

/** La sede del pañol en este equipo. Se elige una vez y queda guardada. */
export function sedeDelEquipo() {
  try {
    const s = window.localStorage.getItem(SEDE_KEY);
    return SEDES.includes(s) ? s : null;
  } catch {
    return null;
  }
}

export function guardarSedeDelEquipo(sede) {
  try {
    if (SEDES.includes(sede)) window.localStorage.setItem(SEDE_KEY, sede);
  } catch { /* modo privado: se vuelve a preguntar */ }
}

export function nuevoId() {
  return crypto.randomUUID();
}

const num = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** La unidad de entrega llega a milésimos: 0,001 nunca debe verse como cero. */
export function fmtCantidad(v) {
  const n = num(v);
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

export function fmtPesos(v) {
  const n = num(v);
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: n < 100 ? 2 : 0 });
}

/**
 * Piezas que representan unos gramos, con el peso unitario calibrado. Un peso
 * de cero o negativo (balanza mal tarada) no es una pieza: devuelve null.
 */
export function piezasDesdeGramos(gramos, pesoUnitarioG) {
  const g = num(gramos);
  const pu = num(pesoUnitarioG);
  if (g == null || g <= 0 || pu == null || pu <= 0) return null;
  return Math.max(1, Math.round(g / pu));
}

// ── Fechas de Argentina ─────────────────────────────────────────────────────
// "Hoy" es el día del astillero, no el de la PC ni el de UTC: después de las
// 21 h en UTC ya es mañana, y una PC mal configurada corre el cupo de día.

const ZONA_AR = "America/Argentina/Buenos_Aires";

/** Fecha de hoy en Argentina, AAAA-MM-DD. */
export function hoyArgentina(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_AR, year: "numeric", month: "2-digit", day: "2-digit" }).format(ahora);
}

/** Inicio y fin (exclusivo) del día de hoy en Argentina, en ISO. Argentina no tiene horario de verano: UTC-3. */
export function rangoDeHoyArgentina(ahora = new Date()) {
  const dia = hoyArgentina(ahora);
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fin = new Date(inicio.getTime() + 24 * 60 * 60 * 1000);
  return { dia, desde: inicio.toISOString(), hasta: fin.toISOString() };
}

/** Trae todas las filas de una consulta paginando de a 1000 (el tope de PostgREST). */
async function traerTodo(armarConsulta) {
  const paso = 1000;
  const filas = [];
  for (let desde = 0; ;) {
    const { data, error } = await armarConsulta().range(desde, desde + paso - 1);
    if (error) throw error;
    filas.push(...(data ?? []));
    // El límite configurado en el servidor puede ser menor que lo pedido.
    if (!data?.length) return filas;
    desde += data.length;
  }
}

// ── Lectura ─────────────────────────────────────────────────────────────────

/**
 * El catálogo de consumibles con todo lo que necesita una pantalla: config,
 * stock por sede, rubro y códigos para el lector.
 *
 * `sede` define el campo `stock` de cada ítem; `stockPorSede` trae las dos.
 */
export async function fetchCatalogo({ sede = null, incluirInactivos = false } = {}) {
  const materiales = () => {
    let q = supabase
      .from("panol_materiales")
      .select("id,codigo,codigo_barra,descripcion,alias,notas,unidad_medida,categoria_id,imagen_url,ubicacion,stock_minimo,peso_unitario_g,peso_calibrado_at,proveedor,activo")
      .eq("es_consumible", true)
      .order("descripcion")
      .order("id");
    if (!incluirInactivos) q = q.or("activo.is.null,activo.eq.true");
    return q;
  };

  // Paginado: PostgREST corta en 1000 filas sin avisar, y un stock que falta
  // se vería como "sin stock".
  const [mats, cats, configs, stocks] = await Promise.all([
    traerTodo(materiales),
    traerTodo(() => supabase.from("panol_categorias").select("id,nombre,parent_id").order("id")),
    traerTodo(() => supabase.from("consumibles_config").select("*").order("material_id")),
    traerTodo(() => supabase.from("consumibles_stock").select("*").order("material_id").order("sede")),
  ]);

  const ids = mats.map((m) => m.id);
  const codigos = await fetchCodigosDeBarra(ids);

  const catById = new Map(cats.map((c) => [c.id, c]));
  const cfgById = new Map(configs.map((c) => [c.material_id, c]));
  const stockById = new Map();
  for (const s of stocks) {
    const actual = stockById.get(s.material_id) ?? {};
    const valor = Number(s.stock);
    actual[s.sede] = {
      // Sin conteo la vista da null: es "sin contar", nunca cero.
      stock: s.stock != null && Number.isFinite(valor) ? valor : null,
      ultimoConteoAt: s.ultimo_conteo_at,
      ultimoRetiroAt: s.ultimo_retiro_at,
      ultimoIngresoAt: s.ultimo_ingreso_at,
      primerConteoAt: s.primer_conteo_at ?? null,
      // Lo que salió antes del primer conteo: registrado, pero no descuenta.
      preConteoRetirado: num(s.pre_conteo_retirado) ?? 0,
      preConteoRetiros: Number(s.pre_conteo_retiros) || 0,
    };
    stockById.set(s.material_id, actual);
  }

  return mats.map((m) => {
    const cat = catById.get(m.categoria_id);
    const padre = cat?.parent_id ? catById.get(cat.parent_id) : null;
    const config = cfgById.get(m.id) ?? null;
    const porSede = stockById.get(m.id) ?? {};
    const deSede = sede ? porSede[sede] : null;
    return {
      id: m.id,
      descripcion: m.descripcion,
      alias: m.alias,
      // Información del producto (marca, medidas, uso): la ve todo el que lo busca.
      info: m.notas ?? null,
      codigo: m.codigo,
      rubro: cat?.nombre ?? null,
      rubroPadre: padre?.nombre ?? null,
      categoriaId: m.categoria_id,
      imagenUrl: m.imagen_url,
      ubicacion: m.ubicacion,
      stockMinimo: num(m.stock_minimo),
      pesoUnitarioG: num(m.peso_unitario_g),
      pesoCalibradoAt: m.peso_calibrado_at,
      proveedor: m.proveedor,
      activo: m.activo !== false,
      config,
      codigoEtiqueta: config?.codigo_etiqueta ?? null,
      formaEntrega: config?.forma_entrega ?? "unidad",
      unidad: config?.unidad_entrega ?? m.unidad_medida ?? "unidad",
      costoUnitarioArs: num(config?.costo_unitario_ars),
      enMostrador: config ? config.activo_mostrador !== false : true,
      stock: deSede ? deSede.stock : null,
      ultimoConteoAt: deSede?.ultimoConteoAt ?? null,
      preConteoRetirado: deSede?.preConteoRetirado ?? 0,
      stockPorSede: porSede,
      // En orden de confianza: la etiqueta propia primero, el código del
      // proveedor al final (es el que más se repite entre productos).
      codigosPorTipo: {
        etiqueta: [config?.codigo_etiqueta].map(normalizarCodigo).filter(Boolean),
        barras: [...(codigos.get(m.id) ?? []), m.codigo_barra].map(normalizarCodigo).filter(Boolean),
        interno: [m.codigo].map(normalizarCodigo).filter(Boolean),
        proveedor: [config?.proveedor_codigo].map(normalizarCodigo).filter(Boolean),
      },
      codigos: [
        config?.codigo_etiqueta,
        ...(codigos.get(m.id) ?? []),
        m.codigo_barra,
        m.codigo,
        config?.proveedor_codigo,
      ].map(normalizarCodigo).filter(Boolean),
    };
  });
}

async function fetchCodigosDeBarra(materialIds) {
  const out = new Map();
  for (let i = 0; i < materialIds.length; i += 300) {
    const lote = materialIds.slice(i, i + 300);
    const filas = await traerTodo(() => supabase
      .from("panol_material_codigos_barra")
      .select("material_id,codigo")
      .in("material_id", lote)
      .eq("activo", true)
      .order("material_id")
      .order("codigo"));
    for (const r of filas) {
      const lista = out.get(r.material_id) ?? [];
      lista.push(r.codigo);
      out.set(r.material_id, lista);
    }
  }
  return out;
}

const PRIORIDAD_CODIGOS = ["etiqueta", "barras", "interno", "proveedor"];

/**
 * Índice código → ítem del catálogo, para el lector. Si el mismo código lo
 * tienen dos productos, gana el de mayor confianza (el código de etiqueta le gana a
 * un código de proveedor igual), no el que vino primero en la lista.
 */
export function indexarCodigos(catalogo = []) {
  const map = new Map();
  for (const tipo of PRIORIDAD_CODIGOS) {
    for (const item of catalogo) {
      for (const c of item.codigosPorTipo?.[tipo] ?? []) if (!map.has(c)) map.set(c, item);
    }
  }
  // Ítems armados a mano (sin codigosPorTipo) siguen funcionando.
  for (const item of catalogo) {
    for (const c of item.codigos ?? []) if (!map.has(c)) map.set(c, item);
  }
  return map;
}

/**
 * Códigos que apuntan a más de un producto. El lector resuelve por prioridad,
 * pero conviene corregirlos en el catálogo: devuelve [{ codigo, items }].
 */
export function colisionesDeCodigos(catalogo = []) {
  const porCodigo = new Map();
  for (const item of catalogo) {
    for (const c of new Set(item.codigos ?? [])) {
      const lista = porCodigo.get(c) ?? [];
      lista.push(item);
      porCodigo.set(c, lista);
    }
  }
  return [...porCodigo.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([codigo, items]) => ({ codigo, items }));
}

export async function fetchObrasActivas() {
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,descripcion,linea_nombre")
    .eq("estado", "activa")
    .order("codigo");
  if (error) throw error;
  return data ?? [];
}

/**
 * Obras donde está asignada hoy la persona (RRHH). El retiro se carga ahí por
 * defecto; si son varias, quien retira elige o se reparte entre todas.
 */
export async function obrasDeEmpleado(empleadoId) {
  if (!empleadoId) return [];
  const hoy = hoyArgentina();
  const { data, error } = await supabase
    .from("rrhh_empleado_obras")
    .select("obra_id,oficio_id,desde,hasta,obra:produccion_obras(id,codigo,descripcion,estado)")
    .eq("empleado_id", empleadoId)
    .lte("desde", hoy)
    .or(`hasta.is.null,hasta.gte.${hoy}`);
  if (error) throw error;
  const vistas = new Set();
  // Solo obras activas: las asignaciones de RRHH a obras terminadas quedan
  // vigentes hasta que alguien las cierra (había 58 el 10/10).
  return (data ?? [])
    .map((r) => r.obra)
    .filter((o) => o && o.estado === "activa" && !vistas.has(o.id) && vistas.add(o.id));
}

/** Lo que la persona ya retiró hoy (día de Argentina): para el cupo y para el aviso "ya se llevó". */
export async function retirosDeHoy(empleadoId) {
  if (!empleadoId) return [];
  const { desde, hasta } = rangoDeHoyArgentina();
  const { data, error } = await supabase
    .from("consumibles_movimientos")
    .select("id,material_id,cantidad,created_at,carril")
    .eq("empleado_id", empleadoId)
    .eq("tipo", "retiro")
    .is("anulado_at", null)
    .gte("created_at", desde)
    .lt("created_at", hasta)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMovimientos({ sede = null, desde = null, hasta = null, materialId = null, empleadoId = null, obraId = null, tipos = null, incluirAnulados = false, limite = 1000 } = {}) {
  const consultar = () => {
  let q = supabase
    .from("consumibles_movimientos")
    .select("*, material:panol_materiales(id,descripcion,imagen_url,unidad_medida), obra:produccion_obras(id,codigo)")
    .order("created_at", { ascending: false })
    .order("id");
  if (sede) q = q.eq("sede", sede);
  if (desde) q = q.gte("created_at", desde);
  if (hasta) q = q.lt("created_at", hasta);
  if (materialId) q = q.eq("material_id", materialId);
  if (empleadoId) q = q.eq("empleado_id", empleadoId);
  if (obraId) q = q.eq("obra_id", obraId);
  if (tipos?.length) q = q.in("tipo", tipos);
  if (!incluirAnulados) q = q.is("anulado_at", null);
    return q;
  };
  const filas = [];
  while (filas.length < limite) {
    const { data, error } = await consultar().range(filas.length, Math.min(filas.length + 1000, limite) - 1);
    if (error) throw error;
    if (!data?.length) break;
    filas.push(...data);
  }
  return filas;
}

// ── Escritura ───────────────────────────────────────────────────────────────

/**
 * Inserta filas ya armadas. Idempotente por id: reintentar el mismo envío no
 * duplica (útil si se corta la conexión en el mostrador).
 */
export async function insertarMovimientos(filas = []) {
  if (!filas.length) return [];
  const conId = filas.map((f) => ({ ...f, id: f.id ?? nuevoId() }));
  const { data, error } = await supabase
    .from("consumibles_movimientos")
    .upsert(conId, { onConflict: "id", ignoreDuplicates: true })
    .select("*");
  if (error) throw error;
  return data ?? [];
}

/**
 * Reparte una cantidad entre obras. `reparto` = [{ obraId, proporcion }]; sin
 * proporciones válidas va todo sin obra.
 *
 * Trabaja en milésimos enteros y reparte el resto por mayor fracción: la suma
 * da EXACTO la cantidad original y ninguna parte queda negativa. Con 0,002 entre
 * cuatro obras salen dos de 0,001 (antes salían tres, que sumaban de más).
 */
export function repartirEntreObras(cantidad, reparto = []) {
  const validas = reparto.filter((r) => r.obraId && Number(r.proporcion) > 0);
  if (!validas.length) return [{ obraId: null, cantidad }];
  const milesimos = Math.round(Number(cantidad) * 1000);
  const total = validas.reduce((s, r) => s + Number(r.proporcion), 0);
  const partes = validas.map((r, i) => {
    const exacto = (milesimos * Number(r.proporcion)) / total;
    return { i, obraId: r.obraId, enteros: Math.floor(exacto), fraccion: exacto - Math.floor(exacto) };
  });
  let resto = milesimos - partes.reduce((s, p) => s + p.enteros, 0);
  for (const p of [...partes].sort((a, b) => b.fraccion - a.fraccion || a.i - b.i)) {
    if (resto <= 0) break;
    p.enteros += 1;
    resto -= 1;
  }
  return partes
    .filter((p) => p.enteros > 0)
    .map((p) => ({ obraId: p.obraId, cantidad: p.enteros / 1000 }));
}

/**
 * Arma las filas de un carrito de retiro SIN mandarlas, con sus ids. Sirve
 * para la cola sin conexión: se guardan estas filas y se reintenta con
 * `insertarMovimientos(filas)`, y el mismo id nunca descuenta dos veces.
 *
 * items: [{ materialId, cantidad (positiva, en unidad de entrega), gramos?,
 *           canje?, fueraCupo?, autorizadoPor?, reparto? }]
 * reparto (general o por ítem): [{ obraId, proporcion }]
 * empleado: { id, nombre, dni } — con tarjeta o elegido de la lista.
 */
export function armarFilasRetiro({
  items = [],
  empleado = null,
  metodoFirma = "nfc",
  sede,
  carril = "mostrador",
  sector = null,
  reparto = [],
  nota = null,
  lote = nuevoId(),
  origen = "mostrador",
} = {}) {
  if (!SEDES.includes(sede)) throw new Error("Elegí la sede del pañol.");
  if (!empleado?.id && !String(empleado?.nombre || "").trim()) throw new Error("Falta quién retira.");
  const limpios = items.filter((i) => i.materialId && Number(i.cantidad) > 0);
  if (!limpios.length) throw new Error("El carrito está vacío.");

  const filas = [];
  for (const it of limpios) {
    const partes = repartirEntreObras(Number(it.cantidad), it.reparto?.length ? it.reparto : reparto);
    partes.forEach((p, n) => {
      filas.push({
        id: nuevoId(),
        material_id: it.materialId,
        sede,
        tipo: "retiro",
        cantidad: -Math.abs(p.cantidad),
        // El peso se registra entero en la primera parte: repartir gramos por
        // proporción dejaba partes con 0 g (que la base rechaza) y no sumaba.
        gramos: n === 0 && Number(it.gramos) > 0 ? Number(it.gramos) : null,
        empleado_id: empleado?.id ?? null,
        empleado_nombre: empleado?.nombre ?? null,
        empleado_dni: empleado?.dni ?? null,
        metodo_firma: metodoFirma,
        obra_id: p.obraId,
        sector: sector || null,
        carril,
        lote,
        canje: it.canje ?? null,
        fuera_cupo: !!it.fueraCupo,
        autorizado_por: it.autorizadoPor ?? null,
        origen,
        nota: nota || null,
      });
    });
  }
  // Mismo orden que el espejo de solicitudes: dos carritos simultáneos toman
  // los candados por material en el mismo orden y no se bloquean entre sí.
  return filas.sort((a, b) => String(a.material_id).localeCompare(String(b.material_id)));
}

/** Registra un carrito de retiro. Para reintentos seguros, usar armarFilasRetiro. */
export async function registrarRetiro(datos = {}) {
  return insertarMovimientos(armarFilasRetiro(datos));
}

/** Ingreso de mercadería (remito del proveedor). Cantidades positivas. */
export async function registrarIngreso({ items = [], sede, remito = null, nota = null, lote = nuevoId() } = {}) {
  if (!SEDES.includes(sede)) throw new Error("Elegí la sede del pañol.");
  const filas = items
    .filter((i) => i.materialId && Number(i.cantidad) > 0)
    .map((i) => ({
      id: nuevoId(),
      material_id: i.materialId,
      sede,
      tipo: "ingreso",
      cantidad: Math.abs(Number(i.cantidad)),
      costo_unitario_ars: i.costoUnitarioArs ?? null,
      remito: remito || null,
      lote,
      origen: "ingreso",
      nota: nota || null,
    }));
  if (!filas.length) throw new Error("No hay nada para ingresar.");
  return insertarMovimientos(filas);
}

/** Lo que sobra y vuelve al pañol (o una herramienta prestada que vuelve). */
export async function registrarDevolucion({ materialId, cantidad, sede, empleado = null, obraId = null, nota = null } = {}) {
  if (!SEDES.includes(sede)) throw new Error("Elegí la sede del pañol.");
  if (!materialId || !(Number(cantidad) > 0)) throw new Error("Falta qué y cuánto vuelve.");
  return insertarMovimientos([{
    material_id: materialId,
    sede,
    tipo: "devolucion",
    cantidad: Math.abs(Number(cantidad)),
    empleado_id: empleado?.id ?? null,
    empleado_nombre: empleado?.nombre ?? null,
    obra_id: obraId,
    origen: "devolucion",
    nota: nota || null,
  }]);
}

/**
 * Conteo físico. Lo resuelve la base: graba la diferencia contra lo que dice el
 * sistema en ese momento. Sirve para el inventario inicial y el cíclico.
 */
export async function registrarConteo({ id = nuevoId(), materialId, sede, contado, gramos = null, nota = null, lote = null } = {}) {
  // Vacío no es cero: un campo sin completar mandaba 0 y borraba el stock.
  const texto = String(contado ?? "").trim().replace(",", ".");
  const valor = texto === "" ? NaN : Number(texto);
  if (!Number.isFinite(valor) || valor < 0) throw new Error("Cargá cuánto hay: un número de cero para arriba.");
  const g = Number(String(gramos ?? "").replace(",", "."));
  const { data, error } = await supabase.rpc("consumibles_registrar_conteo", {
    p_material_id: materialId,
    p_sede: sede,
    p_contado: valor,
    p_gramos: Number.isFinite(g) && g > 0 ? g : null,
    p_nota: nota,
    p_lote: lote,
    // Con el mismo id, un reintento devuelve el conteo ya grabado sin recalcular.
    p_id: id,
  });
  if (error) throw error;
  return data;
}

export async function anularMovimiento(id, motivo) {
  if (!String(motivo || "").trim()) throw new Error("Escribí por qué se anula.");
  const { error } = await supabase
    .from("consumibles_movimientos")
    .update({ anulado_at: new Date().toISOString(), anulado_motivo: String(motivo).trim() })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Crea la config si no existe (con su código de etiqueta) y aplica el cambio.
 * Primero un insert que no pisa nada y después el update: si dos equipos lo
 * hacen a la vez, ninguno falla ni se pierde el código ya asignado.
 */
export async function guardarConfig(materialId, cambios = {}) {
  const { error: e1 } = await supabase
    .from("consumibles_config")
    .upsert({ material_id: materialId }, { onConflict: "material_id", ignoreDuplicates: true });
  if (e1) throw e1;
  const q = Object.keys(cambios).length
    ? supabase.from("consumibles_config").update(cambios).eq("material_id", materialId)
    : supabase.from("consumibles_config").select("*").eq("material_id", materialId);
  const { data, error } = await (Object.keys(cambios).length ? q.select("*").single() : q.single());
  if (error) throw error;
  return data;
}

/**
 * Da de alta un consumible que no estaba en el sistema (aparece en el conteo,
 * o se activa un producto de la lista de Rebollar). Va por el RPC
 * `consumibles_crear`: material y config en una sola transacción (no queda un
 * material sin config si algo falla) y con id generado acá, así un reintento
 * no lo duplica. Lo puede usar el pañolero; queda `revisado = false` para que
 * Compras lo mire después.
 *
 * config: campos de consumibles_config (forma_entrega, unidad_entrega,
 * proveedor_codigo, costo_unitario_ars...). Devuelve { material, config }.
 */
export async function crearConsumible({ id = nuevoId(), descripcion, unidad = "unidad", categoriaId = null, proveedor = null, ubicacion = null, config = {} } = {}) {
  const desc = String(descripcion || "").trim();
  if (!desc) throw new Error("Falta la descripción.");
  const { data, error } = await supabase.rpc("consumibles_crear", {
    p_id: id,
    p_descripcion: desc,
    p_unidad: unidad || "unidad",
    p_categoria_id: categoriaId || null,
    p_proveedor: proveedor || null,
    p_ubicacion: ubicacion || null,
    p_config: config ?? {},
  });
  if (error) throw error;
  return {
    material: { id: data.material_id, descripcion: desc, unidad_medida: unidad || "unidad", categoria_id: categoriaId },
    config: data.config,
  };
}

/** Ubicación fija en el pañol (estantería-nivel-posición, ej. "C2-03"). */
export async function guardarUbicacion(materialId, ubicacion) {
  const valor = String(ubicacion || "").trim().toUpperCase() || null;
  const { error } = await supabase.from("panol_materiales").update({ ubicacion: valor }).eq("id", materialId);
  if (error) throw error;
  return valor;
}

/** Stock mínimo: va por el RPC de pañol, que deja auditoría. */
export async function guardarStockMinimo(materialId, stockMinimo) {
  const { error } = await supabase.rpc("panol_set_stock_minimo", {
    p_material_id: materialId,
    p_stock_minimo: stockMinimo === "" || stockMinimo == null ? null : Number(stockMinimo),
  });
  if (error) throw error;
}
