var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// .tmp/minimum-save-harness.jsx
var minimum_save_harness_exports = {};
__export(minimum_save_harness_exports, {
  default: () => Harness
});
module.exports = __toCommonJS(minimum_save_harness_exports);
var import_react = __toESM(require("react"), 1);

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

// .tmp/minimum-save-harness.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var qty = (v, f = 0) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : f;
};
var fmtQty = String;
function MinimumEditor({ group, canEdit, onSave, draftEntry, onDraftChange }) {
  const initial = group.stockMinimo == null ? "" : String(group.stockMinimo);
  const draft = draftEntry?.text ?? initial;
  const [saving, setSaving] = (0, import_react.useState)(false);
  const [focused, setFocused] = (0, import_react.useState)(false);
  const normalizedDraft = draft.trim() === "" ? null : qty(draft, NaN);
  const normalizedCurrent = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
  const dirty = normalizedDraft !== normalizedCurrent;
  const valid = normalizedDraft === null || Number.isFinite(normalizedDraft) && normalizedDraft >= 0;
  async function save() {
    if (!canEdit || !dirty || !valid || saving) return;
    setSaving(true);
    try {
      await onSave(group, normalizedDraft);
    } catch {
    } finally {
      setSaving(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { onClick: (event) => event.stopPropagation(), onKeyDown: (event) => event.stopPropagation(), style: { display: "flex", alignItems: "center", gap: 5 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        className: `stock-minimum-input${dirty || focused || !valid ? " is-active" : ""}`,
        type: "number",
        min: "0",
        step: "0.01",
        value: draft,
        disabled: !canEdit || saving,
        onChange: (event) => onDraftChange(group, event.target.value),
        onFocus: () => setFocused(true),
        onBlur: () => setFocused(false),
        onKeyDown: (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
        },
        placeholder: "\u2014",
        title: "Dejalo vac\xEDo para quitar el m\xEDnimo",
        style: { width: 72, minWidth: 0, boxSizing: "border-box", border: `1px solid ${!valid ? C.redB : dirty || focused ? C.blueB : "transparent"}`, background: dirty || focused ? C.panelSolid : "transparent", color: C.text, borderRadius: 7, padding: "5px 6px", textAlign: "right", fontFamily: C.mono, fontSize: 11.5, fontWeight: 700, outline: "none", opacity: canEdit ? 1 : 0.72 }
      }
    ),
    canEdit && dirty && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", disabled: !valid || saving, onClick: save, style: { border: `1px solid ${valid ? C.greenB : C.border}`, background: valid ? C.greenL : C.panel2, color: valid ? C.green : C.dim, borderRadius: 7, padding: "6px 7px", cursor: valid && !saving ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 700 }, children: saving ? "..." : "Guardar" })
  ] });
}
function Harness() {
  const [rows, setRows] = (0, import_react.useState)([{ key: "a", material_id: "a", material: { id: "a" }, label: "Placas", stock_minimo: 5 }, { key: "b", material_id: "b", material: { id: "b" }, label: "Bomba", stock_minimo: 4 }, { key: "c", material_id: "c", material: { id: "c" }, label: "Cable", stock_minimo: 1 }]);
  const [minimumDrafts, setMinimumDrafts] = (0, import_react.useState)({});
  const [savingMinimums, setSavingMinimums] = (0, import_react.useState)(false);
  const minimumSavingRef = (0, import_react.useRef)(false);
  const changeMinimumDraft = (0, import_react.useCallback)((group, text) => {
    const id = group.material?.id;
    if (!id) return;
    const value = text.trim() === "" ? null : qty(text, NaN);
    const current = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
    const valid = value === null || Number.isFinite(value) && value >= 0;
    setMinimumDrafts((prev) => {
      const next = { ...prev };
      if (valid && value === current) delete next[id];
      else next[id] = { group, text, value, valid };
      return next;
    });
  }, []);
  const productGroups = rows.map((r) => ({ ...r, stockMinimo: r.stock_minimo }));
  const minimumFilterKey = "same";
  const [, setMinimumListOrder] = (0, import_react.useState)(null);
  const [, setCatalogRows] = (0, import_react.useState)([]);
  const [, setReplenishmentCatalog] = (0, import_react.useState)([]);
  const productListRef = (0, import_react.useRef)(null);
  const toast = { success: () => {
  }, error: () => {
  } };
  const actualizarStockMinimoPanol = async (id, v) => {
    window.calls.push([id, v]);
    if (id === "b" && window.fail) throw Error("Offline");
  };
  const saveStockMinimum = (0, import_react.useCallback)(async (group, value, { silent = false } = {}) => {
    const materialId = group?.material?.id;
    try {
      await actualizarStockMinimoPanol(materialId, value);
      const list = productListRef.current;
      const top = list?.scrollTop;
      const left = list?.scrollLeft;
      setMinimumListOrder({ filterKey: minimumFilterKey, keys: productGroups.map((item) => item.key) });
      setRows((prev) => prev.map((row) => row.material_id === materialId ? { ...row, stock_minimo: value } : row));
      setCatalogRows((prev) => prev.map((material) => material.id === materialId ? { ...material, stock_minimo: value } : material));
      setReplenishmentCatalog((prev) => prev.map((material) => material.id === materialId ? { ...material, stock_minimo: value } : material));
      setMinimumDrafts((prev) => {
        if (prev[materialId]?.value !== value) return prev;
        const next = { ...prev };
        delete next[materialId];
        return next;
      });
      requestAnimationFrame(() => {
        if (list?.isConnected) {
          list.scrollTop = top;
          list.scrollLeft = left;
        }
      });
      if (!silent) toast?.success?.(value == null ? "Stock m\xEDnimo quitado." : `Stock m\xEDnimo guardado: ${fmtQty(value)} ${group.unidad || "u"}.`);
    } catch (error) {
      if (!silent) toast?.error?.(error.message || "No se pudo guardar el stock m\xEDnimo.");
      throw error;
    }
  }, [minimumFilterKey, productGroups, toast]);
  const saveSingleMinimum = (0, import_react.useCallback)(async (group, value) => {
    if (minimumSavingRef.current) return;
    minimumSavingRef.current = true;
    setSavingMinimums(true);
    try {
      await saveStockMinimum(group, value);
    } finally {
      minimumSavingRef.current = false;
      setSavingMinimums(false);
    }
  }, [saveStockMinimum]);
  const pendingMinimums = Object.values(minimumDrafts);
  const invalidMinimums = pendingMinimums.some((entry) => !entry.valid);
  async function saveAllMinimums() {
    if (minimumSavingRef.current || !pendingMinimums.length || invalidMinimums) return;
    minimumSavingRef.current = true;
    setSavingMinimums(true);
    let saved = 0;
    const failures = [];
    try {
      for (const entry of pendingMinimums) {
        try {
          await saveStockMinimum(entry.group, entry.value, { silent: true });
          saved += 1;
        } catch (error) {
          failures.push(`${entry.group.label}: ${error.message || "No se pudo guardar"}`);
        }
      }
      if (failures.length) toast?.error?.(`${saved} guardados. ${failures.length} quedaron pendientes: ${failures.join("; ")}`);
      else toast?.success?.(`${saved} m\xEDnimos guardados.`);
    } finally {
      minimumSavingRef.current = false;
      setSavingMinimums(false);
    }
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { ref: productListRef, children: productGroups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { "data-row": group.key, onKeyDown: () => window.rowKeys++, children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(MinimumEditor, { group, canEdit: !savingMinimums, onSave: saveSingleMinimum, draftEntry: minimumDrafts[group.material.id], onDraftChange: changeMinimumDraft }) }, group.key)) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { id: "all", disabled: savingMinimums || !pendingMinimums.length || invalidMinimums, onClick: saveAllMinimums, children: [
      "Guardar todos (",
      pendingMinimums.length,
      ")"
    ] })
  ] });
}
