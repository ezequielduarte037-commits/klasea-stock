/**
 * Estilos de Conteo. Todo va con la clase `.cnt`, que llevan la raíz de la
 * pestaña y la capa de las hojas (que están en un portal), así nada se escapa
 * al resto de la app. Pensado primero para 390 px y una mano: blancos de 44 px
 * o más, números en JetBrains Mono, teal para cantidades de stock.
 */
export const CSS_CONTEO = `
  .cnt { font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
  .cnt .cnt-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .cnt .cnt-ayuda { margin: 6px 0 0; font-size: 12.5px; line-height: 1.4; color: var(--dim); }
  .cnt .cnt-centro { text-align: center; }

  /* ── Lista ─────────────────────────────────────────────────────────── */
  .cnt.cnt-root { max-width: 760px; margin: 0 auto; padding: 0 16px 40px; }
  .cnt .cnt-cabeza {
    position: sticky; top: 0; z-index: 3;
    margin: 0 -16px; padding: 12px 16px 10px;
    background: var(--bg); border-bottom: 1px solid var(--border);
  }
  .cnt .cnt-vistas { display: flex; gap: 6px; align-items: center; }
  .cnt .cnt-vistas > button[role="tab"] {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 7px;
    min-height: 42px; padding: 0 10px;
    border: 1px solid var(--border); border-radius: 11px;
    background: var(--panel); color: var(--dim);
    font: inherit; font-size: 14px; font-weight: 500;
    touch-action: manipulation;
  }
  .cnt .cnt-vistas > button.is-activa { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); font-weight: 600; }
  .cnt .cnt-recargar { flex-shrink: 0; }
  .cnt .cnt-girando { animation: cnt-giro .8s linear infinite; }
  @keyframes cnt-giro { to { transform: rotate(360deg); } }

  .cnt .cnt-progreso { margin-top: 12px; }
  .cnt .cnt-progreso-txt { display: flex; justify-content: space-between; align-items: baseline; font-size: 13.5px; color: var(--muted); margin-bottom: 6px; }
  .cnt .cnt-progreso-txt b { color: var(--text); font-weight: 700; font-size: 15px; }
  .cnt .cnt-progreso-pct { color: var(--dim); font-size: 12.5px; }
  .cnt .cnt-barra { height: 6px; border-radius: 999px; background: var(--panel-2); overflow: hidden; }
  .cnt .cnt-barra > span {
    display: block; height: 100%; border-radius: inherit; background: var(--brand-grad);
    transform-origin: left center; transition: transform .45s cubic-bezier(.22,1,.36,1);
  }

  .cnt .cnt-buscar { position: relative; margin-top: 10px; }
  .cnt .cnt-buscar .ui-input { min-height: 46px; padding-left: 40px; padding-right: 40px; font-size: 15px; }
  .cnt .cnt-buscar-ico { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
  .cnt .cnt-buscar-x {
    position: absolute; right: 4px; top: 50%; transform: translateY(-50%);
    width: 38px; height: 38px; display: grid; place-items: center;
    border: 0; border-radius: 9px; background: transparent; color: var(--dim);
  }
  .cnt .cnt-buscar .ui-input::-webkit-search-cancel-button { display: none; }

  .cnt .cnt-chips {
    display: flex; gap: 8px; margin-top: 10px; overflow-x: auto; scrollbar-width: none;
    -webkit-mask-image: linear-gradient(90deg, #000 88%, transparent);
    mask-image: linear-gradient(90deg, #000 88%, transparent);
    padding-right: 24px;
  }
  .cnt .cnt-chips::-webkit-scrollbar { display: none; }
  .cnt .cnt-chip {
    flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px;
    min-height: 36px; padding: 0 13px;
    border: 1px solid var(--border-2); border-radius: 999px;
    background: var(--panel); color: var(--muted);
    font: inherit; font-size: 13.5px; font-weight: 500; white-space: nowrap;
    touch-action: manipulation;
  }
  .cnt .cnt-chip .cnt-num { font-size: 12px; color: var(--dim); }
  .cnt .cnt-chip.is-activa { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); font-weight: 600; }
  .cnt .cnt-chip.is-activa .cnt-num { color: var(--blue); }
  .cnt .cnt-chip-agregar { color: var(--blue); border-color: var(--blue-border); }

  .cnt .cnt-guia {
    margin-top: 14px; padding: 14px 16px;
    border: 1px solid var(--blue-border); border-radius: var(--r-md); background: var(--blue-soft);
    font-size: 14px; line-height: 1.45;
  }
  .cnt .cnt-guia-tit { font-weight: 650; font-size: 15px; margin-bottom: 4px; }
  .cnt .cnt-guia ol { margin: 6px 0 8px; padding-left: 20px; }
  .cnt .cnt-guia li { margin: 3px 0; }
  .cnt .cnt-guia p { margin: 0 0 12px; color: var(--muted); }

  .cnt .cnt-listo {
    display: flex; align-items: center; gap: 8px; margin-top: 14px; padding: 12px 14px;
    border: 1px solid var(--green-border); border-radius: var(--r-md); background: var(--green-soft);
    color: var(--green); font-weight: 600; font-size: 14px;
  }

  .cnt .cnt-lista { margin-top: 6px; }
  .cnt .cnt-grupo { margin-top: 10px; }
  .cnt .cnt-grupo-tit {
    width: 100%; display: flex; align-items: center; gap: 8px;
    min-height: 40px; padding: 0 4px;
    border: 0; background: transparent; color: var(--dim);
    font: inherit; font-size: 12.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; text-align: left;
  }
  .cnt .cnt-grupo-nombre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cnt .cnt-grupo-cuenta { font-size: 12px; letter-spacing: 0; color: var(--subtle); }
  .cnt .cnt-grupo-cuenta.is-completo { color: var(--green); }

  .cnt .cnt-fila {
    width: 100%; display: flex; align-items: center; gap: 12px;
    min-height: 62px; padding: 10px 10px;
    border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text);
    font: inherit; text-align: left;
    transition: background-color .25s;
    touch-action: manipulation;
  }
  .cnt .cnt-grupo .cnt-fila:first-of-type { border-top: 1px solid var(--border); }
  .cnt .cnt-fila:active { background: var(--panel-2); }
  .cnt .cnt-fila.is-recien { background: var(--green-soft); }
  .cnt .cnt-fila-estado {
    width: 26px; height: 26px; flex-shrink: 0; display: grid; place-items: center;
    border: 2px solid var(--border-2); border-radius: 50%;
  }
  .cnt .cnt-fila.is-contado .cnt-fila-estado { border-color: var(--green-border); background: var(--green-soft); color: var(--green); }
  .cnt .cnt-fila-cuerpo { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .cnt .cnt-fila-desc { font-size: 15px; font-weight: 500; line-height: 1.25; overflow-wrap: anywhere; }
  .cnt .cnt-fila.is-contado .cnt-fila-desc { color: var(--muted); }
  .cnt .cnt-fila-meta { font-size: 12.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cnt .cnt-fila-meta .cnt-num { font-size: 12px; }
  .cnt .cnt-fila-dato { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .cnt .cnt-fila-cant { font-size: 17px; font-weight: 600; color: var(--teal); }
  .cnt .cnt-fila-quien { font-size: 11.5px; color: var(--dim); white-space: nowrap; }
  .cnt .cnt-fila-ir { flex-shrink: 0; display: inline-flex; align-items: center; gap: 2px; color: var(--blue); font-size: 13.5px; font-weight: 600; }

  .cnt .cnt-vacio { padding: 28px 8px 8px; text-align: center; color: var(--dim); }
  .cnt .cnt-vacio p { margin: 0 0 14px; }
  .cnt .cnt-agregar-final { width: 100%; margin-top: 18px; min-height: 48px; color: var(--blue); border-style: dashed; }
  .cnt .cnt-error { margin: 32px auto; max-width: 420px; padding: 22px; text-align: center; }
  .cnt .cnt-error p { margin: 0 0 8px; }
  .cnt .cnt-error .ui-btn { margin-top: 12px; }

  @media (hover: hover) {
    .cnt .cnt-fila:hover { background: var(--panel); }
    .cnt .cnt-fila.is-recien:hover { background: var(--green-soft); }
  }

  /* ── Hoja de conteo ────────────────────────────────────────────────── */
  .cnt .cnt-hoja { display: flex; flex-direction: column; gap: 12px; }
  .cnt .cnt-ubic { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .cnt .cnt-ubic-lbl { display: inline-flex; align-items: center; gap: 5px; font-size: 13.5px; color: var(--muted); font-weight: 500; }
  .cnt .cnt-ubic-input {
    width: 120px; min-height: 42px; text-transform: uppercase;
    font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 15px; letter-spacing: .03em;
  }
  .cnt .cnt-ubic-ok { color: var(--green); display: inline-flex; }
  .cnt .cnt-ubic-igual { min-height: 36px; padding: 0 12px; font-size: 12.5px; font-weight: 500; color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
  .cnt .cnt-ubic-igual b { font-family: 'JetBrains Mono', ui-monospace, monospace; font-weight: 600; margin-left: 2px; }
  .cnt .cnt-hoja > .cnt-ayuda { margin-top: -6px; }

  .cnt .cnt-ya { padding: 12px; border: 1px solid var(--violet-border); border-radius: 12px; background: var(--violet-soft); }
  .cnt .cnt-ya-tit { font-size: 14px; line-height: 1.4; margin-bottom: 10px; }
  .cnt .cnt-ya-tit b { font-weight: 700; color: var(--text); }
  .cnt .cnt-ya-quien { color: var(--dim); }
  .cnt .cnt-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .cnt .cnt-seg > button {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    min-height: 44px; padding: 4px 8px;
    border: 1px solid var(--border-2); border-radius: 10px;
    background: var(--panel-solid); color: var(--muted);
    font: inherit; font-size: 13.5px; font-weight: 500; line-height: 1.2; text-align: center;
    touch-action: manipulation;
  }
  .cnt .cnt-seg > button.is-activa { background: var(--blue-soft); border-color: var(--blue); color: var(--blue); font-weight: 600; }
  .cnt .cnt-seg > button:disabled { opacity: .45; }

  .cnt .cnt-aviso {
    padding: 10px 12px; border: 1px solid var(--cyan-border); border-radius: 12px; background: var(--cyan-soft);
    font-size: 13.5px; line-height: 1.4; color: var(--text);
  }
  .cnt .cnt-aviso-btn { margin-top: 6px; padding: 0 6px; color: var(--cyan); }

  .cnt .cnt-display {
    position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 6px 0 2px;
  }
  .cnt .cnt-display-num { font-size: 60px; font-weight: 700; line-height: 1; letter-spacing: -.02em; color: var(--text); }
  .cnt .cnt-display-num.is-vacio { color: var(--subtle); }
  .cnt .cnt-unidad {
    display: inline-flex; align-items: center; min-height: 30px; padding: 0 14px;
    border: 1px solid var(--teal-border); border-radius: 999px; background: var(--teal-soft);
    color: var(--teal); font-size: 16px; font-weight: 600;
  }
  .cnt .cnt-borrar { position: absolute; right: 0; top: 4px; min-height: 36px; padding: 0 10px; font-size: 13px; }
  .cnt .cnt-total { margin: -4px 0 0; text-align: center; font-size: 14px; color: var(--muted); }
  .cnt .cnt-total b { color: var(--text); font-weight: 700; }

  .cnt .cnt-peso { display: flex; flex-direction: column; gap: 10px; }
  .cnt .cnt-peso-campos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .cnt .cnt-campo {
    display: flex; flex-direction: column; align-items: flex-start; gap: 3px;
    min-height: 64px; padding: 9px 12px;
    border: 1px solid var(--border-2); border-radius: 12px; background: var(--panel);
    color: var(--text); font: inherit; text-align: left;
  }
  .cnt .cnt-campo.is-activo { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
  .cnt .cnt-campo-lbl { font-size: 12px; color: var(--dim); font-weight: 500; }
  .cnt .cnt-campo-val { font-size: 22px; font-weight: 600; }
  .cnt .cnt-campo-val small { font-size: 13px; color: var(--dim); font-weight: 500; }
  .cnt .cnt-balanza { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .cnt .cnt-balanza-error { font-size: 12.5px; color: var(--red); text-align: center; }

  .cnt .cnt-teclado { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .cnt .cnt-tecla {
    min-height: 56px; display: grid; place-items: center;
    border: 1px solid var(--border); border-radius: 14px; background: var(--panel-2);
    color: var(--text); font-family: 'JetBrains Mono', ui-monospace, monospace; font-size: 25px; font-weight: 500;
    touch-action: manipulation; user-select: none; -webkit-user-select: none;
    transition: transform .1s, background-color .1s;
  }
  .cnt .cnt-tecla:active { transform: scale(.96); background: var(--panel-3); }
  .cnt .cnt-tecla.is-accion { color: var(--muted); font-size: 19px; background: var(--panel); }
  .cnt .cnt-nota { min-height: 64px; padding: 10px 12px; resize: vertical; line-height: 1.4; }
  .cnt .cnt-nota-btn { align-self: center; font-size: 13px; color: var(--dim); }
  .cnt .cnt-guardar { width: 100%; min-height: 54px; font-size: 16px; border-radius: 12px; }

  /* ── Alta de producto ──────────────────────────────────────────────── */
  .cnt .cnt-alta { display: flex; flex-direction: column; gap: 6px; }
  .cnt .cnt-lbl { margin-top: 10px; font-size: 13px; font-weight: 600; color: var(--muted); }
  .cnt .cnt-alta > .cnt-lbl:first-child { margin-top: 0; }
  .cnt .cnt-opcional { font-weight: 400; color: var(--dim); }
  .cnt .cnt-parecidos { margin-top: 8px; padding: 10px; border: 1px solid var(--violet-border); border-radius: 12px; background: var(--violet-soft); }
  .cnt .cnt-parecidos-tit { font-size: 13px; color: var(--muted); margin-bottom: 6px; }
  .cnt .cnt-parecido {
    width: 100%; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
    min-height: 46px; padding: 7px 10px; margin-top: 4px;
    border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid);
    color: var(--text); font: inherit; text-align: left;
  }
  .cnt .cnt-parecido-desc { font-size: 14px; font-weight: 500; }
  .cnt .cnt-parecido-meta { font-size: 12px; color: var(--dim); }
  .cnt .cnt-chips-unidad { display: flex; flex-wrap: wrap; gap: 6px; }
  .cnt .cnt-opcion {
    min-height: 40px; padding: 0 14px;
    border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel);
    color: var(--muted); font: inherit; font-size: 14px; font-weight: 500;
  }
  .cnt .cnt-opcion.is-activa { background: var(--blue-soft); border-color: var(--blue); color: var(--blue); font-weight: 600; }

  @media (max-width: 640px) {
    .cnt.cnt-root { padding: 0 12px 32px; }
    .cnt .cnt-cabeza { margin: 0 -12px; padding: 10px 12px 8px; }
    .cnt .cnt-display-num { font-size: 56px; }
  }
  @media (max-height: 700px) and (max-width: 640px) {
    .cnt .cnt-tecla { min-height: 50px; }
    .cnt .cnt-display-num { font-size: 48px; }
    .cnt .cnt-hoja { gap: 10px; }
  }
`;
