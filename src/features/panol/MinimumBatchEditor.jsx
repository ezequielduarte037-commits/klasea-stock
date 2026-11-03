import { memo, useCallback, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { C } from "@/theme";

function minimumValue(text) {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}

const MinimumRow = memo(function MinimumRow({ group, value, onChange, disabled, error }) {
  const invalid = Number.isNaN(minimumValue(value));
  return (
    <label style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.text, fontSize: 12.5, fontWeight: 650 }}>{group.label}</span>
        <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 3 }}>{[group.codigo, group.proveedor, group.unidad || "unidad"].filter(Boolean).join(" · ")}</span>
        {error && <span role="alert" style={{ display: "block", color: C.red, fontSize: 11, marginTop: 3 }}>{error}</span>}
      </span>
      <input
        data-minimum-batch-input
        aria-label={`Mínimo de ${group.label}`}
        aria-invalid={invalid || undefined}
        type="number" min="0" step="any" placeholder="Sin mínimo"
        value={value} disabled={disabled}
        onChange={(event) => onChange(group.material.id, event.target.value)}
        style={{ width: "100%", boxSizing: "border-box", border: `1px solid ${invalid || error ? C.redB : C.border2}`, borderRadius: 8, padding: "8px", background: C.panelSolid, color: C.text, fontFamily: C.mono, textAlign: "right" }}
      />
    </label>
  );
});

export default function MinimumBatchEditor({ groups, onSave, onClose }) {
  // La lista conserva su orden incluso si cambia el nivel de stock al guardar.
  const [products, setProducts] = useState(() => [...new Map(groups.filter((g) => g.material?.id).map((g) => [g.material.id, g])).values()]);
  const [drafts, setDrafts] = useState({});
  const [errors, setErrors] = useState({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const listRef = useRef(null);
  const savingRef = useRef(false);
  const change = useCallback((id, value) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setMessage("");
  }, []);
  const changes = useMemo(() => products.filter((g) => {
    const id = g.material.id;
    return Object.hasOwn(drafts, id) && minimumValue(drafts[id]) !== (g.stockMinimo == null ? null : Number(g.stockMinimo));
  }), [drafts, products]);
  const invalid = changes.some((g) => Number.isNaN(minimumValue(drafts[g.material.id])));
  const visible = useMemo(() => {
    const normalize = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const term = normalize(query.trim());
    return products.filter((g) => normalize([g.label, g.codigo, g.proveedor].join(" ")).includes(term));
  }, [products, query]);

  function close() {
    if (savingRef.current) return;
    if (changes.length && !window.confirm("Hay mínimos sin guardar. ¿Descartar esos cambios y cerrar?")) return;
    onClose();
  }

  async function save() {
    if (!changes.length || invalid || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setErrors({});
    const saved = new Map();
    const failed = {};
    try {
      for (const group of changes) {
        const id = group.material.id;
        const value = minimumValue(drafts[id]);
        try {
          await onSave(group, value, { silent: true });
          saved.set(id, value);
        } catch (error) {
          failed[id] = error.message || "No se pudo guardar. Volvé a intentarlo.";
        }
      }
      setProducts((prev) => prev.map((g) => saved.has(g.material.id) ? { ...g, stockMinimo: saved.get(g.material.id) } : g));
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !saved.has(id))));
      setErrors(failed);
      setMessage(`${saved.size} mínimo${saved.size === 1 ? "" : "s"} guardado${saved.size === 1 ? "" : "s"}.${Object.keys(failed).length ? ` Quedan ${Object.keys(failed).length} sin guardar; podés reintentarlos.` : " Podés seguir cargando."}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const button = { border: `1px solid ${C.border2}`, borderRadius: 8, padding: "9px 12px", background: C.panelSolid, color: C.text, cursor: "pointer", fontFamily: C.sans, fontWeight: 650, fontSize: 12 };
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 1200, background: "var(--overlay)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 12 }}>
      <section
        role="dialog" aria-modal="true" aria-labelledby="minimum-batch-title"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); close(); }
          if (event.key === "Enter" && event.target.matches("[data-minimum-batch-input]")) {
            event.preventDefault();
            const inputs = [...listRef.current.querySelectorAll("[data-minimum-batch-input]")];
            const next = inputs[inputs.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
            next?.focus();
            next?.select();
          }
          if (event.key === "Tab") {
            const focusable = [...event.currentTarget.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && event.target === first) { event.preventDefault(); last?.focus(); }
            else if (!event.shiftKey && event.target === last) { event.preventDefault(); first?.focus(); }
          }
        }}
        style={{ width: "min(760px, 100%)", maxHeight: "min(780px, 92dvh)", display: "flex", flexDirection: "column", minHeight: 0, background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 14, boxShadow: "0 18px 60px var(--shadow)", overflow: "hidden" }}
      >
        <div style={{ padding: 16, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
          <div id="minimum-batch-title" style={{ color: C.text, fontSize: 16, fontWeight: 750 }}>Editar mínimos</div>
          <div style={{ color: C.dim, fontSize: 12 }}>Cargá varios productos y guardalos juntos. Tab o Enter pasa al siguiente. Vacío quita el mínimo.</div>
          <input autoFocus aria-label="Buscar productos para editar mínimos" placeholder="Buscar por producto, código o proveedor…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ ...button, width: "100%", boxSizing: "border-box", fontWeight: 400, cursor: "text" }} />
          <span style={{ color: C.dim, fontSize: 11 }}>{visible.length} productos · {changes.length} cambios pendientes</span>
        </div>
        <div ref={listRef} style={{ overflowY: "auto", minHeight: 0, flex: 1 }}>
          {visible.map((group) => <MinimumRow key={group.material.id} group={group} value={drafts[group.material.id] ?? (group.stockMinimo == null ? "" : String(group.stockMinimo))} onChange={change} disabled={saving} error={errors[group.material.id]} />)}
          {!visible.length && <div style={{ padding: 24, color: C.dim }}>No hay productos para esta búsqueda.</div>}
        </div>
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <span role="status" style={{ color: Object.keys(errors).length || invalid ? C.red : C.dim, fontSize: 12, flex: "1 1 220px" }}>{invalid ? "Revisá los mínimos: deben ser números mayores o iguales a cero." : message || "La lista mantiene su posición al guardar."}</span>
          <button type="button" disabled={saving} onClick={close} style={button}>Cerrar</button>
          <button type="button" disabled={saving || !changes.length || invalid} onClick={save} style={{ ...button, borderColor: C.blueB, background: C.blueL, color: C.blue, opacity: saving || !changes.length || invalid ? 0.6 : 1 }}>{saving ? "Guardando…" : `Guardar mínimos${changes.length ? ` (${changes.length})` : ""}`}</button>
        </div>
      </section>
    </div>, document.body,
  );
}
