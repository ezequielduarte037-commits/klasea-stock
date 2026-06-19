import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Link as LinkIcon, PackagePlus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { cosecharCandidatos, fetchCandidatos, promoverCandidato } from "./api";
import { fmtMoney } from "./format";
import { norm } from "./materialesParser";

const FUENTE_META = {
  compras_pedido: { label: "Pedido compras", color: "#60a5fa" },
  compras_carga: { label: "Carga compra", color: "#34d399" },
  panol_envio: { label: "Pañol", color: "#a78bfa" },
};

const inp = (over) => ({
  width: "100%",
  border: `1px solid ${C.b0}`,
  borderRadius: 7,
  background: "var(--panel)",
  color: C.t0,
  padding: "7px 9px",
  fontSize: 12,
  fontFamily: C.sans,
  outline: "none",
  boxSizing: "border-box",
  ...over,
});

const btn = (color, filled = true) => ({
  border: `1px solid ${filled ? "transparent" : color + "55"}`,
  background: filled ? color : "transparent",
  color: filled ? "#fff" : color,
  borderRadius: 7,
  padding: "6px 11px",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: C.sans,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
});

function FuenteChip({ fuente }) {
  const meta = FUENTE_META[fuente] || { label: fuente, color: C.dim };
  return (
    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: meta.color, background: `${meta.color}1c`, border: `1px solid ${meta.color}44`, borderRadius: 5, padding: "2px 6px" }}>
      {meta.label}
    </span>
  );
}

function VincularPicker({ materiales, onPick, onCancel }) {
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const needle = norm(q);
    if (!needle) return materiales.slice(0, 8);
    return materiales
      .filter((m) => norm(`${m.descripcion} ${m.codigo || ""}`).includes(needle))
      .slice(0, 8);
  }, [q, materiales]);

  return (
    <div style={{ display: "grid", gap: 6, marginTop: 8, padding: 9, background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Search size={13} color={C.dim} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material del catálogo…" style={inp({ padding: "6px 8px" })} />
        <button type="button" onClick={onCancel} title="Cancelar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4 }}><X size={14} /></button>
      </div>
      {matches.length === 0 ? (
        <div style={{ color: C.dim, fontSize: 11, padding: "2px 2px 4px" }}>Sin coincidencias en el catálogo.</div>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          {matches.map((m) => (
            <button key={m.id} type="button" onClick={() => onPick(m.id)} style={{ textAlign: "left", border: `1px solid ${C.b0}`, background: C.panelSolid, color: C.t0, borderRadius: 6, padding: "6px 8px", cursor: "pointer", fontSize: 12, fontFamily: C.sans }}>
              <span style={{ fontWeight: 700 }}>{m.descripcion}</span>
              {m.codigo ? <span style={{ color: C.dim, fontFamily: C.mono, marginLeft: 6 }}>· {m.codigo}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CrearPicker({ categorias, onCreate, onCancel }) {
  const [catId, setCatId] = useState(categorias[0]?.id || "");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, padding: 9, background: "var(--panel)", border: `1px solid ${C.b0}`, borderRadius: 8, flexWrap: "wrap" }}>
      <span style={{ color: C.t2, fontSize: 11, fontWeight: 700 }}>Sector:</span>
      <select value={catId} onChange={(e) => setCatId(e.target.value)} style={inp({ width: "auto", minWidth: 150, padding: "6px 8px", background: C.panelSolid, cursor: "pointer" })}>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <button type="button" disabled={!catId} onClick={() => onCreate(catId)} style={btn(C.green)}><PackagePlus size={13} /> Crear material</button>
      <button type="button" onClick={onCancel} title="Cancelar" style={{ border: "none", background: "transparent", color: C.dim, cursor: "pointer", padding: 4 }}><X size={14} /></button>
    </div>
  );
}

function CandidatoRow({ cand, categorias, materiales, onAction, busy }) {
  const [mode, setMode] = useState(null); // 'vincular' | 'crear' | null
  const precio = cand.precio_unitario != null && cand.precio_unitario !== ""
    ? fmtMoney(cand.precio_unitario, cand.moneda || "ARS")
    : null;

  async function run(accion, opts) {
    setMode(null);
    await onAction(cand.id, accion, opts);
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 10, padding: 11, opacity: busy ? 0.55 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ color: C.text, fontSize: 13, fontWeight: 800 }}>{cand.descripcion || "—"}</span>
            <FuenteChip fuente={cand.fuente} />
          </div>
          <div style={{ color: C.dim, fontSize: 11, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cand.codigo ? <span style={{ fontFamily: C.mono }}>{cand.codigo}</span> : null}
            {cand.cantidad ? <span>{cand.cantidad} {cand.unidad || ""}</span> : null}
            {cand.obra_codigo ? <span>Obra {cand.obra_codigo}</span> : null}
            {cand.modelo ? <span style={{ color: C.blue }}>Modelo {cand.modelo}</span> : null}
          </div>
        </div>
        {precio && <div style={{ color: C.green, fontFamily: C.mono, fontSize: 13, fontWeight: 850 }}>{precio}</div>}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
        <button type="button" disabled={busy} onClick={() => setMode(mode === "vincular" ? null : "vincular")} style={btn(C.blue, false)}><LinkIcon size={13} /> Vincular</button>
        <button type="button" disabled={busy} onClick={() => setMode(mode === "crear" ? null : "crear")} style={btn(C.green, false)}><PackagePlus size={13} /> Crear</button>
        <button type="button" disabled={busy} onClick={() => run("descartar")} style={btn(C.red, false)}><Trash2 size={13} /> Descartar</button>
      </div>

      {mode === "vincular" && (
        <VincularPicker materiales={materiales} onPick={(materialId) => run("vincular", { materialId })} onCancel={() => setMode(null)} />
      )}
      {mode === "crear" && (
        <CrearPicker categorias={categorias} onCreate={(categoriaId) => run("crear", { categoriaId })} onCancel={() => setMode(null)} />
      )}
    </div>
  );
}

export default function BandejaTab({ categorias = [], materiales = [], onChanged }) {
  const toast = useToast();
  const [candidatos, setCandidatos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [aviso, setAviso] = useState(null);

  const recargar = useCallback(async () => {
    try {
      setCandidatos(await fetchCandidatos({ estado: "pendiente" }));
    } catch (e) {
      setAviso(e.message || "No se pudieron cargar los candidatos.");
    }
  }, []);

  const sincronizar = useCallback(async ({ silencioso = false } = {}) => {
    setSyncing(true);
    setAviso(null);
    try {
      const nuevos = await cosecharCandidatos();
      await recargar();
      if (!silencioso) toast.success(nuevos > 0 ? `${nuevos} material${nuevos === 1 ? "" : "es"} nuevo${nuevos === 1 ? "" : "s"} detectado${nuevos === 1 ? "" : "s"}` : "Todo al día, sin novedades.");
    } catch (e) {
      // Degrada con gracia: si el SQL no está corrido o un constraint falla, mostramos
      // los candidatos que ya existan e informamos sin romper la pantalla.
      await recargar();
      setAviso(e.message || "No se pudo sincronizar. Revisá que el SQL de candidatos esté aplicado.");
    } finally {
      setSyncing(false);
    }
  }, [recargar, toast]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      await sincronizar({ silencioso: true });
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [sincronizar]);

  async function handleAction(id, accion, opts) {
    setBusyId(id);
    try {
      await promoverCandidato(id, accion, opts);
      setCandidatos((prev) => prev.filter((c) => c.id !== id));
      if (accion !== "descartar") onChanged?.();
      toast.success(accion === "vincular" ? "Vinculado al material" : accion === "crear" ? "Material creado" : "Candidato descartado");
    } catch (e) {
      toast.error(e.message || "No se pudo completar la acción.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{"@keyframes spin { to { transform: rotate(360deg); } }"}</style>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 900 }}>Bandeja de entrada</div>
          <div style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
            Materiales detectados en pedidos a compras y envíos a pañol. Vinculá a un material existente, creá uno nuevo, o descartá.
          </div>
        </div>
        <button type="button" disabled={syncing} onClick={() => sincronizar()} style={btn(C.blue, false)}>
          <RefreshCw size={14} style={{ animation: syncing ? "spin 1s linear infinite" : undefined }} /> {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>

      {aviso && (
        <div style={{ border: `1px solid ${C.amberB || "rgba(245,158,11,0.4)"}`, background: "var(--amber-soft)", color: C.amber, borderRadius: 9, padding: "9px 11px", fontSize: 12 }}>
          {aviso}
        </div>
      )}

      {loading ? (
        <div style={{ color: C.dim, fontSize: 13, padding: 16 }}>Buscando materiales en compras y pañol…</div>
      ) : candidatos.length === 0 ? (
        <div style={{ display: "grid", gap: 6, placeItems: "center", padding: "32px 16px", color: C.dim, textAlign: "center" }}>
          <Check size={26} color={C.green} />
          <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>Bandeja vacía</div>
          <div style={{ fontSize: 12 }}>No hay materiales pendientes de revisar. A medida que se trabajen pedidos y envíos van a ir apareciendo acá.</div>
        </div>
      ) : (
        <>
          <div style={{ color: C.t2, fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase" }}>{candidatos.length} pendiente{candidatos.length === 1 ? "" : "s"}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {candidatos.map((cand) => (
              <CandidatoRow
                key={cand.id}
                cand={cand}
                categorias={categorias}
                materiales={materiales}
                onAction={handleAction}
                busy={busyId === cand.id}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
