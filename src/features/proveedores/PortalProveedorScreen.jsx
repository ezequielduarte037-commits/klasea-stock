import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Anchor, CheckCircle2, Clock, FileUp, MessageSquare, Package, RefreshCw } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";

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
    <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 16, overflow: "hidden", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>
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
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, padding: "0 0 60px" }}>
      <div style={{ background: C.topbar, borderBottom: `1px solid ${C.border}`, padding: "16px 18px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
          <Anchor size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1.1 }}>Astillero Klase A</div>
          <div style={{ fontSize: 11, color: C.dim, letterSpacing: 1, textTransform: "uppercase", marginTop: 2, fontWeight: 750 }}>Portal de proveedores</div>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" onClick={cargar} disabled={loading} title="Actualizar" style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.text, borderRadius: 10, padding: 9, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1, display: "grid", placeItems: "center" }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 14px", display: "grid", gap: 12 }}>
        {loading && <div style={{ padding: 50, textAlign: "center", color: C.dim }}>Cargando pedidos...</div>}
        {!loading && error && (
          <div style={{ padding: "30px 20px", textAlign: "center", color: C.red, border: `1px solid ${C.redB}`, background: C.redL, borderRadius: 14, fontSize: 13.5 }}>{error}</div>
        )}
        {!loading && !error && data && (
          <>
            <div style={{ fontSize: 14.5, color: C.text }}>
              Hola <strong>{data.proveedor}</strong> 👋 — estos son tus pedidos activos con el astillero.
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
