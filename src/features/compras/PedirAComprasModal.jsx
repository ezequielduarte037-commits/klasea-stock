import { useEffect, useState } from "react";
import { ExternalLink, Send, X } from "lucide-react";
import { createPurchaseRequest, fetchProjects, notifyComprasEmail } from "@/features/compras/purchaseRequestsApi";
import { useToast } from "@/components/ui/Toast";
import { C } from "@/theme";

export default function PedirAComprasModal({ open, onClose, prefilled, profile }) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("media");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(prefilled?.title || "");
    setDescription(prefilled?.description || "");
    setPriority("media");
    setProjectId("");
    fetchProjects().then(setProjects).catch((err) => {
      toast.error(err.message || "No se pudieron cargar los proyectos.");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefilled]);

  if (!open) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const created = await createPurchaseRequest({
        form: {
          title: title.trim(),
          description: description.trim(),
          priority,
          project_id: projectId || null,
          source: prefilled?.source || null,
          source_ref: prefilled?.source_ref || null,
          source_url: prefilled?.source_url || null,
        },
      });
      notifyComprasEmail({
        type: "new_request",
        requestId: created.id,
        requestTitle: title.trim(),
        changedBy: profile?.id,
        createdByName: profile?.username || "Usuario",
        source: prefilled?.source || undefined,
      });
      toast.success("Pedido enviado a Compras");
      onClose(true);
    } catch (err) {
      toast.error(err.message || "No se pudo enviar el pedido.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.65)", display: "grid", placeItems: "center",
      padding: 20,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form onSubmit={handleSubmit} style={{
        background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: 20, width: "100%", maxWidth: 480,
        display: "grid", gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Send size={16} color={C.blue} />
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Pedir a Compras</span>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => onClose()} style={{
            border: "none", background: "none", color: C.dim, cursor: "pointer", padding: 4,
          }}><X size={16} /></button>
        </div>

        {prefilled?.source && (
          <div style={{
            fontSize: 11, color: C.dim, background: C.panel,
            borderRadius: 6, padding: "6px 10px",
          }}>
            Origen: {prefilled.sourceLabel || prefilled.source}
            {prefilled?.source_url && (
              <a href={prefilled.source_url} target="_blank" rel="noopener noreferrer"
                style={{ color: C.blue, marginLeft: 8, textDecoration: "none" }}>
                <ExternalLink size={10} style={{ display: "inline", verticalAlign: "middle" }} /> Abrir
              </a>
            )}
          </div>
        )}

        <div>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Título</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="¿Qué necesitás comprar?" required style={inp()} />
        </div>

        <div>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Descripción</div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalles, cantidades, especificaciones..." rows={3} style={inp({ resize: "vertical", minHeight: 60 })} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Prioridad</div>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={inp()}>
              {["baja", "media", "alta", "urgente"].map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Proyecto</div>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={inp()}>
              <option value="">Sin proyecto</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.codigo}</option>)}
            </select>
          </div>
        </div>

        <button type="submit" disabled={saving || !title.trim()} style={{
          border: "none", borderRadius: 8,
          background: saving ? C.panel2 : C.blue, color: "#fff",
          padding: "10px 12px", cursor: saving ? "default" : "pointer",
          fontWeight: 800, fontSize: 13, fontFamily: C.sans,
          opacity: saving || !title.trim() ? 0.5 : 1,
        }}>
          {saving ? "Enviando..." : "Enviar a Compras"}
        </button>
      </form>
    </div>
  );
}

function inp(over) {
  return {
    width: "100%", border: `1px solid ${C.border}`, borderRadius: 8,
    background: C.panel2, color: C.text, padding: "9px 11px",
    fontSize: 13, fontFamily: C.sans, outline: "none",
    ...over,
  };
}
