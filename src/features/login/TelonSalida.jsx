import LogoK from "@/components/ui/LogoK";

// La despedida al cerrar sesión, espejo corto de la intro: un telón baja desde
// arriba con la K y "Hasta luego". App cierra la sesión mientras tanto y, cuando
// ya se está mostrando el login, pasa a la fase "sale" y el telón se desvanece.
//
// Todo en CSS: dura menos de un segundo y no hace falta un reloj en JavaScript.
// Con "reducir movimiento" App directamente no lo monta.
export default function TelonSalida({ nombre, fase, onSalio }) {
  return (
    <div
      className={fase === "sale" ? "kl-telon kl-telon-sale" : "kl-telon"}
      role="status"
      aria-live="polite"
      onAnimationEnd={(e) => {
        if (fase === "sale" && e.target === e.currentTarget) onSalio?.();
      }}
    >
      <style>{CSS}</style>
      <div className="kl-telon-centro">
        <LogoK size={64} titulo="" className="kl-telon-logo" />
        <div className="kl-telon-titulo">Hasta luego</div>
        {nombre && <div className="kl-telon-nombre">{nombre}</div>}
        <span className="kl-telon-linea" />
      </div>
    </div>
  );
}

const CSS = `
  .kl-telon {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 100000;
    display: grid; place-items: center;
    background:
      radial-gradient(900px 560px at 50% 38%, var(--glow-a), transparent 70%),
      var(--bg);
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
    animation: kl-telon-baja .46s cubic-bezier(.76,0,.24,1) both;
  }
  .kl-telon-sale { animation: kl-telon-sale .34s ease-out forwards; }
  .kl-telon-centro {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    animation: kl-telon-sube .5s .2s cubic-bezier(.22,1,.36,1) both;
  }
  .kl-telon-logo { color: var(--text); margin-bottom: 10px; }
  .kl-telon-logo circle { animation: kl-telon-anillo .8s .18s cubic-bezier(.65,0,.35,1) backwards; }
  .kl-telon-logo path:first-child { animation: kl-telon-palo .4s .42s cubic-bezier(.65,0,.35,1) backwards; }
  .kl-telon-logo path:last-child { animation: kl-telon-k .55s .56s cubic-bezier(.65,0,.35,1) backwards; }
  .kl-telon-titulo { font-size: 26px; font-weight: 650; letter-spacing: -.01em; }
  .kl-telon-nombre { font-size: 14px; color: var(--dim); }
  .kl-telon-linea {
    width: 120px; height: 1px; margin-top: 12px;
    background: linear-gradient(90deg, transparent, var(--blue), var(--cyan), transparent);
    transform-origin: center;
    animation: kl-telon-linea .6s .42s cubic-bezier(.22,1,.36,1) backwards;
  }
  @keyframes kl-telon-baja { from { clip-path: inset(0 0 100% 0); -webkit-clip-path: inset(0 0 100% 0); } to { clip-path: inset(0 0 0 0); -webkit-clip-path: inset(0 0 0 0); } }
  @keyframes kl-telon-sale { to { opacity: 0; } }
  @keyframes kl-telon-sube { from { opacity: 0; transform: translateY(12px); } }
  @keyframes kl-telon-anillo { from { stroke-dashoffset: 288; } }
  @keyframes kl-telon-palo { from { stroke-dashoffset: 60; } }
  @keyframes kl-telon-k { from { stroke-dashoffset: 145; } }
  @keyframes kl-telon-linea { from { transform: scaleX(0); opacity: 0; } }
`;
