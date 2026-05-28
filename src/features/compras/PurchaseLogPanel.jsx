import { useEffect, useState } from "react";
import {
  Calendar,
  DollarSign,
  FileText,
  ImagePlus,
  Package,
  Pencil,
  Plus,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createPurchaseLog,
  deletePurchaseLog,
  fetchPurchaseLog,
  uploadPurchaseLogInvoice,
  usernameOf,
} from "@/features/compras/purchaseRequestsApi";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { C } from "@/theme";

export default function PurchaseLogPanel({ profile }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [form, setForm] = useState({ description: "", amount: "", provider: "", notes: "", purchased_at: new Date().toISOString().slice(0, 10) });

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchPurchaseLog();
      setEntries(data);
    } catch (err) {
      toast.error(err.message || "No se pudo cargar el registro de compras.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm({ description: "", amount: "", provider: "", notes: "", purchased_at: new Date().toISOString().slice(0, 10) });
    setInvoiceFile(null);
    setShowForm(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      let invoice_url, invoice_path;
      if (invoiceFile) {
        const r = await uploadPurchaseLogInvoice(invoiceFile, profile.id);
        invoice_url = r.url;
        invoice_path = r.path;
      }
      const entry = {
        description: form.description.trim(),
        amount: form.amount ? Number(form.amount) : null,
        provider: form.provider.trim() || null,
        notes: form.notes.trim() || null,
        purchased_at: form.purchased_at || new Date().toISOString().slice(0, 10),
        invoice_url: invoice_url || null,
        invoice_path: invoice_path || null,
      };
      await createPurchaseLog(entry);
      toast.success("Compra registrada");
      resetForm();
      load();
    } catch (err) {
      toast.error(err.message || "No se pudo guardar la compra.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    const ok = await confirm({
      title: "Eliminar registro",
      message: "Esto borra la compra manual del log.",
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePurchaseLog(id);
      toast.success("Registro eliminado");
      load();
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar el registro.");
    }
  }

  const thisMonth = entries.filter((e) => {
    const d = new Date(e.purchased_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthlyTotal = thisMonth.reduce((s, e) => s + Number(e.amount || 0), 0);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {/* mini widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <div style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Este mes</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: C.text, fontSize: 20, fontWeight: 800, fontFamily: C.mono }}>
              ${Number(monthlyTotal).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
            </span>
            <span style={{ color: C.dim, fontSize: 11 }}>en {thisMonth.length} compras</span>
          </div>
        </div>
        <div style={{ padding: "12px 14px", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
          <div style={{ color: C.dim, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>Total registrado</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ color: C.text, fontSize: 20, fontWeight: 800, fontFamily: C.mono }}>
              ${Number(entries.reduce((s, e) => s + Number(e.amount || 0), 0)).toLocaleString("es-AR", { minimumFractionDigits: 0 })}
            </span>
            <span style={{ color: C.dim, fontSize: 11 }}>{entries.length} registros</span>
          </div>
        </div>
      </div>

      {/* form toggle */}
      <div>
        {!showForm ? (
          <button type="button" onClick={() => setShowForm(true)} style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            border: `1px solid ${C.border2}`, background: C.panel2, color: C.text,
            borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 13, fontWeight: 750,
          }}>
            <Plus size={14} /> Cargar compra manual
          </button>
        ) : (
          <form onSubmit={handleSubmit} style={{
            border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel, padding: 16,
            display: "grid", gap: 10,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 13, fontWeight: 750, color: C.text }}>Nueva compra manual</div>
              <button type="button" onClick={resetForm} style={{
                border: "none", background: "none", color: C.dim, cursor: "pointer", padding: 4,
              }}><X size={14} /></button>
            </div>

            <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="¿Qué compraste?" required
              style={inp()} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 10px", background: C.panel2 }}>
                <DollarSign size={14} color={C.dim} />
                <input value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  type="number" step="0.01" min="0" placeholder="Monto" style={inp({ border: "none", background: "transparent" })} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 10px", background: C.panel2 }}>
                <Store size={14} color={C.dim} />
                <input value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}
                  placeholder="Proveedor" style={inp({ border: "none", background: "transparent" })} />
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, padding: "0 10px", background: C.panel2 }}>
              <Calendar size={14} color={C.dim} />
              <input value={form.purchased_at} onChange={(e) => setForm((f) => ({ ...f, purchased_at: e.target.value }))}
                type="date" style={inp({ border: "none", background: "transparent" })} />
            </div>

            <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Notas (opcional)" rows={2}
              style={inp({ resize: "vertical", minHeight: 40 })} />

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 11px",
                cursor: "pointer", fontSize: 12, color: C.muted, background: C.panel2,
              }}>
                <ImagePlus size={14} /> {invoiceFile ? invoiceFile.name : "Factura"}
                <input type="file" accept="image/*,.pdf" onChange={(e) => setInvoiceFile(e.target.files[0])}
                  style={{ display: "none" }} />
              </label>
              {invoiceFile && (
                <button type="button" onClick={() => setInvoiceFile(null)} style={{
                  border: "none", background: "none", color: C.red, cursor: "pointer", fontSize: 11,
                }}>Quitar</button>
              )}
              <div style={{ flex: 1 }} />
              <button type="submit" disabled={saving || !form.description.trim()} style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "none", background: C.blue, color: "#fff", borderRadius: 8,
                padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 700,
                opacity: saving || !form.description.trim() ? 0.5 : 1,
              }}>
                {saving ? "Guardando..." : <><Upload size={13} /> Guardar</>}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* list */}
      <div style={{ display: "grid", gap: 6 }}>
        {loading ? (
          <div style={{ display: "grid", placeItems: "center", padding: 40, color: C.dim, fontSize: 13 }}>
            <span style={{ display: "inline-block", width: 14, height: 14, border: `2px solid ${C.border2}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          </div>
        ) : entries.length === 0 ? (
          <div style={{ display: "grid", placeItems: "center", padding: 40, color: C.dim, fontSize: 13, border: `1px dashed ${C.border}`, borderRadius: 10 }}>
            <Package size={28} color={C.border2} style={{ marginBottom: 8 }} />
            <div>No hay compras registradas</div>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} style={{
              display: "grid", gridTemplateColumns: "1fr auto",
              gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: "10px 14px",
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{entry.description}</span>
                  {entry.amount && (
                    <span style={{ fontSize: 13, fontWeight: 800, fontFamily: C.mono, color: C.green }}>
                      ${Number(entry.amount).toLocaleString("es-AR", { minimumFractionDigits: 2 })}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: C.dim }}>
                  {entry.provider && <span><Store size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 3 }} />{entry.provider}</span>}
                  <span>{new Date(entry.purchased_at).toLocaleDateString("es-AR")}</span>
                  <span>{usernameOf(entry.creator)}</span>
                  {entry.invoice_url && (
                    <a href={entry.invoice_url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "underline" }}>
                      <FileText size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 2 }} />Factura
                    </a>
                  )}
                  {entry.notes && <span style={{ color: C.muted }}>· {entry.notes}</span>}
                </div>
              </div>
              <button type="button" onClick={() => handleDelete(entry.id)} style={{
                border: "none", background: "none", color: C.dim, cursor: "pointer", padding: 4, alignSelf: "start",
              }} title="Eliminar"><Trash2 size={13} /></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function inp(over) {
  return {
    width: "100%",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    background: C.panel2,
    color: C.text,
    padding: "9px 11px",
    fontSize: 13,
    fontFamily: C.sans,
    outline: "none",
    ...over,
  };
}
