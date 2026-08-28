import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, ChevronRight, LoaderCircle, Package, RotateCcw, Search, TrendingDown, Truck } from "lucide-react";
import { C } from "@/theme";
import { useToast } from "@/components/ui/Toast";
import { calcularReposicion } from "@/features/compras/reposicionApi";

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
  if (semanas < 1) return "menos de 1 sem";
  if (semanas < 2) return "1 semana";
  return `${Math.round(semanas)} semanas`;
}

/** Rojo cuando ya no llega, cyan cuando esta al limite. Sin ambar. */
function colorDeUrgencia(item) {
  if (!item.urge) return { texto: C.dim, fondo: "transparent", borde: C.border };
  if (item.semanasRestantes < item.plazoDias / 7) return { texto: C.red, fondo: C.redL, borde: C.redB };
  return { texto: C.cyan, fondo: C.cyanL, borde: C.cyanB };
}

export default function ReposicionPanel({ isMobile = false }) {
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [soloUrgentes, setSoloUrgentes] = useState(true);
  const [abiertos, setAbiertos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    setCargando(true);
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

  useEffect(() => { cargar(); }, [cargar]);

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

  const tarjeta = { background: C.panelSolid, border: `1px solid ${C.border}`, borderRadius: 12 };

  return (
    <div style={{ display: "grid", gap: 14, padding: isMobile ? 12 : 0 }}>
      {/* ── Encabezado ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <TrendingDown size={18} color={C.blue} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ color: C.text, fontSize: 16, fontWeight: 950 }}>Qué comprar</div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700 }}>
            Calculado con el consumo real del pañol y el plazo de cada proveedor. No hay nada que cargar.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, border: `1px solid ${C.border2}`, background: C.panelSolid, borderRadius: 9, padding: "7px 10px", minWidth: isMobile ? "100%" : 230 }}>
          <Search size={14} color={C.dim} />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Material o proveedor…"
            style={{ flex: 1, border: "none", background: "transparent", color: C.text, outline: "none", fontFamily: C.sans, fontSize: 12.5, fontWeight: 700, minWidth: 0 }}
          />
        </div>
        <button
          type="button"
          onClick={() => setSoloUrgentes((v) => !v)}
          style={{ border: `1px solid ${soloUrgentes ? C.blueB : C.border2}`, background: soloUrgentes ? C.blueL : C.panelSolid, color: soloUrgentes ? C.blue : C.text, borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850 }}
        >
          {soloUrgentes ? "Solo lo que falta" : "Todo lo que se sigue"}
        </button>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          style={{ border: `1px solid ${C.border2}`, background: C.panelSolid, color: C.text, borderRadius: 9, padding: "8px 11px", cursor: cargando ? "default" : "pointer", fontFamily: C.sans, fontSize: 12.5, fontWeight: 850, display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {cargando ? <LoaderCircle size={14} className="spin" /> : <RotateCcw size={14} />}
        </button>
      </div>

      {/* ── De dónde salen los números ── */}
      {datos ? (
        <div style={{ ...tarjeta, padding: "11px 14px", display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <span style={{ color: C.red, fontSize: 19, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.urgentes}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 7 }}>para pedir ahora</span>
          </div>
          <div>
            <span style={{ color: C.text, fontSize: 19, fontWeight: 950, fontFamily: C.mono }}>{datos.resumen.analizados}</span>
            <span style={{ color: C.muted, fontSize: 12.5, fontWeight: 750, marginLeft: 7 }}>materiales con consumo seguido</span>
          </div>
          <div style={{ marginLeft: "auto", color: C.dim, fontSize: 11.5, fontWeight: 700 }}>
            Plazo {datos.resumen.plazoGeneral} días · medido sobre {datos.resumen.pedidosMedidos} pedidos recibidos ·
            {" "}{datos.resumen.mesesDeHistoria} meses de consumo
          </div>
        </div>
      ) : null}

      {/* ── Los que no tienen proveedor: no se pueden pedir ── */}
      {datos?.resumen.sinProveedor > 0 ? (
        <div style={{ ...tarjeta, borderColor: C.redB, background: C.redL, padding: "11px 14px", display: "flex", gap: 9, alignItems: "flex-start" }}>
          <AlertCircle size={15} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 750, lineHeight: 1.5 }}>
            <b style={{ color: C.text }}>{datos.resumen.sinProveedor} de los que hay que pedir no tienen proveedor cargado.</b>{" "}
            Están abajo de todo. Hasta que se les asigne uno, no hay a quién pedírselos sin buscar en remitos viejos.
          </div>
        </div>
      ) : null}

      {error ? (
        <div style={{ ...tarjeta, borderColor: C.redB, background: C.redL, padding: "11px 14px", fontSize: 12.5, color: C.red, fontWeight: 800 }}>{error}</div>
      ) : null}

      {cargando && !datos ? (
        <div style={{ ...tarjeta, padding: 30, textAlign: "center", color: C.dim, fontSize: 13, fontWeight: 750 }}>
          <LoaderCircle size={20} className="spin" style={{ marginBottom: 8 }} />
          <div>Calculando con el consumo de los últimos meses…</div>
        </div>
      ) : !grupos.length ? (
        <div style={{ ...tarjeta, padding: 30, textAlign: "center" }}>
          <Package size={22} color={C.dim} style={{ marginBottom: 8 }} />
          <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
            {soloUrgentes ? "No hay nada por debajo del punto de pedido" : "Sin materiales que coincidan"}
          </div>
          <div style={{ color: C.dim, fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            {soloUrgentes ? "Tocá «Todo lo que se sigue» para ver el resto." : "Probá con otro término."}
          </div>
        </div>
      ) : (
        grupos.map((grupo) => {
          const abierto = abiertos.has(grupo.proveedor);
          const sinProveedor = !grupo.proveedor;
          return (
            <div key={grupo.proveedor || "__sin__"} style={{ ...tarjeta, borderColor: sinProveedor ? C.redB : C.border }}>
              <button
                type="button"
                onClick={() => alternar(grupo.proveedor)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", fontFamily: C.sans }}
              >
                {abierto ? <ChevronDown size={16} color={C.dim} /> : <ChevronRight size={16} color={C.dim} />}
                <Truck size={15} color={sinProveedor ? C.red : C.blue} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>
                    {grupo.proveedor || "Sin proveedor asignado"}
                  </div>
                  <div style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>
                    {grupo.urgentes > 0 ? `${grupo.urgentes} para pedir` : "al día"}
                    {" · "}entrega en {grupo.plazoDias} días{grupo.plazoEsPropio ? " (medido con sus pedidos)" : ""}
                  </div>
                </div>
                {grupo.urgentes > 0 && !sinProveedor ? (
                  <span
                    onClick={(e) => { e.stopPropagation(); copiarPedido(grupo); }}
                    style={{ border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue, borderRadius: 8, padding: "6px 10px", fontSize: 11.5, fontWeight: 850, cursor: "pointer", whiteSpace: "nowrap" }}
                  >
                    Copiar pedido
                  </span>
                ) : null}
              </button>

              {abierto ? (
                <div style={{ borderTop: `1px solid ${C.border}` }}>
                  {grupo.items.map((item, i) => {
                    const color = colorDeUrgencia(item);
                    return (
                      <div
                        key={item.id}
                        style={{
                          display: "grid",
                          gridTemplateColumns: isMobile ? "1fr" : "1fr 92px 92px 92px",
                          gap: isMobile ? 4 : 10,
                          alignItems: "center",
                          padding: "10px 15px",
                          borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ color: C.text, fontSize: 13, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.descripcion}
                          </div>
                          <div style={{ color: C.dim, fontSize: 11, fontWeight: 700 }}>
                            {item.porMes} {item.unidad}/mes · {item.salidas} salidas
                            {item.esConsumible ? " · consumible" : ""}
                          </div>
                        </div>
                        <div style={{ textAlign: isMobile ? "left" : "right" }}>
                          <div style={{ color: color.texto, fontSize: 13, fontWeight: 900, fontFamily: C.mono }}>{semanasTexto(item.semanasRestantes)}</div>
                          <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>de stock</div>
                        </div>
                        <div style={{ textAlign: isMobile ? "left" : "right" }}>
                          <div style={{ color: C.muted, fontSize: 13, fontWeight: 800, fontFamily: C.mono }}>{item.hay} / {item.puntoDePedido}</div>
                          <div style={{ color: C.dim, fontSize: 10.5, fontWeight: 700 }}>hay / punto</div>
                        </div>
                        <div style={{ textAlign: isMobile ? "left" : "right" }}>
                          {item.urge ? (
                            <span style={{ display: "inline-block", background: color.fondo, border: `1px solid ${color.borde}`, color: color.texto, borderRadius: 7, padding: "4px 9px", fontSize: 12.5, fontWeight: 900, fontFamily: C.mono }}>
                              pedir {item.sugerido}
                            </span>
                          ) : (
                            <span style={{ color: C.dim, fontSize: 11.5, fontWeight: 750 }}>alcanza</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
