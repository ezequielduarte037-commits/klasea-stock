// Lo propio del mostrador de pañol, encima de CSS_MOSTRADOR (consumibles): el
// riel de obras, los saldos por ubicación, las variantes, la ruta origen →
// destino y el modo "Asignar a obra" (teal: queda en el pañol, reservado).
// Todo bajo `.mst.mpn`; sólo tokens del tema, nada de ámbar.

const MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace";

export const LISTO_PANOL_MS = 4500;

export const CSS_PANOL = `
.mst.mpn .mst-listo-tiempo i { animation-duration: ${LISTO_PANOL_MS}ms; }
.mst.mpn .mst-paso:disabled { opacity: .4; cursor: not-allowed; }
/* Desactivado, el botón dice qué falta: tiene que leerse, no verse verde apagado. */
.mst.mpn .mst-btn-grande:disabled { background: var(--panel-2); color: var(--muted); }
.mst.mpn .mst-lector input { padding-right: 168px; text-overflow: ellipsis; }
.mst.mpn .mst-lector input:focus { padding-right: 118px; }

.mst.mpn .mst-modo.is-activo.is-asignar { background: var(--teal-soft); color: var(--teal); }
.mst.mpn .mst-lector.is-asignar .mst-lector-icono { color: var(--teal); }
.mst.mpn .mst-lector.is-asignar input { border-color: var(--teal-border); }
.mst.mpn .mst-lector.is-asignar input:focus { border-color: var(--teal); box-shadow: 0 0 0 3px var(--teal-soft); }
.mst.mpn .mst-btn-grande.is-asignar { background: var(--teal); }
.mst.mpn .mst-car-total.is-asignar { color: var(--teal); }

/* Riel "¿De qué obra?". La columna se acota: si no, el riel (una sola fila
   con scroll) la estira al ancho de todas las obras juntas. */
.mst.mpn .mst-col-botonera { grid-template-columns: minmax(0, 1fr); }
.mst.mpn .mst-col-botonera > section { min-width: 0; }
.mst.mpn .mpn-riel { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px 1px 3px; margin: 0 -1px; }
.mst.mpn .mpn-riel::-webkit-scrollbar { display: none; }
.mst.mpn .mpn-origen {
  display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; min-height: 38px; padding: 0 12px;
  border: 1px solid var(--border-2); border-radius: 999px; background: var(--panel-solid); color: var(--text);
  font-size: 13px; font-weight: 500; white-space: nowrap;
}
.mst.mpn .mpn-origen strong { font-family: ${MONO}; font-weight: 650; font-size: 13px; }
.mst.mpn .mpn-origen .mst-num { color: var(--dim); font-size: 11.5px; }
.mst.mpn .mpn-origen:hover { border-color: var(--blue-border); }
.mst.mpn .mpn-origen.is-elegido { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
.mst.mpn .mpn-origen.is-elegido .mst-num { color: var(--blue); }
.mst.mpn .mpn-origen.is-libre strong { font-family: inherit; }
.mst.mpn .mpn-origen.is-cerrada { opacity: .72; }

/* Botonera de obras (sin búsqueda ni obra elegida) */
.mst.mpn .mpn-obra-tile { min-height: 74px; }
.mst.mpn .mpn-obra-tile.is-libre strong { font-family: inherit; font-size: 16px; font-weight: 650; }
.mst.mpn .mpn-obra-tile .mpn-obra-cuenta { font-size: 12px; color: var(--dim); }

/* Productos */
.mst.mpn .mpn-prod { align-items: center; padding: 6px 10px 6px 14px; }
.mst.mpn .mpn-prod-main { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; min-height: 44px; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; }
.mst.mpn .mpn-prod-fin { display: flex; align-items: center; gap: 6px; flex-shrink: 0; flex-wrap: wrap; justify-content: flex-end; max-width: 46%; }
.mst.mpn .mpn-saldo {
  display: inline-flex; align-items: baseline; gap: 5px; min-height: 34px; padding: 0 10px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--text);
  font-size: 12px; font-weight: 500; white-space: nowrap;
}
.mst.mpn .mpn-saldo .mst-num { font-weight: 700; font-size: 13px; }
.mst.mpn .mpn-saldo:hover { border-color: var(--blue); background: var(--blue-soft); }
.mst.mpn .mpn-saldo.is-libre .mst-num { color: var(--green); }
.mst.mpn .mpn-saldo.is-en-carrito { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); }
.mst.mpn .mpn-ubic { font-family: ${MONO}; font-size: 11px; font-weight: 600; color: var(--muted); padding: 1px 6px; border: 1px solid var(--border); border-radius: 6px; background: var(--panel); white-space: nowrap; }
.mst.mpn .mpn-buscar-todo { justify-self: center; }

/* Carrito */
.mst.mpn .mpn-grupo-cab { display: flex; align-items: center; gap: 8px; padding: 10px 16px 6px; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--dim); }
.mst.mpn .mpn-grupo-cab i { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex-shrink: 0; }
.mst.mpn .mpn-grupo-cab.is-obra i { background: var(--blue); }
.mst.mpn .mpn-grupo-cab span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst.mpn .mpn-chips { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.mst.mpn .mpn-chips-titulo { font-size: 12px; color: var(--dim); margin-right: 2px; }
.mst.mpn .mpn-chip {
  display: inline-flex; align-items: baseline; gap: 5px; min-height: 34px; padding: 0 11px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel-solid); color: var(--text);
  font-size: 12.5px; font-weight: 500;
}
.mst.mpn .mpn-chip .mst-num { font-size: 11.5px; color: var(--dim); }
.mst.mpn .mpn-chip:hover { border-color: var(--blue-border); }
.mst.mpn .mpn-chip.is-elegida { border-color: var(--violet); background: var(--violet-soft); color: var(--violet); font-weight: 600; }
.mst.mpn .mpn-chip.is-elegida .mst-num { color: var(--violet); }
.mst.mpn .mpn-chip.is-neutra { border-color: var(--border-2); background: var(--panel-2); font-weight: 600; }
.mst.mpn .mpn-chip.is-producto.is-elegida { border-color: var(--green); background: var(--green-soft); color: var(--green); }
.mst.mpn .mpn-chip.is-mas { border-style: dashed; color: var(--blue); }
.mst.mpn .mpn-chip.is-falta { border-color: var(--violet-border); }
.mst.mpn .mpn-todo { min-height: 26px; padding: 0 8px; border: 1px solid var(--border-2); border-radius: 8px; background: transparent; color: var(--blue); font-size: 11.5px; font-weight: 600; }
.mst.mpn .mpn-pausados { display: grid; gap: 6px; }
.mst.mpn .mpn-pausado { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
.mst.mpn .mpn-pausado > div { flex: 1; min-width: 0; }
.mst.mpn .mpn-pausado strong { display: block; font-size: 13.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mst.mpn .mpn-pausado small { color: var(--dim); font-size: 12px; }

/* Firma: de dónde sale y adónde va */
.mst.mpn .mpn-ruta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.mst.mpn .mpn-ruta strong { font-family: ${MONO}; font-weight: 600; color: var(--muted); }
.mst.mpn .mpn-ruta.is-reasigna, .mst.mpn .mpn-ruta.is-reasigna strong { color: var(--violet); }
.mst.mpn .mpn-ruta.is-sin-obra strong:last-of-type { color: var(--cyan); }
.mst.mpn .mpn-linea-firma { display: grid; gap: 3px; padding: 9px 16px; border-bottom: 1px solid var(--border); }
.mst.mpn .mpn-linea-firma-fila { display: flex; align-items: baseline; gap: 10px; font-size: 13.5px; }
.mst.mpn .mpn-linea-firma-fila .mst-num { min-width: 38px; font-size: 15px; font-weight: 700; color: var(--blue); }
.mst.mpn .mpn-linea-firma-fila span:nth-child(2) { flex: 1; min-width: 0; }
.mst.mpn .mpn-linea-firma .mpn-ruta { padding-left: 48px; }
.mst.mpn .mpn-destino-opcion { display: grid; gap: 3px; align-content: center; min-height: 64px; padding: 10px 14px; border: 1px solid var(--border-2); border-radius: 14px; background: var(--panel-solid); color: var(--text); text-align: left; }
.mst.mpn .mpn-destino-opcion:hover { border-color: var(--blue); }
.mst.mpn .mpn-destino-opcion.is-elegida { border-color: var(--blue); background: var(--blue-soft); }
.mst.mpn .mpn-destino-opcion strong { font-size: 15px; font-weight: 650; }
.mst.mpn .mpn-destino-opcion span { font-size: 12px; color: var(--dim); }
.mst.mpn .mpn-asignar .mst-opcion.is-elegida { border-color: var(--teal); background: var(--teal-soft); color: var(--teal); }
.mst.mpn .mpn-filtro-obras { max-width: 260px; }

.mst.mpn.is-angosto .mpn-prod-fin { max-width: none; }
.mst.mpn.is-angosto .mpn-prod { flex-wrap: wrap; }
.mst.mpn.is-angosto .mpn-prod .mst-res-texto { flex-basis: calc(100% - 56px); }
.mst.mpn.is-angosto .mpn-prod-fin { width: 100%; justify-content: flex-start; padding-left: 52px; }
.mst.mpn.is-angosto .mpn-linea-firma .mpn-ruta { padding-left: 0; }
.mst.mpn .mpn-corto { display: none; }
.mst.mpn.is-angosto .mpn-largo { display: none; }
.mst.mpn.is-angosto .mpn-corto { display: inline; }
.mst.mpn.is-angosto .mst-firma-cab h2 { font-size: 16px; line-height: 1.2; }
/* En el celular la firma es larga: confirmar queda a mano, pegado abajo. */
.mst.mpn.is-angosto .mst-confirmar {
  position: sticky; bottom: 0; z-index: 2; margin: 0 -12px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border); background: var(--bg);
}
`;
