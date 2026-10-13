// Estilos del mostrador. Todo va bajo `.mst` (la raíz de la pestaña): nada se
// escapa al resto de la app. Solo tokens del tema; nada de ámbar.
//
// El ancho lo decide el contenedor, no la ventana (con el menú abierto la
// pestaña tiene 240 px menos): MostradorTab mide su raíz y pone `is-ancho`
// (tres columnas) o `is-angosto` (una columna, tablet vertical y celular).

export const AUTO_CONFIRMAR_MS = 3000;
export const LISTO_MS = 4000;

const MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace";

export const CSS_MOSTRADOR = `
.mst {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.mst .mst-num { font-family: ${MONO}; font-variant-numeric: tabular-nums; }
.mst button { font: inherit; }

/* ── Barra superior ─────────────────────────────────────────────────────── */
.mst .mst-barra {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.mst .mst-modos {
  display: inline-flex; gap: 2px; padding: 3px; flex-shrink: 0;
  border: 1px solid var(--border-2); border-radius: 12px; background: var(--panel);
}
.mst .mst-modo {
  display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 0 13px;
  border: 0; border-radius: 9px; background: transparent; color: var(--dim);
  font-size: 13.5px; font-weight: 500;
}
.mst .mst-modo.is-activo { background: var(--blue-soft); color: var(--blue); font-weight: 600; }
.mst .mst-modo.is-activo.is-devolucion { background: var(--teal-soft); color: var(--teal); }

.mst .mst-lector { position: relative; flex: 1; min-width: 220px; }
.mst .mst-lector-icono { position: absolute; left: 15px; top: 50%; transform: translateY(-50%); color: var(--blue); pointer-events: none; }
.mst .mst-lector.is-devolucion .mst-lector-icono { color: var(--teal); }
.mst .mst-lector input {
  width: 100%; min-height: 50px; padding: 0 118px 0 48px;
  border: 1.5px solid var(--blue-border); border-radius: 13px;
  background: var(--panel-solid); color: var(--text);
  font-family: ${MONO}; font-size: 16px; letter-spacing: .02em; outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.mst .mst-lector input::placeholder { font-family: 'Outfit', system-ui, sans-serif; letter-spacing: 0; }
.mst .mst-lector input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
.mst .mst-lector.is-devolucion input { border-color: var(--teal-border); }
.mst .mst-lector.is-devolucion input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px var(--teal-soft); }
.mst .mst-lector-estado {
  position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
  display: inline-flex; align-items: center; gap: 6px; pointer-events: none;
  font-size: 11.5px; font-weight: 600; color: var(--violet);
}
.mst .mst-lector-estado i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.mst .mst-lector:focus-within .mst-lector-estado { color: var(--green); }
.mst .mst-lector-estado .is-listo { display: none; }
.mst .mst-lector:focus-within .mst-lector-estado .is-listo { display: inline; }
.mst .mst-lector:focus-within .mst-lector-estado .is-perdido { display: none; }
.mst .mst-lector-limpiar {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  width: 34px; height: 34px; border: 0; border-radius: 9px; background: var(--panel-2); color: var(--muted);
  display: grid; place-items: center;
}

.mst .mst-estados { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.mst .mst-chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 11px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--panel);
  color: var(--dim); font-size: 12px; font-weight: 600; white-space: nowrap;
}
.mst button.mst-chip:hover { border-color: var(--border-2); color: var(--text); }
.mst .mst-chip.is-ok { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.mst .mst-chip.is-aviso { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.mst .mst-chip.is-error { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.mst .mst-icono-btn {
  width: 38px; height: 38px; border: 1px solid var(--border); border-radius: 10px;
  background: var(--panel); color: var(--muted); display: grid; place-items: center; flex-shrink: 0;
}
.mst .mst-icono-btn:hover { color: var(--text); border-color: var(--border-2); }
.mst .mst-icono-btn.is-activo { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }

/* ── Cuerpo ─────────────────────────────────────────────────────────────── */
.mst .mst-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(350px, 410px); }
.mst.is-ancho .mst-cuerpo { grid-template-columns: minmax(0, 1fr) minmax(360px, 410px) 300px; }
.mst .mst-col { min-height: 0; overflow: auto; }
.mst .mst-col-botonera { padding: 14px 16px 22px; display: grid; gap: 16px; align-content: start; }
.mst .mst-col-carrito { display: flex; flex-direction: column; overflow: hidden; border-left: 1px solid var(--border); background: var(--panel); }
.mst .mst-col-movs { border-left: 1px solid var(--border); }

.mst .mst-titulo-seccion {
  display: flex; align-items: center; gap: 8px; margin: 0 0 9px;
  font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim);
}
.mst .mst-titulo-seccion .mst-num { letter-spacing: 0; }
.mst .mst-vacio { padding: 26px 16px; text-align: center; color: var(--dim); font-size: 13px; }
.mst .mst-error { padding: 12px 14px; border: 1px solid var(--red-border); border-radius: 12px; background: var(--red-soft); color: var(--red); font-size: 13px; font-weight: 600; }

/* ── Botonera ───────────────────────────────────────────────────────────── */
.mst .mst-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(136px, 1fr)); gap: 10px; }
.mst .mst-tile {
  position: relative; display: flex; flex-direction: column; min-height: 148px; padding: 0;
  border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); color: var(--text);
  text-align: left; overflow: hidden; transition: border-color .15s, transform .12s;
}
.mst .mst-tile:hover { border-color: var(--blue-border); }
.mst .mst-tile:active { transform: scale(.97); }
.mst .mst-tile.is-devolucion:hover { border-color: var(--teal-border); }
.mst .mst-tile-foto { position: relative; height: 76px; display: grid; place-items: center; background: var(--panel-2); overflow: hidden; flex-shrink: 0; }
.mst .mst-tile-foto img, .mst .mst-res-foto img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.mst .mst-inicial { color: var(--dim); font-size: 21px; font-weight: 600; letter-spacing: .02em; }
.mst .mst-tile-cuerpo { display: flex; flex-direction: column; gap: 5px; flex: 1; padding: 8px 10px 9px; }
.mst .mst-tile-nombre {
  font-size: 13px; font-weight: 600; line-height: 1.22;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mst .mst-tile-meta { margin-top: auto; display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--dim); min-width: 0; }
.mst .mst-tile-cuenta {
  position: absolute; top: 7px; right: 7px; min-width: 28px; height: 28px; padding: 0 8px;
  display: grid; place-items: center; border-radius: 999px;
  background: var(--blue); color: var(--inverse-text); font-size: 13px; font-weight: 700;
}
.mst .mst-tile.is-devolucion .mst-tile-cuenta { background: var(--teal); }

.mst .mst-forma {
  display: inline-flex; align-items: center; gap: 4px; height: 21px; padding: 0 7px; flex-shrink: 0;
  border: 1px solid; border-radius: 999px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.mst .mst-forma.is-peso { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.mst .mst-forma.is-canje { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.mst .mst-forma.is-prestamo { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.mst .mst-forma.is-fraccionado { color: var(--teal); border-color: var(--teal-border); background: var(--teal-soft); }

.mst .mst-stock { font-family: ${MONO}; font-variant-numeric: tabular-nums; font-weight: 600; }
.mst .mst-stock.is-sin_stock, .mst .mst-stock.is-negativo { color: var(--red); }
.mst .mst-stock.is-bajo { color: var(--cyan); }
.mst .mst-stock.is-sin_conteo { color: var(--dim); font-family: inherit; font-weight: 500; }
.mst .mst-stock.is-ok { color: var(--muted); }

.mst .mst-resultados { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); }
.mst .mst-res {
  display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 8px 14px;
  border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left;
}
.mst .mst-res:last-child { border-bottom: 0; }
.mst .mst-res:hover, .mst .mst-res.is-activa { background: var(--blue-soft); }
.mst .mst-res-foto { position: relative; width: 40px; height: 40px; border-radius: 10px; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; background: var(--panel-2); }
.mst .mst-res-foto .mst-inicial { font-size: 14px; }
.mst .mst-res-texto { min-width: 0; flex: 1; }
.mst .mst-res-nombre { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst .mst-res-sub { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst .mst-res-fin { display: flex; align-items: center; gap: 8px; flex-shrink: 0; font-size: 12.5px; }
.mst .mst-res-enter { font-family: ${MONO}; font-size: 10.5px; color: var(--dim); border: 1px solid var(--border-2); border-radius: 6px; padding: 2px 6px; }

/* ── Carrito ────────────────────────────────────────────────────────────── */
.mst .mst-car-cab { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.mst .mst-car-titulo { font-size: 15px; font-weight: 650; }
.mst .mst-car-total { font-size: 15px; font-weight: 700; color: var(--blue); }
.mst .mst-car-total.is-devolucion { color: var(--teal); }
.mst .mst-car-lista { flex: 1; min-height: 0; overflow: auto; }
.mst .mst-car-vacio { padding: 34px 20px; text-align: center; color: var(--dim); font-size: 13px; line-height: 1.5; }
.mst .mst-car-vacio strong { display: block; color: var(--muted); font-size: 14px; font-weight: 600; margin-bottom: 4px; }
.mst .mst-firma-chip {
  display: flex; align-items: center; gap: 8px; margin: 10px 14px 0; padding: 8px 10px;
  border: 1px solid var(--green-border); border-radius: 11px; background: var(--green-soft); color: var(--green); font-size: 12.5px; font-weight: 600;
}
.mst .mst-firma-chip span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mst .mst-linea { position: relative; display: grid; gap: 7px; padding: 10px 12px 10px 16px; border-bottom: 1px solid var(--border); }
.mst .mst-destello { position: absolute; top: 0; right: 0; bottom: 0; left: 0; background: var(--blue-soft); pointer-events: none; opacity: 0; animation: mst-destello .9s ease-out; }
.mst .mst-linea-fila { display: flex; align-items: center; gap: 8px; }
.mst .mst-linea-texto { flex: 1; min-width: 0; }
.mst .mst-linea-nombre { font-size: 14px; font-weight: 600; line-height: 1.25; }
.mst .mst-linea-sub { display: flex; flex-wrap: wrap; align-items: center; gap: 3px 8px; margin-top: 3px; font-size: 12px; color: var(--dim); }
.mst .mst-cant { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
.mst .mst-paso, .mst .mst-cant-valor {
  height: 40px; border: 1px solid var(--border-2); border-radius: 10px;
  background: var(--panel-solid); color: var(--text); display: grid; place-items: center;
}
.mst .mst-paso { width: 40px; }
.mst .mst-paso:active, .mst .mst-cant-valor:active { transform: scale(.95); }
.mst .mst-cant-valor { min-width: 54px; padding: 0 8px; font-family: ${MONO}; font-size: 16px; font-weight: 700; }
.mst .mst-quitar { width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: var(--dim); display: grid; place-items: center; }
.mst .mst-quitar:hover { color: var(--red); background: var(--red-soft); }

.mst .mst-extra {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 7px 10px;
  border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); font-size: 12.5px; color: var(--muted);
}
.mst .mst-extra.is-violeta { border-color: var(--violet-border); background: var(--violet-soft); color: var(--violet); }
.mst .mst-extra.is-azul { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.mst .mst-extra.is-cian { border-color: var(--cyan-border); background: var(--cyan-soft); color: var(--cyan); }
.mst .mst-extra .ui-input { min-height: 36px; flex: 1; min-width: 150px; font-size: 13px; }
.mst .mst-extra-btn {
  min-height: 34px; padding: 0 11px; margin-left: auto; border: 1px solid currentColor; border-radius: 9px;
  background: var(--panel-solid); color: inherit; font-size: 12.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px;
}

.mst .mst-interruptor { display: inline-flex; align-items: center; gap: 9px; border: 0; background: transparent; color: var(--text); padding: 2px 0; font-size: 13px; font-weight: 600; }
.mst .mst-interruptor-pista { position: relative; width: 42px; height: 24px; border-radius: 999px; background: var(--panel-3); border: 1px solid var(--border-2); flex-shrink: 0; transition: background-color .15s; }
.mst .mst-interruptor-pista::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: var(--text); transition: transform .18s cubic-bezier(.22,1,.36,1); }
.mst .mst-interruptor[aria-checked="true"] .mst-interruptor-pista { background: var(--green); border-color: var(--green); }
.mst .mst-interruptor[aria-checked="true"] .mst-interruptor-pista::after { transform: translateX(18px); background: var(--inverse-text); }

.mst .mst-car-pie { display: grid; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid var(--border); background: var(--panel-solid); flex-shrink: 0; }
.mst .mst-problemas { display: grid; gap: 3px; font-size: 12.5px; color: var(--violet); }
.mst .mst-pie-fila { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--dim); }

.mst .mst-btn-grande {
  width: 100%; min-height: 56px; padding: 0 18px; border: 0; border-radius: 14px;
  background: var(--blue); color: var(--inverse-text); font-size: 16px; font-weight: 650;
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  transition: filter .15s, transform .12s;
}
.mst .mst-btn-grande:hover:not(:disabled) { filter: brightness(1.07); }
.mst .mst-btn-grande:active:not(:disabled) { transform: scale(.985); }
.mst .mst-btn-grande:disabled { background: var(--panel-2); color: var(--dim); cursor: not-allowed; }
.mst .mst-btn-grande.is-devolucion { background: var(--teal); }
.mst .mst-btn-grande.is-verde { background: var(--green); }
.mst .mst-tecla { font-family: ${MONO}; font-size: 11px; font-weight: 600; padding: 2px 6px; border: 1px solid currentColor; border-radius: 6px; opacity: .7; }

.mst .mst-barra-firmar { display: none; }

/* ── Capas (diálogos) ───────────────────────────────────────────────────── */
.mst .mst-capa {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 40;
  display: grid; place-items: center; padding: 16px; background: var(--overlay);
  animation: mst-aparece .16s ease-out;
}
.mst .mst-hoja {
  width: 100%; max-width: 560px; max-height: 100%; display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2);
  animation: mst-sube .22s cubic-bezier(.22,1,.36,1); outline: none;
}
.mst .mst-hoja.is-chica { max-width: 400px; }
.mst .mst-hoja-cab { display: flex; align-items: flex-start; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.mst .mst-hoja-cab > div { flex: 1; min-width: 0; }
.mst .mst-hoja-titulo { font-size: 17px; font-weight: 650; line-height: 1.25; }
.mst .mst-hoja-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); }
.mst .mst-hoja-cuerpo { display: grid; gap: 14px; padding: 16px 18px; overflow: auto; min-height: 0; }
.mst .mst-hoja-pie { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px 16px; border-top: 1px solid var(--border); flex-shrink: 0; }
.mst .mst-hoja-pie .ui-btn { min-height: 44px; }
.mst .mst-etiqueta { display: block; margin-bottom: 6px; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }

/* Teclado numérico */
.mst .mst-teclado-visor {
  display: flex; align-items: baseline; justify-content: flex-end; gap: 8px; padding: 12px 16px;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel);
}
.mst .mst-teclado-visor strong { font-family: ${MONO}; font-size: 34px; font-weight: 700; letter-spacing: -.02em; }
.mst .mst-teclado-visor span { color: var(--dim); font-size: 14px; }
.mst .mst-teclado { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.mst .mst-teclado button {
  min-height: 58px; border: 1px solid var(--border-2); border-radius: 13px; background: var(--panel);
  color: var(--text); font-family: ${MONO}; font-size: 22px; font-weight: 600; display: grid; place-items: center;
}
.mst .mst-teclado button:active { transform: scale(.96); background: var(--panel-2); }
.mst .mst-teclado button:disabled { opacity: .35; }

/* Balanza */
.mst .mst-peso-visor { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.mst .mst-peso-caja { padding: 12px 14px; border: 1px solid var(--border); border-radius: 13px; background: var(--panel); }
.mst .mst-peso-caja span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.mst .mst-peso-caja strong { display: block; margin-top: 5px; font-family: ${MONO}; font-size: 28px; font-weight: 700; }
.mst .mst-peso-caja small { color: var(--dim); font-size: 12px; }
.mst .mst-peso-caja.is-principal { border-color: var(--blue-border); background: var(--blue-soft); }
.mst .mst-fila { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.mst .mst-fila > .ui-input { flex: 1; min-width: 120px; }

/* ── Firma ──────────────────────────────────────────────────────────────── */
.mst .mst-firma { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 20; display: flex; flex-direction: column; background: var(--bg); animation: mst-aparece .14s ease-out; outline: none; }
.mst .mst-firma-cab { display: flex; align-items: center; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
.mst .mst-firma-cab h2 { margin: 0; font-size: 18px; font-weight: 650; flex: 1; min-width: 0; }
.mst .mst-firma-cuerpo { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 380px); }
.mst .mst-firma-main { display: grid; gap: 18px; align-content: start; width: 100%; max-width: 820px; padding: 18px 20px 26px; }
.mst .mst-firma-aside { border-left: 1px solid var(--border); background: var(--panel); min-height: 0; }
.mst .mst-firma-aside-cab { display: flex; align-items: baseline; gap: 8px; padding: 14px 16px 8px; }
.mst .mst-resumen-fila { display: flex; align-items: baseline; gap: 10px; padding: 8px 16px; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.mst .mst-resumen-fila .mst-num { min-width: 46px; font-size: 15px; font-weight: 700; color: var(--blue); }
.mst .mst-resumen-fila.is-devolucion .mst-num { color: var(--teal); }
.mst .mst-resumen-fila span:nth-child(2) { flex: 1; min-width: 0; }
.mst .mst-resumen-fila small { color: var(--dim); font-size: 12px; }

.mst .mst-tarjeta {
  display: flex; align-items: center; gap: 18px; padding: 22px;
  border: 1.5px dashed var(--blue-border); border-radius: 18px; background: var(--blue-soft);
}
.mst .mst-tarjeta-icono { width: 66px; height: 66px; border-radius: 18px; display: grid; place-items: center; flex-shrink: 0; background: var(--panel-solid); border: 1px solid var(--blue-border); color: var(--blue); }
.mst .mst-tarjeta h3 { margin: 0; font-size: 21px; font-weight: 650; line-height: 1.2; }
.mst .mst-tarjeta p { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.mst .mst-persona { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid var(--green-border); border-radius: 18px; background: var(--green-soft); }
.mst .mst-avatar { position: relative; width: 68px; height: 68px; border-radius: 18px; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; background: var(--panel-solid); border: 1px solid var(--green-border); color: var(--green); font-size: 21px; font-weight: 700; }
.mst .mst-avatar img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.mst .mst-persona-texto { flex: 1; min-width: 0; }
.mst .mst-persona-nombre { font-size: 21px; font-weight: 650; line-height: 1.15; }
.mst .mst-persona-sub { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 5px; font-size: 12.5px; color: var(--muted); }
.mst .mst-persona-sub .mst-num { font-size: 12px; }

.mst .mst-bloque { display: grid; gap: 9px; }
.mst .mst-bloque-titulo { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.mst .mst-bloque-titulo button { margin-left: auto; text-transform: none; letter-spacing: 0; border: 0; background: transparent; color: var(--blue); font-size: 12.5px; font-weight: 600; padding: 4px 2px; }
.mst .mst-hoy { display: flex; flex-wrap: wrap; gap: 6px; }
.mst .mst-hoy-item { display: inline-flex; align-items: baseline; gap: 6px; padding: 6px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--panel-solid); font-size: 12.5px; }
.mst .mst-hoy-item .mst-num { font-weight: 700; }
.mst .mst-hoy-item.is-cupo { border-color: var(--violet-border); background: var(--violet-soft); }

.mst .mst-obras { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 8px; }
.mst .mst-obra {
  display: grid; gap: 3px; align-content: center; min-height: 68px; padding: 10px 14px;
  border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); color: var(--text); text-align: left;
  transition: border-color .15s, transform .12s;
}
.mst .mst-obra:hover:not(:disabled) { border-color: var(--blue); }
.mst .mst-obra:active:not(:disabled) { transform: scale(.98); }
.mst .mst-obra:disabled { opacity: .5; cursor: not-allowed; }
.mst .mst-obra strong { font-family: ${MONO}; font-size: 18px; font-weight: 700; }
.mst .mst-obra span { font-size: 12px; color: var(--dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst .mst-obra.is-elegida { border-color: var(--blue); background: var(--blue-soft); }
.mst .mst-obra.is-repartir { border-style: dashed; }
.mst .mst-obra.is-repartir strong { font-family: inherit; font-size: 15px; font-weight: 650; }
.mst .mst-opciones { display: flex; flex-wrap: wrap; gap: 6px; }
.mst .mst-opcion {
  min-height: 40px; padding: 0 13px; border: 1px solid var(--border-2); border-radius: 11px;
  background: var(--panel-solid); color: var(--text); font-size: 13.5px; font-weight: 500;
}
.mst .mst-opcion.is-mono { font-family: ${MONO}; font-size: 13.5px; font-weight: 600; }
.mst .mst-opcion:hover { border-color: var(--blue-border); }
.mst .mst-opcion.is-elegida { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); font-weight: 600; }
.mst .mst-destino-fijo { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--blue-border); border-radius: 14px; background: var(--blue-soft); }
.mst .mst-destino-fijo strong { font-family: ${MONO}; font-size: 20px; font-weight: 700; color: var(--blue); }
.mst .mst-destino-fijo span { flex: 1; min-width: 0; font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mst .mst-aviso { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border: 1px solid var(--violet-border); border-radius: 14px; background: var(--violet-soft); font-size: 13px; color: var(--text); }
.mst .mst-aviso > svg { color: var(--violet); flex-shrink: 0; margin-top: 1px; }
.mst .mst-aviso.is-cian { border-color: var(--cyan-border); background: var(--cyan-soft); }
.mst .mst-aviso.is-cian > svg { color: var(--cyan); }
.mst .mst-aviso.is-rojo { border-color: var(--red-border); background: var(--red-soft); }
.mst .mst-aviso.is-rojo > svg { color: var(--red); }
.mst .mst-aviso.is-externo { border-color: var(--teal-border); background: var(--teal-soft); }
.mst .mst-aviso.is-externo > svg { color: var(--teal); }
.mst .mst-externo { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--teal-border); background: var(--teal-soft); color: var(--teal); font-weight: 600; }
.mst .mst-alta-externo { display: grid; gap: 6px; padding: 12px; border: 1px solid var(--teal-border); border-radius: 14px; background: var(--panel); }
.mst .mst-alta-externo .mst-etiqueta { margin: 6px 0 0; }
.mst .mst-aviso-texto { flex: 1; min-width: 0; display: grid; gap: 6px; }
.mst .mst-aviso-texto strong { font-weight: 600; }

.mst .mst-personas { display: grid; border: 1px solid var(--border); border-radius: 13px; overflow: hidden; background: var(--panel-solid); }
.mst .mst-persona-res { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 6px 12px; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); text-align: left; }
.mst .mst-persona-res:last-child { border-bottom: 0; }
.mst .mst-persona-res:hover, .mst .mst-persona-res.is-activa { background: var(--blue-soft); }
.mst .mst-persona-res span:first-child { flex: 1; min-width: 0; font-weight: 600; font-size: 14px; }
.mst .mst-persona-res small { color: var(--dim); font-size: 12px; }

.mst .mst-confirmar { display: grid; gap: 8px; }
.mst .mst-auto { height: 4px; border-radius: 4px; background: var(--panel-2); overflow: hidden; }
.mst .mst-auto i { display: block; height: 100%; background: var(--green); transform-origin: left center; animation: mst-cuenta ${AUTO_CONFIRMAR_MS}ms linear forwards; }
.mst .mst-auto-texto { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); }
.mst .mst-auto-texto button { margin-left: auto; border: 0; background: transparent; color: var(--blue); font-weight: 600; font-size: 12.5px; padding: 4px 2px; }

/* ── Listo ──────────────────────────────────────────────────────────────── */
.mst .mst-listo { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 25; display: grid; place-items: center; padding: 20px; background: var(--bg); animation: mst-aparece .14s ease-out; }
.mst .mst-listo-caja { width: 100%; max-width: 540px; display: grid; gap: 14px; text-align: center; }
.mst .mst-listo-check { width: 72px; height: 72px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; background: var(--green-soft); border: 1px solid var(--green-border); color: var(--green); }
.mst .mst-listo-check.is-devolucion { background: var(--teal-soft); border-color: var(--teal-border); color: var(--teal); }
.mst .mst-listo h2 { margin: 0; font-size: 26px; font-weight: 700; }
.mst .mst-listo-quien { font-size: 15px; color: var(--muted); }
.mst .mst-listo-quien strong { color: var(--text); font-weight: 650; }
.mst .mst-listo-items { border: 1px solid var(--border); border-radius: 14px; overflow: hidden; text-align: left; background: var(--panel-solid); max-height: 34vh; overflow-y: auto; }
.mst .mst-listo-tiempo { height: 3px; border-radius: 3px; background: var(--panel-2); overflow: hidden; }
.mst .mst-listo-tiempo i { display: block; height: 100%; background: var(--blue); transform-origin: left center; animation: mst-cuenta ${LISTO_MS}ms linear forwards; }

/* ── Últimos movimientos ────────────────────────────────────────────────── */
.mst .mst-movs-cab { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 8px; padding: 12px 14px 10px; background: var(--bg); border-bottom: 1px solid var(--border); }
.mst .mst-movs-cab h3 { margin: 0; flex: 1; font-size: 14px; font-weight: 650; }
.mst .mst-mov { display: grid; gap: 4px; padding: 10px 14px; border-bottom: 1px solid var(--border); font-size: 12.5px; }
.mst .mst-mov-fila { display: flex; align-items: center; gap: 8px; min-width: 0; }
.mst .mst-mov-hora { font-family: ${MONO}; font-size: 12px; color: var(--dim); flex-shrink: 0; }
.mst .mst-mov-quien { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst .mst-mov-items { color: var(--muted); line-height: 1.4; }
.mst .mst-mov-items .mst-num { color: var(--text); font-weight: 600; }
.mst .mst-mov-sub { color: var(--dim); font-size: 11.5px; }
.mst .mst-mov.is-anulado .mst-mov-items, .mst .mst-mov.is-anulado .mst-mov-quien { text-decoration: line-through; color: var(--dim); }
.mst .mst-mov-anular { min-height: 30px; padding: 0 9px; border: 1px solid var(--border-2); border-radius: 8px; background: transparent; color: var(--muted); font-size: 12px; font-weight: 600; flex-shrink: 0; }
.mst .mst-mov-anular:hover { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.mst .mst-tipo { width: 22px; height: 22px; border-radius: 7px; display: grid; place-items: center; flex-shrink: 0; }
.mst .mst-tipo.is-retiro { color: var(--blue); background: var(--blue-soft); }
.mst .mst-tipo.is-devolucion { color: var(--teal); background: var(--teal-soft); }
.mst .mst-pendiente { display: flex; align-items: center; gap: 8px; margin: 10px 14px 0; padding: 9px 11px; border: 1px solid var(--violet-border); border-radius: 11px; background: var(--violet-soft); color: var(--violet); font-size: 12.5px; font-weight: 600; }
.mst .mst-pendiente button { margin-left: auto; border: 0; background: transparent; color: inherit; font-weight: 650; text-decoration: underline; padding: 2px; }

.mst .mst-check-fila { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); font-size: 13px; cursor: pointer; }
.mst .mst-check-fila input { width: 18px; height: 18px; accent-color: var(--red); flex-shrink: 0; }
.mst .mst-check-fila span { flex: 1; min-width: 0; }

.mst .mst-envio { display: grid; gap: 5px; padding: 11px 13px; border: 1px solid var(--border); border-radius: 13px; background: var(--panel); font-size: 13px; }
.mst .mst-envio.is-error { border-color: var(--red-border); }
.mst .mst-envio-error { color: var(--red); font-size: 12px; }

/* ── Una columna (tablet vertical y celular) ────────────────────────────── */
.mst.is-angosto .mst-barra { flex-wrap: wrap; padding: 10px 12px; }
.mst.is-angosto .mst-lector { order: 5; flex-basis: 100%; min-width: 0; }
.mst.is-angosto .mst-estados { margin-left: auto; }
.mst.is-angosto .mst-chip-texto { display: none; }
.mst.is-angosto .mst-cuerpo { display: flex; flex-direction: column; overflow: auto; }
.mst.is-angosto .mst-col { overflow: visible; min-height: auto; }
.mst.is-angosto .mst-col-botonera { padding: 12px 12px 18px; }
.mst.is-angosto .mst-col-carrito { order: -1; border-left: 0; border-bottom: 1px solid var(--border); overflow: visible; }
.mst.is-angosto .mst-car-lista { overflow: visible; }
.mst.is-angosto .mst-car-pie { display: none; }
.mst.is-angosto .mst-car-vacio { padding: 14px 16px; }
.mst.is-angosto .mst-tiles { grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; }
.mst.is-angosto .mst-tile { min-height: 132px; }
.mst.is-angosto .mst-tile-foto { height: 64px; }
.mst.is-angosto .mst-barra-firmar {
  display: grid; gap: 6px; flex-shrink: 0; padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border); background: var(--panel-solid);
}
.mst.is-angosto .mst-firma-cuerpo { display: flex; flex-direction: column; }
.mst.is-angosto .mst-firma-main { padding: 14px 12px 20px; }
.mst.is-angosto .mst-firma-aside { border-left: 0; border-top: 1px solid var(--border); }
.mst.is-angosto .mst-tarjeta { padding: 16px; gap: 14px; }
.mst.is-angosto .mst-tarjeta-icono { width: 52px; height: 52px; }
.mst.is-angosto .mst-tarjeta h3 { font-size: 18px; }
.mst.is-angosto .mst-obras { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
.mst.is-angosto .mst-peso-caja strong { font-size: 24px; }

@media (max-width: 640px) {
  .mst .mst-capa { place-items: end stretch; padding: 0; }
  .mst .mst-hoja, .mst .mst-hoja.is-chica { max-width: none; max-height: 92%; border-radius: 18px 18px 0 0; padding-bottom: env(safe-area-inset-bottom); }
}

/* Solo mientras se espera una respuesta: no queda girando en pantalla. */
.mst .mst-gira { animation: mst-giro .8s linear infinite; }

@keyframes mst-giro { to { transform: rotate(360deg); } }
@keyframes mst-destello { from { opacity: 1; } to { opacity: 0; } }
@keyframes mst-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes mst-sube { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes mst-cuenta { from { transform: scaleX(0); } to { transform: scaleX(1); } }
`;
