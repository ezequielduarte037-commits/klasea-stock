import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, FileSpreadsheet, RefreshCw, Search, X } from "lucide-react";
import Cargando from "@/components/ui/Cargando";
import { useToast } from "@/components/ui/Toast";
import { useAhora } from "@/hooks/useAhora";
import { descargarXlsx } from "@/features/compras/xlsx";
import { SEDES, fetchCatalogo, fmtCantidad, guardarConfig, guardarStockMinimo } from "@/features/consumibles/api";
import { DIA_MS, claveDia, coincideBusqueda, compararNatural, unidadEnTexto } from "../conteo/conteoCalculos";
import { CampoNumero } from "./CampoNumero";
import PedidoSugerido from "./PedidoSugerido";
import ProductoPanel from "./ProductoPanel";
import { armarPedidoSugerido, consumoDiarioPromedio, consumoPorMaterial, diasDeHistoria, minimoSugerido, necesitaReponer } from "./reposicion";
import { fetchConsumo30Dias, fetchPrimerConteo } from "./stockApi";
import { CSS_STOCK } from "./stockEstilos";

/**
 * Stock y reposición: el stock de consumibles de la sede (y el de la otra sede
 * al lado), mínimo y máximo editables en el lugar, consumo de la última
 * semana y el pedido sugerido. Tocando un producto se ven sus movimientos y se
 * anula uno mal cargado.
 *
 * El mínimo vive en panol_materiales (uno para las dos sedes, con auditoría) y
 * el máximo en consumibles_config.
 */

const FILTROS = [
  { key: "todos", label: "Todos" },
  { key: "bajo", label: "Debajo del mínimo" },
  { key: "sinContar", label: "Sin contar" },
  { key: "negativos", label: "Negativos" },
];

function relativo(iso, ahora) {
  if (!iso) return "nunca";
  const dias = Math.floor((new Date(`${claveDia(ahora)}T00:00:00-03:00`) - new Date(`${claveDia(iso)}T00:00:00-03:00`)) / DIA_MS);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit" });
}

export default function StockTab({ sede }) {
  const toast = useToast();
  const ahora = useAhora(10 * 60 * 1000);
  const otraSede = SEDES.find((s) => s !== sede);

  const [datos, setDatos] = useState(null);
  const [errorCarga, setErrorCarga] = useState("");
  const [recargando, setRecargando] = useState(false);
  const [vista, setVista] = useState("stock");
  const [filtro, setFiltro] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState("");
  const [orden, setOrden] = useState({ campo: "descripcion", asc: true });
  const [selId, setSelId] = useState(null);

  const cargar = useCallback(async () => {
    const [catalogo, consumo, primerConteo] = await Promise.all([
      fetchCatalogo({ sede }),
      fetchConsumo30Dias(),
      fetchPrimerConteo(sede),
    ]);
    setDatos({ sede, catalogo, consumo, primerConteo });
    setErrorCarga("");
  }, [sede]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        await cargar();
      } catch (err) {
        if (vivo) setErrorCarga(err.message || String(err));
      }
    })();
    return () => { vivo = false; };
  }, [cargar]);

  const recargar = async () => {
    setRecargando(true);
    try {
      await cargar();
    } catch (err) {
      toast.error(`No se pudo actualizar: ${err.message || err}`);
    } finally {
      setRecargando(false);
    }
  };

  const listo = datos?.sede === sede;
  const catalogo = useMemo(() => (listo ? datos.catalogo : []), [listo, datos]);

  const filas = useMemo(() => {
    if (!listo) return [];
    const t = new Date(ahora).getTime();
    const c7 = consumoPorMaterial(datos.consumo, { desde: t - 7 * DIA_MS, sede });
    const c30 = consumoPorMaterial(datos.consumo, { desde: t - 30 * DIA_MS, sede });
    const dias = diasDeHistoria(datos.primerConteo, ahora);
    return datos.catalogo.map((i) => {
      const deSede = i.stockPorSede?.[sede];
      const consumo30 = c30.get(i.id) ?? 0;
      return {
        ...i,
        stockSede: deSede ? deSede.stock : null,
        stockOtra: i.stockPorSede?.[otraSede] ? i.stockPorSede[otraSede].stock : null,
        ultimoConteo: deSede?.ultimoConteoAt ?? null,
        preConteo: deSede?.preConteoRetirado ?? 0,
        maximo: i.config?.stock_maximo != null ? Number(i.config.stock_maximo) : null,
        consumo7: c7.get(i.id) ?? 0,
        consumo30,
        sugerido: minimoSugerido({ consumoDiario: consumoDiarioPromedio(consumo30, dias), diasHistoria: dias }),
      };
    });
  }, [listo, datos, sede, otraSede, ahora]);

  const pasaFiltro = useCallback((f, key) => {
    if (key === "bajo") return necesitaReponer({ stock: f.stockSede ?? 0, minimo: f.stockMinimo });
    if (key === "sinContar") return !f.ultimoConteo;
    if (key === "negativos") return (f.stockSede ?? 0) < 0;
    return true;
  }, []);

  const cuentas = useMemo(() => Object.fromEntries(FILTROS.map((f) => [f.key, filas.filter((x) => pasaFiltro(x, f.key)).length])), [filas, pasaFiltro]);
  const rubros = useMemo(() => [...new Set(filas.map((f) => f.rubro).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), [filas]);
  const conMinimo = useMemo(() => filas.some((f) => Number(f.stockMinimo) > 0), [filas]);
  const cantPedido = useMemo(() => armarPedidoSugerido(catalogo, sede).reduce((s, g) => s + g.lineas.length, 0), [catalogo, sede]);

  const visibles = useMemo(() => {
    const lista = filas.filter((f) => pasaFiltro(f, filtro) && (!rubro || f.rubro === rubro) && coincideBusqueda(f, busqueda));
    const dir = orden.asc ? 1 : -1;
    const valor = (f) => {
      if (orden.campo === "stock") return f.stockSede ?? -Infinity;
      if (orden.campo === "consumo") return f.consumo7;
      if (orden.campo === "conteo") return f.ultimoConteo ? new Date(f.ultimoConteo).getTime() : 0;
      return null;
    };
    return lista.sort((a, b) => {
      if (orden.campo === "descripcion") return dir * compararNatural(a.descripcion, b.descripcion);
      if (orden.campo === "ubicacion") return dir * (compararNatural(a.ubicacion || "~", b.ubicacion || "~") || compararNatural(a.descripcion, b.descripcion));
      return dir * (valor(a) - valor(b)) || compararNatural(a.descripcion, b.descripcion);
    });
  }, [filas, filtro, rubro, busqueda, orden, pasaFiltro]);

  const actualizarItem = useCallback((id, cambio) => {
    setDatos((prev) => (prev ? { ...prev, catalogo: prev.catalogo.map((i) => (i.id === id ? { ...i, ...cambio(i) } : i)) } : prev));
  }, []);

  const onGuardarMinimo = useCallback(async (item, valor) => {
    try {
      await guardarStockMinimo(item.id, valor);
      actualizarItem(item.id, () => ({ stockMinimo: valor }));
      toast.success(valor == null ? "Mínimo borrado." : `Mínimo de ${item.descripcion}: ${fmtCantidad(valor)}.`);
    } catch (err) {
      toast.error(`No se guardó el mínimo: ${err.message || err}`);
      throw err;
    }
  }, [actualizarItem, toast]);

  const onGuardarMaximo = useCallback(async (item, valor) => {
    try {
      const config = await guardarConfig(item.id, { stock_maximo: valor });
      actualizarItem(item.id, () => ({ config, codigoEtiqueta: config.codigo_etiqueta }));
      toast.success(valor == null ? "Máximo borrado." : `Máximo de ${item.descripcion}: ${fmtCantidad(valor)}.`);
    } catch (err) {
      toast.error(`No se guardó el máximo: ${err.message || err}`);
      throw err;
    }
  }, [actualizarItem, toast]);

  const onAnulado = useCallback((mov) => {
    // Se corrige al toque y después se trae todo de nuevo.
    actualizarItem(mov.material_id, (i) => {
      const deSede = i.stockPorSede?.[sede];
      // Sin contar no hay stock que corregir; la recarga trae el pre-conteo al día.
      if (!deSede || deSede.stock == null) return {};
      return { stockPorSede: { ...i.stockPorSede, [sede]: { ...deSede, stock: deSede.stock - Number(mov.cantidad || 0) } } };
    });
    cargar().catch(() => {});
  }, [actualizarItem, sede, cargar]);

  const ordenarPor = (campo) => setOrden((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: campo === "descripcion" || campo === "ubicacion" }));

  const exportar = () => {
    const cab = ["Código", "Producto", "Rubro", "Ubicación", "Unidad", `Stock ${sede}`, `Stock ${otraSede}`, "Mínimo", "Máximo", "Último conteo", "Consumo 7 días", "Salió antes del conteo"];
    descargarXlsx(`stock-consumibles-${sede.toLowerCase()}-${claveDia(new Date())}.xlsx`, [{
      nombre: "Stock",
      anchos: [10, 44, 22, 11, 10, 12, 12, 10, 10, 14, 14, 14],
      congelar: { fila: 1, col: 2 },
      filas: [
        cab.map((v) => ({ v, s: { fuente: { b: true }, fondo: "E8EEF8" } })),
        ...visibles.map((f) => [
          f.codigoEtiqueta || "", f.descripcion, f.rubro || "", f.ubicacion || "", f.unidad,
          f.stockSede ?? "sin contar", f.stockOtra ?? "sin contar", f.stockMinimo ?? "", f.maximo ?? "",
          f.ultimoConteo ? { v: new Date(f.ultimoConteo), s: { formatoNumero: "dd/mm/yyyy" } } : "", f.consumo7, f.preConteo || "",
        ]),
      ],
    }]);
  };

  if (errorCarga && !listo) {
    return (
      <div className="stk stk-root">
        <style href="klasea-cns-stock" precedence="default">{CSS_STOCK}</style>
        <div className="stk-vacio ui-card">
          <h3>No se pudo traer el stock</h3>
          <p>{errorCarga}</p>
          <button type="button" className="ui-btn ui-btn-primario" onClick={recargar} disabled={recargando}>Probar de nuevo</button>
        </div>
      </div>
    );
  }
  if (!listo) {
    return (
      <div className="stk stk-root">
        <style href="klasea-cns-stock" precedence="default">{CSS_STOCK}</style>
        <Cargando texto="Trayendo el stock…" />
      </div>
    );
  }

  const sel = selId ? filas.find((f) => f.id === selId) : null;
  const flecha = (campo) => (orden.campo === campo ? (orden.asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : null);

  return (
    <div className="stk stk-root">
      <style href="klasea-cns-stock" precedence="default">{CSS_STOCK}</style>

      <div className="stk-barra">
        <div className="stk-vistas" role="tablist" aria-label="Vista">
          <button type="button" role="tab" aria-selected={vista === "stock"} className={vista === "stock" ? "is-activa" : ""} onClick={() => setVista("stock")}>Stock</button>
          <button type="button" role="tab" aria-selected={vista === "pedido"} className={vista === "pedido" ? "is-activa" : ""} onClick={() => setVista("pedido")}>
            Pedido sugerido {cantPedido > 0 && <span className="stk-cuenta stk-num">{cantPedido}</span>}
          </button>
        </div>
        <div className="stk-barra-der">
          {vista === "stock" && (
            <button type="button" className="ui-btn" onClick={exportar} disabled={!visibles.length}><FileSpreadsheet size={15} /> Excel</button>
          )}
          <button type="button" className="ui-btn ui-btn-icono" onClick={recargar} disabled={recargando} aria-label="Actualizar" title="Actualizar">
            <RefreshCw size={16} className={recargando ? "stk-girando" : ""} />
          </button>
        </div>
      </div>

      {vista === "pedido" ? (
        <PedidoSugerido
          catalogo={catalogo}
          sede={sede}
          conMinimo={conMinimo}
          onVerProducto={setSelId}
          onVerSinMinimo={() => { setVista("stock"); setFiltro("todos"); setOrden({ campo: "consumo", asc: false }); }}
        />
      ) : (
        <>
          <div className="stk-filtros">
            <div className="stk-chips" role="group" aria-label="Filtro">
              {FILTROS.map((f) => (
                <button key={f.key} type="button" className={`stk-chip${filtro === f.key ? " is-activa" : ""}${f.key === "negativos" && cuentas.negativos ? " is-rojo" : ""}`} aria-pressed={filtro === f.key} onClick={() => setFiltro(f.key)}>
                  {f.label} <span className="stk-num">{cuentas[f.key]}</span>
                </button>
              ))}
            </div>
            <div className="stk-buscar">
              <Search size={16} className="stk-buscar-ico" />
              <input className="ui-input" type="search" value={busqueda} placeholder="Buscar producto o código" onChange={(e) => setBusqueda(e.target.value)} aria-label="Buscar" />
              {busqueda && <button type="button" className="stk-buscar-x" onClick={() => setBusqueda("")} aria-label="Borrar la búsqueda"><X size={15} /></button>}
            </div>
            <select className="ui-input stk-rubro" value={rubro} onChange={(e) => setRubro(e.target.value)} aria-label="Rubro">
              <option value="">Todos los rubros</option>
              {rubros.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="stk-tabla" role="table" aria-label={`Stock de consumibles en ${sede}`}>
            <div className="stk-fila is-cab" role="row">
              <button type="button" role="columnheader" className="c-prod" onClick={() => ordenarPor("descripcion")}>Producto {flecha("descripcion")}</button>
              <button type="button" role="columnheader" className="c-ubic" onClick={() => ordenarPor("ubicacion")}>Ubicación {flecha("ubicacion")}</button>
              <button type="button" role="columnheader" className="c-stock is-num" onClick={() => ordenarPor("stock")}>{sede} {flecha("stock")}</button>
              <span role="columnheader" className="c-otra is-num">{otraSede}</span>
              <span role="columnheader" className="c-min is-num">Mín.</span>
              <span role="columnheader" className="c-max is-num">Máx.</span>
              <button type="button" role="columnheader" className="c-conteo is-num" onClick={() => ordenarPor("conteo")}>Contado {flecha("conteo")}</button>
              <button type="button" role="columnheader" className="c-cons is-num" onClick={() => ordenarPor("consumo")}>Consumo 7 d {flecha("consumo")}</button>
            </div>
            {visibles.map((f) => {
              const bajo = necesitaReponer({ stock: f.stockSede ?? 0, minimo: f.stockMinimo });
              const negativo = (f.stockSede ?? 0) < 0;
              return (
                <div key={f.id} className={`stk-fila${bajo ? " is-bajo" : ""}${negativo ? " is-negativo" : ""}`} role="row">
                  <button type="button" role="cell" className="c-prod stk-prod" onClick={() => setSelId(f.id)}>
                    <span className="stk-prod-desc">{f.descripcion}</span>
                    <span className="stk-prod-meta">{[f.codigoEtiqueta, f.rubro].filter(Boolean).join(" · ")}</span>
                  </button>
                  <span role="cell" className="c-ubic stk-num" data-lbl="Ubicación">{f.ubicacion || <span className="stk-dim">—</span>}</span>
                  <span role="cell" className="c-stock is-num" data-lbl={sede}>
                    {f.stockSede == null ? (
                      // Sin conteo no hay stock: lo que salió antes es pre-conteo y no descuenta.
                      <span className="stk-sin-contar" title={f.preConteo ? "Registrado, pero no descuenta: el stock arranca con el primer conteo." : undefined}>
                        sin contar
                        {f.preConteo > 0 && <small className="stk-num">salió {fmtCantidad(f.preConteo)} antes</small>}
                      </span>
                    ) : (
                      <>
                        <span className={`stk-num stk-stock${negativo ? " is-negativo" : bajo ? " is-bajo" : ""}`}>{fmtCantidad(f.stockSede)}</span>
                        <small className="stk-dim"> {unidadEnTexto(f.unidad, f.stockSede)}</small>
                      </>
                    )}
                  </span>
                  <span role="cell" className="c-otra is-num stk-num stk-dim" data-lbl={otraSede}>{f.stockOtra == null ? "—" : fmtCantidad(f.stockOtra)}</span>
                  <span role="cell" className="c-min is-num" data-lbl="Mín.">
                    <CampoNumero compacto valor={f.stockMinimo} sugerido={f.sugerido} etiqueta={`Mínimo de ${f.descripcion}`} onGuardar={(v) => onGuardarMinimo(f, v)} />
                  </span>
                  <span role="cell" className="c-max is-num" data-lbl="Máx.">
                    <CampoNumero compacto valor={f.maximo} etiqueta={`Máximo de ${f.descripcion}`} onGuardar={(v) => onGuardarMaximo(f, v)} />
                  </span>
                  <span role="cell" className={`c-conteo is-num${f.ultimoConteo ? "" : " stk-dim"}`} data-lbl="Contado">{relativo(f.ultimoConteo, ahora)}</span>
                  <span role="cell" className="c-cons is-num stk-num" data-lbl="7 días">{f.consumo7 ? fmtCantidad(f.consumo7) : <span className="stk-dim">0</span>}</span>
                </div>
              );
            })}
            {!visibles.length && <div className="stk-sin">No hay productos con este filtro.</div>}
          </div>
        </>
      )}

      {sel && (
        <ProductoPanel
          key={sel.id}
          item={sel}
          sede={sede}
          otraSede={otraSede}
          consumo7={sel.consumo7}
          consumo30={sel.consumo30}
          minimoSugerido={sel.sugerido}
          onCerrar={() => setSelId(null)}
          onGuardarMinimo={onGuardarMinimo}
          onGuardarMaximo={onGuardarMaximo}
          onAnulado={onAnulado}
        />
      )}
    </div>
  );
}
