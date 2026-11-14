var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/features/panol/MinimumBatchEditor.jsx
var MinimumBatchEditor_exports = {};
__export(MinimumBatchEditor_exports, {
  default: () => MinimumBatchEditor
});
module.exports = __toCommonJS(MinimumBatchEditor_exports);
var import_react = require("react");
var import_react_dom = require("react-dom");

// src/theme/index.js
var status = {
  obra: {
    activa: {
      dot: "var(--blue)",
      glow: "var(--blue)",
      top: "var(--blue-deep)",
      bg: "var(--blue-soft)",
      border: "var(--blue-border)",
      label: "Activa"
    },
    pausada: {
      dot: "var(--violet)",
      glow: "var(--violet)",
      top: "var(--violet-deep)",
      bg: "var(--violet-soft)",
      border: "var(--violet-border)",
      label: "Pausada"
    },
    terminada: {
      dot: "var(--green)",
      glow: "var(--green)",
      top: "var(--green-deep)",
      bg: "var(--green-soft)",
      border: "var(--green-border)",
      label: "Terminada"
    },
    cancelada: {
      dot: "var(--red)",
      glow: "var(--red)",
      top: "var(--red-deep)",
      bg: "var(--red-soft)",
      border: "var(--red-border)",
      label: "Cancelada"
    },
    vacio: {
      dot: "var(--dim)",
      glow: "var(--empty-glow)",
      top: "transparent",
      bg: "var(--panel)",
      border: "var(--border)",
      label: "Disponible"
    }
  },
  etapa: {
    pendiente: {
      dot: "var(--dim)",
      bar: "var(--panel-2)",
      text: "var(--dim)",
      label: "Pendiente"
    },
    en_curso: {
      dot: "var(--blue)",
      bar: "var(--blue-soft)",
      text: "var(--blue)",
      label: "En curso"
    },
    completado: {
      dot: "var(--green)",
      bar: "var(--green-soft)",
      text: "var(--green)",
      label: "Completado"
    },
    bloqueado: {
      dot: "var(--red)",
      bar: "var(--red-soft)",
      text: "var(--red)",
      label: "Bloqueado"
    }
  },
  tarea: {
    pendiente: { dot: "var(--dim)", text: "var(--dim)", label: "Pendiente" },
    en_progreso: { dot: "var(--blue)", text: "var(--blue)", label: "En progreso" },
    finalizada: { dot: "var(--green)", text: "var(--green)", label: "Finalizada" },
    bloqueada: { dot: "var(--red)", text: "var(--red)", label: "Bloqueada" },
    cancelada: { dot: "var(--subtle)", text: "var(--subtle)", label: "Cancelada" }
  },
  prioridad: {
    baja: { color: "var(--dim)", label: "Baja" },
    media: { color: "var(--blue)", label: "Media" },
    alta: { color: "var(--violet)", label: "Alta" },
    critica: { color: "var(--red)", label: "Critica" }
  },
  oc: {
    pendiente: {
      dot: "var(--dim)",
      bg: "var(--panel-2)",
      border: "var(--border)",
      label: "Pendiente"
    },
    solicitada: {
      dot: "var(--blue)",
      bg: "var(--blue-soft)",
      border: "var(--blue-border)",
      label: "Solicitada"
    },
    pedida: {
      dot: "var(--blue)",
      bg: "var(--blue-soft)",
      border: "var(--blue-border)",
      label: "Pedido"
    },
    aprobada: {
      dot: "var(--teal)",
      bg: "var(--teal-soft)",
      border: "var(--teal-border)",
      label: "Aprobada"
    },
    en_camino: {
      dot: "var(--violet)",
      bg: "var(--violet-soft)",
      border: "var(--violet-border)",
      label: "En camino"
    },
    recibida: {
      dot: "var(--green)",
      bg: "var(--green-soft)",
      border: "var(--green-border)",
      label: "Recibida"
    },
    cancelada: {
      dot: "var(--red)",
      bg: "var(--red-soft)",
      border: "var(--red-border)",
      label: "Cancelada"
    }
  }
};
var C = {
  bg: "var(--bg)",
  bg1: "var(--panel-solid)",
  bg2: "var(--panel-solid-2)",
  bg3: "var(--panel-solid-3)",
  panel: "var(--panel)",
  panel2: "var(--panel-2)",
  panel3: "var(--panel-3)",
  panelSolid: "var(--panel-solid)",
  panelSolid2: "var(--panel-solid-2)",
  panelSolid3: "var(--panel-solid-3)",
  card: "var(--panel)",
  s0: "var(--panel)",
  s1: "var(--panel-2)",
  s2: "var(--panel-3)",
  border: "var(--border)",
  border2: "var(--border-2)",
  b0: "var(--border)",
  b1: "var(--border-2)",
  b2: "var(--border-3)",
  topbar: "var(--topbar)",
  topbarSoft: "var(--topbar-soft)",
  text: "var(--text)",
  muted: "var(--muted)",
  dim: "var(--dim)",
  t0: "var(--text)",
  t1: "var(--muted)",
  t2: "var(--dim)",
  t3: "var(--subtle)",
  blue: "var(--blue)",
  primary: "var(--blue)",
  green: "var(--green)",
  red: "var(--red)",
  violet: "var(--violet)",
  purple: "var(--purple)",
  teal: "var(--teal)",
  cyan: "var(--cyan)",
  orange: "var(--orange)",
  indigo: "var(--indigo)",
  blueL: "var(--blue-soft)",
  blueB: "var(--blue-border)",
  violetL: "var(--violet-soft)",
  violetB: "var(--violet-border)",
  greenL: "var(--green-soft)",
  greenB: "var(--green-border)",
  redL: "var(--red-soft)",
  redB: "var(--red-border)",
  // Las variables ya existían en palette.css (dark, light y alto contraste)
  // pero no estaban expuestas acá, así que teal y cyan sólo se podían usar como
  // color plano, sin fondo ni borde suaves.
  tealL: "var(--teal-soft)",
  tealB: "var(--teal-border)",
  cyanL: "var(--cyan-soft)",
  cyanB: "var(--cyan-border)",
  orangeL: "var(--orange-soft)",
  orangeB: "var(--orange-border)",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
  sans: "'Outfit', system-ui, sans-serif",
  ...status
};

// src/features/panol/MinimumBatchEditor.jsx
var import_jsx_runtime = require("react/jsx-runtime");
function minimumValue(text) {
  if (text.trim() === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? value : NaN;
}
var MinimumRow = (0, import_react.memo)(function MinimumRow2({ group, value, onChange, disabled, error }) {
  const invalid = Number.isNaN(minimumValue(value));
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { style: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid ${C.border}` }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { minWidth: 0 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { display: "block", color: C.text, fontSize: 12.5, fontWeight: 650 }, children: group.label }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { style: { display: "block", color: C.dim, fontSize: 11, marginTop: 3 }, children: [group.codigo, group.proveedor, group.unidad || "unidad"].filter(Boolean).join(" \xB7 ") }),
      error && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "alert", style: { display: "block", color: C.red, fontSize: 11, marginTop: 3 }, children: error })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        "data-minimum-batch-input": true,
        "aria-label": `M\xEDnimo de ${group.label}`,
        "aria-invalid": invalid || void 0,
        type: "number",
        min: "0",
        step: "any",
        placeholder: "Sin m\xEDnimo",
        value,
        disabled,
        onChange: (event) => onChange(group.material.id, event.target.value),
        style: { width: "100%", boxSizing: "border-box", border: `1px solid ${invalid || error ? C.redB : C.border2}`, borderRadius: 8, padding: "8px", background: C.panelSolid, color: C.text, fontFamily: C.mono, textAlign: "right" }
      }
    )
  ] });
});
function MinimumBatchEditor({ groups, onSave, onClose }) {
  const [products, setProducts] = (0, import_react.useState)(() => [...new Map(groups.filter((g) => g.material?.id).map((g) => [g.material.id, g])).values()]);
  const [drafts, setDrafts] = (0, import_react.useState)({});
  const [errors, setErrors] = (0, import_react.useState)({});
  const [query, setQuery] = (0, import_react.useState)("");
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [message, setMessage] = (0, import_react.useState)("");
  const listRef = (0, import_react.useRef)(null);
  const savingRef = (0, import_react.useRef)(false);
  const change = (0, import_react.useCallback)((id, value) => {
    setDrafts((prev) => ({ ...prev, [id]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setMessage("");
  }, []);
  const changes = (0, import_react.useMemo)(() => products.filter((g) => {
    const id = g.material.id;
    return Object.hasOwn(drafts, id) && minimumValue(drafts[id]) !== (g.stockMinimo == null ? null : Number(g.stockMinimo));
  }), [drafts, products]);
  const invalid = changes.some((g) => Number.isNaN(minimumValue(drafts[g.material.id])));
  const visible = (0, import_react.useMemo)(() => {
    const normalize = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const term = normalize(query.trim());
    return products.filter((g) => normalize([g.label, g.codigo, g.proveedor].join(" ")).includes(term));
  }, [products, query]);
  function close() {
    if (savingRef.current) return;
    if (changes.length && !window.confirm("Hay m\xEDnimos sin guardar. \xBFDescartar esos cambios y cerrar?")) return;
    onClose();
  }
  async function save() {
    if (!changes.length || invalid || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setErrors({});
    const saved = /* @__PURE__ */ new Map();
    const failed = {};
    try {
      for (const group of changes) {
        const id = group.material.id;
        const value = minimumValue(drafts[id]);
        try {
          await onSave(group, value, { silent: true });
          saved.set(id, value);
        } catch (error) {
          failed[id] = error.message || "No se pudo guardar. Volv\xE9 a intentarlo.";
        }
      }
      setProducts((prev) => prev.map((g) => saved.has(g.material.id) ? { ...g, stockMinimo: saved.get(g.material.id) } : g));
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !saved.has(id))));
      setErrors(failed);
      setMessage(`${saved.size} m\xEDnimo${saved.size === 1 ? "" : "s"} guardado${saved.size === 1 ? "" : "s"}.${Object.keys(failed).length ? ` Quedan ${Object.keys(failed).length} sin guardar; pod\xE9s reintentarlos.` : " Pod\xE9s seguir cargando."}`);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  const button = { border: `1px solid ${C.border2}`, borderRadius: 8, padding: "9px 12px", background: C.panelSolid, color: C.text, cursor: "pointer", fontFamily: C.sans, fontWeight: 650, fontSize: 12 };
  return (0, import_react_dom.createPortal)(
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { position: "fixed", inset: 0, zIndex: 1200, background: "var(--overlay)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", padding: 12 }, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "section",
      {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "minimum-batch-title",
        onKeyDown: (event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
          if (event.key === "Enter" && event.target.matches("[data-minimum-batch-input]")) {
            event.preventDefault();
            const inputs = [...listRef.current.querySelectorAll("[data-minimum-batch-input]")];
            const next = inputs[inputs.indexOf(event.target) + (event.shiftKey ? -1 : 1)];
            next?.focus();
            next?.select();
          }
          if (event.key === "Tab") {
            const focusable = [...event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled)")];
            const first = focusable[0], last = focusable.at(-1);
            if (event.shiftKey && event.target === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && event.target === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        },
        style: { width: "min(760px, 100%)", maxHeight: "min(780px, 92dvh)", display: "flex", flexDirection: "column", minHeight: 0, background: C.panelSolid, border: `1px solid ${C.border2}`, borderRadius: 14, boxShadow: "0 18px 60px var(--shadow)", overflow: "hidden" },
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: 16, borderBottom: `1px solid ${C.border}`, display: "grid", gap: 10 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { id: "minimum-batch-title", style: { color: C.text, fontSize: 16, fontWeight: 750 }, children: "Editar m\xEDnimos" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { color: C.dim, fontSize: 12 }, children: "Carg\xE1 varios productos y guardalos juntos. Tab o Enter pasa al siguiente. Vac\xEDo quita el m\xEDnimo." }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { autoFocus: true, "aria-label": "Buscar productos para editar m\xEDnimos", placeholder: "Buscar por producto, c\xF3digo o proveedor\u2026", value: query, onChange: (e) => setQuery(e.target.value), style: { ...button, width: "100%", boxSizing: "border-box", fontWeight: 400, cursor: "text" } }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { style: { color: C.dim, fontSize: 11 }, children: [
              visible.length,
              " productos \xB7 ",
              changes.length,
              " cambios pendientes"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { ref: listRef, style: { overflowY: "auto", minHeight: 0, flex: 1 }, children: [
            visible.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MinimumRow, { group, value: drafts[group.material.id] ?? (group.stockMinimo == null ? "" : String(group.stockMinimo)), onChange: change, disabled: saving, error: errors[group.material.id] }, group.material.id)),
            !visible.length && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { style: { padding: 24, color: C.dim }, children: "No hay productos para esta b\xFAsqueda." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { style: { padding: "12px 16px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { role: "status", style: { color: Object.keys(errors).length || invalid ? C.red : C.dim, fontSize: 12, flex: "1 1 220px" }, children: invalid ? "Revis\xE1 los m\xEDnimos: deben ser n\xFAmeros mayores o iguales a cero." : message || "La lista mantiene su posici\xF3n al guardar." }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: saving, onClick: close, style: button, children: "Cerrar" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: saving || !changes.length || invalid, onClick: save, style: { ...button, borderColor: C.blueB, background: C.blueL, color: C.blue, opacity: saving || !changes.length || invalid ? 0.6 : 1 }, children: saving ? "Guardando\u2026" : `Guardar m\xEDnimos${changes.length ? ` (${changes.length})` : ""}` })
          ] })
        ]
      }
    ) }),
    document.body
  );
}
