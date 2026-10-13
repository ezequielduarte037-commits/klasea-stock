// Estilos de la pestaña Solicitudes. Todo cuelga de `.sol` (la raíz): nada se
// escapa al resto de la app. Solo tokens del tema; nada de ámbar: lo pendiente
// es cian o violeta, lo urgente rojo, lo listo verde y la acción azul.
//
// El ancho lo decide el contenedor, no la ventana: SolicitudesTab mide su raíz
// y pone `is-angosto` (una columna, el detalle tapa la bandeja).

const MONO = "'JetBrains Mono', 'IBM Plex Mono', monospace";

export const CSS_SOLICITUDES = `
.sol {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0;
  display: flex; flex-direction: column; min-height: 0; overflow: hidden;
  color: var(--text); font-family: 'Outfit', system-ui, sans-serif;
}
.sol button { font: inherit; }
.sol .sol-num { font-family: ${MONO}; font-variant-numeric: tabular-nums; }
.sol .sol-dim { color: var(--dim); }
.sol .sol-muted { color: var(--muted); }
.sol .sol-cuerpo { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); position: relative; }
.sol.is-angosto .sol-cuerpo { grid-template-columns: minmax(0, 1fr); }

/* ── Bandeja ────────────────────────────────────────────────────────────── */
.sol .sol-bandeja { min-height: 0; overflow: auto; border-right: 1px solid var(--border); display: flex; flex-direction: column; }
.sol.is-angosto .sol-bandeja { border-right: 0; }
.sol .sol-bandeja-cab {
  position: sticky; top: 0; z-index: 2; display: grid; gap: 10px;
  padding: 12px 14px 10px; background: var(--bg); border-bottom: 1px solid var(--border);
}
.sol .sol-fila { display: flex; align-items: center; gap: 8px; min-width: 0; }
.sol .sol-buscar { position: relative; flex: 1; min-width: 0; }
.sol .sol-buscar svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); pointer-events: none; }
.sol .sol-buscar input { width: 100%; min-height: 44px; padding-left: 36px; }
.sol .sol-grupos {
  display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none;
  -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent);
          mask-image: linear-gradient(90deg, #000 calc(100% - 18px), transparent);
  padding-right: 18px;
}
.sol .sol-grupos::-webkit-scrollbar { display: none; }
.sol .sol-grupo {
  display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0; min-height: 40px; padding: 0 12px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--panel); color: var(--muted);
  font-size: 13px; font-weight: 500; white-space: nowrap;
}
.sol .sol-grupo .sol-num { font-size: 12px; color: var(--dim); }
.sol .sol-grupo.is-activo { border-color: var(--blue-border); background: var(--blue-soft); color: var(--blue); font-weight: 600; }
.sol .sol-grupo.is-activo .sol-num { color: var(--blue); }
.sol .sol-lista { display: grid; gap: 8px; padding: 10px 12px 28px; align-content: start; }
.sol .sol-seccion-titulo {
  display: flex; align-items: center; gap: 8px; margin: 6px 2px 0;
  font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim);
}
.sol .sol-seccion-titulo.is-violeta { color: var(--violet); }

.sol .sol-tarjeta {
  display: grid; overflow: hidden;
  border: 1px solid var(--border); border-radius: 13px; background: var(--panel);
  transition: border-color .15s, background .15s;
}
.sol .sol-tarjeta:hover { border-color: var(--border-2); }
.sol .sol-tarjeta.is-elegida { border-color: var(--blue-border); background: var(--blue-soft); }
.sol .sol-tarjeta.is-urgente { box-shadow: inset 3px 0 0 var(--red); }
.sol .sol-tarjeta-btn {
  display: grid; gap: 6px; width: 100%; min-width: 0; text-align: left; padding: 12px 13px;
  border: 0; background: transparent; color: var(--text);
}
.sol .sol-tarjeta-btn > span { min-width: 0; }
.sol .sol-tarjeta-obra {
  display: flex; align-items: flex-start; gap: 8px; padding: 9px 13px;
  border-top: 1px solid var(--violet-border); background: var(--violet-soft); font-size: 12.5px; color: var(--text);
}
.sol .sol-tarjeta-obra svg { color: var(--violet); flex-shrink: 0; margin-top: 1px; }
.sol .sol-tarjeta-obra a { color: var(--blue); font-weight: 600; }
.sol .sol-tarjeta > .sol-tarjeta-asignar { padding: 0 13px 12px; }
@keyframes sol-gira { to { transform: rotate(360deg); } }
.sol .sol-gira { animation: sol-gira .9s linear infinite; }
.sol .sol-tarjeta-cab { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.sol .sol-tarjeta-n { font-family: ${MONO}; font-size: 15px; font-weight: 700; }
.sol .sol-tarjeta-destino { font-size: 15px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sol .sol-tarjeta-quien { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sol .sol-tarjeta-pie { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--dim); }
.sol .sol-tarjeta-asignar { display: flex; gap: 8px; flex-wrap: wrap; }

.sol .sol-tag {
  display: inline-flex; align-items: center; gap: 5px; min-height: 22px; padding: 0 8px;
  border: 1px solid var(--border); border-radius: 999px; background: var(--panel-2);
  color: var(--muted); font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
.sol .sol-tag.is-rojo { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }
.sol .sol-tag.is-verde { color: var(--green); border-color: var(--green-border); background: var(--green-soft); }
.sol .sol-tag.is-azul { color: var(--blue); border-color: var(--blue-border); background: var(--blue-soft); }
.sol .sol-tag.is-cian { color: var(--cyan); border-color: var(--cyan-border); background: var(--cyan-soft); }
.sol .sol-tag.is-violeta { color: var(--violet); border-color: var(--violet-border); background: var(--violet-soft); }
.sol .sol-retiro.is-hoy, .sol .sol-retiro.is-atrasada { color: var(--red); font-weight: 600; }
.sol .sol-retiro.is-manana { color: var(--cyan); font-weight: 600; }
.sol .sol-avance { display: inline-flex; align-items: center; gap: 6px; }
.sol .sol-avance i { display: block; width: 46px; height: 5px; border-radius: 999px; background: var(--panel-3, var(--border)); overflow: hidden; position: relative; }
.sol .sol-avance i b { position: absolute; top: 0; left: 0; bottom: 0; background: var(--green); border-radius: inherit; }

.sol .sol-vacio { padding: 28px 16px; text-align: center; color: var(--muted); font-size: 14px; }
.sol .sol-vacio strong { display: block; color: var(--text); font-weight: 600; margin-bottom: 4px; }

/* ── Detalle ────────────────────────────────────────────────────────────── */
.sol .sol-detalle { min-height: 0; display: flex; flex-direction: column; background: var(--bg); }
.sol.is-angosto .sol-detalle { position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 5; }
.sol .sol-detalle-vacio { flex: 1; display: grid; place-items: center; padding: 24px; text-align: center; color: var(--muted); }
.sol .sol-detalle-barra {
  display: flex; align-items: center; gap: 10px; flex-shrink: 0; flex-wrap: wrap;
  padding: 10px 16px; border-bottom: 1px solid var(--border);
}
.sol .sol-detalle-titulo { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 1; }
.sol .sol-detalle-titulo h2 { margin: 0; font-size: 20px; font-weight: 700; white-space: nowrap; }
.sol .sol-detalle-scroll { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px 24px; display: grid; gap: 14px; align-content: start; }
.sol .sol-detalle-pie {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); background: var(--bg);
}
.sol .sol-detalle-pie .sol-espacio { flex: 1; }

.sol .sol-bloque { display: grid; gap: 10px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--panel); }
.sol .sol-bloque-titulo {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  font-size: 12px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--dim);
}
.sol .sol-bloque-titulo .sol-espacio { flex: 1; }

.sol .sol-cabecera { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px 12px; }
.sol .sol-campo { display: grid; gap: 5px; min-width: 0; }
.sol .sol-campo > span { font-size: 12px; font-weight: 500; color: var(--muted); }
.sol .sol-campo input, .sol .sol-campo select, .sol .sol-campo textarea { width: 100%; min-height: 44px; }
.sol .sol-campo textarea { min-height: 64px; resize: vertical; padding-top: 10px; }
.sol .sol-campo.is-ancho { grid-column: 1 / -1; }
.sol .sol-urgente {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--muted); font-weight: 600;
}
.sol .sol-urgente.is-activo { color: var(--red); border-color: var(--red-border); background: var(--red-soft); }

.sol .sol-aviso {
  display: flex; gap: 10px; align-items: flex-start; padding: 11px 13px;
  border: 1px solid var(--violet-border); border-radius: 12px; background: var(--violet-soft); color: var(--text); font-size: 13.5px;
}
.sol .sol-aviso > svg { color: var(--violet); flex-shrink: 0; margin-top: 1px; }
.sol .sol-aviso.is-rojo { border-color: var(--red-border); background: var(--red-soft); }
.sol .sol-aviso.is-rojo > svg { color: var(--red); }
.sol .sol-aviso.is-cian { border-color: var(--cyan-border); background: var(--cyan-soft); }
.sol .sol-aviso.is-cian > svg { color: var(--cyan); }
.sol .sol-aviso.is-verde { border-color: var(--green-border); background: var(--green-soft); }
.sol .sol-aviso.is-verde > svg { color: var(--green); }
.sol .sol-aviso-texto { display: grid; gap: 4px; min-width: 0; flex: 1; }
.sol .sol-aviso-texto strong { font-weight: 600; }
.sol .sol-aviso a { color: var(--blue); font-weight: 600; }

/* Agregar / buscar productos */
.sol .sol-agregar { display: grid; gap: 8px; }
.sol .sol-lector { position: relative; flex: 1; min-width: 0; }
.sol .sol-lector > svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); color: var(--blue); pointer-events: none; }
.sol .sol-lector input {
  width: 100%; min-height: 46px; padding: 0 12px 0 40px;
  border: 1.5px solid var(--blue-border); border-radius: 12px; background: var(--panel-solid); color: var(--text);
  font-size: 15px; outline: none;
}
.sol .sol-lector input:focus { border-color: var(--blue); box-shadow: 0 0 0 3px var(--blue-soft); }
.sol .sol-resultados { display: grid; gap: 4px; }
.sol .sol-resultado {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px;
  min-height: 48px; padding: 6px 10px; width: 100%; text-align: left;
  border: 1px solid var(--border); border-radius: 11px; background: var(--panel-solid); color: var(--text);
}
.sol .sol-resultado:hover, .sol .sol-resultado.is-activo { border-color: var(--blue-border); background: var(--blue-soft); }
.sol .sol-resultado-nombre { min-width: 0; display: grid; gap: 2px; }
.sol .sol-resultado-nombre span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.sol .sol-resultado-nombre small { color: var(--dim); font-size: 12px; }
.sol .sol-modo-resolver { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; color: var(--violet); }

/* Ubicación: lo primero que se ve, para ir al estante. */
.sol .sol-ubic {
  display: inline-grid; place-items: center; min-width: 70px; min-height: 40px; padding: 0 8px;
  border: 1px solid var(--cyan-border); border-radius: 10px; background: var(--cyan-soft); color: var(--cyan);
  font-family: ${MONO}; font-size: 15px; font-weight: 700; letter-spacing: .02em; white-space: nowrap;
}
.sol .sol-ubic.is-chica { min-width: 56px; min-height: 30px; font-size: 12.5px; border-radius: 8px; }
.sol .sol-ubic.is-sin { border-style: dashed; border-color: var(--border-2); background: transparent; color: var(--dim); font-family: inherit; font-size: 11.5px; font-weight: 500; }

/* Renglones */
.sol .sol-renglones { display: grid; gap: 6px; }
.sol .sol-renglon {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; align-items: center; gap: 10px;
  padding: 8px 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--panel-solid);
}
.sol .sol-renglon.is-listo { border-color: var(--green-border); }
.sol .sol-renglon.is-listo .sol-renglon-nombre { color: var(--muted); }
.sol .sol-renglon-info { min-width: 0; display: grid; gap: 3px; }
.sol .sol-renglon-nombre { font-size: 14.5px; font-weight: 600; line-height: 1.25; overflow-wrap: anywhere; }
.sol .sol-renglon-sub { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.sol .sol-stock.is-sin_stock, .sol .sol-stock.is-negativo { color: var(--red); font-weight: 600; }
.sol .sol-stock.is-bajo { color: var(--violet); font-weight: 600; }
.sol .sol-stock.is-ok { color: var(--muted); }
.sol .sol-cant { display: inline-flex; align-items: center; gap: 4px; }
.sol .sol-cant button {
  width: 40px; height: 44px; display: grid; place-items: center;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--text);
}
.sol .sol-cant button:disabled { opacity: .45; }
.sol .sol-cant input {
  width: 64px; min-height: 44px; text-align: center; padding: 0 4px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--text);
  font-family: ${MONO}; font-size: 16px; font-weight: 600;
}
.sol .sol-cant small { min-width: 34px; font-size: 12px; color: var(--dim); }
.sol .sol-listo {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 88px; min-height: 44px; padding: 0 12px;
  border: 1px solid var(--border-2); border-radius: 10px; background: var(--panel); color: var(--muted); font-weight: 600;
}
.sol .sol-listo.is-activo { background: var(--green-soft); border-color: var(--green-border); color: var(--green); }
.sol .sol-listo.is-falta { background: var(--red-soft); border-color: var(--red-border); color: var(--red); }
.sol .sol-quitar {
  width: 44px; height: 44px; display: grid; place-items: center;
  border: 1px solid transparent; border-radius: 10px; background: transparent; color: var(--dim);
}
.sol .sol-quitar:hover { color: var(--red); background: var(--red-soft); }
.sol .sol-renglon-cant-fija { font-family: ${MONO}; font-size: 16px; font-weight: 700; text-align: right; }

/* Escritos a mano: para resolver */
.sol .sol-libre { display: grid; gap: 8px; padding: 10px 12px; border: 1px dashed var(--violet-border); border-radius: 12px; background: var(--violet-soft); }
.sol .sol-libre-cab { display: flex; align-items: flex-start; gap: 10px; }
.sol .sol-libre-texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
.sol .sol-libre-texto strong { font-weight: 600; overflow-wrap: anywhere; }
.sol .sol-libre-texto small { color: var(--muted); font-size: 12px; }
.sol .sol-candidatos { display: flex; flex-wrap: wrap; gap: 6px; }
.sol .sol-candidato {
  display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 4px 12px 4px 6px; max-width: 100%;
  border: 1px solid var(--blue-border); border-radius: 10px; background: var(--panel-solid); color: var(--text); text-align: left;
}
.sol .sol-candidato span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.sol .sol-candidato:hover { background: var(--blue-soft); }

.sol .sol-fotos { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
.sol .sol-fotos a { flex-shrink: 0; width: 64px; height: 64px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); display: block; }
.sol .sol-fotos img { width: 100%; height: 100%; object-fit: cover; display: block; }

.sol .sol-btn-grande {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px; min-height: 52px; padding: 0 22px;
  border: 0; border-radius: 13px; background: var(--blue); color: var(--inverse-text); font-size: 16px; font-weight: 650;
}
.sol .sol-btn-grande.is-verde { background: var(--green); }
.sol .sol-btn-grande:disabled { opacity: .5; cursor: not-allowed; }
.sol .sol-btn-grande .sol-tecla { font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: rgba(255,255,255,.18); }
.sol .sol-entregada {
  display: flex; align-items: center; gap: 12px; padding: 13px 14px;
  border: 1px solid var(--green-border); border-radius: 14px; background: var(--green-soft);
}
.sol .sol-entregada > svg { color: var(--green); flex-shrink: 0; }

/* ── Hojas (entregar, deshacer, nueva) ──────────────────────────────────── */
.sol .sol-hoja-fondo {
  position: absolute; top: 0; right: 0; bottom: 0; left: 0; z-index: 20;
  display: grid; place-items: center; padding: 16px; background: var(--overlay);
}
.sol .sol-hoja {
  width: min(560px, 100%); max-height: 100%; overflow: auto; display: grid; gap: 14px; align-content: start;
  padding: 18px; border: 1px solid var(--border-2); border-radius: 18px; background: var(--panel-solid); box-shadow: var(--elev-2);
  outline: none; animation: sol-sube .22s cubic-bezier(.22,1,.36,1);
}
.sol .sol-hoja-cab { display: flex; align-items: flex-start; gap: 10px; }
.sol .sol-hoja-cab h3 { margin: 0; flex: 1; font-size: 18px; font-weight: 650; }
.sol .sol-hoja-cab p { margin: 2px 0 0; color: var(--muted); font-size: 13px; }
.sol .sol-hoja-acciones { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
@keyframes sol-sube { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }

.sol .sol-tarjeta-nfc {
  display: flex; align-items: center; gap: 14px; padding: 16px;
  border: 1.5px dashed var(--blue-border); border-radius: 14px; background: var(--blue-soft);
}
.sol .sol-tarjeta-nfc > svg { color: var(--blue); flex-shrink: 0; }
.sol .sol-tarjeta-nfc h4 { margin: 0 0 3px; font-size: 16px; font-weight: 600; }
.sol .sol-tarjeta-nfc p { margin: 0; font-size: 13px; color: var(--muted); }
.sol .sol-persona { display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--green-border); border-radius: 14px; background: var(--green-soft); }
.sol .sol-avatar {
  width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; overflow: hidden;
  background: var(--panel-2); color: var(--text); font-weight: 650; position: relative;
}
.sol .sol-avatar img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; }
.sol .sol-persona-texto { flex: 1; min-width: 0; display: grid; gap: 2px; }
.sol .sol-persona-texto strong { font-size: 16px; font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sol .sol-persona-texto small { color: var(--muted); font-size: 12.5px; }
.sol .sol-personas { display: grid; gap: 4px; }
.sol .sol-persona-res {
  display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: center; text-align: left;
  min-height: 48px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 11px; background: var(--panel); color: var(--text);
}
.sol .sol-persona-res:hover, .sol .sol-persona-res.is-activa { border-color: var(--blue-border); background: var(--blue-soft); }
.sol .sol-persona-res span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.sol .sol-persona-res small { color: var(--dim); font-size: 12px; }
.sol .sol-enlace { border: 0; background: transparent; color: var(--blue); font-weight: 600; padding: 0; min-height: 32px; text-align: left; }

@media (max-width: 640px) {
  .sol .sol-hoja-fondo { place-items: end stretch; padding: 0; }
  .sol .sol-hoja { width: 100%; border-radius: 18px 18px 0 0; padding-bottom: calc(18px + env(safe-area-inset-bottom)); max-height: 94%; }
  .sol .sol-hoja-acciones > * { flex: 1; }
}

/* Renglón en una columna angosta: la ubicación arriba a la izquierda, los controles abajo. */
.sol.is-angosto .sol-renglon,
.sol .sol-detalle.is-angosto .sol-renglon {
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: "ubic info info" "cant cant listo";
}
.sol.is-angosto .sol-renglon > .sol-ubic,
.sol .sol-detalle.is-angosto .sol-renglon > .sol-ubic { grid-area: ubic; align-self: start; }
.sol.is-angosto .sol-renglon > .sol-renglon-info,
.sol .sol-detalle.is-angosto .sol-renglon > .sol-renglon-info { grid-area: info; }
.sol.is-angosto .sol-renglon > .sol-cant,
.sol .sol-detalle.is-angosto .sol-renglon > .sol-cant { grid-area: cant; }
.sol.is-angosto .sol-renglon > .sol-acciones-renglon,
.sol .sol-detalle.is-angosto .sol-renglon > .sol-acciones-renglon { grid-area: listo; justify-self: end; }
.sol .sol-acciones-renglon { display: inline-flex; align-items: center; gap: 4px; }
/* A 390 px: el renglón tiene ~336 px útiles; se achican el número y el tilde. */
.sol.is-angosto .sol-cant input,
.sol .sol-detalle.is-angosto .sol-cant input { width: 56px; }
.sol.is-angosto .sol-listo,
.sol .sol-detalle.is-angosto .sol-listo { min-width: 76px; padding: 0 10px; }
.sol .sol-detalle-titulo { flex-wrap: wrap; row-gap: 4px; }
.sol.is-angosto .sol-detalle-titulo h2 { font-size: 18px; }
.sol.is-angosto .sol-detalle-pie .sol-btn-grande { flex: 1; }
`;
