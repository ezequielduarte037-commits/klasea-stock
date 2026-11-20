// Pantalla Remitos. Todo bajo `.rmt-root`; sólo tokens del tema (nada de ámbar).

export const CSS_REMITOS = `
.rmt-root {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0;
  font-family: 'Outfit', system-ui, sans-serif; color: var(--text);
}
.rmt-root .rmt-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rmt-root .rmt-sede { display: flex; gap: 6px; }
.rmt-root .rmt-acciones .ui-chip { min-height: 32px; padding: 0 12px; font-size: 12.5px; }
.rmt-root .rmt-acciones .ui-chip.is-activa { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.rmt-root .rmt-estado-escaner { display: inline-flex; align-items: center; gap: 7px; }
.rmt-root .rmt-punto { width: 8px; height: 8px; border-radius: 50%; background: var(--dim); flex-shrink: 0; }
.rmt-root .rmt-punto.is-ok { background: var(--green); box-shadow: 0 0 0 3px var(--green-soft); }
.rmt-root .rmt-punto.is-medio { background: var(--cyan); }

/* ── Cuerpo: carpetas a la izquierda, lista a la derecha ── */
.rmt-root .rmt { flex: 1; min-height: 0; display: grid; grid-template-columns: 272px minmax(0, 1fr); }
.rmt-root .rmt-aside { min-height: 0; overflow-y: auto; border-right: 1px solid var(--border); padding: 16px 12px 28px; display: flex; flex-direction: column; gap: 16px; }
.rmt-root .rmt-main { min-height: 0; min-width: 0; overflow-y: auto; padding: 0 28px 48px; }

.rmt-root .rmt-vistas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.rmt-root .rmt-vista { min-height: 32px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; font-weight: 500; padding: 0 6px; }
.rmt-root .rmt-vista:hover { color: var(--text); }
.rmt-root .rmt-vista.is-activa { background: var(--blue-soft); color: var(--blue); font-weight: 600; }

.rmt-root .rmt-grupo { display: grid; gap: 1px; }
.rmt-root .rmt-rotulo { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding: 4px 10px 6px; }
.rmt-root .rmt-carpeta {
  display: flex; align-items: center; gap: 9px; width: 100%; min-height: 36px; padding: 0 10px;
  border: 0; border-radius: 8px; background: transparent; color: var(--text); font: inherit; font-size: 13.5px; text-align: left;
}
.rmt-root .rmt-carpeta:hover { background: var(--panel-2); }
.rmt-root .rmt-carpeta > svg { color: var(--dim); flex-shrink: 0; }
.rmt-root .rmt-carpeta-nombre { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rmt-root .rmt-cuenta { font-size: 12px; color: var(--dim); font-variant-numeric: tabular-nums; }
.rmt-root .rmt-carpeta.is-activa { background: var(--blue-soft); color: var(--blue); font-weight: 500; }
.rmt-root .rmt-carpeta.is-activa > svg, .rmt-root .rmt-carpeta.is-activa .rmt-cuenta { color: var(--blue); }
.rmt-root .rmt-carpeta.is-alerta .rmt-cuenta { color: var(--cyan); font-weight: 600; }
.rmt-root .rmt-aside-vacio { font-size: 12.5px; color: var(--dim); padding: 4px 10px; line-height: 1.5; }

/* ── Encabezado de la lista ── */
.rmt-root .rmt-cab {
  position: sticky; top: 0; z-index: 2; background: var(--bg);
  display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; padding: 20px 0 12px; border-bottom: 1px solid var(--border);
}
.rmt-root .rmt-titulo { margin: 0; font-size: 26px; font-weight: 300; letter-spacing: .01em; line-height: 1.15; min-width: 0; overflow-wrap: anywhere; }
.rmt-root .rmt-titulo small { margin-left: 10px; font-size: 14px; font-weight: 400; color: var(--dim); font-variant-numeric: tabular-nums; }
.rmt-root .rmt-buscar { margin-left: auto; display: flex; align-items: center; gap: 8px; width: min(340px, 100%); border-bottom: 1px solid var(--border-2); padding: 6px 2px; color: var(--dim); }
.rmt-root .rmt-buscar:focus-within { border-color: var(--blue); color: var(--blue); }
.rmt-root .rmt-buscar input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; box-shadow: none; font: inherit; font-size: 14px; color: var(--text); padding: 0; }
/* El tema claro pinta todos los inputs con fondo y borde (!important): éste es una línea sola. */
html .rmt-root .rmt-buscar input[type="search"]:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]), html .rmt-root .rmt-buscar input[type="search"]:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):focus { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
.rmt-root .rmt-buscar button { border: 0; background: transparent; color: var(--dim); display: grid; place-items: center; padding: 2px; }
.rmt-root .rmt-buscar-todo { border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 12.5px; font-weight: 500; padding: 0; }

/* ── Filas ── */
.rmt-root .rmt-mes { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); padding: 22px 10px 8px; }
.rmt-root .rmt-fila {
  display: grid; grid-template-columns: 40px minmax(0, 1.5fr) 76px minmax(0, 1.25fr) 16px; align-items: center; gap: 14px;
  width: 100%; min-height: 62px; padding: 9px 10px; border: 0; border-bottom: 1px solid var(--border);
  background: transparent; color: var(--text); font: inherit; text-align: left;
}
.rmt-root .rmt-fila:hover { background: var(--panel); }
.rmt-root .rmt-fila > svg { color: var(--dim); }
.rmt-root .rmt-doc { width: 40px; height: 40px; border-radius: 8px; display: grid; place-items: center; border: 1px solid var(--border); background: var(--panel-2); color: var(--muted); }
.rmt-root .rmt-nombre { font-size: 15px; font-weight: 500; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.rmt-root .rmt-detalle { margin-top: 2px; font-size: 12.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rmt-root .rmt-fecha { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rmt-root .rmt-lugares { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.rmt-root .rmt-lugar { display: inline-flex; align-items: center; gap: 4px; max-width: 100%; font-size: 11.5px; font-weight: 500; padding: 2px 7px; border-radius: 6px; border: 1px solid var(--border-2); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rmt-root .rmt-lugar.is-barco { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.rmt-root .rmt-lugar.is-carpeta { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.rmt-root .rmt-lugar.is-ingreso { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.rmt-root .rmt-lugar.is-suelto { border-style: dashed; color: var(--dim); }
.rmt-root .rmt-vacio { padding: 56px 16px; text-align: center; color: var(--dim); font-size: 13.5px; line-height: 1.55; }
.rmt-root .rmt-vacio strong { display: block; color: var(--text); font-size: 16px; font-weight: 500; margin-bottom: 4px; }
.rmt-root .rmt-mas { display: flex; justify-content: center; padding: 18px 0 0; }

/* ── Lo que está en la PC del escáner ── */
.rmt-root .rmt-pc { margin-top: 20px; border: 1px solid var(--blue-border); border-radius: 12px; background: var(--panel); overflow: hidden; }
.rmt-root .rmt-pc-cab { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; font-weight: 600; }
.rmt-root .rmt-pc-cab svg { color: var(--blue); }
.rmt-root .rmt-pc-cab small { font-weight: 400; color: var(--dim); font-size: 12.5px; }
.rmt-root .rmt-pc-fila { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--border); }
.rmt-root .rmt-pc-fila:last-child { border-bottom: 0; }
.rmt-root .rmt-pc-texto { flex: 1; min-width: 200px; display: grid; gap: 4px; }
.rmt-root .rmt-pc-texto strong { font-size: 13.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rmt-root .rmt-pc-texto span { font-size: 12px; color: var(--dim); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rmt-root .rmt-aviso { margin-top: 16px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel); font-size: 13px; color: var(--muted); line-height: 1.45; }
.rmt-root .rmt-aviso > svg { flex-shrink: 0; }
.rmt-root .rmt-aviso.is-azul { border-color: var(--blue-border); background: var(--blue-soft); }
.rmt-root .rmt-aviso.is-azul > svg { color: var(--blue); }
.rmt-root .rmt-aviso.is-rojo { border-color: var(--red-border); background: var(--red-soft); color: var(--red); }
.rmt-root .rmt-aviso-texto { flex: 1; min-width: 180px; }
.rmt-root .rmt-aviso-texto strong { color: var(--text); font-weight: 600; }

/* ── Barra del celular ── */
.rmt-root .rmt-movil { display: none; }

/* ── Hojas (detalle, datos, escáner) ── */
.rmt-root .rmt-capa {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9990;
  display: flex; justify-content: flex-end; background: var(--overlay-strong);
  animation: rmt-aparece .18s cubic-bezier(.22,1,.36,1);
}
.rmt-root .rmt-hoja {
  width: min(580px, 100%); height: 100%; display: flex; flex-direction: column; outline: none;
  background: var(--panel-solid); border-left: 1px solid var(--border); box-shadow: var(--elev-2);
  animation: rmt-entra .28s cubic-bezier(.22,1,.36,1);
}
.rmt-root .rmt-hoja.is-chica { width: min(480px, 100%); }
.rmt-root .rmt-hoja-cab { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.rmt-root .rmt-hoja-titulo { font-size: 18px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.rmt-root .rmt-hoja-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); overflow-wrap: anywhere; }
.rmt-root .rmt-cerrar { margin-left: auto; flex-shrink: 0; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--border-2); border-radius: 9px; background: transparent; color: var(--muted); }
.rmt-root .rmt-cerrar:hover { color: var(--text); background: var(--panel-2); }
.rmt-root .rmt-hoja-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px; display: grid; gap: 18px; align-content: start; }
.rmt-root .rmt-hoja-pie { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--panel); }
.rmt-root .rmt-hoja-pie .rmt-izq { margin-right: auto; }

.rmt-root .rmt-campo { display: grid; gap: 6px; }
.rmt-root .rmt-campo > label, .rmt-root .rmt-campo > .rmt-campo-titulo { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.rmt-root .rmt-campo > label small, .rmt-root .rmt-campo > .rmt-campo-titulo small { text-transform: none; letter-spacing: 0; font-weight: 400; }
.rmt-root .rmt-campos-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rmt-root .rmt-campo textarea.ui-input { min-height: 64px; resize: vertical; padding-top: 9px; }

.rmt-root .rmt-previa { position: relative; height: min(52vh, 560px); min-height: 260px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--panel-2); display: grid; place-items: center; }
.rmt-root .rmt-previa iframe { width: 100%; height: 100%; border: 0; background: var(--panel-2); }
.rmt-root .rmt-previa img { max-width: 100%; max-height: 100%; object-fit: contain; }
.rmt-root .rmt-previa-nada { color: var(--dim); font-size: 13px; text-align: center; padding: 16px; }
.rmt-root .rmt-datos { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.rmt-root .rmt-dato { padding: 10px 12px 10px 0; display: grid; gap: 3px; min-width: 0; }
.rmt-root .rmt-dato span { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.rmt-root .rmt-dato strong { font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.rmt-root .rmt-nota { font-size: 13.5px; color: var(--muted); line-height: 1.5; white-space: pre-wrap; }
.rmt-root .rmt-pc-ruta { display: flex; align-items: center; gap: 7px; font-size: 12px; color: var(--dim); }

@keyframes rmt-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes rmt-entra { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes rmt-sube { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 1100px) {
  .rmt-root .rmt-fila { grid-template-columns: 40px minmax(0, 1fr) 70px 16px; }
  .rmt-root .rmt-fila .rmt-lugares { grid-column: 2 / 4; grid-row: 2; }
  .rmt-root .rmt-fila > svg { grid-column: 4; grid-row: 1; }
}
@media (max-width: 899px) {
  .rmt-root .rmt { grid-template-columns: minmax(0, 1fr); }
  .rmt-root .rmt-aside { display: none; }
  .rmt-root .rmt-main { padding: 0 16px 40px; }
  .rmt-root .rmt-movil { display: grid; gap: 8px; padding: 12px 0 4px; }
  .rmt-root .rmt-movil-carpeta { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 42px; padding: 0 12px; border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel-solid); color: var(--text); font: inherit; font-size: 14px; text-align: left; }
  .rmt-root .rmt-movil-carpeta span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .rmt-root .rmt-cab { padding-top: 12px; }
  .rmt-root .rmt-titulo { display: none; }
  .rmt-root .rmt-cab { border-bottom: 0; padding-bottom: 4px; }
  .rmt-root .rmt-buscar { width: 100%; margin-left: 0; }
  .rmt-root .rmt-fila { gap: 10px; padding: 10px 2px; }
  .rmt-root .rmt-acciones .rmt-largo { display: none; }
}
@media (max-width: 640px) {
  .rmt-root .ui-ph { padding: 12px 16px 8px; }
  .rmt-root .rmt-capa { align-items: flex-end; }
  .rmt-root .rmt-hoja, .rmt-root .rmt-hoja.is-chica {
    width: 100%; height: auto; max-height: 94vh; border-left: 0; border-top: 1px solid var(--border);
    border-radius: 16px 16px 0 0; animation-name: rmt-sube;
  }
  .rmt-root .rmt-campos-2 { grid-template-columns: 1fr; }
  .rmt-root .rmt-previa { height: 44vh; }
  .rmt-root .rmt-hoja-pie .ui-btn { flex: 1; justify-content: center; }
  .rmt-root .rmt-hoja-pie .rmt-izq { flex: 0 0 auto; }
}
`;
