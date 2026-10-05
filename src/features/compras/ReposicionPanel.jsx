import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Copy, LoaderCircle, Package, RotateCcw, Truck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import Cargando from "@/components/ui/Cargando";
import { calcularReposicion } from "@/features/compras/reposicionApi";
import { Aviso, Buscar, Cabecera, Vacio } from "./ui";

/**
 * Qué hay que comprar, agrupado por proveedor.
 *
 * El stock del pañol esta pensado para el pañolero: buscar un item, ver donde
 * esta, sacarlo. Compras necesita otra cosa: que le tengo que pedir a Trimer
 * esta semana. Son siete cosas distintas y hoy hay que buscarlas de a una.
 *
 * Nada de esto se carga a mano. El punto de pedido sale del consumo real del
 * pañol por el plazo de entrega medido sobre los pedidos ya recibidos.
 */

function semanasTexto(semanas) {
  if (!Number.isFinite(semanas)) return "—";
  if (semanas < 1) return "menos de 1 semana";
  if (semanas < 2) return "1 semana";
  return `${Math.round(semanas)} semanas`;
}

/** Rojo cuando ya no llega, cian cuando está al límite. */
function tonoDeUrgencia(item) {
  if (!item.urge) return "neutro";
  return item.semanasRestantes < item.plazoDias / 7 ? "rojo" : "cian";
}

export default function ReposicionPanel() {
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloUrgentes, setSoloUrgentes] = useState(true);
  const [abiertos, setAbiertos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    try {
      const r = await calcularReposicion();
      setDatos(r);
      setError("");
      // Los proveedores con algo urgente arrancan abiertos: es lo que se vino a ver.
      setAbiertos(new Set(r.porProveedor.filter((g) => g.urgentes > 0).map((g) => g.proveedor)));
    } catch (e) {
      setError(e.message || "No se pudo calcular la reposición.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => { void cargar(); }, 0);
    return () => window.clearTimeout(t);
  }, [cargar]);

  function recalcular() {
    setCargando(true);
    void cargar();
  }

  const grupos = useMemo(() => {
    if (!datos) return [];
    const q = busqueda.trim().toLowerCase();
    return datos.porProveedor
      .map((g) => ({
        ...g,
        items: g.items.filter((i) => {
          if (soloUrgentes && !i.urge) return false;
          if (!q) return true;
          return [i.descripcion, i.codigo, g.proveedor].some((c) => String(c || "").toLowerCase().includes(q));
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [datos, busqueda, soloUrgentes]);

  function alternar(proveedor) {
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(proveedor)) s.delete(proveedor); else s.add(proveedor);
      return s;
    });
  }

  function copiarPedido(grupo) {
    const lineas = grupo.items
      .filter((i) => i.urge)
      .map((i) => `${i.sugerido} ${i.unidad}  ${i.descripcion}${i.codigo ? ` (${i.codigo})` : ""}`);
    if (!lineas.length) return;
    const texto = `Pedido a ${grupo.proveedor || "definir proveedor"}\n\n${lineas.join("\n")}`;
    navigator.clipboard?.writeText(texto)
      .then(() => toast.success(`${lineas.length} renglones copiados. Pegalos donde los necesites.`))
      .catch(() => toast.error("No se pudo copiar."));
  }

  const r = datos?.resumen;

  return (
    <>
      <Cabecera
        eyebrow="Compras · Reposición"
        titulo="Qué"
        acento="comprar"
        sub={r ? (
          <>
            <b className="mono t" data-tono="rojo">{r.urgentes}</b> para pedir ahora · <b className="mono">{r.analizados}</b> materiales con consumo seguido
            {" "}· plazo general {r.plazoGeneral} días, medido sobre {r.pedidosMedidos} pedidos recibidos y {r.mesesDeHistoria} meses de consumo
          </>
        ) : "Sale del consumo real del pañol y del plazo de cada proveedor. No hay nada que cargar."}
        acciones={(
          <button type="button" className="cmp-btn-ic" onClick={recalcular} disabled={cargando} title="Volver a calcular" aria-label="Volver a calcular">
            {cargando ? <LoaderCircle size={15} className="spin" /> : <RotateCcw size={15} />}
          </button>
        )}
      />

      <div className="cmp-filtros">
        <Buscar value={busqueda} onChange={setBusqueda} placeholder="Material, código o proveedor…" />
        <div className="cmp-seg" role="radiogroup" aria-label="Qué mostrar">
          <button type="button" role="radio" aria-checked={soloUrgentes} className={soloUrgentes ? "on" : ""} onClick={() => setSoloUrgentes(true)}>Lo que falta</button>
          <button type="button" role="radio" aria-checked={!soloUrgentes} className={!soloUrgentes ? "on" : ""} onClick={() => setSoloUrgentes(false)}>Todo lo que se sigue</button>
        </div>
      </div>

      {r?.sinProveedor > 0 && (
        <Aviso tono="rojo" icono={AlertCircle}>
          <b>{r.sinProveedor} de los que hay que pedir no tienen proveedor cargado.</b>{" "}
          Están abajo de todo: hasta que se les asigne uno, no hay a quién pedírselos sin buscar en remitos viejos.
        </Aviso>
      )}
      {error && <Aviso tono="rojo">{error}</Aviso>}

      {cargando && !datos ? (
        <Cargando texto="Calculando con el consumo de los últimos meses…" />
      ) : !grupos.length ? (
        <Vacio
          icono={Package}
          titulo={soloUrgentes ? "No hay nada por debajo del punto de pedido" : "Ningún material coincide"}
          texto={soloUrgentes ? "Tocá «Todo lo que se sigue» para ver el resto." : "Probá con otro término."}
        />
      ) : (
        <div className="cmp-grupos" style={{ gap: 10 }}>
          {grupos.map((grupo, gi) => {
            const abierto = abiertos.has(grupo.proveedor);
            const sinProveedor = !grupo.proveedor;
            return (
              <section key={grupo.proveedor || "__sin__"} className="cmp-bloque" style={{ "--i": Math.min(gi, 10), borderColor: sinProveedor ? "var(--red-border)" : undefined }}>
                <div className="cmp-bloque-cab">
                  <button type="button" className="cmp-repo-plegar" onClick={() => alternar(grupo.proveedor)} aria-expanded={abierto}>
                    <ChevronRight size={16} className="chev" />
                    <span className="cmp-bloque-ic" data-tono={sinProveedor ? "rojo" : "azul"}><Truck size={16} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="cmp-bloque-tit" style={{ display: "block" }}>{grupo.proveedor || "Sin proveedor asignado"}</span>
                      <span className="cmp-bloque-txt" style={{ display: "block" }}>
                        {grupo.urgentes > 0 ? `${grupo.urgentes} para pedir` : "al día"} · entrega en {grupo.plazoDias} días{grupo.plazoEsPropio ? " (medido con sus pedidos)" : ""}
                      </span>
                    </span>
                  </button>
                  {grupo.urgentes > 0 && !sinProveedor && (
                    <div className="der">
                      <button type="button" className="ui-btn ui-btn-suave chico" onClick={() => copiarPedido(grupo)}><Copy size={13} /> Copiar pedido</button>
                    </div>
                  )}
                </div>
                {abierto && (
                  <div className="cmp-bloque-cuerpo sin-pad">
                    {grupo.items.map((item) => {
                      const tono = tonoDeUrgencia(item);
                      return (
                        <div key={item.id} className="cmp-repo-fila">
                          <div style={{ minWidth: 0 }}>
                            <div className="nom">{item.descripcion}</div>
                            <div className="meta">
                              {item.codigo && <span className="mono">{item.codigo}</span>}
                              <span>{item.porMes} {item.unidad}/mes · {item.salidas} salidas{item.esConsumible ? " · consumible" : ""}</span>
                            </div>
                          </div>
                          <div className="cifra" data-tono={tono}>
                            <b>{semanasTexto(item.semanasRestantes)}</b>
                            <small>de stock</small>
                          </div>
                          <div className="cifra">
                            <b className="mono">{item.hay} / {item.puntoDePedido}</b>
                            <small>hay / punto de pedido</small>
                          </div>
                          <div className="accion">
                            {item.urge
                              ? <span className="cmp-estado" data-tono={tono}>pedir <b className="mono">{item.sugerido}</b> {item.unidad}</span>
                              : <span className="cmp-ayuda">alcanza</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
