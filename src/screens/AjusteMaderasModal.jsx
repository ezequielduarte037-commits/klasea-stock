/**
 * AjusteMaderasModal
 * ─────────────────────────────────────────────────────────────────
 * Ajuste masivo de stock de maderas via conteo físico.
 * Adapatado al sistema de pañol (tabla: materiales / movimientos).
 *
 * INTEGRACIÓN en PanolScreen.jsx — 3 pasos:
 * ─────────────────────────────────────────────────────────────────
 * 1. IMPORTAR al inicio:
 *    import AjusteMaderasModal from "./AjusteMaderasModal";
 *
 * 2. AGREGAR estado (junto a los otros useState):
 *    const [showAjuste, setShowAjuste] = useState(false);
 *
 * 3. AGREGAR botón en el topbar (junto a los botones CSV existentes):
 *    <Btn variant="outline" onClick={() => setShowAjuste(true)}>
 *      ⊟ Ajuste inventario
 *    </Btn>
 *
 * 4. AGREGAR modal al final del JSX (antes del último </div>):
 *    {showAjuste && (
 *      <AjusteMaderasModal
 *        materiales={materiales}
 *        onClose={() => setShowAjuste(false)}
 *        onDone={async () => {
 *          setShowAjuste(false);
 *          await cargarMateriales();
 *          await cargarMovs();
 *          setMsg("✅ Ajuste de inventario aplicado");
 *        }}
 *      />
 *    )}
 *
 * NO SE NECESITA NINGÚN CAMBIO DE SQL —
 * El sistema de maderas ya usa delta firmado en movimientos,
 * y el stock se actualiza por el RPC o por update directo.
 * ─────────────────────────────────────────────────────────────────
 */

import { useRef, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";

const C = {
  bg1:   "#0d0d11",
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

const GLASS = {
  backdropFilter: "blur(24px) saturate(130%)",
  WebkitBackdropFilter: "blur(24px) saturate(130%)",
};

const INP = {
  background: "rgba(255,255,255,0.04)", border: `1px solid ${C.b0}`,
  color: C.t0, padding: "8px 11px", borderRadius: 7, fontSize: 12,
  outline: "none", fontFamily: C.sans, width: "100%", boxSizing: "border-box",
};

function num(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }

// Normaliza para matching: sin tildes, minúsculas, espacios colapsados
function norm(s) {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim();
}

function matchMaterial(query, materiales) {
  const q = norm(query);
  if (!q) return null;
  // Exacto
  let found = materiales.find(m => norm(m.nombre) === q);
  if (found) return found;
  // Contiene
  found = materiales.find(m => norm(m.nombre).includes(q) || q.includes(norm(m.nombre)));
  if (found) return found;
  // Palabras clave
  const pq = q.split(" ");
  let bestScore = 0;
  materiales.forEach(m => {
    const pm = norm(m.nombre).split(" ");
    const comunes = pq.filter(p => pm.some(w => w.includes(p) || p.includes(w)));
    if (comunes.length > bestScore) { bestScore = comunes.length; found = m; }
  });
  return bestScore >= 1 ? found : null;
}

// Parsea texto pegado: "Fibrofácil 18mm: 24" / "Fibrofácil 18mm, 24" / tabs
function parsearTexto(texto) {
  return texto.split(/\n/)
    .map(l => l.trim()).filter(Boolean)
    .map(linea => {
      const m = linea.match(/^(.+?)[\s:,;|\t]+(\d+(?:[.,]\d+)?)\s*$/);
      if (!m) return null;
      const cant = parseFloat(m[2].replace(",", "."));
      return isNaN(cant) ? null : { nombre: m[1].trim(), cantidad: cant };
    })
    .filter(Boolean);
}

// Parsea CSV (separado por , o ;)
function parsearCSV(texto) {
  return texto.split(/\n/)
    .map(l => l.trim()).filter(Boolean)
    .map(linea => {
      const cols = linea.split(/[;,]/).map(c => c.replace(/^["']|["']$/g, "").trim());
      const nombre = cols.find(c => isNaN(parseFloat(c)) && c.length > 1);
      const cantRaw = cols.find(c => !isNaN(parseFloat(c.replace(",", "."))));
      if (!nombre || !cantRaw) return null;
      return { nombre, cantidad: parseFloat(cantRaw.replace(",", ".")) };
    })
    .filter(Boolean);
}

// ─── PASO 1: Entrada de datos ─────────────────────────────────────────────────
function PasoEntrada({ materiales, onPreview }) {
  const [modo, setModo]     = useState("tabla");
  const [texto, setTexto]   = useState("");
  const [err, setErr]       = useState("");
  const [cantidades, setCantidades] = useState(() => {
    const m = {};
    materiales.forEach(mat => { m[mat.id] = ""; });
    return m;
  });
  const fileRef = useRef();

  function setCant(id, val) { setCantidades(prev => ({ ...prev, [id]: val })); }

  function confirmarTabla() {
    const lineas = [];
    materiales.forEach(mat => {
      const v = cantidades[mat.id];
      if (v === "" || v === null) return;
      const n = parseFloat(String(v).replace(",", "."));
      if (!isNaN(n)) lineas.push({ material: mat, realQty: n });
    });
    if (!lineas.length) { setErr("Ingresá al menos un valor real"); return; }
    onPreview(lineas);
  }

  function procesar(parseado) {
    if (!parseado.length) { setErr("No se pudo parsear ninguna línea"); return; }
    const lineas = [], sinMatch = [];
    parseado.forEach(({ nombre, cantidad }) => {
      const mat = matchMaterial(nombre, materiales);
      if (mat) lineas.push({ material: mat, realQty: cantidad });
      else sinMatch.push(nombre);
    });
    if (sinMatch.length) setErr(`Sin match: ${sinMatch.slice(0, 6).join(", ")}${sinMatch.length > 6 ? "…" : ""}`);
    if (lineas.length) onPreview(lineas);
  }

  function leerArchivo(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "txt"].includes(ext)) {
      setErr("Subí el archivo como CSV. En Excel: Archivo → Guardar como → CSV UTF-8");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => procesar(parsearCSV(e.target.result));
    reader.readAsText(file, "UTF-8");
  }

  const MBTN = m => ({
    padding: "6px 14px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontFamily: C.sans,
    border: modo === m ? `1px solid ${C.b1}` : `1px solid ${C.b0}`,
    background: modo === m ? "rgba(255,255,255,0.07)" : "transparent",
    color: modo === m ? C.t0 : C.t2, fontWeight: modo === m ? 600 : 400,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Selector modo */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 8 }}>Método de carga</div>
        <div style={{ display: "flex", gap: 6 }}>
          <button style={MBTN("tabla")}   onClick={() => { setModo("tabla");   setErr(""); }}>📋 Tabla</button>
          <button style={MBTN("texto")}   onClick={() => { setModo("texto");   setErr(""); }}>📝 Pegar lista</button>
          <button style={MBTN("archivo")} onClick={() => { setModo("archivo"); setErr(""); }}>📂 Archivo CSV</button>
        </div>
      </div>

      {err && (
        <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", fontSize: 12, color: "#fca5a5" }}>
          ⚠ {err}
        </div>
      )}

      {/* ── TABLA ── */}
      {modo === "tabla" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.5 }}>
            Ingresá la cantidad <b style={{ color: C.t0 }}>real contada</b> de cada material. Dejá vacío los que no revisaste.
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", border: `1px solid ${C.b0}`, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "#0d0d11", zIndex: 1 }}>
                <tr>
                  <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Material</th>
                  <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, width: 90 }}>Categoría</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, width: 80 }}>Stock actual</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}`, width: 130 }}>Real contado</th>
                </tr>
              </thead>
              <tbody>
                {materiales.map((mat, idx) => {
                  const stock = num(mat.stock_actual);
                  const val   = cantidades[mat.id];
                  const real  = val !== "" ? parseFloat(String(val).replace(",", ".")) : null;
                  const diff  = real !== null && !isNaN(real) ? real - stock : null;
                  return (
                    <tr key={mat.id} style={{ background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.012)" }}>
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 12, color: C.t0 }}>
                        {mat.nombre}
                        {mat.unidad_medida && <span style={{ fontSize: 9, color: C.t2, marginLeft: 5 }}>{mat.unidad_medida}</span>}
                      </td>
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 10, color: C.t2 }}>
                        {mat.categoria || "—"}
                      </td>
                      <td style={{ padding: "7px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, textAlign: "right", fontFamily: C.mono, fontSize: 13, color: stock <= 0 ? C.red : C.t1 }}>
                        {stock}
                      </td>
                      <td style={{ padding: "5px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                          {diff !== null && !isNaN(diff) && diff !== 0 && (
                            <span style={{ fontSize: 11, fontFamily: C.mono, fontWeight: 700, color: diff > 0 ? C.green : C.red }}>
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          )}
                          <input
                            type="number" step="0.5" min="0"
                            value={val}
                            onChange={e => setCant(mat.id, e.target.value)}
                            placeholder={String(stock)}
                            style={{ ...INP, textAlign: "right", width: 80 }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={confirmarTabla} style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans }}>
              Ver diferencias →
            </button>
          </div>
        </div>
      )}

      {/* ── TEXTO ── */}
      {modo === "texto" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 10, lineHeight: 1.6 }}>
            Pegá el listado del conteo, uno por línea. Formatos aceptados:<br/>
            <span style={{ fontFamily: C.mono, color: C.t1, fontSize: 11 }}>
              Fibrofácil 18mm: 24<br/>
              MDF 15mm, 12<br/>
              Terciado naval 18mm  8
            </span>
          </div>
          <textarea
            value={texto}
            onChange={e => { setTexto(e.target.value); setErr(""); }}
            rows={14}
            placeholder={"Fibrofácil 18mm: 24\nMDF 15mm: 12\nTerciado naval 18mm: 8\nEspuma 20mm: 35\n..."}
            style={{ ...INP, resize: "vertical", lineHeight: 1.7, fontSize: 12, fontFamily: C.mono }}
          />
          <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => procesar(parsearTexto(texto))} style={{ border: "1px solid rgba(59,130,246,0.35)", background: "rgba(59,130,246,0.15)", color: "#60a5fa", padding: "8px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans }}>
              Ver diferencias →
            </button>
          </div>
        </div>
      )}

      {/* ── ARCHIVO ── */}
      {modo === "archivo" && (
        <div>
          <div style={{ fontSize: 11, color: C.t2, marginBottom: 12, lineHeight: 1.6 }}>
            Subí un CSV con dos columnas: <b style={{ color: C.t0 }}>Material</b> y <b style={{ color: C.t0 }}>Cantidad</b>.<br/>
            Desde Excel: <span style={{ fontFamily: C.mono, fontSize: 11, color: C.t1 }}>Archivo → Guardar como → CSV UTF-8</span>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${C.b0}`, borderRadius: 10, padding: "40px 20px", textAlign: "center", cursor: "pointer", transition: "border-color .2s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.b1}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.b0}
          >
            <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
            <div style={{ fontSize: 12, color: C.t1 }}>Hacer click para seleccionar</div>
            <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>.csv · .txt</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => leerArchivo(e.target.files[0])} />
        </div>
      )}
    </div>
  );
}

// ─── PASO 2: Preview y confirmación ──────────────────────────────────────────
function PasoPreview({ lineas, observaciones, setObservaciones, onConfirmar, onVolver, saving }) {
  const diffs = useMemo(() =>
    lineas
      .map(({ material, realQty }) => ({
        material,
        stockActual: num(material.stock_actual),
        realQty,
        diff: realQty - num(material.stock_actual),
      }))
      .filter(d => d.diff !== 0),
    [lineas]
  );

  const sinCambio = lineas.length - diffs.length;

  if (!diffs.length) return (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
      <div style={{ fontSize: 14, color: C.t0, fontWeight: 600, marginBottom: 6 }}>Sin diferencias</div>
      <div style={{ fontSize: 12, color: C.t2 }}>Los {lineas.length} materiales coinciden con el stock del sistema.</div>
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
          <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.green }}>{positivos}</div>
        </div>
        <div style={{ flex: 1, background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "10px 14px" }}>
          <div style={{ fontSize: 8, letterSpacing: 2, color: C.red, textTransform: "uppercase", marginBottom: 4 }}>Faltante (ajuste −)</div>
          <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.red }}>{negativos}</div>
        </div>
        {sinCambio > 0 && (
          <div style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: `1px solid ${C.b0}`, borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 8, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>Sin cambio</div>
            <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color: C.t2 }}>{sinCambio}</div>
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
              <th style={{ padding: "8px 12px", textAlign: "right", fontSize: 8, color: C.t2, letterSpacing: 2, textTransform: "uppercase", borderBottom: `1px solid ${C.b0}` }}>Ajuste</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map(({ material, stockActual, realQty, diff }) => (
              <tr key={material.id} style={{ background: diff > 0 ? "rgba(16,185,129,0.025)" : "rgba(239,68,68,0.025)" }}>
                <td style={{ padding: "8px 12px", borderBottom: `1px solid rgba(255,255,255,0.04)`, fontSize: 12, color: C.t0 }}>
                  {material.nombre}
                  {material.unidad_medida && <span style={{ fontSize: 9, color: C.t2, marginLeft: 5 }}>{material.unidad_medida}</span>}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Nota */}
      <div>
        <label style={{ display: "block", fontSize: 9, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 6 }}>
          Nota del ajuste (opcional)
        </label>
        <input
          value={observaciones}
          onChange={e => setObservaciones(e.target.value)}
          placeholder={`Conteo físico ${new Date().toLocaleDateString("es-AR")}`}
          style={INP}
        />
      </div>

      {/* Acciones */}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onVolver} disabled={saving} style={{ border: `1px solid ${C.b0}`, background: "transparent", color: C.t1, padding: "8px 16px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
          ← Volver
        </button>
        <button onClick={onConfirmar} disabled={saving} style={{ border: "1px solid rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.15)", color: "#34d399", padding: "8px 22px", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: 12, fontFamily: C.sans, opacity: saving ? 0.5 : 1 }}>
          {saving ? "Aplicando…" : `Aplicar ${diffs.length} ajuste${diffs.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ─── MODAL PRINCIPAL ──────────────────────────────────────────────────────────
export default function AjusteMaderasModal({ materiales, onClose, onDone }) {
  const [paso, setPaso]         = useState(1);
  const [lineas, setLineas]     = useState([]);
  const [obs, setObs]           = useState("");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 });

  function irAPreview(lns) { setLineas(lns); setPaso(2); setErr(""); }
  function volver()        { setPaso(1); setErr(""); }

  async function confirmar() {
    setSaving(true); setErr("");

    // Solo los que tienen diferencia
    const diffs = lineas
      .map(({ material, realQty }) => ({
        material,
        diff: realQty - num(material.stock_actual),
      }))
      .filter(d => d.diff !== 0);

    if (!diffs.length) { setSaving(false); onDone(); return; }

    const nota  = obs.trim() || `Ajuste de inventario – conteo ${new Date().toLocaleDateString("es-AR")}`;
    const obra  = "AJUSTE";
    setProgreso({ hecho: 0, total: diffs.length });

    let errores = 0;

    for (let i = 0; i < diffs.length; i++) {
      const { material, diff } = diffs[i];

      // Intento 1: RPC registrar_movimiento (igual que lo usa el pañol)
      const rpc = await supabase.rpc("registrar_movimiento", {
        p_material_id:   material.id,
        p_delta:         diff,
        p_obra:          obra,
        p_usuario:       null,
        p_entregado_por: null,
        p_proveedor:     null,
        p_recibe:        null,
        p_obs:           nota,
      });

      if (!rpc.error) {
        setProgreso(p => ({ ...p, hecho: p.hecho + 1 }));
        continue;
      }

      // Fallback: update stock_actual + insert movimiento
      const nuevoStock = num(material.stock_actual) + diff;
      const up = await supabase
        .from("materiales")
        .update({ stock_actual: nuevoStock })
        .eq("id", material.id);

      if (up.error) { errores++; setProgreso(p => ({ ...p, hecho: p.hecho + 1 })); continue; }

      await supabase.from("movimientos").insert({
        material_id:  material.id,
        delta:        diff,
        obra,
        obs:          nota,
      });

      setProgreso(p => ({ ...p, hecho: p.hecho + 1 }));
    }

    setSaving(false);
    if (errores > 0) setErr(`${errores} material(es) no pudieron actualizarse. Revisá el historial.`);
    else onDone();
  }

  const pctProgreso = progreso.total > 0 ? Math.round((progreso.hecho / progreso.total) * 100) : 0;

  return (
    <div
      onClick={e => e.target === e.currentTarget && !saving && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(0,0,0,0.88)", ...GLASS, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 20px", overflowY: "auto" }}
    >
      <div style={{ background: "#0d0d11", border: `1px solid ${C.b1}`, borderRadius: 14, width: "100%", maxWidth: 680, boxShadow: "0 32px 80px rgba(0,0,0,0.8)", fontFamily: C.sans, marginBottom: 40 }}>

        {/* Header */}
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.b0}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: 2, color: C.t2, textTransform: "uppercase", marginBottom: 4 }}>
              Paso {paso} de 2 — {paso === 1 ? "Cargar conteo" : "Confirmar ajustes"}
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.t0 }}>Ajuste de inventario · Maderas</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 3 }}>
              Sincroniza el stock del sistema con el conteo físico del pañol
            </div>
          </div>
          <button onClick={() => !saving && onClose()} style={{ background: "transparent", border: "none", color: C.t2, cursor: "pointer", fontSize: 22, padding: "2px 6px", lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 22px 24px" }}>

          {err && (
            <div style={{ padding: "8px 12px", borderRadius: 7, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.22)", fontSize: 12, color: "#fca5a5", marginBottom: 14 }}>
              ⚠ {err}
            </div>
          )}

          {/* Barra de progreso mientras guarda */}
          {saving && progreso.total > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 11, color: C.t2 }}>
                <span>Aplicando ajustes…</span>
                <span style={{ fontFamily: C.mono }}>{progreso.hecho}/{progreso.total}</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pctProgreso}%`, background: `linear-gradient(90deg, ${C.green}70, ${C.green})`, borderRadius: 99, transition: "width .3s ease" }} />
              </div>
            </div>
          )}

          {paso === 1 && <PasoEntrada materiales={materiales} onPreview={irAPreview} />}
          {paso === 2 && (
            <PasoPreview
              lineas={lineas}
              observaciones={obs}
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
