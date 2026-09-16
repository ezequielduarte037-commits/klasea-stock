import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { esDispositivoTactil } from "@/lib/modoColector";
import LogoK from "./LogoK";
import { aRgb, ajustarCanvas, colorDelTema, dibujarOleaje, rgba } from "./efectosLogin";

// La intro de marca al iniciar sesión. Un telón circular sale del botón
// "Ingresar", el monograma se dibuja trazo por trazo, "KLASE A" se descifra
// letra por letra, el agua se agita y aparece "Marcando tendencia".
//
// Todo cuelga de un solo reloj (T). Saltarla —clic, toque, Esc, Enter o
// espacio— es adelantar ese reloj hasta la salida.
//
// En cuanto el telón tapa la pantalla navega al destino: el home carga detrás
// mientras corre la animación, así que no le agrega espera a nadie.

const MARCA = "KLASE A";
const LEMA = ["MARCANDO", "TENDENCIA"];
const GLIFOS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/+*";

// Milisegundos desde que arranca.
const T = {
  cubrir: 560,
  anillo: [220, 1180],
  palo: [640, 980],
  curva: [820, 1480],
  impacto: 1440,
  letras: 1180,
  letraPaso: 70,
  letraDur: 440,
  linea: [1720, 2220],
  lema: 1880,
  lemaPaso: 26,
  lemaDur: 520,
  brillo: [2250, 2950],
  salida: 3000,
  telon: [3120, 3600],
};

// Si el navegador deja de dar cuadros (pestaña en segundo plano, equipo
// trabado) la intro igual se cierra: no puede quedar tapando la app.
const TOPE_MS = 6500;

const limitar = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const tramo = (t, [desde, hasta]) => limitar((t - desde) / (hasta - desde));
const suave = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const frenar = (p) => 1 - Math.pow(1 - p, 3);
const acelerar = (p) => p * p * p;

export default function IntroMarca({ destino, origen, onFin }) {
  const navigate = useNavigate();
  const [tactil] = useState(esDispositivoTactil);
  const raizRef = useRef(null);
  const canvasRef = useRef(null);
  const centroRef = useRef(null);
  const haloRef = useRef(null);
  const giroRef = useRef(null);
  const anilloRef = useRef(null);
  const paloRef = useRef(null);
  const curvaRef = useRef(null);
  const marcaRef = useRef(null);
  const lineaRef = useRef(null);
  const lemaRef = useRef(null);
  const pistaRef = useRef(null);

  const irAlDestino = useEffectEvent(() => {
    if (destino) navigate(destino, { replace: true });
  });
  const avisarFin = useEffectEvent(() => {
    onFin?.();
  });

  useEffect(() => {
    const raiz = raizRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext ? canvas.getContext("2d") : null;
    const centro = centroRef.current;
    const halo = haloRef.current;
    const giro = giroRef.current;
    const lineaEl = lineaRef.current;
    const pista = pistaRef.current;

    const trazos = [
      { el: anilloRef.current, tramo: T.anillo },
      { el: paloRef.current, tramo: T.palo },
      { el: curvaRef.current, tramo: T.curva },
    ].map((trazo) => ({ ...trazo, largo: Number(trazo.el.getAttribute("stroke-dasharray")) || 0 }));

    const letras = Array.from(marcaRef.current.querySelectorAll("[data-letra]")).map((el) => ({
      el,
      final: el.getAttribute("data-letra"),
      tanda: -1,
      dx: 0,
    }));
    const letrasLema = Array.from(lemaRef.current.querySelectorAll("[data-letra]"));

    const claro = document.documentElement.dataset.theme === "light";
    const colorOla = ctx ? aRgb(ctx, colorDelTema("--blue", "#7eb3ff")) : [126, 179, 255];
    const colorReflejo = ctx ? aRgb(ctx, colorDelTema("--cyan", "#67e8f9")) : [103, 232, 249];
    const colorTexto = ctx ? aRgb(ctx, colorDelTema("--text", "#f4f4f5")) : [244, 244, 245];

    let medida = ctx ? ajustarCanvas(canvas, ctx) : { ancho: window.innerWidth, alto: window.innerHeight };
    const ox = origen ? origen.x : medida.ancho / 2;
    const oy = origen ? origen.y : medida.alto / 2;

    const montada = performance.now();
    let inicio = montada;
    let cuadroId = 0;
    let navegado = false;
    let terminado = false;
    let recorte = null;
    let anchoMarca = 0;
    let letrasMedidas = false;
    let impacto = null;

    function navegar() {
      if (navegado) return;
      navegado = true;
      irAlDestino();
    }

    function cerrar() {
      if (terminado) return;
      terminado = true;
      navegar();
      avisarFin();
    }

    function recortar(valor) {
      if (valor === recorte) return;
      recorte = valor;
      raiz.style.clipPath = valor;
      raiz.style.webkitClipPath = valor;
    }

    // Cada letra de "KLASE A" queda con el ancho de su letra final: mientras se
    // descifra pasa por glifos más anchos o más angostos y la palabra no puede
    // bailar. Además cada una se lleva su parte del brillo y del degradé, que
    // tienen que correr continuos por toda la palabra.
    function medirLetras() {
      letrasMedidas = true;
      const primera = letras[0].el.getBoundingClientRect();
      const ultima = letras[letras.length - 1].el.getBoundingClientRect();
      anchoMarca = ultima.right - primera.left;
      for (const letra of letras) {
        const caja = letra.el.getBoundingClientRect();
        letra.el.style.width = `${caja.width}px`;
        letra.el.style.backgroundSize = `${anchoMarca * 3}px 100%`;
        letra.dx = primera.left - caja.left;
      }
      const acento = lemaRef.current.querySelector("[data-acento]");
      if (!acento) return;
      const cajaAcento = acento.getBoundingClientRect();
      for (const el of acento.querySelectorAll("[data-letra]")) {
        const caja = el.getBoundingClientRect();
        el.style.backgroundSize = `${cajaAcento.width}px 100%`;
        el.style.backgroundPosition = `${cajaAcento.left - caja.left}px 0`;
      }
    }

    // La K termina de dibujarse y el agua "recibe" el golpe: tres ondas y un
    // rocío de gotas que salen desde el anillo.
    function prepararImpacto() {
      const caja = anilloRef.current.getBoundingClientRect();
      const cx = caja.left + caja.width / 2;
      const cy = caja.top + caja.height / 2;
      const radio = caja.width / 2;
      const colores = [rgba(colorOla, 1), rgba(colorReflejo, 1), rgba(colorTexto, 1)];
      impacto = {
        cx,
        cy,
        radio,
        gotas: Array.from({ length: 90 }, () => {
          const angulo = Math.random() * Math.PI * 2;
          const velocidad = 140 + Math.random() * 420;
          return {
            x: cx + Math.cos(angulo) * radio,
            y: cy + Math.sin(angulo) * radio,
            vx: Math.cos(angulo) * velocidad,
            vy: Math.sin(angulo) * velocidad,
            freno: 2.2 + Math.random() * 1.8,
            vida: 0.8 + Math.random() * 0.9,
            tam: 0.7 + Math.random() * 1.7,
            color: colores[Math.floor(Math.random() * colores.length)],
            alfa: 0.55 + Math.random() * 0.45,
          };
        }),
      };
    }

    function dibujarImpacto(t) {
      if (t < T.impacto) return;
      if (!impacto) prepararImpacto();
      const alcance = Math.max(medida.ancho, medida.alto) * 0.75;
      ctx.strokeStyle = rgba(colorOla, 1);
      for (let k = 0; k < 3; k++) {
        const p = (t - T.impacto - k * 190) / 1900;
        if (p <= 0 || p >= 1) continue;
        ctx.beginPath();
        ctx.arc(impacto.cx, impacto.cy, impacto.radio + frenar(p) * alcance, 0, Math.PI * 2);
        ctx.lineWidth = 0.4 + 1.6 * (1 - p);
        ctx.globalAlpha = 0.5 * (1 - p) * (1 - p);
        ctx.stroke();
      }
      const seg = (t - T.impacto) / 1000;
      for (const gota of impacto.gotas) {
        const vida = seg / gota.vida;
        if (vida >= 1) continue;
        const avance = (1 - Math.exp(-gota.freno * seg)) / gota.freno;
        ctx.globalAlpha = gota.alfa * Math.pow(1 - vida, 1.6);
        ctx.fillStyle = gota.color;
        ctx.beginPath();
        ctx.arc(gota.x + gota.vx * avance, gota.y + gota.vy * avance + 30 * seg * seg, gota.tam, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function pintar(t) {
      // Telón: primero crece desde el botón; cuando tapa todo se navega, y al
      // final sube como una cortina y deja ver la pantalla que cargó detrás.
      if (t < T.cubrir) {
        const radio = suave(limitar(t / T.cubrir))
          * (Math.hypot(Math.max(ox, medida.ancho - ox), Math.max(oy, medida.alto - oy)) + 2);
        recortar(`circle(${radio.toFixed(1)}px at ${ox}px ${oy}px)`);
      } else {
        navegar();
        const pTelon = suave(tramo(t, T.telon));
        recortar(pTelon > 0 ? `inset(0px 0px ${(pTelon * 100).toFixed(2)}% 0px)` : "none");
      }

      if (ctx) {
        ctx.clearRect(0, 0, medida.ancho, medida.alto);
        const subida = frenar(tramo(t, [120, 1700]));
        dibujarOleaje(ctx, {
          ancho: medida.ancho,
          alto: medida.alto,
          t: t / 1000,
          linea: colorOla,
          reflejo: colorReflejo,
          horizonte: 0.76 + (1 - subida) * 0.3,
          alfa: (claro ? 0.34 : 0.46) * subida,
          filas: 24,
        });
        dibujarImpacto(t);
      }

      // Monograma.
      for (const trazo of trazos) {
        trazo.el.style.strokeDashoffset = (trazo.largo * (1 - suave(tramo(t, trazo.tramo)))).toFixed(2);
      }
      const pLogo = frenar(tramo(t, [T.anillo[0], T.curva[1]]));
      giro.style.transform = `scale(${(0.82 + 0.18 * pLogo).toFixed(4)}) rotate(${((1 - pLogo) * -28).toFixed(2)}deg)`;
      const pHalo = frenar(tramo(t, [900, 1600]));
      const pulso = t > T.impacto ? Math.exp(-(t - T.impacto) / 420) : 0;
      halo.style.opacity = (pHalo * (0.8 + 0.2 * pulso)).toFixed(3);
      halo.style.transform = `translate(-50%, -50%) scale(${(0.7 + 0.3 * pHalo + 0.22 * pulso).toFixed(4)})`;

      // "KLASE A": cada letra entra con glifos al azar y se clava en la suya.
      if (!letrasMedidas && t >= T.letras - 40) medirLetras();
      const corrimientoBrillo = (-1.8 + 1.6 * suave(tramo(t, T.brillo))) * anchoMarca;
      letras.forEach((letra, i) => {
        const desde = T.letras + i * T.letraPaso;
        const p = limitar((t - desde) / T.letraDur);
        letra.el.style.opacity = limitar(p * 3).toFixed(3);
        letra.el.style.transform = `translateY(${((1 - frenar(p)) * 0.3).toFixed(3)}em)`;
        letra.el.style.backgroundPosition = `${(corrimientoBrillo + letra.dx).toFixed(1)}px 0`;
        if (letra.final === " ") return;
        if (p > 0 && p < 0.72) {
          const tanda = Math.floor((t - desde) / 55);
          if (tanda !== letra.tanda) {
            letra.tanda = tanda;
            letra.el.textContent = GLIFOS[Math.floor(Math.random() * GLIFOS.length)];
          }
        } else if (letra.el.textContent !== letra.final) {
          letra.el.textContent = letra.final;
        }
      });

      const pLinea = suave(tramo(t, T.linea));
      lineaEl.style.transform = `scaleX(${pLinea.toFixed(4)})`;
      lineaEl.style.opacity = limitar(pLinea * 2).toFixed(3);

      letrasLema.forEach((el, i) => {
        const p = frenar(limitar((t - T.lema - i * T.lemaPaso) / T.lemaDur));
        el.style.opacity = p.toFixed(3);
        el.style.transform = `translateY(${((1 - p) * 0.9).toFixed(3)}em)`;
      });

      const pSalida = acelerar(tramo(t, [T.salida, T.salida + 380]));
      centro.style.opacity = (1 - pSalida).toFixed(3);
      centro.style.transform = pSalida > 0
        ? `translateY(${(-24 * pSalida).toFixed(2)}px) scale(${(1 + 0.05 * pSalida).toFixed(4)})`
        : "";
      pista.style.opacity = (0.7 * tramo(t, [1100, 1600]) * (1 - pSalida)).toFixed(3);
    }

    function bucle(ahora) {
      if (terminado) return;
      const t = ahora - inicio;
      pintar(t);
      if (t >= T.telon[1]) {
        cerrar();
        return;
      }
      cuadroId = window.requestAnimationFrame(bucle);
    }

    function saltar(evento) {
      if (evento.type === "keydown" && (evento.repeat || !["Escape", "Enter", " ", "Spacebar"].includes(evento.key))) return;
      // El Enter que mandó el formulario no tiene que saltarse la intro que disparó.
      if (performance.now() - montada < 300) return;
      if (performance.now() - inicio < T.salida) inicio = performance.now() - T.salida;
    }

    function redimensionar() {
      if (ctx) medida = ajustarCanvas(canvas, ctx);
    }

    pintar(0);
    cuadroId = window.requestAnimationFrame(bucle);
    const tope = window.setTimeout(cerrar, TOPE_MS);
    raiz.addEventListener("pointerdown", saltar);
    window.addEventListener("keydown", saltar);
    window.addEventListener("resize", redimensionar);

    return () => {
      terminado = true;
      window.cancelAnimationFrame(cuadroId);
      window.clearTimeout(tope);
      raiz.removeEventListener("pointerdown", saltar);
      window.removeEventListener("keydown", saltar);
      window.removeEventListener("resize", redimensionar);
    };
  }, [origen]);

  // El primer cuadro ya sale recortado a un círculo de radio 0: sin esto la
  // intro taparía todo de golpe durante un frame antes de que corra el efecto.
  const recorteInicial = origen ? `circle(0px at ${origen.x}px ${origen.y}px)` : "circle(0px at 50% 50%)";

  return (
    <div
      ref={raizRef}
      className="kl-intro"
      style={{ clipPath: recorteInicial, WebkitClipPath: recorteInicial }}
      aria-hidden="true"
    >
      <style>{CSS_INTRO}</style>
      <canvas ref={canvasRef} className="kl-intro-canvas" />

      <div ref={centroRef} className="kl-intro-centro">
        <div className="kl-intro-logo">
          <div ref={haloRef} className="kl-intro-halo" />
          <div ref={giroRef} className="kl-intro-giro">
            <LogoK size={120} oculto anilloRef={anilloRef} paloRef={paloRef} curvaRef={curvaRef} />
          </div>
        </div>

        <div ref={marcaRef} className="kl-intro-marca">
          {MARCA.split("").map((letra, i) => (
            <span
              key={i}
              data-letra={letra}
              className={letra === " " ? "kl-intro-letra kl-intro-espacio" : "kl-intro-letra"}
            >
              {letra === " " ? " " : letra}
            </span>
          ))}
        </div>

        <div ref={lineaRef} className="kl-intro-linea" />

        <div ref={lemaRef} className="kl-intro-lema">
          {LEMA.map((palabra, j) => (
            <span key={palabra} className="kl-intro-palabra" data-acento={j === 1 ? "" : undefined}>
              {palabra.split("").map((letra, i) => (
                <span key={i} data-letra={letra} className="kl-intro-letra-lema">{letra}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div ref={pistaRef} className="kl-intro-pista">
        {tactil ? "Tocá para continuar" : "Clic o Esc para saltar"}
      </div>
    </div>
  );
}

const CSS_INTRO = `
  .kl-intro {
    --kl-intro-glow: rgba(59,130,246,0.16);
    --kl-intro-halo: rgba(96,165,250,0.30);
    position: fixed; inset: 0; z-index: 100000;
    overflow: hidden;
    background:
      radial-gradient(1100px 680px at 50% 40%, var(--kl-intro-glow), transparent 70%),
      var(--bg);
    color: var(--text);
    font-family: 'Outfit', system-ui, sans-serif;
    cursor: pointer;
    user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
  }
  html[data-theme="light"] .kl-intro { --kl-intro-glow: rgba(29,78,216,0.09); --kl-intro-halo: rgba(29,78,216,0.16); }
  html[data-theme="hc"] .kl-intro { --kl-intro-glow: transparent; --kl-intro-halo: rgba(255,255,255,0.10); }

  .kl-intro-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  .kl-intro-centro {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    padding: 24px 16px 80px;
    will-change: transform, opacity;
  }

  .kl-intro-logo {
    position: relative;
    width: clamp(76px, 13vmin, 124px); height: clamp(76px, 13vmin, 124px);
    margin-bottom: clamp(22px, 4.2vmin, 38px);
  }
  .kl-intro-logo svg { width: 100%; height: 100%; display: block; overflow: visible; }
  .kl-intro-giro { position: relative; width: 100%; height: 100%; transform: scale(.82) rotate(-28deg); will-change: transform; }
  .kl-intro-halo {
    position: absolute; left: 50%; top: 50%;
    width: 330%; height: 330%;
    border-radius: 50%;
    background: radial-gradient(closest-side, var(--kl-intro-halo), transparent);
    opacity: 0;
    transform: translate(-50%, -50%) scale(.7);
    pointer-events: none;
  }

  .kl-intro-marca {
    display: flex; justify-content: center;
    font-size: clamp(40px, 9vw, 108px); font-weight: 700; line-height: 1.05;
    white-space: nowrap;
  }
  .kl-intro-letra {
    display: inline-block; margin: 0 .07em;
    text-align: center;
    opacity: 0;
    background-image: linear-gradient(100deg, var(--text) 0%, var(--text) 42%, var(--cyan) 50%, var(--text) 58%, var(--text) 100%);
    background-repeat: no-repeat;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }
  .kl-intro-espacio { width: .3em; }

  .kl-intro-linea {
    width: clamp(160px, 34vw, 460px); height: 1px;
    margin: clamp(18px, 3.4vmin, 30px) 0 clamp(14px, 2.8vmin, 24px);
    background: linear-gradient(90deg, transparent, var(--blue), var(--cyan), transparent);
    transform: scaleX(0); opacity: 0;
  }

  .kl-intro-lema {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 1em;
    font-size: clamp(11px, 1.5vw, 16px); font-weight: 500; letter-spacing: .5em;
    color: var(--muted);
  }
  .kl-intro-palabra { display: inline-flex; white-space: nowrap; margin-right: -.5em; }
  .kl-intro-letra-lema { display: inline-block; opacity: 0; }
  .kl-intro-palabra[data-acento] .kl-intro-letra-lema {
    font-weight: 600;
    background-image: linear-gradient(90deg, var(--blue), var(--cyan));
    background-repeat: no-repeat;
    -webkit-background-clip: text; background-clip: text;
    -webkit-text-fill-color: transparent; color: transparent;
  }

  .kl-intro-pista {
    position: absolute; left: 0; right: 0; bottom: max(24px, env(safe-area-inset-bottom));
    text-align: center;
    font-size: 11px; font-weight: 500; letter-spacing: .22em; text-transform: uppercase;
    color: var(--dim);
    opacity: 0;
  }
`;
