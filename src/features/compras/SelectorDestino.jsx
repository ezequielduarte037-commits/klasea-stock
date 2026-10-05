import { useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, PenLine, Search, X } from "lucide-react";
import { RaizCompras } from "./modulo";

// Elegir la obra (o el stock) de una lista en vez de escribirla. Las obras son
// las de Producción (`produccion_obras`) agrupadas por línea; abajo van otros
// destinos (stock de cada galpón) y, como última opción, usar lo escrito tal
// cual. Guarda siempre el código exacto de la obra: así el pedido queda ligado
// a la obra (`project_id`) y no a un texto parecido.
//
//   <SelectorDestino obras={projects} value={destino} onChange={(valor, obra) => …}
//     otros={["Stock Pampa 1050", "Stock Chubut 2120"]} />

function claves(texto) {
  const s = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const base = s.replace(/[^a-z0-9]/g, "");
  const out = new Set([base]);
  const hunter = s.match(/^hunter[\s-]*h?[\s-]*(\d+)/);
  if (hunter) { out.add(`h${hunter[1]}`); out.add(`hunter${hunter[1]}`); }
  const antago = s.match(/^antago[\s-]*a?[\s-]*(\d+)/);
  if (antago) { out.add(`a${antago[1]}`); out.add(`antago${antago[1]}`); }
  if (/^\d/.test(base)) out.add(`k${base}`);
  return [...out];
}

function normalizarBusqueda(q) {
  return String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

function lineaDe(codigo) {
  const c = String(codigo || "").toUpperCase();
  if (c.startsWith("HUNTER")) return { key: "zh", label: "Hunter" };
  if (c.startsWith("ANTAGO")) return { key: "za", label: "Antago" };
  const m = c.replace(/^K/, "").match(/^(\d+)-/);
  if (m) return { key: `k${m[1].padStart(3, "0")}`, label: `K${m[1]}` };
  return { key: "zz", label: "Otras" };
}

function mismo(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

export default function SelectorDestino({
  obras = [],
  value = "",
  onChange,
  otros = [],
  permitirLibre = true,
  placeholder = "Elegí la obra…",
  id,
  invalido = false,
  prefijoObra = "",
  chico = false,
}) {
  const raizModulo = useContext(RaizCompras);
  const idLista = useId();
  const [pos, setPos] = useState(null); // null = cerrado
  const [q, setQ] = useState("");
  const [activa, setActiva] = useState(0);
  const boton = useRef(null);
  const pop = useRef(null);
  const listaRef = useRef(null);

  const otrosNorm = useMemo(() => otros.map((o) => (typeof o === "string" ? { valor: o, label: o } : o)), [otros]);
  // El texto que se guarda para una obra: el código, con un prefijo si el
  // circuito lo espera así ("Obra 52-27" en los pedidos que arman otros módulos).
  const valorDe = (o) => `${prefijoObra}${o.codigo}`;
  const obraSel = value ? obras.find((o) => mismo(valorDe(o), value) || (prefijoObra && mismo(o.codigo, value))) : null;
  const otroSel = !obraSel && value ? otrosNorm.find((o) => mismo(o.valor, value)) : null;
  const abierto = Boolean(pos);

  const { grupos, planas } = useMemo(() => {
    const nq = normalizarBusqueda(q);
    const coincide = (o) => !nq
      || claves(o.codigo).some((k) => k.includes(nq))
      || normalizarBusqueda(o.descripcion).includes(nq);
    const enCurso = obras.filter((o) => o.estado !== "terminada" && coincide(o));
    const terminadas = nq ? obras.filter((o) => o.estado === "terminada" && coincide(o)) : [];
    const otrosVisibles = otrosNorm.filter((o) => !nq || normalizarBusqueda(`${o.label} ${o.valor}`).includes(nq));

    const porLinea = new Map();
    for (const o of enCurso) {
      const l = lineaDe(o.codigo);
      if (!porLinea.has(l.key)) porLinea.set(l.key, { titulo: l.label, items: [] });
      porLinea.get(l.key).items.push(o);
    }
    const lista = [...porLinea.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, g]) => ({
        titulo: g.titulo,
        items: [...g.items]
          .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }))
          .map((o) => ({ tipo: "obra", obra: o, valor: valorDe(o) })),
      }));
    if (otrosVisibles.length) lista.push({ titulo: "Otros destinos", items: otrosVisibles.map((o) => ({ tipo: "otro", otro: o, valor: o.valor })) });
    if (terminadas.length) lista.push({ titulo: "Terminadas", items: terminadas.map((o) => ({ tipo: "obra", obra: o, valor: valorDe(o) })) });

    const texto = q.trim().replace(/\s+/g, " ");
    const exacta = texto && (obras.some((o) => claves(o.codigo).includes(nq)) || otrosNorm.some((o) => mismo(o.valor, texto)));
    const libre = permitirLibre && texto && !exacta ? { tipo: "libre", valor: texto } : null;
    let n = 0;
    const conIndice = lista.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, idx: n++ })) }));
    return { grupos: conIndice, planas: [...conIndice.flatMap((g) => g.items), ...(libre ? [{ ...libre, idx: n }] : [])] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras, otrosNorm, q, permitirLibre, prefijoObra]);

  // Cerrar al tocar afuera, al cambiar el tamaño o al scrollear lo de atrás
  // (la lista es `fixed` y quedaría flotando lejos del campo).
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (boton.current?.contains(e.target) || pop.current?.contains(e.target)) return;
      setPos(null);
    };
    const alScroll = (e) => { if (!pop.current?.contains(e.target)) setPos(null); };
    const cerrar = () => setPos(null);
    const t = setTimeout(() => document.addEventListener("pointerdown", fuera), 0);
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", alScroll, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("scroll", alScroll, true);
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    listaRef.current?.querySelector(`[data-idx="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function abrir() {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const abajo = vh - r.bottom - 14;
    const encima = r.top - 14;
    const sube = abajo < 300 && encima > abajo;
    const ancho = Math.min(Math.max(r.width, 300), vw - 16);
    setPos({
      left: Math.max(8, Math.min(r.left, vw - ancho - 8)),
      ancho,
      top: sube ? null : r.bottom + 6,
      bottom: sube ? vh - r.top + 6 : null,
      // 62 px son el buscador y su borde.
      alto: Math.max(150, Math.min(340, (sube ? encima : abajo) - 62)),
    });
    setQ("");
    const i = planas.findIndex((p) => mismo(p.valor, value));
    setActiva(Math.max(0, i));
  }

  function elegir(entrada) {
    if (!entrada) return;
    onChange?.(entrada.valor, entrada.tipo === "obra" ? entrada.obra : null);
    setPos(null);
    boton.current?.focus();
  }

  function tecla(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiva((i) => Math.min(planas.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiva((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); elegir(planas[activa]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setPos(null); boton.current?.focus(); }
  }

  const lista = abierto && (
    <div
      ref={pop}
      className="cmp-sel-pop"
      style={{ position: "fixed", zIndex: 10050, left: pos.left, width: pos.ancho, right: "auto", top: pos.top ?? "auto", bottom: pos.bottom ?? "auto" }}
      onKeyDown={tecla}
    >
      <div className="cmp-sel-buscar">
        <Search size={15} />
        <input
          autoFocus
          className="ui-input"
          value={q}
          onChange={(e) => { setQ(e.target.value); setActiva(0); }}
          placeholder="Buscar obra (52-27, hunter 175…) o destino"
          aria-label="Buscar obra o destino"
          aria-controls={idLista}
          aria-activedescendant={planas[activa] ? `${idLista}-${activa}` : undefined}
        />
      </div>
      <div className="cmp-sel-lista" role="listbox" id={idLista} ref={listaRef} style={{ maxHeight: pos.alto }}>
        {!planas.length && <div className="cmp-sel-nada">Ninguna obra coincide.</div>}
        {grupos.map((g) => (
          <div key={g.titulo} role="group" aria-label={g.titulo}>
            <div className="cmp-sel-grupo">{g.titulo}</div>
            {g.items.map((it) => {
              const i = it.idx;
              const sel = mismo(it.valor, value);
              const esObra = it.tipo === "obra";
              return (
                <button
                  key={`${it.tipo}-${it.valor}`}
                  type="button"
                  id={`${idLista}-${i}`}
                  data-idx={i}
                  role="option"
                  aria-selected={sel}
                  className={`cmp-sel-op${esObra ? "" : " otro"}${sel ? " on" : ""}${i === activa ? " activa" : ""}`}
                  onMouseEnter={() => setActiva(i)}
                  onClick={() => elegir(it)}
                >
                  <span className="cod">{esObra ? it.obra.codigo : it.otro.label}</span>
                  <span className="det">
                    {esObra
                      ? [it.obra.descripcion, it.obra.estado && it.obra.estado !== "activa" ? it.obra.estado : ""].filter(Boolean).join(" · ")
                      : it.otro.detalle || ""}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {planas.some((p) => p.tipo === "libre") && (() => {
        const libre = planas[planas.length - 1];
        return (
          <button
            type="button"
            id={`${idLista}-${libre.idx}`}
            data-idx={libre.idx}
            className={`cmp-sel-libre${libre.idx === activa ? " activa" : ""}`}
            onMouseEnter={() => setActiva(libre.idx)}
            onClick={() => elegir(libre)}
          >
            <PenLine size={14} /> No está en la lista: usar <b>«{libre.valor}»</b>
          </button>
        );
      })()}
    </div>
  );

  return (
    <div className="cmp-sel">
      <button
        ref={boton}
        id={id}
        type="button"
        className={`cmp-sel-boton${abierto ? " abierto" : ""}${value ? " con-valor" : ""}${chico ? " chico" : ""}`}
        style={invalido && !value ? { borderColor: "var(--red-border)" } : undefined}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        onClick={() => (abierto ? setPos(null) : abrir())}
      >
        {obraSel ? (
          <>
            <span className="cmp-sel-cod">{obraSel.codigo}</span>
            <span className="cmp-sel-meta">{[obraSel.descripcion, obraSel.estado !== "activa" ? obraSel.estado : ""].filter(Boolean).join(" · ") || "Obra"}</span>
          </>
        ) : otroSel ? (
          <>
            <span style={{ fontWeight: 600 }}>{otroSel.label}</span>
            <span className="cmp-sel-meta">{otroSel.detalle || ""}</span>
          </>
        ) : value ? (
          <>
            <span style={{ fontWeight: 600 }}>{value}</span>
            <span className="cmp-sel-meta"><span className="cmp-tag" data-tono="violeta">escrito a mano</span></span>
          </>
        ) : (
          <span className="vacio">{placeholder}</span>
        )}
        {!value && <ChevronDown size={16} className="cmp-sel-chev" />}
      </button>
      {value && (
        <button
          type="button"
          className="cmp-btn-ic chico"
          style={{ position: "absolute", right: 5, top: "50%", transform: "translateY(-50%)" }}
          onClick={() => onChange?.("", null)}
          aria-label="Quitar destino"
          title="Quitar"
        >
          <X size={14} />
        </button>
      )}
      {abierto && createPortal(lista, raizModulo || document.body)}
    </div>
  );
}
