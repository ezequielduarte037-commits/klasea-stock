const ZONA = "America/Argentina/Buenos_Aires";
const fechaAR = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });
const texto = (v, fallback) => String(v ?? "").trim() || fallback;
const uno = (v) => Array.isArray(v) ? v[0] : v;
const comparar = (a, b) => String(a).localeCompare(String(b), "es", { numeric: true });

export function diaArgentina(valor = new Date()) {
  const partes = fechaAR.formatToParts(new Date(valor));
  const p = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function moverDia(dia, cantidad) {
  const fecha = new Date(`${dia}T12:00:00Z`);
  fecha.setUTCDate(fecha.getUTCDate() + cantidad);
  return fecha.toISOString().slice(0, 10);
}

function diaValido(dia) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(Date.parse(`${dia}T12:00:00Z`))
    && new Date(`${dia}T12:00:00Z`).toISOString().slice(0, 10) === dia;
}

export function resolverPeriodo(periodo, rango, hoy = diaArgentina()) {
  const inicio = periodo === "rango" ? rango.desde : moverDia(hoy, periodo === "hoy" ? 0 : -(Number(periodo) - 1));
  const fin = periodo === "rango" ? rango.hasta : hoy;
  if (!diaValido(inicio) || !diaValido(fin)) return { error: "Completá las dos fechas." };
  if (inicio > fin) return { error: "La fecha desde tiene que ser anterior o igual a la fecha hasta." };
  // Las dos sedes usan la hora argentina; el último día es inclusivo en UI y
  // exclusivo en SQL. Esto incluye hasta el último segundo sin perder filas.
  return {
    inicio, fin,
    desde: new Date(`${inicio}T00:00:00-03:00`).toISOString(),
    hasta: new Date(`${moverDia(fin, 1)}T00:00:00-03:00`).toISOString(),
  };
}

export function personaDe(m) {
  return {
    id: m.empleado_id || (m.empleado_dni ? `dni:${m.empleado_dni}` : `nombre:${texto(m.empleado_nombre, "sin-persona")}`),
    nombre: texto(m.empleado_nombre, "Sin persona registrada"),
  };
}

export function claveViaje(m) {
  // Las filas repartidas entre obras y los distintos artículos de un carrito
  // son un solo viaje. El espejo de solicitudes hoy no guarda lote.
  return JSON.stringify([m.sede, diaArgentina(m.created_at), personaDe(m).id,
    m.lote ? `lote:${m.lote}` : m.solicitud_id ? `solicitud:${m.solicitud_id}` : `fila:${m.id}`]);
}

export function datosFila(m) {
  const material = uno(m.material);
  const categoria = uno(material?.categoria);
  const config = uno(material?.config);
  const costo = m.costo_unitario_ars;
  const tieneCosto = costo !== null && costo !== undefined && costo !== "" && Number.isFinite(Number(costo));
  const cantidad = Math.abs(Number(m.cantidad) || 0);
  return {
    cantidad, tieneCosto, pesos: tieneCosto ? cantidad * Number(costo) : 0,
    unidad: texto(config?.unidad_entrega ?? material?.unidad_medida, "unidad"),
    rubro: texto(categoria?.nombre, "Sin rubro"), rubroId: categoria?.id || "sin-rubro",
    material: texto(material?.descripcion, "Consumible sin descripción"),
  };
}

function acumular(map, clave, nombre, f) {
  const grupo = map.get(clave) ?? { id: clave, nombre, pesos: 0, sinCosto: 0, cantidades: {} };
  grupo.pesos += f.pesos;
  grupo.sinCosto += f.tieneCosto ? 0 : 1;
  grupo.cantidades[f.unidad] = (grupo.cantidades[f.unidad] ?? 0) + f.cantidad;
  map.set(clave, grupo);
}

export function ranking(grupos, metrica, unidad) {
  return grupos.map((g) => ({ ...g, valor: metrica === "pesos" ? g.pesos : g.cantidades[unidad] ?? 0 }))
    .filter((g) => metrica === "pesos" || g.valor > 0)
    .sort((a, b) => b.valor - a.valor || comparar(a.nombre, b.nombre));
}

const porUnidad = (cantidades) => Object.entries(cantidades).sort(([a], [b]) => comparar(a, b));

function incidencias(retiros, acepta) {
  const grupos = new Map();
  for (const m of retiros.filter(acepta)) {
    const f = datosFila(m);
    const id = `${claveViaje(m)}|${m.material_id}`;
    const g = grupos.get(id) ?? {
      id, fecha: m.created_at, persona: personaDe(m).nombre, material: f.material,
      unidad: f.unidad, sede: m.sede, cantidad: 0, autorizaciones: new Set(), obras: new Set(),
    };
    g.cantidad += f.cantidad;
    g.autorizaciones.add(texto(m.autorizado_por, "Sin autorización registrada"));
    g.obras.add(texto(uno(m.obra)?.codigo, "Sin obra"));
    grupos.set(id, g);
  }
  return [...grupos.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Ritmo con que sale un producto, sobre los días en que hubo retiros (así los
 * fines de semana y feriados no cuentan). Con menos de 3 días no hay ritmo.
 */
export function ritmoDeRetiro(diasConRetiro, diasActivos) {
  if (!(diasActivos >= 3) || !(diasConRetiro > 0)) return null;
  const parte = diasConRetiro / diasActivos;
  if (parte >= 0.8) return "diario";
  if (parte >= 0.4) return "seguido";
  return "a veces";
}

/**
 * Frecuencia de retiro por producto: en cuántos días salió, cuántas veces
 * (retiros distintos, como los viajes) y cuánto se lleva por vez. Lo que sale
 * todos los días conviene pedirlo en la solicitud del día anterior.
 */
export function frecuenciaDeRetiro(retiros = []) {
  const diasActivos = new Set();
  const productos = new Map();
  for (const m of retiros) {
    const f = datosFila(m);
    const dia = diaArgentina(m.created_at);
    diasActivos.add(dia);
    const p = productos.get(m.material_id) ?? { id: m.material_id, nombre: f.material, unidad: f.unidad, dias: new Set(), veces: new Set(), personas: new Set(), cantidad: 0 };
    p.dias.add(dia);
    p.veces.add(claveViaje(m));
    p.personas.add(personaDe(m).id);
    p.cantidad += f.cantidad;
    productos.set(m.material_id, p);
  }
  const total = diasActivos.size;
  return {
    diasActivos: total,
    productos: [...productos.values()].map((p) => ({
      id: p.id, nombre: p.nombre, unidad: p.unidad,
      dias: p.dias.size, veces: p.veces.size, personas: p.personas.size,
      cantidad: Math.round(p.cantidad * 1000) / 1000,
      porVez: Math.round((p.cantidad / p.veces.size) * 1000) / 1000,
      ritmo: ritmoDeRetiro(p.dias.size, total),
    })).sort((a, b) => b.veces - a.veces || b.dias - a.dias || comparar(a.nombre, b.nombre)),
  };
}

export function construirTablero({ movimientos = [], conteos = [], inicio, fin }) {
  const activas = movimientos.filter((m) => !m.anulado_at && diaArgentina(m.created_at) >= inicio && diaArgentina(m.created_at) <= fin);
  const retiros = activas.filter((m) => m.tipo === "retiro");
  const grupos = { obra: new Map(), sector: new Map(), persona: new Map(), rubro: new Map() };
  const totales = { pesos: 0, sinCosto: 0, conCosto: 0, cantidades: {} };
  const viajes = new Map();
  const sectores = new Map();
  const dias = new Map();
  for (let dia = inicio; dia <= fin; dia = moverDia(dia, 1)) {
    dias.set(dia, { id: dia, nombre: dia, planificado: new Set(), mostrador: new Set() });
  }
  let sinLote = 0;
  const otrosCarriles = new Set();
  for (const m of retiros) {
    const f = datosFila(m);
    const persona = personaDe(m);
    const obra = uno(m.obra);
    const sector = texto(m.sector, "Sin sector");
    totales.pesos += f.pesos;
    totales.sinCosto += f.tieneCosto ? 0 : 1;
    totales.conCosto += f.tieneCosto ? 1 : 0;
    totales.cantidades[f.unidad] = (totales.cantidades[f.unidad] ?? 0) + f.cantidad;
    acumular(grupos.obra, m.obra_id || "sin-obra", texto(obra?.codigo, "Sin obra"), f);
    acumular(grupos.sector, sector, sector, f);
    acumular(grupos.persona, persona.id, persona.nombre, f);
    acumular(grupos.rubro, f.rubroId, f.rubro, f);
    const viaje = claveViaje(m);
    const dia = diaArgentina(m.created_at);
    if (!viajes.has(viaje)) viajes.set(viaje, { id: viaje, persona, dia, sede: m.sede });
    if (!m.lote && !m.solicitud_id) sinLote += 1;
    if (m.carril === "planificado" || m.carril === "mostrador") {
      const s = sectores.get(sector) ?? { id: sector, nombre: sector, planificado: new Set(), mostrador: new Set() };
      s[m.carril].add(viaje);
      sectores.set(sector, s);
      dias.get(dia)[m.carril].add(viaje);
    } else otrosCarriles.add(viaje);
  }
  const proporciones = (g) => {
    const planificado = g.planificado.size;
    const mostrador = g.mostrador.size;
    const total = planificado + mostrador;
    return { id: g.id, nombre: g.nombre, planificado, mostrador, total,
      planificadoPct: total ? planificado / total * 100 : null,
      mostradorPct: total ? mostrador / total * 100 : null };
  };
  const personas = new Map();
  for (const v of viajes.values()) {
    const p = personas.get(v.persona.id) ?? { ...v.persona, total: 0, dias: {} };
    p.total += 1;
    p.dias[v.dia] = (p.dias[v.dia] ?? 0) + 1;
    personas.set(p.id, p);
  }
  const frecuencia = frecuenciaDeRetiro(retiros);
  // El orden cronológico permite reconocer la primera fila de cada producto
  // y sede incluso cuando ese conteo ocurrió antes del rango elegido.
  const primeros = new Map();
  for (const m of [...conteos].filter((c) => !c.anulado_at).sort((a, b) => a.created_at.localeCompare(b.created_at) || comparar(a.id, b.id))) {
    const key = `${m.sede}|${m.material_id}`;
    if (!primeros.has(key)) primeros.set(key, m.id);
  }
  const mermas = activas.filter((m) => m.tipo === "inventario" && Number(m.cantidad) < 0
    && primeros.has(`${m.sede}|${m.material_id}`) && primeros.get(`${m.sede}|${m.material_id}`) !== m.id);
  const resumenMermas = { pesos: 0, conCosto: 0, sinCosto: 0, cantidades: {} };
  for (const m of mermas) {
    const f = datosFila(m);
    resumenMermas.pesos += f.pesos;
    resumenMermas.conCosto += f.tieneCosto ? 1 : 0;
    resumenMermas.sinCosto += f.tieneCosto ? 0 : 1;
    resumenMermas.cantidades[f.unidad] = (resumenMermas.cantidades[f.unidad] ?? 0) + f.cantidad;
  }
  return {
    retiros: retiros.length, viajes: viajes.size, sinLote, otrosCarriles: otrosCarriles.size,
    totales: { ...totales, porUnidad: porUnidad(totales.cantidades) },
    grupos: Object.fromEntries(Object.entries(grupos).map(([key, map]) => [key, [...map.values()]])),
    sectores: [...sectores.values()].map(proporciones).sort((a, b) => b.total - a.total || comparar(a.nombre, b.nombre)),
    dias: [...dias.values()].map(proporciones),
    personas: [...personas.values()].sort((a, b) => b.total - a.total || comparar(a.nombre, b.nombre)),
    frecuencia,
    fueraCupo: incidencias(retiros, (m) => m.fuera_cupo === true),
    sinUsado: incidencias(retiros, (m) => m.canje === "sin_usado"),
    mermas: [...mermas].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    resumenMermas: { ...resumenMermas, porUnidad: porUnidad(resumenMermas.cantidades) },
    conteosPeriodo: activas.filter((m) => m.tipo === "inventario").length,
  };
}
