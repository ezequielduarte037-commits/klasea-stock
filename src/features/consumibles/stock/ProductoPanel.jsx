import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import {
  CARRILES,
  TIPOS_MOVIMIENTO,
  anularMovimiento,
  fetchMovimientos,
  fmtCantidad,
  fmtPesos,
} from "@/features/consumibles/api";
import Hoja from "../conteo/Hoja";
import { fetchNombresDePerfiles } from "../conteo/conteoApi";
import { unidadEnTexto } from "../conteo/conteoCalculos";
import { CampoNumero } from "./CampoNumero";

/**
 * Ficha de un consumible desde Stock: stock de las dos sedes, mínimo y
 * máximo, y sus movimientos con quién, obra y carril. Un movimiento mal
 * cargado se anula con un motivo (el registro no se edita ni se borra).
 */

const LIMITE = 200;
const fecha = (iso) => new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const TONO_TIPO = { inventario: "violeta", ingreso: "verde", retiro: "azul", devolucion: "teal", ajuste: "violeta", merma: "rojo" };

export default function ProductoPanel({ item, sede, otraSede, consumo7, consumo30, minimoSugerido, onCerrar, onGuardarMinimo, onGuardarMaximo, onAnulado }) {
  const toast = useToast();
  const [movs, setMovs] = useState(null);
  const [nombres, setNombres] = useState(() => new Map());
  const [anulando, setAnulando] = useState(null); // id del movimiento
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const filas = await fetchMovimientos({ materialId: item.id, sede, incluirAnulados: true, limite: LIMITE });
      setMovs(filas);
      setError("");
      const ids = filas.filter((m) => !m.empleado_nombre && m.created_by).map((m) => m.created_by);
      if (ids.length) setNombres(await fetchNombresDePerfiles(ids));
    } catch (err) {
      setError(err.message || String(err));
      setMovs([]);
    }
  }, [item.id, sede]);

  useEffect(() => { cargar(); }, [cargar]);

  const confirmarAnular = async (mov) => {
    if (!motivo.trim()) {
      toast.warning("Escribí por qué se anula.");
      return;
    }
    setEnviando(true);
    try {
      await anularMovimiento(mov.id, motivo);
      toast.success("Movimiento anulado. El stock ya se corrigió.");
      onAnulado?.(mov);
      setAnulando(null);
      setMotivo("");
      await cargar();
    } catch (err) {
      toast.error(`No se pudo anular: ${err.message || err}`);
    } finally {
      setEnviando(false);
    }
  };

  // Un conteo con otro conteo vigente después no se anula (la base lo
  // rechaza: rompería la cadena de diferencias). Se corrige volviendo a contar.
  const conteosBloqueados = useMemo(() => {
    const bloqueados = new Set();
    let hayPosterior = false;
    for (const m of movs ?? []) {
      if (m.tipo !== "inventario" || m.anulado_at) continue;
      if (hayPosterior) bloqueados.add(m.id);
      hayPosterior = true;
    }
    return bloqueados;
  }, [movs]);

  const stockSede = item.stockPorSede?.[sede]?.stock;
  const stockOtra = item.stockPorSede?.[otraSede]?.stock;

  return (
    <Hoja
      abierta
      lateral
      clase="stk"
      ancho={520}
      titulo={item.descripcion}
      sub={[item.codigoEtiqueta, item.rubro, item.ubicacion].filter(Boolean).join(" · ") || "Consumible"}
      onCerrar={onCerrar}
    >
      <div className="stk-ficha">
        <div className="stk-ficha-stocks">
          <div className="stk-ficha-stock">
            <span className="stk-lbl">Stock {sede}</span>
            <span className={`stk-num stk-ficha-grande${stockSede < 0 ? " is-negativo" : ""}`}>{stockSede == null ? "—" : fmtCantidad(stockSede)}</span>
            <span className="stk-dim">{unidadEnTexto(item.unidad, stockSede ?? 0)}</span>
          </div>
          <div className="stk-ficha-stock">
            <span className="stk-lbl">{otraSede}</span>
            <span className="stk-num stk-ficha-media">{stockOtra == null ? "—" : fmtCantidad(stockOtra)}</span>
          </div>
          <div className="stk-ficha-stock">
            <span className="stk-lbl">Consumo</span>
            <span className="stk-num stk-ficha-media">{fmtCantidad(consumo7)}</span>
            <span className="stk-dim">7 días · {fmtCantidad(consumo30)} en 30</span>
          </div>
        </div>

        <div className="stk-ficha-limites">
          <label className="stk-campo">
            <span className="stk-lbl">Mínimo</span>
            <CampoNumero valor={item.stockMinimo} onGuardar={(v) => onGuardarMinimo(item, v)} etiqueta="Stock mínimo" />
          </label>
          <label className="stk-campo">
            <span className="stk-lbl">Máximo</span>
            <CampoNumero valor={item.config?.stock_maximo} onGuardar={(v) => onGuardarMaximo(item, v)} etiqueta="Stock máximo" />
          </label>
          {minimoSugerido != null && (
            <div className="stk-sugerido">
              Mínimo sugerido: <b className="stk-num">{fmtCantidad(minimoSugerido)}</b>
              <span className="stk-dim"> (consumo diario × días de entrega y seguridad)</span>
              {Number(item.stockMinimo) !== minimoSugerido && (
                <button type="button" className="ui-btn ui-btn-suave stk-usar" onClick={() => onGuardarMinimo(item, minimoSugerido)}>Usar</button>
              )}
            </div>
          )}
          {item.costoUnitarioArs != null && (
            <div className="stk-dim stk-costo">Costo vigente: {fmtPesos(item.costoUnitarioArs)} por {item.unidad} (sin IVA)</div>
          )}
        </div>

        <h3 className="stk-ficha-tit">Movimientos en {sede}</h3>
        {movs == null ? (
          <Cargando compacto texto="Trayendo movimientos…" />
        ) : error ? (
          <p className="stk-error">{error}</p>
        ) : movs.length === 0 ? (
          <p className="stk-dim">Todavía no tiene movimientos en esta sede.</p>
        ) : (
          <ul className="stk-movs">
            {movs.map((m) => {
              const anulado = !!m.anulado_at;
              const quien = m.empleado_nombre || nombres.get(m.created_by) || null;
              const cant = Number(m.cantidad) || 0;
              const detalle = [
                quien,
                m.obra?.codigo ? `Obra ${m.obra.codigo}` : m.sector || null,
                m.carril ? CARRILES[m.carril] : null,
                m.remito ? `Remito ${m.remito}` : null,
              ].filter(Boolean);
              return (
                <li key={m.id} className={`stk-mov${anulado ? " is-anulado" : ""}`}>
                  <div className="stk-mov-fila">
                    <span className="stk-tag" data-tono={TONO_TIPO[m.tipo] || "azul"}>{TIPOS_MOVIMIENTO[m.tipo] || m.tipo}</span>
                    <span className="stk-mov-fecha stk-num">{fecha(m.created_at)}</span>
                    <span className={`stk-mov-cant stk-num${cant < 0 ? " is-resta" : " is-suma"}`}>{cant > 0 ? "+" : ""}{fmtCantidad(cant)}</span>
                  </div>
                  {detalle.length > 0 && <div className="stk-mov-detalle">{detalle.join(" · ")}</div>}
                  {m.tipo === "inventario" && (
                    <div className="stk-mov-detalle">Contó {fmtCantidad(m.contado)}; el sistema decía {fmtCantidad(m.teorico)}{m.gramos ? ` · ${fmtCantidad(m.gramos)} g` : ""}</div>
                  )}
                  {m.fuera_cupo && <div className="stk-mov-detalle">Fuera de cupo{m.autorizado_por ? `, autorizó ${m.autorizado_por}` : ""}</div>}
                  {m.nota && <div className="stk-mov-nota">{m.nota}</div>}
                  {anulado ? (
                    <div className="stk-mov-anulado">Anulado: {m.anulado_motivo || "sin motivo"}</div>
                  ) : conteosBloqueados.has(m.id) ? (
                    <div className="stk-mov-detalle stk-dim">Tiene un conteo posterior: si estaba mal, se corrige volviendo a contar.</div>
                  ) : anulando === m.id ? (
                    <div className="stk-anular">
                      <input
                        className="ui-input"
                        value={motivo}
                        autoFocus
                        maxLength={200}
                        placeholder="¿Por qué se anula? Ej.: se cargó dos veces"
                        onChange={(e) => setMotivo(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") confirmarAnular(m); if (e.key === "Escape") { e.preventDefault(); setAnulando(null); } }}
                      />
                      <div className="stk-anular-btns">
                        <button type="button" className="ui-btn" onClick={() => { setAnulando(null); setMotivo(""); }} disabled={enviando}>Cancelar</button>
                        <button type="button" className="ui-btn ui-btn-peligro" onClick={() => confirmarAnular(m)} disabled={enviando || !motivo.trim()}>
                          {enviando ? "Anulando…" : "Anular movimiento"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="ui-btn ui-btn-fantasma stk-mov-anular" onClick={() => { setAnulando(m.id); setMotivo(""); }}>
                      <Ban size={14} /> Anular
                    </button>
                  )}
                </li>
              );
            })}
            {movs.length >= LIMITE && <li className="stk-dim">Se muestran los últimos {LIMITE}.</li>}
          </ul>
        )}
      </div>
    </Hoja>
  );
}
