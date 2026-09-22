import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";
import {
  agruparOrdenPorProveedor,
  buildOrdenProveedorTexto,
} from "@/features/materiales/proveedorPedido";
import { C } from "@/theme";

async function copiar(texto) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(texto);
    return;
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.focus();
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
}

/**
 * Copia la orden de compra en el formato que se le manda al proveedor.
 *
 * El texto interno del pedido sigue existiendo aparte: acá sale sólo qué y
 * cuánto, porque es lo único que el proveedor puede leer sin que Compras tenga
 * que reescribir el mensaje.
 *
 * Con más de un proveedor abre un menú: mandarle a una casa los renglones de
 * otra es justo lo que hay que evitar.
 */
export default function CopiarOcProveedor({
  lineas = [],
  necesarioPara = null,
  label = "Copiar OC",
  title = "Copiar la orden en formato para mandarle al proveedor",
  style = null,
  iconSize = 13,
  disabled = false,
}) {
  const [copiado, setCopiado] = useState(false);
  const [menu, setMenu] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const grupos = useMemo(() => agruparOrdenPorProveedor(lineas), [lineas]);
  const vacio = !grupos.length;

  useEffect(() => {
    if (!menu) return undefined;
    function fuera(event) {
      const enBoton = btnRef.current?.contains(event.target);
      const enMenu = menuRef.current?.contains(event.target);
      if (!enBoton && !enMenu) setMenu(null);
    }
    function esc(event) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", fuera);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  async function copiarGrupos(seleccion) {
    const texto = buildOrdenProveedorTexto({ grupos: seleccion, necesarioPara });
    if (!texto) return;
    await copiar(texto);
    setMenu(null);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 1600);
  }

  function abrir() {
    if (vacio || disabled) return;
    if (grupos.length === 1) {
      void copiarGrupos(grupos);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const ancho = Math.min(280, window.innerWidth - 24);
    setMenu({
      left: Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12)),
      top: r.bottom + 6,
      ancho,
    });
  }

  const botonStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    padding: "4px 9px",
    borderRadius: 6,
    cursor: vacio || disabled ? "default" : "pointer",
    opacity: vacio || disabled ? 0.5 : 1,
    fontSize: 11,
    border: `1px solid ${C.border}`,
    background: C.panel,
    color: C.muted,
    fontFamily: C.sans,
    fontWeight: 650,
    ...(style || {}),
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={abrir}
        disabled={vacio || disabled}
        title={title}
        style={botonStyle}
      >
        {copiado ? <Check size={iconSize} /> : <Copy size={iconSize} />}
        {copiado ? "Copiado" : label}
      </button>

      {menu && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: "fixed",
            left: menu.left,
            top: menu.top,
            width: menu.ancho,
            zIndex: 9000,
            background: C.panelSolid,
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            boxShadow: "0 16px 40px var(--shadow-strong)",
            padding: 6,
            fontFamily: C.sans,
          }}
        >
          <div style={{ padding: "6px 8px 8px", color: C.dim, fontSize: 10.5, fontWeight: 850, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Copiar para
          </div>
          {grupos.map((grupo) => (
            <button
              key={grupo.proveedor || "__sin__"}
              type="button"
              role="menuitem"
              onClick={() => copiarGrupos([grupo])}
              style={{
                width: "100%",
                minHeight: 38,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "8px 9px",
                borderRadius: 7,
                border: "none",
                background: "transparent",
                color: C.text,
                cursor: "pointer",
                fontSize: 12.5,
                fontWeight: 700,
                fontFamily: C.sans,
                textAlign: "left",
              }}
            >
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {grupo.proveedor || "Sin proveedor asignado"}
              </span>
              <span style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{grupo.lineas.length}</span>
            </button>
          ))}
          <div style={{ height: 1, background: C.border, margin: "6px 4px" }} />
          <button
            type="button"
            role="menuitem"
            onClick={() => copiarGrupos(grupos)}
            style={{
              width: "100%",
              minHeight: 38,
              padding: "8px 9px",
              borderRadius: 7,
              border: "none",
              background: "transparent",
              color: C.blue,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 800,
              fontFamily: C.sans,
              textAlign: "left",
            }}
          >
            Todo junto ({grupos.length} proveedores)
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
