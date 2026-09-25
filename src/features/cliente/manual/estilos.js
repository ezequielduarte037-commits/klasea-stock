/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · estilos
   Blanco y negro, editorial, mucho aire. Todo cuelga de .kx para no
   tocar el resto de la app. Movimiento sólo con transform y opacity.
═══════════════════════════════════════════════════════════════ */
export const CSS_MANUAL = `
.kx {
  --kx-bg: #ffffff;
  --kx-fg: #0b0b0b;
  --kx-mute: #6b6b6b;
  --kx-dim: #9d9d9d;
  --kx-line: rgba(11, 11, 11, .1);
  --kx-line-2: rgba(11, 11, 11, .24);
  --kx-soft: #f4f4f2;
  --kx-ink: #0b0b0b;
  --kx-ink-fg: #f4f4f2;
  --kx-sos: #e5484d;
  --kx-plano: grayscale(1) brightness(0);
  --kx-ez: cubic-bezier(.22, 1, .36, 1);
  --kx-gut: clamp(16px, 5vw, 72px);
  --kx-max: 1320px;
  --kx-bar: 64px;
  position: relative;
  min-height: 100vh;
  background: var(--kx-bg);
  color: var(--kx-fg);
  font-family: 'Outfit', system-ui, sans-serif;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  overflow-x: clip;
  transition: background-color .4s var(--kx-ez), color .4s var(--kx-ez);
}
.kx[data-tono="noche"] {
  --kx-bg: #0e0e0e;
  --kx-fg: #f2f2f0;
  --kx-mute: #9a9a9a;
  --kx-dim: #666;
  --kx-line: rgba(255, 255, 255, .09);
  --kx-line-2: rgba(255, 255, 255, .22);
  --kx-soft: #171717;
  --kx-ink: #000;
  --kx-plano: grayscale(1) brightness(0) invert(1);
}
/* Bandas negras: portada, índice, cierre. Siempre oscuras. */
.kx .kx-ink {
  --kx-fg: #f2f2f0;
  --kx-mute: #8d8d8d;
  --kx-dim: #5e5e5e;
  --kx-line: rgba(255, 255, 255, .1);
  --kx-line-2: rgba(255, 255, 255, .26);
  --kx-soft: #161616;
  --kx-plano: grayscale(1) brightness(0) invert(1);
  background: var(--kx-ink);
  color: var(--kx-fg);
}
.kx button { font-family: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.kx a { color: inherit; text-decoration: none; }
.kx img { display: block; max-width: 100%; }
.kx ::selection { background: var(--kx-fg); color: var(--kx-bg); }

.kx .kx-wrap { max-width: var(--kx-max); margin: 0 auto; padding: 0 var(--kx-gut); }
.kx .kx-eyebrow {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 500;
  letter-spacing: .22em; text-transform: uppercase; color: var(--kx-mute);
}
.kx .kx-mono { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; }
.kx .kx-lead { font-size: clamp(18px, 1.6vw, 21px); line-height: 1.6; color: var(--kx-mute); font-weight: 300; max-width: 640px; }

/* ── Entradas ─────────────────────────────────────────────── */
@keyframes kx-up    { from { opacity: 0; transform: translate3d(0, 28px, 0); } to { opacity: 1; transform: none; } }
@keyframes kx-fade  { from { opacity: 0; } to { opacity: 1; } }
@keyframes kx-mask  { from { transform: translate3d(0, 105%, 0); } to { transform: none; } }
@keyframes kx-rule  { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes kx-drop  { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes kx-curtain { from { transform: scaleX(1); } to { transform: scaleX(0); } }
@keyframes kx-page  { from { opacity: 0; transform: translate3d(0, 18px, 0); } to { opacity: 1; transform: none; } }
@keyframes kx-pop   { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: none; } }
@keyframes kx-load  { 0% { transform: scaleX(0); transform-origin: left; } 50% { transform: scaleX(1); transform-origin: left; } 50.1% { transform-origin: right; } 100% { transform: scaleX(0); transform-origin: right; } }

.kx [data-rv] { opacity: 0; transform: translate3d(0, 28px, 0); }
.kx [data-rv="in"] { animation: kx-up .55s var(--kx-ez) both; animation-delay: calc(var(--d, 0) * 70ms); }
.kx [data-rv="in"].kx-rv-fade { animation-name: kx-fade; }

.kx .kx-mask { display: inline-block; overflow: hidden; vertical-align: top; padding: 0 .1em .06em 0; margin: 0 -.1em -.06em 0; }
.kx .kx-mask > span { display: inline-block; animation: kx-mask .75s var(--kx-ez) both; animation-delay: calc(120ms + var(--i, 0) * 60ms); }

.kx .kx-page { animation: kx-page .5s var(--kx-ez) both; }

/* ── Barra superior ───────────────────────────────────────── */
.kx .kx-bar {
  position: fixed; z-index: 60; top: 0; left: 0; right: 0; height: var(--kx-bar);
  display: flex; align-items: center; gap: 12px; padding: 0 var(--kx-gut);
  color: var(--kx-fg);
  transition: background-color .35s var(--kx-ez), border-color .35s var(--kx-ez), color .35s var(--kx-ez);
  border-bottom: 1px solid transparent;
}
.kx .kx-bar[data-modo="solido"] {
  background: color-mix(in srgb, var(--kx-bg) 86%, transparent);
  -webkit-backdrop-filter: blur(18px) saturate(1.4); backdrop-filter: blur(18px) saturate(1.4);
  border-bottom-color: var(--kx-line);
}
.kx .kx-bar[data-modo="claro"] { color: #f2f2f0; }
.kx .kx-marca { display: flex; align-items: center; gap: 14px; min-height: 44px; }
.kx .kx-marca-k { font-size: 13px; font-weight: 500; letter-spacing: .42em; white-space: nowrap; }
.kx .kx-marca-cap { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .14em; opacity: .55; white-space: nowrap; animation: kx-fade .4s var(--kx-ez) both; }
.kx .kx-bar-der { margin-left: auto; display: flex; align-items: center; gap: 4px; }
.kx .kx-bar-btn {
  height: 40px; min-width: 40px; padding: 0 12px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  font-size: 12px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase;
  transition: opacity .2s, transform .2s var(--kx-ez);
}
.kx .kx-bar-btn:hover { opacity: .6; }
.kx .kx-bar-btn:active { transform: scale(.96); }
.kx .kx-sos {
  color: var(--kx-sos); border: 1px solid color-mix(in srgb, var(--kx-sos) 45%, transparent);
  height: 34px; padding: 0 14px; margin: 0 6px;
}
.kx .kx-sos:hover { opacity: 1; background: color-mix(in srgb, var(--kx-sos) 12%, transparent); }
.kx .kx-sos i { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.kx .kx-hamb { position: relative; width: 22px; height: 10px; display: inline-block; }
.kx .kx-hamb::before, .kx .kx-hamb::after {
  content: ""; position: absolute; left: 0; right: 0; height: 1.5px; background: currentColor;
  transition: transform .45s var(--kx-ez);
}
.kx .kx-hamb::before { top: 0; }
.kx .kx-hamb::after { bottom: 0; }
.kx .kx-hamb[data-abierto="1"]::before { transform: translateY(4.25px) rotate(45deg); }
.kx .kx-hamb[data-abierto="1"]::after { transform: translateY(-4.25px) rotate(-45deg); }
.kx .kx-progreso {
  position: absolute; left: 0; right: 0; bottom: -1px; height: 1px; background: var(--kx-fg);
  transform-origin: left; transform: scaleX(0);
}
.kx .kx-solo-ancho { display: inline-flex; }
@media (max-width: 720px) {
  .kx .kx-solo-ancho { display: none; }
  .kx .kx-marca-cap { display: none; }
  .kx .kx-bar-btn { padding: 0 10px; }
}

/* ── Índice (menú) ────────────────────────────────────────── */
.kx .kx-indice {
  position: fixed; inset: 0; z-index: 55; overflow-y: auto;
  padding: calc(var(--kx-bar) + 24px) var(--kx-gut) 40px;
  animation: kx-fade .35s var(--kx-ez) both;
}
.kx .kx-indice-grid { max-width: var(--kx-max); margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 48px; min-height: calc(100% - 40px); }
.kx .kx-indice-lista { list-style: none; margin: 0; padding: 0; }
.kx .kx-indice-lista li { animation: kx-up .5s var(--kx-ez) both; animation-delay: calc(80ms + var(--i) * 35ms); }
.kx .kx-indice-item {
  width: 100%; display: flex; align-items: baseline; gap: 20px; padding: 6px 0; text-align: left;
  font-size: clamp(26px, 3.6vw, 48px); font-weight: 300; letter-spacing: -.02em; line-height: 1.15;
  transition: opacity .3s var(--kx-ez), transform .45s var(--kx-ez);
}
.kx .kx-indice-item small { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .12em; color: var(--kx-mute); width: 28px; flex-shrink: 0; position: relative; }
.kx .kx-indice-lista:hover .kx-indice-item { opacity: .32; }
.kx .kx-indice-lista .kx-indice-item:hover,
.kx .kx-indice-lista .kx-indice-item:focus-visible { opacity: 1; transform: translateX(14px); }
.kx .kx-indice-item[aria-current="page"] small::after { content: ""; position: absolute; left: -14px; top: 50%; width: 5px; height: 5px; margin-top: -3px; border-radius: 50%; background: var(--kx-fg); }
.kx .kx-indice-lado { display: flex; flex-direction: column; justify-content: space-between; gap: 32px; border-left: 1px solid var(--kx-line); padding-left: 40px; animation: kx-fade .6s .2s var(--kx-ez) both; }
.kx .kx-indice-num { font-family: 'JetBrains Mono', monospace; font-size: clamp(80px, 12vw, 180px); font-weight: 300; line-height: .9; letter-spacing: -.06em; color: transparent; -webkit-text-stroke: 1px var(--kx-line-2); }
.kx .kx-indice-desc { font-size: 20px; font-weight: 300; line-height: 1.5; color: var(--kx-mute); max-width: 360px; min-height: 60px; }
.kx .kx-indice-pie { display: flex; flex-wrap: wrap; gap: 8px 24px; }
.kx .kx-link {
  display: inline-flex; align-items: center; gap: 10px; min-height: 40px;
  font-size: 12px; font-weight: 500; letter-spacing: .18em; text-transform: uppercase;
  position: relative;
}
.kx .kx-link::after {
  content: ""; position: absolute; left: 0; right: 0; bottom: 8px; height: 1px; background: currentColor;
  transform: scaleX(0); transform-origin: right; transition: transform .45s var(--kx-ez);
}
.kx .kx-link:hover::after { transform: scaleX(1); transform-origin: left; }
.kx .kx-link svg { transition: transform .45s var(--kx-ez); }
.kx .kx-link:hover svg { transform: translateX(4px); }
@media (max-width: 860px) {
  .kx .kx-indice-grid { grid-template-columns: 1fr; gap: 24px; }
  .kx .kx-indice-lado { border-left: 0; padding-left: 0; border-top: 1px solid var(--kx-line); padding-top: 24px; }
  .kx .kx-indice-num, .kx .kx-indice-desc { display: none; }
  .kx .kx-indice-item { font-size: 30px; padding: 8px 0; }
  .kx .kx-indice-lista:hover .kx-indice-item { opacity: 1; }
}

/* ── Portada ──────────────────────────────────────────────── */
.kx .kx-hero {
  position: relative; min-height: 100svh; display: flex; flex-direction: column;
  padding: calc(var(--kx-bar) + 40px) var(--kx-gut) 32px; overflow: hidden;
}
.kx .kx-hero-top { max-width: var(--kx-max); width: 100%; margin: 0 auto; display: flex; justify-content: space-between; gap: 24px; flex-wrap: wrap; }
.kx .kx-hero-top > * { animation: kx-fade .8s .2s var(--kx-ez) both; }
.kx .kx-hero-modelo {
  max-width: var(--kx-max); width: 100%; margin: 3vh auto 0;
  font-size: clamp(88px, 21vw, 300px); font-weight: 300; letter-spacing: -.065em; line-height: .82;
}
.kx .kx-hero-plano { position: relative; flex: 1; min-height: 180px; display: flex; align-items: center; justify-content: flex-end; max-width: var(--kx-max); width: 100%; margin: clamp(-150px, -11vw, -20px) auto 3vh; pointer-events: none; }
.kx .kx-hero-plano img {
  width: min(920px, 80%); height: auto; max-height: 44vh; object-fit: contain;
  filter: var(--kx-plano); opacity: .85;
  animation: kx-fade 1s .3s var(--kx-ez) both;
}
.kx .kx-hero-plano img[data-espejo="1"] { transform: scaleX(-1); }
.kx .kx-telon {
  position: absolute; inset: 0; background: var(--kx-ink); transform-origin: right;
  animation: kx-curtain 1.3s .45s var(--kx-ez) both;
}
.kx .kx-hero-pie { max-width: var(--kx-max); width: 100%; margin: 0 auto; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 24px; }
.kx .kx-hero-pie > * { animation: kx-up .7s var(--kx-ez) both; animation-delay: calc(700ms + var(--i, 0) * 90ms); }
.kx .kx-hero-saludo { font-size: clamp(22px, 2.4vw, 32px); font-weight: 300; letter-spacing: -.01em; line-height: 1.2; }
.kx .kx-bajar { justify-self: center; display: flex; flex-direction: column; align-items: center; gap: 12px; min-height: 44px; }
.kx .kx-bajar i { width: 1px; height: 48px; background: currentColor; opacity: .5; transform-origin: top; animation: kx-drop 1s 1.2s var(--kx-ez) both; }
.kx .kx-lema { justify-self: end; text-align: right; }
.kx .kx-lema strong { display: block; font-size: 18px; font-weight: 400; letter-spacing: .02em; }
@media (max-width: 720px) {
  .kx .kx-hero-plano { margin-top: 0; justify-content: center; }
  .kx .kx-hero-plano img { width: 100%; }
  .kx .kx-hero-pie { grid-template-columns: 1fr; }
  .kx .kx-bajar { display: none; }
  .kx .kx-lema { justify-self: start; text-align: left; }
}

/* ── Secciones editoriales ────────────────────────────────── */
.kx .kx-bloque { padding: clamp(72px, 10vw, 140px) 0; }
.kx .kx-bloque + .kx-bloque { border-top: 1px solid var(--kx-line); }
.kx .kx-dos { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: clamp(32px, 6vw, 96px); }
@media (max-width: 900px) { .kx .kx-dos { grid-template-columns: 1fr; } }
.kx .kx-dos-cab { position: sticky; top: calc(var(--kx-bar) + 32px); align-self: start; }
@media (max-width: 900px) { .kx .kx-dos-cab { position: static; } }
.kx .kx-h2 { font-size: clamp(32px, 3.6vw, 52px); font-weight: 300; letter-spacing: -.03em; line-height: 1.05; margin: 14px 0 0; }
.kx .kx-h3 { font-size: 22px; font-weight: 400; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.kx .kx-p { font-size: 16px; line-height: 1.7; color: var(--kx-mute); margin: 0; }
.kx .kx-declaracion { font-size: clamp(28px, 4.2vw, 60px); font-weight: 300; letter-spacing: -.03em; line-height: 1.12; margin: 0; max-width: 1080px; }
.kx .kx-declaracion em { font-style: normal; color: var(--kx-mute); }
.kx .kx-regla { height: 1px; background: var(--kx-line-2); transform-origin: left; animation: kx-rule 1s .3s var(--kx-ez) both; }

/* Lo esencial */
.kx .kx-esencial { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin-top: 56px; }
.kx .kx-esencial > * { padding: 28px 28px 32px 0; border-top: 1px solid var(--kx-line-2); display: flex; flex-direction: column; gap: 14px; }
.kx .kx-esencial > * + * { padding-left: 28px; border-left: 1px solid var(--kx-line); }
@media (max-width: 1000px) { .kx .kx-esencial { grid-template-columns: 1fr 1fr; } .kx .kx-esencial > *:nth-child(3) { border-left: 0; padding-left: 0; } }
@media (max-width: 560px) { .kx .kx-esencial { grid-template-columns: 1fr; } .kx .kx-esencial > * { border-left: 0 !important; padding-left: 0 !important; } }
.kx .kx-num-grande { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--kx-mute); }

/* Filas de capítulos (lista tipo índice de proyectos) */
.kx .kx-filas { list-style: none; margin: 48px 0 0; padding: 0; border-bottom: 1px solid var(--kx-line-2); }
.kx .kx-fila {
  position: relative; width: 100%; display: grid; grid-template-columns: 72px minmax(0, 1fr) minmax(0, 1.1fr) 40px;
  align-items: center; gap: 24px; padding: 26px 0; text-align: left; border-top: 1px solid var(--kx-line-2);
  isolation: isolate; transition: color .45s var(--kx-ez), padding .45s var(--kx-ez);
}
.kx .kx-fila::before {
  content: ""; position: absolute; z-index: -1; inset: 0 calc(var(--kx-gut) * -1); background: var(--kx-fg);
  transform: scaleY(0); transform-origin: bottom; transition: transform .5s var(--kx-ez);
}
.kx .kx-fila:hover, .kx .kx-fila:focus-visible { color: var(--kx-bg); }
.kx .kx-fila:hover::before, .kx .kx-fila:focus-visible::before { transform: scaleY(1); transform-origin: top; }
.kx .kx-fila:hover .kx-fila-k, .kx .kx-fila:focus-visible .kx-fila-k { color: inherit; opacity: .7; }
.kx .kx-fila-t { font-size: clamp(24px, 2.8vw, 40px); font-weight: 300; letter-spacing: -.02em; line-height: 1.1; transition: transform .5s var(--kx-ez); }
.kx .kx-fila:hover .kx-fila-t { transform: translateX(10px); }
.kx .kx-fila-k { font-size: 15px; color: var(--kx-mute); line-height: 1.5; }
.kx .kx-fila svg { justify-self: end; transition: transform .5s var(--kx-ez); }
.kx .kx-fila:hover svg { transform: translateX(6px); }
@media (max-width: 720px) {
  .kx .kx-fila { grid-template-columns: 44px minmax(0, 1fr) 24px; gap: 12px; padding: 20px 0; }
  .kx .kx-fila-k { display: none; }
}

/* Condiciones */
.kx .kx-datos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 40px; border-top: 1px solid var(--kx-line-2); }
.kx .kx-datos > div { padding: 24px 20px 0 0; }
.kx .kx-datos > div + div { padding-left: 20px; border-left: 1px solid var(--kx-line); }
.kx .kx-dato-v { font-family: 'JetBrains Mono', monospace; font-size: clamp(34px, 4.4vw, 60px); font-weight: 300; letter-spacing: -.04em; line-height: 1; margin-top: 12px; }
.kx .kx-dato-v small { font-size: .32em; letter-spacing: .06em; margin-left: 6px; color: var(--kx-mute); }
@media (max-width: 720px) {
  .kx .kx-datos { grid-template-columns: 1fr 1fr; }
  .kx .kx-datos > div:nth-child(3) { border-left: 0; padding-left: 0; }
  .kx .kx-datos > div { padding-bottom: 20px; }
}

/* Foto de la unidad */
.kx .kx-foto { position: relative; overflow: hidden; aspect-ratio: 21 / 9; background: var(--kx-soft); }
.kx .kx-foto img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); transform: scale(1.08); transition: transform 1.4s var(--kx-ez), filter 1.2s var(--kx-ez); }
.kx .kx-foto[data-rv="in"] img { transform: none; }
.kx .kx-foto:hover img { filter: grayscale(0); }
@media (max-width: 720px) { .kx .kx-foto { aspect-ratio: 4 / 3; } }

/* ── Cabecera de capítulo ─────────────────────────────────── */
.kx .kx-cap-cab { padding: calc(var(--kx-bar) + clamp(56px, 9vw, 120px)) 0 clamp(48px, 6vw, 80px); }
.kx .kx-cap-meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 28px; animation: kx-fade .6s var(--kx-ez) both; }
.kx .kx-cap-t { font-size: clamp(60px, 11vw, 168px); font-weight: 300; letter-spacing: -.055em; line-height: .9; margin: 0 0 36px; }
.kx .kx-cap-cab .kx-lead { animation: kx-up .6s .35s var(--kx-ez) both; }
.kx .kx-cap-cab .kx-regla { margin-top: clamp(40px, 6vw, 72px); }

/* ── Siguiente capítulo ───────────────────────────────────── */
.kx .kx-sig { display: block; width: 100%; text-align: left; padding: clamp(64px, 9vw, 120px) 0; }
.kx .kx-sig-t {
  display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-top: 18px;
  font-size: clamp(44px, 8vw, 120px); font-weight: 300; letter-spacing: -.05em; line-height: .95;
}
.kx .kx-sig-t svg { flex-shrink: 0; width: clamp(36px, 5vw, 72px); height: auto; stroke-width: 1; transition: transform .6s var(--kx-ez); }
.kx .kx-sig:hover .kx-sig-t svg { transform: translateX(14px); }
.kx .kx-sig-t span { transition: transform .6s var(--kx-ez); }
.kx .kx-sig:hover .kx-sig-t span { transform: translateX(8px); }

/* ── Pie ──────────────────────────────────────────────────── */
.kx .kx-pie { padding: clamp(72px, 10vw, 128px) 0 32px; border-top: 1px solid rgba(255, 255, 255, .08); }
.kx .kx-pie-lema { font-size: clamp(48px, 9vw, 140px); font-weight: 300; letter-spacing: -.055em; line-height: .92; margin: 0; }
.kx .kx-pie-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; margin-top: 72px; padding-top: 28px; border-top: 1px solid var(--kx-line); }
.kx .kx-pie-cols ul { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.kx .kx-pie-cols a, .kx .kx-pie-cols button { font-size: 15px; color: var(--kx-mute); min-height: 34px; display: inline-flex; align-items: center; transition: color .25s; }
.kx .kx-pie-cols a:hover, .kx .kx-pie-cols button:hover { color: var(--kx-fg); }
.kx .kx-pie-fin { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 64px; }
@media (max-width: 720px) { .kx .kx-pie-cols { grid-template-columns: 1fr; } }

/* ── Piezas ───────────────────────────────────────────────── */
.kx .kx-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 12px;
  min-height: 52px; padding: 0 28px; border-radius: 999px;
  background: var(--kx-fg); color: var(--kx-bg);
  font-size: 12px; font-weight: 500; letter-spacing: .18em; text-transform: uppercase;
  transition: transform .35s var(--kx-ez), opacity .25s;
}
.kx .kx-btn:hover { transform: translateY(-2px); }
.kx .kx-btn:active { transform: scale(.97); }
.kx .kx-btn:disabled { opacity: .4; cursor: default; transform: none; }
.kx .kx-btn-linea { background: transparent; color: var(--kx-fg); border: 1px solid var(--kx-line-2); }
.kx .kx-btn-chico { min-height: 40px; padding: 0 18px; }

.kx .kx-campo { display: flex; flex-direction: column; gap: 8px; }
.kx .kx-campo label, .kx .kx-label { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--kx-mute); }
.kx .kx-input {
  width: 100%; min-height: 48px; padding: 10px 0; background: transparent; color: var(--kx-fg);
  border: 0; border-bottom: 1px solid var(--kx-line-2); border-radius: 0;
  font-family: inherit; font-size: 17px; font-weight: 300; outline: none;
  transition: border-color .25s;
}
.kx .kx-input:focus { border-bottom-color: var(--kx-fg); }
.kx .kx-input::placeholder { color: var(--kx-dim); }
.kx textarea.kx-input { resize: vertical; min-height: 110px; line-height: 1.6; }
.kx .kx-input[type="date"] { color-scheme: light; }
.kx[data-tono="noche"] .kx-input[type="date"] { color-scheme: dark; }
.kx .kx-ayuda { font-size: 13px; color: var(--kx-dim); line-height: 1.5; }

.kx .kx-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.kx .kx-chip {
  min-height: 40px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--kx-line-2);
  font-size: 14px; color: var(--kx-mute); transition: background-color .3s var(--kx-ez), color .3s, border-color .3s;
}
.kx .kx-chip:hover { color: var(--kx-fg); border-color: var(--kx-fg); }
.kx .kx-chip[aria-pressed="true"] { background: var(--kx-fg); color: var(--kx-bg); border-color: var(--kx-fg); }
.kx .kx-chips-scroll { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; margin: 0 calc(var(--kx-gut) * -1); padding: 0 var(--kx-gut); }
.kx .kx-chips-scroll::-webkit-scrollbar { display: none; }
.kx .kx-chips-scroll .kx-chip { flex-shrink: 0; }

.kx .kx-tag { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; background: var(--kx-fg); color: var(--kx-bg); font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; }

.kx .kx-nota { display: flex; gap: 16px; padding: 22px 24px; background: var(--kx-soft); border-left: 2px solid var(--kx-fg); }
.kx .kx-nota p { margin: 0; font-size: 15px; line-height: 1.65; }
.kx .kx-nota[data-tono="peligro"] { border-left-color: var(--kx-sos); }
.kx .kx-nota[data-tono="peligro"] svg { color: var(--kx-sos); }
.kx .kx-nota svg { flex-shrink: 0; margin-top: 2px; }

/* Lista de verificación */
.kx .kx-check-cab { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.kx .kx-check-cuenta { font-family: 'JetBrains Mono', monospace; font-size: clamp(40px, 5vw, 64px); font-weight: 300; letter-spacing: -.05em; line-height: 1; }
.kx .kx-check-cuenta small { font-size: .4em; color: var(--kx-mute); letter-spacing: 0; }
.kx .kx-barra { height: 2px; background: var(--kx-line); overflow: hidden; }
.kx .kx-barra > i { display: block; height: 100%; background: var(--kx-fg); transform-origin: left; transition: transform .6s var(--kx-ez); }
.kx .kx-check { list-style: none; margin: 8px 0 0; padding: 0; }
.kx .kx-check-item {
  width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 18px; align-items: start;
  padding: 20px 0; border-bottom: 1px solid var(--kx-line); text-align: left;
}
.kx .kx-circ {
  width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--kx-line-2);
  display: grid; place-items: center; position: relative; margin-top: 1px;
  transition: border-color .3s;
}
.kx .kx-circ::before { content: ""; position: absolute; inset: -1px; border-radius: 50%; background: var(--kx-fg); transform: scale(0); transition: transform .4s var(--kx-ez); }
.kx .kx-circ svg { position: relative; color: var(--kx-bg); opacity: 0; transform: scale(.4); transition: opacity .25s .08s, transform .4s .08s var(--kx-ez); }
.kx .kx-check-item[aria-checked="true"] .kx-circ { border-color: var(--kx-fg); }
.kx .kx-check-item[aria-checked="true"] .kx-circ::before { transform: scale(1); }
.kx .kx-check-item[aria-checked="true"] .kx-circ svg { opacity: 1; transform: none; }
.kx .kx-check-t { font-size: 18px; font-weight: 400; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; transition: opacity .3s; }
.kx .kx-check-d { font-size: 14.5px; line-height: 1.6; color: var(--kx-mute); margin-top: 6px; transition: opacity .3s; }
.kx .kx-check-item[aria-checked="true"] .kx-check-t,
.kx .kx-check-item[aria-checked="true"] .kx-check-d { opacity: .4; }
.kx .kx-check-listo { display: flex; align-items: center; gap: 12px; margin-top: 24px; font-size: 15px; animation: kx-up .5s var(--kx-ez) both; }

/* Paso a paso */
.kx .kx-pasos { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.4fr); gap: clamp(24px, 4vw, 56px); }
@media (max-width: 900px) { .kx .kx-pasos { grid-template-columns: 1fr; } }
.kx .kx-pasos-lista { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--kx-line-2); }
.kx .kx-paso-btn {
  width: 100%; display: flex; gap: 16px; align-items: baseline; padding: 16px 0; text-align: left;
  border-bottom: 1px solid var(--kx-line); color: var(--kx-mute); transition: color .3s;
}
.kx .kx-paso-btn:hover { color: var(--kx-fg); }
.kx .kx-paso-btn[aria-current="step"] { color: var(--kx-fg); }
.kx .kx-paso-btn span:first-child { font-family: 'JetBrains Mono', monospace; font-size: 11px; width: 22px; flex-shrink: 0; }
.kx .kx-paso-btn span:last-child { font-size: 16px; transition: transform .45s var(--kx-ez); }
.kx .kx-paso-btn[aria-current="step"] span:last-child { transform: translateX(8px); }
.kx .kx-paso-card { position: relative; min-height: 340px; padding: clamp(28px, 4vw, 48px); background: var(--kx-soft); display: flex; flex-direction: column; overflow: hidden; }
.kx .kx-paso-n { font-family: 'JetBrains Mono', monospace; font-size: clamp(96px, 14vw, 200px); font-weight: 300; letter-spacing: -.07em; line-height: .8; color: transparent; -webkit-text-stroke: 1px var(--kx-line); position: absolute; right: 20px; top: 20px; pointer-events: none; }
.kx .kx-paso-cuerpo { position: relative; flex: 1; animation: kx-up .45s var(--kx-ez) both; }
.kx .kx-paso-cuerpo h3 { font-size: clamp(26px, 3vw, 38px); font-weight: 300; letter-spacing: -.02em; line-height: 1.1; margin: 16px 0 16px; }
.kx .kx-paso-cuerpo p { font-size: 17px; line-height: 1.7; color: var(--kx-mute); margin: 0; max-width: 520px; }
.kx .kx-paso-nav { position: relative; display: flex; align-items: center; gap: 8px; margin-top: 28px; }
.kx .kx-redondo { width: 48px; height: 48px; border-radius: 50%; border: 1px solid var(--kx-line-2); display: grid; place-items: center; transition: background-color .3s, color .3s, transform .3s var(--kx-ez); }
.kx .kx-redondo:hover:not(:disabled) { background: var(--kx-fg); color: var(--kx-bg); }
.kx .kx-redondo:active:not(:disabled) { transform: scale(.94); }
.kx .kx-redondo:disabled { opacity: .3; cursor: default; }
.kx .kx-puntos { display: flex; gap: 6px; margin-left: auto; }
.kx .kx-puntos i { width: 18px; height: 2px; background: var(--kx-line-2); transition: background-color .3s; }
.kx .kx-puntos i[data-on="1"] { background: var(--kx-fg); }

/* Grilla de tarjetas simples */
.kx .kx-grilla { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); border-top: 1px solid var(--kx-line-2); }
.kx .kx-grilla > * { padding: 28px 24px 32px 0; border-bottom: 1px solid var(--kx-line); }
.kx .kx-grilla-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); column-gap: 40px; }
.kx .kx-celda-t { font-size: 19px; font-weight: 400; margin: 12px 0 10px; }
.kx .kx-celda-v { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--kx-mute); letter-spacing: .1em; }

/* Acordeón */
.kx .kx-acordeon { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--kx-line-2); }
.kx .kx-acordeon li { border-bottom: 1px solid var(--kx-line); }
.kx .kx-acordeon-btn { width: 100%; display: flex; align-items: center; gap: 20px; padding: 24px 0; text-align: left; min-height: 44px; }
.kx .kx-acordeon-btn .kx-mono { font-size: 11px; color: var(--kx-mute); width: 22px; flex-shrink: 0; }
.kx .kx-acordeon-btn strong { flex: 1; font-size: clamp(18px, 1.8vw, 22px); font-weight: 400; }
.kx .kx-mas { position: relative; width: 14px; height: 14px; flex-shrink: 0; }
.kx .kx-mas::before, .kx .kx-mas::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: currentColor; transition: transform .45s var(--kx-ez); }
.kx .kx-mas::after { transform: rotate(90deg); }
.kx [aria-expanded="true"] .kx-mas::after { transform: rotate(0deg); }
.kx .kx-acordeon-cuerpo { padding: 0 34px 28px 42px; animation: kx-up .4s var(--kx-ez) both; }
.kx .kx-acordeon-cuerpo p { margin: 0; font-size: 16px; line-height: 1.75; color: var(--kx-mute); max-width: 680px; }

/* Tabla simple */
.kx .kx-tabla { width: 100%; border-collapse: collapse; }
.kx .kx-tabla th { text-align: left; padding: 0 16px 14px 0; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; color: var(--kx-mute); border-bottom: 1px solid var(--kx-line-2); }
.kx .kx-tabla td { padding: 18px 16px 18px 0; border-bottom: 1px solid var(--kx-line); font-size: 15px; vertical-align: top; }
.kx .kx-tabla td:nth-child(2) { font-family: 'JetBrains Mono', monospace; white-space: nowrap; }
.kx .kx-tabla td:last-child { color: var(--kx-mute); }
@media (max-width: 640px) {
  .kx .kx-tabla thead { display: none; }
  .kx .kx-tabla tr { display: grid; grid-template-columns: 1fr auto; padding: 16px 0; border-bottom: 1px solid var(--kx-line); }
  .kx .kx-tabla td { border: 0; padding: 0; }
  .kx .kx-tabla td:last-child { grid-column: 1 / -1; margin-top: 6px; font-size: 14px; }
}

/* Anatomía */
.kx .kx-anat { position: relative; padding: 56px 72px 72px; background: var(--kx-soft); }
.kx .kx-anat-img { position: relative; }
.kx .kx-anat-img img { width: 100%; height: auto; filter: var(--kx-plano); opacity: .8; }
.kx .kx-anat-img img[data-espejo="1"] { transform: scaleX(-1); }
.kx .kx-marca-a {
  position: absolute; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .2em; text-transform: uppercase;
  color: var(--kx-mute); transition: opacity .35s var(--kx-ez), color .35s, transform .45s var(--kx-ez); white-space: nowrap;
  display: flex; align-items: center; gap: 8px; min-height: 32px;
}
.kx .kx-anat[data-sel] .kx-marca-a { opacity: .28; }
.kx .kx-anat .kx-marca-a[data-on="1"] { opacity: 1; color: var(--kx-fg); }
.kx .kx-cota { position: absolute; background: var(--kx-line-2); transition: opacity .35s, background-color .35s; }
.kx .kx-anat[data-sel] .kx-cota { opacity: .3; }
.kx .kx-anat .kx-cota[data-on="1"] { opacity: 1; background: var(--kx-fg); }
.kx .kx-marca-a[data-p="proa"]     { left: 0; top: 50%; transform: translate(calc(-100% - 14px), -50%); }
.kx .kx-marca-a[data-p="popa"]     { right: 0; top: 50%; transform: translate(calc(100% + 14px), -50%); }
.kx .kx-marca-a[data-p="estribor"] { left: 34%; top: 16%; transform: translate(-50%, -50%); }
.kx .kx-marca-a[data-p="babor"]    { left: 34%; top: 84%; transform: translate(-50%, -50%); }
.kx .kx-marca-a[data-p="eslora-t"] { left: 50%; top: 100%; transform: translate(-50%, 6px); }
.kx .kx-marca-a[data-p="manga-t"]  { left: 66%; top: 16%; transform: translate(-50%, -50%); }
.kx .kx-cota[data-p="eslora"] { left: 3%; right: 3%; top: 100%; height: 1px; }
.kx .kx-cota[data-p="eslora"]::before, .kx .kx-cota[data-p="eslora"]::after { content: ""; position: absolute; top: -5px; width: 1px; height: 11px; background: inherit; }
.kx .kx-cota[data-p="eslora"]::before { left: 0; }
.kx .kx-cota[data-p="eslora"]::after { right: 0; }
.kx .kx-cota[data-p="manga"] { left: 66%; top: 24%; bottom: 24%; width: 1px; }
.kx .kx-cota[data-p="manga"]::before, .kx .kx-cota[data-p="manga"]::after { content: ""; position: absolute; left: -5px; width: 11px; height: 1px; background: inherit; }
.kx .kx-cota[data-p="manga"]::before { top: 0; }
.kx .kx-cota[data-p="manga"]::after { bottom: 0; }
@media (max-width: 720px) {
  .kx .kx-marca-a[data-p="proa"] { left: 0; top: 0; transform: translateY(-100%); }
  .kx .kx-marca-a[data-p="popa"] { right: 0; left: auto; top: 0; transform: translateY(-100%); }
  .kx .kx-marca-a[data-p="estribor"] { top: 14%; }
  .kx .kx-marca-a[data-p="babor"] { top: 86%; }
}
.kx .kx-anat-lista { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-top: 24px; border-top: 1px solid var(--kx-line-2); }
.kx .kx-anat-lista button { text-align: left; padding: 18px 16px 18px 0; border-bottom: 1px solid var(--kx-line); display: flex; flex-direction: column; gap: 6px; transition: opacity .3s; }
.kx .kx-anat-lista button strong { font-size: 19px; font-weight: 400; display: flex; align-items: center; gap: 10px; }
.kx .kx-anat-lista button strong::before { content: ""; width: 7px; height: 7px; border-radius: 50%; border: 1px solid currentColor; transition: background-color .3s; }
.kx .kx-anat-lista button[aria-pressed="true"] strong::before { background: currentColor; }
.kx .kx-anat-lista button span { font-size: 14px; color: var(--kx-mute); line-height: 1.55; }
@media (max-width: 720px) {
  .kx .kx-anat { padding: 44px 16px 56px; }
  .kx .kx-anat-lista { grid-template-columns: 1fr 1fr; }
}

/* Diagrama de energía */
.kx .kx-flujo { width: 100%; height: auto; display: block; }
@media (max-width: 560px) { .kx .kx-flujo { display: none; } }
.kx .kx-flujo text { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; fill: currentColor; }
.kx .kx-flujo .kx-f-base { stroke: var(--kx-line-2); stroke-width: 1; fill: none; stroke-dasharray: 3 5; }
.kx .kx-flujo .kx-f-act { stroke: currentColor; stroke-width: 1.5; fill: none; opacity: 0; transition: opacity .5s var(--kx-ez); }
.kx .kx-flujo .kx-f-act[data-on="1"] { opacity: 1; }
.kx .kx-flujo .kx-f-nodo { fill: var(--kx-bg); stroke: var(--kx-line-2); transition: fill .4s, stroke .4s; }
.kx .kx-flujo g[data-on="1"] .kx-f-nodo { fill: var(--kx-fg); stroke: var(--kx-fg); }
.kx .kx-flujo g[data-on="1"] text.kx-f-in { fill: var(--kx-bg); }
.kx .kx-flujo g.kx-f-btn { cursor: pointer; }
.kx .kx-flujo g.kx-f-btn:hover .kx-f-nodo { stroke: var(--kx-fg); }
.kx .kx-flujo .kx-f-dim { opacity: .55; }

/* Números grandes */
.kx .kx-cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); border-top: 1px solid var(--kx-line-2); }
.kx .kx-cifras > div { padding: 24px 20px 24px 0; }
.kx .kx-cifra { font-family: 'JetBrains Mono', monospace; font-size: clamp(40px, 5vw, 72px); font-weight: 300; letter-spacing: -.05em; line-height: 1; margin-top: 12px; }
.kx .kx-cifra small { font-size: .3em; letter-spacing: .08em; color: var(--kx-mute); margin-left: 8px; }

/* Control deslizante */
.kx .kx-rango { -webkit-appearance: none; appearance: none; width: 100%; height: 32px; background: transparent; cursor: pointer; }
.kx .kx-rango::-webkit-slider-runnable-track { height: 1px; background: var(--kx-line-2); }
.kx .kx-rango::-moz-range-track { height: 1px; background: var(--kx-line-2); }
.kx .kx-rango::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: var(--kx-fg); margin-top: -11px; transition: transform .25s var(--kx-ez); }
.kx .kx-rango::-moz-range-thumb { width: 22px; height: 22px; border: 0; border-radius: 50%; background: var(--kx-fg); }
.kx .kx-rango:active::-webkit-slider-thumb { transform: scale(1.2); }

/* Segmentado */
.kx .kx-seg { display: inline-flex; border: 1px solid var(--kx-line-2); border-radius: 999px; padding: 3px; gap: 2px; flex-wrap: wrap; }
.kx .kx-seg button { min-height: 34px; padding: 0 14px; border-radius: 999px; font-size: 13px; color: var(--kx-mute); transition: background-color .3s var(--kx-ez), color .3s; }
.kx .kx-seg button[aria-pressed="true"] { background: var(--kx-fg); color: var(--kx-bg); }
.kx .kx-seg button[aria-pressed="true"][data-tono="alerta"] { background: var(--kx-sos); color: #fff; }

/* Glosario */
.kx .kx-glosa-buscar { position: relative; }
.kx .kx-glosa-buscar input { font-size: clamp(24px, 3vw, 40px); min-height: 72px; padding-left: 44px; }
.kx .kx-glosa-buscar svg { position: absolute; left: 0; top: 50%; transform: translateY(-50%); color: var(--kx-mute); }
.kx .kx-glosa { list-style: none; margin: 32px 0 0; padding: 0; columns: 2; column-gap: 56px; }
@media (max-width: 800px) { .kx .kx-glosa { columns: 1; } }
.kx .kx-glosa li { break-inside: avoid; padding: 20px 0; border-top: 1px solid var(--kx-line); scroll-margin-top: calc(var(--kx-bar) + 40px); }
.kx .kx-glosa li[data-letra]::before { content: attr(data-letra); display: block; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--kx-dim); margin-bottom: 10px; letter-spacing: .2em; }
.kx .kx-glosa strong { display: block; font-size: 20px; font-weight: 400; margin-bottom: 6px; }
.kx .kx-glosa p { margin: 0; font-size: 15px; line-height: 1.65; color: var(--kx-mute); }
.kx .kx-glosa li:target, .kx .kx-glosa li[data-foco="1"] { animation: kx-fade .8s var(--kx-ez) both; }
.kx .kx-glosa li[data-foco="1"] strong { text-decoration: underline; text-underline-offset: 6px; text-decoration-thickness: 1px; }

/* Videos */
.kx .kx-videos { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 40px 24px; }
.kx .kx-video { text-align: left; display: flex; flex-direction: column; gap: 16px; }
.kx .kx-video-img { position: relative; aspect-ratio: 16 / 10; overflow: hidden; background: var(--kx-soft); }
.kx .kx-video-img img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.05); transition: transform .9s var(--kx-ez), filter .6s; }
.kx .kx-video:hover .kx-video-img img { transform: scale(1.05); filter: grayscale(.2); }
.kx .kx-video-play { position: absolute; left: 20px; bottom: 20px; width: 52px; height: 52px; border-radius: 50%; background: #fff; color: #0b0b0b; display: grid; place-items: center; transition: transform .5s var(--kx-ez); }
.kx .kx-video:hover .kx-video-play { transform: scale(1.12); }
.kx .kx-video-meta { display: flex; justify-content: space-between; gap: 12px; }

/* Capas (modales) */
.kx .kx-capa { position: fixed; inset: 0; z-index: 80; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgba(0, 0, 0, .94); color: #f2f2f0; animation: kx-fade .3s var(--kx-ez) both; }
.kx .kx-capa-cuerpo { width: 100%; max-width: 1080px; animation: kx-up .45s .05s var(--kx-ez) both; }
.kx .kx-capa-cerrar { position: absolute; top: 16px; right: 16px; width: 48px; height: 48px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); display: grid; place-items: center; transition: transform .4s var(--kx-ez), background-color .3s; }
.kx .kx-capa-cerrar:hover { transform: rotate(90deg); background: rgba(255,255,255,.08); }

/* Buscador */
.kx .kx-buscador { position: fixed; inset: 0; z-index: 55; overflow-y: auto; padding: calc(var(--kx-bar) + 32px) var(--kx-gut) 48px; animation: kx-fade .3s var(--kx-ez) both; }
.kx .kx-buscador-in { max-width: 920px; margin: 0 auto; }
.kx .kx-buscador input { font-size: clamp(30px, 5vw, 64px); font-weight: 300; letter-spacing: -.03em; min-height: 90px; animation: kx-up .45s var(--kx-ez) both; }
.kx .kx-res { list-style: none; margin: 24px 0 0; padding: 0; }
.kx .kx-res li { animation: kx-up .4s var(--kx-ez) both; animation-delay: calc(var(--i) * 25ms); }
.kx .kx-res button { width: 100%; display: grid; grid-template-columns: 120px minmax(0, 1fr) 20px; gap: 20px; align-items: baseline; padding: 18px 0; border-bottom: 1px solid var(--kx-line); text-align: left; transition: opacity .25s, transform .4s var(--kx-ez); }
.kx .kx-res button[data-activo="1"] { transform: translateX(10px); }
.kx .kx-res:hover button:not(:hover) { opacity: .45; }
.kx .kx-res strong { display: block; font-size: 20px; font-weight: 400; }
.kx .kx-res span.kx-res-d { display: block; font-size: 14px; color: var(--kx-mute); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 640px) { .kx .kx-res button { grid-template-columns: minmax(0, 1fr) 20px; } .kx .kx-res .kx-eyebrow { display: none; } }

/* Emergencia */
.kx .kx-sos-capa { position: fixed; inset: 0; z-index: 90; overflow-y: auto; background: #000; color: #f2f2f0; animation: kx-fade .25s var(--kx-ez) both; }
.kx .kx-sos-capa .kx-wrap { padding-top: 24px; padding-bottom: 64px; }
.kx .kx-sos-cab { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,.12); }
.kx .kx-sos-t { font-size: clamp(56px, 12vw, 160px); font-weight: 300; letter-spacing: -.06em; line-height: .9; margin: 40px 0 32px; color: var(--kx-sos); }
.kx .kx-tels { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.kx .kx-tel { display: flex; flex-direction: column; gap: 10px; padding: 22px; border: 1px solid rgba(255,255,255,.16); min-height: 44px; transition: background-color .3s, border-color .3s; }
.kx a.kx-tel:hover { background: rgba(229, 72, 77, .12); border-color: var(--kx-sos); }
.kx .kx-tel strong { font-family: 'JetBrains Mono', monospace; font-size: clamp(26px, 3.4vw, 40px); font-weight: 400; letter-spacing: -.03em; }
.kx .kx-sos-tabs { display: flex; gap: 8px; margin: 48px 0 8px; flex-wrap: wrap; }
.kx .kx-sos-tab { min-height: 52px; padding: 0 22px; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); font-size: 16px; transition: background-color .3s, color .3s, border-color .3s; }
.kx .kx-sos-tab[aria-pressed="true"] { background: var(--kx-sos); border-color: var(--kx-sos); color: #fff; }
.kx .kx-sos-pasos { list-style: none; margin: 0; padding: 0; }
.kx .kx-sos-pasos li { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 20px; padding: 28px 0; border-bottom: 1px solid rgba(255,255,255,.1); animation: kx-up .45s var(--kx-ez) both; animation-delay: calc(var(--i) * 70ms); }
.kx .kx-sos-pasos b { font-family: 'JetBrains Mono', monospace; font-size: 44px; font-weight: 300; letter-spacing: -.05em; color: var(--kx-sos); line-height: 1; }
.kx .kx-sos-pasos h3 { font-size: clamp(22px, 2.6vw, 30px); font-weight: 400; margin: 0 0 8px; letter-spacing: -.01em; }
.kx .kx-sos-pasos p { margin: 0; font-size: 17px; line-height: 1.65; color: #a8a8a8; }
@media (max-width: 720px) {
  .kx .kx-tels { grid-template-columns: 1fr; }
  .kx .kx-sos-pasos li { grid-template-columns: 52px minmax(0, 1fr); }
  .kx .kx-sos-pasos b { font-size: 32px; }
}

/* Postventa */
.kx .kx-soporte { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: clamp(40px, 6vw, 96px); }
@media (max-width: 960px) { .kx .kx-soporte { grid-template-columns: 1fr; } }
.kx .kx-form { display: flex; flex-direction: column; gap: 32px; }
.kx .kx-subir { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 120px; padding: 20px; border: 1px dashed var(--kx-line-2); text-align: center; color: var(--kx-mute); transition: border-color .3s, background-color .3s; width: 100%; }
.kx .kx-subir:hover, .kx .kx-subir[data-arrastre="1"] { border-color: var(--kx-fg); color: var(--kx-fg); background: var(--kx-soft); }
.kx .kx-adjuntos { display: flex; gap: 10px; flex-wrap: wrap; }
.kx .kx-adjunto { position: relative; width: 76px; height: 76px; background: var(--kx-soft); overflow: hidden; animation: kx-pop .35s var(--kx-ez) both; }
.kx .kx-adjunto img { width: 100%; height: 100%; object-fit: cover; }
.kx .kx-adjunto button { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border-radius: 50%; background: rgba(0,0,0,.7); color: #fff; display: grid; place-items: center; }
.kx .kx-ticket { padding: 24px 0; border-bottom: 1px solid var(--kx-line); }
.kx .kx-ticket-cab { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
.kx .kx-estado { display: inline-flex; align-items: center; gap: 8px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; white-space: nowrap; }
.kx .kx-estado i { width: 7px; height: 7px; border-radius: 50%; border: 1px solid currentColor; }
.kx .kx-estado[data-e="en_proceso"] i { background: linear-gradient(90deg, currentColor 50%, transparent 50%); }
.kx .kx-estado[data-e="solucionado"] i { background: currentColor; }
.kx .kx-respuesta { margin-top: 14px; padding: 16px 18px; background: var(--kx-soft); border-left: 2px solid var(--kx-fg); font-size: 15px; line-height: 1.65; }
.kx .kx-enviado { padding: 48px 0; animation: kx-up .5s var(--kx-ez) both; }
.kx .kx-enviado-circ { width: 72px; height: 72px; border-radius: 50%; background: var(--kx-fg); color: var(--kx-bg); display: grid; place-items: center; animation: kx-pop .5s var(--kx-ez) both; }

/* Esqueleto de carga */
.kx .kx-esq { height: 72px; background: var(--kx-soft); margin-bottom: 8px; animation: kx-fade .8s ease-in-out infinite alternate; }

/* Cargando */
.kx-carga { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; background: #0b0b0b; color: #f2f2f0; font-family: 'Outfit', system-ui, sans-serif; }
.kx-carga span { font-size: 13px; letter-spacing: .5em; font-weight: 500; padding-left: .5em; animation: kx-fade .8s both; }
.kx-carga i { width: 120px; height: 1px; background: #f2f2f0; animation: kx-load 1.6s cubic-bezier(.65,0,.35,1) infinite; }
`;
