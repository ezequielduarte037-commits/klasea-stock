import { useEffect } from "react";

/* Guardado local del manual. Todo lo que el cliente anota (datos de la
   unidad, listas, bitácora) queda en este dispositivo. */
export function leerLocal(k, fallback = "") {
  try { return localStorage.getItem("ka_" + k) ?? fallback; } catch { return fallback; }
}
export function guardarLocal(k, v) {
  try { localStorage.setItem("ka_" + k, v); } catch { /* modo privado: no se guarda */ }
}
export function leerJson(clave, fallback) {
  try { const s = localStorage.getItem(clave); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
}
export function guardarJson(clave, v) {
  try { localStorage.setItem(clave, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
}

/* Bloquea el scroll de la página mientras hay una capa abierta. */
export function useBloquearScroll(activo) {
  useEffect(() => {
    if (!activo) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [activo]);
}
