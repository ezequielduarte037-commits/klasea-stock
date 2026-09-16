import { useEffect, useRef } from "react";
import { aRgb, ajustarCanvas, colorDelTema, dibujarOleaje, movimientoReducido } from "./efectosLogin";

// Fondo animado del login. Con "reducir movimiento" dibuja un solo cuadro
// quieto y sólo lo repinta si cambia el tamaño.
export default function FondoOleaje({ horizonte = 0.6 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return undefined;

    const quieto = movimientoReducido();
    const claro = document.documentElement.dataset.theme === "light";
    const linea = aRgb(ctx, colorDelTema("--blue", "#7eb3ff"));
    const reflejo = aRgb(ctx, colorDelTema("--cyan", "#67e8f9"));
    const inicio = performance.now();
    // El mouse corre apenas el agua: se siente viva sin distraer del formulario.
    const paralaje = { x: 0, y: 0, haciaX: 0, haciaY: 0 };
    let medida = ajustarCanvas(canvas, ctx);
    let cuadroId = 0;

    function pintar(ahora) {
      paralaje.x += (paralaje.haciaX - paralaje.x) * 0.045;
      paralaje.y += (paralaje.haciaY - paralaje.y) * 0.045;
      ctx.clearRect(0, 0, medida.ancho, medida.alto);
      dibujarOleaje(ctx, {
        ancho: medida.ancho,
        alto: medida.alto,
        t: quieto ? 14 : (ahora - inicio) / 1000,
        linea,
        reflejo,
        horizonte,
        alfa: claro ? 0.42 : 0.55,
        dx: paralaje.x,
        dy: paralaje.y,
      });
    }

    function bucle(ahora) {
      pintar(ahora);
      cuadroId = window.requestAnimationFrame(bucle);
    }

    function redimensionar() {
      medida = ajustarCanvas(canvas, ctx);
      if (quieto) pintar(inicio);
    }

    function seguirMouse(e) {
      paralaje.haciaX = (e.clientX / window.innerWidth - 0.5) * -40;
      paralaje.haciaY = (e.clientY / window.innerHeight - 0.5) * -16;
    }

    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(redimensionar) : null;
    if (observador) observador.observe(canvas);
    else window.addEventListener("resize", redimensionar);

    if (quieto) {
      pintar(inicio);
    } else {
      window.addEventListener("mousemove", seguirMouse);
      cuadroId = window.requestAnimationFrame(bucle);
    }

    return () => {
      window.cancelAnimationFrame(cuadroId);
      if (observador) observador.disconnect();
      else window.removeEventListener("resize", redimensionar);
      window.removeEventListener("mousemove", seguirMouse);
    };
  }, [horizonte]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none" }}
    />
  );
}
