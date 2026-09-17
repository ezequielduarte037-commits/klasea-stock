// Encabezado común de las pantallas internas.
//
// Antes cada pantalla armaba el suyo: 50, 52, 54 o 72 px de alto, títulos en
// peso 950, íconos de 32 o 40, y en el celular un padding de 52 px a la
// izquierda para esquivar el botón de menú flotante. Ahora el alto, el ritmo y
// la versión celular salen de un solo lugar.
//
//   <PageHeader
//     icon={Package}                 // componente de lucide-react (opcional)
//     eyebrow="Pañol"                // texto chico arriba del título (opcional)
//     title="Stock de pañol"
//     subtitle="Existencias reales…"  // opcional
//     actions={<button className="ui-btn">…</button>}
//   >
//     {pestañas o filtros: segunda fila, opcional}
//   </PageHeader>
export default function PageHeader({ icon: Icon, eyebrow, title, subtitle, actions, children, className = "", style }) {
  return (
    <header className={`ui-ph ${className}`.trim()} style={style}>
      <style>{CSS}</style>
      <div className="ui-ph-fila">
        {Icon && (
          <div className="ui-ph-icono" aria-hidden="true">
            <Icon size={20} strokeWidth={2} />
          </div>
        )}
        <div className="ui-ph-textos">
          {eyebrow && <div className="ui-ph-eyebrow">{eyebrow}</div>}
          <h1 className="ui-ph-titulo">{title}</h1>
          {subtitle && <p className="ui-ph-sub">{subtitle}</p>}
        </div>
        {actions && <div className="ui-ph-acciones">{actions}</div>}
      </div>
      {children && <div className="ui-ph-extra">{children}</div>}
    </header>
  );
}

const CSS = `
  .ui-ph {
    position: relative;
    flex-shrink: 0;
    padding: 18px 28px 14px;
    border-bottom: 1px solid var(--border);
    background: var(--topbar-soft);
    -webkit-backdrop-filter: var(--glass-filter); backdrop-filter: var(--glass-filter);
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .ui-ph-fila { display: flex; align-items: center; gap: 14px; min-height: 44px; }
  .ui-ph-icono {
    width: 42px; height: 42px; flex-shrink: 0;
    display: grid; place-items: center;
    border: 1px solid var(--blue-border); border-radius: 13px;
    background: linear-gradient(145deg, var(--blue-soft), var(--cyan-soft));
    color: var(--blue);
  }
  .ui-ph-textos { flex: 1; min-width: 0; }
  .ui-ph-eyebrow {
    margin-bottom: 2px;
    font-size: 11px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase;
    color: var(--dim);
  }
  .ui-ph-titulo {
    margin: 0;
    font-size: 22px; font-weight: 700; letter-spacing: -.02em; line-height: 1.15;
    color: var(--text);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .ui-ph-sub { margin: 3px 0 0; font-size: 13px; line-height: 1.45; color: var(--dim); }
  .ui-ph-acciones { display: flex; align-items: center; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }
  .ui-ph-extra { margin-top: 14px; }

  @media (max-width: 899px) {
    .ui-ph { padding: 14px 16px 12px; }
    .ui-ph-fila { flex-wrap: wrap; gap: 12px; min-height: 0; }
    .ui-ph-icono { width: 38px; height: 38px; border-radius: 11px; }
    .ui-ph-titulo { font-size: 19px; }
    .ui-ph-sub {
      font-size: 12.5px;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    /* Las acciones bajan a su propio renglón y se desplazan de costado si no entran. */
    .ui-ph-acciones {
      width: 100%; justify-content: flex-start; flex-wrap: nowrap;
      overflow-x: auto; scrollbar-width: none;
      margin: 0 -16px; padding: 0 16px; width: calc(100% + 32px);
    }
    .ui-ph-acciones::-webkit-scrollbar { display: none; }
    .ui-ph-extra { margin-top: 12px; }
  }
`;
