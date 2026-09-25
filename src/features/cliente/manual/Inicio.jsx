/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · portada
═══════════════════════════════════════════════════════════════ */
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, LocateFixed } from "lucide-react";
import { saludoSegunHora, primerNombre } from "@/lib/saludo";
import { CAPITULOS, ESENCIAL } from "./contenido";
import { Reveal, Mascara } from "./piezas";
import { planoDe, partesModelo } from "./unidad";

export default function Inicio({ cliente, onIr, onRecorrido }) {
  const plano = planoDe(cliente?.modelo_barco);
  const { base, sufijo } = partesModelo(cliente?.modelo_barco);
  const nombre = primerNombre(cliente?.nombre_completo);
  return (
    <>
      <header className="kx-hero kx-ink">
        <div className="kx-hero-top">
          <span className="kx-eyebrow">Manual del propietario</span>
          <span className="kx-eyebrow">{[cliente?.nombre_barco, sufijo].filter(Boolean).join(" · ") || "Klase A"}</span>
        </div>
        <h1 className="kx-hero-modelo" aria-label={cliente?.modelo_barco || "Klase A"}>
          <Mascara texto={base} />
        </h1>
        <div className="kx-hero-plano" aria-hidden>
          <img src={plano.src} data-espejo={plano.espejo ? "1" : "0"} alt="" />
          <span className="kx-telon" />
        </div>
        <div className="kx-hero-pie">
          <div className="kx-hero-saludo" style={{ "--i": 0 }}>
            {saludoSegunHora()}{nombre ? `, ${nombre}` : ""}.<br />
            <span style={{ color: "var(--kx-mute)" }}>Te damos la bienvenida a bordo.</span>
          </div>
          <a className="kx-bajar" href="#kx-intro" style={{ "--i": 1 }}>
            <span className="kx-eyebrow">Descubrir</span>
            <i />
          </a>
          <div className="kx-lema" style={{ "--i": 2 }}>
            <span className="kx-eyebrow">Klase A</span>
            <strong>Marcando tendencia</strong>
          </div>
        </div>
      </header>

      <section className="kx-bloque" id="kx-intro">
        <div className="kx-wrap">
          <Reveal className="kx-eyebrow">Este manual</Reveal>
          <Reveal as="p" d={1} className="kx-declaracion" style={{ marginTop: 24 }}>
            Todo lo que necesitás para disfrutar tu barco, <em>explicado simple. Sin tecnicismos y sin necesidad de saber de náutica.</em>
          </Reveal>
          <Reveal d={2} style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 40 }}>
            <button type="button" className="kx-btn" onClick={() => onIr("tu-barco")}>Empezar por el principio <ArrowRight size={15} strokeWidth={1.5} /></button>
            {onRecorrido && <button type="button" className="kx-btn kx-btn-linea" onClick={onRecorrido}>Recorrido 3D</button>}
          </Reveal>

          <div className="kx-esencial">
            {ESENCIAL.map((e, i) => (
              <Reveal key={e.n} d={i}>
                <span className="kx-num-grande">{e.n}</span>
                <h3 className="kx-h3">{e.t}</h3>
                <p className="kx-p" style={{ flex: 1 }}>{e.d}</p>
                <button type="button" className="kx-link" style={{ alignSelf: "flex-start" }} onClick={() => onIr(e.cap)}>
                  Ver más <ArrowRight size={13} strokeWidth={1.5} />
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {cliente?.imagen_unidad && (
        <Reveal className="kx-foto" fade>
          <img src={cliente.imagen_unidad} alt={cliente?.nombre_barco || cliente?.modelo_barco || "Tu unidad"} loading="lazy" />
        </Reveal>
      )}

      <section className="kx-bloque">
        <div className="kx-wrap">
          <Reveal style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
            <div>
              <div className="kx-eyebrow">Índice</div>
              <h2 className="kx-h2">Doce capítulos</h2>
            </div>
            <p className="kx-p" style={{ maxWidth: 380 }}>Cada uno se lee en pocos minutos. Empezá por el que necesites hoy.</p>
          </Reveal>
          <ul className="kx-filas">
            {CAPITULOS.map((c, i) => (
              <Reveal as="li" key={c.id} d={i % 4}>
                <button type="button" className="kx-fila" onClick={() => onIr(c.id)}>
                  <span className="kx-mono" style={{ fontSize: 12 }}>{c.n}</span>
                  <span className="kx-fila-t">{c.t}</span>
                  <span className="kx-fila-k">{c.k}</span>
                  <ArrowUpRight size={22} strokeWidth={1.25} />
                </button>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <Condiciones />
    </>
  );
}

/* Condiciones actuales. Arranca en San Fernando (astillero) y sólo pide la
   ubicación si la persona toca el botón: nada de permisos al entrar. */
const BASE = { lat: -34.425, lon: -58.544, nombre: "San Fernando" };
const RUMBOS = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"];

function Condiciones() {
  const [lugar, setLugar] = useState(BASE);
  const [wx, setWx] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lugar.lat}&longitude=${lugar.lon}`
      + "&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m"
      + "&wind_speed_unit=kn&timezone=auto";
    fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        if (!vivo) return;
        const c = d.current || {};
        setWx({
          viento: Math.round(c.wind_speed_10m),
          rafagas: Math.round(c.wind_gusts_10m),
          rumbo: RUMBOS[Math.round((c.wind_direction_10m || 0) / 45) % 8],
          temp: Math.round(c.temperature_2m),
          hum: Math.round(c.relative_humidity_2m),
        });
        setError(false);
      })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [lugar]);

  const usarUbicacion = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      p => setLugar({ lat: p.coords.latitude, lon: p.coords.longitude, nombre: "Tu ubicación" }),
      () => { /* sin permiso: queda San Fernando */ },
      { timeout: 8000 },
    );
  };

  const v = (x) => (wx ? x : "—");
  return (
    <section className="kx-bloque kx-ink">
      <div className="kx-wrap">
        <Reveal style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="kx-eyebrow">Ahora · {lugar.nombre}</div>
            <h2 className="kx-h2">Condiciones</h2>
          </div>
          {lugar === BASE && (
            <button type="button" className="kx-link" onClick={usarUbicacion}><LocateFixed size={14} strokeWidth={1.5} /> Usar mi ubicación</button>
          )}
        </Reveal>
        <Reveal className="kx-datos" d={1}>
          <div><div className="kx-eyebrow">Viento</div><div className="kx-dato-v">{v(wx?.viento)}<small>kn {wx?.rumbo || ""}</small></div></div>
          <div><div className="kx-eyebrow">Ráfagas</div><div className="kx-dato-v">{v(wx?.rafagas)}<small>kn</small></div></div>
          <div><div className="kx-eyebrow">Temperatura</div><div className="kx-dato-v">{v(wx?.temp)}<small>°C</small></div></div>
          <div><div className="kx-eyebrow">Humedad</div><div className="kx-dato-v">{v(wx?.hum)}<small>%</small></div></div>
        </Reveal>
        <p className="kx-p" style={{ marginTop: 28, maxWidth: 620 }}>
          {error
            ? "No pudimos traer el clima ahora. Consultá el pronóstico oficial antes de salir."
            : "Es una referencia del momento. Antes de salir, consultá el pronóstico oficial y los avisos de Prefectura."}
        </p>
      </div>
    </section>
  );
}
