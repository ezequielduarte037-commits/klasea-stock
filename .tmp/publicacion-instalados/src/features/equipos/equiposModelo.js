// Motores y grupos electrógenos: lógica pura de la vista previa.
//
// Cada equipo (motor o grupo) tiene un estado:
//   comprado   el proveedor lo tiene preparado y falta registrar el retiro
//   pedido     pendiente de recepción (en el Excel: la celda del número en amarillo)
//   en_galpon  llegó y no tiene barco
//   asignado   llegó y está reservado para un barco, todavía sin instalar
//   instalado  está puesto en un barco en producción
//   entregado  el barco ya se entregó
// Los grupos cambian mucho de barco ("se pasa a…"): esos cambios quedan como
// movimientos (desde → hacia).
//
// El Excel no sabe qué barcos se entregaron después de anotarlos; la base sí
// (produccion_obras.estado). Y la memoria de cada barco dice qué motor y qué
// grupo lleva aunque todavía no haya número de serie: con eso se ve el hueco de
// Mercury y Volvo. aplicarBase() cruza las tres cosas.

import { GRUPOS_SEED, MOTORES_SEED } from "./equiposSeed";

// Cada estado dice dónde está el equipo: así no se confunden "pedido" (la orden
// al proveedor) con "comprado" (ya está, en el proveedor, falta retirarlo), ni
// el que está libre en el galpón con el que está ahí pero asignado a un barco.
export const ESTADOS = {
  comprado: { label: "En proveedor", tono: "violeta" },
  pedido: { label: "Pedido", tono: "violeta" },
  en_galpon: { label: "En galpón · libre", tono: "azul" },
  asignado: { label: "Reservado para barco", tono: "cian" },
  instalado: { label: "Instalado", tono: "verde" },
  entregado: { label: "Entregado", tono: "neutro" },
};

export const MARCAS_MOTOR = ["FPT Iveco", "Volvo Penta", "Mercury"];

export function equiposIniciales() {
  let n = 0;
  const conId = (equipo) => {
    n += 1;
    return { id: `eq-${n}`, ...equipo };
  };
  return {
    motores: MOTORES_SEED.map((equipo) => ({ ...conId(equipo), stock_confirmado: true })),
    grupos: GRUPOS_SEED.map((equipo) => ({ ...conId(equipo), stock_confirmado: true })),
    // La vieja hoja de compras quedó desactualizada. Los pendientes de retiro
    // comienzan vacíos y se crean desde el sistema a partir de ahora.
    comprasGrupos: [],
  };
}

// Cada lugar escribe el barco a su manera: "HUNTER-H-174" en obras, "H174" en
// la memoria, "55-02", "K52-23", "ANTAGO 29"… Todo se lleva a "H174", "55-2",
// "52-23", "A29" para poder cruzar.
export function claveObra(codigo) {
  const texto = String(codigo || "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!texto) return null;
  const antago = texto.match(/^(?:ANTAGO[\s-]*)?A[\s-]*(\d+)$/) || texto.match(/^ANTAGO[\s-]*(\d+)$/);
  if (antago) return `A${Number(antago[1])}`;
  const hunter = texto.match(/^(?:HUNTER[\s-]*)?H[\s-]*(\d+)$/) || texto.match(/^HUNTER[\s-]*(\d+)$/);
  if (hunter) return `H${Number(hunter[1])}`;
  const linea = texto.match(/^K?(\d{2})[\s-]+0*(\d+)$/);
  if (linea) return `${linea[1]}-${Number(linea[2])}`;
  return texto;
}

export function lineaDeCodigo(codigo) {
  if (!codigo) return null;
  if (/^A\d+/i.test(codigo)) return "Antago";
  if (/^H\d+/i.test(codigo)) return "Hunter";
  const m = String(codigo).match(/^(\d{2})-/);
  return m ? `K${m[1]}` : null;
}

function numeroDeCodigo(codigo) {
  const m = String(codigo || "").match(/(\d+)$/);
  return m ? Number(m[1]) : null;
}

// "2 Mercury 270", "Volvo diesel 300", "2xIVECO 450 hp" → la marca.
export function marcaDeTexto(texto) {
  const t = String(texto || "").toLowerCase();
  if (/mercury|mercruiser/.test(t)) return "Mercury";
  if (/volvo/.test(t)) return "Volvo Penta";
  if (/iveco|fpt|ftp|\bnef\b|cursor/.test(t)) return "FPT Iveco";
  return null;
}

// Cuántos motores dice la memoria: "2 Mercury 270", "1xVolvo 440", "2x Iveco".
// Sin número, dos (casi todos los barcos llevan dos).
export function cantidadDeMotores(texto) {
  const m = String(texto || "").trim().match(/^(\d)\s*x?\s*\D/i);
  return m ? Number(m[1]) : 2;
}

export const ordenCodigo = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });

const MESES = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, oct: 9, nov: 10, dic: 11 };

// "Octubre", "19-Oct", "Febrero", "2026-10-26" → la fecha que calza, para
// ordenar y saber si ya pasó. El Excel no dice el año: un mes de hasta seis
// meses atrás es de este año (la recepción está atrasada), uno más lejano es
// del que viene. Antes "Octubre", leído en noviembre, pasaba a octubre del año
// siguiente y el motor atrasado quedaba último. Sin día, vale el fin de mes.
function fechaDeTexto(texto, hoy = new Date()) {
  const iso = String(texto || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return { fecha: new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])), conDia: true };
  const limpio = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const mes = Object.entries(MESES).find(([clave]) => limpio.includes(clave));
  if (!mes) return null;
  const dia = Number(limpio.match(/(\d{1,2})/)?.[1]) || null;
  const armar = (anio) => (dia ? new Date(anio, mes[1], dia) : new Date(anio, mes[1] + 1, 0));
  let fecha = armar(hoy.getFullYear());
  if (fecha < new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1)) fecha = armar(hoy.getFullYear() + 1);
  return { fecha, conDia: Boolean(dia) };
}

export function fechaAproximada(texto, hoy = new Date()) {
  return fechaDeTexto(texto, hoy)?.fecha || null;
}

export function recepcionVencida(texto, hoy = new Date()) {
  const fecha = fechaAproximada(texto, hoy);
  return Boolean(fecha && fecha < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
}

// Para mostrar: "19-Oct" queda como está; "2026-10-26" pasa a "26/10".
export function textoFechaEstimada(texto) {
  const iso = String(texto || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}` : texto || "";
}

export function formatearFecha(iso) {
  if (!iso) return "";
  const [anio, mes, dia] = String(iso).split("-");
  return dia && mes && anio ? `${dia}/${mes}/${anio.slice(2)}` : String(iso);
}

function coincide(equipo, termino) {
  if (!termino) return true;
  return [equipo.numero_serie, equipo.obra, equipo.obra_origen, equipo.obra_detalle, equipo.retiro, equipo.modelo, equipo.marca, equipo.proveedor, equipo.cajas]
    .some((valor) => String(valor || "").toLowerCase().includes(termino));
}

// Cruza el Excel con la base. `base` = { obras: [{codigo, estado}], memorias:
// [{obra_codigo, motorizacion, grupo_electrogeno}] }; sin sesión llega null y
// queda sólo lo del Excel.
//   · Los barcos terminados en la base, y los anteriores al primer barco activo
//     de su línea que no están en la base, ya se entregaron: sus equipos pasan
//     a "entregado".
//   · obrasActivas: los barcos en producción, tengan o no datos de motor.
//   · memoria: qué motor y qué grupo dice la memoria de cada barco.
// Un equipo guardado para un barco no es stock: si quedó "en galpón" con barco
// (pasaba al cargarlo, porque ése es el estado que viene puesto), se lee como
// reservado. Lo mismo hace la base desde la migración
// 20260922120000_equipos_reserva_no_es_stock.sql; acá se corrige lo ya cargado.
function reservaCoherente(equipo) {
  return equipo.obra && equipo.estado === "en_galpon" ? { ...equipo, estado: "asignado" } : equipo;
}

// Lo cargado a mano llega como venga: "FTP Iveco", "MERCURY", "Kholer",
// "18 KvA" sin potencia, o el barco elegido de la lista como "ANTAGO-A-30"
// (que no cruzaba con "A30" y armaba un barco aparte). Se lleva todo a una
// sola forma antes de contar, filtrar o cruzar.
function normalizar(original) {
  const equipo = { ...original, obra: claveObra(original.obra) };
  if (equipo.tipo === "motor") {
    equipo.marca = marcaDeTexto(`${original.marca || ""} ${original.modelo || ""}`) || original.marca || null;
  } else {
    equipo.marca = marcaDeGrupo(`${original.marca || ""} ${original.modelo || ""}`) || (original.marca && original.marca !== "Sin marca" ? original.marca : null);
    if (equipo.potencia == null || equipo.potencia === "") equipo.potencia = kvaDeTexto(original.modelo) ?? kvaSuelto(original.modelo);
  }
  // Al pasar un motor del Excel a la base, la recepción estimada sin año
  // ("26-Oct") queda en las notas: se recupera para no perder la fecha.
  if (!equipo.fecha_estimada) {
    const planilla = String(original.notas || "").match(/Recepción estimada en planilla: ([^\n]+)/);
    if (planilla) equipo.fecha_estimada = planilla[1].trim();
  }
  return reservaCoherente(equipo);
}

// "20.5" sin unidad en la planilla de grupos.
function kvaSuelto(texto) {
  const m = String(texto || "").trim().match(/^(\d+(?:[.,]\d+)?)$/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

const serieNormal = (equipo) => String(equipo.numero_serie || "").replace(/\s/g, "").toUpperCase();
const esDeLaBase = (equipo) => !String(equipo.id || "").startsWith("eq-");

// El mismo número de serie no puede estar dos veces. Pasaba cuando alguien
// cargaba a mano un motor que ya venía del Excel (el 2244529 del 37-43): se
// veían tres motores en el barco. Queda el de la base, completado con lo que
// el Excel sabía (potencia, transmisión, cajas).
function sinSeriesRepetidas(lista) {
  const porSerie = new Map();
  const salida = [];
  for (const equipo of lista) {
    const serie = serieNormal(equipo);
    if (!serie) {
      salida.push(equipo);
      continue;
    }
    const clave = `${equipo.tipo}|${serie}`;
    const previo = porSerie.get(clave);
    if (!previo) {
      porSerie.set(clave, salida.length);
      salida.push(equipo);
      continue;
    }
    const otro = salida[previo];
    const [queda, aporta] = esDeLaBase(equipo) && !esDeLaBase(otro) ? [equipo, otro] : [otro, equipo];
    const completo = { ...queda };
    for (const campo of ["potencia", "transmision", "cajas", "proveedor", "fecha_entrega"]) {
      if (completo[campo] == null || completo[campo] === "") completo[campo] = aporta[campo];
    }
    // "NEF" a mano dice menos que "400 V-drive" del Excel.
    if (!/\d/.test(completo.modelo || "") && /\d/.test(aporta.modelo || "")) completo.modelo = aporta.modelo;
    salida[previo] = completo;
  }
  return salida;
}

function prolijar(datos) {
  return {
    ...datos,
    motores: sinSeriesRepetidas(datos.motores.map(normalizar)),
    grupos: sinSeriesRepetidas(datos.grupos.map(normalizar)),
    comprasGrupos: (datos.comprasGrupos || []).map(normalizar),
  };
}

export function aplicarBase(datosOriginales, base) {
  const datos = prolijar(datosOriginales);
  if (!base) {
    return { ...datos, obrasActivas: null, memoria: new Map() };
  }

  const obraPorClave = new Map(base.obras.map((obra) => [claveObra(obra.codigo), obra]));
  const obrasActivas = base.obras.filter((obra) => obra.estado === "activa").map((obra) => claveObra(obra.codigo));
  const primeroActivo = new Map();
  for (const clave of obrasActivas) {
    const linea = lineaDeCodigo(clave);
    const numero = numeroDeCodigo(clave);
    const actual = primeroActivo.get(linea);
    if (numero != null && (actual == null || numero < actual)) primeroActivo.set(linea, numero);
  }
  const yaEntregado = (clave) => {
    const obra = obraPorClave.get(clave);
    if (obra) return obra.estado !== "activa";
    const primero = primeroActivo.get(lineaDeCodigo(clave));
    const numero = numeroDeCodigo(clave);
    return primero != null && numero != null && numero < primero;
  };
  const alDia = (original) => {
    const equipo = reservaCoherente(original);
    return equipo.obra && (equipo.estado === "asignado" || equipo.estado === "instalado") && yaEntregado(equipo.obra)
      ? { ...equipo, estado: "entregado", entregadoSegunBase: true }
      : equipo;
  };

  const memoria = new Map();
  for (const fila of base.memorias || []) {
    const clave = claveObra(fila.obra_codigo);
    if (!clave || (!fila.motorizacion && !fila.grupo_electrogeno)) continue;
    memoria.set(clave, {
      motores: fila.motorizacion || null,
      grupo: fila.grupo_electrogeno || null,
      marca: marcaDeTexto(fila.motorizacion),
    });
  }

  // Muchos grupos de la planilla no dicen la marca ("9kVA"). Si la memoria de
  // ese barco dice "Kohler 9 Kva" y la potencia calza, la marca es ésa.
  const conMarcaDeMemoria = (grupo) => {
    if (grupo.marca || !grupo.obra) return grupo;
    const texto = memoria.get(grupo.obra)?.grupo;
    const marca = marcaDeGrupo(texto);
    const kva = kvaDeTexto(texto);
    return marca && (kva == null || grupo.potencia == null || Math.abs(kva - grupo.potencia) <= 1) ? { ...grupo, marca } : grupo;
  };

  return {
    motores: datos.motores.map(alDia),
    grupos: datos.grupos.map(alDia).map(conMarcaDeMemoria),
    comprasGrupos: datos.comprasGrupos.map(conMarcaDeMemoria),
    obrasActivas,
    memoria,
  };
}


// Barcos en producción con sus motores y grupos. Se incluyen los que tienen
// motores sin entregar y, si hay base, las obras activas sin equipos cargados.
// Un grupo del Excel, por sí solo, no prueba que un barco viejo siga activo.
// Cómo está el barco en una palabra, de lo más urgente a lo resuelto.
export const ESTADOS_BARCO = {
  atrasado: { label: "Recepción atrasada", tono: "rojo" },
  urgente: { label: "Urgente", tono: "rojo" },
  por_llegar: { label: "Motores por llegar", tono: "violeta" },
  a_retirar: { label: "Para retirar", tono: "cian" },
  revisar: { label: "Revisar datos", tono: "rojo" },
  sin_registrar: { label: "Sin registrar", tono: "neutro" },
  reservado: { label: "Reservados", tono: "cian" },
  instalado: { label: "Instalados", tono: "verde" },
};

// Barcos en producción con sus motores y grupos. Se incluyen los que tienen
// motores sin entregar y, si hay base, las obras activas sin equipos cargados.
// Un grupo del Excel, por sí solo, no prueba que un barco viejo siga activo.
// Las compras para el barco que todavía están en el proveedor también son del
// barco: antes el Kohler comprado para el 55-2 no aparecía en su fila.
export function barcosEnProduccion(datos, { termino = "", hoy = new Date() } = {}) {
  const { motores, grupos, comprasGrupos = [], obrasActivas = null, memoria = new Map() } = datos;
  const activas = new Set(obrasActivas || []);
  const entregados = new Set(motores.filter((m) => m.estado === "entregado").map((m) => m.obra));
  const codigos = new Set(motores.filter((motor) => motor.obra && motor.estado !== "entregado").map((motor) => motor.obra));
  for (const codigo of activas) codigos.add(codigo);
  const todosMotores = [...motores, ...comprasGrupos.filter((e) => e.tipo === "motor")];
  const todosGrupos = [...grupos, ...comprasGrupos.filter((e) => e.tipo === "generador")];

  return [...codigos]
    .filter((codigo) => !entregados.has(codigo) || activas.has(codigo))
    .map((codigo) => {
      const suyos = todosMotores.filter((m) => m.obra === codigo && m.estado !== "entregado")
        .sort((a, b) => ORDEN_ESTADO.indexOf(a.estado) - ORDEN_ESTADO.indexOf(b.estado) || ordenCodigo(a.numero_serie || "", b.numero_serie || ""));
      const gruposDelBarco = todosGrupos.filter((g) => g.obra === codigo && g.estado !== "entregado")
        .sort((a, b) => String(b.fecha_entrega || "").localeCompare(String(a.fecha_entrega || "")));
      const faltan = suyos.filter((m) => m.estado === "pedido");
      const fechaEstimada = faltan.find((m) => m.fecha_estimada)?.fecha_estimada || null;
      const segunMemoria = memoria.get(codigo) || null;
      const esperados = cantidadDeMotores(segunMemoria?.motores);
      const barco = {
        codigo,
        linea: lineaDeCodigo(codigo),
        motores: suyos,
        grupos: gruposDelBarco,
        // El grupo vigente es el último que llegó a ese barco (los que se pasaron
        // a otro barco dejan de contar acá y quedan como movimiento).
        grupo: gruposDelBarco[0] || null,
        faltan: faltan.length,
        urgente: suyos.some((m) => m.urgente && m.estado === "pedido"),
        fechaEstimada,
        atrasado: faltan.some((m) => recepcionVencida(m.fecha_estimada, hoy)),
        orden: fechaAproximada(fechaEstimada, hoy)?.getTime() ?? Infinity,
        sinDatos: suyos.length === 0,
        memoria: segunMemoria,
        esperados,
        // Más motores que los que lleva el barco: casi siempre un pedido que
        // llegó y se cargó como equipo nuevo en vez de recibir el pedido.
        sobran: suyos.length > esperados ? suyos.length - esperados : 0,
        // La memoria dice una marca y lo cargado otra: hay que revisar.
        marcaDistinta: Boolean(segunMemoria?.marca && suyos.length && !suyos.some((m) => m.marca === segunMemoria.marca)),
      };
      barco.estado = estadoDeBarco(barco);
      return barco;
    })
    .filter((barco) => barcoCoincide(barco, termino))
    .sort((a, b) => ordenLinea(a.linea || "Otros", b.linea || "Otros") || ordenCodigo(a.codigo, b.codigo));
}

const ORDEN_ESTADO = ["instalado", "asignado", "en_galpon", "comprado", "pedido", "entregado"];

function estadoDeBarco(barco) {
  if (barco.sobran || barco.marcaDistinta) return "revisar";
  if (barco.atrasado) return "atrasado";
  if (barco.urgente) return "urgente";
  if (barco.faltan) return "por_llegar";
  if (barco.motores.some((m) => m.estado === "comprado")) return "a_retirar";
  if (barco.sinDatos) return "sin_registrar";
  if (barco.motores.every((m) => m.estado === "instalado")) return "instalado";
  return "reservado";
}

// Lo que hay que hacer, en el orden en que conviene hacerlo. Cada punto
// nombra los barcos o equipos para ir directo.
export function aResolver(datos, barcos) {
  const puntos = [];
  // Un barco con motores de más va a "revisar": su pedido sobrante no es una
  // recepción atrasada.
  const pedidos = barcos.filter((b) => b.faltan > 0 && !b.sobran);
  const atrasados = pedidos.filter((b) => b.atrasado);
  if (atrasados.length) {
    puntos.push({ key: "atrasado", tono: "rojo", titulo: "Recepción atrasada", detalle: "La fecha estimada ya pasó: confirmar con el proveedor o recibir.", barcos: atrasados.map((b) => ({ codigo: b.codigo, nota: textoFechaEstimada(b.fechaEstimada) })) });
  }
  const porLlegar = pedidos.filter((b) => !b.atrasado).sort((a, b) => a.orden - b.orden);
  if (porLlegar.length) {
    puntos.push({ key: "por_llegar", tono: "violeta", titulo: "Motores por llegar", detalle: "Pedidos al proveedor, con la fecha estimada.", barcos: porLlegar.map((b) => ({ codigo: b.codigo, nota: textoFechaEstimada(b.fechaEstimada) || "sin fecha" })) });
  }
  const aRetirar = (datos.comprasGrupos || []).filter((e) => e.estado === "comprado");
  if (aRetirar.length) {
    puntos.push({ key: "a_retirar", tono: "cian", titulo: "Para retirar del proveedor", detalle: "Comprados y todavía en el proveedor.", equipos: aRetirar });
  }
  const revisar = barcos.filter((b) => b.sobran || b.marcaDistinta);
  if (revisar.length) {
    puntos.push({
      key: "revisar",
      tono: "rojo",
      titulo: "Datos a revisar",
      detalle: "Más motores cargados que los que lleva el barco, o una marca distinta a la memoria.",
      barcos: revisar.map((b) => ({ codigo: b.codigo, nota: b.sobran ? `${b.motores.length} motores, lleva ${b.esperados}` : "marca distinta" })),
    });
  }
  const sinRegistrar = barcos.filter((b) => b.sinDatos);
  if (sinRegistrar.length) {
    puntos.push({
      key: "sin_registrar",
      tono: "neutro",
      titulo: "Motorización sin registrar",
      detalle: "Barcos activos sin motores cargados. Lo que dice la memoria va al lado.",
      barcos: sinRegistrar.map((b) => ({ codigo: b.codigo, nota: b.memoria?.marca ? b.memoria.marca.split(" ")[0] : null })),
    });
  }
  return puntos;
}

function barcoCoincide(barco, termino) {
  if (!termino) return true;
  return barco.codigo.toLowerCase().includes(termino)
    || barco.motores.some((m) => coincide(m, termino))
    || barco.grupos?.some((grupo) => coincide(grupo, termino))
    || [barco.memoria?.motores, barco.memoria?.grupo].some((texto) => String(texto || "").toLowerCase().includes(termino));
}

// Existencias operativas: compras sin retiro registrado, motores reservados
// para un barco y grupos sin instalar (reservados o sin barco).
export function equiposEnGalpon({ motores, grupos, comprasGrupos = [] }, termino = "") {
  const porObra = (a, b) => ordenCodigo(a.obra || "", b.obra || "");
  return [
    ...comprasGrupos.filter((g) => g.estado === "comprado").sort(porObra),
    ...motores.filter((m) => m.estado === "pedido").sort(porObra),
    ...grupos.filter((g) => g.estado === "pedido").sort(porObra),
    ...motores.filter((m) => m.stock_confirmado && (m.estado === "en_galpon" || m.estado === "asignado")).sort(porObra),
    ...grupos.filter((g) => g.stock_confirmado && g.estado === "asignado").sort(porObra),
    ...grupos.filter((g) => g.estado === "en_galpon" && g.stock_confirmado),
  ].filter((equipo) => coincide(equipo, termino));
}

// Barcos entregados con los números de sus motores y grupos (para
// postventa). Entran por sus motores entregados y, si hay base, también los
// que sólo figuran en el Excel de grupos.
export function barcosEntregados({ motores, grupos, memoria = new Map() }, termino = "") {
  const porBarco = new Map();
  const barcoDe = (codigo) => {
    if (!porBarco.has(codigo)) {
      porBarco.set(codigo, { codigo, linea: lineaDeCodigo(codigo) || "Otros", motores: [], grupos: [], grupo: null, memoria: memoria.get(codigo) || null });
    }
    return porBarco.get(codigo);
  };
  for (const motor of motores) {
    if (motor.estado === "entregado" && motor.obra) barcoDe(motor.obra).motores.push(motor);
  }
  const conMotores = new Set(porBarco.keys());
  for (const grupo of grupos) {
    if (!grupo.obra || (grupo.estado !== "entregado" && !conMotores.has(grupo.obra))) continue;
    const barco = barcoDe(grupo.obra);
    barco.grupos.push(grupo);
    if (!barco.grupo || String(grupo.fecha_entrega || "") > String(barco.grupo.fecha_entrega || "")) barco.grupo = grupo;
  }
  return [...porBarco.values()]
    .filter((barco) => barcoCoincide(barco, termino))
    .sort((a, b) => ordenCodigo(a.codigo, b.codigo));
}

// Últimos grupos que salieron hacia una embarcación. Se usa como lectura
// rápida en la portada; si un barco aparece varias veces, conserva el último
// movimiento registrado en la planilla.
export function ultimosGruposEntregados({ grupos }, limite = 5) {
  const vistos = new Set();
  return grupos
    .filter((grupo) => grupo.obra && grupo.fecha_entrega && grupo.estado !== "en_galpon")
    .sort((a, b) => String(b.fecha_entrega).localeCompare(String(a.fecha_entrega)))
    .filter((grupo) => {
      if (vistos.has(grupo.obra)) return false;
      vistos.add(grupo.obra);
      return true;
    })
    .slice(0, limite);
}

export function agruparPorLinea(barcos) {
  const porLinea = new Map();
  for (const barco of barcos) {
    const lista = porLinea.get(barco.linea) || [];
    lista.push(barco);
    porLinea.set(barco.linea, lista);
  }
  return [...porLinea.entries()]
    .map(([linea, lista]) => ({ linea, barcos: lista }))
    .sort((a, b) => ordenLinea(a.linea, b.linea));
}

export function movimientosDeGrupos({ motores, grupos, comprasGrupos = [] }, termino = "") {
  return [...motores, ...grupos, ...comprasGrupos]
    .flatMap((equipo) => (equipo.movimientos || []).map((movimiento) => ({ ...movimiento, grupo: equipo })))
    .filter((movimiento) => !termino
      || [movimiento.desde, movimiento.hacia, movimiento.grupo.modelo, movimiento.grupo.proveedor]
        .some((valor) => String(valor || "").toLowerCase().includes(termino)))
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

// ─── Filtros ────────────────────────────────────────────────────────────────
// Cada vista filtra una cosa distinta: barcos (en producción o entregados),
// equipos sueltos (el galpón) o movimientos de grupos, y cada faceta sabe sacar
// sus valores de cada una. Dentro de una faceta las opciones suman (Kohler u
// Onan); entre facetas se cruzan (Kohler y 9 kVA).

const SIN_DATO = "Sin dato";
const SIN_MARCA = "Sin marca";
const SIN_BARCO = "Sin barco";

const ESTADOS_MOTOR = {
  comprado: "En proveedor",
  pedido: "Pedido",
  urgente: "Urgente",
  en_galpon: "En galpón · libre",
  asignado: "Reservado para barco",
  instalado: "Instalado",
  sin_cargar: "Sin registrar",
  revisar: "Marca a revisar",
};

const ESTADOS_GRUPO = {
  comprado: "En proveedor",
  pedido: "Pedido",
  en_galpon: "En galpón · libre",
  asignado: "Reservado para barco",
  instalado: "Instalado",
  sin_cargar: "Sin registrar",
  sin_grupo: "Sin grupo",
};

export const SECCIONES_FILTRO = [
  { key: "general", label: "General" },
  { key: "motores", label: "Motores" },
  { key: "grupos", label: "Grupos electrógenos" },
];

function ordenPorClaves(etiquetas) {
  const claves = Object.keys(etiquetas);
  return (a, b) => claves.indexOf(a) - claves.indexOf(b);
}

function ordenConVaciosAlFinal(a, b) {
  const vacio = (valor) => (valor === SIN_DATO || valor === SIN_MARCA || valor === SIN_BARCO ? 1 : 0);
  return vacio(a) - vacio(b) || ordenCodigo(a, b);
}

// Primero las K, después Antago y Hunter, al final lo que no es una línea.
function ordenLinea(a, b) {
  const rango = (valor) => (/^K\d/.test(valor) ? 0 : valor === "Antago" || valor === "Hunter" ? 1 : 2);
  return rango(a) - rango(b) || ordenCodigo(a, b);
}

function ordenMarcaMotor(a, b) {
  const rango = (valor) => (MARCAS_MOTOR.includes(valor) ? MARCAS_MOTOR.indexOf(valor) : MARCAS_MOTOR.length);
  return rango(a) - rango(b) || ordenConVaciosAlFinal(a, b);
}

// label: título dentro del panel; corto: prefijo en el chip de filtro activo
// ("Grupo: Kohler"), para que no se confunda la marca del motor con la del grupo.
export const FACETAS = {
  equipo: { label: "Equipo", seccion: "general", etiquetas: { motor: "Motores", generador: "Grupos" } },
  movimiento: {
    label: "Movimiento",
    seccion: "general",
    etiquetas: {
      reasignacion: "Cambio de barco",
      cambio_barco: "Cambio de barco",
      devuelto: "Volvió al galpón",
      reserva: "Reserva",
      ingreso: "Llegó",
      instalacion: "Instalación",
      compra: "Compra",
      retiro: "Retiro del proveedor",
      entrega: "Entrega del barco",
      otro: "Actualización",
    },
  },
  linea: { label: "Línea", seccion: "general", orden: ordenLinea },
  motor: { label: "Marca", corto: "Motor", seccion: "motores", orden: ordenMarcaMotor },
  modelo: { label: "Modelo", seccion: "motores" },
  estado_motor: { label: "Estado", corto: "Motor", seccion: "motores", etiquetas: ESTADOS_MOTOR },
  grupo: { label: "Marca", corto: "Grupo", seccion: "grupos", orden: ordenConVaciosAlFinal },
  kva: {
    label: "Potencia",
    seccion: "grupos",
    orden: (a, b) => Number(a) - Number(b),
    formato: (valor) => `${String(valor).replace(".", ",")} kVA`,
  },
  proveedor: { label: "Proveedor", seccion: "grupos", orden: ordenConVaciosAlFinal },
  estado_grupo: { label: "Estado", corto: "Grupo", seccion: "grupos", etiquetas: ESTADOS_GRUPO },
};

export const CLAVES_FILTRO = Object.keys(FACETAS);

export const FACETAS_POR_VISTA = {
  barcos: ["linea", "motor", "modelo", "estado_motor", "grupo", "kva", "proveedor", "estado_grupo"],
  galpon: ["equipo", "linea", "motor", "modelo", "estado_motor", "grupo", "kva", "proveedor", "estado_grupo"],
  entregados: ["linea", "motor", "modelo", "grupo", "kva", "proveedor"],
  movimientos: ["movimiento", "linea", "grupo", "kva", "proveedor"],
};

export const TIPO_POR_VISTA = { barcos: "barco", galpon: "equipo", entregados: "barco", movimientos: "movimiento" };

const DE_MOTOR = ["motor", "modelo", "estado_motor"];
const DE_GRUPO = ["grupo", "kva", "proveedor", "estado_grupo"];

// "570 Angular V2" y "570 Angular" son el mismo motor para elegir: potencia y
// transmisión.
export function modeloDeMotor(motor) {
  return motor.potencia && motor.transmision ? `${motor.potencia} ${motor.transmision}` : motor.modelo;
}

// La memoria escribe el grupo como viene: "Kohle 9Kva", "Kholer 7 kva".
export function marcaDeGrupo(texto) {
  const t = String(texto || "").toLowerCase();
  if (/kohl|khol|kool/.test(t)) return "Kohler";
  if (/sleeper/.test(t)) return "Sleeper";
  if (/onan/.test(t)) return "Onan";
  if (/maze/.test(t)) return "Maze";
  return null;
}

export function kvaDeTexto(texto) {
  const m = String(texto || "").match(/(\d+(?:[.,]\d+)?)\s*k\s*v\s*a/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Lo que un barco sabe de su grupo: del Excel si está, si no de la memoria.
function grupoDelBarco(barco) {
  if (barco.grupo) {
    return { marca: barco.grupo.marca || SIN_MARCA, kva: barco.grupo.potencia, proveedor: barco.grupo.proveedor, estado: barco.grupo.estado };
  }
  if (barco.memoria?.grupo) {
    return { marca: marcaDeGrupo(barco.memoria.grupo) || SIN_MARCA, kva: kvaDeTexto(barco.memoria.grupo), proveedor: null, estado: "sin_cargar" };
  }
  return null;
}

const uno = (valor) => (valor == null || valor === "" ? [] : [String(valor)]);
const sinRepetir = (valores) => [...new Set(valores.filter((v) => v != null && v !== "").map(String))];

const VALORES = {
  barco: {
    linea: (b) => [b.linea || "Otros"],
    motor: (b) => {
      const marcas = sinRepetir(b.motores.map((m) => m.marca));
      if (!marcas.length && b.memoria?.marca) marcas.push(b.memoria.marca);
      return marcas.length ? marcas : [SIN_DATO];
    },
    modelo: (b) => sinRepetir(b.motores.map(modeloDeMotor)),
    estado_motor: (b) => sinRepetir([
      ...b.motores.map((m) => m.estado),
      b.urgente ? "urgente" : null,
      b.sinDatos ? "sin_cargar" : null,
      b.marcaDistinta ? "revisar" : null,
    ]),
    grupo: (b) => uno(grupoDelBarco(b)?.marca),
    kva: (b) => uno(grupoDelBarco(b)?.kva),
    proveedor: (b) => uno(grupoDelBarco(b)?.proveedor),
    estado_grupo: (b) => [grupoDelBarco(b)?.estado || "sin_grupo"],
  },
  equipo: {
    equipo: (e) => [e.tipo],
    linea: (e) => [lineaDeCodigo(e.obra) || SIN_BARCO],
    motor: (e) => uno(e.marca),
    modelo: (e) => uno(modeloDeMotor(e)),
    estado_motor: (e) => [e.estado],
    grupo: (e) => [e.marca || SIN_MARCA],
    kva: (e) => uno(e.potencia),
    proveedor: (e) => uno(e.proveedor),
    estado_grupo: (e) => [e.estado],
  },
  movimiento: {
    movimiento: (m) => [m.tipo],
    linea: (m) => sinRepetir([lineaDeCodigo(m.desde), lineaDeCodigo(m.hacia)]),
    grupo: (m) => [m.grupo.marca || SIN_MARCA],
    kva: (m) => uno(m.grupo.potencia),
    proveedor: (m) => uno(m.grupo.proveedor),
  },
};

function valoresDe(tipo, key, item) {
  if (tipo === "equipo") {
    if (DE_MOTOR.includes(key) && item.tipo !== "motor") return [];
    if (DE_GRUPO.includes(key) && item.tipo !== "generador") return [];
  }
  return VALORES[tipo]?.[key]?.(item) || [];
}

function cumple(item, tipo, filtros, facetas) {
  const enUso = facetas.filter((key) => filtros[key]?.length);
  if (tipo === "equipo") {
    const propias = item.tipo === "motor" ? DE_MOTOR : DE_GRUPO;
    const ajenas = item.tipo === "motor" ? DE_GRUPO : DE_MOTOR;
    // Si sólo se filtra por cosas de grupos, los motores no van (y al revés).
    if (enUso.some((key) => ajenas.includes(key)) && !enUso.some((key) => propias.includes(key))) return false;
    return enUso.every((key) => ajenas.includes(key) || valoresDe(tipo, key, item).some((v) => filtros[key].includes(v)));
  }
  return enUso.every((key) => valoresDe(tipo, key, item).some((v) => filtros[key].includes(v)));
}

export function filtrar(items, tipo, filtros, facetas) {
  return items.filter((item) => cumple(item, tipo, filtros, facetas));
}

export function etiquetaDeFiltro(key, valor) {
  const meta = FACETAS[key];
  if (!meta) return valor;
  if (meta.etiquetas) return meta.etiquetas[valor] || valor;
  return meta.formato ? meta.formato(valor) : valor;
}

// Las opciones de cada faceta con cuántos resultados daría elegir cada una,
// contando lo elegido en las demás. En el galpón, las opciones de motores
// cuentan motores y las de grupos cuentan grupos. Una faceta con una sola
// opción no separa nada: no se muestra, salvo que esté en uso.
export function opcionesDeFiltro(items, tipo, filtros, facetas) {
  return facetas
    .map((key) => {
      const meta = FACETAS[key];
      const elegidas = filtros[key] || [];
      const valores = new Set(elegidas);
      for (const item of items) {
        for (const valor of valoresDe(tipo, key, item)) valores.add(valor);
      }
      const soloTipo = tipo !== "equipo" ? null
        : DE_MOTOR.includes(key) ? "motor"
          : DE_GRUPO.includes(key) ? "generador" : null;
      const contables = soloTipo ? items.filter((item) => item.tipo === soloTipo) : items;
      const opciones = [...valores]
        .sort(meta.orden || (meta.etiquetas ? ordenPorClaves(meta.etiquetas) : ordenCodigo))
        .map((valor) => ({
          valor,
          label: etiquetaDeFiltro(key, valor),
          cantidad: contables.filter((item) => cumple(item, tipo, { ...filtros, [key]: [valor] }, facetas)).length,
          activa: elegidas.includes(valor),
        }));
      return { key, label: meta.label, seccion: meta.seccion, opciones };
    })
    .filter((faceta) => faceta.opciones.length > 1 || faceta.opciones.some((opcion) => opcion.activa));
}
