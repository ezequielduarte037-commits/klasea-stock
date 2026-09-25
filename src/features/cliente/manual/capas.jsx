/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · capas (índice, buscador, emergencia)
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Moon, Power, Sun, X } from "lucide-react";
import { CAPITULOS, TELEFONOS, indiceBusqueda, normalizar } from "./contenido";
import { PasosEmergencia } from "./capitulos";
import { useBloquearScroll } from "./almacen";

function useEscape(activo, onCerrar) {
  useEffect(() => {
    if (!activo) return undefined;
    const onKey = e => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activo, onCerrar]);
}

export function Indice({ actual, onIr, onCerrar, onSalir, onTono, tono, onRecorrido }) {
  const [hover, setHover] = useState(actual || null);
  const cap = CAPITULOS.find(c => c.id === hover) || CAPITULOS[0];
  useEscape(true, onCerrar);
  return (
    <nav className="kx-indice kx-ink" aria-label="Índice del manual">
      <div className="kx-indice-grid">
        <ol className="kx-indice-lista">
          <li style={{ "--i": 0 }}>
            <button type="button" className="kx-indice-item" aria-current={!actual ? "page" : undefined} onClick={() => onIr(null)} onMouseEnter={() => setHover(null)} onFocus={() => setHover(null)}>
              <small>00</small>Inicio
            </button>
          </li>
          {CAPITULOS.map((c, i) => (
            <li key={c.id} style={{ "--i": i + 1 }}>
              <button type="button" className="kx-indice-item" aria-current={actual === c.id ? "page" : undefined}
                onClick={() => onIr(c.id)} onMouseEnter={() => setHover(c.id)} onFocus={() => setHover(c.id)}>
                <small>{c.n}</small>{c.t}
              </button>
            </li>
          ))}
        </ol>
        <div className="kx-indice-lado">
          <div>
            <div className="kx-indice-num" key={cap.n + String(hover)} style={{ animation: "kx-fade .4s var(--kx-ez) both" }}>{hover ? cap.n : "00"}</div>
            <p className="kx-indice-desc" key={String(hover)} style={{ animation: "kx-up .4s var(--kx-ez) both" }}>
              {hover ? cap.k : "La portada del manual, con lo esencial y las condiciones de hoy."}
            </p>
          </div>
          <div className="kx-indice-pie">
            {onRecorrido && <button type="button" className="kx-link" onClick={onRecorrido}>Recorrido 3D <ArrowRight size={13} strokeWidth={1.5} /></button>}
            <button type="button" className="kx-link" onClick={onTono}>
              {tono === "noche" ? <><Sun size={13} strokeWidth={1.5} /> Modo día</> : <><Moon size={13} strokeWidth={1.5} /> Modo noche</>}
            </button>
            <button type="button" className="kx-link" onClick={onSalir}><Power size={13} strokeWidth={1.5} /> Cerrar sesión</button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export function Buscador({ onCerrar, onElegir }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const todos = useMemo(() => indiceBusqueda(), []);
  const resultados = useMemo(() => {
    const n = normalizar(q.trim());
    if (!n) return todos.filter(r => r.tipo === "Capítulo");
    const palabras = n.split(/\s+/);
    return todos
      .map(r => {
        const titulo = normalizar(r.t);
        const cuerpo = normalizar(`${r.t} ${r.d} ${r.tipo}`);
        if (!palabras.every(p => cuerpo.includes(p))) return null;
        const puntaje = (titulo.startsWith(n) ? 3 : 0) + (titulo.includes(n) ? 2 : 0) + (r.tipo === "Capítulo" ? 1 : 0);
        return { ...r, puntaje };
      })
      .filter(Boolean)
      .sort((a, b) => b.puntaje - a.puntaje)
      .slice(0, 12);
  }, [q, todos]);
  useEscape(true, onCerrar);
  useEffect(() => { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }, []);
  const indiceSel = Math.min(sel, Math.max(resultados.length - 1, 0));
  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(Math.min(indiceSel + 1, resultados.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel(Math.max(indiceSel - 1, 0)); }
    if (e.key === "Enter" && resultados[indiceSel]) onElegir(resultados[indiceSel]);
  };
  return (
    <div className="kx-buscador kx-ink" role="dialog" aria-modal="true" aria-label="Buscar en el manual">
      <div className="kx-buscador-in">
        <div className="kx-eyebrow">Buscar en el manual</div>
        <input
          ref={inputRef}
          className="kx-input"
          value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onKeyDown={onKey}
          placeholder="Baterías, ancla, inverter…"
          aria-label="Qué estás buscando"
        />
        <ul className="kx-res" key={q ? "r" : "c"}>
          {resultados.map((r, i) => (
            <li key={`${r.tipo}-${r.t}`} style={{ "--i": i }}>
              <button type="button" data-activo={i === indiceSel ? "1" : "0"} onMouseEnter={() => setSel(i)} onClick={() => onElegir(r)}>
                <span className="kx-eyebrow">{r.tipo}</span>
                <span style={{ minWidth: 0 }}>
                  <strong>{r.t}</strong>
                  <span className="kx-res-d">{r.d}</span>
                </span>
                <ArrowRight size={16} strokeWidth={1.5} />
              </button>
            </li>
          ))}
        </ul>
        {!resultados.length && (
          <p className="kx-p" style={{ marginTop: 32 }}>No encontramos «{q}». Probá con otra palabra o escribinos desde Postventa.</p>
        )}
      </div>
    </div>
  );
}

export function ModoEmergencia({ inicial, onCerrar, nombreBarco }) {
  useEscape(true, onCerrar);
  useBloquearScroll(true);
  return (
    <div className="kx-sos-capa" role="dialog" aria-modal="true" aria-label="Modo emergencia">
      <div className="kx-wrap">
        <div className="kx-sos-cab">
          <span className="kx-eyebrow" style={{ color: "var(--kx-sos)" }}>Modo emergencia{nombreBarco ? ` · ${nombreBarco}` : ""}</span>
          <button type="button" className="kx-btn kx-btn-chico" style={{ background: "transparent", color: "#f2f2f0", border: "1px solid rgba(255,255,255,.25)" }} onClick={onCerrar}>
            <X size={15} strokeWidth={1.5} /> Cerrar
          </button>
        </div>
        <h1 className="kx-sos-t">Calma.<br />Un paso a la vez.</h1>
        <div className="kx-tels">
          {TELEFONOS.map(t => t.tel ? (
            <a key={t.t} className="kx-tel" href={`tel:${t.tel}`}>
              <span className="kx-eyebrow" style={{ color: "#8d8d8d" }}>{t.t}</span>
              <strong>{t.v}</strong>
            </a>
          ) : (
            <div key={t.t} className="kx-tel">
              <span className="kx-eyebrow" style={{ color: "#8d8d8d" }}>{t.t}</span>
              <strong>{t.v}</strong>
            </div>
          ))}
        </div>
        <PasosEmergencia inicial={inicial} oscuro />
      </div>
    </div>
  );
}
