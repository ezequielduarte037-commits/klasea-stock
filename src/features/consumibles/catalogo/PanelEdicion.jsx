import { useState } from "react";
import { Link } from "react-router-dom";
import { Scale, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  FORMAS_ENTREGA,
  fmtCantidad,
  fmtPesos,
  guardarConfig,
  guardarStockMinimo,
  guardarUbicacion,
} from "@/features/consumibles/api";
import { UNIDADES_ENTREGA } from "./reglas";
import { guardarAlias, guardarInfo } from "./catalogoApi";
import FotosProducto from "./FotosProducto";
import { cambiosDeFicha, estadoInicial } from "./edicion";

/**
 * Ficha de un consumible: lo que el pañol y Compras ajustan a mano. Guarda
 * solo lo que cambió y cada cosa por su camino: la config en
 * consumibles_config, el mínimo por el RPC con auditoría y la ubicación en
 * panol_materiales.
 */

export default function PanelEdicion({ item, puedeEditar, onCerrar, onGuardado, onFoto }) {
  const toast = useToast();
  const [inicial] = useState(() => estadoInicial(item));
  const [f, setF] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e }));

  const guardar = async () => {
    if (!puedeEditar || guardando) return;
    let cambios;
    try { cambios = cambiosDeFicha(f, inicial); }
    catch (e) { return toast.error(e.message); }
    // Cambió el factor y hay costo de lista: el costo por unidad de entrega se recalcula.
    if (cambios.config && "factor_compra" in cambios.config && item.config?.costo_lista_item_id && item.costoCompraArs != null) {
      cambios.config.costo_unitario_ars = cambios.config.factor_compra ? Math.round((item.costoCompraArs / cambios.config.factor_compra) * 10000) / 10000 : null;
    }
    if (!Object.keys(cambios).length) {
      onCerrar();
      return;
    }
    setGuardando(true);
    try {
      const guardados = {};
      if (cambios.config) guardados.config = await guardarConfig(item.id, cambios.config);
      if ("stockMinimo" in cambios) {
        await guardarStockMinimo(item.id, cambios.stockMinimo);
        guardados.stockMinimo = cambios.stockMinimo;
      }
      if ("ubicacion" in cambios) guardados.ubicacion = await guardarUbicacion(item.id, cambios.ubicacion);
      if ("alias" in cambios) guardados.alias = await guardarAlias(item.id, cambios.alias);
      if ("info" in cambios) guardados.info = await guardarInfo(item.id, cambios.info);
      onGuardado(item.id, guardados);
      toast.success("Guardado.");
    } catch (e) {
      toast.error(e?.message || "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  const c = item.config ?? {};
  const ayudaForma = FORMAS_ENTREGA[f.forma_entrega]?.ayuda;

  return (
    <aside className="cat-panel ui-card" aria-label={`Ficha de ${item.descripcion}`}>
      <header className="cat-panel-cab">
        <div>
          <div className="cat-mono cat-dim">{item.codigoEtiqueta ?? "Sin código"}</div>
          <h3>{item.descripcion}</h3>
          <div className="cat-dim">{item.rubro ?? "Sin rubro"}</div>
        </div>
        <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={onCerrar} aria-label="Cerrar">
          <X size={18} />
        </button>
      </header>

      <div className="cat-panel-cuerpo">
        <section>
          <h4>Fotos</h4>
          <FotosProducto materialId={item.id} principal={item.imagenUrl} puedeEditar={puedeEditar} onPrincipal={(url) => onFoto?.(item.id, url)} />
        </section>
        <fieldset disabled={!puedeEditar || guardando}>
          <section>
            <label className="cat-campo">
              <span>Alias / nombre del pañol</span>
              <textarea className="ui-input cat-notas" rows={2} value={f.alias} onChange={set("alias")} placeholder="Cómo lo conocen en el pañol" />
              <small>También se usa al buscar. Podés separar los nombres con ·.</small>
            </label>
            <label className="cat-campo">
              <span>Información del producto</span>
              <textarea className="ui-input cat-notas" rows={3} value={f.info} onChange={set("info")} placeholder="Marca, medidas, para qué se usa, cómo se reconoce" />
              <small>La ve cualquiera que busque el producto.</small>
            </label>
          </section>
          <section>
            <h4>Entrega</h4>
            <label className="cat-campo">
              <span>Forma de entrega</span>
              <select className="ui-input" value={f.forma_entrega} onChange={set("forma_entrega")}>
                {Object.entries(FORMAS_ENTREGA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              {ayudaForma && <small>{ayudaForma}</small>}
            </label>
            <div className="cat-fila2">
              <label className="cat-campo">
                <span>Unidad de entrega</span>
                <input className="ui-input" list="cat-unidades" value={f.unidad_entrega} onChange={set("unidad_entrega")} />
              </label>
              <label className="cat-campo">
                <span>Cupo diario por persona</span>
                <input className="ui-input" inputMode="decimal" value={f.cupo_diario} onChange={set("cupo_diario")} placeholder="Sin cupo" />
              </label>
            </div>
            <div className="cat-fila2">
              <label className="cat-campo">
                <span>Orden en favoritos</span>
                <input className="ui-input" inputMode="numeric" value={f.favorito_orden} onChange={set("favorito_orden")} placeholder="No aparece" />
              </label>
              <label className="cat-check">
                <input type="checkbox" checked={f.activo_mostrador} onChange={set("activo_mostrador")} />
                <span>Se ofrece en el mostrador</span>
              </label>
            </div>
          </section>

          <section>
            <h4>Stock y lugar</h4>
            <div className="cat-fila2">
              <label className="cat-campo">
                <span>Stock mínimo</span>
                <input className="ui-input" inputMode="decimal" value={f.stockMinimo} onChange={set("stockMinimo")} placeholder="Sin mínimo" />
              </label>
              <label className="cat-campo">
                <span>Stock máximo</span>
                <input className="ui-input" inputMode="decimal" value={f.stock_maximo} onChange={set("stock_maximo")} placeholder="Sin máximo" />
              </label>
            </div>
            <label className="cat-campo">
              <span>Ubicación (estante-nivel-posición)</span>
              <input className="ui-input cat-mono" value={f.ubicacion} onChange={set("ubicacion")} placeholder="C2-03" autoCapitalize="characters" />
            </label>
            <div className="cat-peso">
              <Scale size={16} />
              <span>
                {item.pesoUnitarioG
                  ? <>Peso por pieza <b className="cat-mono">{fmtCantidad(item.pesoUnitarioG)} g</b></>
                  : "Sin peso por pieza"}
              </span>
              <Link to="/balanza/calibrar" className="ui-btn ui-btn-suave cat-btn-chico">{item.pesoUnitarioG ? "Recalibrar" : "Calibrar"}</Link>
            </div>
          </section>

          <section>
            <h4>Compra</h4>
            <div className="cat-prov">
              {c.proveedor_codigo ? (
                <>
                  <div><span className="cat-dim">Proveedor</span> {c.proveedor_nombre ?? "—"} · <span className="cat-mono">{c.proveedor_codigo}</span></div>
                  <div><span className="cat-dim">Costo por {f.unidad_entrega || "unidad"}</span> <b className="cat-mono">{fmtPesos(c.costo_unitario_ars)}</b> <span className="cat-dim">sin IVA</span></div>
                </>
              ) : (
                <div className="cat-dim">Consumible fuera de la lista de Rebollar.</div>
              )}
            </div>
            <div className="cat-fila3">
              <label className="cat-campo">
                <span>Unidad de compra</span>
                <input className="ui-input" value={f.unidad_compra} onChange={set("unidad_compra")} placeholder="caja, litro…" />
              </label>
              <label className="cat-campo">
                <span>Trae (factor)</span>
                <input className="ui-input" inputMode="decimal" value={f.factor_compra} onChange={set("factor_compra")} placeholder="—" />
              </label>
              <label className="cat-campo">
                <span>Lote mínimo</span>
                <input className="ui-input" inputMode="decimal" value={f.lote_compra} onChange={set("lote_compra")} placeholder="—" />
              </label>
            </div>
            <small className="cat-dim">El factor es cuántas unidades de entrega trae una de compra (caja x100 → 100).</small>
          </section>

          <section>
            <label className="cat-campo">
              <span>Nota interna del pañol</span>
              <textarea className="ui-input cat-notas" rows={2} value={f.notas} onChange={set("notas")} />
            </label>
          </section>
        </fieldset>
        <datalist id="cat-unidades">
          {UNIDADES_ENTREGA.map((u) => <option key={u} value={u} />)}
        </datalist>
      </div>

      <footer className="cat-panel-pie">
        {puedeEditar ? (
          <>
            <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCerrar} disabled={guardando}>Cancelar</button>
            <button type="button" className="ui-btn ui-btn-primario" onClick={guardar} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </>
        ) : (
          <span className="cat-dim">Solo lectura: tu usuario no edita el catálogo.</span>
        )}
      </footer>
    </aside>
  );
}
