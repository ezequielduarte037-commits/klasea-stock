/**
 * Estilos de Ingresos, con la clase `.ing`. PC: carga a la izquierda e
 * historial a la derecha; celular: uno abajo del otro.
 */
export const CSS_INGRESOS = `
  .ing { font-family: 'Outfit', system-ui, sans-serif; color: var(--text); }
  .ing .ing-num { font-family: 'JetBrains Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ing .ing-dim { color: var(--dim); }
  .ing.ing-root { max-width: 1400px; margin: 0 auto; padding: 16px 20px 40px; }
  .ing .ing-grilla { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(320px, 1fr); gap: 16px; align-items: start; }
  .ing .ing-carga { padding: 16px 18px; }
  .ing .ing-cab { display: flex; align-items: center; gap: 10px; justify-content: space-between; margin-bottom: 12px; }
  .ing .ing-cab h2 { margin: 0; display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 650; }
  .ing .ing-cab .ing-dim { font-size: 13px; }
  .ing .ing-lbl { display: block; margin-bottom: 4px; font-size: 12.5px; font-weight: 600; color: var(--muted); }
  .ing .ing-lbl .ing-dim { font-weight: 400; }
  .ing .ing-campo { display: block; min-width: 0; }
  .ing .ing-datos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .ing .ing-alerta { margin: 10px 0 0; padding: 9px 12px; border: 1px solid var(--red-border); border-radius: 10px; background: var(--red-soft); color: var(--red); font-size: 13px; }

  .ing .ing-buscar { position: relative; margin-top: 14px; }
  .ing .ing-buscar .ui-input { min-height: 46px; padding-left: 40px; padding-right: 40px; font-size: 15px; }
  .ing .ing-buscar-ico { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--blue); pointer-events: none; }
  .ing .ing-buscar-x { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); width: 38px; height: 38px; display: grid; place-items: center; border: 0; background: transparent; color: var(--dim); border-radius: 9px; }
  .ing .ing-resultados { list-style: none; margin: 6px 0 0; padding: 4px; border: 1px solid var(--border-2); border-radius: 12px; background: var(--panel-solid-2); }
  .ing .ing-resultado {
    width: 100%; display: flex; align-items: center; gap: 10px;
    min-height: 46px; padding: 6px 10px; border: 0; border-radius: 9px;
    background: transparent; color: var(--text); font: inherit; text-align: left;
  }
  .ing .ing-resultado:hover { background: var(--panel-2); }
  .ing .ing-resultado svg { color: var(--blue); flex-shrink: 0; }
  .ing .ing-resultado-txt { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 14px; }
  .ing .ing-resultado-txt small { font-size: 12px; }
  .ing .ing-vacio-lineas { margin: 16px 0 4px; padding: 18px; border: 1px dashed var(--border-2); border-radius: 12px; text-align: center; color: var(--dim); font-size: 13.5px; }

  .ing .ing-lineas { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .ing .ing-linea { padding: 12px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); display: flex; flex-direction: column; gap: 10px; }
  .ing .ing-linea.is-incompleta { border-color: var(--cyan-border); }
  .ing .ing-linea-cab { display: flex; align-items: flex-start; gap: 8px; }
  .ing .ing-linea-tit { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ing .ing-linea-desc { font-size: 14.5px; font-weight: 600; line-height: 1.25; }
  .ing .ing-linea-tit small { font-size: 12px; }
  .ing .ing-linea-cant { display: grid; grid-template-columns: 110px 1fr; gap: 10px; align-items: end; }
  .ing .ing-seg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
  .ing .ing-seg > button {
    min-height: 40px; padding: 0 8px; border: 1px solid var(--border-2); border-radius: 10px;
    background: var(--panel-solid); color: var(--muted); font: inherit; font-size: 13px; font-weight: 500;
  }
  .ing .ing-seg > button.is-activa { background: var(--blue-soft); border-color: var(--blue); color: var(--blue); font-weight: 600; }
  .ing .ing-linea-caja { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; align-items: end; }
  .ing .ing-recordar { grid-column: 1 / -1; display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); min-height: 32px; }
  .ing .ing-recordar input { width: 17px; height: 17px; accent-color: var(--blue); }
  .ing .ing-linea-pie { display: grid; grid-template-columns: 1fr 160px auto; gap: 10px; align-items: end; }
  .ing .ing-equivale { font-size: 13.5px; color: var(--muted); padding-bottom: 10px; }
  .ing .ing-equivale b { color: var(--teal); font-weight: 600; font-size: 15px; }
  .ing .ing-falta { color: var(--cyan); font-weight: 500; }
  .ing .ing-subtotal { padding-bottom: 10px; font-size: 14px; font-weight: 600; min-width: 80px; text-align: right; }

  .ing .ing-nota { margin-top: 14px; }
  .ing .ing-pie { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border); }
  .ing .ing-total { flex: 1; min-width: 180px; font-size: 14px; color: var(--muted); }
  .ing .ing-total b { color: var(--text); font-weight: 700; }
  .ing .ing-pie-btns { display: flex; gap: 8px; }
  .ing .ing-pie-btns .ui-btn-primario { min-height: 44px; padding: 0 18px; }

  .ing .ing-historial { min-width: 0; }
  .ing .ing-historial .ing-cab { margin-bottom: 8px; }
  .ing .ing-grupos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .ing .ing-grupo { overflow: hidden; }
  .ing .ing-grupo.is-anulado { opacity: .6; }
  .ing .ing-grupo-cab {
    width: 100%; display: flex; align-items: center; gap: 8px;
    min-height: 56px; padding: 8px 12px; border: 0; background: transparent;
    color: var(--text); font: inherit; text-align: left;
  }
  .ing .ing-grupo-cab > svg { color: var(--dim); flex-shrink: 0; }
  .ing .ing-grupo-tit { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 14px; font-weight: 500; }
  .ing .ing-grupo-tit small { font-size: 12px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ing .ing-grupo-total { font-size: 13.5px; font-weight: 600; flex-shrink: 0; }
  .ing .ing-grupo-cuerpo { padding: 0 12px 12px; border-top: 1px solid var(--border); }
  .ing .ing-grupo-filas { list-style: none; margin: 0; padding: 0; }
  .ing .ing-grupo-filas li { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
  .ing .ing-grupo-filas li.is-anulado { text-decoration: line-through; opacity: .6; }
  .ing .ing-grupo-desc { min-width: 0; }
  .ing .ing-grupo-filas .ing-num { font-size: 12.5px; }
  .ing .ing-anulado-motivo { margin: 8px 0 0; font-size: 12.5px; color: var(--red); }
  .ing .ing-anular { margin-top: 10px; display: flex; flex-direction: column; gap: 8px; }
  .ing .ing-anular-btns { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .ing .ing-anular-btn { margin-top: 8px; min-height: 32px; font-size: 12.5px; }
  .ing .ing-vacio { max-width: 420px; margin: 32px auto; padding: 22px; text-align: center; }

  @media (max-width: 999px) {
    .ing .ing-grilla { grid-template-columns: 1fr; }
  }
  @media (max-width: 640px) {
    .ing.ing-root { padding: 12px 12px 32px; }
    .ing .ing-carga { padding: 14px 12px; }
    .ing .ing-datos { grid-template-columns: 1fr; }
    .ing .ing-linea-cant { grid-template-columns: 1fr; }
    .ing .ing-linea-pie { grid-template-columns: 1fr auto; }
    .ing .ing-equivale { grid-column: 1 / -1; padding-bottom: 0; }
    .ing .ing-pie-btns { width: 100%; }
    .ing .ing-pie-btns .ui-btn-primario { flex: 1; }
  }

.ing .ing-ia { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.ing .ing-ia .ui-btn { min-height: 42px; }
.ing .ing-pedidos { border: 1px solid var(--blue-border, var(--border)); background: var(--blue-soft, var(--panel-2)); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.ing .ing-pedidos h3 { margin: 0 0 4px; font-size: 14px; font-weight: 650; }
.ing .ing-pedidos p { margin: 0; font-size: 13px; }
.ing .ing-pedidos ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.ing .ing-pedidos li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--panel-solid); border: 1px solid var(--border); }
.ing .ing-pedido-txt { display: grid; gap: 2px; min-width: 0; }
.ing .ing-pedido-activo { margin: 0 0 12px; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--panel-2); font-size: 13px; }
.ing .ing-revisar { border: 1px solid var(--violet-border); background: var(--violet-soft); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
.ing .ing-revisar h3 { margin: 0 0 4px; font-size: 14px; font-weight: 650; }
.ing .ing-revisar ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.ing .ing-revisar li { display: grid; gap: 6px; padding: 8px; border-radius: 10px; background: var(--panel-solid); border: 1px solid var(--border); }
.ing .ing-revisar-txt { display: grid; gap: 2px; min-width: 0; }
.ing .ing-revisar-txt strong { font-weight: 600; overflow-wrap: anywhere; }
.ing .ing-revisar-opciones { display: flex; flex-wrap: wrap; gap: 6px; }
.ing .ing-revisar-opciones .ui-btn { min-height: 36px; font-size: 13px; }
`;
