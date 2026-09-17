import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Home, Printer, QrCode } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";

/**
 * EtiquetasScreen — genera e imprime etiquetas QR de los materiales (ruta /etiquetas).
 * El QR codifica `materiales.codigo`; al escanearlo en /scan se reconoce el material.
 * QR por imagen (api.qrserver.com, con quiet-zone) — no requiere librería instalada.
 *
 * Impresión: la capa #labels-print fluye en páginas normales (sin position:absolute,
 * sin `inset`), con `break-inside:avoid` por etiqueta → pagina bien aunque sean muchas.
 * Se reutiliza la MISMA URL de QR que se ve en pantalla → ya está cacheada al imprimir.
 */

const qrUrl = (txt) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(txt)}`;

export default function EtiquetasScreen() {
  const nav = useNavigate();
  const [mats, setMats] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState({});
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");

  async function cargar() {
    const { data } = await supabase.from("materiales").select("id,nombre,codigo,unidad_medida").order("nombre");
    setMats(data ?? []);
  }
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return mats;
    return mats.filter(m => (m.nombre || "").toLowerCase().includes(s) || (m.codigo || "").toLowerCase().includes(s));
  }, [mats, q]);

  const seleccionados = Object.keys(sel).filter(id => sel[id]);
  const aImprimir = useMemo(() => {
    const base = seleccionados.length ? mats.filter(m => sel[m.id]) : filtrados;
    return base.filter(m => m.codigo);
  }, [sel, mats, filtrados, seleccionados.length]);

  async function guardarCodigo(id) {
    const codigo = (edit[id] ?? "").trim();
    if (!codigo) return;
    const { error } = await supabase.from("materiales").update({ codigo }).eq("id", id);
    if (error) { setMsg("Error: " + error.message); return; }
    setMats(prev => prev.map(m => m.id === id ? { ...m, codigo } : m));
    setEdit(prev => { const n = { ...prev }; delete n[id]; return n; });
    setMsg("Código actualizado.");
  }

  const card = { background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 };

  return (
    <div className="et-root" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, color: C.text, fontFamily: C.sans, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @media screen { #labels-print { display: none; } }
        @media print {
          html, body { background:#fff !important; }
          /* dejamos que la página fluya y pagine */
          .et-root { position: static !important; overflow: visible !important; height: auto !important; display: block !important; }
          .no-print { display: none !important; }
          #labels-print {
            display: grid !important;
            grid-template-columns: repeat(3, 1fr);
            gap: 6mm;
          }
          .lbl-card {
            break-inside: avoid; page-break-inside: avoid;
            border: 1px solid #222; border-radius: 6px;
            padding: 5mm 3mm; text-align: center;
            background: #fff; color: #000;
          }
          .lbl-card img { width: 32mm; height: 32mm; display: block; margin: 0 auto; }
          .lbl-name { font-weight: 600; font-size: 11pt; margin-top: 2mm; line-height: 1.1; }
          .lbl-code { font-family: monospace; font-size: 12pt; margin-top: 1mm; letter-spacing: 1px; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      {/* Topbar */}
      <div className="no-print" style={{ flexShrink: 0, minHeight: 56, background: C.topbar, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "8px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
          <span style={{ width: 34, height: 34, flexShrink: 0, display: "grid", placeItems: "center", borderRadius: 10, border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue }}>
            <QrCode size={17} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.dim }}>Pañol</div>
            <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: C.text }}>Etiquetas QR de materiales</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={() => window.print()} disabled={aImprimir.length === 0} className="ui-btn ui-btn-primario">
            <Printer size={15} />
            Imprimir {aImprimir.length} etiqueta{aImprimir.length !== 1 ? "s" : ""}
          </button>
          <button onClick={() => nav("/")} className="ui-btn ui-btn-fantasma"><Home size={15} /> Inicio</button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="no-print" style={{ flex: 1, overflowY: "auto", padding: 20 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar material…"
            className="ui-input" style={{ flex: 1, minWidth: 200 }} />
          {seleccionados.length > 0 && (
            <button onClick={() => setSel({})} className="ui-btn">
              Quitar selección ({seleccionados.length})
            </button>
          )}
          <span style={{ fontSize: 13, color: C.dim }}>
            {seleccionados.length ? `${seleccionados.length} seleccionados` : `imprime los ${aImprimir.length} con código`}
          </span>
        </div>
        {msg && <div style={{ marginBottom: 12, color: C.green, fontSize: 13, fontWeight: 600 }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {filtrados.map(m => (
            <div key={m.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={!!sel[m.id]} onChange={e => setSel(p => ({ ...p, [m.id]: e.target.checked }))} style={{ width: 16, height: 16 }} />
                <div style={{ fontWeight: 600, fontSize: 15, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nombre}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {m.codigo
                  ? <img src={qrUrl(m.codigo)} loading="lazy" alt={m.codigo} width={68} height={68} style={{ background: "#fff", borderRadius: 6, padding: 3, flexShrink: 0 }} />
                  : <div style={{ width: 68, height: 68, borderRadius: 6, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.dim, fontSize: 10, flexShrink: 0 }}>sin código</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: C.dim, marginBottom: 5 }}>Código</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={edit[m.id] ?? m.codigo ?? ""} onChange={e => setEdit(p => ({ ...p, [m.id]: e.target.value }))}
                      className="ui-input" style={{ minHeight: 36, padding: "0 9px", fontSize: 13, fontFamily: C.mono }} />
                    {(edit[m.id] != null && edit[m.id] !== (m.codigo ?? "")) && (
                      <button onClick={() => guardarCodigo(m.id)} title="Guardar el código"
                        style={{ width: 36, minWidth: 36, flexShrink: 0, display: "grid", placeItems: "center", background: C.green, color: "var(--inverse-text)", border: "none", borderRadius: 10, cursor: "pointer" }}>
                        <Check size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Capa de impresión — fluye en páginas, una etiqueta no se parte */}
      <div id="labels-print">
        {aImprimir.map(m => (
          <div key={m.id} className="lbl-card">
            <img src={qrUrl(m.codigo)} loading="lazy" alt={m.codigo} />
            <div className="lbl-name">{m.nombre}</div>
            <div className="lbl-code">{m.codigo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
