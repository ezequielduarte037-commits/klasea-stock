// ── MARMOLERÍA · NÚCLEO COMPARTIDO ────────────────────────────────
// Constantes, helpers y estilos base del centro de control.
// Todo usa variables del tema (dark / light / alto contraste).

export const T = {
  sans: "'Outfit', system-ui, sans-serif",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
};

// ── ESTADOS ───────────────────────────────────────────────────────
export const ESTADOS = ["Pendiente", "Enviado", "Recibido", "No lleva", "Rehacer"];
export const ESTADO_META = {
  "Pendiente": { color: "var(--dim)",    bg: "var(--panel)",      border: "var(--border)",       label: "Pendiente" },
  "Enviado":   { color: "var(--blue)",   bg: "var(--blue-soft)",  border: "var(--blue-border)",  label: "Enviado"   },
  "Recibido":  { color: "var(--green)",  bg: "var(--green-soft)", border: "var(--green-border)", label: "Recibido"  },
  "No lleva":  { color: "var(--subtle)", bg: "transparent",       border: "transparent",         label: "No lleva"  },
  "Rehacer":   { color: "var(--red)",    bg: "var(--red-soft)",   border: "var(--red-border)",   label: "Rehacer"   },
};

// ── PRIORIDADES ───────────────────────────────────────────────────
export const PRIORIDADES = ["Baja", "Media", "Alta", "Urgente"];
export const PRIORIDAD_META = {
  "Baja":    { color: "var(--dim)",   bg: "var(--panel)",      border: "var(--border)",      label: "Baja"    },
  "Media":   { color: "var(--blue)",  bg: "var(--blue-soft)",  border: "var(--blue-border)", label: "Media"   },
  "Alta":    { color: "var(--amber)", bg: "var(--amber-soft)", border: "var(--amber-border)",label: "Alta"    },
  "Urgente": { color: "var(--red)",   bg: "var(--red-soft)",   border: "var(--red-border)",  label: "Urgente" },
};

// ── DESMOLDES (from Fechas_2026.xlsx) ────────────────────────────
// Gap histórico medido (días desde desmolde hasta primer envío de plantillas):
//   K37 → 37-34: desmolde 14/10/25 → plantillas 26/01/26 = 104 días
//   K52 → 52-20: desmolde 05/06/25 → plantillas 05/11/25 = 153 días
//   K42 → 42-81: desmolde 03/09/25 → plantillas 08/01/26 = 127 días
//   K43 → sin dato, promedio ~128 días
//   K34 → sin dato, promedio ~128 días

export const GAP_POR_LINEA = { K37:104, K52:153, K42:127, K43:128, K34:128 };

export const DESMOLDES_DATA = [
  { linea:"K34", barco:"H172",  desmolde:"2026-10-20", botada:"2026-03-23", tipo:"real"     },
  { linea:"K34", barco:"H173",  desmolde:"2026-01-06", botada:"2026-06-09", tipo:"real"     },
  { linea:"K34", barco:"H174",  desmolde:"2026-03-30", botada:"2026-08-24", tipo:"estimado" },
  { linea:"K34", barco:"H175",  desmolde:"2026-06-08", botada:"2026-11-02", tipo:"estimado" },
  { linea:"K34", barco:"H176",  desmolde:"2026-08-17", botada:"2027-01-11", tipo:"estimado" },
  { linea:"K37", barco:"37-34", desmolde:"2026-10-13", botada:"2026-03-09", tipo:"real"     },
  { linea:"K37", barco:"37-35", desmolde:"2026-11-13", botada:"2026-04-16", tipo:"real"     },
  { linea:"K37", barco:"37-36", desmolde:"2026-12-11", botada:"2026-05-07", tipo:"real"     },
  { linea:"K37", barco:"37-37", desmolde:"2026-01-12", botada:"2026-06-16", tipo:"real"     },
  { linea:"K37", barco:"37-38", desmolde:"2026-02-23", botada:"2026-07-13", tipo:"estimado" },
  { linea:"K37", barco:"37-39", desmolde:"2026-03-23", botada:"2026-08-10", tipo:"estimado" },
  { linea:"K37", barco:"37-40", desmolde:"2026-04-20", botada:"2026-09-07", tipo:"estimado" },
  { linea:"K37", barco:"37-41", desmolde:"2026-05-18", botada:"2026-10-05", tipo:"estimado" },
  { linea:"K37", barco:"37-42", desmolde:"2026-06-23", botada:"2026-11-10", tipo:"estimado" },
  { linea:"K37", barco:"37-43", desmolde:"2026-07-20", botada:"2026-12-07", tipo:"estimado" },
  { linea:"K37", barco:"37-44", desmolde:"2026-08-17", botada:"2027-01-04", tipo:"estimado" },
  { linea:"K42", barco:"42-81", desmolde:"2026-09-03", botada:"2026-03-11", tipo:"real"     },
  { linea:"K42", barco:"42-82", desmolde:"2026-02-23", botada:"2026-08-12", tipo:"estimado" },
  { linea:"K42", barco:"42-83", desmolde:"2026-07-20", botada:"2026-01-13", tipo:"estimado" },
  { linea:"K43", barco:"43-28", desmolde:"2026-08-06", botada:"2026-04-29", tipo:"real"     },
  { linea:"K43", barco:"43-29", desmolde:"2026-12-11", botada:"2026-08-26", tipo:"real"     },
  { linea:"K43", barco:"43-30", desmolde:"2026-03-16", botada:"2026-11-16", tipo:"estimado" },
  { linea:"K43", barco:"43-31", desmolde:"2026-05-04", botada:"2027-01-04", tipo:"estimado" },
  { linea:"K52", barco:"52-20", desmolde:"2026-06-05", botada:null,         tipo:"real"     },
  { linea:"K52", barco:"52-21", desmolde:"2026-09-17", botada:"2026-05-13", tipo:"real"     },
  { linea:"K52", barco:"52-22", desmolde:"2026-11-13", botada:"2026-07-09", tipo:"real"     },
  { linea:"K52", barco:"52-23", desmolde:"2026-01-12", botada:"2026-09-28", tipo:"real"     },
  { linea:"K52", barco:"52-24", desmolde:"2026-03-30", botada:"2026-11-30", tipo:"estimado" },
  { linea:"K52", barco:"52-25", desmolde:"2026-06-01", botada:"2026-01-22", tipo:"estimado" },
];

// Días sin regreso a partir de los cuales una pieza enviada se considera demorada
export const DEMORADA_DIAS = 14;

// Fecha estimada de solicitud de plantillas = desmolde + gap de línea
export function fechaEstPlantilla(desmoldeStr, linea) {
  const d = new Date(desmoldeStr + "T00:00:00");
  d.setDate(d.getDate() + (GAP_POR_LINEA[linea] ?? 128));
  return d;
}

// Días hasta la fecha estimada de plantilla (negativo = ya venció)
export function diasHastaPlantilla(desmoldeStr, linea) {
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  return Math.round((fechaEstPlantilla(desmoldeStr, linea) - hoy) / 86400000);
}

// Días desde una fecha ISO (para demoradas)
export function diasDesde(fechaStr) {
  if (!fechaStr) return 0;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const d = new Date(fechaStr + "T00:00:00");
  return Math.round((hoy - d) / 86400000);
}

// Bucket operacional del desmolde
export function bucketDesmolde(dias, tieneTemplates) {
  if (tieneTemplates)     return "solicitadas";
  if (dias < -14)         return "vencidos";
  if (dias <= 30)         return "ahora";
  if (dias <= 60)         return "proximos";
  return "entiempo";
}

export const DESMOLDE_BUCKETS = [
  { key:"ahora",       label:"Pedir ahora",           color:"var(--red)",   bg:"var(--red-soft)",   border:"var(--red-border)",   accion:"Solicitar plantillas" },
  { key:"proximos",    label:"Próximos",              color:"var(--amber)", bg:"var(--amber-soft)", border:"var(--amber-border)", accion:"Preparar pedido"      },
  { key:"entiempo",    label:"En tiempo",             color:"var(--blue)",  bg:"var(--blue-soft)",  border:"var(--blue-border)",  accion:"Sin acción"           },
  { key:"solicitadas", label:"Ya solicitadas",        color:"var(--green)", bg:"var(--green-soft)", border:"var(--green-border)", accion:"Hecho"                },
  { key:"vencidos",    label:"Vencidos",              color:"var(--dim)",   bg:"var(--panel)",      border:"var(--border)",       accion:"Revisar"              },
];

export function bucketMeta(key) {
  return DESMOLDE_BUCKETS.find(b => b.key === key) ?? DESMOLDE_BUCKETS[2];
}

export const SQL_HISTORIAL = `-- Historial completo de envíos de plantillas
SELECT
  ml.nombre          AS linea,
  mu.codigo          AS barco,
  mup.sector,
  mup.pieza,
  mup.color,
  mup.fecha_envio,
  mup.fecha_regreso,
  mup.estado,
  mup.observaciones
FROM marm_unidad_piezas mup
JOIN marm_unidades mu ON mup.unidad_id = mu.id
JOIN marm_lineas   ml ON mu.linea_id   = ml.id
WHERE mup.fecha_envio IS NOT NULL
ORDER BY mup.fecha_envio ASC, ml.nombre, mu.codigo;`;

export const SQL_POR_BARCO = `-- Resumen por barco
SELECT
  ml.nombre           AS linea,
  mu.codigo           AS barco,
  MIN(mup.fecha_envio) AS primer_envio,
  MAX(mup.fecha_envio) AS ultimo_envio,
  COUNT(*)             AS total_piezas,
  COUNT(CASE WHEN mup.estado = 'Recibido' THEN 1 END) AS recibidas
FROM marm_unidad_piezas mup
JOIN marm_unidades mu ON mup.unidad_id = mu.id
JOIN marm_lineas   ml ON mu.linea_id   = ml.id
WHERE mup.fecha_envio IS NOT NULL
GROUP BY ml.nombre, mu.codigo
ORDER BY MIN(mup.fecha_envio);`;

// ── HELPERS ───────────────────────────────────────────────────────
export function pct(piezas) {
  const activas = piezas.filter(p => p.estado !== "No lleva");
  if (!activas.length) return 0;
  return Math.round(activas.filter(p => p.estado === "Recibido").length / activas.length * 100);
}

export function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function splitPiezas(value) {
  return String(value ?? "")
    .split(/\r?\n|;/)
    .map(cleanText)
    .filter(Boolean);
}

export function uniqueSorted(values) {
  return [...new Set(values.map(cleanText).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es-AR", { sensitivity: "base" }));
}

export function resolveSectorName(value, sectores = []) {
  const clean = cleanText(value);
  if (!clean) return "";
  const found = sectores.find((s) => s.toLocaleLowerCase("es-AR") === clean.toLocaleLowerCase("es-AR"));
  return found || clean;
}

export function fmtFecha(s) {
  return s ? s.split("-").reverse().join("/") : "—";
}

// Stats operativos de una unidad a partir de sus piezas (todas, sin filtrar)
export function statsDePiezas(piezas) {
  const activas = piezas.filter(p => p.estado !== "No lleva");
  const recibidas  = piezas.filter(p => p.estado === "Recibido").length;
  const enviadas   = piezas.filter(p => p.estado === "Enviado").length;
  const pendientes = piezas.filter(p => p.estado === "Pendiente").length;
  const rehacer    = piezas.filter(p => p.estado === "Rehacer").length;
  const demoradas  = piezas.filter(p => p.estado === "Enviado" && diasDesde(p.fecha_envio) > DEMORADA_DIAS);
  const envios     = piezas.map(p => p.fecha_envio).filter(Boolean).sort();
  const materiales = uniqueSorted(piezas.map(p => p.color ?? ""));
  return {
    total: activas.length,
    recibidas, enviadas, pendientes, rehacer,
    demoradas,
    pct: pct(piezas),
    primerEnvio: envios[0] ?? null,
    ultimoEnvio: envios[envios.length - 1] ?? null,
    materiales,
  };
}

// ── ESTILOS BASE ──────────────────────────────────────────────────
export const INP = { background:"var(--panel)", border:"1px solid var(--border)", color:"var(--text)", padding:"8px 11px", borderRadius:8, fontSize:13, outline:"none", width:"100%", fontFamily:T.sans, boxSizing:"border-box" };
export const INP_SM = { ...INP, padding:"5px 9px", fontSize:12 };
export const TXT = { ...INP, minHeight:74, resize:"vertical", lineHeight:1.45 };

export const PANEL = { background:"var(--panel-solid)", border:"1px solid var(--border)", borderRadius:10 };

export const EYEBROW = { fontSize:11, color:"var(--dim)", letterSpacing:0.8, textTransform:"uppercase", fontFamily:T.sans, fontWeight:700 };

export const ICON_BTN = {
  border:"1px solid transparent", background:"transparent", color:"var(--dim)",
  width:26, height:26, cursor:"pointer", borderRadius:7, flexShrink:0,
  display:"inline-flex", alignItems:"center", justifyContent:"center",
  transition:"color 0.12s, background 0.12s",
};

export const CHIP = (color, soft, border) => ({
  display:"inline-flex", alignItems:"center", gap:6,
  padding:"3px 10px", borderRadius:99,
  background: soft, border:`1px solid ${border}`,
  color, fontSize:11, fontWeight:700, whiteSpace:"nowrap",
});

export const estadoSelectStyle = (estado) => {
  const m = ESTADO_META[estado] ?? ESTADO_META["Pendiente"];
  return {
    background: m.bg, color: m.color,
    border: `1px solid ${m.border === "transparent" ? "var(--border)" : m.border}`,
    padding:"5px 8px", borderRadius:8,
    cursor:"pointer", fontSize:12, fontWeight:700, outline:"none",
    fontFamily:T.sans, maxWidth:132,
  };
};

// CSS global del módulo (se inyecta una sola vez en el contenedor)
export const MARM_CSS = `
  *, *::before, *::after { box-sizing:border-box; }
  select option { background:var(--panel-solid-2); color:var(--text); }
  ::-webkit-scrollbar { width:8px; height:8px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:var(--border-2); border-radius:99px; }
  input:focus, select:focus, textarea:focus { border-color:var(--focus) !important; outline:none; box-shadow:0 0 0 3px var(--blue-soft); }
  @keyframes mrmFade { from{opacity:0} to{opacity:1} }
  @keyframes mrmSlideIn { from{opacity:0;transform:translateX(8px)} to{opacity:1;transform:none} }
  .mrm-view { animation:mrmFade .15s ease; }
  .mrm-row { transition:background 0.12s; }
  .mrm-row:hover { background:var(--panel) !important; }
  .mrm-card { transition:border-color 0.14s, background 0.14s; }
  .mrm-card:hover { border-color:var(--border-2) !important; background:var(--panel) !important; }
  .mrm-icon-btn:hover { color:var(--text) !important; background:var(--panel-2) !important; }
  .mrm-del-btn:hover { color:var(--red) !important; background:var(--red-soft) !important; }
  .mrm-btn-ghost:hover { background:var(--panel-2) !important; color:var(--text) !important; }
  .mrm-chip-btn:hover { border-color:var(--border-2) !important; color:var(--text) !important; }
  .mrm-sector-chip:hover { border-color:var(--blue-border) !important; color:var(--blue) !important; }
  @media (max-width: 900px) {
    .mrm-scroll { -webkit-overflow-scrolling:touch; overflow-x:auto; }
    .mrm-scroll > .mrm-table { min-width:640px; }
  }
`;
