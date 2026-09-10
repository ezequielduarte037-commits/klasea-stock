import { supabase } from "@/supabaseClient";
import { rankRows, searchClauses, tokenize } from "./searchText";
import { searchSecciones } from "./navIndex";

/**
 * El buscador global.
 *
 * Busca en dos planos distintos y hay que tenerlos separados en la cabeza:
 *
 *   - Las SECCIONES (navIndex) son el mapa del sistema y se resuelven acá
 *     mismo, sin red. Salen primero y salen siempre: si alguien escribe
 *     "remito" lo que quiere es entrar a remitos, no leer un remito.
 *   - El resto son los DATOS, y cada uno es una consulta a su tabla.
 *
 * Las consultas piden más filas de las que se muestran y ordenan en el
 * navegador con `rankRows`. PostgREST no sabe de relevancia -ordena por
 * columna-, así que traerse las primeras 24 alfabéticas y mostrarlas era
 * mostrar cualquier cosa: el que mejor coincidía podía estar en la fila 80.
 */

const GROUP_ORDER = [
  "secciones",
  "obras",
  "materiales",
  "remitos",
  "compras",
  "solicitudes",
  "proveedores",
  "personas",
  "logistica",
  "postventa",
  "procedimientos",
  "tickets",
];

/**
 * Quién ve qué. Es el `allow` de cada ruta en App.jsx: no tiene sentido
 * devolver algo que al abrirlo va a rebotar contra el control de rol.
 */
function roleAccess(profile) {
  const role = profile?.role || "";
  const admin = !!profile?.is_admin || role === "admin";
  const uno = (...roles) => admin || roles.includes(role);
  return {
    secciones: true,   // el propio índice ya filtra por rol
    tickets: true,     // pedir ayuda lo puede hacer cualquiera
    obras: uno("oficina", "tecnica"),
    materiales: uno("oficina", "tecnica", "compras", "panol"),
    remitos: uno("oficina", "tecnica", "panol"),
    compras: uno("oficina", "tecnica", "panol", "compras"),
    solicitudes: uno("oficina", "tecnica", "panol", "compras"),
    proveedores: uno("oficina", "tecnica", "compras"),
    personas: uno("rrhh", "tecnica", "oficina", "administracion"),
    logistica: uno("tecnica", "administracion", "compras"),
    postventa: uno("oficina", "tecnica"),
    procedimientos: uno("oficina", "tecnica", "laminacion", "muebles", "mecanica", "electricidad"),
  };
}

export function globalSearchScopes(profile) {
  const access = roleAccess(profile);
  return GROUP_ORDER.filter((key) => access[key]);
}

/** El `.or()` de PostgREST se arma con las mismas columnas que después puntúan. */
function clausesFor(fields, tokens) {
  return searchClauses(Object.keys(fields), tokens);
}

async function searchObras(tokens, rawQuery) {
  const fields = { codigo: 1, descripcion: 0.6, linea_nombre: 0.5, propietario: 0.55, tipo: 0.3 };
  const { data, error } = await supabase
    .from("produccion_obras")
    .select("id,codigo,descripcion,estado,linea_nombre,propietario,tipo")
    .eq("solo_stock", false)
    .or(clausesFor(fields, tokens))
    .limit(200);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: obra }) => ({
    id: obra.id,
    type: "obra",
    title: obra.codigo || "Obra sin código",
    subtitle: [obra.linea_nombre, obra.propietario, obra.descripcion].filter(Boolean).join(" · ") || "Producción",
    meta: obra.estado || "",
    status: obra.estado || "",
    path: `/obras?obra=${encodeURIComponent(obra.id)}`,
  }));
}

async function searchMateriales(tokens, rawQuery) {
  // El código de barras y el alias pesan casi como el nombre: quien escanea o
  // quien conoce el producto por el nombre de la calle busca por ahí.
  const fields = {
    descripcion: 1, alias: 0.85, codigo: 0.8, codigo_barra: 0.8,
    proveedor: 0.45, ubicacion_obs: 0.4, ubicacion: 0.35, notas: 0.3,
  };
  const { data, error } = await supabase
    .from("panol_materiales")
    .select("id,descripcion,alias,codigo,codigo_barra,notas,proveedor,unidad_medida,ubicacion,ubicacion_obs,activo,es_consumible")
    .neq("activo", false)
    .or(clausesFor(fields, tokens))
    .limit(240);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: material }) => ({
    id: material.id,
    type: "material",
    title: material.descripcion || "Producto sin nombre",
    subtitle: [material.codigo || material.codigo_barra, material.proveedor, material.alias].filter(Boolean).join(" · ") || "Catálogo maestro",
    meta: [material.unidad_medida, material.ubicacion_obs || material.ubicacion].filter(Boolean).join(" · "),
    status: material.es_consumible ? "consumible" : "",
    unit: material.unidad_medida || "unidad",
    location: material.ubicacion_obs || material.ubicacion || "",
    path: `/catalogo-maestro?material=${encodeURIComponent(material.id)}`,
    stockPath: `/stock-panol?tab=maestro&material=${encodeURIComponent(material.id)}&q=${encodeURIComponent(material.descripcion || "")}`,
  }));
}

/**
 * Los remitos escaneados en el pañol.
 *
 * `panol_comprobantes` guarda hoy sólo lo del escáner (`scanner_panol`), que es
 * lo que se ve en el archivo. Se filtra explícito igual: el día que Precios o
 * Compras empiecen a escribir ahí, un remito de otro circuito no puede aparecer
 * con un link que lleva al archivo del pañol.
 *
 * Los `archivado` quedan afuera por la misma razón: ahí "archivado" quiere
 * decir descartado -alguien lo marcó como que no es un remito- y el archivo no
 * los lista. Devolverlos era mandar a una pantalla que dice "no hay remitos que
 * coincidan", que es peor que no encontrar nada.
 */
async function searchRemitos(tokens, rawQuery) {
  const fields = { numero: 1, proveedor: 0.9, titulo: 0.7, notas: 0.35, carpeta_local: 0.3, sede: 0.25 };
  const { data, error } = await supabase
    .from("panol_comprobantes")
    .select("id,numero,proveedor,titulo,fecha,total,moneda,sede,notas,carpeta_local,recepcion_estado")
    .eq("origen_carga", "scanner_panol")
    .neq("recepcion_estado", "archivado")
    .or(clausesFor(fields, tokens))
    .limit(200);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: remito }) => {
    // El número es la identidad del papel: va en el título aunque haya título
    // propio, que casi siempre está vacío y cuando no, describe la carga.
    const buscar = remito.numero || remito.proveedor || remito.titulo || "";
    return {
      id: remito.id,
      type: "remito",
      title: remito.numero ? `Remito ${remito.numero}` : remito.titulo || "Remito sin número",
      subtitle: [
        remito.proveedor || "Sin proveedor",
        remito.numero ? remito.titulo : "",
        remito.fecha,
      ].filter(Boolean).join(" · "),
      meta: remito.sede || "",
      status: remito.recepcion_estado || "",
      path: `/recepcion-panol?tab=remitos&q=${encodeURIComponent(buscar)}`,
    };
  });
}

async function searchCompras(tokens, rawQuery) {
  const fields = { title: 1, source_ref: 0.7, proveedor: 0.6, description: 0.45, destino: 0.4 };
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id,title,description,status,priority,proveedor,source_ref,destino,project_id,created_at,project:produccion_obras!purchase_requests_project_id_fkey(id,codigo)")
    .or(clausesFor(fields, tokens))
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: request }) => ({
    id: request.id,
    type: "compra",
    title: request.title || "Pedido sin título",
    subtitle: [request.project?.codigo ? `Obra ${request.project.codigo}` : "Sin obra", request.proveedor].filter(Boolean).join(" · "),
    meta: request.priority ? `Prioridad ${request.priority}` : "",
    status: request.status || "",
    path: `/compras?open=${encodeURIComponent(request.id)}`,
  }));
}

async function searchSolicitudes(tokens, rawQuery) {
  const fields = {
    solicita: 0.85, retira: 0.85, obra_texto: 0.6, sector: 0.5,
    tarea: 0.5, observaciones: 0.35, notas_panol: 0.3,
  };
  let clauses = clausesFor(fields, tokens);
  // El número de solicitud es entero: no entra por `ilike` y es justo lo que
  // más se busca cuando alguien tiene el papel en la mano.
  const numeros = tokens.filter((token) => /^\d+$/.test(token));
  for (const numero of numeros) clauses += `${clauses ? "," : ""}numero.eq.${numero}`;
  const { data, error } = await supabase
    .from("panol_solicitudes")
    .select("id,numero,obra_id,obra_texto,solicita,retira,sector,tarea,observaciones,notas_panol,estado,prioridad,created_at,obra:produccion_obras(id,codigo)")
    .or(clauses)
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  const ranked = rankRows(data, fields, tokens, rawQuery, 12);
  // Si se escribió un número, la solicitud con ese número va primero aunque el
  // texto no coincida en nada: es una coincidencia exacta, no un parecido.
  const conNumero = numeros.length
    ? [...(data || [])].filter((row) => numeros.includes(String(row.numero)))
    : [];
  const vistos = new Set();
  const filas = [...conNumero, ...ranked.map(({ row }) => row)].filter((row) => {
    if (vistos.has(row.id)) return false;
    vistos.add(row.id);
    return true;
  }).slice(0, 6);
  return filas.map((solicitud) => ({
    id: solicitud.id,
    type: "solicitud",
    title: `Solicitud N° ${solicitud.numero ?? "—"}`,
    subtitle: [
      solicitud.obra?.codigo ? `Obra ${solicitud.obra.codigo}` : solicitud.obra_texto || "Sin obra",
      solicitud.solicita ? `pide ${solicitud.solicita}` : "",
      solicitud.retira ? `retira ${solicitud.retira}` : "",
    ].filter(Boolean).join(" · "),
    meta: solicitud.sector || solicitud.tarea || "",
    status: solicitud.estado || "",
    path: `/solicitudes-panol?open=${encodeURIComponent(solicitud.id)}`,
  }));
}

async function searchProveedores(tokens, rawQuery) {
  const fields = { nombre: 1, cuit: 0.9, rubros: 0.5, email: 0.45, telefono: 0.45, notas: 0.3, sede: 0.25 };
  const { data, error } = await supabase
    .from("panol_proveedores")
    .select("id,nombre,cuit,email,telefono,rubros,notas,sede,tipo,activo")
    .or(clausesFor(fields, tokens))
    .limit(200);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: proveedor }) => ({
    id: proveedor.id,
    type: "proveedor",
    title: proveedor.nombre || "Proveedor sin nombre",
    subtitle: [proveedor.cuit ? `CUIT ${proveedor.cuit}` : "", proveedor.rubros, proveedor.telefono].filter(Boolean).join(" · ") || "Proveedores",
    meta: proveedor.sede || proveedor.tipo || "",
    status: proveedor.activo === false ? "inactivo" : "",
    path: `/materiales?tab=proveedores&q=${encodeURIComponent(proveedor.nombre || "")}`,
  }));
}

async function searchPersonas(tokens, rawQuery) {
  const fields = { nombre: 1, dni: 1, grupo: 0.45, sede: 0.4 };
  const { data, error } = await supabase
    .from("rrhh_empleados")
    .select("id,nombre,dni,sede,grupo,activo,ficha")
    .or(clausesFor(fields, tokens))
    .limit(200);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: empleado }) => ({
    id: empleado.id,
    type: "persona",
    title: empleado.nombre || "Persona sin nombre",
    subtitle: [empleado.dni ? `DNI ${empleado.dni}` : "Sin DNI", empleado.sede].filter(Boolean).join(" · "),
    meta: empleado.grupo || "",
    status: empleado.activo === false ? "ex empleado" : empleado.ficha === false ? "no ficha" : "activo",
    path: `/rrhh?tab=empleados&q=${encodeURIComponent(empleado.dni || empleado.nombre || "")}&vista=${empleado.activo === false ? "ex" : "activos"}`,
  }));
}

async function searchLogistica(tokens, rawQuery) {
  const fields = { titulo: 1, obra: 0.7, proveedor_logistico: 0.6, carga: 0.5, tipo: 0.45, notas: 0.3 };
  const { data, error } = await supabase
    .from("calendario_eventos")
    .select("id,titulo,obra,tipo,fecha,estado,proveedor_logistico,carga,notas")
    .or(clausesFor(fields, tokens))
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: evento }) => ({
    id: evento.id,
    type: "logistica",
    title: evento.titulo || "Movimiento sin título",
    subtitle: [evento.obra, evento.proveedor_logistico, evento.fecha].filter(Boolean).join(" · ") || "Logística",
    meta: evento.tipo || "",
    status: evento.estado || "",
    path: `/calendario?q=${encodeURIComponent(evento.titulo || evento.obra || "")}`,
  }));
}

async function searchPostventa(tokens, rawQuery) {
  const fields = {
    nombre_barco: 1, propietario: 0.9, ubicacion_general: 0.5,
    detalle_ubicacion: 0.4, amarra: 0.4, peine: 0.4, notas: 0.25,
  };
  const { data, error } = await supabase
    .from("postventa_flota")
    .select("id,nombre_barco,propietario,ubicacion_general,detalle_ubicacion,amarra,peine,notas")
    .or(clausesFor(fields, tokens))
    .limit(150);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: barco }) => ({
    id: barco.id,
    type: "postventa",
    title: barco.nombre_barco || "Barco sin nombre",
    subtitle: [barco.propietario, barco.ubicacion_general, barco.amarra ? `amarra ${barco.amarra}` : ""].filter(Boolean).join(" · ") || "Post venta",
    meta: barco.peine ? `Peine ${barco.peine}` : "",
    path: `/postventa?q=${encodeURIComponent(barco.nombre_barco || barco.propietario || "")}`,
  }));
}

async function searchProcedimientos(tokens, rawQuery) {
  const fields = { titulo: 1, area: 0.6, descripcion: 0.5, contenido: 0.22 };
  const { data, error } = await supabase
    .from("procedimientos")
    .select("id,titulo,descripcion,area,contenido,activo")
    .neq("activo", false)
    .or(clausesFor(fields, tokens))
    .limit(150);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: proc }) => ({
    id: proc.id,
    type: "procedimiento",
    title: proc.titulo || "Procedimiento sin título",
    subtitle: proc.descripcion || "Instrucciones de trabajo",
    meta: proc.area || "",
    path: `/procedimientos?q=${encodeURIComponent(proc.titulo || "")}`,
  }));
}

async function searchTickets(tokens, rawQuery) {
  const fields = { titulo: 1, pantalla: 0.6, detalle: 0.45, resolucion: 0.3 };
  const { data, error } = await supabase
    .from("sistema_tickets")
    .select("id,titulo,detalle,pantalla,estado,tipo,prioridad,created_at")
    .or(clausesFor(fields, tokens))
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) throw error;
  return rankRows(data, fields, tokens, rawQuery).map(({ row: ticket }) => ({
    id: ticket.id,
    type: "ticket",
    title: ticket.titulo || "Ticket sin título",
    subtitle: [ticket.tipo, ticket.pantalla].filter(Boolean).join(" · ") || "Tickets",
    meta: ticket.prioridad || "",
    status: ticket.estado || "",
    path: `/tickets?open=${encodeURIComponent(ticket.id)}`,
  }));
}

const SEARCHERS = {
  obras: searchObras,
  materiales: searchMateriales,
  remitos: searchRemitos,
  compras: searchCompras,
  solicitudes: searchSolicitudes,
  proveedores: searchProveedores,
  personas: searchPersonas,
  logistica: searchLogistica,
  postventa: searchPostventa,
  procedimientos: searchProcedimientos,
  tickets: searchTickets,
};

/** El orden en que se muestran los grupos, para insertar cada uno en su lugar. */
export function groupRank(key) {
  const index = GROUP_ORDER.indexOf(key);
  return index === -1 ? GROUP_ORDER.length : index;
}

/**
 * Las secciones, sin esperar a la red.
 *
 * Se resuelve aparte para que el buscador tenga algo que mostrar en el mismo
 * momento en que se termina de escribir. Antes la pantalla quedaba en blanco
 * hasta que respondía la última tabla.
 */
export function searchSectionsOnly(query, profile) {
  const items = searchSecciones(query, profile, 5);
  return items.length ? [{ key: "secciones", items }] : [];
}

/**
 * Busca en todo.
 *
 * `onGroup` se llama con cada grupo apenas responde su tabla, así los
 * resultados aparecen de a poco en vez de todos juntos al final. El valor de
 * retorno es el resultado completo, para el asistente y para la caché.
 */
export async function searchGlobal(query, profile, { onGroup } = {}) {
  const tokens = tokenize(query);
  if (!tokens.length) return { groups: [], errors: [] };

  const secciones = searchSectionsOnly(query, profile);
  secciones.forEach((group) => onGroup?.(group));

  const scopes = globalSearchScopes(profile).filter((key) => key !== "secciones");
  const settled = await Promise.allSettled(
    scopes.map(async (key) => {
      const items = await SEARCHERS[key](tokens, query);
      if (items.length) onGroup?.({ key, items });
      return { key, items };
    })
  );

  const groups = [...secciones];
  const errors = [];
  settled.forEach((result, index) => {
    const key = scopes[index];
    if (result.status === "fulfilled") {
      if (result.value.items.length) groups.push(result.value);
    } else {
      errors.push({ key, message: String(result.reason?.message || result.reason || "Error de búsqueda") });
    }
  });
  groups.sort((a, b) => groupRank(a.key) - groupRank(b.key));
  return { groups, errors };
}
