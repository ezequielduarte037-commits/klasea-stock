import { C } from "@/theme";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { useResponsive } from "@/hooks/useResponsive";
import { useToast } from "@/components/ui/Toast";
import { crearEnvio, SEDES_PANOL } from "@/features/panol/panolApi";

const UNITS = ["unidad", "metro", "kg", "litro", "pies", "caja", "rollo", "par", "juego", "m2"];
const CURRENCIES = ["ARS", "USD"];

const UNIT_ALIASES = {
  u: "unidad", un: "unidad", unidad: "unidad", unidades: "unidad", uds: "unidad",
  m: "metro", mt: "metro", mts: "metro", mtr: "metro", mtrs: "metro", metro: "metro", metros: "metro",
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg",
  l: "litro", lt: "litro", lts: "litro", litro: "litro", litros: "litro",
  pie: "pies", pies: "pies",
  caja: "caja", cajas: "caja",
  rollo: "rollo", rollos: "rollo",
  par: "par", pares: "par",
  juego: "juego", juegos: "juego",
  m2: "m2", "m²": "m2",
};

const inp = (over) => ({
  width: "100%",
  border: `1px solid ${C.b0}`,
  borderRadius: 7,
  background: "var(--panel)",
  color: C.t0,
  padding: "8px 11px",
  fontSize: 13,
  fontFamily: C.sans,
  outline: "none",
  boxSizing: "border-box",
  ...over,
});

const lbl = {
  color: C.t2,
  fontSize: 10,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  fontWeight: 750,
  marginBottom: 6,
  display: "block",
};

function normKey(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.]/g, "");
}

function cleanNumber(value = "") {
  const raw = String(value || "").trim().replace(",", ".");
  if (!raw) return "";
  const n = Number(raw);
  return Number.isFinite(n) ? String(n) : raw;
}

function normalizePriceForDb(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return null;
  let clean = raw.replace(/[$\s]/g, "").replace(/[^\d,.-]/g, "");
  if (!clean) return null;
  if (clean.includes(",")) clean = clean.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(clean)) clean = clean.replace(/\./g, "");
  return clean;
}

function detectCode(rest = "") {
  const match = String(rest).match(/\s+([A-ZÑ]{1,5}\d[A-Z0-9-]{2,})$/i);
  if (!match) return { codigo: "", descripcion: rest.trim() };
  return {
    codigo: match[1].toUpperCase(),
    descripcion: rest.slice(0, match.index).trim(),
  };
}

export function parsePanolLine(line = "") {
  let text = String(line || "").replace(/\s+/g, " ").trim();
  if (!text) return null;

  let cantidad = "";
  let unidad = "unidad";
  const qty = text.match(/^(\d+(?:[,.]\d+)?)\s+(.*)$/);
  if (qty) {
    cantidad = cleanNumber(qty[1]);
    text = qty[2].trim();

    const maybeUnit = text.match(/^([a-zA-ZáéíóúÁÉÍÓÚñÑ².]+)\b\s*(.*)$/);
    if (maybeUnit) {
      const unit = UNIT_ALIASES[normKey(maybeUnit[1])];
      if (unit) {
        unidad = unit;
        text = maybeUnit[2].trim();
      }
    }
  }

  const coded = detectCode(text);
  return {
    descripcion: coded.descripcion || text,
    codigo: coded.codigo,
    cantidad,
    unidad,
    precio_unitario: "",
    moneda: "ARS",
    purchase_request_item_id: null,
  };
}

function normalizeItem(it) {
  const parsed = parsePanolLine(it.descripcion ?? it.description ?? "");
  return {
    descripcion: parsed?.descripcion || it.descripcion || it.description || "",
    codigo: it.codigo ?? it.code ?? parsed?.codigo ?? "",
    cantidad: it.cantidad ?? it.quantity ?? parsed?.cantidad ?? "",
    unidad: it.unidad ?? it.unit ?? parsed?.unidad ?? "unidad",
    precio_unitario: it.precio_unitario ?? it.precioUnitario ?? "",
    moneda: it.moneda || "ARS",
    purchase_request_item_id: it.purchase_request_item_id ?? it.purchaseRequestItemId ?? null,
  };
}

export default function EnviarAPanolModal({ open, onClose, prefill }) {
  const { isMobile } = useResponsive();
  const toast = useToast();

  const [titulo, setTitulo] = useState("");
  const [sede, setSede] = useState("Pampa");
  const [obraId, setObraId] = useState("");
  const [prioridad, setPrioridad] = useState("media");
  const [observaciones, setObservaciones] = useState("");
  const [items, setItems] = useState([]);
  const [obras, setObras] = useState([]);
  const [saving, setSaving] = useState(false);

  const [nDesc, setNDesc] = useState("");
  const [nCode, setNCode] = useState("");
  const [nCant, setNCant] = useState("");
  const [nUnit, setNUnit] = useState("unidad");
  const [nPrice, setNPrice] = useState("");
  const [nCurrency, setNCurrency] = useState("ARS");
  const [bulkText, setBulkText] = useState("");
  const [showBulk, setShowBulk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(prefill?.titulo || "");
    setSede(prefill?.sede || "Pampa");
    setObraId(prefill?.obraId || "");
    setPrioridad(prefill?.prioridad || "media");
    setObservaciones(prefill?.observaciones || "");
    setItems(Array.isArray(prefill?.items) ? prefill.items.map(normalizeItem) : []);
    setNDesc("");
    setNCode("");
    setNCant("");
    setNUnit("unidad");
    setNPrice("");
    setNCurrency("ARS");
    setBulkText("");
    setShowBulk(false);
    supabase
      .from("produccion_obras")
      .select("id,codigo,estado")
      .order("codigo")
      .then(({ data }) => setObras(data ?? []))
      .catch(() => {});
  }, [open, prefill]);

  const obrasActivas = useMemo(() => {
    const rows = obras.filter((o) => !["terminada", "cancelada", "archivada"].includes(o.estado));
    return rows.length ? rows : obras;
  }, [obras]);

  if (!open) return null;

  function resetQuickAdd() {
    setNDesc("");
    setNCode("");
    setNCant("");
    setNUnit("unidad");
    setNPrice("");
    setNCurrency("ARS");
  }

  function addItem() {
    const base = parsePanolLine(nDesc);
    const descripcion = (base?.descripcion || nDesc).trim();
    if (!descripcion) {
      toast.warning("Cargá una descripción.");
      return;
    }
    setItems((prev) => [...prev, {
      descripcion,
      codigo: (nCode || base?.codigo || "").trim().toUpperCase(),
      cantidad: nCant.trim() || base?.cantidad || "",
      unidad: nUnit !== "unidad" ? nUnit : base?.unidad || "unidad",
      precio_unitario: nPrice.trim(),
      moneda: nCurrency,
      purchase_request_item_id: null,
    }]);
    resetQuickAdd();
  }

  function addBulk() {
    const parsed = bulkText
      .split("\n")
      .map(parsePanolLine)
      .filter(Boolean);
    if (!parsed.length) return;
    setItems((prev) => [...prev, ...parsed]);
    setBulkText("");
    setShowBulk(false);
    const withCode = parsed.filter((it) => it.codigo).length;
    toast.success(`${parsed.length} ítems agregados · ${withCode} código${withCode === 1 ? "" : "s"} detectado${withCode === 1 ? "" : "s"}`);
  }

  function removeItem(i) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(i, patch) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!titulo.trim()) {
      toast.warning("Cargá un título.");
      return;
    }
    if (!SEDES_PANOL.includes(sede)) {
      toast.warning("Elegí una sede.");
      return;
    }
    if (items.length === 0) {
      toast.warning("Agregá al menos un ítem.");
      return;
    }
    setSaving(true);
    try {
      await crearEnvio({
        titulo: titulo.trim(),
        sede,
        prioridad,
        obraId: obraId || null,
        observaciones: observaciones.trim() || null,
        origen: prefill?.origen || "manual",
        purchaseRequestId: prefill?.purchaseRequestId || null,
        items: items.map((it) => {
          const precio = normalizePriceForDb(it.precio_unitario);
          return {
            ...it,
            codigo: String(it.codigo || "").trim().toUpperCase() || null,
            precio_unitario: precio,
            moneda: precio ? it.moneda || "ARS" : null,
          };
        }),
      });
      toast.success(`Envío a Pañol ${sede} creado · ${items.length} ítem${items.length > 1 ? "s" : ""}`);
      onClose(true);
    } catch (err) {
      toast.error(err.message || "No se pudo crear el envío.");
    } finally {
      setSaving(false);
    }
  }

  const gridCols = isMobile
    ? "1fr 92px"
    : "minmax(220px,1.6fr) 112px 76px 96px 98px 78px 28px";

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--overlay-strong)", backdropFilter: "blur(6px)", display: "grid", placeItems: isMobile ? "end center" : "center", padding: isMobile ? 0 : 20, fontFamily: C.sans }}
    >
      <form onSubmit={submit} style={{ background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: isMobile ? "14px 14px 0 0" : 14, width: "100%", maxWidth: isMobile ? "100%" : 920, maxHeight: isMobile ? "94vh" : "90vh", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto", color: C.t0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>Enviar a Pañol</div>
          {prefill?.origen === "compra" && <span style={{ fontSize: 9, color: C.dim, background: "var(--panel-2)", border: `1px solid ${C.border}`, borderRadius: 5, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 0.5 }}>desde compra</span>}
          <div style={{ flex: 1 }} />
          <button type="button" onClick={() => onClose(false)} style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", fontSize: 18, padding: 4 }}>x</button>
        </div>

        <div style={{ overflowY: "auto", padding: 18, display: "grid", gap: 14 }}>
          <div>
            <span style={lbl}>Título</span>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder='Ej: "Sanitarios K52-25"' required style={inp()} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div>
              <span style={lbl}>Sede destino</span>
              <div style={{ display: "flex", gap: 5 }}>
                {SEDES_PANOL.map((s) => (
                  <button key={s} type="button" onClick={() => setSede(s)} style={{ flex: 1, padding: "8px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: C.sans, border: `1px solid ${sede === s ? "rgba(96,165,250,0.45)" : C.b0}`, background: sede === s ? "rgba(96,165,250,0.12)" : "transparent", color: sede === s ? C.primary : C.t1 }}>{s}</button>
                ))}
              </div>
            </div>
            <div>
              <span style={lbl}>Obra (opcional)</span>
              <select value={obraId} onChange={(e) => setObraId(e.target.value)} style={inp({ background: C.panelSolid, cursor: "pointer" })}>
                <option value="">- Sin obra -</option>
                {obrasActivas.map((o) => <option key={o.id} value={o.id}>{o.codigo}</option>)}
              </select>
            </div>
          </div>

          <div>
            <span style={lbl}>Prioridad</span>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {[["baja", "Baja", C.dim], ["media", "Media", C.blue], ["alta", "Alta", C.amber], ["urgente", "Urgente", C.red]].map(([v, l, col]) => (
                <button key={v} type="button" onClick={() => setPrioridad(v)} style={{ border: `1px solid ${prioridad === v ? col + "66" : C.border}`, background: prioridad === v ? `${col}1c` : "transparent", color: prioridad === v ? col : C.dim, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" }}>{l}</button>
              ))}
            </div>
          </div>

          <div>
            <span style={lbl}>Ítems - {items.length}</span>
            {items.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                {!isMobile && (
                  <div style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, padding: "0 7px", fontSize: 9, color: C.t2, letterSpacing: 1.1, textTransform: "uppercase", fontWeight: 800 }}>
                    <span>Descripción</span><span>Código</span><span>Cant.</span><span>Unidad</span><span>Precio unit.</span><span>Moneda</span><span />
                  </div>
                )}
                {items.map((it, i) => (
                  <div key={`${it.purchase_request_item_id || "manual"}-${i}`} style={{ display: "grid", gridTemplateColumns: gridCols, gap: 6, alignItems: "center", padding: "7px", background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 8 }}>
                    <input value={it.descripcion} onChange={(e) => updateItem(i, { descripcion: e.target.value })} placeholder="Descripción" style={inp({ padding: "6px 8px", fontSize: 12, gridColumn: isMobile ? "1 / -1" : undefined })} />
                    <input value={it.codigo || ""} onChange={(e) => updateItem(i, { codigo: e.target.value.toUpperCase() })} placeholder="Código" style={inp({ padding: "6px 8px", fontSize: 12, fontFamily: C.mono })} />
                    <input value={it.cantidad || ""} onChange={(e) => updateItem(i, { cantidad: e.target.value })} placeholder="Cant." style={inp({ padding: "6px 8px", fontSize: 12 })} />
                    <select value={it.unidad || "unidad"} onChange={(e) => updateItem(i, { unidad: e.target.value })} style={inp({ padding: "6px 8px", fontSize: 12, background: C.panelSolid })}>
                      {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <input value={it.precio_unitario || ""} onChange={(e) => updateItem(i, { precio_unitario: e.target.value })} placeholder="$ unit." style={inp({ padding: "6px 8px", fontSize: 12 })} />
                    <select value={it.moneda || "ARS"} onChange={(e) => updateItem(i, { moneda: e.target.value })} style={inp({ padding: "6px 8px", fontSize: 12, background: C.panelSolid })}>
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button type="button" onClick={() => removeItem(i)} title="Quitar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4, fontSize: 14 }}>x</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ border: `1px dashed ${C.border2 ?? C.b1}`, borderRadius: 9, padding: 10, background: "rgba(96,165,250,0.04)", display: "grid", gap: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "minmax(180px,1fr) 110px 80px 100px 96px 78px", gap: 6 }}>
                <input value={nDesc} onChange={(e) => setNDesc(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} placeholder='Descripción o línea completa: "20 mtrs Antirruido"' style={inp({ padding: "7px 9px", fontSize: 12, gridColumn: isMobile ? "1 / -1" : undefined })} />
                <input value={nCode} onChange={(e) => setNCode(e.target.value.toUpperCase())} placeholder="Código" style={inp({ padding: "7px 9px", fontSize: 12, fontFamily: C.mono })} />
                <input value={nCant} onChange={(e) => setNCant(e.target.value)} placeholder="Cant." style={inp({ padding: "7px 9px", fontSize: 12 })} />
                <select value={nUnit} onChange={(e) => setNUnit(e.target.value)} style={inp({ padding: "7px 9px", fontSize: 12, background: C.panelSolid })}>
                  {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input value={nPrice} onChange={(e) => setNPrice(e.target.value)} placeholder="Precio unit." style={inp({ padding: "7px 9px", fontSize: 12 })} />
                <select value={nCurrency} onChange={(e) => setNCurrency(e.target.value)} style={inp({ padding: "7px 9px", fontSize: 12, background: C.panelSolid })}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" onClick={addItem} disabled={!nDesc.trim()} style={{ background: nDesc.trim() ? C.blue : "var(--panel-2)", color: nDesc.trim() ? "#fff" : C.dim, border: "none", borderRadius: 7, padding: "6px 12px", cursor: nDesc.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>+ Agregar ítem</button>
                <button type="button" onClick={() => setShowBulk((v) => !v)} style={{ background: "transparent", color: C.t2, border: `1px solid ${C.b0}`, borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>{showBulk ? "Cerrar lista" : "Pegar lista"}</button>
                <span style={{ color: C.t2, fontSize: 11 }}>Detecta cantidad, unidad y código final.</span>
              </div>
              {showBulk && (
                <div style={{ display: "grid", gap: 6 }}>
                  <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={7} placeholder={"Un ítem por línea...\n20 mtrs Antirruido\n1 INODORO Ovalado I14388\n50 mtrs Cadena 6mm Galvanizada C05066"} style={inp({ resize: "vertical", fontFamily: C.mono, fontSize: 12 })} />
                  <button type="button" onClick={addBulk} style={{ justifySelf: "start", background: C.blue, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>
                    Analizar y agregar {bulkText.split("\n").map((l) => l.trim()).filter(Boolean).length || ""} ítems
                  </button>
                </div>
              )}
            </div>
          </div>

          <div>
            <span style={lbl}>Observaciones (opcional)</span>
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={2} placeholder="Notas para el pañolero" style={inp({ resize: "vertical", minHeight: 46 })} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "12px 18px", borderTop: `1px solid ${C.border}`, background: "var(--panel)" }}>
          <button type="button" onClick={() => onClose(false)} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 7, padding: "9px 16px", cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: C.sans }}>Cancelar</button>
          <button type="submit" disabled={saving || !titulo.trim() || items.length === 0} style={{ border: "none", background: saving || !titulo.trim() || !items.length ? "var(--panel-2)" : C.blue, color: saving || !titulo.trim() || !items.length ? C.dim : "#fff", borderRadius: 7, padding: "9px 16px", cursor: saving || !titulo.trim() || !items.length ? "default" : "pointer", fontSize: 12, fontWeight: 800, fontFamily: C.sans }}>{saving ? "Enviando..." : "Enviar a Pañol"}</button>
        </div>
      </form>
    </div>
  );
}
