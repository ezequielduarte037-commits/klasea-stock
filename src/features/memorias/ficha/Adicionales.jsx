// Adicionales del cliente. Lo que se suma acá va a la lista de la obra (la
// misma de Materiales): Compras lo ve como adicional pendiente de compra y el
// pañol lo recibe vinculado. Se puede elegir del catálogo del pañol o escribir.
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, Package, PackagePlus, Plus } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { fetchPanolCatalogMini } from "@/features/panol/panolApi";
import { topMaterialMatches } from "@/features/panol/materialMatch";
import { agregarAdicional, traerAdicionalesObra } from "../memoriasApi";
import { sinTildes } from "../acabados";
import { Estado } from "../ui";

// Lo escrito en las notas ("Jacuzzi, Sin baúl, Tenderlift") que todavía no
// está en la lista. Lo que empieza con "sin" o "no" es una aclaración, no algo
// para comprar.
function piezasSueltas(notas, lista) {
  const enLista = (lista || []).map((a) => sinTildes(a.descripcion));
  const vistas = new Set();
  return String(notas || "")
    .split(/[,;\n•·]+|\s+y\s+/i)
    .map((p) => p.trim().replace(/\.$/, ""))
    .filter((p) => p.length >= 3 && p.length <= 60 && !/^(sin|no)\b/i.test(p))
    .filter((p) => {
      const n = sinTildes(p);
      if (vistas.has(n)) return false;
      vistas.add(n);
      return !enLista.some((d) => d.includes(n) || (d.length >= 4 && n.includes(d)));
    })
    .slice(0, 8);
}

function FilaAdicional({ adicional }) {
  const detalle = [
    adicional.tipo === "opcional" ? "Opcional" : "Adicional",
    adicional.material_id ? "del catálogo" : null,
    adicional.observaciones && adicional.observaciones !== "Cargado desde la memoria descriptiva" ? adicional.observaciones : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="mem-adic-fila">
      <span className="img" style={adicional.imagen_url ? { backgroundImage: `url(${adicional.imagen_url})` } : undefined}>
        {!adicional.imagen_url && <Package size={15} />}
      </span>
      <div className="txt">
        <b>{adicional.descripcion}</b>
        <small>{detalle}</small>
      </div>
      <span className="cant">×{Number(adicional.cantidad || 1).toLocaleString("es-AR")}</span>
      <Estado tono={adicional.estado.tono}>{adicional.estado.label}</Estado>
    </div>
  );
}

export default function Adicionales({ obra, notas }) {
  const toast = useToast();
  const [lista, setLista] = useState(null);
  const [error, setError] = useState("");
  const [texto, setTexto] = useState("");
  const [cantidad, setCantidad] = useState("1");
  const [tipo, setTipo] = useState("adicional");
  const [material, setMaterial] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [verCatalogo, setVerCatalogo] = useState(false);
  const [marcado, setMarcado] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const inputRef = useRef(null);
  const trayendo = useRef(false);
  // La lista del catálogo flota en una capa propia (fija en la pantalla): dentro
  // de la sección la recortaba el borde y la tapaba la sección de abajo.
  const [pos, setPos] = useState(null);

  const ubicar = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const abajo = window.innerHeight - r.bottom;
    const sube = abajo < 300 && r.top > abajo;
    setPos({
      left: r.left,
      width: Math.max(r.width, 320),
      top: sube ? null : r.bottom + 6,
      bottom: sube ? window.innerHeight - r.top + 6 : null,
      alto: Math.max(160, (sube ? r.top : abajo) - 24),
      destino: el.closest(".mem") || document.body,
    });
  }, []);

  useEffect(() => {
    if (!verCatalogo) return undefined;
    const cerrar = () => setVerCatalogo(false);
    window.addEventListener("resize", cerrar);
    const vista = inputRef.current?.closest(".mem-vista");
    vista?.addEventListener("scroll", cerrar, { passive: true });
    return () => {
      window.removeEventListener("resize", cerrar);
      vista?.removeEventListener("scroll", cerrar);
    };
  }, [verCatalogo]);

  const cargar = useCallback(async () => {
    try {
      setLista(await traerAdicionalesObra(obra.id));
      setError("");
    } catch (e) {
      setError(e?.message || "No se pudo leer la lista de la obra.");
      setLista([]);
    }
  }, [obra.id]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  async function traerCatalogo() {
    if (catalogo || trayendo.current) return;
    trayendo.current = true;
    try {
      setCatalogo(await fetchPanolCatalogMini({ q: "", limit: 20000, includeAdditionalBarcodes: false }));
    } catch {
      setCatalogo([]);
    } finally {
      trayendo.current = false;
    }
  }

  const busqueda = useDeferredValue(texto.trim());
  const coincidencias = useMemo(() => {
    if (!catalogo?.length || busqueda.length < 3 || material) return [];
    return topMaterialMatches(catalogo, { descripcion: busqueda }, 6, 55);
  }, [catalogo, busqueda, material]);
  const sueltos = useMemo(() => (lista ? piezasSueltas(notas, lista) : []), [notas, lista]);
  const [verTodos, setVerTodos] = useState(false);
  const resumen = useMemo(() => {
    const porEstado = new Map();
    for (const a of lista || []) {
      const actual = porEstado.get(a.estado.label) || { ...a.estado, n: 0 };
      actual.n += 1;
      porEstado.set(a.estado.label, actual);
    }
    return [...porEstado.values()];
  }, [lista]);
  const VISIBLES = 8;

  function escribir(valor) {
    setTexto(valor);
    setMaterial(null);
    setMarcado(0);
    ubicar();
    setVerCatalogo(true);
    if (valor.trim().length >= 3) void traerCatalogo();
  }

  function elegir(m) {
    setMaterial(m);
    setTexto(m.descripcion || "");
    setVerCatalogo(false);
  }

  function desdeNotas(pieza) {
    escribir(pieza);
    inputRef.current?.focus();
  }

  async function agregar() {
    if (!texto.trim() || guardando) return;
    setGuardando(true);
    try {
      await agregarAdicional(obra, { material, descripcion: texto, cantidad, tipo });
      toast.success(`“${(material?.descripcion || texto).trim()}” quedó en la lista de ${obra.codigo}. Compras lo ve pendiente de compra.`);
      setTexto("");
      setCantidad("1");
      setMaterial(null);
      await cargar();
    } catch (e) {
      toast.error(e?.message || "No se pudo sumar a la lista de la obra.");
    } finally {
      setGuardando(false);
    }
  }

  function tecla(e) {
    if (verCatalogo && coincidencias.length) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMarcado((i) => (i + 1) % coincidencias.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMarcado((i) => (i - 1 + coincidencias.length) % coincidencias.length); return; }
      if (e.key === "Enter" && coincidencias[marcado]) { e.preventDefault(); elegir(coincidencias[marcado]); return; }
      if (e.key === "Escape") { setVerCatalogo(false); return; }
    }
    if (e.key === "Enter") { e.preventDefault(); void agregar(); }
  }

  return (
    <div className="mem-adic">
      {lista === null ? (
        <Cargando compacto texto="Trayendo la lista de la obra…" />
      ) : error ? (
        <div className="mem-aviso" data-tono="rojo"><span className="txt">{error}</span></div>
      ) : lista.length ? (
        <>
          <div className="mem-sueltos">
            <span>{lista.length} en la lista de la obra:</span>
            {resumen.map((e) => <Estado key={e.label} tono={e.tono}>{e.label} · {e.n}</Estado>)}
          </div>
          <div className="mem-adic-lista">
            {(verTodos ? lista : lista.slice(0, VISIBLES)).map((a) => <FilaAdicional key={a.id} adicional={a} />)}
          </div>
          {lista.length > VISIBLES && (
            <button type="button" className="mem-link" style={{ justifySelf: "start" }} onClick={() => setVerTodos((v) => !v)}>
              {verTodos ? "Ver menos" : `Ver los ${lista.length}`}
            </button>
          )}
        </>
      ) : (
        <div className="mem-sub">Todavía no hay adicionales en la lista de {obra.codigo}.</div>
      )}

      <div className="mem-adic-alta">
        <div className="mem-adic-buscar">
          <input
            ref={inputRef}
            className="ui-input"
            value={texto}
            onChange={(e) => escribir(e.target.value)}
            onFocus={() => { ubicar(); setVerCatalogo(true); void traerCatalogo(); }}
            onBlur={() => setVerCatalogo(false)}
            onKeyDown={tecla}
            placeholder="Nuevo adicional: buscalo en el catálogo o escribilo"
            aria-label="Nuevo adicional"
            autoComplete="off"
          />
          {verCatalogo && pos && coincidencias.length > 0 && createPortal(
            <div
              className="mem-cat"
              role="listbox"
              style={{ position: "fixed", left: pos.left, width: pos.width, right: "auto", top: pos.top ?? "auto", bottom: pos.bottom ?? "auto", maxHeight: pos.alto, overflowY: "auto", zIndex: 60 }}
            >
              <div className="mem-cat-tit">En el catálogo del pañol</div>
              {coincidencias.map((m, i) => (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={i === marcado}
                  className={`mem-cat-op${i === marcado ? " on" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => elegir(m)}
                >
                  <span className="img" style={m.imagen_url ? { backgroundImage: `url(${m.imagen_url})` } : undefined} />
                  <span style={{ minWidth: 0 }}>
                    <b>{m.descripcion}</b>
                    <small>{[m.codigo, m.proveedor, m.unidad_medida].filter(Boolean).join(" · ") || "Sin código"}</small>
                  </span>
                </button>
              ))}
            </div>,
            pos.destino,
          )}
        </div>
        <input
          className="ui-input mono"
          type="number"
          min="1"
          step="1"
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          aria-label="Cantidad"
          title="Cantidad"
        />
        <div className="mem-seg seg-tipo" role="radiogroup" aria-label="Tipo">
          <button type="button" role="radio" aria-checked={tipo === "adicional"} className={tipo === "adicional" ? "on" : ""} data-tono="violeta" onClick={() => setTipo("adicional")}>Adicional</button>
          <button type="button" role="radio" aria-checked={tipo === "opcional"} className={tipo === "opcional" ? "on" : ""} data-tono="azul" onClick={() => setTipo("opcional")}>Opcional</button>
        </div>
        <button type="button" className="ui-btn ui-btn-primario chico" disabled={!texto.trim() || guardando} onClick={() => void agregar()}>
          <PackagePlus size={15} /> {guardando ? "Sumando…" : "Agregar a la obra"}
        </button>
        {material && (
          <div className="mem-adic-vinculo">
            <Link2 size={14} /> Del catálogo del pañol: el ingreso al pañol va a salir vinculado.
            <button type="button" className="mem-link" onClick={() => setMaterial(null)}>Desvincular</button>
          </div>
        )}
      </div>

      {sueltos.length > 0 && (
        <div className="mem-sueltos">
          <span>Escrito en las notas y todavía no está en la lista:</span>
          {sueltos.map((p) => (
            <button key={p} type="button" className="mem-sug-op" onClick={() => desdeNotas(p)} title="Pasarlo al campo para agregarlo a la obra">
              <Plus size={12} /> {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
