// Fechas, textos y lo que vive en el celular (plantillas y borrador).
// La hora de corte es la de Argentina: el encargado puede tener el teléfono
// en automático, pero el pañol cierra la preparación a las 15 de acá.

const ZONA = "America/Argentina/Buenos_Aires";
const PREFIJO = "klasea.consumibles.lista";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

export function fold(valor) {
  return String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** "Chubut 2120" → "Chubut". "Ambas" queda vacío: hay que elegir un pañol. */
export function sedePanol(valor) {
  const text = fold(valor);
  if (text.includes("chubut")) return "Chubut";
  if (text.includes("pampa")) return "Pampa";
  return "";
}

export function fechaAR(fecha = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(fecha);
}

export function fechaDeInstante(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10);
  return fechaAR(d);
}

/** Minutos de Argentina. Después de las 15:00 la lista llega tarde. */
export function esTarde(fecha = new Date()) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ZONA,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  const hora = Number(partes.hour);
  const minuto = Number(partes.minute);
  return hora > 15 || (hora === 15 && minuto > 0);
}

export function sumarDias(iso, dias) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  const mes = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(dt.getUTCDate()).padStart(2, "0");
  return `${dt.getUTCFullYear()}-${mes}-${dia}`;
}

/** 0 domingo … 6 sábado, del día calendario, sin corrimiento de zona. */
export function diaSemana(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Mañana, salvo viernes (y el finde, que no se abre el pañol): ahí el retiro
 * es el lunes. El prompt pide el viernes; el sábado y el domingo siguen la
 * misma regla para que nadie arme una lista con retiro en un día cerrado.
 */
export function diaRetiroDefault(hoyIso) {
  const dow = diaSemana(hoyIso);
  if (dow === 5) return sumarDias(hoyIso, 3);
  if (dow === 6) return sumarDias(hoyIso, 2);
  return sumarDias(hoyIso, 1);
}

export function opcionesRetiro(hoyIso, cantidad = 3) {
  const out = [];
  let iso = diaRetiroDefault(hoyIso);
  while (out.length < cantidad) {
    const dow = diaSemana(iso);
    if (dow !== 0 && dow !== 6) out.push(iso);
    iso = sumarDias(iso, 1);
  }
  return out;
}

export function etiquetaDia(iso, hoyIso) {
  const n = Number(String(iso).slice(8, 10));
  const dow = diaSemana(iso);
  const hoyDow = diaSemana(hoyIso);
  if (iso === sumarDias(hoyIso, 1)) return `Mañana ${n}`;
  if (dow === 1 && (hoyDow === 5 || hoyDow === 6)) return `Lunes ${n}`;
  return `${DIAS_CORTOS[dow]} ${n}`;
}

export function fraseRetiro(iso, hoyIso) {
  const n = Number(String(iso).slice(8, 10));
  if (iso === sumarDias(hoyIso, 1)) return `mañana ${n}`;
  return `el ${DIAS[diaSemana(iso)]} ${n}`;
}

export function fmtCant(valor) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function nuevoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buscarConsumibles(catalogo, q, limite = 12) {
  const needle = fold(q);
  if (needle.length < 2) return { items: [], total: 0, corto: needle.length === 1 };
  const scored = [];
  for (const m of catalogo) {
    const desc = fold(m.descripcion);
    const codigo = fold(m.codigo);
    const alias = fold(m.alias);
    const enDesc = desc.indexOf(needle);
    const enCodigo = codigo ? codigo.indexOf(needle) : -1;
    const enAlias = alias ? alias.indexOf(needle) : -1;
    const at = [enDesc, enCodigo, enAlias].filter((n) => n >= 0).sort((a, b) => a - b)[0];
    if (at == null) continue;
    const exacto = codigo && codigo === needle;
    const empieza = desc.startsWith(needle) || (codigo && codigo.startsWith(needle));
    scored.push({ m, exacto, empieza, at });
  }
  scored.sort((a, b) =>
    Number(b.exacto) - Number(a.exacto)
    || Number(b.empieza) - Number(a.empieza)
    || a.at - b.at
    || a.m.descripcion.localeCompare(b.m.descripcion, "es"),
  );
  return { items: scored.slice(0, limite).map((s) => s.m), total: scored.length, corto: false };
}

/** Lo que más pidió esta persona: una vez por lista, no por cantidad. */
export function masPedidos(listas, catalogo, limite = 8) {
  const cuenta = new Map();
  for (const lista of listas) {
    const vistos = new Set();
    for (const it of lista.items || []) {
      if (!it.material_id || it.es_consumible !== true || vistos.has(it.material_id)) continue;
      vistos.add(it.material_id);
      cuenta.set(it.material_id, (cuenta.get(it.material_id) || 0) + 1);
    }
  }
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  return [...cuenta.entries()]
    .filter(([id]) => porId.has(id))
    .sort((a, b) => b[1] - a[1] || porId.get(a[0]).descripcion.localeCompare(porId.get(b[0]).descripcion, "es"))
    .slice(0, limite)
    .map(([id]) => porId.get(id));
}

export function listaParaRepetir(listas, hoyIso) {
  const conItems = (listas || []).filter((l) =>
    l.estado !== "cancelado"
    && (l.items || []).some((it) => it.material_id && it.es_consumible === true),
  );
  if (!conItems.length) return null;
  const ayer = sumarDias(hoyIso, -1);
  const deAyer = conItems.filter((l) => l.fechaPedido === ayer || fechaDeInstante(l.createdAt) === ayer);
  const pool = deAyer.length ? deAyer : conItems;
  pool.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { lista: pool[0], deAyer: deAyer.length > 0 };
}

export function itemsConsumibles(lista) {
  return (lista?.items || [])
    .filter((it) => it.material_id && it.es_consumible === true)
    .map((it) => ({ materialId: it.material_id, cantidad: it.cantidad }));
}

export function resolverContraCatalogo(items, catalogo) {
  const porId = new Map(catalogo.map((m) => [m.id, m]));
  const map = new Map();
  let faltan = 0;
  for (const it of items || []) {
    const m = porId.get(it.materialId);
    if (!m) {
      faltan += 1;
      continue;
    }
    const cant = Math.max(1, Math.min(9999, Math.round(Number(it.cantidad) || 1)));
    const prev = map.get(m.id);
    if (prev) prev.cantidad = Math.min(9999, prev.cantidad + cant);
    else {
      map.set(m.id, {
        materialId: m.id,
        descripcion: m.descripcion,
        codigo: m.codigo || "",
        unidad: m.unidad || "",
        cantidad: cant,
      });
    }
  }
  return { ok: [...map.values()], faltan };
}

export function partirSector(valor, conocidos) {
  const v = String(valor || "").trim();
  if (!v) return { sector: "", sectorOtro: "" };
  if (conocidos.has(v)) return { sector: v, sectorOtro: "" };
  if (v === "Otro") return { sector: "Otro", sectorOtro: "" };
  return { sector: "Otro", sectorOtro: v };
}

function leerJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function escribirJson(storage, key, valor) {
  try {
    storage.setItem(key, JSON.stringify(valor));
  } catch {
    /* modo privado o cupo lleno: la pantalla sigue, sólo no recuerda */
  }
}

export function leerPlantillas(uid) {
  if (!uid || typeof localStorage === "undefined") return [];
  const data = leerJson(localStorage, `${PREFIJO}.plantillas.${uid}`);
  if (!Array.isArray(data)) return [];
  return data
    .filter((p) => p && p.id && p.nombre && Array.isArray(p.items))
    .slice(0, 20)
    .map((p) => ({
      id: String(p.id),
      nombre: String(p.nombre).slice(0, 40),
      items: p.items
        .filter((it) => it && it.materialId)
        .map((it) => ({ materialId: it.materialId, cantidad: it.cantidad })),
    }));
}

export function guardarPlantillas(uid, lista) {
  if (!uid || typeof localStorage === "undefined") return;
  escribirJson(localStorage, `${PREFIJO}.plantillas.${uid}`, (lista || []).slice(0, 20));
}

export function leerBorrador(uid) {
  if (!uid || typeof localStorage === "undefined") return null;
  const data = leerJson(localStorage, `${PREFIJO}.borrador.${uid}`);
  if (!data || data.v !== 1 || typeof data !== "object") return null;
  return data;
}

export function guardarBorrador(uid, borrador) {
  if (!uid || typeof localStorage === "undefined") return;
  escribirJson(localStorage, `${PREFIJO}.borrador.${uid}`, { v: 1, ...borrador });
}

export function mensajeError(err) {
  const m = String(err?.message || err || "");
  if (/row-level security|permission denied|42501/i.test(m)) {
    return "No tenés permiso para hacer eso. Si seguís viendo este mensaje, avisá a oficina.";
  }
  if (/fetch|network|failed to fetch|load failed/i.test(m)) {
    return "No llegó al servidor. La lista sigue en el celular: reintentá cuando haya señal.";
  }
  return m || "No se pudo completar.";
}
