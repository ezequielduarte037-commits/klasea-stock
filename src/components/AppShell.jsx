import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Menu, Search } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import NotificacionesBell from "@/components/NotificacionesBell";
import LogoK from "@/components/ui/LogoK";
import { useResponsive } from "@/hooks/useResponsive";

// El contenedor de todas las pantallas internas: menú lateral + área de
// contenido. Es la ruta "layout" de App, así que se monta una sola vez.
//
// Antes cada pantalla montaba su propio <Sidebar>: al navegar se volvía a
// crear entero (con su animación de entrada y los canales de avisos), 21
// pantallas le reservaban una columna fija de 280 px aunque estuviera plegado
// a 64 —un hueco vacío de 216 px— y en el celular el botón de menú y la
// campanita flotaban encima del título de cada pantalla.
//
// Las pantallas llenan .ka-shell-content con position absolute + inset 0 (o
// height 100%) y no montan menú propio.
export default function AppShell({ profile, signOut, children }) {
  const { isMobile } = useResponsive();
  const { pathname } = useLocation();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [rutaDelMenu, setRutaDelMenu] = useState(pathname);

  // El cajón se cierra solo al cambiar de pantalla, incluso si se navegó desde
  // un link del contenido y no desde el menú.
  if (rutaDelMenu !== pathname) {
    setRutaDelMenu(pathname);
    if (menuAbierto) setMenuAbierto(false);
  }

  useEffect(() => {
    if (!isMobile || !menuAbierto) return undefined;
    const alTeclear = (e) => { if (e.key === "Escape") setMenuAbierto(false); };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [isMobile, menuAbierto]);

  // Sin perfil las rutas redirigen al login: no tiene sentido mostrar el menú.
  if (!profile) return children;

  return (
    <div className="ka-shell">
      <style>{CSS}</style>
      <Sidebar
        profile={profile}
        signOut={signOut}
        abiertoMovil={isMobile && menuAbierto}
        onCerrarMovil={() => setMenuAbierto(false)}
      />
      <div className="ka-shell-main">
        {isMobile && (
          <header className="ka-barra">
            <button
              type="button"
              className="ka-barra-boton"
              onClick={() => setMenuAbierto(true)}
              aria-label="Abrir el menú"
              aria-expanded={menuAbierto}
            >
              <Menu size={20} />
            </button>
            <div className="ka-barra-marca">
              <LogoK size={24} titulo="" />
              <span>KLASE A</span>
            </div>
            <button
              type="button"
              className="ka-barra-boton"
              onClick={() => window.dispatchEvent(new CustomEvent("klasea:open-global-search"))}
              aria-label="Buscar en Klase A"
            >
              <Search size={19} />
            </button>
            {/* En el celular la campanita vive acá y no en el menú: montar las
                dos abriría dos veces los mismos canales de realtime. */}
            <NotificacionesBell profile={profile} size={42} iconSize={19} estiloBoton={{ borderRadius: 12, background: "transparent", border: "1px solid transparent" }} />
          </header>
        )}
        <main className="ka-shell-content">{children}</main>
      </div>
    </div>
  );
}

const CSS = `
  .ka-shell {
    position: fixed; top: 0; right: 0; bottom: 0; left: 0;
    display: flex;
    overflow: hidden;
    background:
      radial-gradient(1000px 520px at 22% -8%, var(--glow-a), transparent 65%),
      radial-gradient(760px 480px at 100% 110%, var(--glow-b), transparent 70%),
      var(--bg);
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
  }
  .ka-shell-main {
    position: relative;
    flex: 1 1 auto; min-width: 0;
    display: flex; flex-direction: column;
  }
  /* Con scroll propio: las pantallas de altura fija (inset 0 / 100%) no lo
     usan, y las que crecen con su contenido se desplazan acá adentro. */
  .ka-shell-content {
    position: relative;
    flex: 1 1 auto; min-height: 0;
    overflow-x: hidden; overflow-y: auto;
  }
  /* Sin z-index a propósito: así los modales de cada pantalla (fixed, con su
     propio z-index) tapan también esta barra. */
  .ka-barra {
    position: relative;
    flex-shrink: 0;
    display: flex; align-items: center; gap: 6px;
    height: calc(58px + env(safe-area-inset-top, 0px));
    padding: env(safe-area-inset-top, 0px) 10px 0;
    border-bottom: 1px solid var(--border);
    background: var(--topbar);
    -webkit-backdrop-filter: blur(16px) saturate(140%); backdrop-filter: blur(16px) saturate(140%);
  }
  .ka-barra-boton {
    width: 42px; height: 42px; min-height: 0;
    display: grid; place-items: center;
    border: 1px solid transparent; border-radius: 12px;
    background: transparent; color: var(--text);
    transition: background-color .15s, border-color .15s;
  }
  .ka-barra-boton:active { background: var(--panel-2); border-color: var(--border); }
  .ka-barra-marca {
    flex: 1; min-width: 0;
    display: flex; align-items: center; gap: 9px;
    padding-left: 4px;
    color: var(--text);
    font-size: 13.5px; font-weight: 750; letter-spacing: .18em;
    white-space: nowrap;
  }
`;
