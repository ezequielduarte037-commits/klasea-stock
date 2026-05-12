import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";

const MODEL_MAP = {
  "K52 HT": "/models/k52.glb",
  "K52":    "/models/k52.glb",
  "K46":    "/models/k46.glb",
  "K38":    "/models/k38.glb",
  "K64":    "/models/k64.glb",
};
const FALLBACK = "/models/k52.glb";

const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);

/**
 * ORIENTACIÓN — doble rotación XZ
 * ────────────────────────────────
 * El GLB tiene: largo del casco en +Y, mástil/cubierta en +Z, manga en +X
 *
 * "0deg 0deg 90deg"  → acuesta el largo (Y→-X ✓) pero NO corrige el eje
 *                       del mástil (Z→Z, queda apuntando a la pantalla)
 *                       → resultado: barco de costado/rodando
 *
 * "90deg 90deg 0deg" → primero Rx(-90°): mástil(Z)→Y ✓, largo(Y)→-Z
 *                        luego  Rz( 90°): largo(-Z→sin cambio en Z),
 *                                         manga(X)→-Z, mástil sigue en Y ✓
 *                        → barco horizontal, cubierta arriba, mástil hacia Y
 *
 * Si queda al revés (quilla arriba) probar "90deg 90deg 0deg"
 * Si queda mirando al lado equivocado probar "-90deg 0deg -90deg"
 */

function buildIframeSrc({ absModelUrl, orientation, pixelRatio }) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script type="module"
    src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js">
  </script>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    html, body { width:100%; height:100%; overflow:hidden; background:transparent; }
    model-viewer { width:100%; height:100%; background:transparent; --progress-bar-height:0px; }
  </style>
</head>
<body>
  <model-viewer
    id="mv"
    src="${absModelUrl}"
    alt="Yacht 3D"
    orientation="${orientation}"
    camera-controls
    disable-pan
    camera-orbit="270deg 75deg 105%"
    field-of-view="28deg"
    min-camera-orbit="auto 20deg auto"
    max-camera-orbit="auto 88deg auto"
    interpolation-decay="80"
    shadow-intensity="0.5"
    shadow-softness="1"
    exposure="1.15"
    pixel-ratio="${pixelRatio}"
    loading="eager"
    reveal="auto"
    interaction-prompt="none"
  ></model-viewer>
  <script>
    var mv = document.getElementById('mv');
    mv.addEventListener('load',  function() { parent.postMessage({ type:'mv-load'  }, '*'); });
    mv.addEventListener('error', function() { parent.postMessage({ type:'mv-error' }, '*'); });
    window.addEventListener('message', function(e) {
      var d = e.data; if (!d || !d.type) return;
      if (d.type === 'reset') {
        mv.cameraOrbit  = "270deg 75deg 105%";
        mv.cameraTarget = 'auto auto auto';
      }
    });
  </script>
</body>
</html>`;
}

export default function Yacht3DViewer({ compact = false, modelName }) {
  const [activated, setActivated] = useState(false);
  const [status, setStatus]       = useState("loading");
  const iframeRef = useRef(null);

  const modelUrl    = MODEL_MAP[modelName] || FALLBACK;
  const displayName = modelName || "K52 HT";

  const absModelUrl = useMemo(() =>
    modelUrl.startsWith("http") ? modelUrl : window.location.origin + modelUrl,
  [modelUrl]);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "mv-load")  setStatus("idle");
      if (e.data?.type === "mv-error") setStatus("error");
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => { if (activated) setStatus("loading"); }, [modelUrl]);

  const send = useCallback(
    (msg) => iframeRef.current?.contentWindow?.postMessage(msg, "*"), []);

  const handleActivate   = useCallback(() => { setActivated(true);  setStatus("loading"); }, []);
  const handleDeactivate = useCallback(() => { setActivated(false); setStatus("loading"); }, []);
  const handleReset      = useCallback(() => send({ type: "reset" }), [send]);

  const iframeSrc = useMemo(
    () => buildIframeSrc({ absModelUrl, orientation: "0deg -90deg -90deg", pixelRatio: PIXEL_RATIO }),
    [absModelUrl]
  );

  /* ─── PLACEHOLDER ─── */
  if (!activated) {
    return (
      <div className={`yacht3d${compact ? " compact" : ""}`}>
        <div className="yacht3d-head">
          <span>{displayName}</span>
          <span style={{ fontSize:9, opacity:0.4, letterSpacing:".15em" }}>3D · DESACTIVADO</span>
        </div>
        <div
          className="yacht3d-canvas"
          style={{
            position:"relative", display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:16,
            cursor:"pointer", background:"rgba(216,195,161,0.03)",
            border:"1px dashed rgba(216,195,161,0.15)",
            borderRadius:4, transition:"background .2s",
          }}
          onClick={handleActivate}
          role="button"
          aria-label="Activar visor 3D"
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(216,195,161,0.07)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(216,195,161,0.03)")}
        >
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{opacity:0.3}}>
            <circle cx="16" cy="8" r="3" stroke="rgba(216,195,161,0.9)" strokeWidth="1.5"/>
            <line x1="16" y1="11" x2="16" y2="26" stroke="rgba(216,195,161,0.9)" strokeWidth="1.5"/>
            <path d="M8 17 C8 24 24 24 24 17" stroke="rgba(216,195,161,0.9)" strokeWidth="1.5" fill="none"/>
            <line x1="8" y1="17" x2="5" y2="17" stroke="rgba(216,195,161,0.9)" strokeWidth="1.5"/>
            <line x1="24" y1="17" x2="27" y2="17" stroke="rgba(216,195,161,0.9)" strokeWidth="1.5"/>
          </svg>
          <div style={{textAlign:"center"}}>
            <div style={{
              fontFamily:"monospace", fontSize:10, letterSpacing:".2em",
              textTransform:"uppercase", color:"rgba(216,195,161,0.7)", marginBottom:4,
            }}>ACTIVAR VISOR 3D</div>
            <div style={{
              fontFamily:"monospace", fontSize:8, letterSpacing:".12em",
              color:"rgba(148,163,184,0.4)",
            }}>CLIC PARA CARGAR · USA GPU</div>
          </div>
        </div>
        <div className="yacht3d-foot">
          <span style={{opacity:0.4}}>VISOR NO ACTIVO</span>
          <span style={{opacity:0.3}}>GLB</span>
        </div>
      </div>
    );
  }

  /* ─── VISOR ACTIVO ─── */
  return (
    <div className={`yacht3d${compact ? " compact" : ""}`}>
      <div className="yacht3d-head">
        <span>{displayName}</span>
        <div style={{display:"flex", gap:8}}>
          <button onClick={handleReset} style={{fontSize:9}}>⟳ RESET</button>
          <button onClick={handleDeactivate} style={{fontSize:9, color:"rgba(239,100,100,0.8)"}}>
            ✕ CERRAR
          </button>
        </div>
      </div>

      <div className="yacht3d-canvas" style={{position:"relative"}}>
        {status === "loading" && (
          <div style={{
            position:"absolute", inset:0, zIndex:10, pointerEvents:"none",
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:14,
          }}>
            <svg width="36" height="36" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(216,195,161,0.15)" strokeWidth="2"/>
              <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(216,195,161,0.7)" strokeWidth="2"
                strokeDasharray="30 65" strokeLinecap="round"
                style={{transformOrigin:"center", animation:"spin3d 1s linear infinite"}}/>
            </svg>
            <span style={{
              fontFamily:"monospace", fontSize:9, letterSpacing:".2em",
              textTransform:"uppercase", color:"rgba(216,195,161,0.55)",
            }}>CARGANDO MODELO</span>
            <style>{`@keyframes spin3d{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {status === "error" && (
          <div style={{
            position:"absolute", inset:0, zIndex:10, pointerEvents:"none",
            display:"flex", flexDirection:"column",
            alignItems:"center", justifyContent:"center", gap:10,
          }}>
            <span style={{fontSize:22, opacity:.5}}>⚓</span>
            <span style={{
              fontFamily:"monospace", fontSize:9, letterSpacing:".2em",
              textTransform:"uppercase", color:"rgba(239,68,68,0.7)",
            }}>MODELO NO ENCONTRADO</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          srcDoc={iframeSrc}
          title={`Visor 3D ${displayName}`}
          style={{
            width:"100%", height:"100%",
            border:"none", display:"block", background:"transparent",
            opacity: status === "idle" ? 1 : 0,
            transition:"opacity 0.35s ease",
          }}
        />
      </div>

      <div className="yacht3d-foot">
        <span>ARRASTRAR · ROTAR &nbsp;|&nbsp; SCROLL · ZOOM</span>
        <span style={{opacity:0.5}}>GLB</span>
      </div>
    </div>
  );
}












