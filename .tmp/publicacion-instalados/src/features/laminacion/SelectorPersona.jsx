import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BadgeCheck, PenLine } from "lucide-react";
import { empleadoPorNombre, normNombre } from "./empleadosRrhh";

// "Quién retira": se escribe como siempre, pero mientras se escribe aparecen
// los empleados de RRHH (primero los de la sede de la pantalla) y los nombres
// ya usados. Elegir uno evita errores de tipeo; si la persona no está, queda lo
// escrito tal cual.
//
//   <SelectorPersona value={nombre} onChange={(texto, empleado) => …}
//     empleados={useEmpleadosRrhh()} recientes={["Juan"]} sede="Chubut" />
//
// Va adentro de una raíz .lam (usa sus estilos de lista).

const MAX_POR_GRUPO = 40;

function coincide(nombre, palabras) {
  const n = normNombre(nombre);
  const suyas = n.split(" ");
  // Cada palabra escrita tiene que ser el comienzo de alguna del nombre:
  // "gim jos" encuentra a "Gimaraez Jose Luis".
  return palabras.every((p) => suyas.some((s) => s.startsWith(p)) || n.includes(p));
}

export default function SelectorPersona({
  value = "",
  onChange,
  empleados = [],
  recientes = [],
  sede = null,
  placeholder = "Nombre o DNI…",
  id,
  ariaLabel = "Persona que retira",
}) {
  const idLista = useId();
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(-1);
  const [pos, setPos] = useState(null);
  const raiz = useRef(null);
  const input = useRef(null);
  const popRef = useRef(null);
  const listaRef = useRef(null);

  const elegido = useMemo(() => empleadoPorNombre(empleados, value), [empleados, value]);

  const { grupos, planas } = useMemo(() => {
    const texto = normNombre(value);
    const palabras = texto ? texto.split(" ") : [];
    const digitos = String(value).replace(/\D/g, "");
    const porDni = digitos.length >= 3;
    const sirve = (e) => (porDni ? String(e.dni || "").includes(digitos) : coincide(e.nombre, palabras));
    // Si ya está elegido tal cual, se muestra la lista completa para cambiarlo.
    const filtrar = elegido ? () => true : sirve;
    const empiezaPrimero = (a, b) => {
      if (!texto) return 0;
      const pa = normNombre(a.nombre).startsWith(texto) ? 0 : 1;
      const pb = normNombre(b.nombre).startsWith(texto) ? 0 : 1;
      return pa - pb;
    };
    const candidatos = empleados.filter(filtrar).sort(empiezaPrimero);
    const deSede = sede ? candidatos.filter((e) => e.sede === sede) : candidatos;
    const otras = sede ? candidatos.filter((e) => e.sede !== sede) : [];
    // Los nombres escritos antes que son alguien de RRHH con otro orden o
    // incompletos ("DANIEL INDABURU" = "Indaburu Daniel Norberto") no se
    // ofrecen: así se elige el de RRHH y no se repite el error.
    const palabrasRrhh = empleados.map((e) => new Set(normNombre(e.nombre).split(" ")));
    const esDeRrhh = (r) => {
      const suyas = normNombre(r).split(" ").filter(Boolean);
      if (!suyas.length) return false;
      if (suyas.length === 1) return palabrasRrhh.some((s) => s.size === 1 && s.has(suyas[0]));
      return palabrasRrhh.some((s) => suyas.every((w) => s.has(w)));
    };
    const usados = recientes
      .filter((r) => !esDeRrhh(r) && (elegido || !palabras.length || coincide(r, palabras)))
      .slice(0, 8);

    const lista = [];
    // Los de la sede de la pantalla van todos (se buscan recorriendo la lista);
    // los de otras sedes, recortados hasta que se escriba algo.
    if (deSede.length) lista.push({ titulo: sede ? `RRHH · ${sede}` : "RRHH", items: deSede.map((e) => ({ tipo: "empleado", e })) });
    if (otras.length) lista.push({ titulo: "RRHH · otras sedes", items: otras.slice(0, MAX_POR_GRUPO).map((e) => ({ tipo: "empleado", e })) });
    if (usados.length) lista.push({ titulo: "Usados antes (no están en RRHH)", items: usados.map((r) => ({ tipo: "texto", texto: r })) });
    let n = 0;
    const conIndice = lista.map((g) => ({ ...g, items: g.items.map((it) => ({ ...it, idx: n++ })) }));
    return { grupos: conIndice, planas: conIndice.flatMap((g) => g.items) };
  }, [empleados, recientes, sede, value, elegido]);

  // Dónde se dibuja la lista: fija en la pantalla, debajo del campo (o arriba
  // si no hay lugar). Con el teclado del celular la pantalla cambia de alto:
  // se reubica en vez de cerrarse.
  const ubicar = useCallback(() => {
    const r = input.current?.getBoundingClientRect();
    if (!r) return;
    const barra = document.querySelector(".lam-nav")?.getBoundingClientRect();
    const piso = barra && barra.top > window.innerHeight / 2 ? barra.top : window.innerHeight;
    const techo = document.querySelector(".ka-shell-content")?.getBoundingClientRect().top ?? 0;
    const abajo = piso - r.bottom - 10;
    const encima = r.top - techo - 10;
    const sube = abajo < 200 && encima > abajo;
    const ancho = Math.min(Math.max(r.width, 300), window.innerWidth - 16);
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
      ancho,
      top: sube ? null : r.bottom + 6,
      bottom: sube ? window.innerHeight - r.top + 6 : null,
      alto: Math.max(140, Math.min(320, sube ? encima : abajo)),
      destino: raiz.current?.closest(".lam") || document.body,
    });
  }, []);

  function abrir() {
    ubicar();
    setAbierto(true);
  }

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => {
      if (raiz.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setAbierto(false);
    };
    const alMover = (e) => { if (!popRef.current?.contains(e.target)) ubicar(); };
    document.addEventListener("pointerdown", fuera);
    window.addEventListener("scroll", alMover, true);
    window.addEventListener("resize", ubicar);
    return () => {
      document.removeEventListener("pointerdown", fuera);
      window.removeEventListener("scroll", alMover, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto || activa < 0) return;
    listaRef.current?.querySelector(`[data-idx="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa, abierto]);

  function elegir(op) {
    if (!op) return;
    if (op.tipo === "empleado") onChange?.(op.e.nombre.trim(), op.e);
    else onChange?.(op.texto, null);
    setAbierto(false);
    setActiva(-1);
  }

  function tecla(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!abierto) abrir();
      setActiva((i) => Math.min(planas.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiva((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      // Con una opción marcada se elige; si no, queda lo escrito. El Enter acá
      // nunca manda el formulario: quien lo aprieta está confirmando el nombre.
      e.preventDefault();
      if (abierto && activa >= 0) elegir(planas[activa]);
      else setAbierto(false);
    } else if (e.key === "Escape" || e.key === "Tab") {
      setAbierto(false);
    }
  }

  const escritoAMano = Boolean(String(value).trim()) && !elegido && empleados.length > 0;

  return (
    <div className="lam-persona" ref={raiz}>
      <input
        ref={input}
        id={id}
        className="ui-input"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-controls={abierto ? idLista : undefined}
        aria-activedescendant={abierto && activa >= 0 ? `${idLista}-${activa}` : undefined}
        onFocus={abrir}
        onClick={() => { if (!abierto) abrir(); }}
        onChange={(e) => {
          onChange?.(e.target.value, empleadoPorNombre(empleados, e.target.value));
          setActiva(-1);
          if (!abierto) abrir();
        }}
        onKeyDown={tecla}
      />
      {elegido && (
        <span className="lam-persona-marca" data-tono="verde" title={`${elegido.nombre} · RRHH${elegido.sede ? ` · ${elegido.sede}` : ""}`}>
          <BadgeCheck size={13} /> RRHH
        </span>
      )}
      {escritoAMano && (
        <span className="lam-persona-marca" data-tono="violeta" title="No coincide con nadie de RRHH: queda escrito tal cual.">
          <PenLine size={12} /> a mano
        </span>
      )}

      {abierto && pos && planas.length > 0 && createPortal(
        <div
          ref={popRef}
          className="lam-sel-pop"
          style={{ position: "fixed", zIndex: 160, left: pos.left, width: pos.ancho, right: "auto", top: pos.top ?? "auto", bottom: pos.bottom ?? "auto" }}
          // Que tocar la lista no le saque el foco al campo.
          onPointerDown={(e) => e.preventDefault()}
        >
          <div className="lam-sel-lista" role="listbox" id={idLista} ref={listaRef} style={{ maxHeight: pos.alto }}>
            {grupos.map((g) => (
              <div key={g.titulo} role="group" aria-label={g.titulo}>
                <div className="lam-sel-grupo">{g.titulo}</div>
                {g.items.map((op) => {
                  const i = op.idx;
                  const sel = op.tipo === "empleado" ? op.e.id === elegido?.id : normNombre(op.texto) === normNombre(value);
                  return (
                    <button
                      key={op.tipo === "empleado" ? op.e.id : `t-${op.texto}`}
                      type="button"
                      id={`${idLista}-${i}`}
                      data-idx={i}
                      role="option"
                      aria-selected={sel}
                      className={`lam-sel-op otro${sel ? " on" : ""}${i === activa ? " activa" : ""}`}
                      onMouseEnter={() => setActiva(i)}
                      onClick={() => elegir(op)}
                    >
                      <span className="cod">{op.tipo === "empleado" ? op.e.nombre : op.texto}</span>
                      <span className="det">{op.tipo === "empleado" ? (op.e.oficio?.nombre || "") : "escrito antes a mano"}</span>
                      <span className="fec">{op.tipo === "empleado" && op.e.sede ? op.e.sede : ""}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          {String(value).trim() && !elegido && (
            <div className="lam-sel-libre" style={{ cursor: "default" }}>
              <PenLine size={14} /> Si no está en la lista, queda <b>«{String(value).trim()}»</b> tal cual.
            </div>
          )}
        </div>,
        pos.destino,
      )}
    </div>
  );
}
