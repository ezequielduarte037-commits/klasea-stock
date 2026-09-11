import { supabase } from "@/supabaseClient";
import { cleanIlike, normalize } from "./searchText";
import { elegirEntre } from "./assistantRouter";

/**
 * Las consultas que el asistente puede correr.
 *
 * POR QUÉ EXISTE ESTO
 * Antes el asistente sólo recibía hasta 24 filas de una búsqueda por palabras y
 * tenía prohibido contarlas -con razón: son coincidencias parciales, no el
 * universo-. Así no podía contestar nada que empiece con "cuántos" ni nada con
 * una fecha adentro. Y como encima había un `if` que miraba si la pregunta
 * contenía la palabra "cuántos" y respondía con una plantilla de stock, una
 * pregunta sobre remitos terminaba contestada con el stock de unos cables.
 *
 * Acá cada pregunta de ese tipo tiene una consulta de verdad detrás, con su
 * filtro de fecha y su total exacto.
 *
 * CÓMO ESTÁ ACOTADO
 * El modelo NO escribe consultas. Ni siquiera elige: la elección es
 * determinística y está acá abajo, se puede leer y se puede probar. El modelo
 * sólo entra cuando ninguna consulta aplica, y ahí sigue recibiendo lo mismo
 * que antes -texto de búsqueda- sin acceso a nada.
 *
 * Todo corre con el `supabase` del navegador, o sea con la sesión de quien
 * pregunta: manda el RLS igual que en cualquier pantalla. Nunca con la clave de
 * servicio. Si alguien no puede ver una tabla, el asistente tampoco.
 *
 * El texto libre de la pregunta entra únicamente como parámetro de un `ilike`
 * armado por supabase-js, nunca como SQL.
 */

const TOPE_FILAS = 300;
const TOPE_MUESTRA = 6;

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de consulta
// ─────────────────────────────────────────────────────────────────────────────

function enRango(query, columna, periodo) {
  if (!periodo) return query;
  return query.gte(columna, periodo.desde.toISOString()).lt(columna, periodo.hasta.toISOString());
}

/**
 * Filtra por el texto que quedó de la pregunta.
 *
 * Un `.or()` por término, no uno solo con todo junto: encadenados, PostgREST
 * los une con AND, así que "casa iriarte" pide las dos palabras en vez de traer
 * todo lo que diga "casa". En un conteo esa diferencia es el número.
 *
 * El texto entra únicamente como valor de un `ilike` armado por supabase-js, y
 * antes se le sacan los comodines: nunca se concatena SQL.
 */
function conTexto(query, columnas, terminos) {
  for (const termino of terminos) {
    const valor = cleanIlike(termino);
    if (!valor) continue;
    query = query.or(columnas.map((columna) => `${columna}.ilike.%${valor}%`).join(","));
  }
  return query;
}

/** La misma búsqueda pero floja: alcanza con que aparezca alguna palabra. */
function conTextoFlojo(query, columnas, terminos) {
  const valores = terminos.map(cleanIlike).filter(Boolean);
  if (!valores.length) return query;
  return query.or(columnas.flatMap((c) => valores.map((v) => `${c}.ilike.%${v}%`)).join(","));
}

function fmtFecha(valor) {
  if (!valor) return "";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

function plural(n, singular, pluralForma) {
  return `${n} ${n === 1 ? singular : pluralForma}`;
}

function cuando(periodo) {
  return periodo ? ` ${periodo.etiqueta}` : "";
}

/** "3 remitos esta semana" + las primeras filas, para que se pueda verificar. */
function resumenLista({ total, filas, encabezado, linea, periodo, vacio }) {
  if (!total) return `${vacio}${cuando(periodo)}.`;
  const muestra = filas.slice(0, TOPE_MUESTRA).map((fila) => `· ${linea(fila)}`);
  const resto = total > muestra.length ? `\nY ${total - muestra.length} más.` : "";
  return `${encabezado}${muestra.length ? `\n${muestra.join("\n")}` : ""}${resto}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Las consultas
//
// `sujeto` es obligatorio: sin una palabra que diga DE QUÉ se habla, no se
// dispara ninguna. Ese es justamente el error que tenía antes -alcanzaba con
// que la pregunta dijera "cuántos"-.
// ─────────────────────────────────────────────────────────────────────────────

const GESTION_PANOL = ["admin", "oficina", "tecnica", "panol"];
const CON_COMPRAS = ["admin", "oficina", "tecnica", "panol", "compras"];

export const HERRAMIENTAS = [
  {
    id: "remitos",
    label: "Remitos escaneados",
    roles: GESTION_PANOL,
    sujeto: ["remito", "remitos", "comprobante", "comprobantes"],
    ruta: "/recepcion-panol?tab=remitos",
    rutaLabel: "Abrir el archivo de remitos",
    async correr({ periodo, terminos }) {
      let query = supabase
        .from("panol_comprobantes")
        .select("id,numero,proveedor,titulo,fecha,sede,created_at", { count: "exact" })
        .eq("origen_carga", "scanner_panol")
        .neq("recepcion_estado", "archivado")
        .order("created_at", { ascending: false })
        .limit(TOPE_FILAS);
      // `created_at` y no `fecha`: se pregunta cuándo se CARGÓ al sistema, que
      // es lo que pasó esta semana; la fecha del papel puede ser de antes.
      query = enRango(query, "created_at", periodo);
      query = conTexto(query, ["proveedor", "numero", "titulo"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length };
    },
    resumir({ filas, total }, { periodo, terminos }) {
      const filtro = terminos.length ? ` de "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo,
        vacio: `No se cargó ningún remito${filtro}`,
        encabezado: `Se cargaron ${plural(total, "remito", "remitos")}${filtro}${cuando(periodo)}.`,
        // Muchos remitos recién escaneados todavía no tienen número. Poner
        // "sin número" tres veces seguidas no identifica nada: cuando falta, lo
        // que distingue a uno de otro es el proveedor y el día.
        linea: (r) => [r.numero ? `N° ${r.numero}` : "", r.proveedor || r.titulo || "sin proveedor", fmtFecha(r.created_at)].filter(Boolean).join(" · "),
      });
    },
  },

  {
    id: "pedidos_compras",
    label: "Pedidos a compras",
    roles: CON_COMPRAS,
    sujeto: ["pedido", "pedidos", "compra", "compras"],
    ruta: "/compras?tab=pendientes",
    rutaLabel: "Abrir Compras",
    estados: {
      nuevo: ["nuevo", "nuevos"],
      en_revision: ["revision", "revisar", "revisando"],
      cotizando: ["cotizando", "cotizacion", "cotizaciones", "presupuesto"],
      comprado: ["comprado", "comprados"],
      recibido: ["recibido", "recibidos"],
      cancelado: ["cancelado", "cancelados", "anulado"],
    },
    async correr({ periodo, terminos, estado }) {
      let query = supabase
        .from("purchase_requests")
        .select("id,title,status,proveedor,created_at,project:produccion_obras!purchase_requests_project_id_fkey(codigo)", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(TOPE_FILAS);
      if (estado) query = query.eq("status", estado);
      query = enRango(query, "created_at", periodo);
      query = conTexto(query, ["title", "proveedor"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length };
    },
    resumir({ filas, total }, { periodo, terminos, estado }) {
      const conEstado = estado ? ` en estado ${estado.replace("_", " ")}` : "";
      const filtro = terminos.length ? ` sobre "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo,
        vacio: `No hay pedidos${conEstado}${filtro}`,
        encabezado: `Hay ${plural(total, "pedido", "pedidos")}${conEstado}${filtro}${cuando(periodo)}.`,
        linea: (r) => [r.title, r.project?.codigo ? `obra ${r.project.codigo}` : "", r.status, fmtFecha(r.created_at)].filter(Boolean).join(" · "),
      });
    },
  },

  {
    id: "solicitudes",
    label: "Solicitudes de pañol",
    roles: CON_COMPRAS,
    sujeto: ["solicitud", "solicitudes", "vale", "vales"],
    ruta: "/solicitudes-panol",
    rutaLabel: "Abrir Solicitudes",
    async correr({ periodo, terminos }) {
      let query = supabase
        .from("panol_solicitudes")
        .select("id,numero,solicita,retira,sector,estado,created_at,obra_texto,obra:produccion_obras(codigo)", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(TOPE_FILAS);
      query = enRango(query, "created_at", periodo);
      query = conTexto(query, ["solicita", "retira", "sector", "obra_texto"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length };
    },
    resumir({ filas, total }, { periodo, terminos }) {
      const filtro = terminos.length ? ` de "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo,
        vacio: `No hay solicitudes${filtro}`,
        encabezado: `Hay ${plural(total, "solicitud", "solicitudes")}${filtro}${cuando(periodo)}.`,
        linea: (r) => [`N° ${r.numero ?? "—"}`, r.obra?.codigo || r.obra_texto, r.retira ? `retiró ${r.retira}` : "", fmtFecha(r.created_at)].filter(Boolean).join(" · "),
      });
    },
  },

  {
    id: "stock_material",
    label: "Stock de un producto",
    roles: GESTION_PANOL,
    sujeto: ["stock", "existencia", "existencias", "saldo", "saldos", "disponible", "disponibles", "unidades", "queda", "quedan"],
    ruta: "/stock-panol?tab=maestro",
    rutaLabel: "Abrir Stock maestro",
    async correr({ terminos }) {
      if (!terminos.length) return { productos: [], sinProducto: true };
      const columnas = ["descripcion", "alias", "codigo", "codigo_barra"];
      const buscar = (afinar) => afinar(
        supabase.from("panol_materiales")
          .select("id,descripcion,unidad_medida,ubicacion,ubicacion_obs")
          .neq("activo", false),
        columnas, terminos,
      ).limit(TOPE_MUESTRA);

      // Primero exigiendo todas las palabras, que es lo que da el producto
      // justo. Si no hay ninguno, se afloja y se muestran los parecidos: es
      // más útil que un "no encontré nada" cuando el nombre no es exacto.
      let { data: materiales, error } = await buscar(conTexto);
      if (error) throw error;
      if (!materiales?.length) {
        ({ data: materiales, error } = await buscar(conTextoFlojo));
        if (error) throw error;
      }
      if (!materiales?.length) return { productos: [] };

      // El stock no se guarda: se suma del ledger con la lógica canónica de
      // panolMovimientos, la misma que usa la pantalla. Si se copiara acá, un
      // día el asistente diría un número y la pantalla otro.
      //
      // Lo "en camino" queda afuera: `rowIsTransit` se apoya en una marca que
      // arma panolApi al vuelo y no es una columna, así que acá siempre daría
      // cero. Mejor no nombrarlo que decir "0 en camino" y que se lea como que
      // no viene nada.
      const { rowDelta } = await import("@/features/panol/panolMovimientos");
      const ids = materiales.map((m) => m.id);
      const { data: ledger, error: errorLedger } = await supabase
        .from("panol_obra_materiales_snapshot")
        .select("material_id,requisito_material_id,estado,recepcion_estado,cantidad,cantidad_egresada,source,stock_sede")
        .in("estado", ["en_panol", "recibido", "parcial", "problema"])
        .or(`material_id.in.(${ids.join(",")}),requisito_material_id.in.(${ids.join(",")})`)
        .limit(5000);
      if (errorLedger) throw errorLedger;

      const productos = materiales.map((material) => {
        const filas = (ledger || []).filter((r) => r.material_id === material.id || r.requisito_material_id === material.id);
        const total = filas.reduce((suma, fila) => suma + rowDelta(fila), 0);
        return {
          descripcion: material.descripcion,
          unidad: material.unidad_medida || "unidad",
          ubicacion: material.ubicacion_obs || material.ubicacion || "",
          total: Math.round(total * 1000) / 1000,
        };
      }).sort((a, b) => b.total - a.total);
      return { productos };
    },
    resumir({ productos, sinProducto }, { terminos }) {
      if (sinProducto) return "Decime de qué producto querés saber el stock. Por ejemplo: \"cuánto stock hay de masilla epoxi\".";
      if (!productos.length) return `No encontré ningún producto que coincida con "${terminos.join(" ")}".`;
      // "9 unidad" se lee mal. El resto de las unidades del catálogo -metro,
      // litro, kg- ya vienen abreviadas o no se pluralizan, así que alcanza con
      // esta.
      const conUnidad = (cantidad, unidad) => `${cantidad} ${unidad === "unidad" && cantidad !== 1 ? "unidades" : unidad}`;
      const linea = (p) => {
        const donde = p.ubicacion ? ` Ubicación ${p.ubicacion}.` : "";
        if (p.total < -0.0001) return `${p.descripcion}: saldo ${conUnidad(p.total, p.unidad)}, hay que reconciliarlo.`;
        if (p.total <= 0.0001) return `${p.descripcion}: sin stock.`;
        return `${p.descripcion}: ${conUnidad(p.total, p.unidad)}.${donde}`;
      };
      if (productos.length === 1) return linea(productos[0]);
      return [
        `Hay ${productos.length} productos que coinciden con "${terminos.join(" ")}":`,
        ...productos.map((p) => `· ${linea(p)}`),
      ].join("\n");
    },
  },

  {
    id: "movimientos",
    label: "Movimientos del pañol",
    roles: GESTION_PANOL,
    sujeto: ["movimiento", "movimientos", "egreso", "egresos", "ingreso", "ingresos", "entrega", "entregas", "retiro", "retiros", "kardex"],
    ruta: "/stock-panol?tab=movimientos",
    rutaLabel: "Abrir Movimientos",
    async correr({ periodo, terminos, pregunta }) {
      const texto = normalize(pregunta);
      const soloEgresos = /(egreso|egresos|entrega|entregas|retiro|retiros|salio|salieron|saco|sacaron)/.test(texto);
      const soloIngresos = /(ingreso|ingresos|entro|entraron|recibio|recibieron|llego|llegaron)/.test(texto);
      const esEgreso = soloEgresos && !soloIngresos;
      let query = supabase
        .from("panol_obra_materiales_snapshot")
        .select("id,descripcion,estado,cantidad,cantidad_egresada,source,created_at,egreso_at,retirado_por,sector_destino", { count: "exact" })
        .order(esEgreso ? "egreso_at" : "created_at", { ascending: false })
        .limit(TOPE_FILAS);
      if (esEgreso) query = query.eq("estado", "egresado");
      else if (soloIngresos && !soloEgresos) query = query.in("estado", ["en_panol", "recibido"]);
      // Un egreso pasó cuando se entregó, no cuando se creó la fila: la de la
      // matriz puede ser de meses antes.
      query = enRango(query, esEgreso ? "egreso_at" : "created_at", periodo);
      query = conTexto(query, ["descripcion", "retirado_por"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length, soloEgresos, soloIngresos };
    },
    resumir({ filas, total, soloEgresos, soloIngresos }, { periodo, terminos }) {
      const que = soloEgresos && !soloIngresos ? "egresos" : soloIngresos && !soloEgresos ? "ingresos" : "movimientos";
      const filtro = terminos.length ? ` de "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo,
        vacio: `No hay ${que}${filtro}`,
        encabezado: `Hay ${total} ${que}${filtro}${cuando(periodo)}.`,
        linea: (r) => [r.descripcion, r.retirado_por, r.sector_destino, fmtFecha(r.egreso_at || r.created_at)].filter(Boolean).join(" · "),
      });
    },
  },

  {
    id: "obras",
    label: "Obras en producción",
    roles: ["admin", "oficina", "tecnica"],
    sujeto: ["obra", "obras", "barco", "barcos", "casco", "cascos"],
    ruta: "/obras",
    rutaLabel: "Abrir Obras",
    estados: { activa: ["activa", "activas", "produccion", "curso"], terminada: ["terminada", "terminadas", "entregada", "entregadas", "finalizada"] },
    async correr({ terminos, estado }) {
      let query = supabase
        .from("produccion_obras")
        .select("id,codigo,descripcion,estado,linea_nombre,propietario", { count: "exact" })
        .eq("solo_stock", false)
        .order("codigo")
        .limit(TOPE_FILAS);
      if (estado) query = query.eq("estado", estado);
      query = conTexto(query, ["codigo", "descripcion", "linea_nombre", "propietario"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length };
    },
    resumir({ filas, total }, { estado, terminos }) {
      const conEstado = estado ? ` ${estado}s` : "";
      const filtro = terminos.length ? ` que coincidan con "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo: null,
        vacio: `No hay obras${conEstado}${filtro}`,
        encabezado: `Hay ${plural(total, "obra", "obras")}${conEstado}${filtro}.`,
        linea: (r) => [r.codigo, r.linea_nombre, r.estado].filter(Boolean).join(" · "),
      });
    },
  },

  {
    id: "logistica",
    label: "Movimientos de logística",
    roles: ["admin", "tecnica", "administracion", "compras"],
    sujeto: ["flete", "fletes", "traslado", "traslados", "camion", "camiones", "grua", "gruas", "hidrogrua", "logistica", "transporte", "transportes"],
    ruta: "/calendario",
    rutaLabel: "Abrir Logística",
    async correr({ periodo, terminos }) {
      let query = supabase
        .from("calendario_eventos")
        .select("id,titulo,obra,tipo,fecha,estado,proveedor_logistico", { count: "exact" })
        .order("fecha", { ascending: false })
        .limit(TOPE_FILAS);
      if (periodo) {
        query = query
          .gte("fecha", periodo.desde.toISOString().slice(0, 10))
          .lt("fecha", periodo.hasta.toISOString().slice(0, 10));
      }
      query = conTexto(query, ["titulo", "obra", "proveedor_logistico"], terminos);
      const { data, error, count } = await query;
      if (error) throw error;
      return { filas: data || [], total: count ?? (data || []).length };
    },
    resumir({ filas, total }, { periodo, terminos }) {
      const filtro = terminos.length ? ` de "${terminos.join(" ")}"` : "";
      return resumenLista({
        total, filas, periodo,
        vacio: `No hay movimientos de logística${filtro}`,
        encabezado: `Hay ${plural(total, "movimiento", "movimientos")} de logística${filtro}${cuando(periodo)}.`,
        linea: (r) => [r.titulo, r.obra, r.proveedor_logistico, fmtFecha(r.fecha)].filter(Boolean).join(" · "),
      });
    },
  },
];

/**
 * Qué consulta corresponde para esta pregunta y este perfil.
 *
 * La lógica vive en `assistantRouter`, que no toca la base y por eso se puede
 * probar sola; acá sólo se le pasa el catálogo.
 */
export function elegirHerramienta(pregunta, profile, ahora = new Date()) {
  return elegirEntre(HERRAMIENTAS, pregunta, profile, ahora);
}

/**
 * Corre la consulta y arma la respuesta.
 *
 * El texto lo escribe `resumir`, no un modelo: los números salen de la base y
 * llegan al usuario sin pasar por nada que pueda redondearlos ni inventarlos.
 */
export async function responderConHerramienta(eleccion) {
  const { herramienta, parametros } = eleccion;
  const datos = await herramienta.correr(parametros);
  return {
    answer: herramienta.resumir(datos, parametros),
    model: `klasea/${herramienta.id}`,
    links: [{ label: herramienta.rutaLabel, path: herramienta.ruta }],
  };
}
