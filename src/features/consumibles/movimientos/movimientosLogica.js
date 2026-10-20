/**
 * Movimientos de consumibles: la parte pura (sin Supabase ni React), para
 * probarla con `node --test` (movimientosLogica.test.mjs).
 *
 * Cada fila de consumibles_movimientos es un producto en una obra. Un retiro
 * repartido entre tres obras son tres filas con el mismo lote: en la lista se
 * ven como un solo renglón con las tres obras, y se anulan juntas.
 */

const ZONA = "America/Argentina/Buenos_Aires";
const fechaAR = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" });

const uno = (v) => (Array.isArray(v) ? v[0] : v);
const texto = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const redondear = (x, dec = 3) => Math.round(x * 10 ** dec) / 10 ** dec;

export const normalizar = (s) => texto(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Los filtros de tipo. Ajuste y merma van juntos: casi no se usan. */
export const FILTROS_TIPO = [
  { key: "todos", label: "Todos" },
  { key: "retiro", label: "Retiros", tipos: ["retiro"] },
  { key: "ingreso", label: "Ingresos", tipos: ["ingreso"] },
  { key: "inventario", label: "Conteos", tipos: ["inventario"] },
  { key: "devolucion", label: "Devoluciones", tipos: ["devolucion"] },
  { key: "otros", label: "Ajustes y mermas", tipos: ["ajuste", "merma"] },
];

export const ETIQUETA_TIPO = {
  retiro: "Retiro", ingreso: "Ingreso", inventario: "Conteo",
  devolucion: "Devolución", ajuste: "Ajuste", merma: "Merma",
};

export function diaArgentina(iso) {
  const p = Object.fromEntries(fechaAR.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Primer conteo vigente por producto y sede: Map "material|sede" → ISO. Sale
 * de la vista consumibles_stock (filas con primer_conteo_at).
 */
export function mapaPrimerConteo(filasStock = []) {
  const out = new Map();
  for (const s of filasStock) if (s?.primer_conteo_at) out.set(`${s.material_id}|${s.sede}`, s.primer_conteo_at);
  return out;
}

/**
 * Antes del primer conteo de su producto y sede el movimiento queda
 * registrado pero no descuenta del stock. Un conteo nunca es pre-conteo.
 */
export function esPreConteo(fila, primeros = new Map()) {
  if (!fila || fila.tipo === "inventario") return false;
  const primero = primeros.get(`${fila.material_id}|${fila.sede}`);
  if (!primero) return true;
  return new Date(fila.created_at).getTime() < new Date(primero).getTime();
}

function costoDe(fila) {
  const c = num(fila.costo_unitario_ars);
  if (c == null) return null;
  return Math.abs(num(fila.cantidad) ?? 0) * c;
}

/** De dónde vino: mostrador, solicitud N°, remito, conteo inicial… */
export function origenTexto(e) {
  if (e.tipo === "retiro") {
    if (e.origen === "solicitud" || e.solicitudNumero) return e.solicitudNumero ? `Solicitud N° ${e.solicitudNumero}` : "Solicitud";
    if (e.carril === "sector") return "Punto de sector";
    return "Mostrador";
  }
  if (e.tipo === "ingreso") return e.remito ? `Remito ${e.remito}` : "Ingreso sin remito";
  if (e.tipo === "inventario") return e.teorico == null ? "Conteo inicial" : "Conteo";
  if (e.tipo === "devolucion") return "Devolución";
  return ETIQUETA_TIPO[e.tipo] ?? e.tipo;
}

/**
 * Junta las filas de un mismo producto dentro de un mismo retiro (lote o
 * solicitud) en un renglón. `nombres`: Map created_by → nombre de usuario.
 */
export function agruparFilas(filas = [], { primeros = new Map(), nombres = new Map() } = {}) {
  const grupos = new Map();
  for (const f of filas) {
    const ancla = f.lote || (f.solicitud_id ? `sol:${f.solicitud_id}` : `fila:${f.id}`);
    const clave = `${f.tipo}|${f.material_id}|${ancla}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(f);
  }

  return [...grupos.entries()].map(([clave, todas]) => {
    const filasOrdenadas = [...todas].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const activas = filasOrdenadas.filter((f) => !f.anulado_at);
    const anulado = activas.length === 0;
    const cuentan = anulado ? filasOrdenadas : activas;
    const base = filasOrdenadas[0];
    const material = uno(base.material) ?? {};
    const config = uno(material.config) ?? {};
    const solicitud = uno(base.solicitud);
    const obras = [...new Set(cuentan.map((f) => texto(uno(f.obra)?.codigo)).filter(Boolean))];
    let valor = 0;
    let sinCosto = 0;
    for (const f of cuentan) {
      const c = costoDe(f);
      if (c == null) sinCosto += 1;
      else valor += c;
    }
    const persona = texto(base.empleado_nombre);
    const registro = nombres.get(base.created_by) || "";
    return {
      clave,
      ids: filasOrdenadas.map((f) => f.id),
      filas: filasOrdenadas,
      activas,
      anulado,
      parcial: !anulado && activas.length < filasOrdenadas.length,
      motivoAnulacion: filasOrdenadas.find((f) => f.anulado_motivo)?.anulado_motivo ?? null,
      anuladoAt: filasOrdenadas.find((f) => f.anulado_at)?.anulado_at ?? null,
      tipo: base.tipo,
      sede: base.sede,
      createdAt: filasOrdenadas.reduce((max, f) => (f.created_at > max ? f.created_at : max), base.created_at),
      materialId: base.material_id,
      descripcion: texto(material.descripcion) || "Consumible sin descripción",
      imagenUrl: material.imagen_url || null,
      codigo: texto(config.codigo_etiqueta) || null,
      unidad: texto(config.unidad_entrega ?? material.unidad_medida) || "unidad",
      cantidad: redondear(cuentan.reduce((s, f) => s + (num(f.cantidad) ?? 0), 0)),
      contado: num(base.contado),
      teorico: num(base.teorico),
      gramos: num(base.gramos),
      persona: persona || null,
      // Externo (herrero, vidriero): la empresa congelada al retirar.
      externo: base.empleado_externo === true,
      empresa: texto(base.empleado_empresa) || null,
      registro: registro || null,
      metodoFirma: base.metodo_firma ?? null,
      obras,
      reparto: cuentan.map((f) => ({ obra: texto(uno(f.obra)?.codigo) || null, cantidad: Math.abs(num(f.cantidad) ?? 0) })),
      sector: texto(base.sector) || null,
      carril: base.carril ?? null,
      origen: base.origen ?? null,
      solicitudId: base.solicitud_id ?? null,
      solicitudNumero: solicitud?.numero ?? null,
      remito: texto(base.remito) || null,
      // De una fila vigente: la primera del grupo puede ser la anulada con el costo viejo.
      costoUnitario: num((cuentan[0] ?? base).costo_unitario_ars),
      valor: redondear(valor, 2),
      sinCosto,
      fueraCupo: cuentan.some((f) => f.fuera_cupo === true),
      autorizadoPor: texto(base.autorizado_por) || null,
      canje: base.canje ?? null,
      nota: texto(base.nota) || null,
      preConteo: cuentan.some((f) => esPreConteo(f, primeros)),
    };
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.clave.localeCompare(b.clave));
}

/** Dónde va: obras, o el sector si no tiene obra ("Otro" con su comentario). */
export function destinoTexto(e) {
  if (e.obras.length) return e.obras.join(" · ");
  if (e.sector === "Otro" && e.nota) return `Otro: ${e.nota}`;
  return e.sector || null;
}

/** Lo que se busca: producto, código, persona, obra, sector, remito o N° de solicitud. */
export function textoDeBusqueda(e) {
  return normalizar([
    e.descripcion, e.codigo, e.persona, e.registro, e.externo ? `externo ${e.empresa ?? ""}` : "", ...e.obras, e.sector, e.remito,
    e.solicitudNumero ? `solicitud ${e.solicitudNumero} n ${e.solicitudNumero}` : "", e.nota,
  ].filter(Boolean).join(" "));
}

/**
 * Filtra los renglones. `tipo`: key de FILTROS_TIPO. Los anulados se ven sólo
 * con `verAnulados` (y en el filtro "anulados" se ven sólo ellos).
 */
export function filtrarEntradas(entradas = [], { tipo = "todos", q = "", soloPreConteo = false, soloExternos = false, verAnulados = false, soloAnulados = false } = {}) {
  const def = FILTROS_TIPO.find((f) => f.key === tipo);
  const palabras = normalizar(q).split(" ").filter(Boolean);
  return entradas.filter((e) => {
    if (soloAnulados) { if (!e.anulado) return false; }
    else if (e.anulado && !verAnulados) return false;
    if (def?.tipos && !def.tipos.includes(e.tipo)) return false;
    if (soloPreConteo && !e.preConteo) return false;
    if (soloExternos && !e.externo) return false;
    if (!palabras.length) return true;
    const t = textoDeBusqueda(e);
    return palabras.every((p) => t.includes(p));
  });
}

/** Cuántos hay de cada tipo (sin anulados), y cuántos anulados y pre-conteo. */
export function cuentas(entradas = []) {
  const out = Object.fromEntries(FILTROS_TIPO.map((f) => [f.key, 0]));
  out.anulados = 0;
  out.preConteo = 0;
  out.externos = 0;
  for (const e of entradas) {
    if (e.anulado) { out.anulados += 1; continue; }
    out.todos += 1;
    const f = FILTROS_TIPO.find((x) => x.tipos?.includes(e.tipo));
    if (f) out[f.key] += 1;
    if (e.preConteo) out.preConteo += 1;
    if (e.externo) out.externos += 1;
  }
  return out;
}

/** Totales de retiros (sin anulados): valor sin IVA, renglones sin costo y personas distintas. */
export function resumenRetiros(entradas = []) {
  const retiros = entradas.filter((e) => e.tipo === "retiro" && !e.anulado);
  return {
    renglones: retiros.length,
    valor: redondear(retiros.reduce((s, e) => s + e.valor, 0), 2),
    sinCosto: retiros.filter((e) => e.sinCosto > 0).length,
    personas: new Set(retiros.map((e) => normalizar(e.persona)).filter(Boolean)).size,
  };
}

/** Por día de Argentina, el más reciente primero, con el resumen de cada día. */
export function agruparPorDia(entradas = []) {
  const dias = new Map();
  for (const e of entradas) {
    const dia = diaArgentina(e.createdAt);
    if (!dias.has(dia)) dias.set(dia, []);
    dias.get(dia).push(e);
  }
  return [...dias.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dia, lista]) => ({ dia, entradas: lista, retiros: resumenRetiros(lista) }));
}

/** Cantidad con signo, como se lee en la lista: −3, +50, o lo contado en un conteo. */
export function cantidadTexto(e, fmt = (n) => String(n)) {
  if (e.tipo === "inventario") return fmt(e.contado ?? 0);
  const n = e.cantidad;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
}

/** Filas para la planilla (descargarXlsx de compras). */
export function filasParaExcel(entradas = []) {
  const cab = ["Fecha", "Tipo", "Código", "Producto", "Cantidad", "Unidad", "Quién", "Empresa (externo)", "Autorizó", "Obra o sector", "Origen", "Sede", "Valor sin IVA", "Antes del conteo", "Anulado", "Motivo", "Nota"];
  const filas = entradas.map((e) => [
    new Date(e.createdAt),
    ETIQUETA_TIPO[e.tipo] ?? e.tipo,
    e.codigo || "",
    e.descripcion,
    e.tipo === "inventario" ? e.contado ?? "" : e.cantidad,
    e.unidad,
    e.persona || e.registro || "",
    e.externo ? e.empresa || "" : "",
    e.autorizadoPor || "",
    destinoTexto(e) || "",
    origenTexto(e),
    e.sede,
    e.tipo === "retiro" || e.tipo === "ingreso" ? (e.sinCosto ? "" : e.valor) : "",
    e.preConteo ? "sí" : "",
    e.anulado ? "sí" : e.parcial ? "parte" : "",
    e.motivoAnulacion || "",
    e.nota || "",
  ]);
  return { cab, filas };
}
