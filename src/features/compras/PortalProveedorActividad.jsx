import { useEffect, useState } from "react";
import { CheckCircle2, FileUp, MessageSquare } from "lucide-react";
import { C } from "@/theme";
import { supabase } from "@/supabaseClient";

// Actividad del proveedor vía portal (link mágico): confirmaciones de entrega,
// facturas subidas y mensajes. No renderiza nada si el pedido no tiene actividad.
const TIPO_META = {
  entrega_confirmada: { icon: CheckCircle2, color: "#10b981", label: "Confirmó la entrega" },
  factura: { icon: FileUp, color: "#3b82f6", label: "Subió una factura" },
  comentario: { icon: MessageSquare, color: "#a78bfa", label: "Mensaje" },
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
    <div style={{ margin: "10px 16px 0", border: "1px solid rgba(16,185,129,0.25)", background: "rgba(16,185,129,0.05)", borderRadius: 12, padding: "10px 13px" }}>
      <div style={{ fontSize: 10.5, fontWeight: 850, color: C.green, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>
        Actividad del proveedor (portal)
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {eventos.map((ev) => {
          const meta = TIPO_META[ev.tipo] || TIPO_META.comentario;
          const Icon = meta.icon;
          return (
            <div key={ev.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
              <Icon size={14} style={{ color: meta.color, flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <span style={{ color: C.text, fontWeight: 750 }}>{ev.proveedor}</span>
                <span style={{ color: C.dim }}> · {meta.label}</span>
                {ev.fecha_estimada && <span style={{ color: meta.color, fontWeight: 750 }}> · llega {new Date(`${ev.fecha_estimada}T12:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</span>}
                {ev.archivo_url && <> · <a href={ev.archivo_url} target="_blank" rel="noreferrer" style={{ color: "#3b82f6", fontWeight: 750 }}>ver archivo</a></>}
                {ev.mensaje && <div style={{ color: C.dim, marginTop: 1 }}>"{ev.mensaje}"</div>}
                <span style={{ color: C.dim, fontSize: 11 }}> {fmt(ev.created_at)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
