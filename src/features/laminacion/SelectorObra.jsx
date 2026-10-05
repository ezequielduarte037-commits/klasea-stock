import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, PenLine, Search, X } from "lucide-react";
import { buscarObra, claveObra, desmoldeDe, fmtFecha } from "./obras";

// Elegir la obra en vez de escribirla. Muestra las obras en curso agrupadas por
// línea, con su fecha de desmolde; abajo, otros destinos (stock, varios…) y,
// como última opción, usar lo que se escribió tal cual.
//
//   <SelectorObra obras={obras} value={destino} onChange={(valor, obra) => …}
//     otros={[{ valor: "Stock Pampa 1050", label: "Stock Pampa 1050", detalle: "sin obra" }]} />
export default function SelectorObra({
  obras = [],
  value = "",
  onChange,
  otros = [],
  permitirLibre = true,
  placeholder = "Elegí la obra…",
  id,
  invalido = false,
}) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  // Dónde se dibuja la lista (fija en la pantalla). Va en una capa propia: si
  // quedaba adentro del bloque, el bloque de abajo se pintaba encima.
  const [pos, setPos] = useState(null);
  const [alto, setAlto] = useState(340);
  const popRef = useRef(null);
  const [q, setQ] = useState("");
  const [activa, setActiva] = useState(0);
  const raiz = useRef(null);
  const boton = useRef(null);
  const listaRef = useRef(null);

  const obraSel = buscarObra(obras, value);
  const otroSel = !obraSel ? otros.find((o) => claveObra(o.valor) === claveObra(value)) : null;

  // Entradas que se pueden elegir, en el orden en que se muestran.
  const { grupos, planas } = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const clave = claveObra(q);
    const coincide = (o) => !texto
      || o.codigo.toLowerCase().includes(texto)
      || (clave && (o.clave.includes(clave) || o.alias?.includes(clave)))
      || (o.lineaLabel || "").toLowerCase().includes(texto);
    const enCurso = obras.filter((o) => o.estado !== "terminada" && coincide(o));
    const terminadas = texto ? obras.filter((o) => o.estado === "terminada" && coincide(o)) : [];
    const otrosVisibles = otros.filter((o) => !texto || `${o.label} ${o.valor} ${o.detalle || ""}`.toLowerCase().includes(texto));

    const lista = [];
    const porLinea = new Map();
    for (const o of enCurso) {
      const k = o.lineaLabel || "Otras";
      if (!porLinea.has(k)) porLinea.set(k, []);
      porLinea.get(k).push(o);
    }
    // Primero las líneas K por número; Hunter, Antago y el resto al final.
    const pesoLinea = (o) => (o.linea === "K34" ? 900 : o.linea === "ANTAGO" ? 901 : /^K\d+$/.test(o.linea || "") ? Number(o.linea.slice(1)) : 999);
    const ordenLineas = [...porLinea.entries()].sort((a, b) => pesoLinea(a[1][0]) - pesoLinea(b[1][0]));
    for (const [linea, items] of ordenLineas) {
      lista.push({ titulo: linea, items: items.map((o) => ({ tipo: "obra", obra: o, valor: o.valor })) });
    }
    if (otrosVisibles.length) lista.push({ titulo: "Otros destinos", items: otrosVisibles.map((o) => ({ tipo: "otro", otro: o, valor: o.valor })) });
    if (terminadas.length) lista.push({ titulo: "Terminadas", items: terminadas.map((o) => ({ tipo: "obra", obra: o, valor: o.valor })) });

    const exacta = clave && (buscarObra(obras, q) || otros.some((o) => claveObra(o.valor) === clave));
    const libre = permitirLibre && texto && !exacta ? { tipo: "libre", valor: q.trim().replace(/\s+/g, " ").toUpperCase() } : null;
    // Cada entrada lleva su posición para moverse con las flechas.
    let n = 0;
    const conIndice = lista.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, idx: n++ })) }));
    const planasArr = [...conIndice.flatMap((g) => g.items), ...(libre ? [{ ...libre, idx: n }] : [])];
    return { grupos: conIndice, planas: planasArr };
  }, [obras, otros, q, permitirLibre]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (raiz.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setAbierto(false);
    };
    // La lista es fija: si se scrollea lo de atrás quedaría flotando lejos del campo.
    const alScroll = (e) => { if (!popRef.current?.contains(e.target)) setAbierto(false); };
    const cerrar = () => setAbierto(false);
    const t = setTimeout(() => document.addEventListener("pointerdown", fuera), 0);
    window.addEventListener("scroll", alScroll, true);
    window.addEventListener("resize", cerrar);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("scroll", alScroll, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  // La opción resaltada queda a la vista al moverse con las flechas.
  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.querySelector(`[data-idx="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function abrir() {
    const r = boton.current?.getBoundingClientRect();
    if (r) {
      // En el celular la barra de pestañas de abajo y la de la app arriba tapan
      // parte de la pantalla: la lista se abre hacia donde haya más lugar.
      const barra = document.querySelector(".lam-nav")?.getBoundingClientRect();
      const piso = barra && barra.top > window.innerHeight / 2 ? barra.top : window.innerHeight;
      const techo = document.querySelector(".ka-shell-content")?.getBoundingClientRect().top ?? 0;
      const abajo = piso - r.bottom - 14;
      const encima = r.top - techo - 14;
      const sube = abajo < 300 && encima > abajo;
      const ancho = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
      setPos({
        left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
        ancho,
        top: sube ? null : r.bottom + 6,
        bottom: sube ? window.innerHeight - r.top + 6 : null,
        // Se dibuja en la raíz de Laminación (sus estilos van con ámbito .lam).
        destino: raiz.current?.closest(".lam") || document.body,
      });
      // 62 px son el buscador y su borde.
      setAlto(Math.max(150, Math.min(340, (sube ? encima : abajo) - 62)));
    }
    setQ("");
    const i = planas.findIndex((p) => (p.tipo === "obra" ? p.obra.clave === obraSel?.clave : claveObra(p.valor) === claveObra(value)));
    setActiva(Math.max(0, i));
    setAbierto(true);
  }

  function elegir(entrada) {
    if (!entrada) return;
    onChange?.(entrada.valor, entrada.tipo === "obra" ? entrada.obra : null);
    setAbierto(false);
    boton.current?.focus();
  }

  function tecla(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => Math.min(planas.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(planas[activa]); }
    else if (e.key === "Escape") { e.preventDefault(); setAbierto(false); boton.current?.focus(); }
  }

  const desm = desmoldeDe(obraSel);

  return (
    <div className="lam-sel" ref={raiz}>
      <button
        ref={boton}
        id={id}
        type="button"
        className={`lam-sel-boton${abierto ? " abierto" : ""}`}
        style={{ ...(invalido && !value ? { borderColor: "var(--red-border)" } : {}), ...(value ? { paddingRight: 40 } : {}) }}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={(e) => { if (!abierto && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) { e.preventDefault(); abrir(); } }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
      >
        {obraSel ? (
          <>
            <span className="lam-sel-cod">{obraSel.codigo}</span>
            <span className="lam-sel-meta">
              {obraSel.lineaLabel}{desm ? ` · desmolde ${fmtFecha(desm)}${obraSel.desmoldeReal ? "" : " (est.)"}` : " · sin fecha de desmolde"}
            </span>
          </>
        ) : otroSel ? (
          <>
            <span style={{ fontWeight: 600 }}>{otroSel.label}</span>
            {otroSel.detalle && <span className="lam-sel-meta">{otroSel.detalle}</span>}
          </>
        ) : value ? (
          <>
            <span style={{ fontWeight: 600 }}>{value}</span>
            <span className="lam-sel-meta"><span className="lam-tag" data-tono="violeta">escrito a mano</span></span>
          </>
        ) : (
          <span className="vacio">{placeholder}</span>
        )}
        {!value && <ChevronDown size={16} className="lam-sel-chev" />}
      </button>
      {value && (
        <button
          type="button"
          className="lam-btn-ic chico"
          aria-label="Quitar la obra elegida"
          title="Quitar"
          onClick={() => { onChange?.("", null); setAbierto(false); }}
          style={{ position: "absolute", right: 5, top: 5, border: 0, background: "transparent" }}
        >
          <X size={15} />
        </button>
      )}

      {abierto && pos && createPortal(
        <div
          ref={popRef}
          className="lam-sel-pop"
          style={{ position: "fixed", zIndex: 160, left: pos.left, width: pos.ancho, right: "auto", top: pos.top ?? "auto", bottom: pos.bottom ?? "auto" }}
          onKeyDown={tecla}
        >
          <div className="lam-sel-buscar">
            <Search size={15} />
            <input
              autoFocus
              className="ui-input"
              value={q}
              onChange={(e) => { setQ(e.target.value); setActiva(0); }}
              placeholder="Buscar obra o destino…"
              aria-label="Buscar obra"
              aria-controls={idLista}
              aria-activedescendant={planas[activa] ? `${idLista}-${activa}` : undefined}
            />
          </div>
          <div className="lam-sel-lista" role="listbox" id={idLista} ref={listaRef} style={{ maxHeight: alto }}>
            {grupos.length === 0 && !planas.length && (
              <div className="lam-sel-nada">Ninguna obra coincide{permitirLibre ? "." : ". Probá con otro número."}</div>
            )}
            {grupos.map((g) => (
              <div key={g.titulo} role="group" aria-label={g.titulo}>
                <div className="lam-sel-grupo">{g.titulo}</div>
                {g.items.map((it) => {
                  const i = it.idx;
                  const sel = it.tipo === "obra" ? it.obra.clave === obraSel?.clave : claveObra(it.valor) === claveObra(value);
                  if (it.tipo === "obra") {
                    const o = it.obra;
                    const f = desmoldeDe(o);
                    return (
                      <button
                        key={`o-${o.clave}`}
                        type="button"
                        id={`${idLista}-${i}`}
                        data-idx={i}
                        role="option"
                        aria-selected={sel}
                        className={`lam-sel-op${sel ? " on" : ""}${i === activa ? " activa" : ""}`}
                        onMouseEnter={() => setActiva(i)}
                        onClick={() => elegir(it)}
                      >
                        <span className="cod">{o.codigo}</span>
                        <span className="det">{o.estado === "pausada" ? "pausada" : o.estado === "terminada" ? "terminada" : f ? (o.desmoldeReal ? "desmoldada" : "desmolde estimado") : "sin fecha de desmolde"}</span>
                        <span className="fec">{f ? fmtFecha(f) : ""}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={`x-${it.valor}`}
                      type="button"
                      id={`${idLista}-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={sel}
                      className={`lam-sel-op otro${sel ? " on" : ""}${i === activa ? " activa" : ""}`}
                      onMouseEnter={() => setActiva(i)}
                      onClick={() => elegir(it)}
                    >
                      <span className="cod">{it.otro.label}</span>
                      <span className="det">{it.otro.detalle || ""}</span>
                      <span />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {planas.some((p) => p.tipo === "libre") && (() => {
            const libre = planas[planas.length - 1];
            const i = libre.idx;
            return (
              <button
                type="button"
                id={`${idLista}-${i}`}
                data-idx={i}
                className={`lam-sel-libre${i === activa ? " activa" : ""}`}
                onMouseEnter={() => setActiva(i)}
                onClick={() => elegir(libre)}
              >
                <PenLine size={14} /> No está en la lista: usar <b>«{libre.valor}»</b>
              </button>
            );
          })()}
        </div>,
        pos.destino,
      )}
    </div>
  );
}
