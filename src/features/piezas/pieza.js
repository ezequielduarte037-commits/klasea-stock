/* ═══════════════════════════════════════════════════════════════
   Visor de piezas · el modelo
   Cada pieza es un .glb en public/piezas/<token>.glb, hecho con
   scripts/pieza-a-glb.mjs: una malla por parte (superficies y aristas),
   los rótulos grabados aparte (parte@grabado) y, en los extras de la
   escena, el título y la lista de partes. Metros; proa +x, arriba +y,
   estribor +z.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// El token es el nombre del archivo: minúsculas, números y guiones.
export const tokenValido = token => /^[a-z0-9][a-z0-9-]{5,79}$/.test(token || "");

// El corte se mira de frente al perfil.
export const VISTA_DEL_CORTE = { largo: "frente", ancho: "costado", alto: "arriba" };

/* Baja el .glb contando el avance (0 a 1). Para una dirección que no existe
   Vercel devuelve el index.html de la app con 200: se reconoce por la firma. */
export async function bajarPieza(token, alAvanzar) {
  const r = await fetch(`/piezas/${token}.glb`);
  if (!r.ok) throw new Error("no-encontrada");
  const total = Number(r.headers.get("content-length")) || 0;
  let bytes;
  if (r.body && total) {
    const lector = r.body.getReader();
    const trozos = [];
    let recibidos = 0;
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      trozos.push(value);
      recibidos += value.length;
      alAvanzar(Math.min(1, recibidos / total));
    }
    bytes = new Uint8Array(recibidos);
    let o = 0;
    for (const t of trozos) { bytes.set(t, o); o += t.length; }
  } else bytes = new Uint8Array(await r.arrayBuffer());
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== "glTF") throw new Error("no-encontrada");
  return bytes.buffer;
}

const esClaro = hex => new THREE.Color(hex).getHSL({}).l > 0.5;

// orden: lugar de la parte en la lista. Donde dos partes tienen la misma
// superficie (el .3dm trae copias en capas distintas), se ve la que va primero.
function materialSuperficie(p, orden) {
  const vidrio = p.opacidad != null;
  return new THREE.MeshStandardMaterial({
    color: p.color,
    roughness: p.metal ? 0.25 : vidrio ? 0.12 : 0.42,
    metalness: p.metal ? 1 : 0,
    transparent: vidrio,
    opacity: p.opacidad ?? 1,
    depthWrite: !vidrio,
    side: THREE.DoubleSide,
    // Las aristas van encima de la superficie sin pelear con ella.
    polygonOffset: true, polygonOffsetFactor: 1 + orden, polygonOffsetUnits: 1 + 2 * orden,
  });
}

// Los rótulos están en el mismo plano que la cara de la costilla: adelante.
const materialGrabado = p => new THREE.MeshStandardMaterial({
  color: p.grabados, roughness: 0.8, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
});

const materialArista = p => new THREE.LineBasicMaterial({
  color: esClaro(p.color) ? "#2a2d33" : "#aab1bc", transparent: true, opacity: esClaro(p.color) ? 0.5 : 0.35,
});

/* Arma la pieza: materiales por parte, apoyada en el piso (y = 0) y centrada. */
export async function leerPieza(buffer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const { scene: raiz } = await loader.parseAsync(buffer, "");
  const meta = raiz.userData?.pieza;
  if (!meta?.partes?.length) throw new Error("sin-datos");
  const partes = meta.partes.map((p, orden) => ({ ...p, orden, objetos: [], mallas: [] }));
  const porId = Object.fromEntries(partes.map(p => [p.id, p]));
  // El GLTFLoader limpia los nombres de los nodos; el original sigue en userData.
  raiz.children.forEach(nodo => {
    const [id, tipo] = (nodo.userData?.name ?? nodo.name).split("@");
    const p = porId[id];
    if (!p) return;
    p.objetos.push(nodo);
    nodo.traverse(o => {
      // Las aristas no se tocan: medir y centrar van a las superficies.
      if (o.isLineSegments) { o.material = materialArista(p); o.raycast = () => {}; }
      else if (o.isMesh) {
        o.material = tipo === "grabado" ? materialGrabado(p) : materialSuperficie(p, p.orden);
        o.castShadow = o.receiveShadow = true;
        p.mallas.push(o);
      }
    });
  });
  raiz.updateMatrixWorld(true);
  const caja = new THREE.Box3().setFromObject(raiz);
  const centro = caja.getCenter(new THREE.Vector3());
  raiz.position.set(-centro.x, -caja.min.y, -centro.z);
  raiz.updateMatrixWorld(true);
  return { meta, raiz, partes: partes.filter(p => p.objetos.length) };
}

/* Caja de las partes a la vista (en el mundo). */
export function cajaDe(partes, visibles) {
  const caja = new THREE.Box3();
  partes.forEach(p => { if (visibles.has(p.id)) p.objetos.forEach(o => caja.expandByObject(o)); });
  return caja;
}

/* Corte: los tramos donde el plano cruza las superficies a la vista, para
   dibujar el perfil de la pieza (x, y, z de cada punta, de a pares, en el mundo). */
export function perfilDelCorte(partes, visibles, plano) {
  const tramos = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const corte = (p, q, dp, dq) => p.clone().lerp(q, dp / (dp - dq));
  partes.forEach(parte => {
    if (!visibles.has(parte.id)) return;
    parte.mallas.forEach(m => {
      const pos = m.geometry.attributes.position, idx = m.geometry.index;
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        const da = plano.distanceToPoint(a), db = plano.distanceToPoint(b), dc = plano.distanceToPoint(c);
        if ((da > 0 && db > 0 && dc > 0) || (da < 0 && db < 0 && dc < 0)) continue;
        const pts = [];
        if (da * db < 0) pts.push(corte(a, b, da, db));
        if (db * dc < 0) pts.push(corte(b, c, db, dc));
        if (dc * da < 0) pts.push(corte(c, a, dc, da));
        if (pts.length === 2) tramos.push(pts[0].x, pts[0].y, pts[0].z, pts[1].x, pts[1].y, pts[1].z);
      }
    });
  });
  return tramos;
}

// Milímetros, como en los planos: 5.492 mm.
export const mm = metros => `${Math.round(metros * 1000).toLocaleString("es-AR")} mm`;
