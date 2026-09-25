/* ═══════════════════════════════════════════════════════════════
   KLASE A · Manual del propietario
   Panel del cliente: un manual interactivo, blanco y negro, pensado
   para alguien que recién se compra el barco. Portada + doce capítulos
   + buscador + modo emergencia. El capítulo va en la URL (?cap=) para
   que el botón atrás del teléfono funcione como se espera.
═══════════════════════════════════════════════════════════════ */
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Moon, Search, Sun } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { CSS_MANUAL } from "@/features/cliente/manual/estilos";
import { CAPITULOS, capituloPorId } from "@/features/cliente/manual/contenido";
import { Mascara, Reveal, Siguiente } from "@/features/cliente/manual/piezas";
import Inicio from "@/features/cliente/manual/Inicio";
import Postventa from "@/features/cliente/manual/Postventa";
import { Indice, Buscador, ModoEmergencia } from "@/features/cliente/manual/capas";
import { useBloquearScroll } from "@/features/cliente/manual/almacen";
import {
  TuBarco, AntesDeSalir, Motores, Energia, ABordo, Regreso, Problemas,
  Seguridad, Mantenimiento, Glosario, Videos,
} from "@/features/cliente/manual/capitulos";

// El recorrido 3D arrastra three.js (~660 kB): sólo se baja si lo piden.
const Recorrido3D = lazy(() => import("@/features/cliente/manual/recorrido/Recorrido3D"));

const TONO_KEY = "ka_manual_tono";

function leerTono() {
  try { return localStorage.getItem(TONO_KEY) === "noche" ? "noche" : "dia"; } catch { return "dia"; }
}

export default function ClientePanelScreen({ session, onSignOut }) {
  const [cliente, setCliente] = useState(null);
  const [mc, setMc] = useState({});
  const [cargando, setCargando] = useState(() => !!session?.user?.id);
  const [tono, setTono] = useState(leerTono);
  const [menu, setMenu] = useState(false);
  const [buscar, setBuscar] = useState(false);
  const [sos, setSos] = useState(null);
  const [recorrido, setRecorrido] = useState(false);
  const [params, setParams] = useSearchParams();
  const cap = capituloPorId(params.get("cap"));
  const ancla = params.get("a");

  useEffect(() => {
    const id = session?.user?.id;
    if (!id) return undefined;
    let vivo = true;
    (async () => {
      const [r1, r2] = await Promise.all([
        supabase.from("clientes").select("*").eq("id", id).maybeSingle(),
        supabase.from("modelo_configuracion").select("*"),
      ]);
      if (!vivo) return;
      if (r1.data) {
        setCliente(r1.data);
        const m = r2.data?.find(x => x.modelo_barco === r1.data.modelo_barco);
        setMc(m?.caracteristicas || {});
      }
      setCargando(false);
    })().catch(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [session?.user?.id]);

  const ir = useCallback((id, extra = {}) => {
    setMenu(false);
    setBuscar(false);
    const next = {};
    if (id) next.cap = id;
    if (extra.ancla) next.a = extra.ancla;
    setParams(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [setParams]);

  const cambiarTono = useCallback(() => {
    setTono(t => {
      const n = t === "noche" ? "dia" : "noche";
      try { localStorage.setItem(TONO_KEY, n); } catch { /* sin almacenamiento */ }
      return n;
    });
  }, []);

  // "/" o Ctrl+K abren el buscador, como en el resto del sistema.
  useEffect(() => {
    const onKey = e => {
      const tag = e.target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "/" || (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        setMenu(false);
        setBuscar(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useBloquearScroll(menu || buscar);

  // Al llegar desde el buscador a un punto del capítulo, bajar hasta ahí.
  useEffect(() => {
    if (!ancla || !cap || cap.id === "glosario") return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(ancla);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
    }, 420);
    return () => clearTimeout(t);
  }, [ancla, cap]);

  if (cargando) {
    return (
      <div className="kx-carga" role="status" aria-label="Cargando el manual">
        <style href="klasea-manual" precedence="default">{CSS_MANUAL}</style>
        <span>KLASE A</span>
        <i />
      </div>
    );
  }

  const idx = cap ? CAPITULOS.findIndex(c => c.id === cap.id) : -1;
  const siguiente = cap ? CAPITULOS[idx + 1] || null : null;
  const abrirRecorrido = () => { setMenu(false); setRecorrido(true); };

  return (
    <div className="kx" data-tono={tono}>
      <style href="klasea-manual" precedence="default">{CSS_MANUAL}</style>

      <BarraSuperior
        cap={cap}
        sobreOscuro={menu || buscar}
        enPortada={!cap}
        tono={tono}
        menu={menu}
        onInicio={() => ir(null)}
        onMenu={() => { setBuscar(false); setMenu(m => !m); }}
        onBuscar={() => { setMenu(false); setBuscar(b => !b); }}
        onSOS={() => { setMenu(false); setBuscar(false); setSos("incendio"); }}
        onTono={cambiarTono}
      />

      <main key={cap?.id || "inicio"} className="kx-page">
        {!cap ? (
          <Inicio cliente={cliente} onIr={ir} onRecorrido={abrirRecorrido} />
        ) : (
          <>
            <CabeceraCapitulo cap={cap} total={CAPITULOS.length} />
            <Capitulo
              id={cap.id}
              cliente={cliente}
              mc={mc}
              ancla={ancla}
              onIr={ir}
              onSOS={() => setSos("incendio")}
              clienteId={session?.user?.id}
            />
            <Siguiente capitulo={siguiente} onIr={ir} />
          </>
        )}
      </main>

      <Pie onIr={ir} onSalir={onSignOut} />

      {menu && (
        <Indice
          actual={cap?.id || null}
          onIr={ir}
          onCerrar={() => setMenu(false)}
          onSalir={onSignOut}
          onTono={cambiarTono}
          tono={tono}
          onRecorrido={abrirRecorrido}
        />
      )}
      {buscar && (
        <Buscador
          onCerrar={() => setBuscar(false)}
          onElegir={(r) => {
            if (r.emergencia) { setBuscar(false); setSos(r.emergencia); return; }
            ir(r.cap, { ancla: r.ancla });
          }}
        />
      )}
      {recorrido && (
        <Suspense fallback={<div className="kx-rec"><div className="kx-rec-aviso"><span className="kx-eyebrow">Preparando el recorrido</span><i className="kx-rec-carga" /></div></div>}>
          <Recorrido3D modelo={cliente?.modelo_barco} tono={tono} onCerrar={() => setRecorrido(false)} />
        </Suspense>
      )}
      {sos && <ModoEmergencia inicial={sos} nombreBarco={cliente?.nombre_barco} onCerrar={() => setSos(null)} />}
    </div>
  );
}

function Capitulo({ id, cliente, mc, ancla, onIr, onSOS, clienteId }) {
  switch (id) {
    case "tu-barco":       return <TuBarco cliente={cliente} />;
    case "antes-de-salir": return <AntesDeSalir mc={mc} />;
    case "motores":        return <Motores mc={mc} />;
    case "energia":        return <Energia mc={mc} ancla={ancla} />;
    case "a-bordo":        return <ABordo mc={mc} />;
    case "regreso":        return <Regreso />;
    case "problemas":      return <Problemas onIr={onIr} />;
    case "seguridad":      return <Seguridad onSOS={onSOS} />;
    case "mantenimiento":  return <Mantenimiento />;
    case "glosario":       return <Glosario ancla={ancla} />;
    case "videos":         return <Videos />;
    case "postventa":      return <Postventa clienteId={clienteId} nombreBarco={cliente?.nombre_barco} />;
    default:               return null;
  }
}

function CabeceraCapitulo({ cap, total }) {
  return (
    <header className="kx-cap-cab">
      <div className="kx-wrap">
        <div className="kx-cap-meta">
          <span className="kx-eyebrow">Capítulo {cap.n}</span>
          <span className="kx-eyebrow">{cap.n} / {String(total).padStart(2, "0")}</span>
        </div>
        <h1 className="kx-cap-t"><Mascara texto={cap.t} /></h1>
        <p className="kx-lead">{cap.k}</p>
        <div className="kx-regla" />
      </div>
    </header>
  );
}

function BarraSuperior({ cap, sobreOscuro, enPortada, tono, menu, onInicio, onMenu, onBuscar, onSOS, onTono }) {
  const [modo, setModo] = useState("");
  const progresoRef = useRef(null);

  // Transparente sobre la portada negra; sólida con desenfoque al bajar.
  // La línea de progreso se mueve con transform, sin re-renderizar.
  useEffect(() => {
    let raf = 0;
    const medir = () => {
      raf = 0;
      const y = window.scrollY;
      const limite = enPortada ? window.innerHeight - 80 : 12;
      setModo(y > limite ? "solido" : enPortada ? "claro" : "");
      if (progresoRef.current) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        progresoRef.current.style.transform = `scaleX(${!enPortada && max > 0 ? Math.min(1, y / max) : 0})`;
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(medir); };
    medir();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enPortada, cap?.id]);

  return (
    <div className="kx-bar" data-modo={sobreOscuro ? "claro" : modo}>
      <button type="button" className="kx-marca" onClick={onInicio} aria-label="Ir a la portada del manual">
        <span className="kx-marca-k">KLASE A</span>
        {cap && !sobreOscuro && <span className="kx-marca-cap" key={cap.id}>{cap.n} — {cap.t}</span>}
      </button>
      <div className="kx-bar-der">
        <button type="button" className="kx-bar-btn" onClick={onBuscar} aria-label="Buscar en el manual">
          <Search size={17} strokeWidth={1.5} /><span className="kx-solo-ancho">Buscar</span>
        </button>
        <button type="button" className="kx-bar-btn kx-solo-ancho" onClick={onTono} aria-label={tono === "noche" ? "Modo día" : "Modo noche"}>
          {tono === "noche" ? <Sun size={17} strokeWidth={1.5} /> : <Moon size={17} strokeWidth={1.5} />}
        </button>
        <button type="button" className="kx-bar-btn kx-sos" onClick={onSOS} aria-label="Abrir modo emergencia">
          <i />SOS
        </button>
        <button type="button" className="kx-bar-btn" onClick={onMenu} aria-expanded={menu} aria-label={menu ? "Cerrar índice" : "Abrir índice"}>
          <span className="kx-solo-ancho">{menu ? "Cerrar" : "Índice"}</span>
          <span className="kx-hamb" data-abierto={menu ? "1" : "0"} />
        </button>
      </div>
      <span className="kx-progreso" ref={progresoRef} />
    </div>
  );
}

function Pie({ onIr, onSalir }) {
  const mitad = Math.ceil(CAPITULOS.length / 2);
  return (
    <footer className="kx-pie kx-ink">
      <div className="kx-wrap">
        <Reveal as="p" className="kx-pie-lema">Marcando<br />tendencia.</Reveal>
        <div className="kx-pie-cols">
          <div>
            <div className="kx-eyebrow">Capítulos</div>
            <ul>{CAPITULOS.slice(0, mitad).map(c => <li key={c.id}><button type="button" onClick={() => onIr(c.id)}>{c.t}</button></li>)}</ul>
          </div>
          <div>
            <div className="kx-eyebrow">&nbsp;</div>
            <ul>{CAPITULOS.slice(mitad).map(c => <li key={c.id}><button type="button" onClick={() => onIr(c.id)}>{c.t}</button></li>)}</ul>
          </div>
          <div>
            <div className="kx-eyebrow">Emergencias</div>
            <ul>
              <li><a href="tel:106">Prefectura Naval · 106</a></li>
              <li><span className="kx-p" style={{ fontSize: 15, minHeight: 34, display: "inline-flex", alignItems: "center" }}>Radio VHF · canal 16</span></li>
              <li><button type="button" onClick={onSalir}>Cerrar sesión</button></li>
            </ul>
          </div>
        </div>
        <div className="kx-pie-fin">
          <span className="kx-eyebrow">KLASE A · Manual del propietario</span>
          <span className="kx-eyebrow">© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}
