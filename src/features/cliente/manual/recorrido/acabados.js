/* Acabados del modelo real: un material por grupo del .glb (casco, cubierta,
   teca, tapizado…). Los usan el recorrido, el probador y el configurador. */
import * as THREE from "three";
import { texturaFoto, texturaTeca, texturaRoble } from "./barco";

/* Modelo real exportado de Rhino. Cada pieza trae el nombre de su acabado
   (casco, fondo, cubierta, teca, cromo, negro, vidrios, tapizado, detalle,
   interior). */
// tex: textura de color; relieve: mapa de normales (foto); m: metros por imagen.
export const ACABADOS = {
  casco:    { color: "#ffffff", roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 },
  cubierta: { color: "#f6f6f3", roughness: 0.6 },
  fondo:    { color: "#2a2c2e", roughness: 0.85 },
  // Teca clara con calafateo: relieve de juntas y veta, y rugosidad por zonas.
  teca:     { color: "#ffffff", roughness: 1, tex: "teca", relieve: "teca_cubierta", rugosidad: "teca_cubierta", m: 1, n: 1, adelante: true },
  cromo:    { color: "#e4e4e4", metalness: 1, roughness: 0.16 },
  negro:    { color: "#2f3235", roughness: 0.32, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.2 },
  // Vidrio y acrílico: transmisión real, ahumado como en los renders.
  vidrios:  { color: "#b7c0c6", roughness: 0.03, transmission: 0.9, thickness: 0.03, ior: 1.5, atenuacion: "#0e1316", clearcoat: 1, clearcoatRoughness: 0.03 },
  // Cuero náutico gris afuera (nunca color cuero), lana espigada gris topo adentro.
  tapizado: { color: "#a19e98", roughness: 0.62, relieve: "fabric_leather_02", m: 0.8, n: 0.9, clearcoat: 0.12, clearcoatRoughness: 0.55 },
  almohadon: { color: "#f2eee7", roughness: 0.95, relieve: "poly_wool_herringbone", m: 0.25, sheen: 0.6 },
  // Posavasos: acrílico gris humo, pulido.
  acrilico: { color: "#8e959a", roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 },
  detalle:  { color: "#3a3a3a", roughness: 0.4 },
  // Interior: roble natural neutro con la veta marcada y barniz satinado,
  // piso de tablas, camas y sillones en lana gris, cielorraso blanco, mesada
  // de piedra y loza.
  madera:   { color: "#ffffff", roughness: 0.46, tex: "roble", relieve: "grey_oak_veneer_01", m: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.32 },
  piso:     { color: "#d8c2aa", roughness: 0.55, tex: "laminate_floor_02", relieve: "laminate_floor_02", m: 1.6, adelante: true },
  tela:     { color: "#a9a298", roughness: 0.95, tex: "poly_wool_herringbone", relieve: "poly_wool_herringbone", m: 0.35, sheen: 0.5, n: 1 },
  // Almohadones sueltos de camas y sillones: lino claro, como afuera.
  cojin:    { color: "#ece6dc", roughness: 0.95, relieve: "poly_wool_herringbone", m: 0.2, sheen: 0.8, n: 0.5 },
  techo:    { color: "#f6f4f0", roughness: 0.8 },
  // Tiras LED del techo del hardtop (el configurador las prende de noche).
  led:      { color: "#eeeae2", roughness: 0.4 },
  // Mesada: cuarzo pulido (en el configurador, con la placa de Purastone elegida).
  piedra:   { color: "#f2f0ec", roughness: 0.16, clearcoat: 0.8, clearcoatRoughness: 0.06 },
  loza:     { color: "#f7f7f5", roughness: 0.15, clearcoat: 0.6 },
  interior: { color: "#ebe8e3", roughness: 0.75 },
  // Forro del casco en el modelo interior: tapizado claro, liso.
  forro:    { color: "#efece7", roughness: 0.9 },
};

/* Un material por acabado, todos con el mismo plano de corte (vista interior).
   tex(clave, crear) reutiliza texturas ya creadas (las variantes de teca, p. ej.). */
export function crearMateriales() {
  const texturas = {};
  const tex = (clave, crear) => (texturas[clave] ||= crear());
  const plano = new THREE.Plane(new THREE.Vector3(0, -1, 0), 100);
  const lista = Object.fromEntries(Object.entries(ACABADOS).map(([nombre, a]) => {
    const m = a.m ?? 1;
    const mapa = a.tex === "teca" ? tex("teca", () => texturaTeca())
      : a.tex === "roble" ? tex(`roble-${m}`, () => texturaRoble(m))
      : a.tex ? tex(`${a.tex}-c-${m}`, () => texturaFoto(`${a.tex}_diff`, m)) : null;
    const normales = a.relieve ? tex(`${a.relieve}-n-${m}`, () => texturaFoto(`${a.relieve}_nor`, m, { color: false })) : null;
    const rugosidad = a.rugosidad ? tex(`${a.rugosidad}-r-${m}`, () => texturaFoto(`${a.rugosidad}_rough`, m, { color: false })) : null;
    return [nombre, new THREE.MeshPhysicalMaterial({
      color: a.color, roughness: a.roughness ?? 0.5, metalness: a.metalness ?? 0,
      clearcoat: a.clearcoat ?? 0, clearcoatRoughness: a.clearcoatRoughness ?? 0,
      sheen: a.sheen ?? 0, sheenRoughness: 0.8, sheenColor: new THREE.Color("#ffffff"),
      transmission: a.transmission ?? 0, thickness: a.thickness ?? 0, ior: a.ior ?? 1.5,
      attenuationColor: new THREE.Color(a.atenuacion ?? "#ffffff"), attenuationDistance: a.atenuacion ? 0.012 : Infinity,
      map: mapa, normalMap: normales, roughnessMap: rugosidad, normalScale: new THREE.Vector2(a.n ?? 0.6, a.n ?? 0.6),
      side: THREE.DoubleSide, clippingPlanes: [plano], clipShadows: true,
      // Teca y piso van apoyados sobre otra superficie: se adelantan apenas
      // (de más, atravesaban el casco y se veían como líneas en el costado).
      // Corrimiento fijo, sin factor de pendiente: con factor, las molduras
      // vistas de canto se corrían hacia atrás y en GPUs con menos precisión
      // asomaba la teca del cockpit en líneas sobre el costado.
      polygonOffset: !!a.adelante, polygonOffsetFactor: 0, polygonOffsetUnits: a.adelante ? -2 : 0,
    })];
  }));
  const linea = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.5, clippingPlanes: [plano] });
  const lineaDentro = new THREE.LineBasicMaterial({ color: "#3b332c", transparent: true, opacity: 0.45, clippingPlanes: [plano] });
  const dispose = () => {
    Object.values(lista).forEach(m => m.dispose());
    linea.dispose();
    lineaDentro.dispose();
    Object.values(texturas).forEach(t => t.dispose());
  };
  return { lista, linea, lineaDentro, texturas, tex, plano, dispose };
}
