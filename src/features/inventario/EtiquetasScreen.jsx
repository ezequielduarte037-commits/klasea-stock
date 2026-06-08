import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/supabaseClient";
import { C } from "@/theme";

/**
 * EtiquetasScreen — genera e imprime etiquetas QR de los materiales (ruta /etiquetas).
 * El QR codifica `materiales.codigo`; al escanearlo en /scan se reconoce el material.
 * El QR se genera por imagen (api.qrserver.com) — no requiere librería instalada.
 */

const qrUrl = (txt, size = 240) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(txt)}`;

export default function EtiquetasScreen({ profile, signOut }) {
  const nav = useNavigate();
  const [mats, setMats] = useState([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState({});   // ids seleccionados para imprimir
  const [edit, setEdit] = useState({}); // id -> codigo en edición
  const [msg, setMsg] = useState("");

  async function cargar() {
    const { data } = await supabase.from("materiales")
      .select("id,nombre,codigo,unidad_medida").order("nombre");
    setMats(data ?? []);
  }
  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return mats;
    return mats.filter(m => (m.nombre || "").toLowerCase().includes(s) || (m.codigo || "").toLowerCase().includes(s));
  }, [mats, q]);

  const aImprimir = useMemo(() => {
    const ids = Object.keys(sel).filter(id => sel[id]);
    const list = ids.length ? mats.filter(m => sel[m.id]) : filtrados;
    return list.filter(m => m.codigo);
  }, [sel, mats, filtrados]);

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
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: C.bg, color: C.text, fontFamily: "'Outfit',system-ui", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #labels-print, #labels-print * { visibility: visible !important; }
          #labels-print { position: absolute; inset: 0; display: grid !important;
            grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 12px; }
          .lbl-card { break-inside: avoid; border: 1px solid #000 !important; border-radius: 8px;
            padding: 8px; text-align: center; color: #000 !important; background: #fff !important; }
          .lbl-card img { width: 150px; height: 150px; }
          .no-print { display: none !important; }
        }
        #labels-print { display: none; }
      `}</style>

      {/* Topbar */}
      <div className="no-print" style={{ flexShrink: 0, height: 52, background: C.panelSolid, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px" }}>
        <span style={{ fontWeight: 800, fontSize: 15 }}>Etiquetas QR · Materiales</span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => window.print()} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, cursor: "pointer" }}>
            Imprimir {aImprimir.length} etiqueta{aImprimir.length !== 1 ? "s" : ""}
          </button>
          <button onClick={() => nav("/")} style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer" }}>Inicio</button>
        </div>
      </div>

      {/* Cuerpo */}
      <div className="no-print" style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar material…"
            style={{ flex: 1, minWidth: 200, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", color: C.text, fontSize: 14, outline: "none" }} />
          <span style={{ fontSize: 13, color: C.dim }}>
            {Object.values(sel).filter(Boolean).length ? `${Object.values(sel).filter(Boolean).length} seleccionados` : `${filtrados.length} materiales`}
          </span>
        </div>
        {msg && <div style={{ marginBottom: 12, color: C.green, fontSize: 13 }}>{msg}</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {filtrados.map(m => (
            <div key={m.id} style={card}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="checkbox" checked={!!sel[m.id]} onChange={e => setSel(p => ({ ...p, [m.id]: e.target.checked }))} />
                <div style={{ fontWeight: 700, fontSize: 15, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.nombre}</div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {m.codigo
                  ? <img src={qrUrl(m.codigo, 120)} alt={m.codigo} width={72} height={72} style={{ background: "#fff", borderRadius: 6, padding: 2 }} />
                  : <div style={{ width: 72, height: 72, borderRadius: 6, border: `1px dashed ${C.border}`, display: "grid", placeItems: "center", color: C.dim, fontSize: 10 }}>sin código</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 4 }}>Código</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={edit[m.id] ?? m.codigo ?? ""} onChange={e => setEdit(p => ({ ...p, [m.id]: e.target.value }))}
                      style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 8px", color: C.text, fontSize: 13, fontFamily: "monospace" }} />
                    {(edit[m.id] != null && edit[m.id] !== (m.codigo ?? "")) && (
                      <button onClick={() => guardarCodigo(m.id)} style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "0 10px", fontSize: 12, cursor: "pointer" }}>✓</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Capa de impresión (oculta en pantalla, visible al imprimir) */}
      <div id="labels-print">
        {aImprimir.map(m => (
          <div key={m.id} className="lbl-card">
            <img src={qrUrl(m.codigo, 240)} alt={m.codigo} />
            <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{m.nombre}</div>
            <div style={{ fontSize: 12, fontFamily: "monospace" }}>{m.codigo}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
