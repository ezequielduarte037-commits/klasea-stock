import { useState } from "react";
import { Bookmark, Check, SlidersHorizontal, Trash2, X } from "lucide-react";
import { C } from "@/theme";

const button = { border: `1px solid ${C.border}`, borderRadius: 8, background: "var(--panel-solid)", color: C.text, padding: "8px 10px", font: "inherit", fontSize: 12, cursor: "pointer" };

function leerVistas(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.filter(v => v && typeof v.id === "string" && typeof v.nombre === "string" && typeof v.config?.linea === "string").slice(0, 20) : [];
  } catch { return []; }
}

export default function PlanillaHerramientas({ usuario, config, onApply, densidad, onDensidad, anchoMaterial, onAnchoMaterial, anchoObra, onAnchoObra, cantidad }) {
  const key = `klasea.planilla.vistas.v1.${usuario || "local"}`;
  const [vistas, setVistas] = useState(() => leerVistas(key));
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [ajustes, setAjustes] = useState(false);
  const [mensaje, setMensaje] = useState("");

  function persistir(next) {
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setVistas(next);
      return true;
    } catch {
      setMensaje("El navegador no permitió guardar la vista. Podés seguir usando los filtros.");
      return false;
    }
  }

  function guardar(event) {
    event.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return;
    if (vistas.length >= 20) { setMensaje("Podés guardar hasta 20 vistas. Eliminá una para agregar otra."); return; }
    const id = globalThis.crypto?.randomUUID?.() || `vista-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (persistir([...vistas, { id, nombre: limpio, config }])) {
      setGuardando(false);
      setNombre("");
      setMensaje("Vista guardada para tu usuario en este navegador.");
    }
  }

  return <section aria-label="Vistas y presentación" style={{ display: "grid", gap: 10, padding: "10px 12px", border: `1px solid ${C.border}`, borderRadius: 12, background: "var(--panel-solid)", color: C.text }}>
    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <span style={{ color: C.dim, fontSize: 12, marginRight: "auto" }}>{cantidad} materiales · tocá una celda para ver su detalle</span>
      <select aria-label="Densidad de la planilla" value={densidad} onChange={e => onDensidad(e.target.value)} style={button}>
        <option value="comoda">Vista cómoda</option><option value="compacta">Vista compacta</option>
      </select>
      <button type="button" style={button} aria-expanded={ajustes} onClick={() => setAjustes(!ajustes)}><SlidersHorizontal size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Columnas</button>
      <button type="button" style={button} aria-expanded={guardando} onClick={() => { setGuardando(!guardando); setMensaje(""); }}><Bookmark size={13} style={{ verticalAlign: "middle", marginRight: 5 }} />Guardar vista</button>
    </div>
    {ajustes && <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: 10, background: "var(--panel-2)", borderRadius: 8 }}>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Material · {anchoMaterial}px<input type="range" min="260" max="520" step="20" value={anchoMaterial} onChange={e => onAnchoMaterial(Number(e.target.value))} /></label>
      <label style={{ display: "grid", gap: 5, fontSize: 12 }}>Cada obra · {anchoObra}px<input type="range" min="90" max="200" step="10" value={anchoObra} onChange={e => onAnchoObra(Number(e.target.value))} /></label>
    </div>}
    {guardando && <form onSubmit={guardar} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <input autoFocus aria-label="Nombre de la vista" maxLength={60} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej.: Famiq · K55 por comprar" style={{ ...button, cursor: "text", flex: "1 1 220px" }} />
      <button type="submit" disabled={!nombre.trim()} style={button}><Check size={13} /> Guardar</button>
      <button type="button" aria-label="Cancelar guardado" style={button} onClick={() => setGuardando(false)}><X size={13} /></button>
      <small style={{ color: C.dim, flexBasis: "100%" }}>Guarda la línea, obra, búsqueda y filtros. Sólo en este navegador y para tu usuario.</small>
    </form>}
    {vistas.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {vistas.map(v => <span key={v.id} style={{ display: "inline-flex", border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <button type="button" onClick={() => onApply(v.config)} title={`Abrir ${v.nombre}`} style={{ ...button, border: 0, color: C.blue }}>{v.nombre}</button>
        <button type="button" aria-label={`Eliminar vista ${v.nombre}`} onClick={() => persistir(vistas.filter(item => item.id !== v.id))} style={{ ...button, border: 0, color: C.dim }}><Trash2 size={12} /></button>
      </span>)}
    </div>}
    {mensaje && <small role="status" style={{ color: C.dim }}>{mensaje}</small>}
  </section>;
}
