// Pantalla Pedidos (bandeja y ficha). Todo bajo `.pdd-root`; sólo tokens del tema.

export const CSS_PEDIDOS = `
.pdd-root { flex: 1; min-height: 0; display: flex; flex-direction: column; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
.pdd-root .pdd-scroll { flex: 1; min-height: 0; overflow-y: auto; }

/* ── Barra de la bandeja ── */
.pdd-root .pdd-barra {
  position: sticky; top: 0; z-index: 3; background: var(--bg);
  display: flex; align-items: flex-end; gap: 10px 22px; flex-wrap: wrap; padding: 10px 28px 0; border-bottom: 1px solid var(--border);
}
.pdd-root .pdd-filtros { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.pdd-root .pdd-filtros::-webkit-scrollbar { display: none; }
.pdd-root .pdd-filtro {
  display: inline-flex; align-items: baseline; gap: 7px; flex-shrink: 0; padding: 10px 1px 11px; margin-bottom: -1px;
  border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); font: inherit; font-size: 14px; white-space: nowrap;
}
.pdd-root .pdd-filtro:hover { color: var(--text); }
.pdd-root .pdd-filtro.is-activo { color: var(--text); font-weight: 500; border-bottom-color: var(--blue); }
.pdd-root .pdd-filtro small { font-size: 12.5px; color: var(--dim); font-variant-numeric: tabular-nums; }
.pdd-root .pdd-filtro.is-alerta small { color: var(--red); font-weight: 600; }
.pdd-root .pdd-barra-der { margin-left: auto; display: flex; align-items: center; gap: 12px; padding-bottom: 8px; flex-wrap: wrap; }
.pdd-root .pdd-sede { display: flex; gap: 6px; }
.pdd-root .pdd-sede .ui-chip { min-height: 30px; padding: 0 11px; font-size: 12.5px; }
.pdd-root .pdd-sede .ui-chip.is-activa { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.pdd-root .pdd-buscar { display: flex; align-items: center; gap: 8px; width: min(320px, 100%); border-bottom: 1px solid var(--border-2); padding: 6px 2px; color: var(--dim); }
.pdd-root .pdd-buscar:focus-within { border-color: var(--blue); color: var(--blue); }
.pdd-root .pdd-buscar input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; box-shadow: none; font: inherit; font-size: 14px; color: var(--text); padding: 0; }
html .pdd-root .pdd-buscar input[type="search"]:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]),
html .pdd-root .pdd-buscar input[type="search"]:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):focus { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
.pdd-root .pdd-buscar button { border: 0; background: transparent; color: var(--dim); display: grid; place-items: center; padding: 2px; }

/* ── Filas de la bandeja ── */
.pdd-root .pdd-lista { padding: 6px 28px 48px; }
.pdd-root .pdd-fila {
  display: grid; grid-template-columns: 4px minmax(0, 1.6fr) minmax(170px, 230px) 92px 74px 16px; align-items: center; gap: 16px;
  width: 100%; min-height: 66px; padding: 10px 10px 10px 0; border: 0; border-bottom: 1px solid var(--border);
  background: transparent; color: var(--text); font: inherit; text-align: left;
}
.pdd-root .pdd-fila:hover { background: var(--panel); }
.pdd-root .pdd-fila > svg { color: var(--dim); }
.pdd-root .pdd-marca { width: 4px; height: 38px; border-radius: 4px; background: var(--dim); }
.pdd-root .pdd-marca.is-camino { background: var(--cyan); }
.pdd-root .pdd-marca.is-parcial { background: var(--violet); }
.pdd-root .pdd-marca.is-ok { background: var(--green); }
.pdd-root .pdd-marca.is-novedad { background: var(--red); }
.pdd-root .pdd-marca.is-apagado { background: var(--border-2); }
.pdd-root .pdd-nombre { display: block; font-size: 15px; font-weight: 500; line-height: 1.25; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
.pdd-root .pdd-sub { display: block; margin-top: 3px; font-size: 12.5px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdd-root .pdd-avance { display: grid; gap: 6px; min-width: 0; }
.pdd-root .pdd-barra-avance { display: flex; height: 5px; border-radius: 5px; overflow: hidden; background: var(--panel-2); }
.pdd-root .pdd-barra-avance i { display: block; height: 100%; }
.pdd-root .pdd-barra-avance .is-ok { background: var(--green); }
.pdd-root .pdd-barra-avance .is-parcial { background: var(--violet); }
.pdd-root .pdd-barra-avance .is-novedad { background: var(--red); }
.pdd-root .pdd-avance-texto { font-size: 12.5px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdd-root .pdd-avance-texto b { font-weight: 600; color: var(--text); }
.pdd-root .pdd-avance-texto em { font-style: normal; color: var(--red); font-weight: 500; }
.pdd-root .pdd-etiqueta { display: inline-flex; align-items: center; justify-self: start; font-size: 11.5px; font-weight: 500; padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border-2); color: var(--muted); white-space: nowrap; }
.pdd-root .pdd-etiqueta.is-urgente { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.pdd-root .pdd-etiqueta.is-alta { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.pdd-root .pdd-etiqueta.is-camino { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.pdd-root .pdd-etiqueta.is-parcial { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.pdd-root .pdd-etiqueta.is-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.pdd-root .pdd-etiqueta.is-novedad { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.pdd-root .pdd-fecha { font-size: 13px; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pdd-root .pdd-vacio { padding: 64px 16px; text-align: center; color: var(--dim); font-size: 13.5px; line-height: 1.55; }
.pdd-root .pdd-vacio strong { display: block; color: var(--text); font-size: 16px; font-weight: 500; margin-bottom: 4px; }
.pdd-root .pdd-mas { display: flex; justify-content: center; padding: 18px 0 0; }

/* ── Ficha del pedido ── */
.pdd-root .pdd-cab { padding: 16px 28px 18px; border-bottom: 1px solid var(--border); display: grid; gap: 12px; }
.pdd-root .pdd-volver { justify-self: start; display: inline-flex; align-items: center; gap: 6px; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 13px; padding: 2px 0; }
.pdd-root .pdd-volver:hover { color: var(--text); }
.pdd-root .pdd-cab-fila { display: flex; align-items: flex-start; gap: 12px 20px; flex-wrap: wrap; }
.pdd-root .pdd-titulo { margin: 0; font-size: 28px; font-weight: 300; line-height: 1.15; letter-spacing: .005em; overflow-wrap: anywhere; flex: 1 1 360px; min-width: 0; }
.pdd-root .pdd-titulo-editar { display: flex; gap: 8px; flex: 1 1 360px; min-width: 0; }
.pdd-root .pdd-titulo-editar .ui-input { font-size: 18px; }
.pdd-root .pdd-meta { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; font-size: 13px; color: var(--muted); }
.pdd-root .pdd-meta > span:not(.pdd-etiqueta) { display: inline-flex; align-items: center; gap: 6px; }
.pdd-root .pdd-meta svg { color: var(--dim); }
.pdd-root .pdd-acciones { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; position: relative; }
.pdd-root .pdd-menu {
  position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; min-width: 230px; padding: 6px;
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid); box-shadow: var(--elev-2); display: grid; gap: 2px;
}
.pdd-root .pdd-menu button { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 38px; padding: 0 10px; border: 0; border-radius: 8px; background: transparent; color: var(--text); font: inherit; font-size: 13.5px; text-align: left; }
.pdd-root .pdd-menu button:hover { background: var(--panel-2); }
.pdd-root .pdd-menu button.is-peligro { color: var(--red); }
.pdd-root .pdd-menu hr { border: 0; border-top: 1px solid var(--border); margin: 4px 2px; }

.pdd-root .pdd-cifras { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-top: 1px solid var(--border); }
.pdd-root .pdd-cifra { padding: 12px 16px 2px 0; display: grid; gap: 2px; min-width: 0; }
.pdd-root .pdd-cifra + .pdd-cifra { padding-left: 16px; border-left: 1px solid var(--border); }
.pdd-root .pdd-cifra span { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.pdd-root .pdd-cifra strong { font-size: 28px; font-weight: 300; line-height: 1.15; font-variant-numeric: tabular-nums; }
.pdd-root .pdd-cifra strong small { font-size: 15px; color: var(--dim); margin-left: 4px; }
.pdd-root .pdd-cifra.is-alerta strong { color: var(--red); }
.pdd-root .pdd-cifra .pdd-barra-avance { margin-top: 10px; height: 6px; }

.pdd-root .pdd-cuerpo { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 0 32px; padding: 0 28px 48px; align-items: start; }
.pdd-root .pdd-renglones-cab { position: sticky; top: 0; z-index: 2; background: var(--bg); display: flex; align-items: flex-end; gap: 10px 20px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.pdd-root .pdd-renglones-cab .pdd-buscar { margin-left: auto; margin-bottom: 6px; width: min(260px, 100%); }
.pdd-root .pdd-renglon {
  display: grid; grid-template-columns: 44px minmax(0, 1.7fr) minmax(80px, 120px) 96px 118px 36px; align-items: center; gap: 14px;
  min-height: 60px; padding: 9px 4px 9px 0; border-bottom: 1px solid var(--border);
}
.pdd-root .pdd-renglon.is-resaltado { background: var(--blue-soft); box-shadow: inset 3px 0 0 var(--blue); padding-left: 10px; }
.pdd-root .pdd-foto {
  width: 44px; height: 44px; border-radius: 9px; overflow: hidden; display: grid; place-items: center; flex-shrink: 0;
  border: 1px solid var(--border); background: var(--panel-2); color: var(--dim); font-size: 13px; font-weight: 500; padding: 0;
}
.pdd-root .pdd-foto img { width: 100%; height: 100%; object-fit: contain; padding: 3px; background: #fff; }
.pdd-root .pdd-foto.is-boton { cursor: zoom-in; }
.pdd-root .pdd-foto.is-boton:hover { border-color: var(--blue); }
.pdd-root .pdd-capa-foto { justify-content: center; align-items: center; padding: 24px; cursor: zoom-out; }
.pdd-root .pdd-foto-grande { margin: 0; display: grid; gap: 10px; justify-items: center; max-width: min(720px, 100%); animation: pdd-aparece .2s cubic-bezier(.22,1,.36,1); }
.pdd-root .pdd-foto-grande img { max-width: 100%; max-height: 72vh; border-radius: 12px; background: #fff; object-fit: contain; box-shadow: var(--elev-2); }
.pdd-root .pdd-foto-grande figcaption { color: #fff; font-size: 14px; text-align: center; text-shadow: 0 1px 3px rgba(0,0,0,.6); }
.pdd-root .pdd-renglon-nombre { font-size: 14.5px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.pdd-root .pdd-renglon-sub { margin-top: 2px; font-size: 12px; color: var(--dim); display: flex; gap: 4px 10px; flex-wrap: wrap; }
.pdd-root .pdd-renglon-sub i { font-style: normal; color: var(--muted); }
.pdd-root .pdd-cant { font-size: 14px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pdd-root .pdd-destino { justify-self: start; font-size: 11.5px; font-weight: 500; padding: 2px 7px; border-radius: 6px; border: 1px solid var(--blue-border); color: var(--blue); background: var(--blue-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.pdd-root .pdd-destino.is-stock { border-color: var(--teal-border); color: var(--teal); background: var(--teal-soft); }
.pdd-root .pdd-corregir { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid transparent; border-radius: 9px; background: transparent; color: var(--dim); }
.pdd-root .pdd-corregir:hover { border-color: var(--border-2); background: var(--panel); color: var(--blue); }

.pdd-root .pdd-lado { position: sticky; top: 16px; display: grid; gap: 18px; padding-top: 18px; }
.pdd-root .pdd-rotulo { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }
.pdd-root .pdd-obs { font-size: 13.5px; color: var(--muted); line-height: 1.5; white-space: pre-wrap; }
.pdd-root .pdd-mensaje { display: grid; gap: 8px; }
.pdd-root .pdd-mensaje textarea.ui-input { min-height: 64px; resize: vertical; padding-top: 9px; }
.pdd-root .pdd-mensaje .ui-btn { justify-self: end; }
.pdd-root .pdd-historial { display: grid; gap: 0; max-height: 52vh; overflow-y: auto; border-top: 1px solid var(--border); }
.pdd-root .pdd-evento { display: grid; grid-template-columns: 10px minmax(0, 1fr); gap: 10px; padding: 10px 0; border-bottom: 1px solid var(--border); }
.pdd-root .pdd-evento i { width: 7px; height: 7px; border-radius: 50%; margin-top: 6px; background: var(--dim); }
.pdd-root .pdd-evento i.is-ok { background: var(--green); }
.pdd-root .pdd-evento i.is-parcial { background: var(--violet); }
.pdd-root .pdd-evento i.is-novedad { background: var(--red); }
.pdd-root .pdd-evento i.is-mensaje { background: var(--blue); }
.pdd-root .pdd-evento-texto { font-size: 13px; color: var(--muted); line-height: 1.45; overflow-wrap: anywhere; white-space: pre-wrap; }
.pdd-root .pdd-evento-texto strong { color: var(--text); font-weight: 500; }
.pdd-root .pdd-evento-cuando { margin-top: 2px; font-size: 11.5px; color: var(--dim); }

/* ── Hoja (corregir un renglón) ── */
.pdd-root .pdd-capa { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 9990; display: flex; justify-content: flex-end; background: var(--overlay-strong); animation: pdd-aparece .18s cubic-bezier(.22,1,.36,1); }
.pdd-root .pdd-hoja { width: min(460px, 100%); height: 100%; display: flex; flex-direction: column; outline: none; background: var(--panel-solid); border-left: 1px solid var(--border); box-shadow: var(--elev-2); animation: pdd-entra .28s cubic-bezier(.22,1,.36,1); }
.pdd-root .pdd-hoja-cab { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; border-bottom: 1px solid var(--border); }
.pdd-root .pdd-hoja-titulo { font-size: 17px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.pdd-root .pdd-hoja-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); }
.pdd-root .pdd-cerrar { margin-left: auto; flex-shrink: 0; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--border-2); border-radius: 9px; background: transparent; color: var(--muted); }
.pdd-root .pdd-hoja-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px; display: grid; gap: 18px; align-content: start; }
.pdd-root .pdd-hoja-pie { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--panel); }
.pdd-root .pdd-campo { display: grid; gap: 6px; }
.pdd-root .pdd-campo > label, .pdd-root .pdd-campo > .pdd-rotulo { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.pdd-root .pdd-campo textarea.ui-input { min-height: 60px; resize: vertical; padding-top: 9px; }
.pdd-root .pdd-opciones { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; padding: 3px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); }
.pdd-root .pdd-opcion { min-height: 36px; border: 0; border-radius: 7px; background: transparent; color: var(--muted); font: inherit; font-size: 13px; }
.pdd-root .pdd-opcion.is-activa { background: var(--blue-soft); color: var(--blue); font-weight: 500; }
.pdd-root .pdd-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--red-border); background: var(--red-soft); color: var(--text); font-size: 13px; line-height: 1.45; }
.pdd-root .pdd-aviso svg { color: var(--red); flex-shrink: 0; margin-top: 1px; }

@keyframes pdd-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes pdd-entra { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes pdd-sube { from { transform: translateY(28px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 1180px) {
  .pdd-root .pdd-cuerpo { grid-template-columns: minmax(0, 1fr); }
  .pdd-root .pdd-lado { position: static; padding-top: 28px; }
  .pdd-root .pdd-historial { max-height: none; }
}
@media (max-width: 1000px) {
  .pdd-root .pdd-fila { grid-template-columns: 4px minmax(0, 1fr) 74px 16px; }
  .pdd-root .pdd-fila .pdd-avance { grid-column: 2 / 4; grid-row: 2; }
  .pdd-root .pdd-fila .pdd-etiqueta-col { display: none; }
  .pdd-root .pdd-fila > svg { grid-column: 4; grid-row: 1; }
  .pdd-root .pdd-fila .pdd-marca { grid-row: 1 / 3; height: 100%; min-height: 38px; }
}
@media (max-width: 899px) {
  .pdd-root .pdd-barra { padding: 6px 16px 0; }
  .pdd-root .pdd-barra-der { width: 100%; margin-left: 0; }
  .pdd-root .pdd-buscar { width: 100%; }
  .pdd-root .pdd-lista { padding: 4px 16px 40px; }
  .pdd-root .pdd-cab { padding: 12px 16px 16px; }
  .pdd-root .pdd-titulo { font-size: 22px; flex-basis: 100%; }
  .pdd-root .pdd-cifras { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pdd-root .pdd-cifra:nth-child(3) { padding-left: 0; border-left: 0; }
  .pdd-root .pdd-cifra strong { font-size: 24px; }
  .pdd-root .pdd-cuerpo { padding: 0 16px 40px; }
  .pdd-root .pdd-renglon { grid-template-columns: 44px minmax(0, 1fr) auto 36px; gap: 6px 10px; }
  .pdd-root .pdd-renglon .pdd-foto { grid-column: 1; grid-row: 1 / 3; }
  .pdd-root .pdd-renglon .pdd-destino { grid-column: 2; grid-row: 2; }
  .pdd-root .pdd-renglon .pdd-cant { grid-column: 3; grid-row: 1; text-align: right; }
  .pdd-root .pdd-renglon .pdd-etiqueta { grid-column: 3; grid-row: 2; justify-self: end; }
  .pdd-root .pdd-renglon .pdd-corregir { grid-column: 4; grid-row: 1 / 3; }
  .pdd-root .pdd-renglones-cab .pdd-buscar { margin-left: 0; width: 100%; }
}
@media (max-width: 640px) {
  .pdd-root .pdd-capa { align-items: flex-end; }
  .pdd-root .pdd-hoja { width: 100%; height: auto; max-height: 94vh; border-left: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; animation-name: pdd-sube; }
  .pdd-root .pdd-hoja-pie .ui-btn { flex: 1; justify-content: center; }
  .pdd-root .pdd-acciones .ui-btn-primario { flex: 1 1 100%; justify-content: center; }
}
`;
