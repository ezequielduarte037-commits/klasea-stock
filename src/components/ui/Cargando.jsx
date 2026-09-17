// Aviso de "trayendo datos" dentro de una pantalla o un bloque. Para la app
// entera o el cambio de ruta está BrandLoader.
//
// El arco gira sólo con CSS (nada de JS por cuadro), así que sirve también en la
// PDA del pañol. Antes cada pantalla escribía su propio "Cargando…": en
// mayúsculas con monoespaciada en unas, chiquito y gris en otras.
//
//   <Cargando />               bloque centrado con aire
//   <Cargando llenar />        ocupa el alto que le deje el contenedor (flex: 1)
//   <Cargando compacto />      en línea, para listas chicas
//   <Cargando texto="Buscando remitos…" />
export default function Cargando({ texto = "Cargando…", llenar = false, compacto = false }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`ui-cargando${llenar ? " is-llenar" : ""}${compacto ? " is-compacto" : ""}`}
    >
      <style href="klasea-ui-cargando" precedence="default">{CSS}</style>
      <span className="ui-cargando-arco" aria-hidden="true" />
      {texto && <span>{texto}</span>}
    </div>
  );
}

// margin en vez de gap: el gap de flex no existe en el Chrome viejo de la PDA.
const CSS = `
  .ui-cargando {
    display: flex; align-items: center; justify-content: center;
    padding: 36px 16px;
    color: var(--dim); font-size: 13px;
  }
  .ui-cargando.is-llenar { flex: 1; min-height: 0; }
  .ui-cargando.is-compacto { justify-content: flex-start; padding: 6px 0; font-size: 12.5px; }
  .ui-cargando-arco {
    width: 16px; height: 16px; margin-right: 10px; flex-shrink: 0;
    border: 2px solid var(--border-2); border-top-color: var(--blue); border-radius: 50%;
    animation: ui-cargando-giro .75s linear infinite;
  }
  .ui-cargando.is-compacto .ui-cargando-arco { width: 13px; height: 13px; margin-right: 8px; }
  @keyframes ui-cargando-giro { to { transform: rotate(360deg); } }
`;
