import { useEffect, useState } from "react";

/* ═══════════════════════════════════════════════════════════════════
   useReducedMotion()

   true si la persona pidió "reducir movimiento" en su sistema o si el
   pañol activó el modo liviano en ese equipo. Cualquier animación hecha
   con JavaScript (requestAnimationFrame, canvas) tiene que consultarlo:
   la capa global de index.css sólo alcanza a las animaciones CSS.
   ═══════════════════════════════════════════════════════════════════ */

export function leerMovimientoReducido() {
  if (typeof window === "undefined") return false;
  try {
    return document.documentElement.dataset.lowPerformance === "true"
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function useReducedMotion() {
  const [reducido, setReducido] = useState(leerMovimientoReducido);

  useEffect(() => {
    const actualizar = () => setReducido(leerMovimientoReducido());
    let consulta = null;
    try {
      consulta = window.matchMedia("(prefers-reduced-motion: reduce)");
      consulta.addEventListener?.("change", actualizar);
    } catch {
      consulta = null;
    }
    // El modo liviano se prende y se apaga desde el menú, sin recargar.
    const observador = typeof MutationObserver === "function" ? new MutationObserver(actualizar) : null;
    observador?.observe(document.documentElement, { attributes: true, attributeFilter: ["data-low-performance"] });
    return () => {
      consulta?.removeEventListener?.("change", actualizar);
      observador?.disconnect();
    };
  }, []);

  return reducido;
}
