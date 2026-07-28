import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { C } from "@/theme";

const MARGEN = 10;
const PADDING_SPOT = 6;
const TOOLTIP_ALTO_ESTIMADO = 230;

function rectVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

export default function Tour({
  tour,
  pasoIndex,
  onAnterior,
  onSiguiente,
  onCerrar,
}) {
  const paso = tour.pasos[pasoIndex];
  const [rect, setRect] = useState(null);
  const [targetFaltante, setTargetFaltante] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelado = false;
    let timer = null;
    let intentos = 0;

    function ubicar() {
      if (cancelado) return;
      const elemento = document.querySelector(paso.target);
      const siguienteRect = elemento ? rectVisible(elemento) : null;
      if (!siguienteRect) {
        intentos += 1;
        if (intentos < 10) {
          timer = window.setTimeout(ubicar, 160);
          return;
        }
        if (import.meta.env.DEV) console.warn(`[tour] Target ausente: ${paso.target}`);
        setRect(null);
        setTargetFaltante(true);
        return;
      }

      setTargetFaltante(false);
      elemento.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
      window.requestAnimationFrame(() => {
        if (!cancelado) setRect(rectVisible(elemento));
      });
    }

    function preparar(clickIndex = 0, clickIntento = 0) {
      if (cancelado) return;
      const clicks = paso.prepararClicks || [];
      if (clickIndex >= clicks.length) {
        timer = window.setTimeout(ubicar, 80);
        return;
      }
      const elemento = document.querySelector(clicks[clickIndex]);
      if (!elemento && clickIntento < 5) {
        timer = window.setTimeout(() => preparar(clickIndex, clickIntento + 1), 120);
        return;
      }
      elemento?.click();
      timer = window.setTimeout(() => preparar(clickIndex + 1, 0), 140);
    }

    timer = window.setTimeout(() => {
      setRect(null);
      setTargetFaltante(false);
      preparar();
    }, 30);
    return () => {
      cancelado = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [paso.prepararClicks, paso.target, retryToken]);

  useEffect(() => {
    function actualizar() {
      const elemento = document.querySelector(paso.target);
      const siguienteRect = elemento ? rectVisible(elemento) : null;
      if (siguienteRect) setRect(siguienteRect);
    }
    function teclado(event) {
      if (event.key === "Escape") onCerrar();
      if (event.key === "ArrowRight") onSiguiente();
      if (event.key === "ArrowLeft" && pasoIndex > 0) onAnterior();
    }
    window.addEventListener("resize", actualizar);
    window.addEventListener("scroll", actualizar, true);
    window.addEventListener("keydown", teclado);
    return () => {
      window.removeEventListener("resize", actualizar);
      window.removeEventListener("scroll", actualizar, true);
      window.removeEventListener("keydown", teclado);
    };
  }, [onAnterior, onCerrar, onSiguiente, paso.target, pasoIndex]);

  const reducido = useMemo(() => (
    document.documentElement.dataset.lowPerformance === "true"
    || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ), []);

  if (!rect && !targetFaltante) return null;

  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const foco = rect ? {
    left: Math.max(0, rect.left - PADDING_SPOT),
    top: Math.max(0, rect.top - PADDING_SPOT),
    right: Math.min(ancho, rect.right + PADDING_SPOT),
    bottom: Math.min(alto, rect.bottom + PADDING_SPOT),
  } : null;
  if (foco) {
    foco.width = foco.right - foco.left;
    foco.height = foco.bottom - foco.top;
  }

  const vaAbajo = foco ? alto - foco.bottom >= TOOLTIP_ALTO_ESTIMADO || foco.top < TOOLTIP_ALTO_ESTIMADO : false;
  const tooltipTop = foco ? (vaAbajo ? foco.bottom + MARGEN : foco.top - MARGEN) : "50%";
  const tooltipLeft = foco ? Math.max(12, Math.min(foco.left, ancho - Math.min(360, ancho - 24) - 12)) : "50%";
  const ultimo = pasoIndex === tour.pasos.length - 1;
  const overlay = "rgba(6,10,20,.70)";
  const capa = { position: "fixed", zIndex: 9998, background: overlay };

  return createPortal(
    <>
      {foco ? (
        <>
          <div style={{ ...capa, inset: `0 0 auto 0`, height: foco.top }} />
          <div style={{ ...capa, left: 0, top: foco.top, width: foco.left, height: foco.height }} />
          <div style={{ ...capa, left: foco.right, right: 0, top: foco.top, height: foco.height }} />
          <div style={{ ...capa, inset: `${foco.bottom}px 0 0 0` }} />
          <div
            aria-hidden="true"
            style={{
              position: "fixed", zIndex: 9999, pointerEvents: "none",
              left: foco.left, top: foco.top, width: foco.width, height: foco.height,
              borderRadius: 12, border: `2px solid ${C.violet}`,
              boxShadow: reducido ? `0 0 0 2px ${C.violetB}` : `0 0 0 3px ${C.violetB}, 0 0 28px ${C.violet}`,
              transition: reducido ? "none" : "all .18s ease",
            }}
          />
        </>
      ) : <div style={{ ...capa, inset: 0 }} />}

      <section
        role="dialog"
        aria-modal="true"
        aria-label={`Ayuda: ${paso.titulo}`}
        style={{
          position: "fixed", zIndex: 10000, left: tooltipLeft, top: tooltipTop,
          transform: foco ? (vaAbajo ? "none" : "translateY(-100%)") : "translate(-50%,-50%)",
          width: "min(360px, calc(100vw - 24px))", overflow: "hidden",
          maxHeight: "calc(100vh - 24px)", overflowY: "auto",
          background: C.panelSolid, color: C.text, border: `1px solid ${C.border2}`,
          borderRadius: 16, boxShadow: "0 22px 60px -18px var(--shadow-strong)",
          fontFamily: C.sans, animation: reducido || !foco ? "none" : "tour-aparece .18s ease both",
        }}
      >
        <style>{`
          @keyframes tour-aparece{from{opacity:0;transform:translateY(${vaAbajo ? "-5px" : "calc(-100% + 5px)"})}to{opacity:1;transform:${vaAbajo ? "none" : "translateY(-100%)"}}}
        `}</style>
        <div style={{ height: 3, background: "linear-gradient(90deg,var(--violet),var(--blue))" }} />
        <div style={{ padding: "15px 16px 13px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 900, color: C.violet, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>
                Paso {pasoIndex + 1} de {tour.pasos.length}
              </div>
              <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.25, fontWeight: 900 }}>{paso.titulo}</h2>
            </div>
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar tour"
              style={{ width: 28, height: 28, display: "grid", placeItems: "center", border: "none", borderRadius: 8, background: C.panel2, color: C.dim, cursor: "pointer" }}
            >
              <X size={15} />
            </button>
          </div>
          <p style={{ margin: "10px 0 0", color: C.muted, fontSize: 13, lineHeight: 1.55 }}>{paso.cuerpo}</p>
          {targetFaltante && (
            <div style={{ marginTop: 10, padding: "9px 10px", borderRadius: 9, background: C.amberL, border: `1px solid ${C.amberB}`, color: C.amber, fontSize: 11.5, lineHeight: 1.45 }}>
              Esta sección no está disponible con los datos o filtros actuales. Podés continuar sin perder el resto del recorrido.
              <button type="button" onClick={() => setRetryToken(value => value + 1)} style={{ display: "block", marginTop: 6, padding: 0, border: "none", background: "transparent", color: C.amber, cursor: "pointer", fontSize: 11.5, fontWeight: 850 }}>Reintentar ubicación</button>
            </div>
          )}
          {paso.interactivo && (
            <div style={{ marginTop: 9, padding: "7px 9px", borderRadius: 9, background: C.violetL, border: `1px solid ${C.violetB}`, color: C.violet, fontSize: 11.5, fontWeight: 750 }}>
              Podés usar el elemento resaltado antes de continuar.
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: `1px solid ${C.border}`, background: C.panel }}>
          <button
            type="button"
            onClick={onCerrar}
            style={{ border: "none", background: "transparent", color: C.dim, padding: "7px 5px", cursor: "pointer", fontSize: 12, fontWeight: 750 }}
          >
            Salir
          </button>
          <div style={{ flex: 1 }} />
          {pasoIndex > 0 && (
            <button
              type="button"
              onClick={onAnterior}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, border: `1px solid ${C.border}`, background: C.panelSolid, color: C.muted, borderRadius: 9, padding: "7px 10px", cursor: "pointer", fontSize: 12, fontWeight: 800 }}
            >
              <ArrowLeft size={13} /> Atrás
            </button>
          )}
          <button
            type="button"
            onClick={onSiguiente}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "linear-gradient(135deg,var(--violet),var(--blue))", color: "#fff", borderRadius: 9, padding: "8px 12px", cursor: "pointer", fontSize: 12, fontWeight: 850 }}
          >
            {ultimo ? "Entendido" : "Siguiente"} {!ultimo && <ArrowRight size={13} />}
          </button>
        </div>
      </section>
    </>,
    document.body,
  );
}
