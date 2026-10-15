import { useMemo, useState } from "react";
import { Check, Minus, PackageSearch, Plus, ScanLine, Search, Trash2, X } from "lucide-react";
import { fmtCantidad } from "@/features/consumibles/api";
import FotoConsumible from "../FotoConsumible";
import { avisoStock } from "../mostrador/mostradorLogica";
import useRafagaLector from "../mostrador/useRafagaLector";
import { FormaTag, Ubicacion } from "./Piezas";
import { buscarProductos, candidatosPara, cantidadParaCampo, cantidadValida, codigoVisible } from "./solicitudesLogica";

/**
 * Cantidad editable: +/− para lo común y el número para lo demás. Se guarda
 * al salir del campo o con Enter; un valor inválido vuelve al anterior (para
 * sacar un renglón está "Quitar", no el cero).
 */
export function CampoCantidad({ valor, onCambiar, disabled = false, etiqueta }) {
  const n = Number(valor) || 0;
  const confirmar = (texto) => {
    const v = cantidadValida(texto);
    if (v != null && v !== n) onCambiar(v);
    return v;
  };
  return (
    <div className="sol-cant">
      <button type="button" aria-label={`Uno menos de ${etiqueta}`} disabled={disabled || n <= 1} onClick={() => onCambiar(Math.round((n - 1) * 1000) / 1000)}>
        <Minus size={16} />
      </button>
      <input
        key={n}
        defaultValue={cantidadParaCampo(n)}
        inputMode="decimal"
        aria-label={`Cantidad de ${etiqueta}`}
        disabled={disabled}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => { if (confirmar(e.target.value) == null) e.target.value = cantidadParaCampo(n); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === "Escape") { e.currentTarget.value = cantidadParaCampo(n); e.currentTarget.blur(); }
        }}
      />
      <button type="button" aria-label={`Uno más de ${etiqueta}`} disabled={disabled} onClick={() => onCambiar(Math.round((n + 1) * 1000) / 1000)}>
        <Plus size={16} />
      </button>
    </div>
  );
}

function TextoStock({ aviso, unidad }) {
  if (!aviso) return null;
  // Sin contar no alarma: el inventario recién arranca y casi nada tiene conteo.
  if (aviso.nivel === "sin_conteo") return <span className="sol-stock">sin contar</span>;
  // Sin stock o no alcanza: el texto del mostrador ya dice cuánto hay.
  if (aviso.nivel === "sin_stock" || aviso.nivel === "negativo") return <span className={`sol-stock is-${aviso.nivel}`}>{aviso.texto}</span>;
  return (
    <span className={`sol-stock is-${aviso.nivel}`} title={aviso.texto}>
      {aviso.nivel === "bajo" ? "Bajo: quedan " : "Quedan "}
      <span className="sol-num">{fmtCantidad(aviso.queda)}</span>
      {unidad ? ` ${unidad}` : ""}
    </span>
  );
}

/** Un renglón para preparar: ubicación grande, producto, cantidad y el tilde. */
export function Renglon({ r, editable, mostrarStock, onCantidad, onListo, onQuitar }) {
  const item = r.item;
  const unidad = item?.unidad || r.unidad || "";
  const listo = r.estado === "preparado" || r.estado === "reemplazado";
  const falta = r.estado === "faltante";
  const codigo = codigoVisible(item, r);
  // El aviso descuenta lo de este renglón: "quedan" es lo que queda después de entregarlo.
  const aviso = mostrarStock && item ? avisoStock(item, Number(r.cantidad) || 0) : null;
  const nombre = item?.descripcion || r.descripcion;

  return (
    <div className={`sol-renglon${listo ? " is-listo" : ""}`}>
      <Ubicacion valor={r.ubicacion} />
      <div className="sol-renglon-info">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <FotoConsumible item={item || r.material} />
          <div className="sol-renglon-nombre">{nombre}</div>
        </div>
        <div className="sol-renglon-sub">
          {codigo ? <span className="sol-num">{codigo}</span> : null}
          {item ? <FormaTag forma={item.formaEntrega} /> : <span className="sol-tag is-violeta">fuera del catálogo activo</span>}
          {item?.formaEntrega === "peso" && item.pesoUnitarioG ? (
            <span>1 pieza ≈ <span className="sol-num">{fmtCantidad(item.pesoUnitarioG)}</span> g</span>
          ) : null}
          {item?.formaEntrega === "canje" ? <span>contra el usado</span> : null}
          <TextoStock aviso={aviso} unidad={unidad} />
          {r.observacion ? <span title={r.observacion} style={{ overflowWrap: "anywhere" }}>{r.observacion}</span> : null}
        </div>
      </div>
      {editable ? (
        <div className="sol-cant" style={{ gap: 6 }}>
          <CampoCantidad valor={r.cantidad} onCambiar={onCantidad} etiqueta={nombre} />
          <small>{unidad}</small>
        </div>
      ) : (
        <div className="sol-cant">
          <span className="sol-renglon-cant-fija">{fmtCantidad(r.cantidad)}</span>
          <small>{unidad}</small>
        </div>
      )}
      <div className="sol-acciones-renglon">
        {editable ? (
          <>
            <button
              type="button"
              className={`sol-listo${listo ? " is-activo" : falta ? " is-falta" : ""}`}
              aria-pressed={listo}
              onClick={onListo}
              title={falta ? "Estaba marcado como faltante: tocá para marcarlo listo" : undefined}
            >
              <Check size={16} /> {listo ? "Listo" : falta ? "Falta" : "Listo"}
            </button>
            <button type="button" className="sol-quitar" aria-label={`Quitar ${nombre}`} onClick={onQuitar}>
              <Trash2 size={16} />
            </button>
          </>
        ) : listo ? (
          <span className="sol-tag is-verde"><Check size={11} /> listo</span>
        ) : falta ? (
          <span className="sol-tag is-rojo">faltante</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Un renglón escrito a mano (papel viejo o lectura dudosa de la IA). No se
 * puede entregar hasta elegir el producto: acá van los candidatos más
 * parecidos, como en Ingresos, o "Buscar otro" para usar el buscador.
 */
export function Libre({ r, catalogo, editable, buscando, onElegir, onBuscar, onCantidad, onQuitar }) {
  const candidatos = useMemo(() => candidatosPara(r.descripcion, catalogo), [r.descripcion, catalogo]);
  return (
    <div className="sol-libre">
      <div className="sol-libre-cab">
        <div className="sol-libre-texto">
          <strong>{r.descripcion || "Sin descripción"}</strong>
          <small>{r.observacion || "Escrito a mano: falta elegir el producto del catálogo"}</small>
        </div>
        {editable ? (
          <button type="button" className="sol-quitar" aria-label={`Quitar ${r.descripcion}`} onClick={onQuitar}><Trash2 size={16} /></button>
        ) : null}
      </div>
      {editable ? (
        <>
          <div className="sol-fila" style={{ flexWrap: "wrap" }}>
            <CampoCantidad valor={r.cantidad} onCambiar={onCantidad} etiqueta={r.descripcion} />
            <small className="sol-dim">{r.unidad || ""}</small>
          </div>
          <div className="sol-candidatos">
            {candidatos.map((c) => (
              <button key={c.id} type="button" className="sol-candidato" onClick={() => onElegir(c)}>
                <FotoConsumible item={c} size={32} />
                <Ubicacion valor={c.ubicacion} chica />
                <span>{c.descripcion}</span>
              </button>
            ))}
            <button type="button" className={`ui-btn${buscando ? " ui-btn-suave" : ""}`} style={{ minHeight: 44 }} onClick={onBuscar}>
              <Search size={15} /> {candidatos.length ? "Buscar otro" : "Elegir producto"}
            </button>
          </div>
        </>
      ) : (
        <div className="sol-dim" style={{ fontSize: 13 }}><span className="sol-num">{fmtCantidad(r.cantidad)}</span> {r.unidad || ""}</div>
      )}
    </div>
  );
}

/**
 * Buscador para agregar (o para elegir el producto de un renglón escrito a
 * mano). El lector de códigos escribe acá y manda Enter: por código exacto
 * entra directo; si no, el primero de la lista.
 */
export function Agregar({ catalogo, porCodigo, resolviendo, onElegir, onCancelarResolver, inputRef, deshabilitado, cantidades = new Map() }) {
  const [texto, setTexto] = useState("");
  const resultados = useMemo(() => buscarProductos(catalogo ?? [], texto, 40), [catalogo, texto]);

  function elegir(item, escaneado = false) {
    if (resolviendo || escaneado) setTexto("");
    onElegir(item);
  }

  function alEnter() {
    const exacto = porCodigo?.(texto);
    if (exacto) { elegir(exacto, true); return; }
    if (resultados[0]) elegir(resultados[0]);
  }

  const lector = useRafagaLector({
    onRafaga: (codigo, previo) => {
      const exacto = porCodigo?.(codigo);
      if (exacto) {
        setTexto(resolviendo ? "" : previo);
        onElegir(exacto);
      } else {
        setTexto(codigo);
        const primero = buscarProductos(catalogo ?? [], codigo, 1)[0];
        if (primero) onElegir(primero);
      }
    },
    onEnter: (e) => { e.preventDefault(); alEnter(); },
  });

  return (
    <div className="sol-agregar">
      {resolviendo ? (
        <div className="sol-modo-resolver">
          <PackageSearch size={15} />
          <span>Elegí el producto para «{resolviendo.descripcion}»</span>
          <button type="button" className="sol-enlace" onClick={onCancelarResolver}>Cancelar</button>
        </div>
      ) : null}
      <div className="sol-lector">
        <ScanLine size={18} />
        <input
          ref={inputRef}
          value={texto}
          disabled={deshabilitado}
          onChange={(e) => setTexto(e.target.value)}
          onPaste={lector.onPaste}
          onKeyDown={(e) => {
            lector.onKeyDown(e);
            if (e.key === "Escape") { setTexto(""); if (resolviendo) onCancelarResolver(); }
          }}
          placeholder={deshabilitado ? "Trayendo el catálogo…" : resolviendo ? "Nombre, código o escaneá" : "Agregar: escaneá o escribí nombre o código"}
          aria-label={resolviendo ? "Buscar el producto para el renglón escrito a mano" : "Agregar un producto"}
          autoComplete="off"
        />
      </div>
      {texto.trim() && !resolviendo ? (
        <div className="sol-fila" style={{ justifyContent: "space-between", fontSize: 12, color: "var(--dim)" }}>
          <span>Podés agregar varias variantes de esta búsqueda.</span>
          <button type="button" className="sol-enlace" onClick={() => setTexto("")}>Terminar búsqueda</button>
        </div>
      ) : null}
      {texto.trim() ? (
        resultados.length ? (
          <div className="sol-resultados" role="listbox" aria-label="Productos encontrados">
            {resultados.map((item, i) => (
              <button key={item.id} type="button" role="option" aria-selected={i === 0} className={`sol-resultado${i === 0 ? " is-activo" : ""}`} onClick={() => elegir(item)}>
                <FotoConsumible item={item} />
                <span className="sol-resultado-nombre">
                  <span>{item.descripcion}</span>
                  <small className="sol-num">{[codigoVisible(item), item.ubicacion ? `Ubic. ${item.ubicacion}` : null, item.unidad].filter(Boolean).join(" · ")}</small>
                </span>
                {cantidades.get(item.id) ? <span className="sol-tag is-verde">×{fmtCantidad(cantidades.get(item.id))}</span> : i === 0 ? <span className="sol-tag is-azul">Enter</span> : <Plus size={16} />}
              </button>
            ))}
          </div>
        ) : (
          <div className="sol-dim" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 8 }}>
            <X size={14} /> Nada coincide en el catálogo de consumibles.
          </div>
        )
      ) : null}
    </div>
  );
}
