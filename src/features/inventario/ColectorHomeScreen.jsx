import { useNavigate } from "react-router-dom";
import { C } from "@/theme";

/**
 * ColectorHomeScreen — pantalla de arranque del colector. Ruta: /colector
 *
 * Antes el rol `panol` en pantalla chica caía directo en el egreso de maderas,
 * sin poder elegir. Ahora arranca acá y decide qué va a hacer.
 *
 * Diseñada para el aparato: dos targets enormes, sin nada más que distraiga, y
 * layout simple (el colector corre un Chrome viejo, ver ScanEgresoScreen).
 */

const opciones = [
  {
    to: "/scan",
    titulo: "Egresar maderas",
    detalle: "Escanear material que sale del pañol",
    icono: "📤",
    color: C.blue,
    fondo: "rgba(59,130,246,0.14)",
  },
  {
    to: "/scan-pedido",
    titulo: "Pedir a compras",
    detalle: "Avisar lo que se está acabando",
    icono: "🛒",
    color: C.green,
    fondo: "rgba(16,185,129,0.14)",
  },
];

export default function ColectorHomeScreen({ profile, signOut }) {
  const nav = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.sans, padding: 14, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 950 }}>Pañol</div>
          <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
            {profile?.username ? `Hola, ${profile.username}` : "¿Qué vas a hacer?"}
          </div>
        </div>
        <button
          onClick={signOut}
          style={{ background: "transparent", color: C.dim, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 11px", fontSize: 11.5 }}
        >
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
            background: op.fondo, border: `1px solid ${op.color}`, borderRadius: 14,
            padding: "22px 18px", marginBottom: 14, color: C.text, fontFamily: C.sans,
          }}
        >
          <div style={{ fontSize: 34, marginBottom: 8, lineHeight: 1 }}>{op.icono}</div>
          <div style={{ fontSize: 19, fontWeight: 900, color: op.color }}>{op.titulo}</div>
          <div style={{ fontSize: 13, color: C.dim, marginTop: 4 }}>{op.detalle}</div>
        </button>
      ))}

      <div style={{ textAlign: "center", color: C.dim, fontSize: 11.5, marginTop: 22 }}>
        Podés cambiar de pantalla en cualquier momento desde los botones de arriba.
      </div>
    </div>
  );
}
