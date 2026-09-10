import {
  BookOpenText, Boxes, Building2, CalendarDays, ClipboardList, Cog, FileText, LayoutGrid,
  LifeBuoy, PackageSearch, Scale, ScanLine, Ship, ShoppingCart, Tags, Truck, UsersRound, Wallet, Wrench,
} from "lucide-react";
import { normalize, scoreFields, tokenize } from "./searchText";

/**
 * El mapa del sistema, para poder buscarlo.
 *
 * El buscador global sabía encontrar una obra, un producto o una persona, pero
 * no sabía encontrar una PANTALLA: escribir "remito" no devolvía nada, porque
 * no hay ninguna tabla donde diga "remito". La palabra está en el menú, no en
 * los datos, y el menú no se buscaba.
 *
 * Acá está cada lugar al que se puede entrar, con las palabras con las que la
 * gente lo nombra -que casi nunca son las del cartel-. "Kardex" es Movimientos,
 * "vale" es una solicitud, "factura" es Carga de precios. Sin esa lista de
 * sinónimos el buscador sólo sirve si uno ya sabe cómo se llama lo que busca,
 * que es justo cuando no hace falta buscar.
 *
 * `roles` copia el `allow` de la ruta en App.jsx: si una sección no se puede
 * abrir, tampoco se ofrece. Mostrar una puerta cerrada es peor que no mostrarla.
 */

const TODOS = null; // sin restricción de rol

const GESTION = ["admin", "oficina", "tecnica"];
const PANOL = ["admin", "oficina", "tecnica", "panol"];
const PANOL_COMPRAS = ["admin", "oficina", "tecnica", "panol", "compras"];
const CATALOGO = ["admin", "tecnica", "compras", "panol"];
const CATALOGO_GESTION = ["admin", "oficina", "tecnica", "compras"];
const PRECIOS = ["admin", "oficina", "tecnica", "compras", "administracion"];
const RRHH = ["admin", "rrhh", "tecnica", "oficina", "administracion"];

export const NAV_SECTIONS = [
  // ── Pañol: ingreso ──────────────────────────────────────────────────────────
  {
    id: "panol-inicio", label: "Panel de pañol", modulo: "Pañol", path: "/inicio-panol", Icon: LayoutGrid,
    hint: "Pendientes del día, equipos y próximas recepciones.",
    keywords: "inicio home tablero panel panol resumen pendientes",
    roles: PANOL,
  },
  {
    id: "panol-recepcion", label: "Recepcionar", modulo: "Pañol", path: "/recepcion-panol?tab=recepcion", Icon: PackageSearch,
    hint: "Lo que Compras mandó a recibir en tu sede.",
    keywords: "recepcion recibir recepcionar llego llegada entrega envio pedido pendiente",
    roles: PANOL,
  },
  {
    id: "panol-scanner", label: "Escanear remitos", modulo: "Pañol", path: "/recepcion-panol?tab=scanner", Icon: ScanLine,
    hint: "Digitalizar el remito por USB y que la IA lo lea.",
    keywords: "remito remitos escanear escaner scanner digitalizar papel comprobante ia lectura usb",
    roles: PANOL,
  },
  {
    id: "panol-remitos", label: "Archivo de remitos", modulo: "Pañol", path: "/recepcion-panol?tab=remitos", Icon: FileText,
    hint: "Todos los remitos escaneados, por barco, proveedor y carpeta.",
    keywords: "remito remitos archivo carpeta comprobantes papeles historial que vino",
    roles: PANOL,
  },
  {
    id: "panol-ingresar", label: "Ingreso directo", modulo: "Pañol", path: "/recepcion-panol?tab=ingresar", Icon: Boxes,
    hint: "Cargar mercadería a mano, con remito o desde un borrador.",
    keywords: "ingreso ingresar entrada alta cargar mercaderia stock sumar recibir",
    roles: PANOL,
  },
  {
    id: "panol-consumibles", label: "Consumibles", modulo: "Pañol", path: "/recepcion-panol?tab=consumibles", Icon: Boxes,
    hint: "Ingresos, egresos por peso y movimientos de consumibles.",
    keywords: "consumible consumibles lija guantes masilla cinta descartable peso balanza",
    roles: PANOL,
  },
  {
    id: "panol-crear", label: "Crear producto", modulo: "Pañol", path: "/recepcion-panol?tab=crear", Icon: Tags,
    hint: "Dar de alta una ficha nueva en el catálogo.",
    keywords: "crear alta nuevo producto ficha material articulo catalogo",
    roles: PANOL,
  },
  {
    id: "panol-egresos", label: "Egresar materiales", modulo: "Pañol", path: "/egresos-panol", Icon: PackageSearch,
    hint: "Entregar material a una persona o a una obra.",
    keywords: "egreso egresar salida entregar entrega retiro sacar dar descontar",
    roles: PANOL,
  },
  {
    id: "panol-solicitudes", label: "Solicitudes de pañol", modulo: "Pañol", path: "/solicitudes-panol", Icon: ClipboardList,
    hint: "El papel de pedido digitalizado: armarlo, imprimirlo y firmarlo con NFC.",
    keywords: "solicitud solicitudes pedido papel vale planilla firma nfc retiro imprimir",
    roles: PANOL_COMPRAS,
  },
  {
    id: "panol-caja", label: "Caja de consumibles", modulo: "Pañol", path: "/consumibles-caja", Icon: Wallet,
    hint: "Tarjeta o nombre, se escanean los productos y salen del stock.",
    keywords: "caja consumibles autoservicio tarjeta nfc escanear salida rapida",
    roles: ["admin", "panol", "oficina", "tecnica", "compras"],
  },
  {
    id: "panol-egreso-pantalla", label: "Pantalla de egreso", modulo: "Pañol", path: "/pantalla-egreso", Icon: ScanLine,
    hint: "La pantalla grande del mostrador para entregar.",
    keywords: "pantalla egreso mostrador kiosco display entrega",
    roles: PANOL,
  },
  {
    id: "panol-tarjetas", label: "Tarjetas NFC", modulo: "Pañol", path: "/inicio-panol/tarjetas", Icon: Tags,
    hint: "Asignar y revisar las tarjetas del personal.",
    keywords: "nfc tarjeta tarjetas credencial chip acreditacion",
    roles: PANOL,
  },

  // ── Pañol: consulta ─────────────────────────────────────────────────────────
  {
    id: "stock-maestro", label: "Stock maestro", modulo: "Pañol", path: "/stock-panol?tab=maestro", Icon: Boxes,
    hint: "Existencias reales, ubicación y detalle por producto.",
    keywords: "stock existencia inventario saldo cantidad cuanto queda maestro deposito",
    roles: PANOL,
  },
  {
    id: "stock-obra", label: "Stock por obra", modulo: "Pañol", path: "/stock-panol?tab=obra", Icon: Ship,
    hint: "Qué hay guardado para cada barco.",
    keywords: "stock obra barco casco asignado guardado reservado",
    roles: PANOL,
  },
  {
    id: "stock-movimientos", label: "Movimientos", modulo: "Pañol", path: "/stock-panol?tab=movimientos", Icon: PackageSearch,
    hint: "Kardex de ingresos, asignaciones y egresos.",
    keywords: "movimiento movimientos kardex historial ingresos egresos trazabilidad quien saco",
    roles: PANOL,
  },
  {
    id: "stock-mapa", label: "Mapa del pañol", modulo: "Pañol", path: "/stock-panol?tab=mapa", Icon: LayoutGrid,
    hint: "Plano de estanterías y dónde está ubicado cada producto.",
    keywords: "mapa plano estanteria estante ubicacion donde esta rack posicion",
    roles: PANOL,
  },
  {
    id: "stock-reconciliar", label: "A reconciliar", modulo: "Pañol", path: "/stock-panol?tab=reconciliar", Icon: Scale,
    hint: "Lo que da negativo o no cierra contra el catálogo.",
    keywords: "reconciliar reconciliacion negativo diferencia descuadre ajuste sin ficha error",
    roles: PANOL,
  },
  {
    id: "catalogo-maestro", label: "Catálogo maestro", modulo: "Catálogo", path: "/catalogo-maestro", Icon: BookOpenText,
    hint: "La ficha de cada producto: alias, códigos y a qué stock apunta.",
    keywords: "catalogo maestro ficha producto articulo codigo barra alias identidad duplicado",
    roles: CATALOGO,
  },
  {
    id: "materiales", label: "Listas de compras", modulo: "Catálogo", path: "/materiales", Icon: ClipboardList,
    hint: "Matriz por línea y lista de materiales de cada obra.",
    keywords: "materiales matriz lista listas requisito plantilla receta linea obra compras",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-planillas", label: "Planillas por obra", modulo: "Catálogo", path: "/materiales?tab=planillas", Icon: ClipboardList,
    hint: "La planilla de materiales de cada barco.",
    keywords: "planilla planillas obra barco excel grilla materiales",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-condicionantes", label: "Condicionantes", modulo: "Catálogo", path: "/materiales?tab=condicionantes", Icon: Cog,
    hint: "Las reglas que agregan o sacan material según el equipamiento.",
    keywords: "condicionante condicionantes regla opcional equipamiento fly starlink depende variante",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-variantes", label: "Requisitos y productos", modulo: "Catálogo", path: "/materiales?tab=variantes", Icon: Tags,
    hint: "Qué producto concreto cumple cada requisito genérico.",
    keywords: "requisito requisitos producto variante marca equivalente generico asignar",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-proveedores", label: "Proveedores", modulo: "Catálogo", path: "/materiales?tab=proveedores", Icon: Building2,
    hint: "Alta y datos de los proveedores del astillero.",
    keywords: "proveedor proveedores cuit contacto empresa razon social alta",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-comprobantes", label: "Comprobantes", modulo: "Catálogo", path: "/materiales?tab=comprobantes", Icon: FileText,
    hint: "Remitos y facturas cargados contra el catálogo.",
    keywords: "comprobante comprobantes remito factura papel adjunto",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-importar", label: "Importar materiales", modulo: "Catálogo", path: "/materiales?tab=importar", Icon: FileText,
    hint: "Subir un Excel y revisar qué entra al catálogo.",
    keywords: "importar excel csv planilla subir carga masiva batch",
    roles: CATALOGO_GESTION,
  },
  {
    id: "materiales-lector", label: "Lector", modulo: "Catálogo", path: "/materiales?tab=lector", Icon: ScanLine,
    hint: "Leer un documento con IA y volcarlo al catálogo.",
    keywords: "lector leer ia ocr documento pdf reconocer",
    roles: CATALOGO_GESTION,
  },

  // ── Compras ────────────────────────────────────────────────────────────────
  {
    id: "compras", label: "Gestión de compras", modulo: "Compras", path: "/compras", Icon: ShoppingCart,
    hint: "Pedidos internos, seguimiento y usuarios en copia.",
    keywords: "compra compras pedido pedidos solicitud comprar orden requerimiento",
    roles: PANOL_COMPRAS,
  },
  {
    id: "compras-comprar", label: "Qué comprar", modulo: "Compras", path: "/compras?tab=comprar", Icon: ShoppingCart,
    hint: "Lo que hay que salir a comprar, ordenado por urgencia.",
    keywords: "que comprar urgente faltante reponer prioridad lista de compra",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-planilla", label: "Planilla por obra", modulo: "Compras", path: "/compras?tab=planilla", Icon: ClipboardList,
    hint: "Los materiales de cada barco vistos como planilla.",
    keywords: "planilla obra barco grilla materiales compras",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-faltantes", label: "Faltantes", modulo: "Compras", path: "/compras?tab=faltantes", Icon: PackageSearch,
    hint: "Lo que pañol reportó que falta.",
    keywords: "faltante faltantes falta pendiente reponer quiebre",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-avisos", label: "Avisos de compras", modulo: "Compras", path: "/compras?tab=avisos", Icon: ClipboardList,
    hint: "Mensajes internos que compras tiene que resolver.",
    keywords: "aviso avisos mensaje reclamo interno consulta",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-caja", label: "Caja chica", modulo: "Compras", path: "/compras?tab=caja", Icon: Wallet,
    hint: "Gastos menores y rendiciones.",
    keywords: "caja chica gasto gastos efectivo rendicion vuelto ticket",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-ruta", label: "Hoja de ruta", modulo: "Compras", path: "/compras?tab=ruta", Icon: Truck,
    hint: "Lo que el cadete tiene que retirar hoy.",
    keywords: "hoja de ruta cadete retirar recorrido moto reparto",
    roles: ["admin", "compras"],
  },
  {
    id: "compras-etapa", label: "Compras por etapa", modulo: "Compras", path: "/compras-etapa", Icon: ShoppingCart,
    hint: "Las tandas de compra de cada obra y los pedidos que salen de ahí.",
    keywords: "etapa etapas tanda compra cronograma anticipacion obra",
    roles: CATALOGO_GESTION,
  },
  {
    id: "cadete", label: "Ruta del cadete", modulo: "Compras", path: "/cadete", Icon: Truck,
    hint: "El recorrido del día con lo que hay que buscar en cada proveedor.",
    keywords: "cadete ruta retiro moto recorrido buscar proveedor reparto",
    roles: ["admin", "oficina", "tecnica", "compras", "cadete"],
  },
  {
    id: "semaforo", label: "Semáforo", modulo: "Compras", path: "/semaforo", Icon: LayoutGrid,
    hint: "Estado visual de avance de compras por obra.",
    keywords: "semaforo tablero avance verde rojo estado obras riesgo",
    roles: ["admin", "compras"],
  },
  {
    id: "scan-pedido", label: "Pedir reposición", modulo: "Compras", path: "/scan-pedido", Icon: ScanLine,
    hint: "Escanear lo que se acabó y avisarle a compras.",
    keywords: "reposicion reponer pedir escanear colector aviso falta",
    roles: PANOL,
  },

  // ── Precios ────────────────────────────────────────────────────────────────
  {
    id: "costo-barco", label: "Costo del barco", modulo: "Precios", path: "/costo-barco", Icon: Wallet,
    hint: "Cuánto sale el material de cada modelo y qué falta cotizar.",
    keywords: "costo costos precio total barco modelo cotizar cobertura presupuesto plata",
    roles: PRECIOS,
  },
  {
    id: "precios", label: "Carga de precios", modulo: "Precios", path: "/precios", Icon: FileText,
    hint: "Remitos y facturas leídos con IA, lista editable e historial.",
    keywords: "precio precios factura remito cargar actualizar lista historial aumento ia",
    roles: PRECIOS,
  },

  // ── Producción ─────────────────────────────────────────────────────────────
  {
    id: "obras", label: "Obras", modulo: "Producción", path: "/obras", Icon: Ship,
    hint: "Tareas y avance de cada casco en producción.",
    keywords: "obra obras barco barcos casco produccion avance tarea tareas etapa proyecto",
    roles: GESTION,
  },
  {
    id: "memorias", label: "Memorias", modulo: "Producción", path: "/memorias", Icon: BookOpenText,
    hint: "Memoria descriptiva de cada barco, en formato planilla.",
    keywords: "memoria memorias descriptiva especificacion equipamiento reunion ficha barco",
    roles: GESTION,
  },
  {
    id: "marmoleria", label: "Marmolería", modulo: "Producción", path: "/marmoleria", Icon: Wrench,
    hint: "Stock y cortes de Dekton para mesadas y baños.",
    keywords: "marmoleria marmol dekton mesada mesadas bacha corte piedra cuarzo",
    roles: GESTION,
  },
  {
    id: "muebles", label: "Muebles", modulo: "Producción", path: "/muebles", Icon: Wrench,
    hint: "Despiece, enchapado y armado del mobiliario.",
    keywords: "mueble muebles carpinteria enchapado despiece herraje oberti morph ot",
    roles: ["admin", "oficina", "tecnica", "muebles", "compras"],
  },
  {
    id: "torneria", label: "Tornería", modulo: "Mecánica", path: "/torneria", Icon: Wrench,
    hint: "Material de Mecánica que sale a Tornería o Plegadora y vuelve.",
    keywords: "torneria tornero plegadora mecanica mecanizado pieza inox acero envio taller",
    roles: ["admin", "oficina", "tecnica", "mecanica", "compras"],
  },
  {
    id: "calendario-produccion", label: "Calendario de producción", modulo: "Producción", path: "/calendario-produccion", Icon: CalendarDays,
    hint: "Desmoldes, botadas y fechas de cada obra.",
    keywords: "calendario produccion fecha fechas desmolde botada cronograma agenda plan",
    roles: ["admin", "tecnica"],
  },
  {
    id: "pedidos", label: "Pedidos de producción", modulo: "Producción", path: "/pedidos", Icon: ClipboardList,
    hint: "Pedidos internos entre sectores de producción.",
    keywords: "pedido pedidos produccion interno sector",
    roles: GESTION,
  },

  // ── Laminación ─────────────────────────────────────────────────────────────
  {
    id: "laminacion-pampa", label: "Laminación Pampa", modulo: "Laminación", path: "/laminacion", Icon: Boxes,
    hint: "Stock, pedidos y consumo del galpón de Pampa.",
    keywords: "laminacion pampa galpon resina fibra gelcoat stock consumo",
    roles: ["admin", "oficina", "tecnica", "panol", "laminacion"],
    sede: "Pampa",
  },
  {
    id: "laminacion-chubut", label: "Laminación Chubut", modulo: "Laminación", path: "/laminacion-chubut", Icon: Boxes,
    hint: "Stock, pedidos y consumo del galpón de Chubut.",
    keywords: "laminacion chubut galpon resina fibra gelcoat stock consumo",
    roles: ["admin", "oficina", "tecnica", "panol", "laminacion"],
    sede: "Chubut",
  },
  {
    id: "obras-laminacion", label: "Laminación por obra", modulo: "Laminación", path: "/obras-laminacion", Icon: Ship,
    hint: "Material de laminación imputado a cada casco.",
    keywords: "laminacion obra casco imputado consumo pieza",
    roles: GESTION,
  },
  {
    id: "laminacion-plantillas", label: "Plantillas de laminación", modulo: "Laminación", path: "/laminacion/plantillas", Icon: ClipboardList,
    hint: "La receta base de material por línea.",
    keywords: "plantilla plantillas receta base linea laminacion estandar",
    roles: ["admin", "tecnica"],
  },

  // ── Inventario ─────────────────────────────────────────────────────────────
  {
    id: "maderas", label: "Maderas", modulo: "Inventario", path: "/madera", Icon: Boxes,
    hint: "Stock, ingresos, egresos y pedidos de madera.",
    keywords: "madera maderas placa placas fenolico mdf terciado tabla stock",
    roles: PANOL,
  },
  {
    id: "maderas-movimientos", label: "Movimientos de maderas", modulo: "Inventario", path: "/madera?tab=Movimientos", Icon: PackageSearch,
    hint: "Historial de entradas y salidas de madera.",
    keywords: "movimiento movimientos madera historial kardex placa",
    roles: PANOL,
  },
  {
    id: "scan", label: "Escáner de egreso", modulo: "Inventario", path: "/scan", Icon: ScanLine,
    hint: "Sacar madera del stock leyendo la etiqueta.",
    keywords: "escaner scanner qr codigo egreso madera pistola lector colector",
    roles: PANOL,
  },
  {
    id: "colector", label: "Colector", modulo: "Inventario", path: "/colector", Icon: ScanLine,
    hint: "El arranque del colector: egresar o pedir reposición.",
    keywords: "colector pda handheld terminal escaner inicio",
    roles: PANOL,
  },
  {
    id: "etiquetas", label: "Etiquetas QR", modulo: "Inventario", path: "/etiquetas", Icon: Tags,
    hint: "Imprimir etiquetas de producto y de estantería.",
    keywords: "etiqueta etiquetas qr codigo imprimir impresora rotulo",
    roles: GESTION,
  },
  {
    id: "balanza", label: "Balanza", modulo: "Inventario", path: "/balanza", Icon: Scale,
    hint: "Diagnóstico del puerto serie de la balanza.",
    keywords: "balanza peso pesar serie puerto diagnostico gramos",
    roles: PANOL,
  },
  {
    id: "balanza-calibrar", label: "Calibrar pesos", modulo: "Inventario", path: "/balanza/calibrar", Icon: Scale,
    hint: "Fijar el peso unitario de los consumibles que se cuentan pesando.",
    keywords: "calibrar calibracion peso unitario gramos muestra consumible balanza",
    roles: PANOL,
  },

  // ── Logística ──────────────────────────────────────────────────────────────
  {
    id: "logistica", label: "Logística", modulo: "Logística", path: "/calendario", Icon: Truck,
    hint: "Fletes, grúas y transportes: solicitud, agenda y costo.",
    keywords: "logistica flete fletes camion grua hidrogrua transporte traslado viaje agenda",
    roles: ["admin", "tecnica", "administracion", "compras"],
  },

  // ── Post venta ─────────────────────────────────────────────────────────────
  {
    id: "postventa", label: "Barcos entregados", modulo: "Post Venta", path: "/postventa", Icon: LifeBuoy,
    hint: "Garantías, servicios y flota de clientes.",
    keywords: "postventa post venta garantia servicio cliente entregado flota amarra reclamo",
    roles: GESTION,
  },

  // ── RRHH ───────────────────────────────────────────────────────────────────
  {
    id: "rrhh-presentismo", label: "Presentismo", modulo: "RRHH", path: "/rrhh?tab=presentismo", Icon: UsersRound,
    hint: "Asistencia diaria del fichero.",
    keywords: "presentismo asistencia ficha fichero hikvision falta llegada tarde marcacion",
    roles: RRHH,
  },
  {
    id: "rrhh-extras", label: "Horas extras", modulo: "RRHH", path: "/rrhh?tab=extras", Icon: UsersRound,
    hint: "Horas extras del período y su liquidación.",
    keywords: "hora horas extra extras liquidacion sabado feriado recargo",
    roles: RRHH,
  },
  {
    id: "rrhh-empleados", label: "Empleados", modulo: "RRHH", path: "/rrhh?tab=empleados", Icon: UsersRound,
    hint: "Legajo, DNI, sede y grupo de cada persona.",
    keywords: "empleado empleados persona personal legajo dni alta baja contratista gente",
    roles: RRHH,
  },
  {
    id: "rrhh-oficios", label: "Oficios y obras", modulo: "RRHH", path: "/rrhh?tab=oficios", Icon: UsersRound,
    hint: "Qué hace cada uno y en qué barco está.",
    keywords: "oficio oficios obra asignacion cuadrilla quien trabaja",
    roles: RRHH,
  },

  // ── Sistema y ayuda ────────────────────────────────────────────────────────
  {
    id: "procedimientos", label: "Procedimientos", modulo: "Instrucciones", path: "/procedimientos", Icon: BookOpenText,
    hint: "Manuales, normativas y protocolos del astillero.",
    keywords: "procedimiento procedimientos manual instructivo norma protocolo paso",
    roles: ["admin", "oficina", "tecnica", "laminacion", "muebles", "mecanica", "electricidad"],
  },
  {
    id: "tickets", label: "Tickets", modulo: "Ayuda", path: "/tickets", Icon: LifeBuoy,
    hint: "Pedir una mejora, avisar un problema y seguir en qué anda.",
    keywords: "ticket tickets soporte ayuda bug error problema mejora sugerencia reclamo sistema",
    roles: TODOS,
  },
  {
    id: "configuracion", label: "Configuración", modulo: "Sistema", path: "/configuracion", Icon: Cog,
    hint: "Usuarios, permisos, clientes, modelos y ajustes globales.",
    keywords: "configuracion config ajuste ajustes usuario usuarios permiso permisos clave modelo admin",
    roles: ["admin"],
  },
  {
    id: "admin", label: "Panel de administración", modulo: "Sistema", path: "/admin", Icon: LayoutGrid,
    hint: "Vista general del astillero.",
    keywords: "admin administracion panel dashboard tablero general kpi",
    roles: GESTION,
  },
];

/** Pesos de cada campo: el nombre manda, los sinónimos acompañan. */
const SECTION_FIELDS = { label: 1, keywords: 0.62, modulo: 0.5, hint: 0.34 };

function canonicalSede(value) {
  const sede = normalize(value);
  if (sede.startsWith("pampa")) return "Pampa";
  if (sede.startsWith("chubut")) return "Chubut";
  return null;
}

/** Las secciones que este perfil puede abrir de verdad. */
export function seccionesVisibles(profile) {
  if (!profile) return [];
  const admin = !!profile.is_admin;
  const role = profile.role || "";
  const sede = canonicalSede(profile.sede);
  return NAV_SECTIONS.filter((seccion) => {
    if (!admin && seccion.roles && !seccion.roles.includes(role)) return false;
    // El galpón del que uno es: la ruta del otro redirige, así que ofrecerla
    // sería mandarlo a un lugar del que lo van a rebotar.
    if (!admin && seccion.sede && sede && sede !== seccion.sede) return false;
    return true;
  });
}

/**
 * Busca pantallas. Es local: no toca la red, así que responde mientras se
 * escribe y nunca es la que hace esperar al resto de los resultados.
 */
export function searchSecciones(rawQuery, profile, limit = 6) {
  const tokens = tokenize(rawQuery);
  if (!tokens.length) return [];
  const puntuadas = seccionesVisibles(profile)
    .map((seccion) => ({ seccion, score: scoreFields(seccion, SECTION_FIELDS, tokens, rawQuery) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.seccion.label.localeCompare(b.seccion.label, "es"));
  if (!puntuadas.length) return [];
  // Las secciones salen arriba de todo, así que el piso es más alto que el del
  // resto: una pantalla que apenas roza la consulta empuja para abajo al
  // resultado que la persona vino a buscar.
  const piso = puntuadas[0].score * 0.3;
  return puntuadas
    .filter(({ score }) => score >= piso)
    .slice(0, limit)
    .map(({ seccion }) => ({
      id: seccion.id,
      type: "seccion",
      title: seccion.label,
      subtitle: seccion.hint,
      meta: seccion.modulo,
      path: seccion.path,
      Icon: seccion.Icon,
    }));
}
