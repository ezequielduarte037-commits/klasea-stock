import { useEffect, useRef } from "react";
import { supabase } from "@/supabaseClient";

// Suscripción realtime que NO recarga de gratis.
//
// El patrón que había repetido por toda la app era `.on("postgres_changes", …, cargar)`:
// cada cambio de cualquier fila disparaba la carga completa de la pantalla, en cada
// usuario que la tuviera abierta. En tablas con movimiento (obra_tareas, movimientos)
// eso multiplica el egress por la cantidad de gente conectada y por cambio, aunque
// nadie esté mirando la pestaña. Fue la causa principal de irnos al 190% de la cuota.
//
// Este hook agrega dos defensas que sirven en todos los casos:
//   1. Debounce: una ráfaga de eventos (INSERT padre + N hijos) = una sola recarga.
//   2. Gate de visibilidad: si la pestaña está en segundo plano no se recarga nada;
//      queda pendiente y se refresca recién cuando el usuario vuelve.
//
// Uso:
//   useRealtimeReload("rt-movs", ["movimientos"], cargar);
//
// Para tablas muy pesadas conviene además aplicar el cambio en memoria desde el
// payload del evento (costo de red cero) y usar esto sólo como fallback.
export default function useRealtimeReload(channelName, tables, reload, { delay = 350 } = {}) {
  // El callback suele redefinirse en cada render; con un ref evitamos resuscribirnos
  // (cada resuscripción es un ciclo de conexión más en el servidor).
  const reloadRef = useRef(reload);
  useEffect(() => { reloadRef.current = reload; }, [reload]);

  const tablesKey = Array.isArray(tables) ? tables.join(",") : String(tables || "");

  useEffect(() => {
    const lista = tablesKey.split(",").map((t) => t.trim()).filter(Boolean);
    if (!lista.length) return undefined;

    let timer = null;
    let pendiente = false;

    const disparar = () => {
      clearTimeout(timer);
      timer = setTimeout(() => reloadRef.current?.(), delay);
    };
    const alCambiar = () => {
      if (document.hidden) { pendiente = true; return; }
      disparar();
    };
    const alVolver = () => {
      if (document.hidden || !pendiente) return;
      pendiente = false;
      disparar();
    };
    document.addEventListener("visibilitychange", alVolver);

    let ch = supabase.channel(channelName);
    for (const table of lista) {
      ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, alCambiar);
    }
    ch.subscribe();

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", alVolver);
      supabase.removeChannel(ch);
    };
  }, [channelName, tablesKey, delay]);
}
