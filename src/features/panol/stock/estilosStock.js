// Stock maestro y stock de una obra (StockWmsPanel). Mismo lenguaje que Pedidos
// y Remitos del pañol: barra con filtros de texto subrayados, filas planas sobre
// el fondo, etiquetas chicas y la ficha del producto como columna al costado.
// Todo bajo `.stk-root`; sólo tokens del tema.

export const CSS_STOCK = `
.stk-root { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }

/* ── Barra: buscador + acciones, y abajo los filtros ── */
.stk-root .stk-barra { flex-shrink: 0; padding: 12px 28px 0; border-bottom: 1px solid var(--border); display: grid; gap: 4px; }
.stk-root .stk-barra-fila { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; min-width: 0; }
.stk-root .stk-buscar { display: flex; align-items: center; gap: 9px; flex: 1 1 320px; max-width: 560px; min-width: 0; border-bottom: 1px solid var(--border-2); padding: 7px 2px; color: var(--dim); }
.stk-root .stk-buscar:focus-within { border-color: var(--blue); color: var(--blue); }
.stk-root .stk-buscar input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; box-shadow: none; font: inherit; font-size: 15px; color: var(--text); padding: 0; }
html .stk-root .stk-buscar input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]),
html .stk-root .stk-buscar input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="color"]):focus { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
.stk-root .stk-buscar button { border: 0; background: transparent; color: var(--dim); display: grid; place-items: center; padding: 2px; }
.stk-root .stk-buscar button:hover { color: var(--text); }
.stk-root .stk-acciones { margin-left: auto; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.stk-root .stk-acciones .ui-btn { min-height: 36px; font-size: 13px; padding: 0 12px; }
.stk-root .stk-acciones .ui-btn-icono { width: 36px; padding: 0; }
.stk-root .stk-acciones .ui-seg > button { min-height: 28px; padding: 0 9px; font-size: 12.5px; }
.stk-root .stk-num { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-grid; place-items: center; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; background: var(--blue); color: var(--inverse-text); }
.stk-root .ui-btn.is-activo { background: var(--blue-soft); border-color: var(--blue-border); color: var(--blue); }
.stk-root .ui-btn.stk-carrito { background: var(--green-soft); border-color: var(--green-border); color: var(--green); }
.stk-root .ui-btn.stk-carrito .stk-num { background: var(--green); }
.stk-root .ui-btn.stk-carrito.is-abierto { background: var(--green); border-color: transparent; color: var(--inverse-text); }
.stk-root .ui-btn.stk-carrito.is-abierto .stk-num { background: var(--inverse-text); color: var(--green); }
.stk-root .ui-btn.stk-guardar { background: var(--green-soft); border-color: var(--green-border); color: var(--green); }

.stk-root .stk-filtros { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; min-width: 0; }
.stk-root .stk-filtros::-webkit-scrollbar { display: none; }
.stk-root .stk-filtro {
  display: inline-flex; align-items: baseline; gap: 7px; flex-shrink: 0; padding: 10px 1px 11px; margin-bottom: -1px;
  border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); font: inherit; font-size: 14px; white-space: nowrap;
}
.stk-root .stk-filtro:hover { color: var(--text); }
.stk-root .stk-filtro.is-activo { color: var(--text); font-weight: 500; border-bottom-color: var(--blue); }
.stk-root .stk-filtro small { font-size: 12.5px; color: var(--dim); font-variant-numeric: tabular-nums; }
.stk-root .stk-filtro.is-alerta small { color: var(--red); font-weight: 600; }
.stk-root .stk-filtro.is-aviso small { color: var(--violet); font-weight: 600; }
.stk-root .stk-filtro.is-cian small { color: var(--cyan); font-weight: 600; }
.stk-root .stk-filtro.is-azul small { color: var(--blue); font-weight: 600; }
.stk-root .stk-filtros-nota { align-self: center; margin-left: auto; padding-left: 12px; font-size: 12px; color: var(--dim); white-space: nowrap; }

/* Filtros avanzados: una fila plana de selectores debajo de la barra. */
.stk-root .stk-avanzados { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding: 10px 0 12px; border-top: 1px solid var(--border); margin-top: 6px; }
.stk-root .stk-select { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 260px; padding: 4px 0; border-bottom: 1px solid var(--border-2); }
.stk-root .stk-select.is-activo { border-color: var(--blue); }
.stk-root .stk-select > span { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.stk-root .stk-select.is-activo > span { color: var(--blue); }
.stk-root .stk-select select { flex: 1; min-width: 0; border: 0; background: transparent; color: var(--text); font: inherit; font-size: 13.5px; outline: none; padding: 2px 0; }
.stk-root .stk-limpiar { border: 0; background: transparent; color: var(--blue); font: inherit; font-size: 13px; padding: 4px 2px; }
.stk-root .stk-revision { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; width: 100%; padding-top: 4px; font-size: 12.5px; color: var(--muted); }
.stk-root .stk-revision .stk-rotulo { margin-right: 2px; }
.stk-root .stk-revision-barra { display: flex; width: 120px; height: 5px; border-radius: 5px; overflow: hidden; background: var(--panel-2); }
.stk-root .stk-revision-barra i { display: block; height: 100%; transition: width .3s ease; }
.stk-root .stk-revision-barra .is-ok { background: var(--green); }
.stk-root .stk-revision-barra .is-problema { background: var(--red); }
.stk-root .stk-revision b { font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
.stk-root .stk-pastilla { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border: 1px solid var(--border-2); border-radius: 8px; background: transparent; color: var(--muted); font: inherit; font-size: 12.5px; white-space: nowrap; }
.stk-root .stk-pastilla:hover { color: var(--text); border-color: var(--border-3); }
.stk-root .stk-pastilla i { width: 6px; height: 6px; border-radius: 50%; background: var(--dim); }
.stk-root .stk-pastilla.is-verde i { background: var(--green); }
.stk-root .stk-pastilla.is-rojo i { background: var(--red); }
.stk-root .stk-pastilla.is-activa { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.stk-root .stk-pastilla.is-violeta { color: var(--violet); border-color: var(--violet-border); }
.stk-root .stk-pastilla.is-violeta.is-activa { background: var(--violet-soft); }

.stk-root .stk-rotulo { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); }

/* ── Cuerpo: lista + ficha ── */
.stk-root .stk-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr); overflow: hidden; }
.stk-root .stk-cuerpo.con-ficha { grid-template-columns: minmax(0, 1fr) minmax(380px, 440px); }
.stk-root .stk-lista { min-height: 0; min-width: 0; overflow: auto; padding: 0 28px 48px; }
.stk-root .stk-lista.is-tarjetas { display: grid; grid-auto-rows: max-content; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; padding-top: 14px; overflow-x: hidden; }
.stk-root .stk-cuerpo.con-ficha .stk-lista.is-tarjetas { grid-template-columns: minmax(0, 1fr); gap: 6px; }

/* Encabezado de la tabla: pegado arriba mientras se scrollea. */
.stk-root .stk-tabla-cab {
  position: sticky; top: 0; z-index: 2; display: grid; align-items: end; gap: 14px; padding: 14px 8px 9px 0;
  background: var(--bg); border-bottom: 1px solid var(--border);
}
.stk-root .stk-tabla-cab > span { font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stk-root .stk-tabla-cab > .is-der { text-align: right; padding-right: 4px; }
.stk-root .stk-tabla-cab b { font-weight: 500; color: var(--muted); letter-spacing: 0; text-transform: none; font-size: 12.5px; margin-left: 6px; font-variant-numeric: tabular-nums; }

/* ── Fila de producto ── */
.stk-root .stk-fila {
  display: grid; align-items: center; gap: 14px; min-height: 66px; padding: 10px 8px 10px 0;
  border-bottom: 1px solid var(--border); color: var(--text); cursor: pointer; outline: none;
  transition: background-color .12s;
}
.stk-root .stk-fila:hover { background: var(--panel); }
.stk-root .stk-fila:focus-visible { box-shadow: inset 0 0 0 2px var(--blue); }
.stk-root .stk-fila.is-activa { background: var(--blue-soft); box-shadow: inset 3px 0 0 var(--blue); }
.stk-root .stk-nombre { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; font-size: 15px; font-weight: 500; line-height: 1.25; }
.stk-root .stk-nombre.is-renombrado { text-decoration: underline dotted var(--border-3); text-underline-offset: 3px; }
.stk-root .stk-sub { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; margin-top: 3px; font-size: 12.5px; color: var(--dim); min-width: 0; }
.stk-root .stk-sub > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.stk-root .stk-sub .stk-codigo { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted); }
.stk-root .stk-sub .stk-variantes { color: var(--violet); }
.stk-root .stk-cant { text-align: right; padding-right: 4px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.stk-root .stk-cant strong { font-size: 18px; font-weight: 400; }
.stk-root .stk-cant small { margin-left: 4px; font-size: 12px; color: var(--dim); }
.stk-root .stk-cant.is-rojo strong { color: var(--red); }
.stk-root .stk-cant.is-violeta strong { color: var(--violet); }
.stk-root .stk-cant.is-cero strong { color: var(--dim); }
.stk-root .stk-cant .stk-res { display: block; margin-top: 2px; font-size: 12px; color: var(--blue); }
.stk-root .stk-reservas { display: flex; flex-wrap: wrap; gap: 2px 12px; min-width: 0; }
.stk-root .stk-reservas .stk-etiqueta.is-azul, .stk-root .stk-reservas .stk-etiqueta.is-cian { padding: 0; border-color: transparent; background: transparent; font-size: 12.5px; }
.stk-root .stk-reservas .stk-etiqueta b { font-weight: 500; }
.stk-root .stk-vacio-celda { color: var(--dim); }
.stk-root .stk-minimo { display: grid; gap: 2px; justify-items: start; }
.stk-root .stk-minimo-editor { display: flex; align-items: center; gap: 5px; }
.stk-root .stk-minimo-input {
  width: 72px; min-width: 0; padding: 5px 6px; border: 1px solid transparent; border-radius: 7px; background: transparent;
  color: var(--text); font: inherit; font-size: 14px; text-align: right; font-variant-numeric: tabular-nums; outline: none;
}
.stk-root .stk-minimo-input:hover:not(:disabled) { border-color: var(--border-2); }
.stk-root .stk-minimo-input.is-editando { border-color: var(--blue-border); background: var(--panel-solid); }
.stk-root .stk-minimo-input.is-error { border-color: var(--red-border); }
.stk-root .stk-minimo-input:disabled { opacity: .75; }
/* El tema claro pinta todos los campos con caja: el mínimo se ve como número
   hasta que se lo toca, y los selectores de filtros van sólo con la línea. */
html[data-theme="light"] .stk-root .stk-minimo input.stk-minimo-input:not(.is-editando):not(.is-error):not(:focus) { background-color: transparent !important; border-color: transparent !important; }
html[data-theme="light"] .stk-root .stk-minimo input.stk-minimo-input:not(.is-editando):not(.is-error):not(:focus):hover { border-color: var(--border-2) !important; }
html[data-theme="light"] .stk-root .stk-select select { background-color: transparent !important; border-color: transparent !important; box-shadow: none !important; }
.stk-root .stk-minimo-guardar { border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); border-radius: 7px; padding: 5px 8px; font: inherit; font-size: 12px; font-weight: 600; }
.stk-root .stk-minimo-guardar:disabled { border-color: var(--border); background: var(--panel-2); color: var(--dim); }
.stk-root .stk-faltan { padding-left: 6px; font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--dim); }
.stk-root .stk-faltan.is-rojo { color: var(--red); }
.stk-root .stk-faltan.is-violeta { color: var(--violet); }
.stk-root .stk-ubic { min-width: 0; }
.stk-root .stk-ubic-lugar { display: flex; align-items: center; gap: 6px; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stk-root .stk-ubic-lugar svg { color: var(--dim); flex-shrink: 0; }
.stk-root .stk-ubic-obs { margin-top: 2px; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stk-root .stk-estado { display: grid; justify-items: start; gap: 4px; min-width: 0; }

/* Etiquetas: una sola forma para estado, obra, opción y marcas. */
.stk-root .stk-etiqueta {
  display: inline-flex; align-items: center; gap: 5px; max-width: 100%; padding: 2px 8px; border-radius: 6px;
  border: 1px solid var(--border-2); color: var(--muted); background: transparent;
  font-size: 11.5px; font-weight: 500; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.stk-root .stk-etiqueta svg { flex-shrink: 0; }
.stk-root .stk-etiqueta.is-rojo { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.stk-root .stk-etiqueta.is-violeta { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.stk-root .stk-etiqueta.is-cian { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.stk-root .stk-etiqueta.is-verde { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.stk-root .stk-etiqueta.is-azul { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.stk-root .stk-etiqueta.is-teal { color: var(--teal); border-color: var(--teal-border); background: var(--teal-soft); }
.stk-root .stk-etiqueta.is-apagado { color: var(--dim); border-color: var(--border); }
.stk-root .stk-etiqueta.is-chica { padding: 1px 6px; font-size: 10.5px; }
.stk-root .stk-etiqueta b { font-weight: 600; font-variant-numeric: tabular-nums; }

/* Acción de la fila: botón liviano; el color sólo dice qué hace. */
.stk-root .stk-accion {
  justify-self: start; display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 34px; min-width: 34px; padding: 0 10px;
  border: 1px solid var(--border-2); border-radius: 9px; background: transparent; color: var(--muted);
  font: inherit; font-size: 12.5px; font-weight: 500; white-space: nowrap; cursor: pointer; transition: background-color .12s, border-color .12s, color .12s;
}
.stk-root .stk-accion.is-icono { padding: 0; width: 34px; }
.stk-root .stk-accion.is-icono.con-cuenta { width: auto; padding: 0 9px; }
.stk-root .stk-accion b { font-weight: 600; font-variant-numeric: tabular-nums; }
.stk-root .stk-accion.is-verde { color: var(--green); }
.stk-root .stk-accion.is-verde:hover, .stk-root .stk-accion.is-verde.is-puesto { border-color: var(--green-border); background: var(--green-soft); }
.stk-root .stk-accion.is-azul { color: var(--blue); border-color: var(--blue-border); }
.stk-root .stk-accion.is-azul:hover { background: var(--blue-soft); }
.stk-root .stk-accion.is-violeta { color: var(--violet); border-color: var(--violet-border); }
.stk-root .stk-accion.is-violeta:hover { background: var(--violet-soft); }
.stk-root .stk-accion.is-chica { min-height: 24px; min-width: 24px; padding: 0 7px; font-size: 11.5px; border-radius: 6px; color: var(--dim); }
.stk-root .stk-accion.is-chica:hover { color: var(--text); background: var(--panel-2); }

.stk-root .stk-mas { display: flex; justify-content: center; padding: 18px 0 0; grid-column: 1 / -1; }
.stk-root .stk-vacio { grid-column: 1 / -1; padding: 64px 16px; text-align: center; color: var(--dim); font-size: 13.5px; line-height: 1.55; }
.stk-root .stk-vacio strong { display: block; color: var(--text); font-size: 16px; font-weight: 500; margin-bottom: 4px; }

/* ── Tarjeta (vista de tarjetas y celular) ── */
.stk-root .stk-tarjeta {
  width: 100%; display: grid; gap: 8px; padding: 12px; min-width: 0;
  border: 1px solid var(--border); border-radius: 12px; background: var(--panel); color: var(--text);
  font: inherit; text-align: left; cursor: pointer; position: relative; overflow: hidden;
  transition: border-color .12s, background-color .12s;
}
.stk-root .stk-tarjeta::before { content: ""; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: transparent; }
.stk-root .stk-tarjeta.is-rojo::before { background: var(--red); }
.stk-root .stk-tarjeta.is-violeta::before { background: var(--violet); }
.stk-root .stk-tarjeta.is-verde::before { background: var(--green); }
.stk-root .stk-tarjeta:hover { border-color: var(--border-2); background: var(--panel-2); }
.stk-root .stk-tarjeta.is-activa { border-color: var(--blue-border); background: var(--blue-soft); }
.stk-root .stk-tarjeta-cab { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 11px; align-items: start; }
.stk-root .stk-tarjeta-cab .stk-cant strong { font-size: 20px; }
.stk-root .stk-tarjeta-cab .stk-cant small { display: block; margin: 1px 0 0; font-size: 11px; }
.stk-root .stk-tarjeta-cab.is-densa { grid-template-columns: minmax(0, 1fr) auto; align-items: baseline; }
.stk-root .stk-tarjeta-cab.is-densa .stk-cant strong { font-size: 16px; }
.stk-root .stk-tarjeta-cab.is-densa .stk-cant small { display: inline; margin-left: 4px; }
.stk-root .stk-tarjeta-etiquetas { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }
.stk-root .stk-tarjeta-pie { display: flex; align-items: center; gap: 8px; min-width: 0; }
.stk-root .stk-tarjeta-pie > .stk-tarjeta-texto { flex: 1; min-width: 0; font-size: 12px; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stk-root .stk-tarjeta.is-densa { gap: 5px; padding: 9px 10px; border-radius: 10px; }
.stk-root .stk-tarjeta.is-densa .stk-nombre { font-size: 14px; -webkit-line-clamp: 1; }
.stk-root .stk-opciones { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; min-width: 0; }

/* ── Ficha del producto (columna derecha) ── */
.stk-root .stk-ficha { min-height: 0; min-width: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border); background: var(--bg); animation: stk-entra .24s cubic-bezier(.22,1,.36,1); }
.stk-root .stk-ficha-cab { flex-shrink: 0; padding: 16px 20px 0; display: grid; gap: 12px; }
.stk-root .stk-ficha-fila { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: start; }
.stk-root .stk-ficha-titulo { margin: 0; font-size: 22px; font-weight: 300; line-height: 1.2; overflow-wrap: anywhere; }
.stk-root .stk-ficha-meta { margin-top: 4px; display: flex; gap: 3px 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--dim); }
.stk-root .stk-ficha-meta .stk-codigo { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--muted); }
.stk-root .stk-ficha-botones { display: flex; align-items: center; gap: 6px; }
.stk-root .stk-cerrar { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--border-2); border-radius: 9px; background: transparent; color: var(--muted); }
.stk-root .stk-cerrar:hover { color: var(--text); border-color: var(--border-3); }
.stk-root .stk-ficha-etiquetas { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.stk-root .stk-cifras { display: grid; grid-template-columns: repeat(auto-fit, minmax(84px, 1fr)); border-top: 1px solid var(--border); }
.stk-root .stk-cifra { padding: 10px 12px 2px 0; display: grid; gap: 2px; min-width: 0; }
.stk-root .stk-cifra + .stk-cifra { padding-left: 12px; border-left: 1px solid var(--border); }
.stk-root .stk-cifra span { font-size: 10.5px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--dim); white-space: nowrap; }
.stk-root .stk-cifra strong { font-size: 24px; font-weight: 300; line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stk-root .stk-cifra strong small { font-size: 12px; color: var(--dim); margin-left: 4px; }
.stk-root .stk-cifra.is-rojo strong { color: var(--red); }
.stk-root .stk-cifra.is-azul strong { color: var(--blue); }
.stk-root .stk-cifra.is-violeta strong { color: var(--violet); }
.stk-root .stk-ficha-botones .ui-btn { min-height: 34px; padding: 0 10px; font-size: 12.5px; }
.stk-root .stk-ficha-tabs { flex-shrink: 0; display: flex; gap: 22px; margin-top: 8px; padding: 0 20px; border-bottom: 1px solid var(--border); overflow-x: auto; scrollbar-width: none; }
.stk-root .stk-ficha-tabs::-webkit-scrollbar { display: none; }
.stk-root .stk-ficha-cuerpo { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px 20px; display: grid; gap: 16px; align-content: start; }
.stk-root .stk-ficha-pie { flex-shrink: 0; display: flex; gap: 8px; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
.stk-root .stk-ficha-pie .ui-btn { flex: 1; }
.stk-root .stk-bloque { display: grid; gap: 8px; }
.stk-root .stk-bloque-cab { display: flex; align-items: center; justify-content: space-between; gap: 10px; }

/* Saldos por depósito u obra: filas que se eligen. */
.stk-root .stk-saldos { display: grid; border-top: 1px solid var(--border); }
.stk-root .stk-saldo {
  display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 50px; padding: 8px 10px 8px 0;
  border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); font: inherit; text-align: left;
}
.stk-root .stk-saldo:hover { background: var(--panel); }
.stk-root .stk-saldo.is-activa { background: var(--blue-soft); box-shadow: inset 3px 0 0 var(--blue); padding-left: 10px; }
.stk-root .stk-saldo.is-negativo strong { color: var(--red); }
.stk-root .stk-saldo-nombre { display: block; font-size: 14px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stk-root .stk-saldo-sub { display: block; margin-top: 2px; font-size: 12px; color: var(--dim); }
.stk-root .stk-saldo-sub a { color: var(--cyan); text-decoration: none; font-weight: 500; }
.stk-root .stk-saldo-sub.is-violeta { color: var(--violet); }
.stk-root .stk-saldo > strong { font-size: 18px; font-weight: 400; font-variant-numeric: tabular-nums; }
.stk-root .stk-saldo .stk-opciones { margin-top: 4px; }

/* Avisos dentro de la ficha. */
.stk-root .stk-aviso { display: grid; gap: 8px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--red-border); background: var(--red-soft); font-size: 13px; line-height: 1.45; }
.stk-root .stk-aviso.is-violeta { border-color: var(--violet-border); background: var(--violet-soft); }
.stk-root .stk-aviso-titulo { font-weight: 600; color: var(--red); }
.stk-root .stk-aviso.is-violeta .stk-aviso-titulo { color: var(--violet); }
.stk-root .stk-aviso-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.stk-root .stk-texto { font-size: 13.5px; line-height: 1.5; color: var(--muted); }

/* Kardex. */
.stk-root .stk-kardex { display: grid; border-top: 1px solid var(--border); }
.stk-root .stk-mov { display: grid; gap: 6px; padding: 11px 0; border-bottom: 1px solid var(--border); }
.stk-root .stk-mov-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.stk-root .stk-mov-titulo { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; min-width: 0; font-size: 13.5px; font-weight: 500; line-height: 1.3; overflow-wrap: anywhere; }
.stk-root .stk-mov-delta { flex-shrink: 0; font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.stk-root .stk-mov-delta.is-rojo { color: var(--red); }
.stk-root .stk-mov-delta.is-verde { color: var(--green); }
.stk-root .stk-mov-delta.is-violeta { color: var(--violet); }
.stk-root .stk-mov-delta.is-teal { color: var(--teal); }
.stk-root .stk-mov-delta.is-apagado { color: var(--dim); }
.stk-root .stk-mov-ruta { font-size: 12.5px; color: var(--muted); overflow-wrap: anywhere; }
.stk-root .stk-mov-datos { display: flex; flex-wrap: wrap; gap: 3px 10px; font-size: 12px; color: var(--dim); }
.stk-root .stk-mov-nota { font-size: 12px; color: var(--muted); line-height: 1.4; padding-left: 8px; border-left: 2px solid var(--border-2); }
.stk-root .stk-mov-botones { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.stk-root .stk-mov-botones .ui-btn { min-height: 30px; padding: 0 10px; font-size: 12px; }

/* Diálogos (revertir, devolución). */
.stk-root .stk-capa { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 80; display: grid; place-items: center; padding: 16px; background: var(--overlay-strong); animation: stk-aparece .18s cubic-bezier(.22,1,.36,1); }
.stk-root .stk-dialogo { width: min(520px, 100%); max-height: 92vh; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); box-shadow: var(--elev-2); overflow: hidden; }
.stk-root .stk-dialogo-cab { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
.stk-root .stk-dialogo-titulo { font-size: 17px; font-weight: 500; }
.stk-root .stk-dialogo-sub { margin-top: 3px; font-size: 12.5px; color: var(--dim); }
.stk-root .stk-dialogo-cuerpo { padding: 16px 18px; display: grid; gap: 14px; overflow-y: auto; }
.stk-root .stk-dialogo-pie { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px calc(12px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
.stk-root .stk-campo { display: grid; gap: 6px; min-width: 0; }
.stk-root .stk-campo select.ui-input { padding-right: 8px; }
.stk-root .stk-bloque > .ui-seg { justify-self: start; }
.stk-root .stk-campo > span:first-child { font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.stk-root .stk-campo textarea.ui-input { min-height: 92px; padding-top: 9px; resize: vertical; line-height: 1.45; }
.stk-root .stk-opciones-boton { display: flex; gap: 6px; flex-wrap: wrap; }
.stk-root .stk-nota-cian { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--cyan-border); background: var(--cyan-soft); color: var(--muted); font-size: 12.5px; line-height: 1.45; }
.stk-root .stk-nota-violeta { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--violet-border); background: var(--violet-soft); color: var(--text); font-size: 12.5px; line-height: 1.45; }

@keyframes stk-aparece { from { opacity: 0; } to { opacity: 1; } }
@keyframes stk-entra { from { transform: translateX(18px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes stk-sube { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }

@media (max-width: 1180px) {
  .stk-root .stk-cuerpo.con-ficha { grid-template-columns: minmax(0, 1fr) minmax(340px, 380px); }
}
@media (max-width: 899px) {
  .stk-root .stk-barra { padding: 8px 16px 0; }
  .stk-root .stk-buscar { flex-basis: 100%; max-width: none; }
  .stk-root .stk-acciones { margin-left: 0; width: 100%; }
  .stk-root .stk-acciones .ui-btn { min-height: 42px; }
  .stk-root .stk-acciones .ui-btn-icono { width: 42px; }
  .stk-root .stk-filtros {
    gap: 18px;
    -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent 100%);
    mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent 100%);
  }
  .stk-root .stk-filtros-nota { display: none; }
  .stk-root .stk-select { max-width: none; flex: 1 1 150px; }
  .stk-root .stk-cuerpo.con-ficha { grid-template-columns: minmax(0, 1fr); }
  .stk-root .stk-lista { padding: 0 16px 40px; }
  .stk-root .stk-lista.is-tarjetas { grid-template-columns: minmax(0, 1fr); gap: 0; padding-top: 0; }
  .stk-root .stk-lista.is-tarjetas .stk-tarjeta { border: 0; border-bottom: 1px solid var(--border); border-radius: 0; background: transparent; padding: 12px 0 12px 10px; }
  .stk-root .stk-lista.is-tarjetas .stk-tarjeta::before { top: 14px; bottom: 14px; }
  .stk-root .stk-lista.is-tarjetas .stk-tarjeta:hover { background: var(--panel); }
  /* En el celular la ficha entera scrollea (la cabecera no se come la
     pantalla) y los botones quedan pegados abajo. */
  .stk-root .stk-ficha { border-left: 0; overflow-y: auto; }
  .stk-root .stk-ficha-cuerpo { flex: none; overflow: visible; }
  .stk-root .stk-ficha-pie { position: sticky; bottom: 0; background: var(--bg); }
  .stk-root .stk-ficha-cab { padding: 12px 16px 0; }
  .stk-root .stk-ficha-titulo { font-size: 20px; }
  .stk-root .stk-ficha-tabs { padding: 0 16px; }
  .stk-root .stk-ficha-cuerpo { padding: 14px 16px 18px; }
  .stk-root .stk-ficha-pie { padding-left: 16px; padding-right: 16px; }
  .stk-root .stk-ficha-pie .ui-btn { min-height: 44px; }
  .stk-root .stk-cifra strong { font-size: 21px; }
  .stk-root .stk-accion { min-height: 38px; min-width: 38px; }
  .stk-root .stk-accion.is-icono { width: 38px; }
}
@media (max-width: 640px) {
  .stk-root .stk-capa { align-items: end; padding: 0; }
  .stk-root .stk-dialogo { width: 100%; max-height: 94vh; border-radius: 16px 16px 0 0; animation: stk-sube .26s cubic-bezier(.22,1,.36,1); }
  .stk-root .stk-dialogo-pie .ui-btn { flex: 1; }
}
`;
