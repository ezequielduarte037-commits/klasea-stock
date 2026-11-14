import React,{useState,useEffect,useCallback,useRef}from'react';import{C}from'@/theme';const qty=(v,f=0)=>{const n=Number(String(v??'').replace(',','.'));return Number.isFinite(n)?n:f};const fmtQty=String;function MinimumEditor({ group, canEdit, onSave, draftEntry, onDraftChange }) {
  const initial = group.stockMinimo == null ? "" : String(group.stockMinimo);
  const draft = draftEntry?.text ?? initial;
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const normalizedDraft = draft.trim() === "" ? null : qty(draft, NaN);
  const normalizedCurrent = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
  const dirty = normalizedDraft !== normalizedCurrent;
  const valid = normalizedDraft === null || (Number.isFinite(normalizedDraft) && normalizedDraft >= 0);

  async function save() {
    if (!canEdit || !dirty || !valid || saving) return;
    setSaving(true);
    try {
      await onSave(group, normalizedDraft);
    } catch {
      // El panel padre ya muestra el error y conserva el valor anterior.
    } finally {
      setSaving(false);
    }
  }

  return (
    <div onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <input
        className={`stock-minimum-input${dirty || focused || !valid ? " is-active" : ""}`}
        type="number"
        min="0"
        step="0.01"
        value={draft}
        disabled={!canEdit || saving}
        onChange={(event) => onDraftChange(group, event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
          }
        }}
        placeholder="—"
        title="Dejalo vacío para quitar el mínimo"
        style={{ width: 72, minWidth: 0, boxSizing: "border-box", border: `1px solid ${!valid ? C.redB : dirty || focused ? C.blueB : "transparent"}`, background: dirty || focused ? C.panelSolid : "transparent", color: C.text, borderRadius: 7, padding: "5px 6px", textAlign: "right", fontFamily: C.mono, fontSize: 11.5, fontWeight: 700, outline: "none", opacity: canEdit ? 1 : 0.72 }}
      />
      {canEdit && dirty && (
        <button type="button" disabled={!valid || saving} onClick={save} style={{ border: `1px solid ${valid ? C.greenB : C.border}`, background: valid ? C.greenL : C.panel2, color: valid ? C.green : C.dim, borderRadius: 7, padding: "6px 7px", cursor: valid && !saving ? "pointer" : "not-allowed", fontSize: 10, fontWeight: 700 }}>
          {saving ? "..." : "Guardar"}
        </button>
      )}
    </div>
  );
}

export default function Harness(){const[rows,setRows]=useState([{key:'a',material_id:'a',material:{id:'a'},label:'Placas',stock_minimo:5},{key:'b',material_id:'b',material:{id:'b'},label:'Bomba',stock_minimo:4},{key:'c',material_id:'c',material:{id:'c'},label:'Cable',stock_minimo:1}]);const[minimumDrafts,setMinimumDrafts]=useState({});const[savingMinimums,setSavingMinimums]=useState(false);const minimumSavingRef=useRef(false);  const changeMinimumDraft = useCallback((group, text) => {
    const id = group.material?.id;
    if (!id) return;
    const value = text.trim() === "" ? null : qty(text, NaN);
    const current = group.stockMinimo == null ? null : qty(group.stockMinimo, 0);
    const valid = value === null || (Number.isFinite(value) && value >= 0);
    setMinimumDrafts((prev) => {
      const next = { ...prev };
      if (valid && value === current) delete next[id];
      else next[id] = { group, text, value, valid };
      return next;
    });
  }, []);
const productGroups=rows.map(r=>({...r,stockMinimo:r.stock_minimo}));const minimumFilterKey='same';const[,setMinimumListOrder]=useState(null);const[,setCatalogRows]=useState([]);const[,setReplenishmentCatalog]=useState([]);const productListRef=useRef(null);const toast={success:()=>{},error:()=>{}};const actualizarStockMinimoPanol=async(id,v)=>{window.calls.push([id,v]);if(id==='b'&&window.fail)throw Error('Offline')};  const saveStockMinimum = useCallback(async (group, value, { silent = false } = {}) => {
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
        if (list?.isConnected) { list.scrollTop = top; list.scrollLeft = left; }
      });
      if (!silent) toast?.success?.(value == null ? "Stock mínimo quitado." : `Stock mínimo guardado: ${fmtQty(value)} ${group.unidad || "u"}.`);
    } catch (error) {
      if (!silent) toast?.error?.(error.message || "No se pudo guardar el stock mínimo.");
      throw error;
    }
  }, [minimumFilterKey, productGroups, toast]);

  const saveSingleMinimum = useCallback(async (group, value) => {
    if (minimumSavingRef.current) return;
    minimumSavingRef.current = true;
    setSavingMinimums(true);
    try { await saveStockMinimum(group, value); }
    finally { minimumSavingRef.current = false; setSavingMinimums(false); }
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
        try { await saveStockMinimum(entry.group, entry.value, { silent: true }); saved += 1; }
        catch (error) { failures.push(`${entry.group.label}: ${error.message || "No se pudo guardar"}`); }
      }
      if (failures.length) toast?.error?.(`${saved} guardados. ${failures.length} quedaron pendientes: ${failures.join("; ")}`);
      else toast?.success?.(`${saved} mínimos guardados.`);
    } finally {
      minimumSavingRef.current = false;
      setSavingMinimums(false);
    }
  }

return <><div ref={productListRef}>{productGroups.map(group=><div key={group.key} data-row={group.key} onKeyDown={()=>window.rowKeys++}><MinimumEditor group={group} canEdit={!savingMinimums} onSave={saveSingleMinimum} draftEntry={minimumDrafts[group.material.id]} onDraftChange={changeMinimumDraft}/></div>)}</div><button id='all' disabled={savingMinimums||!pendingMinimums.length||invalidMinimums} onClick={saveAllMinimums}>Guardar todos ({pendingMinimums.length})</button></>}