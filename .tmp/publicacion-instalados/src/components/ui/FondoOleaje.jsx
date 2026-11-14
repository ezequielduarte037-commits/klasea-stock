import { useEffect, useRef } from "react";
import { aRgb, ajustarCanvas, colorDelTema, dibujarOleaje } from "@/lib/oleaje";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";

// El oleaje animado de la marca (login, Home).
//
// Con "reducir movimiento" dibuja un solo cuadro quieto y sólo lo repinta si
// cambia el tamaño.
//
// pausaInactivo (ms): en pantallas que quedan abiertas todo el día, como el
// Home, deja de animar cuando nadie toca la compu durante ese tiempo y vuelve
// con el primer movimiento. Así un fondo decorativo no tiene a la PC
// trabajando las ocho horas.
export default function FondoOleaje({ horizonte = 0.6, alfa, filas, pausaInactivo = 0, className, style }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas && canvas.getContext ? canvas.getContext("2d") : null;
    if (!ctx) return undefined;

    const quieto = leerMovimientoReducido();
    const claro = document.documentElement.dataset.theme === "light";
    const linea = aRgb(ctx, colorDelTema("--blue", "#7eb3ff"));
    const reflejo = aRgb(ctx, colorDelTema("--cyan", "#67e8f9"));
    const inicio = performance.now();
    // El mouse corre apenas el agua: se siente viva sin distraer del contenido.
    const paralaje = { x: 0, y: 0, haciaX: 0, haciaY: 0 };
    let medida = ajustarCanvas(canvas, ctx);
    let cuadroId = 0;
    let ultimaActividad = inicio;
    // Tiempo que estuvo en pausa (acumulado) y desde cuándo está pausado ahora.
    let desfase = 0;
    let pausadoEn = 0;

    function pintar(ahora) {
      paralaje.x += (paralaje.haciaX - paralaje.x) * 0.045;
      paralaje.y += (paralaje.haciaY - paralaje.y) * 0.045;
      const enPausa = pausadoEn ? ahora - pausadoEn : 0;
      ctx.clearRect(0, 0, medida.ancho, medida.alto);
      dibujarOleaje(ctx, {
        ancho: medida.ancho,
        alto: medida.alto,
        t: quieto ? 14 : (ahora - inicio - desfase - enPausa) / 1000,
        linea,
        reflejo,
        horizonte,
        filas,
        alfa: alfa ?? (claro ? 0.42 : 0.55),
        dx: paralaje.x,
        dy: paralaje.y,
      });
    }

    function bucle(ahora) {
      if (pausaInactivo && ahora - ultimaActividad > pausaInactivo) {
        // Se congela en el último cuadro; al volver retoma desde ahí y no salta.
        cuadroId = 0;
        pausadoEn = ahora;
        return;
      }
      pintar(ahora);
      cuadroId = window.requestAnimationFrame(bucle);
    }

    function despertar() {
      const ahora = performance.now();
      ultimaActividad = ahora;
      if (quieto || cuadroId) return;
      if (pausadoEn) {
        desfase += ahora - pausadoEn;
        pausadoEn = 0;
      }
      cuadroId = window.requestAnimationFrame(bucle);
    }

    function redimensionar() {
      medida = ajustarCanvas(canvas, ctx);
      if (quieto || !cuadroId) pintar(performance.now());
    }

    function seguirMouse(e) {
      paralaje.haciaX = (e.clientX / window.innerWidth - 0.5) * -40;
      paralaje.haciaY = (e.clientY / window.innerHeight - 0.5) * -16;
      despertar();
    }

    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(redimensionar) : null;
    if (observador) observador.observe(canvas);
    else window.addEventListener("resize", redimensionar);

    if (quieto) {
      pintar(inicio);
    } else {
      window.addEventListener("mousemove", seguirMouse);
      if (pausaInactivo) {
        window.addEventListener("keydown", despertar);
        window.addEventListener("touchstart", despertar, { passive: true });
        window.addEventListener("wheel", despertar, { passive: true });
      }
      cuadroId = window.requestAnimationFrame(bucle);
    }

    return () => {
      window.cancelAnimationFrame(cuadroId);
      if (observador) observador.disconnect();
      else window.removeEventListener("resize", redimensionar);
      window.removeEventListener("mousemove", seguirMouse);
      window.removeEventListener("keydown", despertar);
      window.removeEventListener("touchstart", despertar);
      window.removeEventListener("wheel", despertar);
    };
  }, [horizonte, alfa, filas, pausaInactivo]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "block", pointerEvents: "none", ...style }}
    />
  );
}
