import { useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Lock, User } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { esAndroidLegacyAngosto, tieneMarcaDeColector } from "@/lib/modoColector";
import FondoOleaje from "@/components/ui/FondoOleaje";
import LogoK from "@/components/ui/LogoK";
import { leerMovimientoReducido } from "@/components/ui/useReducedMotion";
import { debeMostrarIntro } from "./efectosLogin";

// ─── LOGIN ─────────────────────────────────────────────────────────────────
// Campo único: usuario (sin @, sin distinción visible)
// El sistema prueba @klasea.local primero, luego @klasea.client
// y redirige automáticamente según el rol que devuelva el perfil.
// ──────────────────────────────────────────────────────────────────────────

// Internos:  usuario  → usuario@klasea.local
// Clientes:  usuario  → usuario@klasea.client
function toLocalEmail(u)  { return `${String(u||"").trim().toLowerCase()}@klasea.local`;  }
function toClientEmail(u) { return `${String(u||"").trim().toLowerCase()}@klasea.client`; }

// Sólo rutas internas. Un next con esquema propio o que arranque con "//" sería
// un redirect abierto: bastaría mandar un mail con ese link para que la pantalla
// de login de Klase A deposite al usuario en otro sitio.
function destinoSeguro(next) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

// De dónde sale el telón de la intro: el centro del botón que se apretó.
function centroDe(elemento) {
  if (!elemento) return null;
  const caja = elemento.getBoundingClientRect();
  return { x: Math.round(caja.left + caja.width / 2), y: Math.round(caja.top + caja.height / 2) };
}

export default function LoginScreen({ onLoggedIn, onBienvenida }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [usuario,  setUsuario]  = useState("");
  const [password, setPassword] = useState("");
  const [err,      setErr]      = useState("");
  const [busy,     setBusy]     = useState(false);
  const [verClave, setVerClave] = useState(false);
  const [mayusculas, setMayusculas] = useState(false);
  // El PDA del pañol también entra por acá, con un Android viejo: sin agua
  // animada ni entradas, que el formulario responda al toque.
  const [liviano] = useState(() => esAndroidLegacyAngosto() || tieneMarcaDeColector());
  const formRef = useRef(null);
  const botonRef = useRef(null);

  function sacudir() {
    if (liviano || leerMovimientoReducido() || typeof formRef.current?.animate !== "function") return;
    formRef.current.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-9px)" },
        { transform: "translateX(7px)" },
        { transform: "translateX(-4px)" },
        { transform: "translateX(2px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 420, easing: "cubic-bezier(.36,.07,.19,.97)" },
    );
  }

  function detectarMayusculas(e) {
    if (typeof e.getModifierState === "function") setMayusculas(e.getModifierState("CapsLock"));
  }

  async function handleLogin(e) {
    e.preventDefault();
    setErr("");
    setBusy(true);

    const u = usuario.trim();
    if (!u || !password) { setErr("Completá los dos campos."); setBusy(false); sacudir(); return; }

    let entro = false;
    try {
      // Si ya tiene @ → es email directo (clientes con email real o nuevos con @klasea.client)
      // Si no tiene @ → probar como personal interno, luego como cliente por username
      const esEmail = u.includes("@");
      const intentos = esEmail
        ? [u.toLowerCase()]
        : [toLocalEmail(u.toLowerCase()), toClientEmail(u.toLowerCase())];

      let data = null;
      let ultimoError = null;
      for (const email of intentos) {
        const res = await supabase.auth.signInWithPassword({ email, password });
        if (!res.error && res.data?.session) { data = res.data; break; }
        if (res.error) ultimoError = res.error;
      }

      if (!data?.session) {
        // Un usuario dado de baja queda baneado en auth. Con el mensaje
        // genérico se quedaría probando contraseñas que nunca van a entrar.
        const motivo = String(ultimoError?.message || "").toLowerCase();
        setErr(motivo.includes("banned") || motivo.includes("disabled")
          ? "Tu usuario está dado de baja. Hablá con el administrador."
          : "Usuario o contraseña incorrectos.");
        sacudir();
        return;
      }

      // Se navega recién con el perfil cargado. Antes se navegaba igual y, si
      // el perfil todavía no estaba, "/" rebotaba a /login con el formulario en
      // blanco: había que poner la cuenta dos veces. Ver loadProfile en App.
      const perfil = await onLoggedIn?.(data.session);
      if (!perfil) {
        // Sin perfil habilitado (dado de baja en profiles o sin perfil cargado).
        // Si falló la conexión, App ya muestra su propia pantalla de error.
        setErr("Tu usuario no tiene acceso habilitado. Hablá con el administrador.");
        sacudir();
        return;
      }

      entro = true;
      // Vuelve a donde quería ir, si venía de un link. RequireRole se encarga
      // de rebotarlo igual si ese destino no le corresponde por rol.
      const destino = destinoSeguro(searchParams.get("next")) || "/";
      if (onBienvenida && debeMostrarIntro(perfil)) {
        // La intro navega sola cuando termina de tapar la pantalla.
        onBienvenida({ destino, origen: centroDe(botonRef.current) });
      } else {
        nav(destino, { replace: true });
      }
    } catch {
      setErr("Error inesperado. Intentá de nuevo.");
      sacudir();
    } finally {
      // Si entró, el botón sigue en "Ingresando…" hasta que cambie la pantalla.
      if (!entro) setBusy(false);
    }
  }

  return (
    <div className={liviano ? "kl-login kl-liviano" : "kl-login"}>
      <style>{CSS_LOGIN}</style>

      <section className="kl-marca" aria-label="Klase A">
        {!liviano && <FondoOleaje />}

        <div className="kl-marca-top">
          <LogoK size={34} className="kl-logo-dibujo" />
          <span className="kl-marca-nombre">KLASE A</span>
        </div>

        <div className="kl-marca-cuerpo">
          <div className="kl-kicker kl-anima" style={{ animationDelay: "120ms" }}>
            <span className="kl-kicker-raya" />
            Astillero · Sistema de gestión
          </div>
          <p className="kl-titulo kl-anima" style={{ animationDelay: "220ms" }}>
            Marcando <span className="kl-acento">tendencia</span>
          </p>
          <p className="kl-bajada kl-anima" style={{ animationDelay: "340ms" }}>
            Obras, compras, pañol y producción del astillero, en un solo lugar.
          </p>
        </div>

        <div className="kl-marca-pie">© 2026 Astillero Klase A</div>
      </section>

      <main className="kl-panel">
        <div className="kl-caja kl-anima" style={{ animationDelay: "60ms" }}>
          <div className="kl-movil">
            <LogoK size={40} className="kl-logo-dibujo" />
            <div>
              <div className="kl-marca-nombre">KLASE A</div>
              <div className="kl-movil-lema">Marcando tendencia</div>
            </div>
          </div>

          <h1 className="kl-h1">Iniciá sesión</h1>
          <p className="kl-sub">Entrá con tu usuario del astillero o con tu email.</p>

          <form ref={formRef} onSubmit={handleLogin} noValidate>
            <label className="kl-label" htmlFor="kl-usuario">Usuario</label>
            <div className="kl-campo">
              <User className="kl-campo-icono" size={17} aria-hidden="true" />
              <input
                id="kl-usuario"
                className="kl-input"
                autoFocus
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={usuario}
                onChange={e => { setUsuario(e.target.value); setErr(""); }}
                placeholder="nombre.apellido o email"
              />
            </div>

            <label className="kl-label" htmlFor="kl-clave">Contraseña</label>
            <div className="kl-campo">
              <Lock className="kl-campo-icono" size={17} aria-hidden="true" />
              <input
                id="kl-clave"
                className="kl-input kl-input-clave"
                type={verClave ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr(""); }}
                onKeyDown={detectarMayusculas}
                onKeyUp={detectarMayusculas}
                onBlur={() => setMayusculas(false)}
                placeholder="••••••••"
              />
              <button
                type="button"
                className="kl-ojo"
                onMouseDown={e => e.preventDefault()}
                onClick={() => setVerClave(v => !v)}
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verClave}
                title={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {verClave ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            {mayusculas && <div className="kl-mayus">Bloq Mayús está activado</div>}

            {err && <div className="kl-error" role="alert">{err}</div>}

            <button ref={botonRef} className="kl-boton" type="submit" disabled={busy}>
              {busy
                ? <><span className="kl-giro" aria-hidden="true" />Ingresando…</>
                : <>Ingresar<ArrowRight size={17} aria-hidden="true" /></>}
            </button>
          </form>

          <p className="kl-ayuda">¿Olvidaste tu contraseña? Contactá al administrador.</p>
        </div>

        <div className="kl-panel-pie">© 2026 Astillero Klase A</div>
      </main>
    </div>
  );
}

const CSS_LOGIN = `
  .kl-login {
    --kl-glow: rgba(59,130,246,0.20);
    --kl-glow-2: rgba(34,211,238,0.07);
    --kl-boton-sombra: rgba(126,179,255,0.38);
    /* top/right/bottom/left además de inset, y márgenes en vez de gap donde se
       ve en el celular: el PDA del pañol trae un Chrome que no entiende ninguno
       de los dos. */
    position: fixed; top: 0; right: 0; bottom: 0; left: 0;
    display: flex;
    background: var(--bg);
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
    overflow: hidden;
  }
  html[data-theme="light"] .kl-login { --kl-glow: rgba(29,78,216,0.12); --kl-glow-2: rgba(3,105,161,0.07); --kl-boton-sombra: rgba(29,78,216,0.32); }
  html[data-theme="hc"] .kl-login { --kl-glow: transparent; --kl-glow-2: transparent; --kl-boton-sombra: transparent; }

  /* ── Marca ── */
  .kl-marca {
    position: relative;
    flex: 1 1 auto; min-width: 0;
    display: flex; flex-direction: column; justify-content: space-between;
    padding: 36px 52px 32px;
    overflow: hidden;
    background:
      radial-gradient(900px 560px at 16% 8%, var(--kl-glow), transparent 65%),
      radial-gradient(760px 520px at 88% 78%, var(--kl-glow-2), transparent 70%),
      var(--bg);
    border-right: 1px solid var(--border);
  }
  .kl-marca > div { position: relative; z-index: 1; }
  .kl-marca-top { display: flex; align-items: center; gap: 12px; color: var(--text); }
  .kl-marca-nombre { font-size: 15px; font-weight: 800; letter-spacing: .2em; color: var(--text); }
  .kl-marca-cuerpo { max-width: 600px; margin-bottom: 16vh; }
  .kl-kicker {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 22px;
    font-size: 11.5px; font-weight: 600; letter-spacing: .24em; text-transform: uppercase;
    color: var(--dim);
  }
  .kl-kicker-raya { width: 30px; height: 1px; background: linear-gradient(90deg, var(--blue), var(--cyan)); }
  .kl-titulo {
    margin: 0;
    font-size: clamp(46px, 5.6vw, 88px); font-weight: 700; line-height: .98; letter-spacing: -.035em;
    color: var(--text);
  }
  .kl-acento {
    display: inline-block; padding-bottom: .08em;
    background: linear-gradient(90deg, var(--blue), var(--cyan));
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .kl-bajada { margin: 22px 0 0; max-width: 430px; font-size: 16.5px; line-height: 1.55; color: var(--muted); }
  .kl-marca-pie { font-size: 12px; letter-spacing: .04em; color: var(--dim); }

  /* ── Formulario ── */
  .kl-panel {
    position: relative; z-index: 1;
    flex: 0 0 clamp(420px, 36vw, 520px);
    display: flex; flex-direction: column; align-items: center;
    padding: 40px 48px;
    background: var(--panel-solid);
    overflow-y: auto;
  }
  .kl-caja { width: 100%; max-width: 360px; margin: auto 0; }
  .kl-movil { display: none; }
  .kl-h1 { margin: 0 0 8px; font-size: 28px; font-weight: 700; letter-spacing: -.02em; color: var(--text); }
  .kl-sub { margin: 0 0 30px; font-size: 14.5px; line-height: 1.5; color: var(--dim); }
  .kl-label { display: block; margin: 0 0 8px; font-size: 13px; font-weight: 600; color: var(--muted); }
  .kl-campo { position: relative; margin-bottom: 18px; }
  .kl-campo-icono {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    color: var(--dim); pointer-events: none;
    transition: color .18s;
  }
  .kl-campo:focus-within .kl-campo-icono { color: var(--blue); }
  .kl-input {
    width: 100%; height: 48px; box-sizing: border-box;
    padding: 0 14px 0 42px;
    border: 1px solid var(--border); border-radius: 12px;
    background: var(--panel);
    color: var(--text);
    font-family: inherit; font-size: 15px;
    outline: none;
    transition: border-color .18s, box-shadow .18s, background-color .18s;
  }
  .kl-input-clave { padding-right: 50px; }
  .kl-input::placeholder { color: var(--subtle); }
  .kl-input:hover { border-color: var(--border-2); }
  .kl-input:focus { border-color: var(--blue); background: var(--panel-2); box-shadow: 0 0 0 4px var(--blue-soft); }
  .kl-ojo {
    position: absolute; right: 6px; top: 50%; transform: translateY(-50%);
    width: 36px; height: 36px; min-height: 0;
    display: grid; place-items: center;
    border: 0; border-radius: 9px;
    background: transparent; color: var(--dim);
    cursor: pointer;
    transition: color .15s, background-color .15s;
  }
  .kl-ojo:hover { color: var(--text); background: var(--panel-2); }
  .kl-ojo:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .kl-mayus { margin: -8px 0 16px; font-size: 12.5px; font-weight: 500; color: var(--cyan); }
  .kl-error {
    margin: 0 0 16px; padding: 11px 13px;
    border: 1px solid var(--red-border); border-radius: 11px;
    background: var(--red-soft); color: var(--red);
    font-size: 13.5px; line-height: 1.4;
  }
  .kl-boton {
    position: relative; overflow: hidden;
    width: 100%; height: 50px; margin-top: 6px;
    display: flex; align-items: center; justify-content: center;
    border: 0; border-radius: 12px;
    background-color: var(--blue);
    background-image: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0));
    color: var(--inverse-text);
    font-family: inherit; font-size: 15px; font-weight: 700; letter-spacing: .01em;
    cursor: pointer;
    box-shadow: 0 12px 28px -12px var(--kl-boton-sombra), inset 0 1px 0 rgba(255,255,255,.18);
    transition: transform .18s cubic-bezier(.22,1,.36,1), box-shadow .18s, filter .18s;
  }
  .kl-boton::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.34) 50%, transparent 65%);
    transform: translateX(-110%);
    transition: transform .8s cubic-bezier(.22,1,.36,1);
    pointer-events: none;
  }
  .kl-boton:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.05); box-shadow: 0 16px 34px -12px var(--kl-boton-sombra), inset 0 1px 0 rgba(255,255,255,.18); }
  .kl-boton:hover:not(:disabled)::after { transform: translateX(110%); }
  .kl-boton:active:not(:disabled) { transform: translateY(0); }
  .kl-boton:focus-visible { outline: 2px solid var(--text); outline-offset: 3px; }
  .kl-boton:disabled { cursor: progress; }
  .kl-boton svg { margin-left: 10px; transition: transform .18s; }
  .kl-boton:hover:not(:disabled) svg { transform: translateX(3px); }
  .kl-giro {
    width: 16px; height: 16px; margin-right: 10px; box-sizing: border-box;
    border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;
    animation: kl-giro .7s linear infinite;
  }
  .kl-ayuda {
    margin: 26px 0 0; padding-top: 20px;
    border-top: 1px solid var(--border);
    text-align: center; font-size: 13px; color: var(--dim);
  }
  .kl-panel-pie { display: none; }

  /* ── Movimiento ── */
  @keyframes kl-sube { from { opacity: 0; transform: translateY(14px); } }
  @keyframes kl-giro { to { transform: rotate(360deg); } }
  @keyframes kl-trazo-anillo { from { stroke-dashoffset: 288; } }
  @keyframes kl-trazo-palo { from { stroke-dashoffset: 60; } }
  @keyframes kl-trazo-curva { from { stroke-dashoffset: 145; } }
  .kl-anima { animation: kl-sube .7s cubic-bezier(.22,1,.36,1) backwards; }
  .kl-logo-dibujo circle { animation: kl-trazo-anillo 1.1s .1s cubic-bezier(.65,0,.35,1) backwards; }
  .kl-logo-dibujo path:first-child { animation: kl-trazo-palo .5s .6s cubic-bezier(.65,0,.35,1) backwards; }
  .kl-logo-dibujo path:last-child { animation: kl-trazo-curva .8s .8s cubic-bezier(.65,0,.35,1) backwards; }

  .kl-liviano .kl-anima,
  .kl-liviano .kl-logo-dibujo circle,
  .kl-liviano .kl-logo-dibujo path { animation: none; }
  .kl-liviano .kl-boton::after { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .kl-login *, .kl-login *::after { animation: none !important; transition: none !important; }
  }

  /* ── Celular y ventanas angostas: la marca pasa a ser el fondo ── */
  @media (max-width: 959px) {
    .kl-marca { position: absolute; top: 0; right: 0; bottom: 0; left: 0; padding: 0; border-right: 0; }
    .kl-marca-top, .kl-marca-cuerpo, .kl-marca-pie { display: none; }
    .kl-panel { flex: 1 1 auto; padding: 24px 16px; background: transparent; }
    .kl-caja {
      max-width: 400px;
      padding: 28px 22px 24px;
      border: 1px solid var(--border); border-radius: 20px;
      background: var(--panel-solid);
      box-shadow: 0 24px 60px -24px var(--shadow-strong);
    }
    .kl-movil { display: flex; align-items: center; margin-bottom: 26px; color: var(--text); }
    .kl-movil svg { flex-shrink: 0; margin-right: 12px; }
    .kl-movil-lema { margin-top: 3px; font-size: 11px; letter-spacing: .2em; text-transform: uppercase; color: var(--dim); }
    .kl-h1 { font-size: 23px; }
    .kl-sub { margin-bottom: 22px; }
    .kl-panel-pie { display: block; margin-top: 18px; font-size: 11.5px; color: var(--dim); }
  }
`;
