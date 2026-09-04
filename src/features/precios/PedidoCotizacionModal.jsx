import { useMemo, useState } from "react";
import {
  Check,
  ClipboardList,
  Copy,
  Download,
  FileSpreadsheet,
  Loader2,
  Mail,
  MessageCircle,
  Printer,
  Users,
  X,
} from "lucide-react";
import { C } from "@/theme";
import {
  ALCANCES,
  descargarPedidoPdf,
  descargarPedidoXlsx,
  descargarPedidosZip,
  expandirFilas,
  filtrarPorAlcance,
  hoyISO,
  imprimirPedidoPdf,
  itemsDeProveedor,
  textoPedido,
} from "./pedidoCotizacion";

/**
 * Lista de precios a completar: elegir a quién, qué ítems y en qué formato sale.
 *
 * El alcance por defecto es "sin precio o a revisar" porque ese es el pedido
 * real de todos los días: no se le pide de nuevo lo que cotizó la semana
 * pasada, se le pide lo que falta o lo que ya quedó viejo.
 */

const surface = {
  background: C.panelSolid,
  border: `1px solid ${C.b0}`,
  borderRadius: 12,
  boxShadow: "0 1px 2px var(--shadow)",
};

const button = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  border: `1px solid ${C.b1}`,
  background: C.panel,
  color: C.t1,
  borderRadius: 8,
  padding: "8px 11px",
  cursor: "pointer",
  fontFamily: C.sans,
  fontSize: 12,
  fontWeight: 600,
};

const primary = {
  ...button,
  background: C.blue,
  color: "var(--inverse-text)",
  borderColor: C.blue,
  boxShadow: "0 7px 18px color-mix(in srgb, var(--blue) 20%, transparent)",
};

const label = {
  display: "block",
  marginBottom: 6,
  color: C.t2,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

function Chip({ active, children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...button,
        padding: "7px 11px",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        color: active ? C.blue : C.t2,
        background: active ? C.blueL : C.panel,
        borderColor: active ? C.blueB : C.b0,
      }}
    >
      {children}
    </button>
  );
}

function Casilla({ checked, onChange, titulo, detalle }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        textAlign: "left",
        width: "100%",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        padding: 0,
        fontFamily: C.sans,
      }}
    >
      <span
        style={{
          width: 17,
          height: 17,
          borderRadius: 5,
          border: `1.5px solid ${checked ? C.blue : C.b1}`,
          background: checked ? C.blue : "transparent",
          color: "var(--inverse-text)",
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
          marginTop: 1,
        }}
      >
        {checked && <Check size={12} strokeWidth={3} />}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", color: C.t0, fontSize: 12.5, fontWeight: 600 }}>
          {titulo}
        </span>
        {detalle && (
          <span
            style={{ display: "block", color: C.t2, fontSize: 11, marginTop: 2, lineHeight: 1.45 }}
          >
            {detalle}
          </span>
        )}
      </span>
    </button>
  );
}

export default function PedidoCotizacionModal({
  provider,
  providers = [],
  materials = [],
  preselectedIds,
  isMobile,
  toast,
  onClose,
}) {
  const seleccionados = useMemo(
    () => new Set(preselectedIds ? [...preselectedIds] : []),
    [preselectedIds],
  );
  const [destino, setDestino] = useState("uno");
  const [alcance, setAlcance] = useState(seleccionados.size ? "seleccion" : "pendientes");
  const [porVariante, setPorVariante] = useState(true);
  const [mostrarUltimoPrecio, setMostrarUltimoPrecio] = useState(false);
  const [incluirAlternativos, setIncluirAlternativos] = useState(false);
  const [trabajando, setTrabajando] = useState("");
  const fecha = hoyISO();

  const itemsProveedor = useMemo(
    () => itemsDeProveedor(materials, provider, { incluirAlternativos }),
    [materials, provider, incluirAlternativos],
  );

  // Los contadores pasan por el mismo armado que la lista (variantes expandidas
  // y repetidos descartados): si acá dijera 220 y el resumen 217, el número del
  // chip sería mentira.
  const conteos = useMemo(() => {
    const contar = (items) => expandirFilas(items, { porVariante }).filas.length;
    return {
      pendientes: contar(filtrarPorAlcance(itemsProveedor, "pendientes")),
      "sin-precio": contar(filtrarPorAlcance(itemsProveedor, "sin-precio")),
      revisar: contar(filtrarPorAlcance(itemsProveedor, "revisar")),
      todos: contar(itemsProveedor),
      seleccion: contar(
        itemsProveedor.filter((item) => seleccionados.has(item.material.id)),
      ),
    };
  }, [itemsProveedor, seleccionados, porVariante]);

  const opciones = useMemo(
    () => ({ fecha, mostrarUltimoPrecio }),
    [fecha, mostrarUltimoPrecio],
  );

  const armar = (proveedorDelPedido, items) => {
    const { filas, repetidos } = expandirFilas(
      alcance === "seleccion"
        ? items.filter((item) => seleccionados.has(item.material.id))
        : filtrarPorAlcance(items, alcance),
      { porVariante },
    );
    return { proveedor: proveedorDelPedido, filas, opciones, repetidos };
  };

  const pedidoUnico = useMemo(
    () => armar(provider, itemsProveedor),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- armar depende de alcance/porVariante/seleccionados
    [itemsProveedor, provider, opciones, alcance, porVariante, seleccionados],
  );

  const pedidosTodos = useMemo(() => {
    if (destino !== "todos") return [];
    return providers
      .filter((item) => item.activo !== false)
      .map((item) => armar(item, itemsDeProveedor(materials, item, { incluirAlternativos })))
      .filter((pedido) => pedido.filas.length > 0)
      .sort((a, b) => b.filas.length - a.filas.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- idem pedidoUnico
  }, [destino, providers, materials, opciones, alcance, porVariante, seleccionados, incluirAlternativos]);

  const pedidos = destino === "todos" ? pedidosTodos : [pedidoUnico];
  const totalFilas = pedidos.reduce((suma, pedido) => suma + pedido.filas.length, 0);
  const repetidos = pedidos.flatMap((pedido) => pedido.repetidos || []);
  const vacio = totalFilas === 0;
  const unSoloProveedor = destino === "uno";

  async function correr(clave, accion, exito) {
    if (vacio) {
      toast?.error("No hay ítems para pedir con estos filtros.");
      return;
    }
    setTrabajando(clave);
    try {
      const extra = await accion();
      if (exito) toast?.success(typeof exito === "function" ? exito(extra) : exito);
    } catch (reason) {
      toast?.error(reason?.message || "No se pudo generar la lista.");
    } finally {
      setTrabajando("");
    }
  }

  const descargarPdf = () =>
    correr(
      "pdf",
      async () => {
        if (destino === "todos") {
          await descargarPedidosZip(pedidos, { fecha });
          return pedidos.length;
        }
        await descargarPedidoPdf(pedidoUnico);
        return 1;
      },
      (cantidad) =>
        destino === "todos"
          ? `Zip listo: ${cantidad} lista${cantidad === 1 ? "" : "s"} con ${totalFilas} ítems en total.`
          : `Lista de ${totalFilas} ítem${totalFilas === 1 ? "" : "s"} lista para mandar.`,
    );

  const descargarExcel = () =>
    correr(
      "xlsx",
      () => descargarPedidoXlsx(pedidos, { fecha }),
      destino === "todos"
        ? `Excel listo: una hoja por proveedor (${pedidos.length}).`
        : "Excel listo para que lo completen y nos lo devuelvan.",
    );

  const imprimir = () =>
    correr("print", async () => {
      const abrio = await imprimirPedidoPdf(pedidoUnico);
      if (!abrio)
        toast?.info?.("El navegador bloqueó la ventana de impresión: se descargó el PDF.");
    });

  const copiarTexto = () =>
    correr(
      "texto",
      () => navigator.clipboard.writeText(textoPedido(pedidoUnico)),
      "Texto copiado: pegalo en el chat y adjuntá la lista.",
    );

  const abrirWhatsApp = () => {
    const telefono = String(provider?.telefono || "").replace(/\D/g, "");
    const texto = encodeURIComponent(textoPedido(pedidoUnico));
    window.open(
      telefono ? `https://wa.me/${telefono}?text=${texto}` : `https://wa.me/?text=${texto}`,
      "_blank",
      "noopener",
    );
  };

  const abrirMail = () => {
    const asunto = encodeURIComponent(`Precios a completar — Klase A Yachts`);
    const cuerpo = encodeURIComponent(textoPedido(pedidoUnico));
    window.open(`mailto:${provider?.email || ""}?subject=${asunto}&body=${cuerpo}`, "_self");
  };

  const Icono = ({ clave, children }) =>
    trabajando === clave ? <Loader2 size={14} className="precios-spin" /> : children;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lista de precios para el proveedor"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10020,
        padding: isMobile ? 12 : 24,
        display: "grid",
        placeItems: "center",
        background: "var(--overlay-strong)",
        backdropFilter: "blur(5px)",
      }}
    >
      <div
        style={{
          ...surface,
          width: "min(100%, 660px)",
          maxHeight: isMobile ? "94vh" : "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 64px rgba(15,23,42,.24)",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: isMobile ? 15 : 19,
            borderBottom: `1px solid ${C.b0}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              display: "grid",
              placeItems: "center",
              color: C.blue,
              background: C.blueL,
              flexShrink: 0,
            }}
          >
            <ClipboardList size={18} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ color: C.t0, fontSize: 16, fontWeight: 750 }}>
              Lista de precios para el proveedor
            </div>
            <div style={{ color: C.t2, fontSize: 12, marginTop: 3 }}>
              Los ítems con una columna vacía para que complete el precio. Cada renglón
              lleva nuestro código, así el precio vuelve al material correcto.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            style={{ ...button, padding: 7, flexShrink: 0 }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 15 : 19 }}>
          <span style={label}>A quién le pedimos</span>
          <div
            style={{ display: "grid", gap: 7, gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr" }}
          >
            {[
              {
                id: "uno",
                titulo: provider?.nombre || "Este proveedor",
                detalle: "Una lista lista para mandar",
                disabled: !provider,
              },
              {
                id: "todos",
                titulo: "Todos los proveedores",
                detalle: "Una lista por proveedor, en un zip",
                disabled: false,
              },
            ].map((opcion) => {
              const activo = destino === opcion.id;
              return (
                <button
                  type="button"
                  key={opcion.id}
                  disabled={opcion.disabled}
                  onClick={() => setDestino(opcion.id)}
                  style={{
                    textAlign: "left",
                    cursor: opcion.disabled ? "not-allowed" : "pointer",
                    opacity: opcion.disabled ? 0.5 : 1,
                    border: `1px solid ${activo ? C.blueB : C.b0}`,
                    background: activo ? C.blueL : C.panel,
                    borderRadius: 10,
                    padding: "11px 12px",
                    fontFamily: C.sans,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 7,
                      color: activo ? C.blue : C.t0,
                      fontSize: 12.5,
                      fontWeight: 700,
                      minWidth: 0,
                    }}
                  >
                    <Users size={14} style={{ flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {opcion.titulo}
                    </span>
                  </div>
                  <div style={{ color: C.t2, fontSize: 11, marginTop: 4 }}>{opcion.detalle}</div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 17 }}>
            <span style={label}>Qué ítems entran</span>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {seleccionados.size > 0 && (
                <Chip active={alcance === "seleccion"} onClick={() => setAlcance("seleccion")}>
                  Los que marqué
                  <span style={{ fontFamily: C.mono, color: C.t3, fontSize: 11 }}>
                    {unSoloProveedor ? conteos.seleccion : seleccionados.size}
                  </span>
                </Chip>
              )}
              {ALCANCES.map((item) => (
                <Chip
                  key={item.id}
                  active={alcance === item.id}
                  onClick={() => setAlcance(item.id)}
                >
                  {item.label}
                  {unSoloProveedor && (
                    <span style={{ fontFamily: C.mono, color: C.t3, fontSize: 11 }}>
                      {conteos[item.id]}
                    </span>
                  )}
                </Chip>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gap: 11,
              marginTop: 17,
              padding: 13,
              border: `1px solid ${C.b0}`,
              borderRadius: 10,
              background: C.panel,
            }}
          >
            <Casilla
              checked={porVariante}
              onChange={setPorVariante}
              titulo="Un renglón por variante"
              detalle="Las presentaciones (23L, 4L, 1L) no se cotizan al mismo precio."
            />
            <Casilla
              checked={mostrarUltimoPrecio}
              onChange={setMostrarUltimoPrecio}
              titulo="Mostrar el último precio que tenemos"
              detalle="Sirve de referencia, pero le adelanta al proveedor de qué número partimos."
            />
            <Casilla
              checked={incluirAlternativos}
              onChange={setIncluirAlternativos}
              titulo="Incluir lo que le compramos a otro proveedor"
              detalle="Materiales cuyo proveedor principal es otro y este figura como alternativa."
            />
          </div>

          <div
            style={{
              marginTop: 15,
              padding: "11px 13px",
              borderRadius: 10,
              border: `1px solid ${vacio ? C.b0 : C.blueB}`,
              background: vacio ? C.panel2 : C.blueL,
              color: vacio ? C.t2 : C.blue,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {vacio ? (
              "Con estos filtros no queda ningún ítem para pedir."
            ) : destino === "todos" ? (
              <>
                {totalFilas} ítems repartidos en {pedidos.length} proveedor
                {pedidos.length === 1 ? "" : "es"}
              </>
            ) : (
              <>
                {totalFilas} ítem{totalFilas === 1 ? "" : "s"} para{" "}
                {provider?.nombre || "el proveedor"}
              </>
            )}
          </div>

          {/* El catálogo tiene productos cargados dos veces (una migración vieja
              sacó cada variante a material propio y al padre le dejó el array
              de variantes). No se le manda el mismo renglón dos veces, y se
              avisa acá para que se pueda limpiar el catálogo aparte. */}
          {repetidos.length > 0 && (
            <div
              style={{
                marginTop: 9,
                padding: "10px 13px",
                borderRadius: 10,
                border: `1px solid ${C.b0}`,
                background: C.panel,
                color: C.t2,
                fontSize: 11.5,
                lineHeight: 1.5,
              }}
              title={repetidos.slice(0, 25).join("\n")}
            >
              <strong style={{ color: C.t1 }}>
                {repetidos.length}{" "}
                {repetidos.length === 1 ? "renglón repetido" : "renglones repetidos"}
              </strong>{" "}
              no {repetidos.length === 1 ? "entra" : "entran"} en la lista: son productos
              que están cargados dos veces en el catálogo. Pasá el mouse para verlos.
            </div>
          )}

          {unSoloProveedor && !vacio && (
            <div style={{ marginTop: 15 }}>
              <span style={label}>Avisarle (el archivo se adjunta a mano)</span>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                <button type="button" onClick={copiarTexto} disabled={!!trabajando} style={button}>
                  <Icono clave="texto">
                    <Copy size={14} />
                  </Icono>{" "}
                  Copiar texto
                </button>
                <button type="button" onClick={abrirWhatsApp} style={button}>
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <button
                  type="button"
                  onClick={abrirMail}
                  disabled={!provider?.email}
                  title={provider?.email || "El proveedor no tiene mail cargado"}
                  style={{ ...button, opacity: provider?.email ? 1 : 0.5 }}
                >
                  <Mail size={14} /> Mail
                </button>
              </div>
            </div>
          )}

          <div style={{ color: C.t3, fontSize: 11, marginTop: 15, lineHeight: 1.5 }}>
            Cuando te la devuelvan completa, cargala con <strong>Cargar remito o factura</strong>:
            la IA lee los precios y los deja en la bandeja para aplicar.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: isMobile ? 13 : 15,
            borderTop: `1px solid ${C.b0}`,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={onClose} style={button}>
            Cancelar
          </button>
          {unSoloProveedor && (
            <button
              type="button"
              onClick={imprimir}
              disabled={vacio || !!trabajando}
              style={{ ...button, opacity: vacio ? 0.5 : 1 }}
            >
              <Icono clave="print">
                <Printer size={14} />
              </Icono>{" "}
              Imprimir
            </button>
          )}
          <button
            type="button"
            onClick={descargarExcel}
            disabled={vacio || !!trabajando}
            style={{ ...button, opacity: vacio ? 0.5 : 1 }}
          >
            <Icono clave="xlsx">
              <FileSpreadsheet size={14} />
            </Icono>{" "}
            Excel
          </button>
          <button
            type="button"
            onClick={descargarPdf}
            disabled={vacio || !!trabajando}
            style={{ ...primary, opacity: vacio ? 0.55 : 1 }}
          >
            <Icono clave="pdf">
              <Download size={14} />
            </Icono>{" "}
            {destino === "todos" ? "Descargar zip" : "Descargar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
