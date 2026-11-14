/* ═══════════════════════════════════════════════════════════════
   Manual del propietario · capítulos
═══════════════════════════════════════════════════════════════ */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Eye, EyeOff, Play, Search, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import {
  ANATOMIA, TRUCO_BABOR, DATOS_UNIDAD, PRE_ZARPE, ARRANQUE, INSTRUMENTOS, MANDO_ELECTRONICO,
  FUENTES, CONSUMOS, BATERIAS, MALACATE_ANTES, MALACATE_ERRORES, EQUIPOS, REGRESO,
  DIAGNOSTICO, FUSIBLES, TELEFONOS, EMERGENCIAS, EQUIPO_SEGURIDAD, BITACORA_ITEMS,
  BITACORA_ESTADOS, GLOSARIO, VIDEOS, slug, normalizar,
} from "./contenido";
import { Reveal, Bloque, Nota, ListaVerificacion, PasoAPaso, Acordeon } from "./piezas";
import { leerLocal, guardarLocal, leerJson, guardarJson } from "./almacen";
import { planoDe } from "./unidad";

const pad = n => String(n).padStart(2, "0");
const fmt = n => Number(n).toLocaleString("es-AR");

/* ═════════════ 01 · Tu barco ═════════════ */
export function TuBarco({ cliente }) {
  const plano = planoDe(cliente?.modelo_barco);
  const [sel, setSel] = useState(null);
  const def = ANATOMIA.find(a => a.id === sel);
  return (
    <>
      <Bloque eyebrow="Anatomía" titulo="Cómo se llama cada parte" intro="Seis palabras alcanzan para entender cualquier indicación a bordo o por radio. Tocá cada una para verla en el plano.">
        <Reveal className="kx-anat" data-sel={sel || undefined}>
          <div className="kx-anat-img">
            <img src={plano.src} data-espejo={plano.espejo ? "1" : "0"} alt={`Plano de ${cliente?.modelo_barco || "la unidad"} visto desde arriba`} />
            {ANATOMIA.filter(a => a.id !== "eslora" && a.id !== "manga").map(a => (
              <span key={a.id} className="kx-marca-a" data-p={a.id} data-on={sel === a.id ? "1" : "0"}>{a.t}</span>
            ))}
            <span className="kx-cota" data-p="eslora" data-on={sel === "eslora" ? "1" : "0"} />
            <span className="kx-marca-a" data-p="eslora-t" data-on={sel === "eslora" ? "1" : "0"}>Eslora</span>
            <span className="kx-cota" data-p="manga" data-on={sel === "manga" ? "1" : "0"} />
            <span className="kx-marca-a" data-p="manga-t" data-on={sel === "manga" ? "1" : "0"}>Manga</span>
          </div>
        </Reveal>
        <div className="kx-anat-lista">
          {ANATOMIA.map((a, i) => (
            <Reveal as="button" d={i} type="button" key={a.id} aria-pressed={sel === a.id}
              onClick={() => setSel(sel === a.id ? null : a.id)}
              onMouseEnter={() => setSel(a.id)}>
              <strong>{a.t}</strong>
              <span>{a.d}</span>
            </Reveal>
          ))}
        </div>
        <p className="kx-p" style={{ marginTop: 28 }} aria-live="polite">
          {def ? <><strong style={{ color: "var(--kx-fg)", fontWeight: 500 }}>{def.t}.</strong> {def.d}</> : TRUCO_BABOR}
        </p>
      </Bloque>
      <DatosUnidad cliente={cliente} />
    </>
  );
}

function DatosUnidad({ cliente }) {
  const toast = useToast();
  const claves = DATOS_UNIDAD.flatMap(g => g.campos.map(c => c.k));
  const [v, setV] = useState(() => Object.fromEntries(claves.map(k => [k, leerLocal(k)])));
  const [verClave, setVerClave] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const guardar = () => {
    claves.forEach(k => guardarLocal(k, v[k] || ""));
    setGuardado(true);
    toast.success("Datos guardados en este dispositivo");
    setTimeout(() => setGuardado(false), 2600);
  };
  return (
    <Bloque
      eyebrow="Ficha"
      titulo="Los datos de tu unidad"
      intro="Matrícula, seguro y contactos a mano. Se guardan sólo en este dispositivo: no viajan a ningún servidor."
      cabecera={
        <div className="kx-cifras" style={{ marginTop: 40, gridTemplateColumns: "1fr" }}>
          <div>
            <div className="kx-eyebrow">Unidad</div>
            <div className="kx-h3" style={{ marginTop: 10 }}>{cliente?.modelo_barco || "Klase A"}</div>
            <div className="kx-celda-v" style={{ marginTop: 6 }}>
              {[cliente?.nombre_barco, cliente?.numero_unidad && `Unidad ${cliente.numero_unidad}`].filter(Boolean).join(" · ") || "Sin nombre asignado"}
            </div>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
        {DATOS_UNIDAD.map((g, gi) => (
          <Reveal key={g.grupo} d={gi}>
            <div className="kx-eyebrow" style={{ marginBottom: 18 }}>{pad(gi + 1)} · {g.grupo}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "24px 32px" }}>
              {g.campos.map(c => (
                <div className="kx-campo" key={c.k} style={{ position: "relative" }}>
                  <label htmlFor={`kx-${c.k}`}>{c.l}</label>
                  <input
                    id={`kx-${c.k}`}
                    className="kx-input"
                    type={c.tipo === "password" ? (verClave ? "text" : "password") : (c.tipo || "text")}
                    value={v[c.k] || ""}
                    placeholder={c.ph}
                    autoComplete="off"
                    onChange={e => setV(p => ({ ...p, [c.k]: e.target.value }))}
                    style={c.tipo === "password" ? { paddingRight: 40 } : undefined}
                  />
                  {c.tipo === "password" && (
                    <button type="button" aria-label={verClave ? "Ocultar clave" : "Mostrar clave"} onClick={() => setVerClave(s => !s)}
                      style={{ position: "absolute", right: 0, bottom: 4, width: 40, height: 40, display: "grid", placeItems: "center", color: "var(--kx-mute)" }}>
                      {verClave ? <EyeOff size={17} strokeWidth={1.5} /> : <Eye size={17} strokeWidth={1.5} />}
                    </button>
                  )}
                  {c.ayuda && <span className="kx-ayuda">{c.ayuda}</span>}
                </div>
              ))}
            </div>
          </Reveal>
        ))}
        <div>
          <button type="button" className="kx-btn" onClick={guardar}>
            {guardado ? <><Check size={15} strokeWidth={2} /> Guardado</> : "Guardar en este dispositivo"}
          </button>
        </div>
      </div>
    </Bloque>
  );
}

/* ═════════════ 02 · Antes de salir ═════════════ */
export function AntesDeSalir({ mc }) {
  return (
    <>
      <Bloque eyebrow="En el amarre" titulo="Diez controles antes de soltar amarras" intro="Llevan menos de diez minutos. Tocá cada uno a medida que lo revisás: la lista queda guardada hasta que la reinicies.">
        <ListaVerificacion items={PRE_ZARPE} prefijo="c_" titulo="Revisado" mensajeListo="Todo listo. Buena navegación." />
      </Bloque>
      <Autonomia capacidad={mc?.combustible || 1200} />
    </>
  );
}

function Autonomia({ capacidad }) {
  const [pct, setPct] = useState(75);
  const [kn, setKn] = useState(20);
  const [lh, setLh] = useState(120);
  const litros = Math.round((pct / 100) * capacidad);
  const horas = lh > 0 ? litros / lh : 0;
  const millas = horas * kn;
  const alejarse = millas / 3;
  return (
    <Bloque eyebrow="Combustible" titulo="¿Hasta dónde puedo ir?" intro="Mové el nivel del tanque y ajustá velocidad y consumo. El cálculo aplica la regla de los tercios: un tercio para ir, uno para volver y uno de reserva.">
      <Reveal>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16 }}>
          <label className="kx-label" htmlFor="kx-tanque">Nivel del tanque</label>
          <span className="kx-mono" style={{ fontSize: 14 }}>{pct}% · {fmt(litros)} de {fmt(capacidad)} L</span>
        </div>
        <input id="kx-tanque" className="kx-rango" type="range" min="0" max="100" step="5" value={pct} onChange={e => setPct(+e.target.value)} style={{ marginTop: 10 }} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginTop: 28 }}>
          <div className="kx-campo">
            <label htmlFor="kx-kn">Velocidad (nudos)</label>
            <input id="kx-kn" className="kx-input kx-mono" type="number" min="0" inputMode="decimal" value={kn} onChange={e => setKn(Math.max(0, +e.target.value))} style={{ fontSize: 28 }} />
          </div>
          <div className="kx-campo">
            <label htmlFor="kx-lh">Consumo total (L/h)</label>
            <input id="kx-lh" className="kx-input kx-mono" type="number" min="0" inputMode="decimal" value={lh} onChange={e => setLh(Math.max(0, +e.target.value))} style={{ fontSize: 28 }} />
          </div>
        </div>
      </Reveal>
      <Reveal className="kx-cifras" style={{ marginTop: 48 }}>
        <div>
          <div className="kx-eyebrow">Autonomía</div>
          <div className="kx-cifra">{horas.toFixed(1).replace(".", ",")}<small>horas</small></div>
        </div>
        <div>
          <div className="kx-eyebrow">Distancia total</div>
          <div className="kx-cifra">{fmt(Math.round(millas))}<small>millas</small></div>
        </div>
        <div>
          <div className="kx-eyebrow">Alejarse hasta</div>
          <div className="kx-cifra">{fmt(Math.round(alejarse))}<small>millas</small></div>
        </div>
      </Reveal>
      <div style={{ marginTop: 32 }}>
        <Nota>Es una referencia. El consumo real cambia con la carga, el estado del casco, el viento y el oleaje. Ante la duda, volvé antes.</Nota>
      </div>
    </Bloque>
  );
}

/* ═════════════ 03 · Motores ═════════════ */
export function Motores({ mc }) {
  return (
    <>
      <Bloque id="arranque" eyebrow="Arranque" titulo="Cinco pasos, siempre en el mismo orden" intro="Seguilos con el barco amarrado y con tiempo. Con la práctica se hacen en dos minutos.">
        <PasoAPaso pasos={ARRANQUE} />
      </Bloque>
      <Bloque eyebrow="Tablero" titulo="Qué te dice cada instrumento">
        <div className="kx-grilla kx-grilla-2">
          {INSTRUMENTOS.map((it, i) => (
            <Reveal key={it.t} d={i}>
              <div className="kx-celda-v">{it.u}</div>
              <div className="kx-celda-t">{it.t}</div>
              <p className="kx-p">{it.d}</p>
            </Reveal>
          ))}
        </div>
      </Bloque>
      <Bloque eyebrow="Apagado" titulo="Apagar bien también es cuidar el motor">
        <Reveal>
          <p className="kx-declaracion" style={{ fontSize: "clamp(24px, 2.6vw, 36px)" }}>
            Siempre con la <strong style={{ fontWeight: 500 }}>llave de contacto</strong>. <em>Antes, cinco minutos en neutral para que se enfríe.</em>
          </p>
        </Reveal>
        <div style={{ marginTop: 32 }}>
          <Nota tono="peligro">El botón rojo de STOP es sólo para emergencias. Usarlo como apagado habitual daña el sistema de inyección.</Nota>
        </div>
      </Bloque>
      <Bloque eyebrow="Maniobra" titulo="Hélice de proa">
        <div className="kx-cifras">
          <Reveal d={0}><div className="kx-eyebrow">Uso continuo</div><div className="kx-cifra">30<small>seg máx.</small></div></Reveal>
          <Reveal d={1}><div className="kx-eyebrow">Descanso</div><div className="kx-cifra">2<small>min mín.</small></div></Reveal>
        </div>
        <p className="kx-p" style={{ marginTop: 24 }}>Empuja la proa hacia un costado para entrar o salir de la amarra. Se usa sólo en maniobras, nunca navegando.</p>
      </Bloque>
      {mc?.tiene_mando_electronico && (
        <Bloque eyebrow="Mando electrónico" titulo="Las cuatro funciones del mando">
          <div className="kx-grilla kx-grilla-2">
            {MANDO_ELECTRONICO.map((it, i) => (
              <Reveal key={it.t} d={i}>
                <div className="kx-celda-v">{pad(i + 1)}</div>
                <div className="kx-celda-t">{it.t}</div>
                <p className="kx-p">{it.d}</p>
              </Reveal>
            ))}
          </div>
        </Bloque>
      )}
    </>
  );
}

/* ═════════════ 04 · Energía ═════════════ */
export function Energia({ mc, ancla }) {
  const tieneGrupo = mc?.tiene_grupo ?? true;
  const fuentes = FUENTES.filter(f => tieneGrupo || f.id !== "grupo");
  const inicial = ancla?.startsWith("fuente-") ? ancla.slice(7) : "puerto";
  const [act, setAct] = useState(fuentes.some(f => f.id === inicial) ? inicial : "puerto");
  const f = fuentes.find(x => x.id === act) || fuentes[0];
  return (
    <>
      <Bloque id={`fuente-${f.id}`} eyebrow="220 V a bordo" titulo="Tres formas de tener electricidad" intro="El barco puede tomar 220 V del muelle, del generador o de las baterías a través del inverter. Una sola a la vez: la elegís con la selectora del tablero.">
        <Reveal className="kx-chips" style={{ marginBottom: 32 }}>
          {fuentes.map(x => (
            <button key={x.id} type="button" className="kx-chip" aria-pressed={act === x.id} onClick={() => setAct(x.id)}>{x.t}</button>
          ))}
        </Reveal>
        <Reveal><Flujo fuentes={fuentes} act={act} onSel={setAct} /></Reveal>
        <div key={f.id} className="kx-page" style={{ marginTop: 48 }}>
          <p className="kx-declaracion" style={{ fontSize: "clamp(24px, 2.6vw, 36px)" }}>{f.resumen}</p>
          <ol className="kx-acordeon" style={{ marginTop: 32 }}>
            {f.pasos.map((p, i) => (
              <li key={p} style={{ display: "flex", gap: 20, padding: "20px 0" }}>
                <span className="kx-mono" style={{ fontSize: 11, color: "var(--kx-mute)", width: 22, flexShrink: 0, paddingTop: 5 }}>{pad(i + 1)}</span>
                <span style={{ fontSize: 17, lineHeight: 1.6 }}>{p}</span>
              </li>
            ))}
          </ol>
          <div style={{ marginTop: 28 }}><Nota tono="peligro">{f.nota}</Nota></div>
        </div>
      </Bloque>
      <Bloque eyebrow="Consumos" titulo="Qué se puede usar con cada fuente">
        <div className="kx-grilla kx-grilla-2">
          {CONSUMOS.map((c, i) => (
            <Reveal key={c.t} d={i}>
              <div className="kx-celda-t" style={{ marginTop: 0 }}>{c.t}</div>
              <ul style={{ listStyle: "none", margin: "14px 0 0", padding: 0 }}>
                {c.items.map(it => <li key={it} className="kx-p" style={{ padding: "8px 0", borderTop: "1px solid var(--kx-line)" }}>{it}</li>)}
              </ul>
            </Reveal>
          ))}
        </div>
      </Bloque>
      <Bloque eyebrow="Baterías" titulo="Dos bancos, dos trabajos">
        <div className="kx-grilla">
          {BATERIAS.map((b, i) => (
            <Reveal key={b.t} d={i}>
              <div className="kx-celda-v">{pad(i + 1)}</div>
              <div className="kx-celda-t">{b.t}</div>
              <p className="kx-p">{b.d}</p>
            </Reveal>
          ))}
        </div>
      </Bloque>
    </>
  );
}

/* Diagrama: fuentes → selectora → barco. La línea activa se enciende. */
function Flujo({ fuentes, act, onSel }) {
  const alto = 70 + fuentes.length * 80;
  const cy = alto / 2;
  const ys = fuentes.map((_, i) => 40 + i * 80 + (fuentes.length === 2 ? 40 : 0));
  const etiqueta = { puerto: "Muelle", grupo: "Generador", inverter: "Baterías" };
  return (
    <svg className="kx-flujo" viewBox={`0 0 660 ${alto}`} role="img" aria-label="Diagrama de fuentes de energía">
      {fuentes.map((f, i) => {
        const y = ys[i] + 22;
        const d = `M190 ${y} C 290 ${y}, 300 ${cy}, 372 ${cy}`;
        return (
          <g key={f.id}>
            <path className="kx-f-base" d={d} />
            <path className="kx-f-act" data-on={act === f.id ? "1" : "0"} d={d} />
          </g>
        );
      })}
      <path className="kx-f-act" data-on="1" d={`M428 ${cy} L 470 ${cy}`} />
      {fuentes.map((f, i) => (
        <g key={f.id} className="kx-f-btn" data-on={act === f.id ? "1" : "0"} onClick={() => onSel(f.id)} role="button" tabIndex={0}
          onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSel(f.id); } }}
          aria-label={f.t}>
          <rect className="kx-f-nodo" x="10" y={ys[i]} width="180" height="44" rx="22" />
          <text className="kx-f-in" x="100" y={ys[i] + 26} textAnchor="middle">{etiqueta[f.id]}</text>
        </g>
      ))}
      <g data-on="1">
        <circle className="kx-f-nodo" cx="400" cy={cy} r="28" />
        <text className="kx-f-in" x="400" y={cy + 4} textAnchor="middle" style={{ fontSize: 9 }}>Selec.</text>
      </g>
      <g>
        <rect className="kx-f-nodo" x="470" y={cy - 22} width="180" height="44" rx="22" />
        <text x="560" y={cy + 4} textAnchor="middle">220 V a bordo</text>
      </g>
    </svg>
  );
}

/* ═════════════ 05 · Vida a bordo ═════════════ */
export function ABordo({ mc }) {
  const gasoil = mc?.combustible || 1200;
  const agua = mc?.agua || 400;
  return (
    <>
      <Bloque eyebrow="Tanques" titulo="Capacidad de tu unidad" intro="El nivel real se lee en los sensores del tablero de navegación. Estos son los máximos de referencia.">
        <div className="kx-cifras">
          <Reveal d={0}><div className="kx-eyebrow">Gasoil</div><div className="kx-cifra">{fmt(gasoil)}<small>litros</small></div></Reveal>
          <Reveal d={1}><div className="kx-eyebrow">Agua potable</div><div className="kx-cifra">{fmt(agua)}<small>litros</small></div></Reveal>
        </div>
      </Bloque>
      <Bloque eyebrow="Equipos" titulo="Lo que funciona solo, y cuándo prestarle atención">
        <div className="kx-grilla kx-grilla-2">
          {EQUIPOS.map((e, i) => (
            <Reveal key={e.t} d={i}>
              <div className="kx-celda-v">{pad(i + 1)}</div>
              <div className="kx-celda-t">{e.t}</div>
              <p className="kx-p">{e.d}</p>
            </Reveal>
          ))}
        </div>
      </Bloque>
      <Bloque id="malacate" eyebrow="Ancla" titulo="Malacate: leer antes de usar" intro="Es el equipo que más consume del barco y el que más se rompe por mal uso.">
        <div className="kx-eyebrow" style={{ marginBottom: 12 }}>Antes de usarlo</div>
        <ol className="kx-acordeon">
          {MALACATE_ANTES.map((t, i) => (
            <Reveal as="li" d={i} key={t} style={{ display: "flex", gap: 20, padding: "20px 0" }}>
              <span className="kx-mono" style={{ fontSize: 11, color: "var(--kx-mute)", width: 22, flexShrink: 0, paddingTop: 5 }}>{pad(i + 1)}</span>
              <span style={{ fontSize: 17, lineHeight: 1.6 }}>{t}</span>
            </Reveal>
          ))}
        </ol>
        <div className="kx-eyebrow" style={{ margin: "56px 0 12px" }}>Errores frecuentes</div>
        <div className="kx-grilla kx-grilla-2">
          {MALACATE_ERRORES.map((e, i) => (
            <Reveal key={e.e} d={i}>
              <div className="kx-celda-t" style={{ display: "flex", gap: 10, marginTop: 0 }}>
                <X size={18} strokeWidth={1.5} style={{ color: "var(--kx-sos)", flexShrink: 0, marginTop: 3 }} />{e.e}
              </div>
              <p className="kx-p" style={{ display: "flex", gap: 10 }}><ArrowRight size={16} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 4 }} />{e.s}</p>
            </Reveal>
          ))}
        </div>
      </Bloque>
    </>
  );
}

/* ═════════════ 06 · Al volver ═════════════ */
export function Regreso() {
  return (
    <Bloque eyebrow="En puerto" titulo="Dejar el barco listo para la próxima" intro="Recomendaciones generales. Si tu marina o tu técnico te indicaron algo distinto, seguí esa indicación.">
      <ListaVerificacion items={REGRESO} prefijo="r_" titulo="Hecho" mensajeListo="El barco queda en orden. Hasta la próxima." />
    </Bloque>
  );
}

/* ═════════════ 07 · Si algo falla ═════════════ */
export function Problemas({ onIr }) {
  return (
    <>
      <Bloque eyebrow="Diagnóstico" titulo="Qué revisar primero" intro="Las fallas más consultadas a postventa. La mayoría se resuelven con un control simple.">
        <Acordeon items={DIAGNOSTICO} />
        <Reveal style={{ marginTop: 40, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
          <p className="kx-p" style={{ flex: "1 1 260px" }}>¿No se resolvió? Mandanos fotos y te respondemos por WhatsApp.</p>
          <button type="button" className="kx-btn" onClick={() => onIr("postventa")}>Reportar una falla <ArrowRight size={15} strokeWidth={1.5} /></button>
        </Reveal>
      </Bloque>
      <Bloque id="fusibles" eyebrow="Fusibles" titulo="Fusibles de alta potencia" intro="Dónde están los que protegen los equipos grandes. Cambiarlos sólo con todo apagado.">
        <Reveal>
          <table className="kx-tabla">
            <thead><tr><th>Sistema</th><th>Amperaje</th><th>Ubicación</th></tr></thead>
            <tbody>
              {FUSIBLES.map(f => <tr key={f.s}><td>{f.s}</td><td>{f.a}</td><td>{f.u}</td></tr>)}
            </tbody>
          </table>
        </Reveal>
      </Bloque>
    </>
  );
}

/* ═════════════ 08 · Seguridad ═════════════ */
export function PasosEmergencia({ inicial = "incendio", oscuro = false }) {
  const [act, setAct] = useState(inicial);
  const e = EMERGENCIAS.find(x => x.id === act) || EMERGENCIAS[0];
  return (
    <div>
      <div className={oscuro ? "kx-sos-tabs" : "kx-chips"} style={oscuro ? undefined : { marginBottom: 16 }}>
        {EMERGENCIAS.map(x => (
          <button key={x.id} type="button" className={oscuro ? "kx-sos-tab" : "kx-chip"} aria-pressed={act === x.id} onClick={() => setAct(x.id)}>{x.t}</button>
        ))}
      </div>
      <ol className={oscuro ? "kx-sos-pasos" : "kx-acordeon"} key={e.id}>
        {e.pasos.map((p, i) => oscuro ? (
          <li key={p.t} style={{ "--i": i }}>
            <b>{pad(i + 1)}</b>
            <div><h3>{p.t}</h3><p>{p.d}</p></div>
          </li>
        ) : (
          <li key={p.t} className="kx-page" style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr)", gap: 12, padding: "24px 0", animationDelay: `${i * 60}ms` }}>
            <span className="kx-mono" style={{ fontSize: 11, color: "var(--kx-sos)", paddingTop: 6 }}>{pad(i + 1)}</span>
            <div>
              <div className="kx-celda-t" style={{ margin: "0 0 6px" }}>{p.t}</div>
              <p className="kx-p">{p.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Seguridad({ onSOS }) {
  return (
    <>
      <Bloque eyebrow="Teléfonos" titulo="A quién llamar" intro="Desde el celular, tocá el número para llamar. En el agua, la radio VHF en canal 16 es lo más rápido.">
        <Reveal className="kx-cifras">
          {TELEFONOS.map(t => (
            <div key={t.t}>
              <div className="kx-eyebrow">{t.t}</div>
              {t.tel
                ? <a className="kx-cifra" href={`tel:${t.tel}`} style={{ display: "block", fontSize: "clamp(30px, 3.4vw, 48px)" }}>{t.v}</a>
                : <div className="kx-cifra" style={{ fontSize: "clamp(30px, 3.4vw, 48px)" }}>{t.v}</div>}
            </div>
          ))}
        </Reveal>
        <Reveal style={{ marginTop: 32 }}>
          <button type="button" className="kx-btn" style={{ background: "var(--kx-sos)", color: "#fff" }} onClick={onSOS}>
            Abrir modo emergencia <ArrowRight size={15} strokeWidth={1.5} />
          </button>
        </Reveal>
      </Bloque>
      <Bloque eyebrow="Procedimientos" titulo="Qué hacer, en orden" intro="Leelos una vez en tranquilidad. En una emergencia, el modo emergencia los muestra en grande.">
        <PasosEmergencia />
      </Bloque>
      <Bloque eyebrow="Equipo" titulo="Lo que tiene que haber a bordo">
        <div className="kx-grilla kx-grilla-2">
          {EQUIPO_SEGURIDAD.map((t, i) => (
            <Reveal key={t} d={i % 4} style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
              <span className="kx-mono" style={{ fontSize: 11, color: "var(--kx-mute)" }}>{pad(i + 1)}</span>
              <span style={{ fontSize: 17 }}>{t}</span>
            </Reveal>
          ))}
        </div>
      </Bloque>
    </>
  );
}

/* ═════════════ 09 · Mantenimiento ═════════════ */
const SERVICE_KEY = "ka_service_v1";
const BITACORA_KEY = "ka_bitacora_v1";
const BITACORA_TS = "ka_bitacora_ts";

export function Mantenimiento() {
  return (
    <>
      <ProximoService />
      <Bitacora />
    </>
  );
}

function ProximoService() {
  const toast = useToast();
  const [d, setD] = useState(() => leerJson(SERVICE_KEY, { fecha: "", tipo: "", horas: "", obs: "" }));
  const up = (k, val) => setD(p => ({ ...p, [k]: val }));
  const dias = d.fecha ? Math.ceil((new Date(d.fecha + "T12:00:00") - new Date()) / 86400000) : null;
  const guardar = () => { guardarJson(SERVICE_KEY, d); toast.success("Service guardado"); };
  return (
    <Bloque
      eyebrow="Service"
      titulo="Próximo service"
      intro="Anotá la fecha y el tipo de service. Te lo recordamos cada vez que entres."
      cabecera={dias !== null && (
        <div style={{ marginTop: 40 }}>
          <div className="kx-eyebrow">{dias < 0 ? "Vencido hace" : dias === 0 ? "Es" : "Faltan"}</div>
          <div className="kx-cifra" style={{ color: dias < 0 ? "var(--kx-sos)" : undefined }}>
            {dias === 0 ? "hoy" : Math.abs(dias)}{dias !== 0 && <small>{Math.abs(dias) === 1 ? "día" : "días"}</small>}
          </div>
        </div>
      )}
    >
      <Reveal style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "28px 32px" }}>
        <div className="kx-campo"><label htmlFor="kx-sf">Fecha</label><input id="kx-sf" className="kx-input" type="date" value={d.fecha} onChange={e => up("fecha", e.target.value)} /></div>
        <div className="kx-campo"><label htmlFor="kx-st">Tipo de service</label><input id="kx-st" className="kx-input" value={d.tipo} placeholder="250 h · cambio de aceite" onChange={e => up("tipo", e.target.value)} /></div>
        <div className="kx-campo"><label htmlFor="kx-sh">Horas de motor actuales</label><input id="kx-sh" className="kx-input kx-mono" type="number" inputMode="numeric" value={d.horas} placeholder="1250" onChange={e => up("horas", e.target.value)} /></div>
        <div className="kx-campo" style={{ gridColumn: "1 / -1" }}><label htmlFor="kx-so">Observaciones</label><input id="kx-so" className="kx-input" value={d.obs} placeholder="Taller, teléfono, repuestos pendientes…" onChange={e => up("obs", e.target.value)} /></div>
      </Reveal>
      <div style={{ marginTop: 32 }}><button type="button" className="kx-btn" onClick={guardar}>Guardar</button></div>
    </Bloque>
  );
}

function Bitacora() {
  const toast = useToast();
  const [filas, setFilas] = useState(() => leerJson(BITACORA_KEY, BITACORA_ITEMS.map(n => ({ n, e: "OK", o: "" }))));
  const [ts, setTs] = useState(() => { try { return localStorage.getItem(BITACORA_TS) || ""; } catch { return ""; } });
  const upd = (i, k, v) => setFilas(p => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const guardar = () => {
    guardarJson(BITACORA_KEY, filas);
    const t = new Date().toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    try { localStorage.setItem(BITACORA_TS, t); } catch { /* sin almacenamiento */ }
    setTs(t);
    toast.success("Bitácora guardada");
  };
  return (
    <Bloque eyebrow="Bitácora" titulo="Estado de cada equipo" intro={ts ? `Última actualización: ${ts}.` : "Marcá el estado y anotá lo que haga falta."}>
      <ul className="kx-acordeon">
        {filas.map((r, i) => (
          <Reveal as="li" d={i % 6} key={r.n} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14, padding: "24px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
              <span style={{ fontSize: 19 }}>{r.n}</span>
              <div className="kx-seg" role="group" aria-label={`Estado de ${r.n}`}>
                {BITACORA_ESTADOS.map(e => (
                  <button key={e} type="button" aria-pressed={r.e === e} data-tono={e === "OK" ? undefined : "alerta"} onClick={() => upd(i, "e", e)}>
                    {e === "Service Pendiente" ? "Service" : e}
                  </button>
                ))}
              </div>
            </div>
            <input className="kx-input" value={r.o} placeholder="Observaciones o fecha" aria-label={`Observaciones de ${r.n}`} onChange={e => upd(i, "o", e.target.value)} style={{ fontSize: 15, minHeight: 40 }} />
          </Reveal>
        ))}
      </ul>
      <div style={{ marginTop: 32 }}><button type="button" className="kx-btn" onClick={guardar}>Guardar bitácora</button></div>
    </Bloque>
  );
}

/* ═════════════ 10 · Glosario ═════════════ */
export function Glosario({ ancla }) {
  const [q, setQ] = useState("");
  // Cada término sabe si abre una letra nueva, para el separador A, B, C…
  const lista = useMemo(() => {
    const n = normalizar(q.trim());
    const filtrada = GLOSARIO
      .filter(g => !n || normalizar(`${g.t} ${g.d}`).includes(n))
      .sort((a, b) => a.t.localeCompare(b.t, "es"));
    return filtrada.map((g, i) => {
      const inicial = normalizar(g.t)[0].toUpperCase();
      const previa = i > 0 ? normalizar(filtrada[i - 1].t)[0].toUpperCase() : "";
      return { ...g, inicial, nueva: inicial !== previa };
    });
  }, [q]);
  const foco = ancla?.startsWith("g-") ? ancla : null;
  useEffect(() => {
    if (!foco) return;
    const t = setTimeout(() => document.getElementById(foco)?.scrollIntoView({ behavior: "smooth", block: "center" }), 350);
    return () => clearTimeout(t);
  }, [foco]);
  return (
    <section className="kx-bloque">
      <div className="kx-wrap">
        <Reveal className="kx-glosa-buscar">
          <Search size={26} strokeWidth={1.25} />
          <input className="kx-input" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar una palabra" aria-label="Buscar en el glosario" />
        </Reveal>
        <div className="kx-eyebrow" style={{ marginTop: 16 }}>{lista.length} {lista.length === 1 ? "término" : "términos"}</div>
        <ul className="kx-glosa">
          {lista.map(g => {
            const id = `g-${slug(g.t)}`;
            return (
              <li key={g.t} id={id} data-letra={g.nueva && !q ? g.inicial : undefined} data-foco={foco === id ? "1" : undefined}>
                <strong>{g.t}</strong>
                <p>{g.d}</p>
              </li>
            );
          })}
        </ul>
        {!lista.length && <p className="kx-p" style={{ marginTop: 32 }}>No hay ninguna palabra con «{q}». Probá con otra o preguntale a postventa.</p>}
      </div>
    </section>
  );
}

/* ═════════════ 11 · Videos ═════════════ */
export function Videos() {
  const [filtro, setFiltro] = useState("Todos");
  const [vid, setVid] = useState(null);
  const cats = ["Todos", ...new Set(VIDEOS.map(v => v.c))];
  const lista = filtro === "Todos" ? VIDEOS : VIDEOS.filter(v => v.c === filtro);
  useEffect(() => {
    if (!vid) return undefined;
    const onKey = e => { if (e.key === "Escape") setVid(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [vid]);
  return (
    <section className="kx-bloque">
      <div className="kx-wrap">
        <div className="kx-chips kx-chips-scroll" style={{ marginBottom: 48 }}>
          {cats.map(c => <button key={c} type="button" className="kx-chip" aria-pressed={filtro === c} onClick={() => setFiltro(c)}>{c}</button>)}
        </div>
        <div className="kx-videos" key={filtro}>
          {lista.map((v, i) => (
            <Reveal as="button" type="button" d={i % 3} key={v.id} className="kx-video" onClick={() => setVid(v)}>
              <div className="kx-video-img">
                <img src={`https://img.youtube.com/vi/${v.id}/hqdefault.jpg`} alt="" loading="lazy" />
                <span className="kx-video-play"><Play size={18} strokeWidth={1.5} fill="currentColor" /></span>
              </div>
              <div className="kx-video-meta">
                <span className="kx-eyebrow">{v.c}</span>
                <span className="kx-eyebrow">{pad(i + 1)}</span>
              </div>
              <div>
                <div className="kx-h3">{v.t}</div>
                <p className="kx-p" style={{ marginTop: 6 }}>{v.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
      {vid && (
        <div className="kx-capa" role="dialog" aria-modal="true" aria-label={vid.t} onMouseDown={e => { if (e.target === e.currentTarget) setVid(null); }}>
          <button type="button" className="kx-capa-cerrar" aria-label="Cerrar video" onClick={() => setVid(null)}><X size={20} strokeWidth={1.5} /></button>
          <div className="kx-capa-cuerpo">
            <div className="kx-eyebrow" style={{ color: "#8d8d8d", marginBottom: 12 }}>{vid.c}</div>
            <div className="kx-h2" style={{ margin: "0 0 24px" }}>{vid.t}</div>
            <div style={{ aspectRatio: "16 / 9", background: "#111" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${vid.id}?autoplay=1&rel=0`}
                title={vid.t}
                style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
