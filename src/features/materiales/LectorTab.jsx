import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { C } from "@/theme";
import { Scan, Check, X, Plus, Minus, Search, ArrowRight, Barcode, ClipboardList, RotateCcw, Undo2, Trash2, AlertTriangle, StickyNote, ImagePlus } from "lucide-react";
import { ingresarStockGeneral, egresarProducto, fetchObrasEgreso, marcarMovimientoAnulado, registrarConteoFisico, SEDES_PANOL } from "@/features/panol/panolApi";
import { agregarCodigoBarraMaterial, eliminarCodigoBarraMaterial, crearMaterialRapido, guardarCantidades, actualizarNotasMaterial, uploadMaterialImage } from "@/features/materiales/api";
import { findMaterialByBarcode, materialBarcodeList, materialBarcodeText, materialMatchesBarcode, barcodeKey } from "@/features/materiales/materialBarcodes";
import { MODELOS, toBomMap } from "@/features/materiales/materialesParser";
import UbicacionPicker from "@/features/panol/UbicacionPicker";

function beep(frequency = 800, duration = 100) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    gain.gain.value = 0.1;
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, duration);
  } catch { /* audio not supported */ }
}






const inputStyle = {
  width: "100%", padding: "12px 16px", borderRadius: 10,
  border: `1px solid ${C.border}`, background: C.panel,
  color: C.text, fontSize: 16, fontFamily: C.mono,
  outline: "none", boxSizing: "border-box", letterSpacing: 1,
};

const btnBase = {
  padding: "8px 16px", borderRadius: 8, cursor: "pointer",
  fontSize: 13, fontFamily: C.sans, fontWeight: 600,
  transition: "all 0.15s", border: `1px solid ${C.border}`,
};

const selectStyle = {
  padding: "8px 12px", borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.panel,
  color: C.text, fontSize: 13, fontFamily: C.sans,
  outline: "none", cursor: "pointer",
};

export default function LectorTab({ materiales, categorias = [], onMaterialUpdate, onCatalogChanged }) {
  const [mode, setMode] = useState("assign");
  const inputRef = useRef(null);
  const [lastResult, setLastResult] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [lastScannedMaterial, setLastScannedMaterial] = useState(null);
  const [selectedVariante, setSelectedVariante] = useState("");
  const [customQty, setCustomQty] = useState(1);
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stockLoading, setStockLoading] = useState(false);
  const [barcodeSaving, setBarcodeSaving] = useState(false);
  const [assignedSession, setAssignedSession] = useState([]);
  const [stockSession, setStockSession] = useState([]);

  // ─── Conteo/inventario state (multi-step) ───
  const [countStep, setCountStep] = useState(1);
  const [countMaterial, setCountMaterial] = useState(null);
  const [countQty, setCountQty] = useState(1);
  const [countSede, setCountSede] = useState("Pampa");
  const [countDestinos, setCountDestinos] = useState([{ id: 1, type: "stock", obraId: "", cantidad: "1" }]);
  const [countVariante, setCountVariante] = useState("");
  const [countNotas, setCountNotas] = useState("");
  const [countSession, setCountSession] = useState([]);
  const [countSearchQ, setCountSearchQ] = useState("");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateDesc, setQuickCreateDesc] = useState("");
  const [quickCreateCat, setQuickCreateCat] = useState("");
  const [quickCreateUM, setQuickCreateUM] = useState("unidad");
  const [quickCreateProveedor, setQuickCreateProveedor] = useState("");
  const [quickCreateCodigo, setQuickCreateCodigo] = useState("");
  const [quickCreatePrecio, setQuickCreatePrecio] = useState("");
  const [quickCreateMoneda, setQuickCreateMoneda] = useState("ARS");
  const [quickCreateAlias, setQuickCreateAlias] = useState("");
  const [quickCreateNotas, setQuickCreateNotas] = useState("");
  const [quickCreateVariantes, setQuickCreateVariantes] = useState([]);
  const [quickCreateVariantesPrecios, setQuickCreateVariantesPrecios] = useState({});
  const [quickCreateVarDraft, setQuickCreateVarDraft] = useState("");
  const [quickCreateImageFile, setQuickCreateImageFile] = useState(null);
  const quickCreateImageInputRef = useRef(null);
  const quickImgPreview = useMemo(() => (quickCreateImageFile ? URL.createObjectURL(quickCreateImageFile) : ""), [quickCreateImageFile]);
  useEffect(() => { if (!quickImgPreview) return undefined; return () => URL.revokeObjectURL(quickImgPreview); }, [quickImgPreview]);

  function addQuickVariant() {
    const names = quickCreateVarDraft.split(/[,\n;/]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setQuickCreateVariantes((list) => {
      const seen = new Set(list.map((x) => x.toLowerCase()));
      const next = [...list];
      for (const n of names) if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); next.push(n); }
      return next;
    });
    setQuickCreateVarDraft("");
  }
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);
  const [countSaving, setCountSaving] = useState(false);
  const [countUndoing, setCountUndoing] = useState(null);
  const [obrasList, setObrasList] = useState([]);
  const [countBarcodeInput, setCountBarcodeInput] = useState("");
  const [matrixPrompt, setMatrixPrompt] = useState(null); // { cantidades: {52:"1", ...} }
  const [matrixSaving, setMatrixSaving] = useState(false);

  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materiales || [];
    const q = searchQuery.toLowerCase();
    return (materiales || []).filter(m =>
      m.descripcion?.toLowerCase().includes(q) ||
      m.codigo?.toLowerCase().includes(q) ||
      m.codigo_barra?.toLowerCase().includes(q) ||
      materialBarcodeText(m).toLowerCase().includes(q)
    );
  }, [materiales, searchQuery]);

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  useEffect(() => {
    focusInput();
  }, [mode, focusInput]);

  useEffect(() => {
    if (!selectedMaterial?.id) return;
    const fresh = (materiales || []).find((m) => m.id === selectedMaterial.id);
    if (fresh) setSelectedMaterial(fresh);
  }, [materiales, selectedMaterial?.id]);

  // Load obras for location selector
  useEffect(() => {
    if (mode === "count") {
      fetchObrasEgreso().then(setObrasList).catch(() => setObrasList([]));
    }
  }, [mode]);




  function handleMaterialSelect(m) {
    setSelectedMaterial(m);
    setSelectedVariante("");
    if (pendingBarcode) {
      processAssignScan(pendingBarcode, m);
      setPendingBarcode(null);
    }
  }

  async function processAssignScan(code, materialOverride) {
    const mat = materialOverride || selectedMaterial;
    if (!mat) {
      setLastResult({ ok: false, msg: "Seleccioná un material primero" });
      beep(300, 200);
      focusInput();
      return;
    }
    if (materialMatchesBarcode(mat, code)) {
      setLastResult({ ok: true, msg: `Ese codigo ya estaba en: ${mat.descripcion}` });
      beep(900, 80);
      focusInput();
      return;
    }
    const existing = findMaterialByBarcode(materiales || [], code, { excludeId: mat.id });
    if (existing) {
      setLastResult({ ok: false, msg: `Ya asignado a: ${existing.descripcion}` });
      beep(300, 200);
      focusInput();
      return;
    }
    setBarcodeSaving(true);
    try {
      const saved = await agregarCodigoBarraMaterial(mat.id, code, { variante: selectedVariante || null });
      const nextCodes = [...(mat.codigos_barra || []), saved].filter(Boolean);
      const patch = {
        codigos_barra: nextCodes,
        ...(mat.codigo_barra ? {} : { codigo_barra: code }),
      };
      onMaterialUpdate?.(mat.id, patch);
      setSelectedMaterial((prev) => (prev?.id === mat.id ? { ...prev, ...patch } : prev));
      setAssignedSession(prev => [...prev, { material: mat, codigo_barra: code, variante: selectedVariante || null, ts: Date.now() }]);
      setLastResult({ ok: true, msg: `Asignado: ${mat.descripcion}` });
      beep(900, 80);
    } catch (error) {
      setLastResult({ ok: false, msg: error.message });
      beep(300, 200);
    } finally {
      setBarcodeSaving(false);
      focusInput();
    }
  }

  async function processStockScan(code) {
    const material = findMaterialByBarcode(materiales || [], code);
    if (!material) {
      setLastResult({ ok: false, msg: "Código no encontrado", code });
      setLastScannedMaterial(null);
      beep(300, 200);
      focusInput();
      return;
    }
    setLastScannedMaterial(material);
    const matched = materialBarcodeList(material).find(b => barcodeKey(b.codigo) === barcodeKey(code));
    const variantStr = matched?.variante ? ` "${matched.variante}"` : "";
    setLastResult({ ok: true, msg: `${material.descripcion}${variantStr}` });
    beep(900, 80);
    focusInput();
  }

  async function adjustStock(delta) {
    const mat = lastScannedMaterial;
    if (!mat || stockLoading) return;
    const cantidad = Math.abs(delta);
    const isIngreso = delta > 0;
    setStockLoading(true);
    setLastResult(null);
    try {
      if (isIngreso) {
        await ingresarStockGeneral({
          material: { id: mat.id, descripcion: mat.descripcion, codigo: mat.codigo, unidad: mat.unidad_medida },
          cantidad, nota: "Ajuste por lector código de barras",
        });
      } else {
        await egresarProducto({
          material: { id: mat.id, descripcion: mat.descripcion, codigo: mat.codigo, unidad: mat.unidad_medida },
          cantidad, nota: "Ajuste por lector código de barras",
        });
      }
      setStockSession(prev => [...prev, { material: mat, action: isIngreso ? `+${cantidad}` : `-${cantidad}`, ts: Date.now() }]);
      setLastResult({ ok: true, msg: `${isIngreso ? "+" : "-"}${cantidad} — ${mat.descripcion}` });
      beep(900, 80);
    } catch (err) {
      setLastResult({ ok: false, msg: err.message || "Error al ajustar stock" });
      beep(300, 200);
    } finally {
      setStockLoading(false);
      focusInput();
    }
  }

  // ─── Conteo / inventario functions (multi-step) ───

  const countFilteredMaterials = useMemo(() => {
    if (!countSearchQ) return materiales || [];
    const q = countSearchQ.toLowerCase();
    return (materiales || []).filter(m =>
      m.descripcion?.toLowerCase().includes(q) ||
      m.codigo?.toLowerCase().includes(q) ||
      m.proveedor?.toLowerCase().includes(q) ||
      materialBarcodeText(m).toLowerCase().includes(q)
    );
  }, [materiales, countSearchQ]);

  function selectCountMaterial(m) {
    setCountMaterial(m);
    setCountQty(1);
    setCountVariante("");
    setCountDestinos([{ id: 1, type: "stock", obraId: "", cantidad: "1" }]);
    setCountNotas(m.notas || "");
    setCountStep(2);
    setLastResult(null);
  }

  // Mientras haya un solo destino, su cantidad sigue a la cantidad física total
  // (caso común: no hace falta tocar nada). En cuanto se agrega un 2º destino
  // para repartir entre varias obras, cada fila se edita a mano.
  useEffect(() => {
    setCountDestinos(prev => (prev.length === 1 ? [{ ...prev[0], cantidad: String(countQty) }] : prev));
  }, [countQty]);

  function addDestinoRow() {
    setCountDestinos(prev => [...prev, { id: Date.now(), type: "stock", obraId: "", cantidad: "" }]);
  }
  function removeDestinoRow(id) {
    setCountDestinos(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev));
  }
  function updateDestinoRow(id, patch) {
    setCountDestinos(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  }

  const destinosTotal = useMemo(
    () => countDestinos.reduce((s, r) => s + (Number(r.cantidad) || 0), 0),
    [countDestinos]
  );
  const destinosValid = useMemo(() => {
    if (destinosTotal !== Number(countQty)) return false;
    return countDestinos.every(r => (Number(r.cantidad) > 0 ? (r.type !== "obra" || !!r.obraId) : true));
  }, [countDestinos, destinosTotal, countQty]);

  // ── Línea de producción de una obra (misma derivación que el resto del sistema:
  //    usa obra.modelo si está cargado, sino lo deriva del prefijo del código "52-23"→"52") ──
  function lineaDeObra(obraId) {
    const obra = obrasList.find(o => String(o.id) === String(obraId));
    if (!obra) return "";
    const raw = String(obra.modelo || "").trim();
    if (raw) return raw;
    const m = String(obra.codigo || "").match(/^\s*(\d+)/);
    return m ? m[1] : "";
  }

  // Detecta líneas de producción (entre los destinos "obra" elegidos) donde este
  // material todavía NO figura en la lista matriz — para preguntar si se agrega.
  function missingMatrixLineas(mat, destinos) {
    const bom = toBomMap(mat);
    const found = new Map();
    for (const row of destinos) {
      if (row.type !== "obra" || !(Number(row.cantidad) > 0)) continue;
      const linea = lineaDeObra(row.obraId);
      if (!linea || !MODELOS.includes(linea)) continue;
      const cant = Number(String(bom[linea] ?? "").replace(",", "."));
      if (!(cant > 0) && !found.has(linea)) found.set(linea, "1");
    }
    return found;
  }

  function processCountScan(code) {
    // In step 1, scanning finds a material
    if (countStep === 1) {
      const material = findMaterialByBarcode(materiales || [], code);
      if (material) {
        selectCountMaterial(material);
        beep(900, 80);
      } else {
        setLastResult({ ok: false, msg: "Código no encontrado", code });
        setCountSearchQ(code);
        beep(300, 200);
      }
      focusInput();
      return;
    }
    // In step 3, scanning assigns a barcode
    if (countStep === 3 && countMaterial) {
      setCountBarcodeInput(code);
      beep(900, 80);
      focusInput();
      return;
    }
  }

  // Se dispara desde el botón "Confirmar": si alguno de los destinos elegidos es
  // una obra de una línea donde este producto NO figura en la lista matriz,
  // primero pregunta si corresponde agregarlo ahí. Si no hace falta preguntar,
  // pasa directo a registrar los movimientos.
  function handleConfirmClick() {
    if (!countMaterial || countSaving || !destinosValid) return;
    const missing = missingMatrixLineas(countMaterial, countDestinos);
    if (missing.size > 0) {
      setMatrixPrompt({ cantidades: Object.fromEntries(missing) });
      return;
    }
    runConfirmMovements();
  }

  async function confirmMatrixAndContinue(add) {
    if (add && matrixPrompt && countMaterial) {
      setMatrixSaving(true);
      try {
        const merged = { ...toBomMap(countMaterial), ...matrixPrompt.cantidades };
        await guardarCantidades(countMaterial.id, merged);
        await onCatalogChanged?.();
      } catch (err) {
        setMatrixSaving(false);
        setMatrixPrompt(null);
        setLastResult({ ok: false, msg: `No se pudo actualizar la lista matriz: ${err.message}` });
        return;
      }
      setMatrixSaving(false);
    }
    setMatrixPrompt(null);
    await runConfirmMovements();
  }

  async function runConfirmMovements() {
    if (!countMaterial || countSaving) return;
    const mat = countMaterial;
    const rows = countDestinos.filter(d => Number(d.cantidad) > 0);
    if (!rows.length) {
      setLastResult({ ok: false, msg: "Asigná la cantidad contada a al menos un destino." });
      return;
    }
    setCountSaving(true);
    setLastResult(null);
    try {
      // 1. Un ingreso por cada destino (stock general y/o cada obra elegida),
      // repartiendo la cantidad física contada entre todos los destinos.
      const allocations = [];
      for (const row of rows) {
        const cantidad = Number(row.cantidad);
        const obraCodigo = row.type === "obra" ? obrasList.find(o => String(o.id) === String(row.obraId))?.codigo : null;
        const destLabel = row.type === "stock" ? `Stock ${countSede}` : `Obra ${obraCodigo || "?"}`;
        const snapshotId = await registrarConteoFisico({
          material: { id: mat.id, descripcion: mat.descripcion, codigo: mat.codigo, unidad: mat.unidad_medida },
          cantidad,
          sede: countSede || null,
          obraId: row.type === "obra" ? row.obraId : null,
          movimiento: "ingreso",
          nota: `Conteo físico inicial — ${destLabel}`,
        });
        allocations.push({ type: row.type, obraId: row.obraId || null, obraCodigo, sede: countSede, cantidad, snapshotId });
      }

      // 2. Observaciones (si se cargaron o cambiaron)
      if (countNotas.trim() !== (mat.notas || "").trim()) {
        try {
          await actualizarNotasMaterial(mat.id, countNotas.trim());
          onMaterialUpdate?.(mat.id, { notas: countNotas.trim() || null });
        } catch {
          // no crítico para el conteo
        }
      }

      // 3. Assign barcode if provided
      if (countBarcodeInput.trim()) {
        try {
          const barcodeAssigned = await agregarCodigoBarraMaterial(mat.id, countBarcodeInput.trim(), { variante: countVariante || null });
          const nextCodes = [...(mat.codigos_barra || []), barcodeAssigned].filter(Boolean);
          onMaterialUpdate?.(mat.id, { codigos_barra: nextCodes, ...(mat.codigo_barra ? {} : { codigo_barra: countBarcodeInput.trim() }) });
        } catch {
          // barcode assignment failed, not critical
        }
      }

      // 4. Add to session
      const entry = {
        id: Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        material: mat,
        qty: countQty,
        allocations,
        variante: countVariante || null,
        barcode: countBarcodeInput.trim() || null,
        reverted: false,
        ts: Date.now(),
      };
      setCountSession(prev => [entry, ...prev]);
      const resumen = allocations.map(a => a.type === "stock" ? `Stock ${a.sede} ×${a.cantidad}` : `Obra ${a.obraCodigo || "?"} ×${a.cantidad}`).join(" · ");
      setLastResult({ ok: true, msg: `✓ ${mat.descripcion} → ${resumen}` });
      beep(900, 80);

      // Reset for next item
      setCountMaterial(null);
      setCountStep(1);
      setCountQty(1);
      setCountVariante("");
      setCountNotas("");
      setCountBarcodeInput("");
      setCountSearchQ("");
      setCountDestinos([{ id: 1, type: "stock", obraId: "", cantidad: "1" }]);
    } catch (err) {
      setLastResult({ ok: false, msg: err.message || "Error al registrar" });
      beep(300, 200);
    } finally {
      setCountSaving(false);
      focusInput();
    }
  }

  async function undoCountItem(entry) {
    if (countUndoing) return;
    setCountUndoing(entry.id);
    try {
      const mat = entry.material;
      // Revierte CADA asignación (una por destino) con un movimiento inverso y
      // anota el original como anulado — mismo patrón que el "Revertir" del
      // kardex en Stock de pañol, para que quede consistente y trazable ahí
      // también (y bloqueado contra doble-revert).
      const nota = "Revertido: error de conteo físico";
      for (const alloc of entry.allocations) {
        await registrarConteoFisico({
          material: { id: mat.id, descripcion: mat.descripcion, codigo: mat.codigo, unidad: mat.unidad_medida },
          cantidad: alloc.cantidad,
          sede: alloc.sede || null,
          obraId: alloc.type === "obra" ? alloc.obraId : null,
          movimiento: "egreso",
          nota,
        });
        if (alloc.snapshotId) {
          await marcarMovimientoAnulado(alloc.snapshotId, nota).catch(() => null);
        }
      }
      setCountSession(prev => prev.map(e => (e.id === entry.id ? { ...e, reverted: true } : e)));
      setLastResult({ ok: true, msg: `Revertido: ${mat.descripcion} ×${entry.qty}` });
      beep(900, 80);
    } catch (err) {
      setLastResult({ ok: false, msg: `Error al revertir: ${err.message}` });
      beep(300, 200);
    } finally {
      setCountUndoing(null);
    }
  }

  async function handleQuickCreate() {
    if (!quickCreateDesc.trim() || quickCreateSaving) return;
    if (!quickCreateCat) {
      setLastResult({ ok: false, msg: "Elegí un rubro para el material." });
      beep(300, 200);
      return;
    }
    setQuickCreateSaving(true);
    try {
      let newMat = await crearMaterialRapido({
        descripcion: quickCreateDesc.trim(),
        categoriaId: quickCreateCat || null,
        unidadMedida: quickCreateUM || "unidad",
        proveedor: quickCreateProveedor,
        codigo: quickCreateCodigo,
        precioUnitario: quickCreatePrecio === "" ? null : quickCreatePrecio,
        moneda: quickCreateMoneda,
        alias: quickCreateAlias,
        notas: quickCreateNotas,
        variantes: quickCreateVariantes,
        variantesPrecios: quickCreateVariantesPrecios,
      });
      if (quickCreateImageFile) {
        try {
          const url = await uploadMaterialImage(newMat.id, quickCreateImageFile);
          newMat = { ...newMat, imagen_url: url || newMat.imagen_url };
        } catch { /* la foto no frena el alta */ }
      }
      await onCatalogChanged?.();
      selectCountMaterial(newMat);
      setQuickCreateOpen(false);
      setQuickCreateDesc("");
      setQuickCreateCat("");
      setQuickCreateUM("unidad");
      setQuickCreateProveedor("");
      setQuickCreateCodigo("");
      setQuickCreatePrecio("");
      setQuickCreateMoneda("ARS");
      setQuickCreateAlias("");
      setQuickCreateNotas("");
      setQuickCreateVariantes([]);
      setQuickCreateVariantesPrecios({});
      setQuickCreateVarDraft("");
      setQuickCreateImageFile(null);
      setLastResult({ ok: true, msg: `Material creado: ${newMat.descripcion}` });
      beep(900, 80);
    } catch (err) {
      setLastResult({ ok: false, msg: err.message || "No se pudo crear" });
      beep(300, 200);
    } finally {
      setQuickCreateSaving(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const code = e.target.value.trim();
      if (code) {
        if (mode === "assign") processAssignScan(code);
        else if (mode === "stock") processStockScan(code);
        else if (mode === "count") processCountScan(code);
        e.target.value = "";
      } else {
        focusInput();
      }
    }
  }

  function handleScannerBlur() {
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active !== document.body && active !== inputRef.current) return;
      focusInput();
    }, 80);
  }

  async function removeSelectedBarcode(row) {
    if (!selectedMaterial || barcodeSaving) return;
    setBarcodeSaving(true);
    try {
      await eliminarCodigoBarraMaterial({ id: row.id, materialId: selectedMaterial.id, codigo: row.codigo });
      const nextCodes = (selectedMaterial.codigos_barra || []).filter((codeRow) => codeRow.id !== row.id && codeRow.codigo !== row.codigo);
      const patch = {
        codigos_barra: nextCodes,
        ...(row.legacy ? { codigo_barra: "" } : {}),
      };
      onMaterialUpdate?.(selectedMaterial.id, patch);
      setSelectedMaterial((prev) => (prev ? { ...prev, ...patch } : prev));
      setLastResult({ ok: true, msg: `Codigo quitado: ${row.codigo}` });
      beep(900, 80);
    } catch (error) {
      setLastResult({ ok: false, msg: error.message || "No se pudo quitar el codigo" });
      beep(300, 200);
    } finally {
      setBarcodeSaving(false);
      focusInput();
    }
  }

  const modeBtn = (active) => ({
    ...btnBase, flex: 1, textAlign: "center",
    background: active ? C.blue : C.panel,
    color: active ? "#fff" : C.muted,
    border: active ? `1px solid ${C.blue}` : `1px solid ${C.border}`,
  });

  const totalUnitsCounted = countSession.reduce((sum, e) => sum + e.qty, 0);

  return (
    <div style={{ padding: "20px 24px", maxWidth: 720, margin: "0 auto" }}>
      {/* Mode selector */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button type="button" onClick={() => { setMode("assign"); setPendingBarcode(null); }} style={modeBtn(mode === "assign")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Barcode size={14} /> Asignar códigos</span>
        </button>
        <button type="button" onClick={() => setMode("stock")} style={modeBtn(mode === "stock")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Scan size={14} /> Ajuste de stock</span>
        </button>
        <button type="button" onClick={() => setMode("count")} style={modeBtn(mode === "count")}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><ClipboardList size={14} /> Conteo físico</span>
        </button>
      </div>

      {/* Barcode input — always focused */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6, fontFamily: C.mono }}>
          Escaneá un código de barras
        </div>
        <input
          ref={inputRef}
          onKeyDown={handleKeyDown}
          onBlur={handleScannerBlur}
          placeholder={
            mode === "assign" ? "Escaneá para asignar al material seleccionado…" :
            mode === "stock" ? "Escaneá para buscar el material…" :
            "Escaneá para contar…"
          }
          style={inputStyle}
          autoComplete="off"
        />
      </div>

      {/* Last result feedback */}
      {lastResult && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, marginBottom: 16,
          background: lastResult.ok ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)",
          border: `1px solid ${lastResult.ok ? "rgba(16,185,129,0.3)" : "rgba(239,68,68,0.3)"}`,
          color: lastResult.ok ? C.green : C.red,
          fontSize: 13, fontWeight: 600,
          display: "flex", alignItems: "center", gap: 8,
          animation: "fadeIn 0.2s ease",
        }}>
          {lastResult.ok ? <Check size={16} /> : <X size={16} />}
          {lastResult.msg}
        </div>
      )}

      {/* ─ MODE 1: Assign barcodes ── */}
      {mode === "assign" && (
        <div>
          {pendingBarcode && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16,
              background: "rgba(59,130,246,0.1)", border: `1px solid rgba(59,130,246,0.3)`,
              color: C.blue, fontSize: 12,
            }}>
              Código pendiente: <strong style={{ fontFamily: C.mono }}>{pendingBarcode}</strong> — Seleccioná un material para asignarlo.
            </div>
          )}

          {/* Material search */}
          <div style={{ position: "relative", marginBottom: 12 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar material por nombre o código…"
              style={{ ...inputStyle, paddingLeft: 32, fontSize: 13 }}
            />
          </div>

          {/* Material list */}
          <div style={{ maxHeight: 280, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
            {filteredMaterials.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: 12 }}>Sin resultados</div>
            )}
            {filteredMaterials.map(m => {
              const isSelected = selectedMaterial?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => handleMaterialSelect(m)}
                  style={{
                    padding: "10px 14px", cursor: "pointer",
                    borderBottom: `1px solid ${C.border}`,
                    background: isSelected ? "rgba(59,130,246,0.1)" : "transparent",
                    borderLeft: isSelected ? `3px solid ${C.blue}` : "3px solid transparent",
                    transition: "background 0.1s",
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{m.descripcion}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontFamily: C.mono }}>
                    {m.codigo}{m.codigo_barra ? ` · ${m.codigo_barra}` : ""}
                  </div>
                </div>
              );
            })}
          </div>

          {selectedMaterial && (
            <div style={{ marginTop: 12, padding: 12, borderRadius: 10, border: `1px solid ${C.blueB}`, background: "rgba(59,130,246,0.08)", display: "grid", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{selectedMaterial.descripcion}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Escaneá un código para sumarlo a este material. No pisa los anteriores.</div>
              </div>
              {selectedMaterial.variantes?.length > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Variante específica (opcional)</div>
                  <select
                    value={selectedVariante}
                    onChange={(e) => setSelectedVariante(e.target.value)}
                    style={{ ...selectStyle, width: "100%" }}
                  >
                    <option value="">Sin variante específica</option>
                    {selectedMaterial.variantes.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {materialBarcodeList(selectedMaterial).length ? materialBarcodeList(selectedMaterial).map((row) => (
                  <span
                    key={`${row.id || "legacy"}-${row.codigo}`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, border: `1px solid ${C.border}`, background: C.panel, color: C.muted, borderRadius: 999, padding: "4px 8px", fontSize: 11, fontFamily: C.mono }}
                    title={row.etiqueta || "Código de barras"}
                  >
                    {row.codigo}
                    {row.variante && <span style={{ fontFamily: C.sans, color: C.dim, fontWeight: 700 }}>{row.variante}</span>}
                    <button
                      type="button"
                      disabled={barcodeSaving}
                      onClick={() => removeSelectedBarcode(row)}
                      title="Quitar código"
                      style={{ border: "none", background: "transparent", color: C.dim, cursor: barcodeSaving ? "default" : "pointer", padding: 0, display: "grid", placeItems: "center" }}
                    >
                      <X size={11} />
                    </button>
                  </span>
                )) : (
                  <span style={{ color: C.dim, fontSize: 11 }}>Todavía no tiene códigos.</span>
                )}
              </div>
            </div>
          )}

          {/* Session list */}
          {assignedSession.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono }}>
                Asignados en esta sesión ({assignedSession.length})
              </div>
              {assignedSession.map((entry, i) => (
                <div key={i} style={{
                  padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                  background: "rgba(16,185,129,0.08)", border: `1px solid rgba(16,185,129,0.2)`,
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{entry.material.descripcion}</div>
                    <div style={{ fontSize: 11, color: C.green, fontFamily: C.mono }}>
                      {entry.codigo_barra}
                      {entry.variante && <span style={{ fontFamily: C.sans, color: C.dim, fontWeight: 600, marginLeft: 6 }}>{entry.variante}</span>}
                    </div>
                  </div>
                  <Check size={14} color={C.green} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── MODE 2: Stock adjustment ── */}
      {mode === "stock" && (
        <div>
          {/* Last scanned material + controls */}
          {lastScannedMaterial && (
            <div style={{
              padding: 16, borderRadius: 12, marginBottom: 16,
              background: C.panel, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{lastScannedMaterial.descripcion}</div>
              <div style={{ fontSize: 12, color: C.dim, marginTop: 4, fontFamily: C.mono }}>
                {lastScannedMaterial.codigo} · {lastScannedMaterial.unidad_medida || "unidad"}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => adjustStock(1)}
                  disabled={stockLoading}
                  style={{ ...btnBase, background: C.green, color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Plus size={14} /> 1
                </button>
                <button
                  type="button"
                  onClick={() => adjustStock(-1)}
                  disabled={stockLoading}
                  style={{ ...btnBase, background: C.red, color: "#fff", border: "none", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <Minus size={14} /> 1
                </button>

                <div style={{ width: 1, height: 24, background: C.border, margin: "0 4px" }} />

                <input
                  type="number"
                  min={1}
                  value={customQty}
                  onChange={e => setCustomQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ ...inputStyle, width: 70, padding: "8px 10px", fontSize: 13, textAlign: "center" }}
                />
                <button
                  type="button"
                  onClick={() => adjustStock(customQty)}
                  disabled={stockLoading}
                  style={{ ...btnBase, background: C.blue, color: "#fff", border: "none" }}
                >
                  + Cant.
                </button>
                <button
                  type="button"
                  onClick={() => adjustStock(-customQty)}
                  disabled={stockLoading}
                  style={{ ...btnBase, background: C.red, color: "#fff", border: "none" }}
                >
                  - Cant.
                </button>
              </div>
            </div>
          )}

          {/* Not found — offer to assign */}
          {lastResult && !lastResult.ok && lastResult.code && (
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginBottom: 16,
              background: "rgba(245,158,11,0.1)", border: `1px solid rgba(245,158,11,0.3)`,
            }}>
              <div style={{ fontSize: 12, color: C.amber, marginBottom: 8 }}>
                Código no encontrado: <strong style={{ fontFamily: C.mono }}>{lastResult.code}</strong>
              </div>
              <button
                type="button"
                onClick={() => { setMode("assign"); setPendingBarcode(lastResult.code); }}
                style={{ ...btnBase, background: C.amber, color: "#000", border: "none", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
              >
                Asignar este código a un producto <ArrowRight size={12} />
              </button>
            </div>
          )}

          {/* Session history */}
          {stockSession.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono }}>
                Historial de sesión ({stockSession.length})
              </div>
              {stockSession.map((entry, i) => {
                const isPlus = entry.action.startsWith("+");
                return (
                  <div key={i} style={{
                    padding: "8px 12px", borderRadius: 8, marginBottom: 4,
                    background: isPlus ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
                    border: `1px solid ${isPlus ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)"}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{entry.material.descripcion}</div>
                      <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{entry.material.codigo}</div>
                    </div>
                    <span style={{
                      fontWeight: 800, fontSize: 14, fontFamily: C.mono,
                      color: isPlus ? C.green : C.red,
                    }}>{entry.action}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MODE 3: Inventario / Conteo físico (multi-step) ── */}
      {mode === "count" && (
        <div>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 4, marginBottom: 16, alignItems: "center" }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{
                flex: 1, height: 4, borderRadius: 4,
                background: s <= countStep ? C.blue : C.border,
                transition: "background 0.2s",
              }} />
            ))}
            <span style={{ fontSize: 10, color: C.dim, marginLeft: 8, fontFamily: C.mono, whiteSpace: "nowrap" }}>
              Paso {countStep}/3
            </span>
          </div>

          {/* ── STEP 1: Identify product ── */}
          {countStep === 1 && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>¿Qué producto es?</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Buscá por nombre, código o escaneá el código de barras.</div>

              <div style={{ position: "relative", marginBottom: 12 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                <input
                  value={countSearchQ}
                  onChange={e => setCountSearchQ(e.target.value)}
                  placeholder="Buscar material por nombre o código…"
                  style={{ ...inputStyle, paddingLeft: 32, fontSize: 13 }}
                />
              </div>

              <div style={{ maxHeight: 300, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
                {countFilteredMaterials.length === 0 && (
                  <div style={{ padding: 20, textAlign: "center", color: C.dim, fontSize: 12 }}>Sin resultados</div>
                )}
                {countFilteredMaterials.slice(0, 50).map(m => (
                  <div
                    key={m.id}
                    onClick={() => selectCountMaterial(m)}
                    style={{
                      padding: "10px 14px", cursor: "pointer",
                      borderBottom: `1px solid ${C.border}`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(59,130,246,0.08)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{m.descripcion}</div>
                    <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontFamily: C.mono }}>
                      {m.codigo}{m.proveedor ? ` · ${m.proveedor}` : ""}
                      {m.variantes?.length > 0 && <span style={{ color: C.blue, marginLeft: 6 }}>({m.variantes.join(", ")})</span>}
                    </div>
                  </div>
                ))}
              </div>

              {/* Quick create button */}
              <button
                type="button"
                onClick={() => { setQuickCreateOpen(true); setQuickCreateDesc(countSearchQ); }}
                style={{
                  ...btnBase, width: "100%", marginTop: 10, padding: "10px 14px",
                  background: "rgba(16,185,129,0.1)", border: `1px solid rgba(16,185,129,0.3)`,
                  color: C.green, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}
              >
                <Plus size={14} /> Crear material nuevo
              </button>

              {/* Quick create inline form */}
              {quickCreateOpen && (
                <div style={{
                  marginTop: 10, padding: 14, borderRadius: 10,
                  border: `1px solid ${C.border}`, background: C.panel,
                  display: "grid", gap: 8,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Alta rápida de material</div>
                  <input
                    value={quickCreateDesc}
                    onChange={e => setQuickCreateDesc(e.target.value)}
                    placeholder="Descripción del material *"
                    style={{ ...inputStyle, fontSize: 13 }}
                    autoFocus
                  />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <select
                      value={quickCreateCat}
                      onChange={e => setQuickCreateCat(e.target.value)}
                      style={selectStyle}
                    >
                      <option value="">Rubro (obligatorio)</option>
                      {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                    <input
                      value={quickCreateUM}
                      onChange={e => setQuickCreateUM(e.target.value)}
                      placeholder="UM (ej: unidad, mt, kg)"
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <input
                      value={quickCreateProveedor}
                      onChange={e => setQuickCreateProveedor(e.target.value)}
                      placeholder="Proveedor (opcional)"
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                    <input
                      value={quickCreateCodigo}
                      onChange={e => setQuickCreateCodigo(e.target.value)}
                      placeholder="Código (opcional)"
                      style={{ ...inputStyle, fontSize: 13, fontFamily: C.mono }}
                    />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    <input
                      type="number" step="any"
                      value={quickCreatePrecio}
                      onChange={e => setQuickCreatePrecio(e.target.value)}
                      placeholder="Precio (opcional)"
                      style={{ ...inputStyle, fontSize: 13, fontFamily: C.mono }}
                    />
                    <select value={quickCreateMoneda} onChange={e => setQuickCreateMoneda(e.target.value)} style={selectStyle}>
                      <option value="ARS">ARS</option>
                      <option value="USD">USD</option>
                    </select>
                    <input
                      value={quickCreateAlias}
                      onChange={e => setQuickCreateAlias(e.target.value)}
                      placeholder="Alias / marca"
                      style={{ ...inputStyle, fontSize: 13 }}
                    />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                      <StickyNote size={11} /> Observaciones (opcional)
                    </div>
                    <textarea
                      value={quickCreateNotas}
                      onChange={e => setQuickCreateNotas(e.target.value)}
                      placeholder="Notas sobre este material…"
                      rows={2}
                      style={{ ...inputStyle, fontSize: 13, fontFamily: C.sans, resize: "vertical", letterSpacing: "normal" }}
                    />
                  </div>
                  {/* Variantes / marcas con precio */}
                  <div>
                    <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Variantes / marcas (con precio)</div>
                    {quickCreateVariantes.length > 0 && (
                      <div style={{ display: "grid", gap: 5, marginBottom: 6 }}>
                        {quickCreateVariantes.map((v) => {
                          const p = quickCreateVariantesPrecios[v] || {};
                          return (
                            <div key={v} style={{ display: "grid", gridTemplateColumns: "minmax(52px,0.85fr) minmax(70px,1fr) 84px 54px 28px", gap: 5, alignItems: "center" }}>
                              <span style={{ color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                              <input value={p.codigo ?? ""} onChange={(e) => setQuickCreateVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), codigo: e.target.value } }))} placeholder="Código" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", fontFamily: C.mono }} />
                              <input value={p.precio ?? ""} inputMode="decimal" onChange={(e) => setQuickCreateVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), precio: e.target.value } }))} placeholder="Precio" style={{ ...inputStyle, fontSize: 12, padding: "6px 8px", fontFamily: C.mono }} />
                              <select value={p.moneda || "ARS"} onChange={(e) => setQuickCreateVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || {}), moneda: e.target.value } }))} style={{ ...selectStyle, fontSize: 12, padding: "6px 4px" }}>
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                              </select>
                              <button type="button" title="Quitar variante" onClick={() => { setQuickCreateVariantes((list) => list.filter((x) => x !== v)); setQuickCreateVariantesPrecios((m) => { const c = { ...m }; delete c[v]; return c; }); }} style={{ ...btnBase, padding: "5px 7px", background: "transparent", color: C.red }}>×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <input value={quickCreateVarDraft} onChange={(e) => setQuickCreateVarDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addQuickVariant(); } }} placeholder="Ej: 23L, 48L / LG, Samsung" style={{ ...inputStyle, fontSize: 13, flex: 1 }} />
                      <button type="button" onClick={addQuickVariant} disabled={!quickCreateVarDraft.trim()} style={{ ...btnBase, padding: "7px 10px", color: C.violet, opacity: quickCreateVarDraft.trim() ? 1 : 0.5 }}>+ Variante</button>
                    </div>
                  </div>

                  {/* Foto del producto */}
                  <div>
                    <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Foto del producto</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 52, height: 52, borderRadius: 8, border: `1px solid ${C.border}`, background: C.panel, overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
                        {quickImgPreview ? <img src={quickImgPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImagePlus size={18} color={C.dim} />}
                      </div>
                      <button type="button" onClick={() => quickCreateImageInputRef.current?.click()} style={{ ...btnBase, padding: "7px 10px", color: C.blue }}>{quickCreateImageFile ? "Cambiar foto" : "Elegir / sacar foto"}</button>
                      {quickCreateImageFile && <button type="button" onClick={() => setQuickCreateImageFile(null)} style={{ ...btnBase, padding: "7px 10px", background: "transparent", color: C.red }}>Quitar</button>}
                      <input ref={quickCreateImageInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { setQuickCreateImageFile(e.target.files?.[0] || null); e.target.value = ""; }} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setQuickCreateOpen(false)} style={{ ...btnBase, background: "transparent", color: C.dim }}>Cancelar</button>
                    <button
                      type="button"
                      onClick={handleQuickCreate}
                      disabled={!quickCreateDesc.trim() || quickCreateSaving}
                      style={{ ...btnBase, background: C.green, color: "#fff", border: "none", opacity: !quickCreateDesc.trim() || quickCreateSaving ? 0.5 : 1 }}
                    >
                      {quickCreateSaving ? "Creando…" : "Crear y seleccionar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Count and assign destination ── */}
          {countStep === 2 && countMaterial && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>¿Cuántos hay y para dónde van?</div>

              {/* Selected material card */}
              <div style={{
                padding: 14, borderRadius: 10, marginBottom: 14,
                background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.25)`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{countMaterial.descripcion}</div>
                <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono, marginTop: 2 }}>
                  {countMaterial.codigo}{countMaterial.proveedor ? ` · ${countMaterial.proveedor}` : ""}
                </div>
              </div>

              {/* Quantity */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Cantidad física</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button type="button" onClick={() => setCountQty(q => Math.max(1, q - 1))} style={{ ...btnBase, padding: "8px 12px", background: C.panel }}><Minus size={14} /></button>
                  <input
                    type="number"
                    min={1}
                    value={countQty}
                    onChange={e => setCountQty(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ ...inputStyle, width: 80, textAlign: "center", fontSize: 18, fontWeight: 700, padding: "8px" }}
                  />
                  <button type="button" onClick={() => setCountQty(q => q + 1)} style={{ ...btnBase, padding: "8px 12px", background: C.panel }}><Plus size={14} /></button>
                  <span style={{ fontSize: 12, color: C.dim }}>{countMaterial.unidad_medida || "unidad"}</span>
                </div>
              </div>

              {/* Sede — obligatoria siempre (permiso + dónde vive el stock general),
                  aplica a todos los destinos de este ítem. */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Sede</div>
                <select value={countSede} onChange={e => setCountSede(e.target.value)} style={selectStyle}>
                  {SEDES_PANOL.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Destino(s) — si hay más de 1 unidad, se puede repartir entre varias
                  obras y/o stock general. Con 1 solo destino la cantidad se auto-completa. */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>Destino(s)</div>
                  <span style={{ fontSize: 10, fontFamily: C.mono, fontWeight: 800, color: destinosTotal === Number(countQty) ? C.green : C.amber }}>
                    asignado {destinosTotal} / {countQty}
                  </span>
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {countDestinos.map((row, idx) => (
                    <div key={row.id} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <select
                        value={row.type}
                        onChange={e => updateDestinoRow(row.id, { type: e.target.value, obraId: "" })}
                        style={selectStyle}
                      >
                        <option value="stock">Stock general</option>
                        <option value="obra">Obra</option>
                      </select>
                      {row.type === "obra" && (
                        <select
                          value={row.obraId}
                          onChange={e => updateDestinoRow(row.id, { obraId: e.target.value })}
                          style={{ ...selectStyle, minWidth: 160 }}
                        >
                          <option value="">Seleccionar obra…</option>
                          {obrasList.map(o => <option key={o.id} value={o.id}>{o.codigo}</option>)}
                        </select>
                      )}
                      <input
                        type="number" min={0}
                        value={row.cantidad}
                        onChange={e => updateDestinoRow(row.id, { cantidad: e.target.value })}
                        disabled={countDestinos.length === 1}
                        placeholder="Cant."
                        style={{ ...inputStyle, width: 70, padding: "8px 10px", fontSize: 13, textAlign: "center", opacity: countDestinos.length === 1 ? 0.6 : 1 }}
                      />
                      {countDestinos.length > 1 && (
                        <button type="button" onClick={() => removeDestinoRow(row.id)} style={{ ...btnBase, padding: "6px 8px", background: "transparent", color: C.red }} title="Quitar destino">
                          <Trash2 size={13} />
                        </button>
                      )}
                      {idx === 0 && countDestinos.length === 1 && (
                        <span style={{ fontSize: 10, color: C.dim }}>(1 solo destino: usa toda la cantidad)</span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addDestinoRow}
                  style={{ ...btnBase, marginTop: 8, padding: "6px 10px", fontSize: 11, background: "transparent", color: C.blue, border: `1px dashed rgba(59,130,246,0.4)`, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <Plus size={12} /> Repartir entre varias obras/stock
                </button>
              </div>

              {/* Ubicación en el pañol (estantería/estante, o "afuera" + observación).
                  Se guarda de forma independiente al conteo — podés fijarla en cualquier
                  momento con el material seleccionado, no hace falta confirmar el conteo. */}
              <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, border: `1px solid ${C.border}`, background: C.panel }}>
                <UbicacionPicker
                  key={countMaterial.id}
                  materialId={countMaterial.id}
                  ubicacion={countMaterial.ubicacion}
                  ubicacionObs={countMaterial.ubicacion_obs}
                  onSaved={(ubicacion, obs) => {
                    onMaterialUpdate?.(countMaterial.id, { ubicacion, ubicacion_obs: obs });
                    setCountMaterial(prev => (prev ? { ...prev, ubicacion, ubicacion_obs: obs } : prev));
                  }}
                />
              </div>

              {/* Observaciones del producto (se guardan al confirmar el conteo) */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                  <StickyNote size={11} /> Observaciones
                </div>
                <textarea
                  value={countNotas}
                  onChange={e => setCountNotas(e.target.value)}
                  placeholder="Notas sobre este material (opcional)…"
                  rows={2}
                  style={{ ...inputStyle, fontSize: 13, fontFamily: C.sans, resize: "vertical", letterSpacing: "normal" }}
                />
              </div>

              {/* Variant selector */}
              {countMaterial.variantes?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Variante (opcional)</div>
                  <select value={countVariante} onChange={e => setCountVariante(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
                    <option value="">Sin variante específica</option>
                    {countMaterial.variantes.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              )}

              {/* Navigation */}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button type="button" onClick={() => { setCountStep(1); setCountMaterial(null); }} style={{ ...btnBase, flex: 1, background: "transparent", color: C.muted }}>← Volver</button>
                <button
                  type="button"
                  onClick={() => setCountStep(3)}
                  disabled={!destinosValid}
                  style={{ ...btnBase, flex: 2, background: C.blue, color: "#fff", border: "none", opacity: !destinosValid ? 0.5 : 1 }}
                >
                  Siguiente → Código de barras
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Barcode assignment + confirm ── */}
          {countStep === 3 && countMaterial && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Código de barras (opcional)</div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Escaneá o escribí un código para asignarlo a este material, o saltá este paso.</div>

              {/* Summary card */}
              <div style={{
                padding: 12, borderRadius: 10, marginBottom: 14,
                background: "rgba(59,130,246,0.06)", border: `1px solid rgba(59,130,246,0.2)`,
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.text }}>{countMaterial.descripcion}</div>
                  <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                    {countQty} {countMaterial.unidad_medida || "unidad"} →{" "}
                    {countDestinos.filter(d => Number(d.cantidad) > 0).map(d => (
                      d.type === "stock" ? `Stock ${countSede} ×${d.cantidad}` : `Obra ${obrasList.find(o => String(o.id) === String(d.obraId))?.codigo || "?"} ×${d.cantidad}`
                    )).join(" · ")}
                    {countVariante ? ` · ${countVariante}` : ""}
                  </div>
                </div>
                <span style={{ fontFamily: C.mono, fontWeight: 800, fontSize: 18, color: C.blue }}>{countQty}</span>
              </div>

              {/* Existing barcodes */}
              {materialBarcodeList(countMaterial).length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Códigos ya asignados</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {materialBarcodeList(countMaterial).map(row => (
                      <span key={`${row.id || "l"}-${row.codigo}`} style={{
                        display: "inline-flex", alignItems: "center", gap: 4,
                        border: `1px solid ${C.border}`, background: C.panel,
                        borderRadius: 999, padding: "3px 8px", fontSize: 10, fontFamily: C.mono, color: C.muted,
                      }}>
                        {row.codigo}
                        {row.variante && <span style={{ fontFamily: C.sans, color: C.dim, fontWeight: 700 }}>{row.variante}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Barcode input */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4, fontWeight: 700 }}>Nuevo código (opcional)</div>
                <input
                  value={countBarcodeInput}
                  onChange={e => setCountBarcodeInput(e.target.value)}
                  placeholder="Escaneá o escribí un código…"
                  style={{ ...inputStyle, fontSize: 13 }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setCountStep(2)} style={{ ...btnBase, flex: 1, background: "transparent", color: C.muted }}>← Volver</button>
                <button
                  type="button"
                  onClick={handleConfirmClick}
                  disabled={countSaving || !destinosValid}
                  style={{
                    ...btnBase, flex: 2, padding: "12px",
                    background: C.green, color: "#fff", border: "none",
                    fontWeight: 700, fontSize: 14,
                    opacity: countSaving ? 0.5 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  {countSaving ? "Guardando…" : <><Check size={16} /> Confirmar</>}
                </button>
              </div>
            </div>
          )}

          {/* ── Session history ── */}
          {countSession.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8,
              }}>
                <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", fontFamily: C.mono }}>
                  Sesión ({countSession.length} items · {totalUnitsCounted} unidades)
                </div>
                <button
                  type="button"
                  onClick={() => { if (window.confirm("¿Limpiar historial de sesión? (los movimientos de stock ya aplicados NO se revierten)")) setCountSession([]); }}
                  style={{ ...btnBase, background: "transparent", color: C.dim, fontSize: 10, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4 }}
                >
                  <RotateCcw size={10} /> Limpiar
                </button>
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {countSession.map(entry => {
                  const destLabel = entry.allocations.map(a => (
                    a.type === "stock" ? `Stock ${a.sede} ×${a.cantidad}` : `Obra ${a.obraCodigo || "?"} ×${a.cantidad}`
                  )).join(" · ");
                  const isUndoing = countUndoing === entry.id;
                  return (
                    <div key={entry.id} style={{
                      padding: "10px 14px", borderBottom: `1px solid ${C.border}`,
                      display: "flex", alignItems: "center", gap: 10,
                      background: isUndoing ? "rgba(239,68,68,0.06)" : "transparent",
                      opacity: isUndoing ? 0.6 : entry.reverted ? 0.45 : 1,
                      transition: "all 0.2s",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: entry.reverted ? "line-through" : "none" }}>
                          {entry.material.descripcion}
                          {entry.variante && <span style={{ color: C.dim, fontWeight: 500, marginLeft: 4 }}>({entry.variante})</span>}
                        </div>
                        <div style={{ fontSize: 10, color: C.dim, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontFamily: C.mono }}>{destLabel}</span>
                          {entry.barcode && <span style={{ fontFamily: C.mono, color: C.blue }}>⊟ {entry.barcode}</span>}
                          {entry.reverted && <span style={{ color: C.red, fontWeight: 700 }}>Revertido</span>}
                        </div>
                      </div>
                      <span style={{ fontFamily: C.mono, fontWeight: 800, fontSize: 14, color: entry.reverted ? C.dim : C.green, flexShrink: 0, textDecoration: entry.reverted ? "line-through" : "none" }}>+{entry.qty}</span>
                      <button
                        type="button"
                        onClick={() => undoCountItem(entry)}
                        disabled={!!countUndoing || entry.reverted}
                        title={entry.reverted ? "Ya fue revertido" : "Deshacer este movimiento"}
                        style={{
                          ...btnBase, padding: "4px 8px", background: "transparent",
                          color: C.red, border: `1px solid rgba(239,68,68,0.3)`,
                          fontSize: 10, flexShrink: 0, opacity: (countUndoing || entry.reverted) ? 0.4 : 1,
                        }}
                      >
                        {entry.reverted ? <Undo2 size={11} /> : <RotateCcw size={11} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Aviso: producto no está en la lista matriz de la línea de la obra elegida */}
      {matrixPrompt && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => confirmMatrixAndContinue(false)}>
          <div style={{ background: C.panelSolid || C.panel, border: `1px solid ${C.border}`, borderRadius: 16, padding: 24, maxWidth: 440, width: "100%" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <AlertTriangle size={18} color={C.amber} />
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>¿Agregar a la lista matriz?</div>
            </div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>
              <strong style={{ color: C.text }}>{countMaterial?.descripcion}</strong> todavía no figura en la lista matriz de{" "}
              {Object.keys(matrixPrompt.cantidades).length === 1 ? "esta línea" : "estas líneas"}:{" "}
              <strong style={{ color: C.text }}>{Object.keys(matrixPrompt.cantidades).map(l => `K${l}`).join(", ")}</strong>.
              <br /><br />
              Si lo agregás, todas las obras de esa línea van a esperar este producto de ahora en más (podés ajustar la cantidad base después desde el catálogo).
            </div>
            <div style={{ display: "grid", gap: 6, marginBottom: 14 }}>
              {Object.entries(matrixPrompt.cantidades).map(([linea, cant]) => (
                <div key={linea} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontFamily: C.mono, fontWeight: 700, color: C.blue, minWidth: 40 }}>K{linea}</span>
                  <input
                    type="number" min={0} step="any"
                    value={cant}
                    onChange={e => setMatrixPrompt(prev => ({ ...prev, cantidades: { ...prev.cantidades, [linea]: e.target.value } }))}
                    style={{ ...inputStyle, width: 90, padding: "6px 10px", fontSize: 13 }}
                  />
                  <span style={{ fontSize: 11, color: C.dim }}>cantidad base por barco</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => confirmMatrixAndContinue(false)} disabled={matrixSaving} style={{ ...btnBase, background: "transparent", color: C.muted }}>
                Solo contar (no agregar)
              </button>
              <button type="button" onClick={() => confirmMatrixAndContinue(true)} disabled={matrixSaving} style={{ ...btnBase, background: C.blue, color: "#fff", border: "none" }}>
                {matrixSaving ? "Guardando…" : "Agregar a la matriz y continuar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
