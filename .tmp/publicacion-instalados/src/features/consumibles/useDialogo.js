import { useEffect, useLayoutEffect, useRef } from "react";

/** Conserva el foco dentro de la hoja y lo devuelve al control que la abrió. */
export default function useDialogo(ref, onCerrar, abierto = true) {
  const cerrar = useRef(onCerrar);
  useLayoutEffect(() => { cerrar.current = onCerrar; }, [onCerrar]);
  useEffect(() => {
    const panel = ref.current;
    if (!abierto || !panel) return undefined;
    const anterior = document.activeElement;
    const controles = () => [...panel.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')]
      .filter((el) => !el.closest('[inert], fieldset:disabled') && el.getClientRects().length);
    if (!panel.contains(document.activeElement)) (controles()[0] ?? panel).focus({ preventScroll: true });
    const teclado = (e) => {
      // Una confirmación puede abrirse sobre esta hoja: responde solamente la última.
      const hojas = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter((el) => el.getClientRects().length);
      if (hojas.at(-1) !== panel || e.defaultPrevented) return;
      if (e.key === "Escape") { e.preventDefault(); cerrar.current?.(); }
      if (e.key !== "Tab") return;
      const items = controles();
      const primero = items[0] ?? panel;
      const ultimo = items.at(-1) ?? panel;
      if (!panel.contains(document.activeElement) || document.activeElement === panel || (e.shiftKey ? document.activeElement === primero : document.activeElement === ultimo)) {
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
      }
    };
    document.addEventListener("keydown", teclado);
    return () => {
      document.removeEventListener("keydown", teclado);
      if (anterior?.isConnected) anterior.focus({ preventScroll: true });
    };
  }, [ref, abierto]);
}
