import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, FileUp, MessageSquare, Package, RefreshCw } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";
import logoK from "@/assets/logos/logo-k.png";

// Portal público para proveedores (acceso por link con token, sin cuenta).
// Todo pasa por la edge function portal-proveedor; acá no se consulta ninguna tabla.

const STATUS_LABEL = {
  nuevo: ["Nuevo", "#a1a1aa"],
  en_revision: ["En revisión", "#a1a1aa"],
  cotizando: ["Cotizando", "#f59e0b"],
  comprado: ["Comprado · esperando entrega", "#3b82f6"],
};

async function callPortal(body) {
  const { data, error } = await supabase.functions.invoke("portal-proveedor", { body });
  if (error) {
    let detalle = "";
    try { const r = await error.context?.json?.(); detalle = r?.error || ""; } catch { /* ignore */ }
    throw new Error(detalle || error.message || "No se pudo conectar con el portal.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

function fmtFecha(value) {
  if (!value) return "";
  try { return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" }); } catch { return ""; }
}

function PedidoCard({ pedido, token, onDone }) {
  const [accion, setAccion] = useState(""); // "" | "confirmar" | "factura" | "comentario"
  const [fecha, setFecha] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [statusLabel, statusColor] = STATUS_LABEL[pedido.status] || [pedido.status, C.dim];
  const confirmado = (pedido.eventos || []).find((e) => e.tipo === "entrega_confirmada");
  const facturas = (pedido.eventos || []).filter((e) => e.tipo === "factura");

  async function enviar() {
    setBusy(true);
    setFeedback("");
    try {
      if (accion === "confirmar") {
        await callPortal({ token, action: "confirmar", request_id: pedido.id, fecha_estimada: fecha || null, mensaje });
        setFeedback("Entrega confirmada. ¡Gracias!");
      } else if (accion === "comentario") {
        await callPortal({ token, action: "comentario", request_id: pedido.id, mensaje });
        setFeedback("Mensaje enviado a compras.");
      } else if (accion === "factura") {
        if (!file) throw new Error("Elegí el archivo de la factura.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
        await callPortal({
          token, action: "factura", request_id: pedido.id, mensaje,
          base64: btoa(binary), mime_type: file.type || "application/pdf", filename: file.name || "factura.pdf",
        });
        setFeedback("Factura subida. ¡Gracias!");
      }
      setAccion("");
      setMensaje("");
      setFecha("");
      setFile(null);
      onDone?.();
    } catch (e) {
      setFeedback(e.message || "No se pudo enviar.");
    } finally {
      setBusy(false);
    }
  }

  const btn = (active) => ({
    flex: "1 1 auto", padding: "9px 10px", borderRadius: 9, cursor: "pointer",
    fontSize: 12.5, fontWeight: 800, fontFamily: C.sans,
    border: `1px solid ${active ? C.blueB : C.border}`,
    background: active ? C.blueL : "transparent",
    color: active ? C.blue : C.text,
  });
  const inp = {
    width: "100%", boxSizing: "border-box", background: C.panel, border: `1px solid ${C.border}`,
    color: C.text, borderRadius: 9, padding: "10px 11px", fontSize: 13.5, fontFamily: C.sans, outline: "none",
  };

  return (
    <div className="portal-card" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 30px -18px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.05)" }}>
      <div style={{ padding: "13px 15px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 850, color: C.text, flex: "1 1 200px", minWidth: 0 }}>{pedido.title}</div>
          <span style={{ fontSize: 10.5, fontWeight: 850, color: statusColor, border: `1px solid ${statusColor}44`, background: `${statusColor}14`, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>{statusLabel}</span>
        </div>
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
          {pedido.obra && <span>Obra {pedido.obra}</span>}
          {pedido.needed_at && <span><Clock size={11} style={{ verticalAlign: -1 }} /> Necesario para {fmtFecha(pedido.needed_at)}</span>}
          <span>Pedido el {fmtFecha(pedido.created_at)}</span>
        </div>
      </div>

      {(pedido.items || []).length > 0 && (
        <div style={{ padding: "10px 15px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 6 }}>
          {pedido.items.map((it, idx) => (
            <div key={idx} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13 }}>
              <span style={{ color: C.blue, fontWeight: 850, fontFamily: C.mono, whiteSpace: "nowrap" }}>{it.quantity || "-"} {it.unit || ""}</span>
              <span style={{ color: C.text }}>{it.description}</span>
            </div>
          ))}
        </div>
      )}

      {(confirmado || facturas.length > 0) && (
        <div style={{ padding: "9px 15px", borderBottom: `1px solid ${C.border}`, display: "grid", gap: 4 }}>
          {confirmado && (
            <div style={{ fontSize: 12, color: C.green, display: "flex", gap: 6, alignItems: "center" }}>
              <CheckCircle2 size={13} /> Entrega confirmada{confirmado.fecha_estimada ? ` · llega ${fmtFecha(confirmado.fecha_estimada)}` : ""} ({fmtFecha(confirmado.created_at)})
            </div>
          )}
          {facturas.map((f, i) => (
            <div key={i} style={{ fontSize: 12, color: C.dim, display: "flex", gap: 6, alignItems: "center" }}>
              <FileUp size={13} /> Factura subida el {fmtFecha(f.created_at)}
            </div>
          ))}
        </div>
      )}

      <div style={{ padding: "11px 15px", display: "grid", gap: 9 }}>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setAccion(accion === "confirmar" ? "" : "confirmar")} style={btn(accion === "confirmar")}>
            <CheckCircle2 size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Confirmar entrega
          </button>
          <button type="button" onClick={() => setAccion(accion === "factura" ? "" : "factura")} style={btn(accion === "factura")}>
            <FileUp size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Subir factura
          </button>
          <button type="button" onClick={() => setAccion(accion === "comentario" ? "" : "comentario")} style={btn(accion === "comentario")}>
            <MessageSquare size={13} style={{ verticalAlign: -2, marginRight: 5 }} />Mensaje
          </button>
        </div>

        {accion === "confirmar" && (
          <div style={{ display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 10.5, color: C.dim, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8 }}>Fecha estimada de entrega (opcional)</span>
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inp} />
            </label>
            <input value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Nota (opcional): transporte, horario, parcial..." style={inp} />
          </div>
        )}
        {accion === "factura" && (
          <div style={{ display: "grid", gap: 8 }}>
            <input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ ...inp, padding: 8 }} />
            <input value={mensaje} onChange={(e) => setMensaje(e.target.value)} placeholder="Nota (opcional): nro de factura..." style={inp} />
          </div>
        )}
        {accion === "comentario" && (
          <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={3} placeholder="Mensaje para compras..." style={{ ...inp, resize: "vertical" }} />
        )}
        {accion && (
          <button type="button" onClick={enviar} disabled={busy} style={{ padding: "11px 14px", borderRadius: 10, border: "none", cursor: busy ? "default" : "pointer", background: busy ? C.panel : C.blue, color: busy ? C.dim : "#fff", fontSize: 13.5, fontWeight: 900, fontFamily: C.sans }}>
            {busy ? "Enviando..." : "Enviar"}
          </button>
        )}
        {feedback && <div style={{ fontSize: 12.5, color: feedback.includes("¡") || feedback.includes("enviado") ? C.green : C.red, fontWeight: 700 }}>{feedback}</div>}
      </div>
    </div>
  );
}

export default function PortalProveedorScreen() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await callPortal({ token, action: "get" }));
    } catch (e) {
      setError(e.message || "No se pudo cargar el portal.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, padding: "0 0 60px", position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes portalRise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .portal-card { animation: portalRise .38s cubic-bezier(.22,1,.36,1) both; }
      `}</style>

      {/* Glow + grilla de fondo (mismo lenguaje visual que el login) */}
      <div style={{ position: "absolute", top: "-12%", left: "50%", transform: "translateX(-50%)", width: 620, height: 380, borderRadius: "50%", background: "radial-gradient(ellipse, var(--login-glow) 0%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)", backgroundSize: "80px 80px" }} />

      {/* Hero con logo */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "38px 18px 8px" }}>
        <div style={{ width: 64, height: 64, borderRadius: 17, background: "#0d1526", border: "1px solid rgba(148,163,184,0.22)", display: "grid", placeItems: "center", margin: "0 auto 13px", boxShadow: "0 10px 26px -10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)" }}>
          <img src={logoK} alt="Klase A" style={{ width: 38, height: 38, objectFit: "contain", display: "block" }} />
        </div>
        <div style={{ fontWeight: 900, fontSize: 17, letterSpacing: "0.14em", color: C.text }}>KLASE A</div>
        <div style={{ marginTop: 5, fontSize: 10.5, letterSpacing: "0.14em", color: C.dim, textTransform: "uppercase", fontWeight: 750 }}>Portal de proveedores</div>
        <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ position: "absolute", right: 14, top: 14, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 9, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "18px 14px", display: "grid", gap: 12 }}>
        {loading && <div style={{ padding: 50, textAlign: "center", color: C.dim }}>Cargando pedidos...</div>}
        {!loading && error && (
          <div style={{ padding: "30px 20px", textAlign: "center", color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 14, fontSize: 13.5 }}>{error}</div>
        )}
        {!loading && !error && data && (
          <>
            <div className="portal-card" style={{ border: `1px solid ${C.blueB}`, background: C.blueL, borderRadius: 14, padding: "13px 16px", fontSize: 14.5, color: C.text }}>
              Hola <strong>{data.proveedor}</strong> 👋 — estos son tus pedidos activos con el astillero.
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>Confirmá entregas, subí facturas o dejanos un mensaje. Compras lo ve al instante.</div>
            </div>
            {(data.pedidos || []).length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: C.dim, border: `1px dashed ${C.border}`, borderRadius: 14, display: "grid", justifyItems: "center", gap: 8 }}>
                <Package size={26} />
                <div>No hay pedidos activos en este momento.</div>
              </div>
            ) : (
              data.pedidos.map((p) => <PedidoCard key={p.id} pedido={p} token={token} onDone={cargar} />)
            )}
            <div style={{ fontSize: 11, color: C.dim, textAlign: "center", marginTop: 8 }}>
              Este link es personal de {data.proveedor}. Ante cualquier duda, contactá a compras del astillero.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
