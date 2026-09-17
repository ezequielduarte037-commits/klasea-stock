import { useNavigate } from "react-router-dom";
import { LogOut, PackageMinus, ShoppingCart } from "lucide-react";
import { C } from "@/theme";
import { esDispositivoTactil, usarPanelCompleto } from "@/lib/modoColector";

/**
 * ColectorHomeScreen — pantalla de arranque del colector. Ruta: /colector
 *
 * Antes el rol `panol` en pantalla chica caía directo en el egreso de maderas,
 * sin poder elegir. Ahora arranca acá y decide qué va a hacer.
 *
 * Diseñada para el aparato: dos targets enormes, sin nada más que distraiga, y
 * layout simple (el colector corre un Chrome viejo, ver ScanEgresoScreen).
 */

// Los emojis del sistema no son iguales en la PDA que en un celular nuevo (en
// el Android viejo del colector salían en blanco y negro o como recuadro), así
// que van los mismos íconos que el resto de la app.
const opciones = [
  {
    to: "/scan",
    titulo: "Egresar maderas",
    detalle: "Escanear material que sale del pañol",
    Icono: PackageMinus,
    color: C.blue,
    fondo: C.blueL,
    borde: C.blueB,
  },
  {
    to: "/scan-pedido",
    titulo: "Pedir a compras",
    detalle: "Avisar lo que se está acabando",
    Icono: ShoppingCart,
    color: C.green,
    fondo: C.greenL,
    borde: C.greenB,
  },
];

export default function ColectorHomeScreen({ profile, signOut }) {
  const nav = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, padding: 14, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 750 }}>Pañol</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {profile?.username ? `Hola, ${profile.username}` : "¿Qué vas a hacer?"}
          </div>
        </div>
        <button
          onClick={signOut}
          style={{
            display: "inline-block", minHeight: 40, background: "transparent", color: C.dim,
            border: `1px solid ${C.border}`, borderRadius: 10, padding: "0 13px",
            fontFamily: C.sans, fontSize: 12.5, fontWeight: 600,
          }}
        >
          <LogOut size={14} style={{ verticalAlign: -3, marginRight: 6 }} />
          Salir
        </button>
      </div>

      {opciones.map((op) => (
        <button
          key={op.to}
          type="button"
          onClick={() => nav(op.to)}
          style={{
            display: "block", width: "100%", textAlign: "left", boxSizing: "border-box",
            background: op.fondo, border: `1px solid ${op.borde}`, borderRadius: 14,
            padding: "20px 18px", marginBottom: 14, color: C.text, fontFamily: C.sans,
          }}
        >
          {/* Sin gap ni flex: el Chrome de la PDA no soporta gap en flex. */}
          <div style={{
            width: 46, height: 46, marginBottom: 10, borderRadius: 13,
            display: "grid", placeItems: "center",
            border: `1px solid ${op.borde}`, background: C.panelSolid, color: op.color,
          }}>
            <op.Icono size={24} />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, color: op.color }}>{op.titulo}</div>
          <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{op.detalle}</div>
        </button>
      ))}

      {/* Antes acá decía "Podés cambiar de pantalla desde los botones de arriba",
          pero en este modo no hay menú ni botones: quien caía acá desde una
          computadora quedaba atrapado con dos opciones. En el PDA y en los
          celulares este menú es lo que corresponde y no se ofrece salida, para
          que nadie lo pierda con un toque sin querer. */}
      {!esDispositivoTactil() && (
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
          <div style={{ fontSize: 12.5, color: C.dim, marginBottom: 10, lineHeight: 1.45 }}>
            Este es el menú del colector de mano. En una computadora tenés el panel completo de pañol.
          </div>
          <button
            type="button"
            onClick={usarPanelCompleto}
            style={{
              background: C.blue, color: "var(--inverse-text)", border: 0, borderRadius: 10,
              padding: "12px 18px", fontSize: 14, fontWeight: 600, fontFamily: C.sans, cursor: "pointer",
            }}
          >
            Ir al panel completo de pañol
          </button>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 8 }}>
            Esta computadora lo va a recordar.
          </div>
        </div>
      )}
    </div>
  );
}
