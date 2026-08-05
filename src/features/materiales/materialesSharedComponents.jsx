import { useMemo, useRef, useState } from "react";
import { Link as LinkIcon, Trash2, Upload } from "lucide-react";
import { C } from "@/theme";
import { BTN, BTN_GREEN, BTN_PRIMARY, INP, KpiCard, Td, Th } from "@/features/rrhh/ui";
import { guardarProveedor, importarCatalogo } from "./api";
import { proveedorAlternativas, PROVEEDOR_TIPOS, proveedorTipoUi } from "./proveedorMeta";
import { parseMaterialesWorkbook, norm } from "./materialesParser";
import { categoriaNombre, esRaiz, hijosDe, proveedorNombre, subdivisionesSugeridas } from "./materialesHelpers";

const OPT_ST = { background: C.panelSolid, color: C.t0 };

function ProveedorSelect({ value, textValue, proveedores, onChange, onCreated }) {
  const [creating, setCreating] = useState(false);
  const activos = proveedores.filter((p) => p.activo !== false);

  async function vincularOCrear() {
    const nombre = String(textValue || "").trim();
    if (!nombre || creating) return;
    setCreating(true);
    try {
      const match = activos.find((p) => norm(p.nombre) === norm(nombre));
      const id = match?.id ?? await guardarProveedor({ nombre, activo: true });
      await onCreated?.();
      onChange(id, match?.nombre ?? nombre);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 5 }}>
      <select
        value={value || ""}
        onChange={(e) => {
          const nombre = proveedorNombre(proveedores, e.target.value, "");
          onChange(e.target.value || null, nombre);
        }}
        style={{ ...INP, width: "100%" }}
      >
        <option value="">Sin proveedor vinculado</option>
        {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </select>
      {!value && textValue && (
        <button type="button" onClick={vincularOCrear} disabled={creating} style={{ ...BTN, padding: "5px 8px", fontSize: 11 }}>
          <LinkIcon size={12} /> {creating ? "Vinculando…" : `Vincular "${textValue}"`}
        </button>
      )}
    </div>
  );
}

function ProveedorTipoFilter({ value, onChange, style }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={style} title="Tipo de proveedor">
      <option value="todos" style={OPT_ST}>Tipo proveedor: todos</option>
      {PROVEEDOR_TIPOS.map((tipo) => (
        <option key={tipo} value={tipo} style={OPT_ST}>{proveedorTipoUi(tipo)?.label || tipo}</option>
      ))}
    </select>
  );
}

function ProveedorAlternativasHint({ proveedor, proveedores, compact = false }) {
  const alternativas = useMemo(() => proveedorAlternativas(proveedor, proveedores), [proveedor, proveedores]);
  if (!alternativas.length) return null;
  const text = `Alternativas: ${alternativas.join(", ")}`;
  return (
    <span
      title={text}
      style={{
        color: C.t3,
        fontSize: compact ? 10 : 11,
        fontWeight: 750,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
        maxWidth: compact ? 220 : 300,
      }}
    >
      {text}
    </span>
  );
}

function SetupPendienteMateriales({ onRetry }) {
  return (
    <div style={{ padding: 28 }}>
      <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: 22, maxWidth: 620 }}>
        <div style={{ fontSize: 14, color: C.amber, fontWeight: 700, marginBottom: 8 }}>Faltan crear las tablas de Materiales</div>
        <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.7, marginBottom: 14 }}>
          No se pudieron leer las tablas <code style={{ fontFamily: C.mono, fontSize: 12 }}>panol_*</code>.
          Cuando estén disponibles en Supabase, tocá Reintentar.
        </div>
        <button type="button" onClick={onRetry} style={BTN_PRIMARY}>Reintentar</button>
      </div>
    </div>
  );
}

function ImportarTab({ batches, onImported }) {
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState("");
  const [parseErr, setParseErr] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function onFile(file) {
    if (!file) return;
    setParseErr(null);
    setResult(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      setParsed(parseMaterialesWorkbook(buf));
    } catch (e) {
      setParseErr(e);
    }
  }

  async function confirmar() {
    if (!parsed || importing) return;
    setImporting(true);
    setParseErr(null);
    try {
      const stats = await importarCatalogo(parsed, fileName);
      setResult(stats);
      setParsed(null);
      onImported?.();
    } catch (e) {
      setParseErr(e);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#60a5fa" : C.b0}`,
          borderRadius: 14,
          padding: "34px 20px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(59,130,246,0.05)" : C.s0,
          transition: "all .2s",
          marginBottom: 18,
        }}
      >
        <Upload size={30} style={{ marginBottom: 8, color: dragging ? "#60a5fa" : C.t2 }} />
        <div style={{ fontSize: 14, color: C.t0, fontWeight: 600 }}>Arrastrá el Excel de materiales acá</div>
        <div style={{ fontSize: 12, color: C.t2, marginTop: 5 }}>
          Cada hoja se toma como sector. Sólo se importan modelos 37, 52 y 55.
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          style={{ display: "none" }}
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
        />
      </div>

      {parseErr && (
        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: "#f87171" }}>
          {String(parseErr.message ?? parseErr)}
        </div>
      )}

      {result && (
        <div style={{ background: "rgba(16,185,129,0.07)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, color: C.green, fontWeight: 700, marginBottom: 6 }}>Importación completada</div>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.8 }}>
            {result.creados} materiales nuevos, {result.actualizados} actualizados y {result.cantidades_upsert} cantidades BOM cargadas/actualizadas.
          </div>
        </div>
      )}

      {parsed && (
        <div style={{ background: C.s0, border: `1px solid ${C.b1}`, borderRadius: 14, padding: 20, marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: "#60a5fa", fontWeight: 700, marginBottom: 12 }}>
            Vista previa — {fileName}
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <KpiCard label="Sectores" value={parsed.sectores.length} />
            <KpiCard label="Materiales" value={parsed.totalMateriales} />
            <KpiCard label="Cantidades BOM" value={parsed.totalCantidades} sub="37 / 52 / 55" />
            <KpiCard label="Hojas salteadas" value={parsed.skipped.length} sub={parsed.skipped.join(" · ") || "ninguna"} />
          </div>

          <div style={{ overflowX: "auto", border: `1px solid ${C.b0}`, borderRadius: 10, marginBottom: 14 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
              <thead>
                <tr>
                  <Th>Sector</Th>
                  <Th right>Materiales</Th>
                  <Th right>Cantidades</Th>
                  <Th>Hoja</Th>
                </tr>
              </thead>
              <tbody>
                {parsed.sectores.map((s) => {
                  const cant = s.materiales.reduce((sum, m) => sum + Object.keys(m.cantidades).length, 0);
                  return (
                    <tr key={s.sector.nombre}>
                      <Td>{s.sector.nombre}</Td>
                      <Td right mono>{s.materiales.length}</Td>
                      <Td right mono>{cant}</Td>
                      <Td color={C.t2}>{s.sector.sheetName}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={confirmar} disabled={importing} style={{ ...BTN_GREEN, opacity: importing ? 0.6 : 1, padding: "9px 22px", fontSize: 13 }}>
              {importing ? "Importando…" : "Confirmar e importar"}
            </button>
            <button type="button" onClick={() => setParsed(null)} disabled={importing} style={BTN}>Cancelar</button>
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 10 }}>
            Reimportar el mismo archivo no duplica: se actualiza por descripción dentro del sector.
          </div>
        </div>
      )}

      <div style={{ fontSize: 11, letterSpacing: 1.3, textTransform: "uppercase", color: C.t2, fontWeight: 700, margin: "20px 0 8px" }}>
        Importaciones anteriores
      </div>
      {!batches?.length ? (
        <div style={{ fontSize: 13, color: C.t2, padding: "14px 0" }}>Todavía no se importó ningún catálogo.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {batches.map((b) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 14, background: C.s0, border: `1px solid ${C.b0}`, borderRadius: 9, padding: "9px 14px", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: C.t0, fontWeight: 600, flex: 1, minWidth: 160 }}>{b.filename}</span>
              <span style={{ fontSize: 12, color: C.t2 }}>{b.stats?.materiales ?? 0} materiales · {b.stats?.cantidades ?? 0} cantidades</span>
              <span style={{ fontSize: 11, color: C.t2 }}>
                {new Date(b.created_at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectorChip({ cat, progressByCat, selectedId, onSelect, sub = false }) {
  const p = progressByCat.get(cat.id) ?? { total: 0, revisados: 0 };
  const on = selectedId === cat.id;
  const accent = sub ? "rgba(139,92,246,0.16)" : "rgba(59,130,246,0.14)";
  const accentBd = sub ? "rgba(139,92,246,0.4)" : "rgba(59,130,246,0.35)";
  const accentTx = sub ? "#a78bfa" : "#60a5fa";
  return (
    <button
      type="button"
      onClick={() => onSelect(cat.id)}
      style={{
        ...BTN,
        background: on ? accent : C.s0,
        border: `1px solid ${on ? accentBd : C.b0}`,
        color: on ? accentTx : C.t1,
        padding: sub ? "6px 10px" : "8px 12px",
        fontSize: sub ? 12 : 13,
      }}
    >
      {cat.nombre}
      <span style={{ marginLeft: 7, color: on ? accentTx : C.t2, fontFamily: C.mono }}>
        {p.revisados}/{p.total}
      </span>
    </button>
  );
}

function SectorSelector({ categorias, progressByCat, selectedId, onSelect, onAddSub, onSuggestSub, onDeleteSub }) {
  const raices = categorias.filter(esRaiz);
  const selected = categorias.find((c) => c.id === selectedId);
  const parentActivo = selected ? (selected.parent_id ? categorias.find((c) => c.id === selected.parent_id) : selected) : raices[0];
  const subs = parentActivo ? hijosDe(categorias, parentActivo.id) : [];
  const sugeridas = parentActivo ? subdivisionesSugeridas(parentActivo.nombre) : [];

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Sectores raíz */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {raices.map((cat) => (
          <SectorChip key={cat.id} cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} />
        ))}
      </div>

      {/* Subsectores del sector activo + gestión */}
      {parentActivo && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", marginTop: 9, paddingLeft: 12, borderLeft: `2px solid ${C.b0}` }}>
          <button
            type="button"
            onClick={() => onSelect(parentActivo.id)}
            style={{ ...BTN, padding: "5px 10px", fontSize: 12, background: selectedId === parentActivo.id ? C.s2 : "transparent", border: `1px solid ${C.b0}`, color: selectedId === parentActivo.id ? C.t0 : C.t2 }}
            title="Ver todo el sector (incluye subsectores)"
          >
            Todos
          </button>
          {subs.map((cat) => (
            <span key={cat.id} style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <SectorChip cat={cat} progressByCat={progressByCat} selectedId={selectedId} onSelect={onSelect} sub />
              {selectedId === cat.id && (
                <button type="button" onClick={() => onDeleteSub(cat)} title="Borrar subsector (sus materiales vuelven al sector)" style={{ ...BTN, padding: "2px 6px", marginLeft: 4, fontSize: 11, color: C.red, border: `1px solid ${C.b0}`, background: "transparent" }}>
                  <Trash2 size={11} />
                </button>
              )}
            </span>
          ))}
          <button type="button" onClick={() => onAddSub(parentActivo)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: C.t2, border: `1px dashed ${C.b1}`, background: "transparent" }}>
            + subsector
          </button>
          {subs.length === 0 && sugeridas.length > 0 && (
            <button type="button" onClick={() => onSuggestSub(parentActivo, sugeridas)} style={{ ...BTN, padding: "5px 10px", fontSize: 12, color: "#a78bfa", border: "1px solid rgba(139,92,246,0.35)", background: "rgba(139,92,246,0.1)" }} title={`Crear: ${sugeridas.join(" · ")}`}>
              ✨ Sugerir {sugeridas.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Selector para asignar el material a un subsector (o dejarlo en el sector general).
// Solo aparece si el sector tiene subsectores; si no, muestra el nombre a secas.
function SubsectorSelect({ categorias, value, onChange }) {
  const cat = categorias.find((c) => c.id === value);
  const raizId = cat?.parent_id ?? value;
  const raiz = categorias.find((c) => c.id === raizId);
  const hijos = raiz ? hijosDe(categorias, raizId) : [];
  if (!raiz || hijos.length === 0) {
    return <span style={{ fontSize: 12, color: C.t2 }}>{categoriaNombre(categorias, value)}</span>;
  }
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ ...INP, padding: "4px 8px", fontSize: 12, width: "auto", color: C.t1 }}
      title="Asignar a subsector"
    >
      <option value={raiz.id}>{raiz.nombre} · (general)</option>
      {hijos.map((h) => <option key={h.id} value={h.id}>{raiz.nombre} › {h.nombre}</option>)}
    </select>
  );
}

export {
  ProveedorSelect,
  ProveedorTipoFilter,
  ProveedorAlternativasHint,
  SetupPendienteMateriales,
  ImportarTab,
  SectorChip,
  SectorSelector,
  SubsectorSelect,
};
