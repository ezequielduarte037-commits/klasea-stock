/**
 * AjusteInventarioModal
 * ─────────────────────────────────────────────────────────────────
 * Integración en LaminacionScreen.jsx:
 *
 * 1. IMPORTAR al inicio del archivo:
 *    import AjusteInventarioModal from "./AjusteInventarioModal";
 *
 * 2. AGREGAR estado (junto a los otros useState):
 *    const [showAjuste, setShowAjuste] = useState(false);
 *
 * 3. MODIFICAR stockPorMaterial (reemplazar el bloque completo):
 *    const stockPorMaterial = useMemo(() => {
 *      const map = {};
 *      for (const m of materiales) map[m.id] = 0;
 *      for (const mv of movimientos) {
 *        if (!mv.material_id) continue;
 *        let delta;
 *        if (mv.tipo === "ajuste") {
 *          delta = num(mv.cantidad); // cantidad firmada (puede ser negativa)
 *        } else {
 *          delta = mv.tipo === "ingreso" ? num(mv.cantidad) : -num(mv.cantidad);
 *        }
 *        map[mv.material_id] = (map[mv.material_id] ?? 0) + delta;
 *      }
 *      return map;
 *    }, [materiales, movimientos]);
 *
 * 4. AGREGAR botón en el header del tab Stock (junto al botón "CSV"):
 *    {isAdmin && (
 *      <button onClick={() => setShowAjuste(true)} style={S.btnPrimary}>
 *        ⊟ Ajuste de inventario
 *      </button>
 *    )}
 *
 * 5. AGREGAR el modal al final del JSX (antes del último </div>):
 *    {showAjuste && (
 *      <AjusteInventarioModal
 *        materiales={materiales}
 *        stockPorMaterial={stockPorMaterial}
 *        onClose={() => setShowAjuste(false)}
 *        onDone={() => { setShowAjuste(false); cargar(); flash("✅ Ajuste aplicado"); }}
 *      />
 *    )}
 *
 * 6. SQL — asegurarse que el tipo "ajuste" sea válido.
 *    Si la columna tiene un CHECK constraint solo para ingreso/egreso, agregar:
 *    ALTER TABLE laminacion_movimientos
 *      DROP CONSTRAINT IF EXISTS laminacion_movimientos_tipo_check;
 *    ALTER TABLE laminacion_movimientos
 *      ADD CONSTRAINT laminacion_movimientos_tipo_check
 *      CHECK (tipo IN ('ingreso', 'egreso', 'ajuste'));
 *
 *    -- También la columna cantidad necesita permitir negativos para ajustes:
 *    -- (por defecto numeric no tiene restricción de signo, debería estar bien)
 * ─────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

const C = {
  bg:    "#09090b",
  bg1:   "#0d0d11",
  bg2:   "#111116",
  b0:    "rgba(255,255,255,0.08)",
  b1:    "rgba(255,255,255,0.15)",
  t0:    "#f4f4f5",
  t1:    "#a1a1aa",
  t2:    "#71717a",
  green: "#10b981",
  amber: "#f59e0b",
  red:   "#ef4444",
  blue:  "#3b82f6",
  mono:  "'JetBrains Mono','IBM Plex Mono',monospace",
  sans:  "'Outfit',system-ui,sans-serif",
};

const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 11px", borderRadius: 7, fontSize: 12,
  outline: "none", fontFamily: C.sans, width: "100%", boxSizing: "border-box",
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// Normaliza nombres para matching fuzzy (minúsculas, sin tildes, sin espacios extra)
function norm(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fuzzy match: devuelve el material con nombre más parecido
function matchMaterial(query, materiales) {
  const q = norm(query);
  if (!q) return null;
  // Exacto primero
  let found = materiales.find(m => norm(m.nombre) === q);
  if (found) return found;
  // Contiene
  found = materiales.find(m => norm(m.nombre).includes(q) || q.includes(norm(m.nombre)));
  if (found) return found;
  // Palabras clave (al menos 2 palabras en común)
  const palabrasQ = q.split(" ");
  let bestScore = 0;
  materiales.forEach(m => {
    const palabrasM = norm(m.nombre).split(" ");
    const comunes = palabrasQ.filter(p => palabrasM.some(pm => pm.includes(p) || p.includes(pm)));
    if (comunes.length > bestScore) { bestScore = comunes.length; found = m; }
  });
  return bestScore >= 1 ? found : null;
}

// Parsea texto pegado → [{ nombre, cantidad }]
// Soporta formatos:
//   "Mat 300: 82"
//   "Mat 300, 82"
//   "Mat 300\t82"
//   "Mat 300  82"  (espacios múltiples)
function parsearTexto(texto) {
  const lineas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);
  const resultado = [];
  for (const linea of lineas) {
    // Separadores: | : , ; tab → busca el último número
    const match = linea.match(/^(.+?)[\s:,;|\t]+(\d+(?:[.,]\d+)?)[\s]*$/);
    if (match) {
      const nombre = match[1].trim();
      const cant   = parseFloat(match[2].replace(",", "."));
      if (nombre && !isNaN(cant)) resultado.push({ nombre, cantidad: cant });
    }
  }
  return resultado;
}

// Parsea CSV/Excel exported as CSV
function parsearCSV(texto) {
  const lineas = texto.split(/\n/).map(l => l.trim()).filter(Boolean);
  const resultado = [];
  for (const linea of lineas) {
    // Separar por ; o ,
    const cols = linea.split(/[;,]/).map(c => c.replace(/^["']|["']$/g, "").trim());
    // Busca columna con texto y columna con número
    const nombreCol = cols.find(c => isNaN(parseFloat(c)) && c.length > 1);
    const cantidadCol = cols.find(c => !isNaN(parseFloat(c.replace(",", "."))));
    if (nombreCol && cantidadCol) {
      resultado.push({ nombre: nombreCol, cantidad: parseFloat(cantidadCol.replace(",", ".")) });
    }
  }
  return resultado;
}

// ─── PASO 1: Modo de entrada ──────────────────────────────────────────────────
function PasoEntrada({ materiales, stockPorMaterial, onPreview }) {
  const [modo, setModo]     = useState("tabla"); // tabla | texto | archivo
  const [texto, setTexto]   = useState("");
  const [err, setErr]       = useState("");
  const [cantidades, setCantidades] = useState(() => {
    // Inicializa tabla con el stock actual
    const m = {};
    materiales.forEach(mat => { m[mat.id] = ""; });
    return m;
  });
  const fileRef = useRef();

  function setCant(id, val) {
    setCantidades(prev => ({ ...prev, [id]: val }));
  }

  // Modo tabla → construir lineas desde cantidades
  function confirmarTabla() {
    const lineas = [];
    materiales.forEach(mat => {
      const v = cantidades[mat.id];
      if (v === "" || v === null || v === undefined) return;
      const n = parseFloat(String(v).replace(",", "."));
      if (!isNaN(n)) lineas.push({ material: mat, realQty: n });
    });
    if (!lineas.length) { setErr("Ingresá al menos un valor real"); return; }
    onPreview(lineas);
  }

  // Modo texto pegado
  function confirmarTexto() {
    if (!texto.trim()) { setErr("Pegá el listado primero"); return; }
    const parseado = parsearTexto(texto);
    if (!parseado.length) { setErr("No se pudo parsear ninguna línea. Formato: 'Material: cantidad' por línea"); return; }
    const lineas = [];
    const sinMatch = [];
    parseado.forEach(({ nombre, cantidad }) => {
      const mat = matchMaterial(nombre, materiales);
      if (mat) lineas.push({ material: mat, realQty: cantidad });
      else sinMatch.push(nombre);
    });
    if (sinMatch.length) {
      setErr(`No se encontraron estos materiales: ${sinMatch.join(", ")}`);
    }
    if (lineas.length) onPreview(lineas);
  }

  // Modo archivo CSV/Excel
  function leerArchivo(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = e => {
      const texto = e.target.result;
      const parseado = parsearCSV(texto);
      if (!parseado.length) { setErr("No se pudo leer el archivo. Guardalo como CSV separado por comas o punto y coma"); return; }
      const lineas = [];
      const sinMatch = [];
      parseado.forEach(({ nombre, cantidad }) => {
        const mat = matchMaterial(nombre, materiales);
        if (mat) lineas.push({ material: mat, realQty: cantidad });
        else sinMatch.push(nombre);
      });
      if (sinMatch.length) setErr(`Sin match: ${sinMatch.slice(0,5).join(", ")}${sinMatch.length > 5 ? "…" : ""}`);
      if (lineas.length) onPreview(lineas);
    };
    if (ext === "csv" || ext === "txt") {
      reader.readAsText(file, "UTF-8");
    } else {
      setErr("Subí el archivo como CSV (.csv). En Excel: Archivo → Guardar como → CSV UTF-8");
    }
  }

  const MODO_BTN = (m, label) => ({
    padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans,
    border: modo === m ? `1px solid ${C.b1}` : `1px solid ${C.b0}`,
    background: modo === m ? "rgba(255,255,255,0.07)" : "transparent",
    color: modo === m ? C.t0 : C.t2, fontWeight: modo === m ? 600 : 400,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Selector de modo */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 8 }}>Método de carga</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={MODO_BTN("tabla",   "tabla")}   onClick={() => setModo("tabla")}>   📋 Tabla</button>
          <button style={MODO_BTN("texto",   "texto")}   onClick={() => setModo("texto")}>   📝 Pegar lista</button>
          <button style={MODO_BTN("archivo", "archivo")} onClick={() => setModo("archivo")}> 📂 Archivo CSV</button>
        </div>
      </div>

      {err && (
        <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", fontSize: 12, color: "#fca5a5" }}>
          ⚠ {err}
        </div>
      )}

      {/* ── MODO TABLA ── */}
      {modo === "tabla" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.5 }}>
            Ingresá la cantidad <b style={{ color: C.t0 }}>real contada</b> para cada material. Dejá vacío los que no revisaste.
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.b0}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#0d0d11", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Material</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, width: 80 }}>Stock actual</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, width: 120 }}>Real contado</th>
                </tr>
              </thead>
              <tbody>
                {materiales.map((mat, idx) => {
                  const stock = num(stockPorMaterial[mat.id]);
                  const val   = cantidades[mat.id];
                  const real  = val !== "" ? parseFloat(String(val).replace(",", ".")) : null;
                  const diff  = real !== null && !isNaN(real) ? real - stock : null;
                  return (
                    <tr key={mat.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 12, color: C.t0 }}>
                        {mat.nombre}
                        <span style={{ fontSize: 9, color: C.t2, marginLeft: 6 }}>{mat.unidad}</span>
                      </td>
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, textAlign: "right", fontFamily: C.mono, fontSize: 13, color: stock <= 0 ? C.red : C.t1 }}>
                        {stock}
                      </td>
                      <td style={{ padding: "5px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <input
                            type="number" step="0.5" min="0"
                            value={val}
                            onChange={e => setCant(mat.id, e.target.value)}
                            placeholder={String(stock)}
                            style={{ ...INP, textAlign: "right", width: 80 }}
                          />
                          {diff !== null && !isNaN(diff) && diff !== 0 && (
                            <span style={{
                              fontSize: 11, fontFamily: C.mono, fontWeight: 700, whiteSpace: "nowrap",
                              color: diff > 0 ? C.green : C.red,
                            }}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={confirmarTabla} style={{
              border: `1px solid rgba(59,130,246,0.35)`, background: "rgba(59,130,246,0.15)",
              color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 12, fontFamily: C.sans,
            }}>
              Ver diferencias →
            </button>
          </div>
        </div>
      )}

      {/* ── MODO TEXTO ── */}
      {modo === "texto" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.6 }}>
            Pegá el listado del conteo. Formatos aceptados (uno por línea):<br/>
            <span style={{ fontFamily: C.mono, color: C.t1, fontSize: 11 }}>
              Mat 300: 82<br/>
              Resina 101 220l, 20<br/>
              Combo LT 600  57
            </span>
          </div>
          <textarea
            value={texto}
            onChange={e => { setTexto(e.target.value); setErr(""); }}
            rows={14}
            placeholder={"Mat 300: 82\nMat 450: 24\nRoving 600: 20\nResina 101 220l: 20\nCatalizador (Aperox): 12\n..."}
            style={{ ...INP, resize: "vertical", lineHeight: 1.7, fontSize: 12, fontFamily: C.mono }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={confirmarTexto} style={{
              border: `1px solid rgba(59,130,246,0.35)`, background: "rgba(59,130,246,0.15)",
              color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer",
              fontWeight: 700, fontSize: 12, fontFamily: C.sans,
            }}>
              Ver diferencias →
            </button>
          </div>
        </div>
      )}

      {/* ── MODO ARCHIVO ── */}
      {modo === "archivo" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 12, lineHeight: 1.6 }}>
            Subí un archivo CSV con dos columnas: <b style={{ color: C.t0 }}>Material</b> y <b style={{ color: C.t0 }}>Cantidad</b>.<br/>
            Desde Excel: <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t1 }}>Archivo → Guardar como → CSV UTF-8 (delimitado por comas)</span>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${C.b0}`, borderRadius: 10, padding: "40px 20px",
              textAlign: "center", cursor: "pointer", transition: "border-color .2s",
            }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.b1}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.b0}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 12, color: C.t1 }}>Hacer click para seleccionar archivo</div>
            <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>.csv · .txt</div>
          </div>
          <input
            ref={fileRef} type="file" accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={e => leerArchivo(e.target.files[0])}
          />
        </div>
      )}
    </div>
  );
}

// ─── PASO 2: Preview de diferencias ──────────────────────────────────────────
function PasoPreview({ lineas, stockPorMaterial, observaciones, setObservaciones, onConfirmar, onVolver, saving }) {
  // Calcular diffs
  const diffs = useMemo(() => lineas.map(({ material, realQty }) => {
    const stockActual = num(stockPorMaterial[material.id]);
    const diff = realQty - stockActual;
    return { material, stockActual, realQty, diff };
  }).filter(d => d.diff !== 0), [lineas, stockPorMaterial]);

  const sinCambio = lineas.length - diffs.length;

  if (!diffs.length) return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 14, color: C.t0, fontWeight: 600, marginBottom: 6 }}>Sin diferencias</div>
      <div style={{ fontSize: 12, color: C.t2 }}>
        Los {lineas.length} materiales ingresados coinciden con el stock del sistema.
      </div>
      <button onClick={onVolver} style={{ marginTop: 20, border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
        ← Volver
      </button>
    </div>
  );

  const positivos = diffs.filter(d => d.diff > 0).length;
  const negativos = diffs.filter(d => d.diff < 0).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Resumen */}
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1, background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: C.green, textTransform: "uppercase", marginBottom: 4 }}>Sobrante (ajuste +)</div>
          <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: C.green }}>{positivos}</div>
        </div>
        <div style={{ flex: 1, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: C.red, textTransform: "uppercase", marginBottom: 4 }}>Faltante (ajuste −)</div>
          <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: C.red }}>{negativos}</div>
        </div>
        {sinCambio > 0 && (
          <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.b0}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>Sin cambio</div>
            <div style={{ fontFamily: C.mono, fontSize: 20, fontWeight: 700, color: C.t2 }}>{sinCambio}</div>
          </div>
        )}
      </div>

      {/* Tabla de diferencias */}
      <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${C.b0}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, background: "#0d0d11" }}>
            <tr>
              <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Material</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Sistema</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Real</th>
              <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Diferencia</th>
              <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Movimiento</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map(({ material, stockActual, realQty, diff }) => (
              <tr key={material.id} style={{ background: diff > 0 ? "rgba(16,185,129,0.025)" : "rgba(239,68,68,0.025)" }}>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 12, color: C.t0 }}>
                  {material.nombre}
                  <span style={{ fontSize: 9, color: C.t2, marginLeft: 5 }}>{material.unidad}</span>
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, textAlign: "right", fontFamily: C.mono, fontSize: 12, color: C.t1 }}>
                  {stockActual}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, textAlign: "right", fontFamily: C.mono, fontSize: 12, color: C.t0 }}>
                  {realQty}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, textAlign: "right", fontFamily: C.mono, fontSize: 13, fontWeight: 700, color: diff > 0 ? C.green : C.red }}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 10, color: C.t2 }}>
                  {diff > 0
                    ? <span style={{ color: C.green }}>↑ ajuste +{diff}</span>
                    : <span style={{ color: C.red }}>↓ ajuste {diff}</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Observaciones */}
      <div>
        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 6 }}>
          Nota del ajuste (opcional)
        </label>
        <input
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder={`Conteo físico ${new Date().toLocaleDateString("es-AR")} — diferencias encontradas`}
          style={INP}
        />
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onVolver} disabled={saving}
          style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
          ← Volver
        </button>
        <button onClick={onConfirmar} disabled={saving}
          style={{ border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "8px 22px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans, opacity: saving ? 0.5 : 1 }}>
          {saving ? "Aplicando…" : `Aplicar ${diffs.length} ajuste${diffs.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── MODAL PRINCIPAL ──────────────────────────────────────────────────────────
export default function AjusteInventarioModal({ materiales, stockPorMaterial, onClose, onDone }) {
  const [paso, setPaso]           = useState(1); // 1 = entrada, 2 = preview
  const [lineas, setLineas]       = useState([]);
  const [observaciones, setObs]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [err, setErr]             = useState("");

  function irAPreview(lns) { setLineas(lns); setPaso(2); setErr(""); }
  function volver()        { setPaso(1); setErr(""); }

  async function confirmar() {
    setSaving(true); setErr("");
    try {
      const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const userId  = user?.id ?? null;
      const fecha   = new Date().toISOString().slice(0,10);
      const nota    = observaciones.trim() || `Ajuste de inventario – conteo ${new Date().toLocaleDateString("es-AR")}`;

      // Solo insertar los que tienen diferencia
      const diffs = lineas
        .map(({ material, realQty }) => ({
          material,
          diff: realQty - num(stockPorMaterial[material.id]),
        }))
        .filter(d => d.diff !== 0);

      if (!diffs.length) { setSaving(false); onDone(); return; }

      const rows = diffs.map(({ material, diff }) => ({
        material_id:  material.id,
        tipo:         "ajuste",
        cantidad:     diff,   // firmada: positiva = sobrante, negativa = faltante
        fecha,
        observaciones: nota,
        creado_por:   userId,
      }));

      const { error } = await supabase.from("laminacion_movimientos").insert(rows);
      if (error) { setErr(error.message); setSaving(false); return; }
      onDone();
    } catch(e) {
      setErr(e.message);
      setSaving(false);
    }
  }

  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(0,0,0,0.88)",
        backdropFilter: "blur(20px) saturate(130%)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        padding: "32px 20px", overflowY: "auto",
      }}
    >
      <div style={{
        background: "#0d0d11", border: `1px solid ${C.b1}`, borderRadius: 14,
        width: "100%", maxWidth: 700,
        boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
        fontFamily: C.sans, animation: "fadeUp .2s ease",
        marginBottom: 40,
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>
              Paso {paso} de 2 — {paso === 1 ? "Cargar conteo" : "Confirmar ajustes"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.t0 }}>Ajuste de inventario</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>
              Registra diferencias entre el stock del sistema y el conteo físico del astillero
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 22, padding: "2px 6px", lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px 24px" }}>
          {err && (
            <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", fontSize: 12, color: "#fca5a5", marginBottom: 14 }}>
              ⚠ {err}
            </div>
          )}

          {paso === 1 && (
            <PasoEntrada
              materiales={materiales}
              stockPorMaterial={stockPorMaterial}
              onPreview={irAPreview}
            />
          )}

          {paso === 2 && (
            <PasoPreview
              lineas={lineas}
              stockPorMaterial={stockPorMaterial}
              observaciones={observaciones}
              setObservaciones={setObs}
              onConfirmar={confirmar}
              onVolver={volver}
              saving={saving}
            />
          )}
        </div>
      </div>
    </div>
  );
}
