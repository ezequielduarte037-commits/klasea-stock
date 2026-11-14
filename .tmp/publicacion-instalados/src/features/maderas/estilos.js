// Estilos propios de Maderas. La base es la de Laminación (clases .lam-…): la
// raíz de la pantalla lleva las dos clases, "lam mad", y acá va sólo lo que
// Laminación no tiene (armado del pedido por destino, tarjeta NFC, naranja de
// Compras). Todo con ámbito .mad y colores del tema.
export const CSS_MADERAS = `
.mad .lam-nav-marca svg { color: var(--teal); }
.mad [data-tono="naranja"] { --t: var(--orange); --t-soft: var(--orange-soft); --t-borde: var(--orange-border); }
/* Aire abajo: el aviso flotante de la app (abajo a la derecha) tapaba los
   botones de la última tarjeta. */
.mad .lam-pagina { padding-bottom: 112px; }

/* ── Recepción por destino (una obra o el stock) ── */
/* Más específico que .lam-orden.abierta, que pisa el color del borde. */
.lam-orden.mad-destino[data-tono] { border-left: 3px solid var(--t); }
.mad-destino-tit { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 15.5px; font-weight: 650; line-height: 1.25; }
.mad-destino-tit .mono { font-weight: 650; }
.mad-destino-ic { width: 28px; height: 28px; border-radius: 8px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.mad-sub-destino { display: flex; align-items: center; gap: 8px; padding: 8px 14px 6px 44px; border-top: 1px solid var(--border); background: var(--panel); font-size: 11px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--t); }
.mad-sub-destino:first-child { border-top: 0; }
.lam-item.cancelado .lam-item-nom { text-decoration: line-through; color: var(--dim); }

/* ── Armar pedido ── */
.mad-armar { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
.mad-grupos { display: grid; gap: 12px; min-width: 0; }
.mad-grupo { border: 1px solid var(--border); border-radius: 14px; background: var(--panel-solid); overflow: hidden; animation: lam-sube .35s cubic-bezier(.22,1,.36,1) both; }
.mad-grupo-cab { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 12px 10px 14px; border-bottom: 1px solid var(--border); background: var(--panel); }
.mad-grupo-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde); background: var(--t-soft); color: var(--t); }
.mad-grupo-tit { font-size: 14px; font-weight: 650; line-height: 1.2; }
.mad-grupo-tit .mono { font-weight: 650; }
.mad-grupo-sub { font-size: 11.5px; color: var(--dim); margin-top: 1px; }
.mad-grupo-cab .der { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.mad-recibir { width: 170px; min-height: 32px !important; font-size: 12.5px !important; }
.mad-lineas { display: grid; }
.mad-linea { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 9px 12px 9px 14px; border-top: 1px solid var(--border); }
.mad-linea:first-child { border-top: 0; }
.mad-linea-nom { font-size: 13.5px; font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
.mad-linea-meta { margin-top: 2px; font-size: 11.5px; color: var(--dim); display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.mad-linea-meta b { font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--t, var(--muted)); }
.mad-cant { display: flex; align-items: center; gap: 6px; }
.mad-cant .ui-input { width: 78px; min-height: 34px; text-align: right; }
.mad-cant .uni { font-size: 12px; color: var(--dim); min-width: 42px; }
.mad-cant .ui-input.uni-in { width: 84px; text-align: left; font-family: 'Outfit', sans-serif; }
.mad-agregar { display: flex; gap: 8px; align-items: center; padding: 9px 12px 11px 14px; border-top: 1px dashed var(--border); }
.mad-agregar select { flex: 1; min-width: 0; min-height: 36px; font-size: 13px; }
.mad-vacio-grupo { padding: 12px 14px; font-size: 12.5px; color: var(--subtle); }
.mad-sumar-obra { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px 12px; border: 1px dashed var(--border-2); border-radius: 14px; }
.mad-sumar-obra > span { font-size: 12.5px; font-weight: 600; color: var(--dim); white-space: nowrap; }

.mad-envio { position: sticky; top: 12px; display: grid; gap: 12px; border: 1px solid var(--border); border-radius: 16px; background: var(--panel-solid); padding: 14px; }
.mad-envio-cab { display: flex; align-items: center; gap: 8px; }
.mad-mail { width: 100%; min-height: 260px; max-height: 46vh; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg); color: var(--text); font-family: 'JetBrains Mono', monospace; font-size: 12.5px; line-height: 1.65; resize: vertical; outline: none; }
.mad-check { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); cursor: pointer; user-select: none; min-height: 32px; }
.mad-check input { width: 16px; height: 16px; accent-color: var(--violet); }
.mad-resumen { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--dim); }
.mad-resumen b { color: var(--text); font-family: 'JetBrains Mono', monospace; }
.mad-envio .ui-btn-primario { width: 100%; justify-content: center; min-height: 42px; }

/* ── Tarjeta NFC de quien retira ── */
.mad-nfc { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--t-borde); border-radius: 12px; background: var(--t-soft); }
.mad-nfc-fila { display: flex; align-items: center; gap: 10px; min-width: 0; }
.mad-nfc-ic { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex-shrink: 0; border: 1px solid var(--t-borde); background: var(--panel-solid); color: var(--t); }
.mad-nfc-foto { width: 44px; height: 44px; border-radius: 13px; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; border: 1px solid var(--green-border); background: var(--green-soft); color: var(--green); font-weight: 650; font-size: 15px; }
.mad-nfc-foto img { width: 100%; height: 100%; object-fit: cover; }
.mad-nfc-et { font-size: 10.5px; font-weight: 650; letter-spacing: .08em; text-transform: uppercase; color: var(--t); }
.mad-nfc-nom { font-size: 14px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-top: 1px; }
.mad-nfc-txt { font-size: 11.5px; color: var(--dim); margin-top: 1px; }
.mad-nfc-uid { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 6px; }
.mad-nfc-uid .ui-input { min-height: 34px; font-family: 'JetBrains Mono', monospace; font-size: 12.5px; background: var(--panel-solid); }
.mad-nfc-lector { display: flex; align-items: center; gap: 7px; font-size: 11.5px; font-weight: 600; color: var(--lector); }
.mad-nfc-lector::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: currentColor; flex-shrink: 0; }
.mad-nfc-lector button { margin-left: auto; border: 0; background: transparent; color: inherit; font: inherit; padding: 2px 0; text-decoration: underline; }

@media (max-width: 1180px) {
  .mad-armar { grid-template-columns: minmax(0, 1fr); }
  .mad-envio { position: static; }
}

@media (max-width: 640px) {
  .mad-linea { grid-template-columns: minmax(0, 1fr) auto; }
  .mad-linea > .mad-cant { grid-column: 1 / 2; grid-row: 2; }
  .mad-linea > .lam-btn-ic { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
  .mad-recibir { width: 100%; }
  .mad-grupo-cab .der { margin-left: 0; width: 100%; }
  .mad-sumar-obra { grid-template-columns: minmax(0, 1fr); }
  .mad-sub-destino { padding-left: 14px; }
}
`;
