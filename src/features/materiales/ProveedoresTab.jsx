import { useMemo, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { bajaProveedor, guardarProveedor } from "./api";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, LBL, Td, Th } from "@/features/rrhh/ui";
import { C } from "@/theme";
import ProveedorTipoBadge from "./ProveedorTipoBadge";
import { PROVEEDOR_TIPOS, proveedorTipoUi } from "./proveedorMeta";

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function formatCuit(value) {
  const d = digits(value);
  if (d.length !== 11) return value || "";
  return `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`;
}

function emptyProveedor() {
  return { nombre: "", cuit: "", email: "", telefono: "", notas: "", tipo: "", rubros: "", sede: "", perfil: "", compite_con: "", activo: true };
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
      .filter((p) => !query || `${p.nombre ?? ""} ${p.cuit ?? ""} ${p.email ?? ""} ${p.tipo ?? ""} ${p.rubros ?? ""} ${p.sede ?? ""} ${p.perfil ?? ""} ${p.compite_con ?? ""}`.toLowerCase().includes(query))
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
              <label style={LBL}>Tipo</label>
              <select value={editing.tipo || ""} onChange={(e) => setEditing((p) => ({ ...p, tipo: e.target.value || null }))} style={{ ...INP, width: "100%" }}>
                <option value="">Sin clasificar</option>
                {PROVEEDOR_TIPOS.map((tipo) => <option key={tipo} value={tipo}>{proveedorTipoUi(tipo)?.label || tipo}</option>)}
              </select>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={LBL}>Rubros</label>
              <input value={editing.rubros || ""} onChange={(e) => setEditing((p) => ({ ...p, rubros: e.target.value }))} placeholder="Que trae" style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Sede predominante</label>
              <input value={editing.sede || ""} onChange={(e) => setEditing((p) => ({ ...p, sede: e.target.value }))} placeholder="Pampa / Chubut" style={{ ...INP, width: "100%" }} />
            </div>
            <div>
              <label style={LBL}>Compite con</label>
              <input value={editing.compite_con || ""} onChange={(e) => setEditing((p) => ({ ...p, compite_con: e.target.value }))} placeholder="Grupo comparable" style={{ ...INP, width: "100%" }} />
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={LBL}>Perfil</label>
            <input value={editing.perfil || ""} onChange={(e) => setEditing((p) => ({ ...p, perfil: e.target.value }))} placeholder="Contexto del proveedor" style={{ ...INP, width: "100%" }} />
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
        <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Tipo</Th>
              <Th>Rubros / sede</Th>
              <Th>Contacto</Th>
              <Th>Notas</Th>
              <Th>Acción</Th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id}>
                <Td>
                  <div style={{ display: "grid", gap: 3 }}>
                    <span style={{ color: C.t0, fontWeight: 850 }}>{p.nombre}</span>
                    {p.compite_con && <span style={{ color: C.t3, fontSize: 11 }}>Compite: {p.compite_con}</span>}
                  </div>
                </Td>
                <Td><ProveedorTipoBadge meta={p} showUnclassified /></Td>
                <Td color={C.t1}>
                  <div style={{ display: "grid", gap: 3, fontSize: 12 }}>
                    <span>{p.rubros || "—"}</span>
                    {p.sede && <span style={{ color: C.t3 }}>Sede: {p.sede}</span>}
                  </div>
                </Td>
                <Td color={C.t1}>
                  <div style={{ display: "grid", gap: 3, fontSize: 12 }}>
                    <span>{p.cuit || "—"}</span>
                    {p.email && <span>{p.email}</span>}
                    {p.telefono && <span>{p.telefono}</span>}
                  </div>
                </Td>
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
