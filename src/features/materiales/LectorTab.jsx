import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { C } from "@/theme";
import { Scan, Check, X, Plus, Minus, Search, ArrowRight, Barcode, ClipboardList, RotateCcw } from "lucide-react";
import { ingresarStockGeneral, egresarProducto, fetchMaterialesEgreso, fetchObrasEgreso, SEDES_PANOL } from "@/features/panol/panolApi";
import { agregarCodigoBarraMaterial, eliminarCodigoBarraMaterial } from "@/features/materiales/api";
import { findMaterialByBarcode, materialBarcodeList, materialBarcodeText, materialMatchesBarcode, barcodeKey } from "@/features/materiales/materialBarcodes";

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

function qty(value, fallback = 0) {
  const n = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function rowDelta(row) {
  if (row.estado === "egresado" && String(row.source || "").startsWith("egreso")) {
    return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  }
  if (row.estado === "egresado" && String(row.source || "").startsWith("transferencia_egreso")) {
    return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  }
  if (row.estado === "egresado") return -Math.abs(qty(row.cantidad_egresada, qty(row.cantidad, 1)));
  return qty(row.cantidad, 1);
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

export default function LectorTab({ materiales, onMaterialUpdate }) {
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

  // Conteo físico state
  const [countLocation, setCountLocation] = useState({ type: "stock", sede: "Pampa", obraId: "" });
  const [countRows, setCountRows] = useState([]);
  const [countedMap, setCountedMap] = useState({});
  const [countLoading, setCountLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [obrasList, setObrasList] = useState([]);
  const [showConfirmAdjust, setShowConfirmAdjust] = useState(false);

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

  // Load digital stock for selected location
  useEffect(() => {
    if (mode !== "count") return;
    setCountLoading(true);
    setCountRows([]);
    setCountedMap({});
    fetchMaterialesEgreso({ sede: countLocation.type === "stock" ? countLocation.sede : null })
      .then(rows => {
        const filtered = rows.filter(r => {
          if (countLocation.type === "stock") {
            const rowSede = r.stock_sede || r.panol_envio?.sede || "";
            return rowSede === countLocation.sede;
          }
          return r.obra_id === countLocation.obraId;
        });
        setCountRows(filtered);
      })
      .catch(() => setCountRows([]))
      .finally(() => setCountLoading(false));
  }, [mode, countLocation]);

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

  // ─ Conteo físico functions ──
  async function processCountScan(code) {
    const material = findMaterialByBarcode(materiales || [], code);
    if (!material) {
      setLastResult({ ok: false, msg: "Código no encontrado", code });
      beep(300, 200);
      focusInput();
      return;
    }
    setCountedMap(prev => {
      const current = prev[material.id] || 0;
      return { ...prev, [material.id]: current + 1 };
    });
    setLastResult({ ok: true, msg: `${material.descripcion} → contado: ${(countedMap[material.id] || 0) + 1}` });
    beep(900, 80);
    focusInput();
  }

  function updateCountedQty(materialId, newQty) {
    setCountedMap(prev => ({ ...prev, [materialId]: Math.max(0, Number(newQty) || 0) }));
  }

  function resetCount() {
    setCountedMap({});
    setLastResult(null);
    focusInput();
  }

  const countedProducts = useMemo(() => {
    return Object.entries(countedMap)
      .filter(([, q]) => q > 0)
      .map(([materialId, counted]) => {
        const material = (materiales || []).find(m => m.id === materialId);
        const system = countRows
          .filter(r => r.material_id === materialId)
          .reduce((sum, r) => sum + rowDelta(r), 0);
        const diff = counted - system;
        return { materialId, material, counted, system, diff };
      })
      .filter(p => p.material)
      .sort((a, b) => a.material.descripcion.localeCompare(b.material.descripcion));
  }, [countedMap, countRows, materiales]);

  const notCountedProducts = useMemo(() => {
    const countedIds = new Set(Object.keys(countedMap));
    const systemProducts = new Map();
    countRows.forEach(r => {
      if (!r.material_id) return;
      const current = systemProducts.get(r.material_id) || 0;
      systemProducts.set(r.material_id, current + rowDelta(r));
    });
    return Array.from(systemProducts.entries())
      .filter(([materialId, balance]) => balance !== 0 && !countedIds.has(materialId))
      .map(([materialId, system]) => {
        const material = (materiales || []).find(m => m.id === materialId);
        return { materialId, material, system };
      })
      .filter(p => p.material)
      .sort((a, b) => a.material.descripcion.localeCompare(b.material.descripcion));
  }, [countRows, countedMap, materiales]);

  async function applyAdjustments() {
    const adjustments = countedProducts.filter(p => p.diff !== 0);
    if (adjustments.length === 0) return;
    setApplying(true);
    setLastResult(null);
    const results = [];
    for (const adj of adjustments) {
      try {
        const cantidad = Math.abs(adj.diff);
        if (adj.diff > 0) {
          await ingresarStockGeneral({
            material: { id: adj.material.id, descripcion: adj.material.descripcion, codigo: adj.material.codigo, unidad: adj.material.unidad_medida },
            cantidad, nota: `Ajuste por conteo físico (${countLocation.type === "stock" ? `Stock ${countLocation.sede}` : `Obra ${countLocation.obraId}`})`,
          });
          results.push({ ok: true, msg: `+${cantidad} ${adj.material.descripcion}` });
        } else {
          await egresarProducto({
            material: { id: adj.material.id, descripcion: adj.material.descripcion, codigo: adj.material.codigo, unidad: adj.material.unidad_medida },
            cantidad, nota: `Ajuste por conteo físico (${countLocation.type === "stock" ? `Stock ${countLocation.sede}` : `Obra ${countLocation.obraId}`})`,
          });
          results.push({ ok: true, msg: `-${cantidad} ${adj.material.descripcion}` });
        }
      } catch (err) {
        results.push({ ok: false, msg: `${adj.material.descripcion}: ${err.message}` });
      }
    }
    setApplying(false);
    setShowConfirmAdjust(false);
    const okCount = results.filter(r => r.ok).length;
    const failCount = results.filter(r => !r.ok).length;
    setLastResult({
      ok: failCount === 0,
      msg: `Ajustados: ${okCount} | Errores: ${failCount}`,
    });
    beep(failCount === 0 ? 900 : 300, failCount === 0 ? 150 : 300);
    setCountedMap({});
    focusInput();
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

  const totalUnitsCounted = Object.values(countedMap).reduce((sum, q) => sum + q, 0);

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

      {/* ── MODE 3: Conteo físico ── */}
      {mode === "count" && (
        <div>
          {/* Location selector */}
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: C.panel, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono }}>
              Ubicación del conteo
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select
                value={countLocation.type}
                onChange={e => setCountLocation(prev => ({ ...prev, type: e.target.value }))}
                style={selectStyle}
              >
                <option value="stock">Stock general</option>
                <option value="obra">Obra</option>
              </select>

              {countLocation.type === "stock" ? (
                <select
                  value={countLocation.sede}
                  onChange={e => setCountLocation(prev => ({ ...prev, sede: e.target.value }))}
                  style={selectStyle}
                >
                  {SEDES_PANOL.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <select
                  value={countLocation.obraId}
                  onChange={e => setCountLocation(prev => ({ ...prev, obraId: e.target.value }))}
                  style={{ ...selectStyle, minWidth: 180 }}
                >
                  <option value="">Seleccionar obra…</option>
                  {obrasList.map(o => (
                    <option key={o.id} value={o.id}>{o.codigo}</option>
                  ))}
                </select>
              )}

              {countLoading && (
                <span style={{ fontSize: 11, color: C.dim, marginLeft: 8 }}>Cargando stock digital…</span>
              )}
            </div>
          </div>

          {/* Count stats */}
          {Object.keys(countedMap).length > 0 && (
            <div style={{
              padding: "10px 14px", borderRadius: 8, marginBottom: 16,
              background: "rgba(59,130,246,0.08)", border: `1px solid rgba(59,130,246,0.2)`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ fontSize: 13, color: C.text }}>
                <strong style={{ fontFamily: C.mono }}>{Object.keys(countedMap).length}</strong> productos ·{" "}
                <strong style={{ fontFamily: C.mono }}>{totalUnitsCounted}</strong> unidades contadas
              </div>
              <button
                type="button"
                onClick={resetCount}
                style={{ ...btnBase, background: "transparent", color: C.dim, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}
              >
                <RotateCcw size={12} /> Reiniciar
              </button>
            </div>
          )}

          {/* Counted products table */}
          {countedProducts.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono }}>
                Productos contados
              </div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                {/* Header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                  gap: 8, padding: "10px 14px",
                  background: C.panel2, borderBottom: `1px solid ${C.border}`,
                  fontSize: 10, color: C.dim, letterSpacing: 1, textTransform: "uppercase", fontFamily: C.mono,
                }}>
                  <div>Producto</div>
                  <div style={{ textAlign: "center" }}>Contado</div>
                  <div style={{ textAlign: "center" }}>Sistema</div>
                  <div style={{ textAlign: "center" }}>Diferencia</div>
                </div>

                {/* Rows */}
                {countedProducts.map(p => (
                  <div key={p.materialId} style={{
                    display: "grid", gridTemplateColumns: "1fr 80px 80px 80px",
                    gap: 8, padding: "10px 14px",
                    borderBottom: `1px solid ${C.border}`,
                    background: p.diff === 0 ? "rgba(16,185,129,0.05)" : "transparent",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>{p.material.descripcion}</div>
                      <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{p.material.codigo}</div>
                    </div>
                    <div style={{ textAlign: "center" }}>
                      <input
                        type="number"
                        min={0}
                        value={p.counted}
                        onChange={e => updateCountedQty(p.materialId, e.target.value)}
                        style={{
                          width: 60, padding: "4px 6px", borderRadius: 6,
                          border: `1px solid ${C.border}`, background: C.panel,
                          color: C.text, fontSize: 13, fontFamily: C.mono,
                          textAlign: "center", outline: "none",
                        }}
                      />
                    </div>
                    <div style={{ textAlign: "center", fontSize: 13, fontFamily: C.mono, color: C.muted, paddingTop: 4 }}>
                      {p.system}
                    </div>
                    <div style={{
                      textAlign: "center", fontSize: 14, fontWeight: 800, fontFamily: C.mono, paddingTop: 4,
                      color: p.diff === 0 ? C.green : p.diff > 0 ? C.amber : C.red,
                    }}>
                      {p.diff > 0 ? `+${p.diff}` : p.diff}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Apply adjustments button */}
          {countedProducts.some(p => p.diff !== 0) && (
            <div style={{ marginBottom: 20 }}>
              <button
                type="button"
                onClick={() => setShowConfirmAdjust(true)}
                disabled={applying}
                style={{
                  ...btnBase, width: "100%", padding: "12px",
                  background: C.amber, color: "#000", border: "none",
                  fontSize: 14, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {applying ? "Aplicando…" : `Aplicar ajustes (${countedProducts.filter(p => p.diff !== 0).length} productos)`}
              </button>
            </div>
          )}

          {/* Confirmation modal */}
          {showConfirmAdjust && (
            <div style={{
              position: "fixed", inset: 0, zIndex: 1000,
              background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
            }} onClick={() => setShowConfirmAdjust(false)}>
              <div style={{
                background: C.panelSolid, border: `1px solid ${C.border}`,
                borderRadius: 16, padding: 24, maxWidth: 480, width: "100%",
              }} onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 12 }}>
                  Confirmar ajustes
                </div>
                <div style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
                  Vas a ajustar <strong style={{ color: C.text }}>{countedProducts.filter(p => p.diff !== 0).length} productos</strong> para igualar el sistema al conteo físico.
                  <br /><br />
                  Esta acción genera movimientos de ingreso/egreso en el kardex y es reversible.
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowConfirmAdjust(false)}
                    style={{ ...btnBase, background: "transparent", color: C.muted }}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={applyAdjustments}
                    disabled={applying}
                    style={{ ...btnBase, background: C.amber, color: "#000", border: "none" }}
                  >
                    {applying ? "Aplicando…" : "Confirmar"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Not counted products */}
          {notCountedProducts.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 10, color: C.dim, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8, fontFamily: C.mono }}>
                No contados ({notCountedProducts.length}) — saldo en sistema pero no escaneados
              </div>
              <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${C.border}`, borderRadius: 10, background: C.panel }}>
                {notCountedProducts.map(p => (
                  <div key={p.materialId} style={{
                    padding: "8px 14px", borderBottom: `1px solid ${C.border}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: C.text }}>{p.material.descripcion}</div>
                      <div style={{ fontSize: 11, color: C.dim, fontFamily: C.mono }}>{p.material.codigo}</div>
                    </div>
                    <span style={{
                      fontSize: 13, fontWeight: 700, fontFamily: C.mono,
                      color: p.system > 0 ? C.amber : C.red,
                    }}>
                      {p.system > 0 ? `+${p.system}` : p.system}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not found — offer to assign */}
          {lastResult && !lastResult.ok && lastResult.code && (
            <div style={{
              padding: "12px 14px", borderRadius: 10, marginTop: 16,
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
        </div>
      )}
    </div>
  );
}
