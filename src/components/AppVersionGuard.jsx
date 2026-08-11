import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { C } from "@/theme";

// Aviso de versión nueva.
//
// El problema real: el navegador se queda con el index.html y los assets viejos
// en memoria. Cerrar la pestaña no siempre alcanza —la sesión de la pestaña se
// va, el caché no— así que alguien puede seguir viendo "Calendario" días después
// de que la pantalla pasó a llamarse "Logística", sin ninguna señal de que está
// mirando algo viejo.
//
// El build escribe dist/version.json con el SHA del commit (lo pone Vercel). Acá
// se compara ese archivo contra el que se cargó al abrir la app: si cambió, hubo
// un deploy nuevo mientras la pestaña estaba abierta.
//
// NO recarga solo: alguien puede estar a mitad de un egreso o de un formulario
// largo, y perderlo por una actualización es peor que ver la versión vieja un
// rato más. El cartel se queda hasta que la persona decide.
const VERSION_URL = "/version.json";
const CHECK_EVERY_MS = 3 * 60 * 1000;

async function fetchBuildId() {
  const res = await fetch(`${VERSION_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "Cache-Control": "no-cache" },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.buildId ? String(data.buildId) : null;
}

export default function AppVersionGuard() {
  const [hayNueva, setHayNueva] = useState(false);
  const [oculto, setOculto] = useState(false);
  const buildIdInicial = useRef(null);

  const revisar = useCallback(async () => {
    try {
      const nuevo = await fetchBuildId();
      if (!nuevo) return;
      if (!buildIdInicial.current) {
        buildIdInicial.current = nuevo;
        return;
      }
      if (nuevo !== buildIdInicial.current) setHayNueva(true);
    } catch {
      // Sin internet, o Vercel todavía sirviendo el deploy anterior: no se avisa
      // nada. Un falso positivo acá entrena a la gente a ignorar el cartel.
    }
  }, []);

  useEffect(() => {
    // Restos de un service worker viejo: si quedó uno registrado, sirve los
    // assets desde su propio caché y ningún header de Vercel lo va a corregir.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations?.()
        .then((regs) => regs.forEach((reg) => reg.unregister()))
        .catch(() => {});
    }

    // La primera lectura va diferida y no en el cuerpo del efecto: arrancar la
    // app no es el momento de pelear ancho de banda con las pantallas que están
    // cargando datos, y además evita el setState sincrónico que el compilador
    // de React marca como error.
    const primera = window.setTimeout(revisar, 4000);
    const intervalo = window.setInterval(revisar, CHECK_EVERY_MS);

    // Volver a la pestaña es el momento con más chance de haberse perdido un
    // deploy, y es cuando la gente arranca a trabajar de nuevo.
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      setOculto(false);
      revisar();
    };
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", revisar);

    return () => {
      window.clearTimeout(primera);
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", revisar);
    };
  }, [revisar]);

  if (!hayNueva || oculto) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 4000,
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "calc(100vw - 24px)",
        padding: "10px 12px 10px 14px",
        borderRadius: 12,
        border: `1px solid ${C.blueB}`,
        background: C.panelSolid,
        boxShadow: "0 18px 44px -22px rgba(15,23,42,0.55)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        fontFamily: C.sans,
        animation: "klaseaUpd .32s cubic-bezier(.16,1,.3,1)",
      }}
    >
      <style>{"@keyframes klaseaUpd{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}"}</style>
      <span style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
        <RefreshCw size={15} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: C.text, fontSize: 12.5, fontWeight: 900, lineHeight: 1.2 }}>
          Hay una versión nueva
        </div>
        <div style={{ color: C.dim, fontSize: 11, lineHeight: 1.35, marginTop: 2 }}>
          Estás viendo una versión vieja de la app. Actualizá para ver los cambios.
        </div>
      </div>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6,
          border: `1px solid ${C.blueB}`, background: C.blueL, color: C.blue,
          borderRadius: 9, padding: "8px 12px", cursor: "pointer",
          fontSize: 12, fontWeight: 950, fontFamily: C.sans, whiteSpace: "nowrap",
        }}
      >
        <RefreshCw size={13} /> Actualizar
      </button>
      {/* Se puede posponer, no descartar para siempre: al volver a la pestaña
          vuelve a aparecer. Alguien en medio de una carga larga necesita
          terminarla, pero no conviene que se olvide. */}
      <button
        type="button"
        onClick={() => setOculto(true)}
        title="Ahora no"
        aria-label="Ahora no"
        style={{ flexShrink: 0, border: "none", background: "transparent", color: C.dim, cursor: "pointer", display: "grid", placeItems: "center", padding: 4 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
