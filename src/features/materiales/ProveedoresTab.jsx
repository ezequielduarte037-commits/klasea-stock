import { useMemo, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { bajaProveedor, guardarProveedor } from "./api";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, LBL, Td, Th } from "@/features/rrhh/ui";
import { C } from "@/theme";

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatCuit(value) {
  const d = digits(value);
  if (d.length !== 11) return value || "";
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function emptyProveedor() {
  return { nombre: "", cuit: "", email: "", telefono: "", notas: "", activo: true };
}

export default function ProveedoresTab({ proveedores, onChanged }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const visibles = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...(proveedores ?? [])]
      .filter((p) => p.activo !== false)
      .filter((p) => !query || `${p.nombre ?? ""} ${p.cuit ?? ""} ${p.email ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => String(a.nombre ?? "").localeCompare(String(b.nombre ?? ""), "es"));
  }, [proveedores, q]);

  async function save(e) {
    e.preventDefault();
    if (!editing?.nombre?.trim() || saving) return;
    const cuitDigits = digits(editing.cuit);
    if (editing.cuit && cuitDigits.length !== 11) {
      setErr(new Error("El CUIT debe tener 11 dígitos o quedar vacío."));
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await guardarProveedor({ ...editing, cuit: editing.cuit ? formatCuit(editing.cuit) : null });
      setEditing(null);
      await onChanged?.();
    } catch (error) {
      setErr(error);
    } finally {
      setSaving(false);
    }
  }

  async function remove(proveedor) {
    if (!window.confirm(`¿Dar de baja "${proveedor.nombre}"?`)) return;
    await bajaProveedor(proveedor.id);
    await onChanged?.();
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 260px", minWidth: 220 }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: C.t2 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor" style={{ ...INP, width: "100%", paddingLeft: 30 }} />
        </div>
        <button type="button" onClick={() => setEditing(emptyProveedor())} style={BTN_PRIMARY}>
          <Plus size={14} /> Nuevo proveedor
        </button>
      </div>

      {editing && (
        <form onSubmit={save} style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={LBL}>Nombre</label>
              <input autoFocus value={editing.nombre || ""} onChange={(e) => setEditing((p) => ({ ...p, nombre: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>CUIT</label>
              <input value={editing.cuit || ""} onChange={(e) => setEditing((p) => ({ ...p, cuit: e.target.value }))} onBlur={(e) => setEditing((p) => ({ ...p, cuit: formatCuit(e.target.value) }))} placeholder="XX-XXXXXXXX-X" style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Email</label>
              <input value={editing.email || ""} onChange={(e) => setEditing((p) => ({ ...p, email: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Teléfono</label>
              <input value={editing.telefono || ""} onChange={(e) => setEditing((p) => ({ ...p, telefono: e.target.value }))} style={{ ...INP, width: "100%" }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Notas</label>
            <input value={editing.notas || ""} onChange={(e) => setEditing((p) => ({ ...p, notas: e.target.value }))} style={{ ...INP, width: "100%" }} />
          </div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{String(err.message ?? err)}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={saving || !editing.nombre?.trim()} style={BTN_GREEN}>
              <Save size={14} /> {saving ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" onClick={() => setEditing(null)} style={BTN}>Cancelar</button>
          </div>
        </form>
      )}

      <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 12 }}>
        <table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>CUIT</Th>
              <Th>Email</Th>
              <Th>Teléfono</Th>
              <Th>Notas</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id}>
                <Td>{p.nombre}</Td>
                <Td mono color={C.t1}>{p.cuit || "—"}</Td>
                <Td color={C.t1}>{p.email || "—"}</Td>
                <Td color={C.t1}>{p.telefono || "—"}</Td>
                <Td color={C.t2}>{p.notas || "—"}</Td>
                <Td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" onClick={() => setEditing(p)} style={{ ...BTN, padding: "6px 9px" }}>Editar</button>
                    <button type="button" onClick={() => remove(p)} style={{ ...BTN, color: C.red, padding: "6px 9px" }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
            {!visibles.length && (
              <tr>
                <td colSpan={6} style={{ padding: 18, textAlign: "center", color: C.t2, fontSize: 13 }}>
                  No hay proveedores con ese filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
