import { useEffect, useState } from "react";
import { CheckCircle2, FileUp, MessageSquare } from "lucide-react";
import { supabase } from "@/supabaseClient";

// Actividad del proveedor vía portal (link mágico): confirmaciones de entrega,
// facturas subidas y mensajes. No renderiza nada si el pedido no tiene actividad.
const TIPO_META = {
  entrega_confirmada: { icon: CheckCircle2, color: "var(--green)", label: "Confirmó la entrega" },
  factura: { icon: FileUp, color: "var(--blue)", label: "Subió una factura" },
  comentario: { icon: MessageSquare, color: "var(--violet)", label: "Mensaje" },
};

function fmt(ts) {
  try { return new Date(ts).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}

export default function PortalProveedorActividad({ requestId }) {
  const [eventos, setEventos] = useState([]);

  useEffect(() => {
    if (!requestId) return;
    let alive = true;
    supabase
      .from("portal_proveedor_eventos")
      .select("id, proveedor, tipo, mensaje, archivo_url, fecha_estimada, created_at")
      .eq("request_id", requestId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data, error }) => { if (alive && !error) setEventos(data ?? []); });
    return () => { alive = false; };
  }, [requestId]);

  if (!eventos.length) return null;

  return (
    <div style={{ border: "1px solid var(--green-border)", background: "var(--green-soft)", borderRadius: 14, padding: "11px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 650, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>
        Lo que hizo el proveedor en el portal
      </div>
      <div style={{ display: "grid", gap: 7 }}>
        {eventos.map((ev) => {
          const meta = TIPO_META[ev.tipo] || TIPO_META.comentario;
          const Icon = meta.icon;
          return (
            <div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
              <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ color: "var(--text)", fontWeight: 600 }}>{ev.proveedor}</span>
                <span style={{ color: "var(--dim)" }}> · {meta.label}</span>
                {ev.fecha_estimada && <span style={{ color: meta.color, fontWeight: 600 }}> · llega el {new Date(`${ev.fecha_estimada}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</span>}
                {ev.archivo_url && <> · <a href={ev.archivo_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", fontWeight: 600 }}>ver archivo</a></>}
                {ev.mensaje && <div style={{ color: "var(--muted)", marginTop: 1 }}>«{ev.mensaje}»</div>}
                <span style={{ color: "var(--subtle)", fontSize: 11 }}> {fmt(ev.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
