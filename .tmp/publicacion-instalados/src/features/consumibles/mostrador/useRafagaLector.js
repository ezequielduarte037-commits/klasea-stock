import { useCallback, useLayoutEffect, useRef } from "react";
import { separarRafaga } from "./mostradorLogica";
import { consumirRafaga } from "./operacionesMostrador";

/**
 * Reconoce el lector de códigos dentro de cualquier campo de texto.
 *
 * El lector es un teclado: escribe donde esté el foco. Si el pañolero estaba
 * anotando quién autoriza o pesando tornillos y pasa el próximo producto, el
 * código cae adentro de ese campo. Midiendo el tiempo entre teclas se separa
 * la ráfaga del lector de lo que escribió la persona: en el Enter, la ráfaga
 * se saca del campo y se procesa como escaneo.
 *
 * onRafaga(codigo, previo) — `previo` es lo que había antes de la ráfaga, para
 * dejar el campo como estaba. onEnter(evento, valor) — un Enter normal.
 */
export default function useRafagaLector({ onRafaga, onEnter } = {}) {
  const teclasRef = useRef([]);
  const previoRef = useRef(null);
  const handlersRef = useRef({ onRafaga, onEnter });
  useLayoutEffect(() => {
    handlersRef.current = { onRafaga, onEnter };
  }, [onRafaga, onEnter]);

  const reiniciar = useCallback(() => { teclasRef.current = []; previoRef.current = null; }, []);

  /** Para las teclas que llegan desde afuera del campo (redirigidas al foco). */
  const registrar = useCallback((k, valor = "") => {
    const t = performance.now();
    const ultima = teclasRef.current[teclasRef.current.length - 1];
    // Se captura ANTES de que onChange filtre letras o ceros. El escaneo manda
    // por sus teclas crudas y nunca se convierte en piezas del producto previo.
    if (!ultima || t - ultima.t > 50) previoRef.current = String(valor);
    teclasRef.current = [...teclasRef.current, { k, t }].slice(-64);
  }, []);

  const onKeyDown = useCallback((e) => {
    if (e.key === "Enter" || e.key === "Tab") {
      const valor = String(e.currentTarget?.value ?? "");
      const rafaga = consumirRafaga(teclasRef.current, valor, previoRef.current, separarRafaga);
      reiniciar();
      if (rafaga && handlersRef.current.onRafaga) {
        e.preventDefault();
        e.stopPropagation();
        handlersRef.current.onRafaga(rafaga.codigo, rafaga.previo);
        return;
      }
      if (e.key === "Enter") handlersRef.current.onEnter?.(e, valor);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      registrar(e.key, e.currentTarget?.value);
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "Escape") {
      reiniciar();
    }
  }, [registrar, reiniciar]);

  return { onKeyDown, onPaste: reiniciar, registrar, reiniciar };
}
