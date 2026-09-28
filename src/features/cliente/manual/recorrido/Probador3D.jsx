/* ═══════════════════════════════════════════════════════════════
   Recorrido 3D · probador (sólo para probar)
   El mismo barco del recorrido con un panel para cambiarle el color al
   casco, al techo, a los tapizados, a la teca y al interior, y tocar la
   rugosidad, el metal y el barniz de cada acabado. Nada se guarda en la
   base: los ajustes quedan en este navegador y se pueden copiar para
   dejarlos fijos en el recorrido.
═══════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { ArrowLeft, Copy, RotateCcw } from "lucide-react";
import { modelo3dDe } from "../unidad";
import { leerJson, guardarJson } from "../almacen";
import { LARGO, cargarModelo, coloresDelTono, materialDe, prepararLienzo, INTERIOR } from "./barco";
import { EscenaProbador } from "./Recorrido3D";

const CLAVE = "ka_probador_3d";

const MODELOS = [
  { id: "43", nombre: "K43 tender" },
  { id: "64", nombre: "K64" },
];

/* Cada acabado con el nombre que usa la gente, en el orden del panel. */
const NOMBRES = {
  casco: "Casco", cubierta: "Cubierta", negro: "Techo y negros", fondo: "Antifouling",
  teca: "Teca", tapizado: "Tapizado exterior", almohadon: "Almohadones exteriores",
  cromo: "Cromo", acrilico: "Acrílico", vidrios: "Vidrios", detalle: "Detalles",
  madera: "Madera", tela: "Camas y sillones", cojin: "Almohadones interiores", piso: "Piso",
  piedra: "Mesada", loza: "Loza", techo: "Cielorraso", forro: "Forro del casco", interior: "Otros del interior",
};
const DEL_INTERIOR = new Set(["madera", "tela", "cojin", "piso", "piedra", "loza", "techo", "forro", "interior"]);

/* Atajos por acabado. textura: false apaga la foto para que el color se vea
   limpio (sobre la foto, el color sólo tiñe). */
const RAPIDOS = [
  { acabado: "casco", opciones: [
    { n: "Blanco", color: "#ffffff" }, { n: "Marfil", color: "#f2ecdf" }, { n: "Gris perla", color: "#d6d9db" },
    { n: "Arena", color: "#d9c9ab" }, { n: "Azul acero", color: "#46627c" }, { n: "Azul marino", color: "#1d2c45" },
    { n: "Verde inglés", color: "#1f3a2e" }, { n: "Grafito", color: "#3a3d40" }, { n: "Negro", color: "#121314" },
  ] },
  { acabado: "negro", opciones: [
    { n: "Grafito", color: "#2f3235" }, { n: "Negro", color: "#101112" }, { n: "Gris", color: "#8b9095" },
    { n: "Blanco", color: "#f4f4f2" }, { n: "Azul marino", color: "#1d2c45" },
  ] },
  { acabado: "tapizado", opciones: [
    { n: "Cuero caramelo", color: "#efe4d8", textura: true }, { n: "Blanco", color: "#f1eee8", textura: false },
    { n: "Arena", color: "#d8c8ae", textura: false }, { n: "Gris", color: "#9a9ea2", textura: false },
    { n: "Azul marino", color: "#26364f", textura: false }, { n: "Negro", color: "#1c1c1d", textura: false },
  ] },
  { acabado: "almohadon", opciones: [
    { n: "Blanco", color: "#f2eee7" }, { n: "Arena", color: "#e0d3be" }, { n: "Gris", color: "#a7a9ab" },
    { n: "Azul", color: "#3d5a80" }, { n: "Negro", color: "#222223" },
  ] },
  { acabado: "teca", opciones: [
    { n: "Natural", color: "#ffffff", textura: true }, { n: "Gris envejecida", color: "#c9c4bb", textura: true },
    { n: "Oscura", color: "#9b8069", textura: true }, { n: "Sin teca", color: "#f4f4f2", textura: false },
  ] },
  { acabado: "madera", opciones: [
    { n: "Roble", color: "#ffffff", textura: true }, { n: "Roble gris", color: "#c4c0ba", textura: true },
    { n: "Nogal", color: "#9c7a5c", textura: true }, { n: "Wengue", color: "#5b4636", textura: true },
    { n: "Laca blanca", color: "#f3f1ec", textura: false }, { n: "Laca gris", color: "#9ea1a3", textura: false },
  ] },
  { acabado: "tela", opciones: [
    { n: "Lana gris", color: "#a9a298", textura: true }, { n: "Crema", color: "#e9e0cf", textura: false },
    { n: "Arena", color: "#cdbb9c", textura: false }, { n: "Azul marino", color: "#2c3b52", textura: false },
    { n: "Carbón", color: "#3a3b3d", textura: false },
  ] },
  { acabado: "cojin", opciones: [
    { n: "Lino claro", color: "#ece6dc" }, { n: "Arena", color: "#dccdb4" }, { n: "Gris", color: "#9fa2a5" },
    { n: "Azul", color: "#3d5a80" }, { n: "Negro", color: "#232324" },
  ] },
  { acabado: "piso", opciones: [
    { n: "Roble", color: "#d8c2aa", textura: true }, { n: "Claro", color: "#f3e7d6", textura: true },
    { n: "Oscuro", color: "#9c8068", textura: true }, { n: "Gris", color: "#bdb8b0", textura: true },
  ] },
];

// Casco metalizado: el atajo pisa estos tres valores juntos.
const METALIZADO = { metalness: 0.55, roughness: 0.28, clearcoat: 1 };

const ESCENA = { interior: false, agua: true, oclusion: true, girar: false, exposicion: 1.05, reflejos: 0.55 };

const redondear = (v) => Math.round(v * 100) / 100;

/* Pone los valores en el material. La foto original se guarda aparte para
   poder apagarla y volver a prenderla. */
function aplicar(material, valores, mapa) {
  if (!material || !valores) return;
  material.color.set(valores.color);
  material.roughness = valores.roughness;
  material.metalness = valores.metalness;
  material.clearcoat = valores.clearcoat;
  const conMapa = valores.textura ? mapa ?? null : null;
  if (material.map !== conMapa) {
    material.map = conMapa;
    material.needsUpdate = true;
  }
}

export default function Probador3D({ modelo, tono, onCerrar }) {
  const guardado = useMemo(() => leerJson(CLAVE, {}), []);
  const [modeloId, setModeloId] = useState(() => {
    const deCliente = String(modelo || "").match(/(\d{2})/)?.[1];
    if (MODELOS.some(m => m.id === guardado.modeloId)) return guardado.modeloId;
    return MODELOS.some(m => m.id === deCliente) ? deCliente : "43";
  });
  const [escena, setEscena] = useState(() => ({ ...ESCENA, tono: tono === "noche" ? "noche" : "dia", ...(guardado.escena || {}) }));
  const [cambios, setCambios] = useState(() => guardado.cambios || {});
  const [cargado, setCargado] = useState(null);
  const [fallo, setFallo] = useState(null);
  const [base, setBase] = useState(null);
  const [aviso, setAviso] = useState("");
  const [paraCopiar, setParaCopiar] = useState("");
  const lista = useRef(null);
  const mapas = useRef({});

  const barco = cargado?.id === modeloId ? cargado.modelo : null;
  const cambiosModelo = useMemo(() => cambios[modeloId] || {}, [cambios, modeloId]);

  useEffect(() => { guardarJson(CLAVE, { modeloId, escena, cambios }); }, [modeloId, escena, cambios]);

  useEffect(() => {
    let vivo = true;
    const cfg = modelo3dDe(`K${modeloId}`);
    cargarModelo(cfg)
      .then(m => { if (vivo) setCargado({ id: modeloId, modelo: m }); })
      .catch(() => { if (vivo) setFallo(modeloId); });
    return () => { vivo = false; };
  }, [modeloId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCerrar(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Los materiales recién creados: se anotan sus valores de fábrica.
  const alCrearMateriales = useCallback((materiales) => {
    lista.current = materiales;
    const valores = {};
    Object.entries(materiales).forEach(([nombre, m]) => {
      mapas.current[nombre] = m.map;
      valores[nombre] = {
        color: `#${m.color.getHexString()}`, roughness: redondear(m.roughness),
        metalness: redondear(m.metalness), clearcoat: redondear(m.clearcoat), textura: !!m.map,
      };
    });
    setBase(valores);
  }, []);

  // Valores de fábrica de un acabado con el tono actual: el recorrido pinta
  // distinto de día y de noche el "interior" genérico y, en el K64, el casco.
  const fabrica = useCallback((nombre) => {
    if (!base?.[nombre]) return null;
    const delTono = coloresDelTono(escena.tono, !!barco?.lineas)[nombre];
    return delTono ? { ...base[nombre], color: delTono } : base[nombre];
  }, [base, escena.tono, barco]);

  // Pone los cambios sobre los materiales. Corre desde <Reaplicar>, adentro
  // de la escena y después del barco: así va después del retoque del tono.
  const aplicarCambios = useCallback(() => {
    if (!lista.current) return;
    Object.entries(cambiosModelo).forEach(([nombre, c]) => {
      const f = fabrica(nombre);
      if (f) aplicar(lista.current[nombre], { ...f, ...c }, mapas.current[nombre]);
    });
  }, [cambiosModelo, fabrica]);

  // Dónde se ve cada acabado: afuera, en la vista interior o en las dos. En el
  // K43 el interior es otro modelo; en el K64 es un corte que deja ver todo lo
  // que queda abajo.
  const acabados = useMemo(() => {
    if (!barco || !base) return {};
    const mapa = {};
    const anotar = (pieza, vista) => {
      const clave = base[materialDe(pieza)] ? materialDe(pieza) : "detalle";
      (mapa[clave] ||= { ex: false, in: false })[vista] = true;
    };
    const conCorte = !barco.aparte && barco.corte != null;
    Object.keys(barco.piezas).forEach(pieza => {
      if (!INTERIOR.includes(pieza)) anotar(pieza, "ex");
      if (conCorte) anotar(pieza, "in");
    });
    Object.keys(barco.aparte?.piezas ?? {}).forEach(pieza => anotar(pieza, "in"));
    return mapa;
  }, [barco, base]);
  const presentes = Object.keys(NOMBRES).filter(n => acabados[n]);

  const valorDe = (nombre) => {
    const f = fabrica(nombre);
    return f ? { ...f, ...(cambiosModelo[nombre] || {}) } : null;
  };

  const cambiar = (nombre, parcial) => {
    // Lo que se toca se ve: si en la vista actual no está, se pasa a la otra.
    const donde = acabados[nombre];
    if (donde && !(escena.interior ? donde.in : donde.ex)) setEscena(e => ({ ...e, interior: donde.in }));
    setCambios(prev => ({ ...prev, [modeloId]: { ...(prev[modeloId] || {}), [nombre]: { ...(prev[modeloId]?.[nombre] || {}), ...parcial } } }));
  };

  const restablecer = (nombre) => {
    aplicar(lista.current?.[nombre], fabrica(nombre), mapas.current[nombre]);
    setCambios(prev => {
      const resto = { ...(prev[modeloId] || {}) };
      delete resto[nombre];
      return { ...prev, [modeloId]: resto };
    });
  };

  const restablecerTodo = () => {
    Object.keys(cambiosModelo).forEach(nombre => aplicar(lista.current?.[nombre], fabrica(nombre), mapas.current[nombre]));
    setCambios(prev => ({ ...prev, [modeloId]: {} }));
    setEscena(e => ({ ...ESCENA, tono: e.tono }));
    setAviso("");
    setParaCopiar("");
  };

  const copiar = () => {
    const texto = JSON.stringify({
      modelo: `K${modeloId}`,
      materiales: cambiosModelo,
      luz: { exposicion: escena.exposicion, reflejos: escena.reflejos },
    }, null, 2);
    const aMano = () => { setParaCopiar(texto); setAviso("El navegador no dejó copiar: seleccioná el texto de abajo."); };
    if (!navigator.clipboard?.writeText) { aMano(); return; }
    navigator.clipboard.writeText(texto)
      .then(() => { setParaCopiar(""); setAviso("Copiado. Pegalo en el chat para dejarlo fijo en el recorrido."); })
      .catch(aMano);
  };

  const cambiarModelo = (id) => {
    if (id === modeloId) return;
    setBase(null);
    lista.current = null;
    setFallo(null);
    setModeloId(id);
  };

  const hayCambios = Object.keys(cambiosModelo).length > 0
    || escena.exposicion !== ESCENA.exposicion || escena.reflejos !== ESCENA.reflejos;

  // El texto para copiar a mano queda seleccionado cada vez que cambia.
  const copia = useRef(null);
  useEffect(() => {
    if (!paraCopiar || !copia.current) return;
    copia.current.focus();
    copia.current.select();
  }, [paraCopiar]);
  const nombreModelo = MODELOS.find(m => m.id === modeloId)?.nombre;

  return (
    <div className="kx-lab" role="dialog" aria-modal="true" aria-label="Probador de colores y materiales">
      <style href="klasea-probador-3d" precedence="default">{CSS_PROBADOR}</style>

      <div className="kx-lab-lienzo">
        {fallo === modeloId ? (
          <div className="kx-lab-aviso"><p className="kx-p">No pudimos cargar el modelo {nombreModelo}.</p></div>
        ) : !barco ? (
          <div className="kx-lab-aviso"><span className="kx-eyebrow">Preparando el {nombreModelo}</span><i className="kx-rec-carga" /></div>
        ) : (
          <Canvas dpr={[1, 1.75]} camera={{ fov: 30, near: 0.1, far: 200, position: [9, 5, 9] }} gl={{ antialias: true }}
            shadows={barco.aparte ? "soft" : false} onCreated={({ gl }) => prepararLienzo(gl)}>
            <EscenaProbador key={modeloId} modelo={barco} tono={escena.tono} interior={escena.interior}
              agua={escena.agua} oclusion={escena.oclusion} alCrearMateriales={alCrearMateriales}>
              <Reaplicar aplicar={aplicarCambios} />
            </EscenaProbador>
            <Luz key={`luz-${modeloId}`} exposicion={escena.exposicion} reflejos={escena.reflejos} />
            <OrbitControls makeDefault enableDamping dampingFactor={0.08} autoRotate={escena.girar} autoRotateSpeed={0.8}
              minDistance={LARGO * 0.12} maxDistance={LARGO * 2.6} maxPolarAngle={Math.PI / 2 - 0.04} />
            <Encuadre modelo={barco} interior={escena.interior} />
          </Canvas>
        )}
        <header className="kx-lab-top">
          <button type="button" className="kx-rec-interruptor" onClick={onCerrar}>
            <ArrowLeft size={14} strokeWidth={1.5} aria-hidden />Volver al recorrido
          </button>
        </header>
      </div>

      <aside className="kx-lab-panel">
        <div className="kx-lab-cab">
          <div>
            <div className="kx-eyebrow">Probador · sólo para pruebas</div>
            <h2 className="kx-lab-t">Colores y materiales</h2>
          </div>
        </div>
        <p className="kx-lab-nota">Nada se guarda en la base: los cambios quedan en este navegador. Arrastrá para girar el barco y acercá con la rueda o pellizcando.</p>

        <section className="kx-lab-sec" aria-label="Vista">
          <div className="kx-eyebrow">Vista</div>
          <Segmento valor={modeloId} opciones={MODELOS.map(m => [m.id, m.nombre])} onCambiar={cambiarModelo} etiqueta="Modelo" />
          <Segmento valor={escena.interior ? "in" : "ex"} opciones={[["ex", "Exterior"], ["in", "Interior"]]}
            onCambiar={v => setEscena(e => ({ ...e, interior: v === "in" }))} etiqueta="Vista" />
          <Segmento valor={escena.tono} opciones={[["dia", "Día"], ["noche", "Noche"]]}
            onCambiar={v => setEscena(e => ({ ...e, tono: v }))} etiqueta="Fondo" />
          <div className="kx-lab-checks">
            <Check id="lab-agua" etiqueta="Agua con reflejo" valor={escena.agua} onCambiar={v => setEscena(e => ({ ...e, agua: v }))} />
            {barco?.aparte && (
              <Check id="lab-ao" etiqueta="Sombreado del interior" valor={escena.oclusion} onCambiar={v => setEscena(e => ({ ...e, oclusion: v }))} />
            )}
            <Check id="lab-girar" etiqueta="Girar solo" valor={escena.girar} onCambiar={v => setEscena(e => ({ ...e, girar: v }))} />
          </div>
        </section>

        {base && RAPIDOS.filter(r => presentes.includes(r.acabado)).map(({ acabado, opciones }) => {
          const v = valorDe(acabado);
          return (
            <section key={acabado} className="kx-lab-sec" aria-label={NOMBRES[acabado]}>
              <div className="kx-lab-fila">
                <div className="kx-eyebrow">{NOMBRES[acabado]}{DEL_INTERIOR.has(acabado) ? " · interior" : ""}</div>
                {cambiosModelo[acabado] && (
                  <button type="button" className="kx-lab-link" onClick={() => restablecer(acabado)}>Como venía</button>
                )}
              </div>
              <div className="kx-lab-muestras">
                {opciones.map(o => (
                  <button key={o.n} type="button" className="kx-lab-muestra" style={{ "--c": o.color }} title={o.n} aria-label={o.n}
                    aria-pressed={v.color === o.color && (o.textura === undefined || o.textura === v.textura)}
                    onClick={() => cambiar(acabado, { color: o.color, ...(o.textura === undefined ? {} : { textura: o.textura }) })} />
                ))}
                <input type="color" id={`lab-${acabado}-rapido`} className="kx-lab-color" value={v.color} aria-label={`Otro color para ${NOMBRES[acabado]}`}
                  title="Otro color" onChange={e => cambiar(acabado, { color: e.target.value })} />
              </div>
              {acabado === "casco" && (
                <Check id="lab-metalizado" etiqueta="Metalizado"
                  valor={v.metalness === METALIZADO.metalness && v.roughness === METALIZADO.roughness}
                  onCambiar={on => cambiar("casco", on ? METALIZADO
                    : (({ metalness, roughness, clearcoat }) => ({ metalness, roughness, clearcoat }))(fabrica("casco")))} />
              )}
            </section>
          );
        })}

        {base && (
          <section className="kx-lab-sec" aria-label="Luz">
            <div className="kx-eyebrow">Luz</div>
            <Rango id="lab-exposicion" etiqueta="Exposición" min={0.5} max={1.8} paso={0.05} valor={escena.exposicion}
              onCambiar={v => setEscena(e => ({ ...e, exposicion: v }))} />
            <Rango id="lab-reflejos" etiqueta="Reflejos" min={0} max={1.6} paso={0.05} valor={escena.reflejos}
              onCambiar={v => setEscena(e => ({ ...e, reflejos: v }))} />
          </section>
        )}

        {base && presentes.length > 0 && (
          <section className="kx-lab-sec" aria-label="Todos los acabados">
            <div className="kx-eyebrow">Todos los acabados</div>
            {presentes.map(nombre => {
              const v = valorDe(nombre);
              return (
                <details key={nombre} className="kx-lab-mat">
                  <summary>
                    <i className="kx-lab-punto" style={{ "--c": v.color }} aria-hidden />
                    <span>{NOMBRES[nombre]}</span>
                    {cambiosModelo[nombre] && <span className="kx-lab-marca">cambiado</span>}
                  </summary>
                  <div className="kx-lab-mat-cuerpo">
                    <label className="kx-lab-fila" htmlFor={`lab-${nombre}-color`}>
                      <span>Color</span>
                      <input type="color" id={`lab-${nombre}-color`} className="kx-lab-color" value={v.color}
                        onChange={e => cambiar(nombre, { color: e.target.value })} />
                    </label>
                    <Rango id={`lab-${nombre}-rug`} etiqueta="Rugosidad" min={0} max={1} paso={0.01} valor={v.roughness}
                      onCambiar={x => cambiar(nombre, { roughness: x })} />
                    <Rango id={`lab-${nombre}-metal`} etiqueta="Metal" min={0} max={1} paso={0.01} valor={v.metalness}
                      onCambiar={x => cambiar(nombre, { metalness: x })} />
                    <Rango id={`lab-${nombre}-barniz`} etiqueta="Barniz" min={0} max={1} paso={0.01} valor={v.clearcoat}
                      onCambiar={x => cambiar(nombre, { clearcoat: x })} />
                    {base[nombre].textura && (
                      <Check id={`lab-${nombre}-tex`} etiqueta="Con textura (foto)" valor={v.textura}
                        onCambiar={x => cambiar(nombre, { textura: x })} />
                    )}
                    {cambiosModelo[nombre] && (
                      <button type="button" className="kx-lab-link" onClick={() => restablecer(nombre)}>Como venía</button>
                    )}
                  </div>
                </details>
              );
            })}
          </section>
        )}

        <div className="kx-lab-pie">
          <button type="button" className="kx-btn kx-btn-chico" onClick={copiar} disabled={!hayCambios}>
            <Copy size={14} strokeWidth={1.5} aria-hidden /> Copiar ajustes
          </button>
          <button type="button" className="kx-btn kx-btn-chico kx-btn-linea" onClick={restablecerTodo}>
            <RotateCcw size={14} strokeWidth={1.5} aria-hidden /> Restablecer
          </button>
        </div>
        {aviso && <p className="kx-lab-nota" role="status">{aviso}</p>}
        {paraCopiar && (
          <textarea ref={copia} className="kx-lab-copia" readOnly value={paraCopiar} aria-label="Ajustes para copiar"
            onFocus={e => e.target.select()} />
        )}
      </aside>
    </div>
  );
}

/* Vuelve a poner los cambios del usuario cada vez que cambian ellos, los
   materiales o el tono. Va dentro de la escena, después del barco. */
function Reaplicar({ aplicar }) {
  useEffect(() => { aplicar(); }, [aplicar]);
  return null;
}

/* Exposición y reflejos del entorno. Va con la misma clave que la escena:
   al cambiar de modelo el estudio vuelve a poner sus valores y esto los pisa. */
function Luz({ exposicion, reflejos }) {
  const get = useThree(st => st.get);
  useEffect(() => { get().gl.toneMappingExposure = exposicion; }, [get, exposicion]);
  useEffect(() => { get().scene.environmentIntensity = reflejos; }, [get, reflejos]);
  return null;
}

/* Encuadre al abrir y al pasar de exterior a interior: de costado y desde
   arriba el barco entero, o la planta del interior. */
function Encuadre({ modelo, interior }) {
  const camara = useThree(st => st.camera);
  const controles = useThree(st => st.controls);
  useEffect(() => {
    if (!controles) return;
    const planta = interior && modelo.centroInterior;
    const foco = planta ? new THREE.Vector3(...modelo.centroInterior) : new THREE.Vector3(0, modelo.D * 0.6, 0);
    const { az, el, dist } = planta ? { az: 90, el: 72, dist: 0.9 } : { az: 38, el: 22, dist: 1.35 };
    const r = dist * LARGO * Math.max(1, 1.3 / camara.aspect);
    const a = THREE.MathUtils.degToRad(az);
    const e = THREE.MathUtils.degToRad(el);
    camara.position.copy(foco).add(new THREE.Vector3(r * Math.cos(e) * Math.cos(a), r * Math.sin(e), r * Math.cos(e) * Math.sin(a)));
    controles.target.copy(foco);
    controles.update();
  }, [camara, controles, modelo, interior]);
  return null;
}

function Segmento({ valor, opciones, onCambiar, etiqueta }) {
  return (
    <div className="kx-lab-fila">
      <span className="kx-lab-etq">{etiqueta}</span>
      <div className="kx-seg" role="group" aria-label={etiqueta}>
        {opciones.map(([id, texto]) => (
          <button key={id} type="button" aria-pressed={valor === id} onClick={() => onCambiar(id)}>{texto}</button>
        ))}
      </div>
    </div>
  );
}

function Check({ id, etiqueta, valor, onCambiar }) {
  return (
    <label className="kx-lab-check" htmlFor={id}>
      <input type="checkbox" id={id} checked={!!valor} onChange={e => onCambiar(e.target.checked)} />
      {etiqueta}
    </label>
  );
}

function Rango({ id, etiqueta, min, max, paso, valor, onCambiar }) {
  return (
    <div className="kx-lab-rango">
      <label htmlFor={id}>{etiqueta}</label>
      <input type="range" id={id} min={min} max={max} step={paso} value={valor}
        onChange={e => onCambiar(Number(e.target.value))} />
      <output htmlFor={id}>{Number(valor).toFixed(2)}</output>
    </div>
  );
}

const CSS_PROBADOR = `
.kx .kx-lab { position: fixed; inset: 0; z-index: 86; display: grid; grid-template-columns: minmax(0, 1fr) min(380px, 38vw); background: var(--kx-bg); color: var(--kx-fg); color-scheme: light; animation: kx-fade .3s var(--kx-ez) both; }
.kx[data-tono="noche"] .kx-lab { color-scheme: dark; }
.kx .kx-lab-lienzo { position: relative; min-width: 0; min-height: 0; }
.kx .kx-lab-top { position: absolute; top: 0; left: 0; right: 0; height: var(--kx-bar); display: flex; align-items: center; padding: 0 20px; z-index: 2; pointer-events: none; }
.kx .kx-lab-top > * { pointer-events: auto; }
.kx .kx-lab-aviso { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 0 24px; text-align: center; }
.kx .kx-lab-panel { min-height: 0; overflow-y: auto; overscroll-behavior: contain; border-left: 1px solid var(--kx-line); padding: 22px 24px 28px; }
.kx .kx-lab-t { font-size: 26px; font-weight: 300; letter-spacing: -.02em; line-height: 1.1; margin: 10px 0 0; }
.kx .kx-lab-nota { font-size: 13px; line-height: 1.55; color: var(--kx-mute); margin: 12px 0 16px; }
.kx .kx-lab-sec { border-top: 1px solid var(--kx-line); padding: 16px 0; display: grid; gap: 12px; }
.kx .kx-lab-fila { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; font-size: 14px; }
.kx .kx-lab-etq { font-size: 13px; color: var(--kx-mute); }
.kx .kx-lab-checks { display: flex; flex-wrap: wrap; gap: 2px 18px; }
.kx .kx-lab-check { display: inline-flex; align-items: center; gap: 9px; min-height: 34px; font-size: 14px; cursor: pointer; }
.kx .kx-lab-check input { width: 16px; height: 16px; margin: 0; accent-color: var(--kx-fg); }
.kx .kx-lab-muestras { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.kx .kx-lab-muestra { width: 32px; height: 32px; border-radius: 50%; background: var(--c); border: 1px solid var(--kx-line-2); transition: transform .2s var(--kx-ez), box-shadow .2s; }
.kx .kx-lab-muestra:hover { transform: scale(1.08); }
.kx .kx-lab-muestra[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--kx-bg), 0 0 0 4px var(--kx-fg); }
.kx .kx-lab-color { width: 32px; height: 32px; padding: 2px; border: 1px dashed var(--kx-mute); border-radius: 50%; background: none; cursor: pointer; overflow: hidden; flex-shrink: 0; }
.kx .kx-lab-color::-webkit-color-swatch-wrapper { padding: 0; }
.kx .kx-lab-color::-webkit-color-swatch { border: 0; border-radius: 50%; }
.kx .kx-lab-color::-moz-color-swatch { border: 0; border-radius: 50%; }
.kx .kx-lab-rango { display: grid; grid-template-columns: 86px minmax(0, 1fr) 40px; align-items: center; gap: 10px; font-size: 13px; color: var(--kx-mute); }
.kx .kx-lab-rango input { width: 100%; margin: 0; accent-color: var(--kx-fg); }
.kx .kx-lab-rango output { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; text-align: right; color: var(--kx-fg); }
.kx .kx-lab-link { font-size: 12.5px; color: var(--kx-mute); text-decoration: underline; text-underline-offset: 3px; justify-self: start; min-height: 28px; }
.kx .kx-lab-link:hover { color: var(--kx-fg); }
.kx .kx-lab-mat { border-bottom: 1px solid var(--kx-line); }
.kx .kx-lab-mat:last-of-type { border-bottom: 0; }
.kx .kx-lab-mat summary { display: flex; align-items: center; gap: 10px; min-height: 40px; cursor: pointer; font-size: 14px; list-style: none; }
.kx .kx-lab-mat summary::-webkit-details-marker { display: none; }
.kx .kx-lab-punto { width: 14px; height: 14px; border-radius: 50%; background: var(--c); border: 1px solid var(--kx-line-2); flex-shrink: 0; }
.kx .kx-lab-marca { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--kx-mute); }
.kx .kx-lab-mat-cuerpo { display: grid; gap: 10px; padding: 4px 0 14px 24px; }
.kx .kx-lab-pie { display: flex; flex-wrap: wrap; gap: 8px; padding-top: 16px; border-top: 1px solid var(--kx-line); }
.kx .kx-lab-copia { width: 100%; min-height: 140px; margin-top: 4px; padding: 10px; border: 1px solid var(--kx-line-2); background: var(--kx-soft); color: var(--kx-fg); font: 12px/1.5 'JetBrains Mono', monospace; resize: vertical; }
@media (max-width: 900px) {
  .kx .kx-lab { grid-template-columns: minmax(0, 1fr); grid-template-rows: 46svh minmax(0, 1fr); }
  .kx .kx-lab-panel { border-left: 0; border-top: 1px solid var(--kx-line); padding: 18px 16px calc(24px + env(safe-area-inset-bottom)); }
  .kx .kx-lab-top { padding: 0 12px; }
}
@media (prefers-reduced-motion: reduce) { .kx .kx-lab { animation: none; } }
`;
