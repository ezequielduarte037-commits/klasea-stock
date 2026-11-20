import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownToLine, ArrowLeft, Check, ExternalLink, LoaderCircle, Minus, PackageCheck, PackagePlus, Plus, RotateCcw,
  MessageSquareWarning, Search, ShoppingBasket, TriangleAlert, Warehouse, X,
} from "lucide-react";
import { DrawnCheck } from "@/components/ui/motion";
import { FotoItem } from "@/features/consumibles/mostrador/Piezas";
import CampoTexto from "@/features/consumibles/mostrador/CampoTexto";
import { fmtNum, normalizarTexto } from "@/features/consumibles/mostrador/mostradorLogica";
import { Hoja } from "@/features/panol/mostrador/CapasPanol";
import {
  NOVEDADES, agruparUltimos, cantidadDe, carritoAgrupado, comparaConPedido, destinoDelRenglon, opcionesDeNovedad, totalUnidades,
} from "./ingresosLogica";

// "faltan 2" se entiende solo; "faltan 2 unidad" no. Los metros y kilos sí.
const unidadVisible = (u) => (["", "u", "un", "unidad", "unidades"].includes(String(u || "").trim().toLowerCase()) ? "" : ` ${u}`);

const PRIORIDAD_TEXTO = { urgente: "Urgente", alta: "Alta" };

const hora = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opciones = { timeZone: "America/Argentina/Buenos_Aires" };
  const hoy = new Date().toLocaleDateString("es-AR", opciones) === d.toLocaleDateString("es-AR", opciones);
  return hoy
    ? d.toLocaleTimeString("es-AR", { ...opciones, hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("es-AR", { ...opciones, day: "2-digit", month: "2-digit" });
};

function faltaTexto(r) {
  if (r.falta == null) return "sin cantidad";
  if (r.llego > 0) return `llegaron ${fmtNum(r.llego)} de ${fmtNum(r.pedido)}`;
  return `${fmtNum(r.pedido)}${unidadVisible(r.unidad)} en el pedido`;
}

// ── Lo que se toca: pedidos, renglones y resultados ─────────────────────────

export function BotoneraIngreso({
  pedidos = [],
  pedidoId,
  onPedido,
  buscando = false,
  texto = "",
  renglones = [],
  catalogo = [],
  catalogoListo = false,
  resaltado = 0,
  onResaltar,
  enCarrito,
  sede,
  onRenglon,
  onTodoElPedido,
  onMaterial,
  onSinFicha,
  onNovedad,
}) {
  const pedido = pedidos.find((p) => p.id === pedidoId) || null;

  if (buscando) {
    return (
      <>
        {pedidos.length ? <RielPedidos pedidos={pedidos} pedidoId={pedidoId} onPedido={onPedido} /> : null}
        <section aria-label="Lo que se espera">
          <div className="mst-titulo-seccion">
            <PackageCheck size={12} aria-hidden="true" />
            {renglones.length ? <>En pedidos <span className="mst-num">{renglones.length}</span></> : "En pedidos"}
            {pedido ? <span style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500 }}>· {pedido.titulo}</span> : null}
          </div>
          {renglones.length ? (
            <div className="mst-resultados" role="listbox" aria-label="Renglones por llegar">
              {renglones.map((r, idx) => (
                <FilaRenglon key={r.id} r={r} sede={sede} conPedido activa={idx === resaltado} enCarrito={enCarrito.get(`r:${r.id}`)} onResaltar={() => onResaltar?.(idx)} onTocar={onRenglon} onNovedad={onNovedad} />
              ))}
            </div>
          ) : <div className="mst-vacio">Ningún pedido en camino espera «{texto.trim()}».</div>}
        </section>
        <section aria-label="Sin pedido">
          <div className="mst-titulo-seccion">
            <Search size={12} aria-hidden="true" />
            {catalogo.length ? <>Sin pedido · catálogo <span className="mst-num">{catalogo.length}</span></> : "Sin pedido · catálogo"}
          </div>
          {!catalogoListo ? (
            <div className="mst-vacio" style={{ display: "flex", gap: 8, justifyContent: "center", alignItems: "center" }}>
              <LoaderCircle size={14} className="mst-gira" /> Trayendo el catálogo…
            </div>
          ) : catalogo.length ? (
            <div className="mst-resultados" role="listbox" aria-label="Productos del catálogo">
              {catalogo.map((m, n) => {
                const idx = renglones.length + n;
                return <FilaMaterial key={m.id} m={m} activa={idx === resaltado} onResaltar={() => onResaltar?.(idx)} onTocar={onMaterial} />;
              })}
            </div>
          ) : null}
          <button type="button" className="ui-btn mpn-buscar-todo" style={{ marginTop: 8 }} onClick={() => onSinFicha(texto.trim())}>
            <PackagePlus size={15} aria-hidden="true" /> No está: entra sin ficha
          </button>
        </section>
      </>
    );
  }

  if (pedido) {
    const yaTodo = pedido.renglones.every((r) => (enCarrito.get(`r:${r.id}`) ?? 0) >= (r.falta ?? 1));
    return (
      <>
        <RielPedidos pedidos={pedidos} pedidoId={pedidoId} onPedido={onPedido} />
        <section aria-label={`Renglones de ${pedido.titulo}`}>
          <div className="ing-pedido-cab">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h3>{pedido.titulo}</h3>
              <span>
                {pedido.renglones.length === 1 ? "1 renglón por llegar" : `${pedido.renglones.length} renglones por llegar`}
                {pedido.totalRenglones > pedido.renglones.length ? ` · ${pedido.totalRenglones - pedido.renglones.length} ya recibidos` : ""}
                {pedido.origen === "compra" ? " · de Compras" : ""}
              </span>
            </div>
            <Link to={`/recepcion-panol?tab=recepcion&envio=${encodeURIComponent(pedido.id)}`} className="ui-btn ui-btn-fantasma" title="Ver el pedido completo: historial, mensajes y novedades">
              <ExternalLink size={14} aria-hidden="true" /> <span className="mpn-largo">Ver pedido</span>
            </Link>
            <button type="button" className="ui-btn ui-btn-primario" disabled={yaTodo} onClick={() => onTodoElPedido(pedido)}>
              <ArrowDownToLine size={15} aria-hidden="true" /> Llegó todo
            </button>
          </div>
          <div className="mst-resultados" role="list">
            {pedido.renglones.map((r) => (
              <FilaRenglon key={r.id} r={r} sede={sede} enCarrito={enCarrito.get(`r:${r.id}`)} onTocar={onRenglon} onNovedad={onNovedad} />
            ))}
          </div>
        </section>
      </>
    );
  }

  return (
    <section aria-label="Pedidos en camino">
      <div className="mst-titulo-seccion">Elegí el pedido que llegó o pasá el código</div>
      {pedidos.length ? (
        <div className="mst-obras ing-pedidos">
          {pedidos.map((p) => {
            const urgente = PRIORIDAD_TEXTO[p.prioridad];
            return (
              <button key={p.id} type="button" className={`mst-obra ing-pedido${p.prioridad === "urgente" ? " is-urgente" : ""}`} onClick={() => onPedido(p.id)} title={p.titulo}>
                <strong>{p.titulo}</strong>
                <span>
                  <span className="mst-num">{p.renglones.length}</span> por llegar
                  {p.obraCodigo && !p.titulo.includes(p.obraCodigo) ? ` · ${p.obraCodigo}` : ""}
                  {urgente ? <em> · {urgente}</em> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mst-vacio">No hay pedidos en camino para {sede}.</div>
      )}
      <p className="ing-ayuda">
        <PackagePlus size={14} aria-hidden="true" />
        Lo que llega sin pedido se pasa por el lector o se busca por nombre: entra a stock con el número de remito.
      </p>
    </section>
  );
}

function RielPedidos({ pedidos, pedidoId, onPedido }) {
  const rielRef = useRef(null);
  // El pedido elegido puede estar al final de la tira: se trae a la vista.
  useEffect(() => {
    rielRef.current?.querySelector(".is-elegido")?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, [pedidoId]);
  return (
    <section aria-label="Pedidos">
      <div ref={rielRef} className="mpn-riel" role="group" aria-label="Filtrar por pedido">
        <button type="button" className={`mpn-origen is-libre${!pedidoId ? " is-elegido" : ""}`} aria-pressed={!pedidoId} onClick={() => onPedido(null)}>
          Todos
        </button>
        {pedidos.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`mpn-origen is-libre${pedidoId === p.id ? " is-elegido" : ""}`}
            aria-pressed={pedidoId === p.id}
            onClick={() => onPedido(pedidoId === p.id ? null : p.id)}
            title={p.titulo}
          >
            <strong className="ing-riel-titulo">{p.titulo}</strong>
            <span className="mst-num">{p.renglones.length}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function FilaRenglon({ r, sede, conPedido = false, activa = false, enCarrito = 0, onResaltar, onTocar, onNovedad }) {
  const novedad = r.estado !== "pendiente" && r.estado !== "parcial" ? NOVEDADES[r.estado] : null;
  const sub = [destinoDelRenglon(r, sede), r.codigo, conPedido ? r.envioTitulo : null].filter(Boolean).join(" · ");
  const completo = r.falta != null && enCarrito >= r.falta - 0.0001;
  return (
    <div className={`mst-res mpn-prod${activa ? " is-activa" : ""}`} role="option" aria-selected={activa} onMouseEnter={onResaltar}>
      <button type="button" className="mpn-prod-main" onClick={() => onTocar(r)}>
        <span className="mst-res-foto"><FotoItem item={{ descripcion: r.descripcion, imagenUrl: r.material?.imagen_url }} /></span>
        <span className="mst-res-texto">
          <span className="mst-res-nombre" style={{ display: "block" }}>{r.descripcion}</span>
          <span className="mst-res-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {r.material?.ubicacion ? <span className="mpn-ubic" title={r.material.ubicacion_obs || "Estantería"}>{r.material.ubicacion}</span> : null}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
          </span>
        </span>
        {activa ? <span className="mst-res-enter" aria-hidden="true">Enter</span> : null}
      </button>
      <span className="mpn-prod-fin">
        {novedad ? <span className={`ing-estado is-${r.estado}`}>{novedad.corto}</span> : null}
        <span className="ing-falta">{faltaTexto(r)}</span>
        {onNovedad ? (
          <button type="button" className="ing-novedad-btn" onClick={() => onNovedad(r)} aria-label={`Novedad de ${r.descripcion}`} title="No vino, vino mal o falta información">
            <MessageSquareWarning size={15} />
          </button>
        ) : null}
        <button
          type="button"
          className={`mpn-saldo${enCarrito ? " is-en-carrito" : ""}${completo ? " is-completo" : ""}`}
          onClick={() => onTocar(r)}
          aria-label={`Entra ${r.descripcion}: faltan ${r.falta == null ? "sin cantidad" : fmtNum(r.falta)}`}
        >
          {completo ? <Check size={13} aria-hidden="true" /> : <Plus size={13} aria-hidden="true" />}
          <span className="mst-num">{r.falta == null ? "—" : fmtNum(r.falta)}</span>
          {enCarrito && !completo ? <span className="mst-num" style={{ color: "var(--blue)" }}>×{fmtNum(enCarrito)}</span> : null}
        </button>
      </span>
    </div>
  );
}

function FilaMaterial({ m, activa = false, onResaltar, onTocar }) {
  const sub = [m.codigo, m.proveedor].filter(Boolean).join(" · ") || m.unidad;
  return (
    <div className={`mst-res mpn-prod${activa ? " is-activa" : ""}`} role="option" aria-selected={activa} onMouseEnter={onResaltar}>
      <button type="button" className="mpn-prod-main" onClick={() => onTocar(m)}>
        <span className="mst-res-foto"><FotoItem item={{ descripcion: m.descripcion, imagenUrl: m.imagen_url }} /></span>
        <span className="mst-res-texto">
          <span className="mst-res-nombre" style={{ display: "block" }}>{m.descripcion}</span>
          <span className="mst-res-sub" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {m.ubicacion ? <span className="mpn-ubic">{m.ubicacion}</span> : null}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
          </span>
        </span>
        {activa ? <span className="mst-res-enter" aria-hidden="true">Enter</span> : null}
      </button>
      <span className="mpn-prod-fin">
        <button type="button" className="mpn-saldo" onClick={() => onTocar(m)} aria-label={`Entra uno de ${m.descripcion}`}>
          <Plus size={13} aria-hidden="true" /> <span>Entra</span>
        </button>
      </span>
    </div>
  );
}

// ── El carrito ("Entra") ────────────────────────────────────────────────────

export function CarritoIngreso({ cart = [], obras = [], sede, problemas = [], onSumar, onTeclado, onQuitar, onObra, onVariante, onVaciar, onConfirmar }) {
  const [confirmandoVaciar, setConfirmandoVaciar] = useState(false);
  const grupos = carritoAgrupado(cart);
  const obraPorId = useMemo(() => new Map(obras.map((o) => [o.id, o.codigo])), [obras]);

  function vaciar() {
    if (!confirmandoVaciar) {
      setConfirmandoVaciar(true);
      window.setTimeout(() => setConfirmandoVaciar(false), 3000);
      return;
    }
    setConfirmandoVaciar(false);
    onVaciar();
  }

  return (
    <>
      <div className="mst-car-cab">
        <ShoppingBasket size={17} aria-hidden="true" style={{ color: "var(--green)" }} />
        <span className="mst-car-titulo">Entra</span>
        <span className="mst-car-total mst-num ing-total">{cart.length ? fmtNum(totalUnidades(cart)) : ""}</span>
        {cart.length ? (
          <span style={{ marginLeft: "auto" }}>
            <button type="button" className={`ui-btn ${confirmandoVaciar ? "ui-btn-peligro" : "ui-btn-fantasma"}`} style={{ minHeight: 34 }} onClick={vaciar}>
              {confirmandoVaciar ? "Sí, vaciar" : "Vaciar"}
            </button>
          </span>
        ) : null}
      </div>

      <div className="mst-car-lista">
        {!cart.length ? (
          <div className="mst-car-vacio">
            <strong>Todavía no entró nada</strong>
            Elegí el pedido que llegó y tocá lo que vino, o pasá los productos por el lector. Al final, el número de remito.
          </div>
        ) : grupos.map((g) => (
          <div key={g.key}>
            <div className={`mpn-grupo-cab${g.pedido ? " is-obra" : ""}`}>
              <i aria-hidden="true" />
              <span>{g.titulo}</span>
            </div>
            {g.lineas.map((l) => (
              <LineaIngreso
                key={l.key}
                l={l}
                sede={sede}
                obraTexto={l.obraId ? obraPorId.get(l.obraId) || "Obra" : `Stock ${sede}`}
                problema={problemas.find((p) => p.key === l.key)}
                onSumar={onSumar}
                onTeclado={onTeclado}
                onQuitar={onQuitar}
                onObra={onObra}
                onVariante={onVariante}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mst-car-pie">
        <PieConfirmar cart={cart} problemas={problemas.filter((p) => p.key !== "referencia")} onConfirmar={onConfirmar} />
      </div>
    </>
  );
}

export function PieConfirmar({ cart = [], problemas = [], onConfirmar }) {
  return (
    <>
      {problemas.length ? (
        <div className="mst-problemas" role="status">
          {problemas.slice(0, 3).map((p) => <div key={`${p.key}-${p.texto}`}>{p.texto}</div>)}
          {problemas.length > 3 ? <div>y {problemas.length - 3} más</div> : null}
        </div>
      ) : null}
      <button type="button" className="mst-btn-grande is-verde" disabled={!cart.length || problemas.length > 0} onClick={onConfirmar}>
        <ArrowDownToLine size={19} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          Confirmar el ingreso{cart.length ? ` · ${fmtNum(totalUnidades(cart))}` : ""}
        </span>
        {cart.length && !problemas.length ? <span className="mst-tecla" aria-hidden="true">Enter</span> : null}
      </button>
    </>
  );
}

function LineaIngreso({ l, sede, obraTexto, problema, onSumar, onTeclado, onQuitar, onObra, onVariante }) {
  const cantidad = cantidadDe(l);
  const cmp = comparaConPedido(l);
  return (
    <div className={`mst-linea${l.yaRecibido ? " ing-linea-frenada" : ""}`}>
      <span className="mst-destello" key={l.agregadoAt} aria-hidden="true" />
      <div className="mst-linea-fila">
        <span className="mst-res-foto" style={{ width: 34, height: 34, borderRadius: 9 }}>
          <FotoItem item={{ descripcion: l.label, imagenUrl: l.imagenUrl }} />
        </span>
        <div className="mst-linea-texto">
          <div className="mst-linea-nombre">{l.label}</div>
          <div className="mst-linea-sub">
            {l.ubicacion ? <span className="mpn-ubic" title="Dónde se guarda">{l.ubicacion}</span> : null}
            {l.tipo === "pedido" ? (
              <>
                <span>{l.obraCodigo || (l.obraId ? "Obra" : `Stock ${sede}`)}</span>
                {cmp.tipo === "completo" ? <span className="ing-estado is-ok">completo</span> : null}
                {cmp.tipo === "parcial" ? <span className="ing-estado is-parcial">quedan {fmtNum(cmp.diferencia)}</span> : null}
                {cmp.tipo === "de_mas" ? <span className="ing-estado is-mas">{fmtNum(cmp.diferencia)} de más</span> : null}
              </>
            ) : (
              <>
                <button type="button" className="ing-destino" onClick={() => onObra(l.key)} title="A qué va: stock u obra">
                  {l.obraId ? null : <Warehouse size={12} aria-hidden="true" />} {obraTexto}
                </button>
                {l.tipo === "nuevo" ? <span className="ing-estado is-nuevo">sin ficha</span> : null}
              </>
            )}
            <span>{l.unidad || "unidad"}</span>
          </div>
        </div>
        <div className="mst-cant">
          <button type="button" className="mst-paso" aria-label="Uno menos" onClick={() => onSumar(l.key, -1)}><Minus size={16} /></button>
          <button type="button" className="mst-cant-valor" aria-label="Escribir la cantidad" onClick={() => onTeclado(l.key)}>
            {cantidad > 0 ? fmtNum(cantidad) : "—"}
          </button>
          <button type="button" className="mst-paso" aria-label="Uno más" onClick={() => onSumar(l.key, 1)}><Plus size={16} /></button>
        </div>
        <button type="button" className="mst-quitar" aria-label={`Sacar ${l.label}`} onClick={() => onQuitar(l.key)}><X size={15} /></button>
      </div>
      {l.tipo === "directo" && l.variantes?.length ? (
        <div className="mpn-chips" role="group" aria-label="Variante">
          <span className="mpn-chips-titulo">Variante</span>
          {["", ...l.variantes].map((v) => {
            const elegida = (l.variante || "") === v;
            return (
              <button key={v || "sin"} type="button" className={`mpn-chip${elegida ? (v ? " is-elegida" : " is-neutra") : ""}`} aria-pressed={elegida} onClick={() => onVariante(l.key, v)}>
                {v || "Sin especificar"}
              </button>
            );
          })}
        </div>
      ) : null}
      {problema ? <div style={{ fontSize: 12, color: "var(--red)" }}>{problema.texto}</div> : null}
    </div>
  );
}

// ── Confirmar ───────────────────────────────────────────────────────────────

export function ConfirmarIngreso({ cart = [], sede, obras = [], referencia, onReferencia, problemas = [], guardando, error, onConfirmar, onVolver, onRafaga }) {
  const raizRef = useRef(null);
  const sinPedido = cart.filter((l) => l.tipo !== "pedido");
  const deMenos = cart.filter((l) => comparaConPedido(l).tipo === "parcial");
  const deMas = cart.filter((l) => comparaConPedido(l).tipo === "de_mas");
  const pedidos = new Set(cart.filter((l) => l.tipo === "pedido").map((l) => l.envioTitulo));
  const puede = !guardando && cart.length > 0 && !problemas.length;
  const obraPorId = useMemo(() => new Map(obras.map((o) => [o.id, o.codigo])), [obras]);

  useEffect(() => {
    if (!sinPedido.length) raizRef.current?.focus({ preventScroll: true });
    // Sólo al abrir: después el foco lo maneja quien escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function alTeclear(e) {
    if (e.defaultPrevented || guardando) return;
    if (e.key === "Escape") { e.preventDefault(); onVolver(); return; }
    if (e.key === "Enter" && e.target === e.currentTarget && puede) {
      e.preventDefault();
      onConfirmar();
    }
  }

  return (
    <div ref={raizRef} className="mst-firma" role="dialog" aria-modal="true" aria-label="Confirmar el ingreso" tabIndex={-1} onKeyDown={alTeclear}>
      <div className="mst-firma-cab">
        <button type="button" className="ui-btn" disabled={guardando} onClick={onVolver}>
          <ArrowLeft size={15} /> <span className="mpn-largo">Agregar o editar productos</span><span className="mpn-corto">Productos</span>
        </button>
        <h2>Confirmá el ingreso</h2>
        <span className="mst-num" style={{ fontSize: 15, fontWeight: 700, color: "var(--green)" }}>{fmtNum(totalUnidades(cart))}</span>
      </div>

      <div className="mst-firma-cuerpo">
        <div className="mst-firma-main">
          {error ? (
            <div className="mst-aviso is-rojo" role="alert">
              <TriangleAlert size={16} />
              <div className="mst-aviso-texto">
                <strong>No se registró todo</strong>
                <span>{error}</span>
              </div>
            </div>
          ) : null}

          <fieldset disabled={guardando} style={{ display: "contents", border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {sinPedido.length ? (
              <div className="mst-bloque">
                <label className="mst-bloque-titulo" htmlFor="ing-remito">Número de remito</label>
                <CampoTexto
                  id="ing-remito"
                  value={referencia}
                  onChange={onReferencia}
                  onRafaga={onRafaga}
                  maxLength={120}
                  autoFocus
                  onEnter={(e) => { e.preventDefault(); if (puede) onConfirmar(); }}
                  style={{ fontSize: 17, minHeight: 48 }}
                />
                <span className="ing-ayuda" style={{ margin: 0 }}>
                  {sinPedido.length === 1 ? "1 producto entra sin pedido" : `${sinPedido.length} productos entran sin pedido`} con este remito.
                </span>
              </div>
            ) : null}

            {pedidos.size ? (
              <div className="mst-aviso is-externo">
                <PackageCheck size={17} />
                <div className="mst-aviso-texto">
                  <strong>Se reciben {pedidos.size === 1 ? "renglones de 1 pedido" : `renglones de ${pedidos.size} pedidos`}</strong>
                  <span>{[...pedidos].join(" · ")}</span>
                </div>
              </div>
            ) : null}

            {deMenos.length ? (
              <div className="mst-aviso">
                <TriangleAlert size={16} />
                <div className="mst-aviso-texto">
                  <strong>{deMenos.length === 1 ? "Llegó menos de lo pedido" : `${deMenos.length} renglones llegaron incompletos`}</strong>
                  {deMenos.slice(0, 4).map((l) => <span key={l.key}>{l.label}: quedan {fmtNum(comparaConPedido(l).diferencia)} por llegar.</span>)}
                  <span style={{ color: "var(--dim)" }}>Quedan como parciales: el resto se recibe cuando llegue.</span>
                </div>
              </div>
            ) : null}

            {deMas.length ? (
              <div className="mst-aviso is-cian">
                <TriangleAlert size={16} />
                <div className="mst-aviso-texto">
                  <strong>{deMas.length === 1 ? "Llegó más de lo pedido" : `${deMas.length} renglones llegaron con de más`}</strong>
                  {deMas.slice(0, 4).map((l) => <span key={l.key}>{l.label}: {fmtNum(comparaConPedido(l).diferencia)} de más.</span>)}
                  <span style={{ color: "var(--dim)" }}>Entra todo lo que se contó.</span>
                </div>
              </div>
            ) : null}

            {problemas.some((p) => p.key !== "referencia") ? (
              <div className="mst-aviso is-rojo">
                <TriangleAlert size={16} />
                <div className="mst-aviso-texto">
                  {problemas.filter((p) => p.key !== "referencia").map((p) => <span key={`${p.key}-${p.texto}`}>{p.texto}</span>)}
                </div>
              </div>
            ) : null}

            <div className="mst-confirmar">
              <button type="button" className="mst-btn-grande is-verde" disabled={!puede} onClick={() => onConfirmar()}>
                {guardando ? <LoaderCircle size={19} className="mst-gira" /> : <Check size={19} />}
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {guardando ? "Registrando…" : problemas.length ? problemas[0].texto : `Ingresar a ${sede} · ${fmtNum(totalUnidades(cart))}`}
                </span>
                {puede ? <span className="mst-tecla" aria-hidden="true">Enter</span> : null}
              </button>
            </div>
          </fieldset>
        </div>

        <aside className="mst-firma-aside" aria-label="Lo que entra">
          <div className="mst-firma-aside-cab">
            <span className="mst-bloque-titulo" style={{ flex: 1 }}>Entra</span>
            <span style={{ fontSize: 12, color: "var(--dim)" }}>{cart.length === 1 ? "1 renglón" : `${cart.length} renglones`}</span>
          </div>
          {cart.map((l) => (
            <div key={l.key} className="mpn-linea-firma">
              <div className="mpn-linea-firma-fila">
                <span className="mst-num" style={{ color: "var(--green)" }}>{fmtNum(cantidadDe(l))}</span>
                <span>
                  {l.label}
                  {l.variante ? <small style={{ color: "var(--dim)" }}> · {l.variante}</small> : null}
                </span>
                <small style={{ color: "var(--dim)" }}>{l.unidad}</small>
              </div>
              <div className="mpn-ruta">
                {l.tipo === "pedido" ? <>{l.envioTitulo} → <strong>{l.obraCodigo || `Stock ${sede}`}</strong></>
                  : <>Sin pedido → <strong>{l.obraId ? obraPorId.get(l.obraId) || "Obra" : `Stock ${sede}`}</strong>{l.tipo === "nuevo" ? " · sin ficha" : ""}</>}
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}

// ── Listo ───────────────────────────────────────────────────────────────────

export function ListoIngreso({ resumen, sede, onSiguiente }) {
  const botonRef = useRef(null);
  useEffect(() => { botonRef.current?.focus({ preventScroll: true }); }, []);
  const partes = [
    resumen.pedidos ? (resumen.pedidos === 1 ? "1 pedido" : `${resumen.pedidos} pedidos`) : null,
    resumen.sinPedido ? `${resumen.sinPedido} sin pedido` : null,
    resumen.referencia ? `remito ${resumen.referencia}` : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className="mst-listo" role="status" aria-live="polite">
      <div className="mst-listo-caja">
        <div className="mst-listo-check"><DrawnCheck size={38} /></div>
        <h2>Ingresó</h2>
        <div className="mst-listo-quien">
          <span className="mst-num">{fmtNum(resumen.unidades)}</span> en el pañol de <strong>{sede}</strong>
          {partes ? <> · {partes}</> : null}
        </div>
        <div className="mst-listo-items">
          {resumen.items.map((it) => (
            <div key={it.key} className="mst-resumen-fila">
              <span className="mst-num">{fmtNum(it.cantidad)}</span>
              <span>{it.descripcion}{it.detalle ? <small> · {it.detalle}</small> : null}</span>
              <small>{it.unidad}</small>
            </div>
          ))}
        </div>
        <div className="mst-listo-tiempo" aria-hidden="true"><i /></div>
        <button ref={botonRef} type="button" className="mst-btn-grande" onClick={onSiguiente}>
          Sigue el próximo <span className="mst-tecla" aria-hidden="true">Enter</span>
        </button>
      </div>
    </div>
  );
}

// ── Capas ───────────────────────────────────────────────────────────────────

/** El producto tiene renglones esperando en más de un pedido (o en uno y puede ser otro). */
export function ElegirRenglon({ titulo, renglones = [], sede, onElegir, onSinPedido, onCerrar }) {
  return (
    <Hoja titulo={titulo} sub="Está esperando en un pedido. ¿De cuál es?" onCerrar={onCerrar}
      pie={onSinPedido ? <button type="button" className="ui-btn" onClick={onSinPedido}>No es de un pedido: entra sin pedido</button> : null}>
      <div className="mst-obras" style={{ gridTemplateColumns: "1fr" }}>
        {renglones.map((r) => (
          <button key={r.id} type="button" className="mst-obra ing-pedido" onClick={() => onElegir(r)}>
            <strong>{r.envioTitulo}</strong>
            <span>{destinoDelRenglon(r, sede)} · {r.falta == null ? "sin cantidad" : `faltan ${fmtNum(r.falta)}${unidadVisible(r.unidad)}`}</span>
          </button>
        ))}
      </div>
    </Hoja>
  );
}

export function ElegirObra({ obras = [], sede, actual = null, onElegir, onCerrar, onRafaga }) {
  const [filtro, setFiltro] = useState("");
  const lista = useMemo(() => {
    const q = normalizarTexto(filtro);
    const base = q ? obras.filter((o) => normalizarTexto(`${o.codigo} ${o.descripcion || ""}`).includes(q)) : obras;
    return [...base].sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "es", { numeric: true }));
  }, [obras, filtro]);
  return (
    <Hoja titulo="¿A qué va?" sub="Sin pedido, entra a stock libre salvo que sea para una obra." onCerrar={onCerrar} chica={false}>
      <div style={{ display: "grid", gap: 12 }}>
        <button type="button" className={`mst-obra mpn-obra-tile is-libre${!actual ? " is-elegida" : ""}`} onClick={() => onElegir(null)}>
          <strong><Warehouse size={15} style={{ verticalAlign: "-2px", marginRight: 6 }} aria-hidden="true" />Stock {sede}</strong>
          <span>Queda libre para cualquier obra</span>
        </button>
        <CampoTexto value={filtro} onChange={setFiltro} onRafaga={onRafaga} aria-label="Buscar obra" placeholder="Buscar" />
        <div className="mst-obras">
          {lista.map((o) => (
            <button key={o.id} type="button" className={`mst-obra${actual === o.id ? " is-elegida" : ""}`} onClick={() => onElegir(o.id)}>
              <strong>{o.codigo}</strong>
              <span>{o.descripcion || o.linea_nombre || o.modelo || "Obra"}</span>
            </button>
          ))}
        </div>
      </div>
    </Hoja>
  );
}

export function SinFicha({ codigo = "", descripcionInicial = "", consumible = null, onEntrar, onBuscar, onCerrar, onRafaga }) {
  const [descripcion, setDescripcion] = useState(descripcionInicial);
  const valida = descripcion.trim().length >= 4;
  if (consumible) {
    return (
      <Hoja titulo="Es un consumible" sub={consumible.descripcion} onCerrar={onCerrar}
        pie={(
          <>
            <button type="button" className="ui-btn" onClick={onCerrar}>Cerrar</button>
            <Link to="/consumibles?tab=ingresos" className="ui-btn ui-btn-primario">Ir a Consumibles</Link>
          </>
        )}>
        <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
          Los consumibles tienen su propio stock: el remito se carga en Consumibles → Ingresos.
        </p>
      </Hoja>
    );
  }
  return (
    <Hoja
      titulo={codigo ? "Ese código no está en el catálogo" : "No está en el catálogo"}
      sub={codigo ? <span className="mst-num">{codigo}</span> : null}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="ui-btn" onClick={onBuscar}>Buscar por nombre</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={!valida} onClick={() => onEntrar(descripcion.trim())}>
            <PackagePlus size={15} aria-hidden="true" /> Entra sin ficha
          </button>
        </>
      )}
    >
      <div className="mst-bloque">
        <label className="mst-bloque-titulo" htmlFor="ing-sin-ficha">Descripción</label>
        <CampoTexto
          id="ing-sin-ficha"
          value={descripcion}
          onChange={setDescripcion}
          onRafaga={onRafaga}
          maxLength={200}
          autoFocus
          onEnter={(e) => { e.preventDefault(); if (valida) onEntrar(descripcion.trim()); }}
        />
        <span className="ing-ayuda" style={{ margin: 0 }}>Entra al stock igual. Técnica le arma la ficha desde «Productos a crear».</span>
      </div>
    </Hoja>
  );
}

// ── Últimos ingresos ────────────────────────────────────────────────────────

export function UltimosIngresos({ items = [], sede, onActualizar, cargando = false }) {
  const grupos = useMemo(() => agruparUltimos(items, { limite: 20 }), [items]);
  return (
    <section aria-label="Últimos ingresos">
      <div className="mst-movs-cab">
        <h3>Últimos ingresos</h3>
        <span style={{ fontSize: 12, color: "var(--dim)" }}>{sede}</span>
        {onActualizar ? (
          <button type="button" className="mst-icono-btn" style={{ width: 32, height: 32 }} onClick={onActualizar} aria-label="Actualizar ingresos">
            <RotateCcw size={14} className={cargando ? "mst-gira" : ""} />
          </button>
        ) : null}
      </div>
      {!grupos.length ? <div className="mst-vacio">{cargando ? "Cargando…" : "Todavía no hay ingresos en esta sede."}</div> : null}
      {grupos.map((g) => (
        <Link key={g.clave} to={`/recepcion-panol?tab=recepcion&envio=${encodeURIComponent(g.envioId)}`} className="mst-mov ing-mov">
          <div className="mst-mov-fila">
            <span className="mst-tipo" style={{ color: "var(--green)", background: "var(--green-soft)" }} aria-hidden="true">
              <ArrowDownToLine size={13} />
            </span>
            <span className="mst-mov-hora">{hora(g.at)}</span>
            <span className="mst-mov-quien">{g.titulo}</span>
          </div>
          <div className="mst-mov-items">
            {g.items.slice(0, 3).map((it, i) => (
              <span key={i} style={{ marginRight: 8 }}><span className="mst-num">{fmtNum(it.cantidad)}</span> {it.descripcion}{it.parcial ? " (parcial)" : ""}</span>
            ))}
            {g.items.length > 3 ? <span> y {g.items.length - 3} más</span> : null}
          </div>
          <div className="mst-mov-sub">{g.sinPedido ? "Sin pedido" : "Pedido"}</div>
        </Link>
      ))}
    </section>
  );
}

/** Novedad de un renglón: no vino, vino mal o falta información. */
export function NovedadRenglon({ renglon: r, sede, guardando = false, onGuardar, onCerrar, onRafaga }) {
  const { modo, estados } = opcionesDeNovedad(r);
  const [estado, setEstado] = useState(modo === "estado" ? estados[0] : null);
  const [nota, setNota] = useState("");
  const soloMensaje = modo === "mensaje";
  const puede = !guardando && (soloMensaje ? nota.trim().length >= 3 : Boolean(estado));
  const guardar = () => { if (puede) onGuardar({ estado: soloMensaje ? null : estado, nota }); };
  return (
    <Hoja
      titulo={r.descripcion}
      sub={`${r.envioTitulo} · ${destinoDelRenglon(r, sede)} · ${faltaTexto(r)}`}
      onCerrar={onCerrar}
      pie={(
        <>
          <button type="button" className="ui-btn" disabled={guardando} onClick={onCerrar}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" disabled={!puede} onClick={guardar}>
            {guardando ? <LoaderCircle size={15} className="mst-gira" /> : <MessageSquareWarning size={15} aria-hidden="true" />}
            {soloMensaje ? "Avisar a Compras" : "Guardar la novedad"}
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        {soloMensaje ? (
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            Ya llegaron <strong>{fmtNum(r.llego)}</strong> de {fmtNum(r.pedido)}. Lo recibido queda en stock y el renglón sigue esperando el resto: la novedad va como mensaje al pedido.
          </p>
        ) : (
          <div role="radiogroup" aria-label="Qué pasó" style={{ display: "grid", gap: 8 }}>
            {estados.map((e) => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={estado === e}
                className={`mpn-destino-opcion ing-novedad-opcion is-${e}${estado === e ? " is-elegida" : ""}`}
                onClick={() => setEstado(e)}
              >
                <strong>{NOVEDADES[e].titulo}</strong>
                <span>{NOVEDADES[e].detalle}</span>
              </button>
            ))}
          </div>
        )}
        <div className="mst-bloque">
          <label className="mst-bloque-titulo" htmlFor="ing-novedad-nota">{soloMensaje ? "Qué pasó" : "Nota para Compras (opcional)"}</label>
          <CampoTexto
            id="ing-novedad-nota"
            value={nota}
            onChange={setNota}
            onRafaga={onRafaga}
            maxLength={300}
            autoFocus={soloMensaje}
            onEnter={(e) => { e.preventDefault(); guardar(); }}
          />
        </div>
      </div>
    </Hoja>
  );
}
