// Rhino (.3dm) → .glb liviano para el recorrido 3D del manual del cliente.
//
// Los .3dm del astillero traen sólo superficies (sin mallas de render), así que
// cada cara se malla acá: los bordes de recorte se muestrean en 3D, se proyectan
// a (u,v) con Gauss-Newton y se triangula con puntos interiores (poly2tri).
// Agrupa por capa en casco / cubierta / vidrios / detalle / interior, simplifica
// y comprime con meshopt. Salida en metros, proa +x, arriba +y, estribor +z.
//
// Uso (las dependencias no son del proyecto, se instalan aparte):
//   npm i --no-save rhino3dm@8 earcut@3 poly2tri @gltf-transform/core@4 \
//     @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer
//   node scripts/rhino-a-glb.mjs k64.3dm public/models/k64.glb [pasoMm=70]
// K43 (exterior e interior por separado, el interior viene en otro .3dm):
//   PERFIL=exterior node --max-old-space-size=12000 scripts/rhino-a-glb.mjs k43.3dm public/models/k43.glb 60
//   PERFIL=interior node --max-old-space-size=12000 scripts/rhino-a-glb.mjs k43-interior.3dm public/models/k43-interior.glb 40
// Después sumar la línea en MODELOS_3D (src/features/cliente/manual/unidad.js).
import rhino3dm from "rhino3dm";
import earcut from "earcut";
import poly2tri from "poly2tri";
import fs from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplifyPrimitive, quantize, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const [,, entrada, salidaGlb, pasoArg = "70"] = process.argv;
const PASO = +pasoArg; // mm: tamaño objetivo de triángulo en superficies curvas
const rh = await rhino3dm();
const doc = rh.File3dm.fromByteArray(new Uint8Array(fs.readFileSync(entrada)));
const objs = doc.objects(), capas = doc.layers();

// Capas que no suman a la vista y pesan mucho (equipos con miles de piezas).
// Los mamparos estructurales vienen como planchas sin recortar: atraviesan el
// casco y sobresalen, así que no se exportan (los tabiques de madera sí).
const SALTEAR = [/HERRAJES/i, /Picaportes/i, /ICEMAKER/i, /^Default$/i, /ENGINE DISPLAY/i, /BULKHEADS/i, /MAMAPAROS ESTR TRANSV/i];
// PERFIL=interior: modelo del interior solo, visto desde arriba. Sin cielorraso
// ni lo que cuelga de él, y con más detalle (se mira de cerca).
const INTERIOR_SOLO = process.env.PERFIL === "interior";
// PERFIL=exterior: el interior va en su propio .glb, acá no se exporta.
if (process.env.PERFIL === "exterior") SALTEAR.push(/^INTERIOR/i, /^LEATHER$/i, /^INOX$/i, /^BLACK-PAINT$/i, /^COUNTERTOP$/i, /^COMPANIONWAY DOOR$/i);
if (INTERIOR_SOLO) SALTEAR.push(/CIELING/i, /::LED$/i, /QUICK AG1K/i, /LEWMAR FLUSH HATCH/i, /OSCURANTE/i, /SHOWER PAINI/i);
// Grupo por capa: cada grupo es un material en la web. El orden importa.
const REGLAS = [
  ...(INTERIOR_SOLO ? [[/HULL-OFFSET/i, "forro"]] : []),
  [/amtifouling|antifouling/i, "fondo"],
  // Interior, por material (cada uno lleva su textura en la web)
  [/INTERIOR::FLOOR|PISO/i, "piso"],
  // Tiras LED del techo del hardtop: se prenden como luz de cortesía.
  [/led stripes/i, "led"],
  [/INTERIOR::CIELING|CONTRA TECHOS|ceeling/i, "techo"],
  [/COUNTERTOP|MESADA/i, "piedra"],
  [/::WC$|SYSTEMS::SINK|SHOWER PAINI/i, "loza"],
  [/^LEATHER$|LOOSE FURNITURE|BLINDFOLDS|almohadon/i, "tela"],
  [/GLASS|VIDRIO/i, "vidrios"],
  [/TEAK|WOODEN PARTS|TECA/i, "teca"],
  [/CHROME|INOX|ACERO|SEASMART|STEERING/i, "cromo"],
  [/CUSHION|PILOT SEAT|Wosse/i, "tapizado"],
  [/WOOD-FURNITURE|BULKHEADS|HULL-OFFSET|COMPANIONWAY|MOBILIARIO|LINERS|MAMPAROS/i, "madera"],
  [/^BLACK-PAINT$/i, "negro"],
  [/^INTERIOR|ESTRUCTURA/i, "interior"],
  [/HULL|^CASCO/i, "casco"],
  [/DECK|CUBIERTA|BAJO PARABRISAS/i, "cubierta"],
  [/BLACK|CONSOLE|CONSOLA|MAST|speakr/i, "negro"],
];
const grupoDe = c => (REGLAS.find(([r]) => r.test(c)) || [null, "detalle"])[1];

// Anclas: centro de las capas con equipos reconocibles. El recorrido 3D lleva
// la cámara y los puntos a estos lugares cuando el modelo los tiene.
const ANCLAS = [
  [/STEERING WHEEL|^CONSOLA$|ACCESORIOS::CONSOLA/i, "timon"],
  // La radio de la consola (no la antena del mástil, que también dice VHF).
  [/VHF Garmin|CONSOL[AE][^:]*::VHF/i, "vhf"],
  [/GPSMAP|DISPLAY GARMIN/i, "gps"],
  [/BOWTRUSTER|BOW THRUSTER/i, "bow"],
  [/::WC$|BAÑO PRINCIPAL/i, "wc"],
  [/SYSTEMS::SINK|COCINA/i, "pileta"],
  [/FRIGONAUTICA|HELADERA/i, "heladera"],
  [/::TV/i, "tv"],
  [/COMPANIONWAY|ACCESORIOS::puertas/i, "bajada"],
  [/MAST::RADAR/i, "radar"],
  [/NAVIGATION-LIGHT HEAD/i, "tope"],
  [/NAVIGATION-LIGHT PORTSIDE/i, "nav-babor"],
  [/NAVIGATION-LIGHT STARBOARDSIDE/i, "nav-estribor"],
  [/led stripes/i, "led"],
];
const cajasAncla = {};
const vistos = new Set();
const grupos = {};
const G = n => (grupos[n] ||= { pos: [], nor: [], idx: [] });

// Malla de render guardada por Rhino (si el archivo la trae): mejor que mallar de nuevo.
function agregarMalla(mesh, grupo) {
  const g = G(grupo), base = g.pos.length / 3;
  const vs = mesh.vertices(), fs_ = mesh.faces(), ns = mesh.normals();
  const conNormales = ns.count === vs.count;
  for (let k = 0; k < vs.count; k++) {
    g.pos.push(...T(vs.get(k)));
    g.nor.push(...(conNormales ? TN(ns.get(k)) : [0, 1, 0]));
  }
  for (let k = 0; k < fs_.count; k++) {
    const [a, b, c, d] = fs_.get(k);
    g.idx.push(base + a, base + b, base + c);
    if (c !== d) g.idx.push(base + a, base + c, base + d);
  }
  return vs.count;
}

// Rhino (x adelante, y babor, z arriba, mm) → three (x proa, y arriba, z estribor, m)
const T = p => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
const TN = n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[2] / l, -n[1] / l]; };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function largoCurva(c, d0, d1) {
  let L = 0, prev = c.pointAt(d0);
  for (let i = 1; i <= 16; i++) { const p = c.pointAt(d0 + (d1 - d0) * i / 16); L += dist(p, prev); prev = p; }
  return L;
}

function puntoEnPoligono(x, y, poly) {
  let dentro = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

let caras = 0, fallas = 0, planas = 0, tris = 0, descartados = 0;

function mallarCara(brep, face, grupo, caja) {
  const srf = face.underlyingSurface();
  const [U0, U1] = srf.domain(0), [V0, V1] = srf.domain(1);
  const N = 14;
  const grilla = [];
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const u = U0 + (U1 - U0) * i / N, v = V0 + (V1 - V0) * j / N;
    grilla.push([u, v, srf.pointAt(u, v)]);
  }
  // escala métrica aproximada de cada parámetro
  let lu = 0, lv = 0;
  for (let k = 0; k <= N; k++) {
    for (let i = 1; i <= N; i++) {
      lu += dist(grilla[i * (N + 1) + k][2], grilla[(i - 1) * (N + 1) + k][2]);
      lv += dist(grilla[k * (N + 1) + i][2], grilla[k * (N + 1) + i - 1][2]);
    }
  }
  const su = Math.max(1e-9, lu / (N + 1) / (U1 - U0)), sv = Math.max(1e-9, lv / (N + 1) / (V1 - V0));
  const cu = srf.isClosed(0), cv = srf.isClosed(1);

  const aUV = (P) => {
    let best = 0, bd = Infinity;
    for (let k = 0; k < grilla.length; k++) { const d = dist(grilla[k][2], P); if (d < bd) { bd = d; best = k; } }
    let [u, v] = grilla[best];
    const hu = (U1 - U0) * 1e-5, hv = (V1 - V0) * 1e-5;
    for (let it = 0; it < 12; it++) {
      const S = srf.pointAt(u, v);
      const uh = u + hu > U1 ? -hu : hu, vh = v + hv > V1 ? -hv : hv;
      const Su = sub(srf.pointAt(u + uh, v), S).map(x => x / uh);
      const Sv = sub(srf.pointAt(u, v + vh), S).map(x => x / vh);
      const r = sub(P, S);
      const a = dot(Su, Su), b = dot(Su, Sv), c = dot(Sv, Sv), ru = dot(Su, r), rv = dot(Sv, r);
      const det = a * c - b * b;
      if (Math.abs(det) < 1e-18) break;
      const du = (c * ru - b * rv) / det, dv = (a * rv - b * ru) / det;
      u = Math.min(U1, Math.max(U0, u + du));
      v = Math.min(V1, Math.max(V0, v + dv));
      if (Math.abs(du * su) + Math.abs(dv * sv) < 0.05) break;
    }
    return [u, v];
  };

  const edges = brep.edges();
  const loops = face.loops;
  const anillos = []; // [{exterior, pts:[[qx,qy]]}]
  for (let li = 0; li < loops.count; li++) {
    const L = loops.get(li);
    const exterior = L.loopType === rh.BrepLoopType.Outer;
    const trims = L.trims;
    const tramos = [];
    for (let ti = 0; ti < trims.count; ti++) {
      const t = trims.get(ti);
      if (t.edgeIndex < 0) continue;
      const e = edges.get(t.edgeIndex);
      const [d0, d1] = e.domain;
      const n = Math.max(2, Math.min(260, Math.ceil(largoCurva(e, d0, d1) / (PASO * 0.6))));
      const pts = [];
      for (let i = 0; i <= n; i++) pts.push(e.pointAt(d0 + (d1 - d0) * i / n));
      if (t.isReversed) pts.reverse();
      tramos.push(pts);
    }
    if (!tramos.length) continue;
    // encadenar: si un tramo arranca lejos del final anterior pero termina cerca, darlo vuelta
    for (let i = 1; i < tramos.length; i++) {
      const fin = tramos[i - 1][tramos[i - 1].length - 1];
      if (dist(tramos[i][0], fin) > dist(tramos[i][tramos[i].length - 1], fin)) tramos[i].reverse();
    }
    const p3 = [];
    tramos.forEach(tr => tr.slice(0, -1).forEach(p => p3.push(p)));
    if (p3.length < 3) continue;
    let uv = p3.map(aUV);
    if (cu || cv) { // desenvolver costuras de superficies cerradas
      const PU = U1 - U0, PV = V1 - V0;
      for (let i = 1; i < uv.length; i++) {
        if (cu) { while (uv[i][0] - uv[i - 1][0] > PU / 2) uv[i][0] -= PU; while (uv[i - 1][0] - uv[i][0] > PU / 2) uv[i][0] += PU; }
        if (cv) { while (uv[i][1] - uv[i - 1][1] > PV / 2) uv[i][1] -= PV; while (uv[i - 1][1] - uv[i][1] > PV / 2) uv[i][1] += PV; }
      }
    }
    // a coordenadas métricas y sin puntos repetidos
    const q = [];
    uv.forEach(([u, v]) => {
      const p = [u * su, v * sv];
      const ult = q[q.length - 1];
      if (!ult || Math.hypot(p[0] - ult[0], p[1] - ult[1]) > 0.5) q.push(p);
    });
    while (q.length > 3 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) <= 0.5) q.pop();
    if (q.length >= 3) anillos.push({ exterior, pts: q });
  }
  if (!anillos.length) return;
  anillos.sort((a, b) => Number(b.exterior) - Number(a.exterior));
  const ext = anillos[0].pts, huecos = anillos.slice(1).map(a => a.pts);

  let verts2d = [], triIdx = [];
  const plana = srf.isPlanar();
  const conEarcut = () => {
    const flat = [], holes = [];
    ext.forEach(p => flat.push(p[0], p[1]));
    huecos.forEach(h => { holes.push(flat.length / 2); h.forEach(p => flat.push(p[0], p[1])); });
    verts2d = [];
    for (let i = 0; i < flat.length; i += 2) verts2d.push([flat[i], flat[i + 1]]);
    triIdx = earcut(flat, holes);
  };
  if (plana) { planas++; conEarcut(); }
  else {
    try {
      let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
      ext.forEach(([x, y]) => { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); });
      let paso = PASO;
      while (((maxx - minx) / paso) * ((maxy - miny) / paso) > 40000) paso *= 1.4;
      // hash de bordes para no poner puntos pegados al contorno
      const celda = new Map();
      const clave = (x, y) => `${Math.floor(x / paso)},${Math.floor(y / paso)}`;
      [ext, ...huecos].forEach(r => r.forEach(p => celda.set(clave(p[0], p[1]), true)));
      const interiores = [];
      for (let x = minx + paso / 2; x < maxx; x += paso) for (let y = miny + paso / 2; y < maxy; y += paso) {
        if (celda.has(clave(x, y))) continue;
        if (!puntoEnPoligono(x, y, ext)) continue;
        if (huecos.some(h => puntoEnPoligono(x, y, h))) continue;
        interiores.push([x, y]);
      }
      const P = ([x, y]) => new poly2tri.Point(x, y);
      const ctx = new poly2tri.SweepContext(ext.map(P));
      huecos.forEach(h => ctx.addHole(h.map(P)));
      ctx.addPoints(interiores.map(P));
      ctx.triangulate();
      const mapa = new Map();
      verts2d = [];
      const id = pt => {
        let k = mapa.get(pt);
        if (k === undefined) { k = verts2d.length; verts2d.push([pt.x, pt.y]); mapa.set(pt, k); }
        return k;
      };
      ctx.getTriangles().forEach(t => triIdx.push(id(t.getPoint(0)), id(t.getPoint(1)), id(t.getPoint(2))));
    } catch {
      fallas++;
      conEarcut();
    }
  }
  if (!triIdx.length) return;

  const g = G(grupo);
  const base = g.pos.length / 3;
  const inv = face.orientationIsReversed;
  const pts = verts2d.map(([x, y]) => {
    const u = x / su, v = y / sv;
    const p = srf.pointAt(u, v);
    let n = srf.normalAt(u, v);
    if (inv) n = n.map(c => -c);
    return { p, n };
  });
  pts.forEach(({ p, n }) => { g.pos.push(...T(p)); g.nor.push(...TN(n)); });
  const margen = 20;
  const afuera = ({ p }) => p.some((x, k) => !Number.isFinite(x) || x < caja.min[k] - margen || x > caja.max[k] + margen);
  for (let i = 0; i < triIdx.length; i += 3) {
    let [a, b, c] = [triIdx[i], triIdx[i + 1], triIdx[i + 2]];
    if (afuera(pts[a]) || afuera(pts[b]) || afuera(pts[c])) { descartados++; continue; }
    const gn = cross(sub(pts[b].p, pts[a].p), sub(pts[c].p, pts[a].p));
    const vn = [0, 1, 2].reduce((s, k) => s.map((x, j) => x + pts[[a, b, c][k]].n[j]), [0, 0, 0]);
    if (dot(gn, vn) < 0) [b, c] = [c, b];
    g.idx.push(base + a, base + b, base + c);
  }
  tris += triIdx.length / 3;
}

// Cara horizontal (normal por área de sus triángulos) cuyas alturas cumplen "donde".
function caraHorizontal(m, donde) {
  const v = m.vertices(), fc = m.faces();
  let n = [0, 0, 0], zmax = -Infinity, zmin = Infinity;
  for (let t = 0; t < fc.count; t++) {
    const q = fc.get(t), a = v.get(q[0]), b = v.get(q[1]), c = v.get(q[2]);
    n = n.map((x, k) => x + cross(sub(b, a), sub(c, a))[k]);
  }
  for (let j = 0; j < v.count; j++) { zmax = Math.max(zmax, v.get(j)[2]); zmin = Math.min(zmin, v.get(j)[2]); }
  return Math.abs(n[2]) / (Math.hypot(...n) || 1) > 0.9 && donde(zmax, zmin);
}

function balconCerrado(capa, geo) {
  const b = geo.getBoundingBox();
  // La tapa de teca del balcón cerrado viene como otra pieza: una pared vertical
  // de teca de ~1 m junto a la bisagra. Con el balcón abierto quedaba parada a
  // la vista, cruzada con el balcón (se veía como una textura rota).
  if (/EXTERIOR DESIGN::TEAK$/i.test(capa)) {
    const ay = Math.min(Math.abs(b.min[1]), Math.abs(b.max[1]));
    return b.min[0] > -200 && b.max[0] < 2600 && Math.abs(b.max[1] - b.min[1]) < 150 && ay > 1600 && b.max[2] - b.min[2] > 900;
  }
  if (!/EXTERIOR DESIGN::DECK$/i.test(capa) || geo.constructor.name !== "Brep" || geo.faces().count !== 19) return false;
  return b.max[0] < 2700 && Math.max(-b.min[1], b.max[1]) < 2200 && b.max[2] > 2400;
}
// Bisagras de los balcones (calculadas comparando la copia abierta con la
// cerrada del .3dm): punto sobre el eje y giro de abierto a cerrado, en grados.
const BISAGRAS = { babor: { p: [1200, 1818, 1231], angulo: 84.88 }, estribor: { p: [1200, -1817, 1230], angulo: -84.74 } };
const base = n => n.split("@")[0];

// Posavasos de acrílico (placas finas con agujeros sobre los asoleadores).
const esAcrilico = (capa, b) => /BLACK PAINT PARTS/i.test(capa) && b.max[2] - b.min[2] < 25
  && Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) > 300 && Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) < 700 && b.min[2] > 2400;

const t0 = Date.now();
for (let i = 0; i < objs.count; i++) {
  const o = objs.get(i), geo = o.geometry(), tipo = geo.constructor.name;
  if (tipo !== "Brep" && tipo !== "Mesh" && tipo !== "Extrusion") continue;
  const capa = capas.get(o.attributes().layerIndex).fullPath;
  if (SALTEAR.some(r => r.test(capa))) continue;
  let grupo = grupoDe(capa);
  // Paneles verticales de teca al final de los balcones, junto a la mesa: en el
  // barco son de plástico (la teca se veía pegada en el costado).
  if (grupo === "teca") {
    const b = geo.getBoundingBox();
    const ay = Math.min(Math.abs(b.min[1]), Math.abs(b.max[1]));
    if (b.min[0] > 2200 && b.max[0] < 3400 && Math.abs(b.max[1] - b.min[1]) < 150 && ay > 1600 && b.max[2] - b.min[2] > 600) grupo = "cubierta";
  }
  // Almohadones: las piezas chicas de los tapizados van claras, como en los renders.
  if (grupo === "tapizado") {
    const b = geo.getBoundingBox();
    const lado = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    if (lado < 650 && /CUSHION/i.test(capa)) grupo = "almohadon";
  }
  if (esAcrilico(capa, geo.getBoundingBox())) grupo = "acrilico";
  // Los balcones vienen dos veces: abiertos y cerrados. Queda la copia abierta
  // (la web los cierra girándolos sobre la bisagra).
  if (balconCerrado(capa, geo)) continue;
  // Superficies duplicadas en el .3dm (misma caja, misma capa) pelean en pantalla.
  const bb0 = geo.getBoundingBox();
  const firma = `${capa}|${tipo}|${bb0.min.map(v => v.toFixed(1))}|${bb0.max.map(v => v.toFixed(1))}|${tipo === "Brep" ? geo.faces().count : ""}`;
  if (vistos.has(firma)) continue;
  vistos.add(firma);
  const ancla = ANCLAS.find(([r]) => r.test(capa));
  if (ancla) {
    const c = cajasAncla[ancla[1]] ||= { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let k = 0; k < 3; k++) { c.min[k] = Math.min(c.min[k], bb0.min[k]); c.max[k] = Math.max(c.max[k], bb0.max[k]); }
  }
  if (tipo === "Mesh") { agregarMalla(geo, grupo); continue; }
  if (tipo === "Extrusion") {
    const m = geo.getMesh(rh.MeshType.Any);
    if (m) agregarMalla(m, grupo);
    continue;
  }
  // Brep con mallas de render guardadas: se usan tal cual.
  const caraMallas = [];
  const fl0 = geo.faces();
  for (let k = 0; k < fl0.count; k++) { const m = fl0.get(k).getMesh(rh.MeshType.Any); if (m) caraMallas.push(m); }
  if (caraMallas.length === fl0.count && caraMallas.length) {
    // Balcones rebatibles (piezas de cubierta que salen de la manga): la cara
    // de arriba es de teca, como en los renders.
    // Se exportan aparte (grupo@lado) para poder rebatirlos en la web.
    const balcon = /EXTERIOR DESIGN::DECK$/i.test(capa) && Math.max(-bb0.min[1], bb0.max[1]) > 2500 && bb0.max[0] < 3000;
    const lado = balcon ? (bb0.max[1] > 2500 ? "@babor" : "@estribor") : "";
    // La cara de abajo, con el balcón cerrado, es el costado: va como casco.
    let tope = -Infinity, piso = Infinity;
    if (balcon) caraMallas.forEach(m => { const v = m.vertices(); for (let j = 0; j < v.count; j++) { tope = Math.max(tope, v.get(j)[2]); piso = Math.min(piso, v.get(j)[2]); } });
    const grupoCara = m => !balcon ? grupo : caraHorizontal(m, z => z > tope - 30) ? "teca" : caraHorizontal(m, (z, zmin) => zmin < piso + 30) ? "casco" : grupo;
    caraMallas.forEach(m => agregarMalla(m, grupoCara(m) + lado));
    caras += caraMallas.length;
    continue;
  }
  const fl = geo.faces();
  const bb = geo.getBoundingBox();
  const caja = { min: bb.min, max: bb.max };
  for (let k = 0; k < fl.count; k++) {
    const f = fl.get(k);
    try { mallarCara(geo, f, grupo, caja); caras++; } catch (e) { fallas++; }
  }
  if (i % 400 === 0) process.stderr.write(`\r${i}/${objs.count} · ${caras} caras · ${tris} tri · ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.error(`\ndescartados ${descartados} · caras ${caras} · planas ${planas} · con respaldo ${fallas} · triángulos ${tris} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);

// ── glTF ──
const gdoc = new Document();
const buf = gdoc.createBuffer();
const escena = gdoc.createScene("barco");
for (const [id, c] of Object.entries(cajasAncla)) {
  const centro = T([(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2]);
  escena.addChild(gdoc.createNode(`ancla:${id}`).setTranslation(centro));
}
if (Object.keys(grupos).some(n => n.includes("@"))) for (const [lado, b] of Object.entries(BISAGRAS))
  escena.addChild(gdoc.createNode(`bisagra:${lado}`).setTranslation(T(b.p)).setExtras({ angulo: b.angulo }));
console.error("anclas:", Object.keys(cajasAncla).join(", ") || "ninguna");
const COLORES = { casco: [1, 1, 1, 1], cubierta: [0.95, 0.95, 0.94, 1], interior: [0.85, 0.85, 0.83, 1], detalle: [0.3, 0.3, 0.3, 1], vidrios: [0.1, 0.1, 0.1, 0.5], fondo: [0.15, 0.15, 0.15, 1], teca: [0.55, 0.4, 0.27, 1], cromo: [0.8, 0.8, 0.8, 1], tapizado: [0.9, 0.88, 0.84, 1], negro: [0.05, 0.05, 0.05, 1] };
// UV por caja: cada triángulo se proyecta según hacia dónde mira (pisos desde
// arriba, paredes de frente o de costado). Así la veta y las tablas no se
// estiran en las caras verticales. Sólo en los grupos que llevan textura.
const CON_TEXTURA = new Set(["teca", "tapizado", "almohadon", "madera", "piso", "tela", "piedra"]);
function uvCaja(g) {
  const pos = [], nor = [], uv = [];
  for (let i = 0; i < g.idx.length; i += 3) {
    const ids = [g.idx[i], g.idx[i + 1], g.idx[i + 2]];
    const p = ids.map(k => [g.pos[k * 3], g.pos[k * 3 + 1], g.pos[k * 3 + 2]]);
    const n = cross(sub(p[1], p[0]), sub(p[2], p[0])).map(Math.abs);
    const eje = n[0] >= n[1] && n[0] >= n[2] ? 0 : n[1] >= n[2] ? 1 : 2;
    ids.forEach((k, j) => {
      const q = p[j];
      pos.push(...q);
      nor.push(g.nor[k * 3], g.nor[k * 3 + 1], g.nor[k * 3 + 2]);
      uv.push(...(eje === 0 ? [q[2], q[1]] : eje === 1 ? [q[0], q[2]] : [q[0], q[1]]));
    });
  }
  return { pos, nor, uv, idx: Array.from({ length: pos.length / 3 }, (_, i) => i) };
}
for (const [nombre, g0] of Object.entries(grupos)) {
  if (!g0.idx.length) continue;
  const g = g0;
  const prim = gdoc.createPrimitive()
    .setAttribute("POSITION", gdoc.createAccessor().setType("VEC3").setArray(new Float32Array(g.pos)).setBuffer(buf))
    .setAttribute("NORMAL", gdoc.createAccessor().setType("VEC3").setArray(new Float32Array(g.nor)).setBuffer(buf))
    .setIndices(gdoc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.idx)).setBuffer(buf))

    .setMaterial(gdoc.createMaterial(nombre).setBaseColorFactor(COLORES[base(nombre)] || [0.8, 0.8, 0.8, 1]).setDoubleSided(true));
  const mesh = gdoc.createMesh(nombre).addPrimitive(prim);
  escena.addChild(gdoc.createNode(nombre).setMesh(mesh));
  console.error(`${nombre}: ${g.pos.length / 3} vértices, ${g.idx.length / 3} triángulos`);
}
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await gdoc.transform(
  dedup(),
  weld(),
);
// Tapizados y almohadones vienen en cientos de parches sueltos (una malla por
// cara): sin normales, el weld los une por posición y la simplificación normal
// conserva las formas. El visor recalcula un sombreado suave.
for (const mesh of gdoc.getRoot().listMeshes()) {
  if (["tapizado", "almohadon"].includes(base(mesh.getName()))) mesh.listPrimitives().forEach(p => p.setAttribute("NORMAL", null));
}
await gdoc.transform(weld());
// Tope de triángulos por grupo: lo que más se ve (casco, cubierta) conserva detalle.
const TOPE = { casco: 45000, cubierta: 35000, negro: 80000, cromo: 40000, acrilico: 20000, tapizado: 110000, almohadon: 40000, interior: 30000, vidrios: 8000, teca: 12000, fondo: 6000, detalle: 12000, madera: 35000, piso: 8000, tela: 30000, techo: 10000, piedra: 5000, loza: 10000 };
for (const mesh of gdoc.getRoot().listMeshes()) {
  for (const prim of mesh.listPrimitives()) {
    const n = prim.getIndices().getCount() / 3;
    const tope = (TOPE[base(mesh.getName())] ?? 20000) * (mesh.getName().includes("@") ? 0.25 : 1) * (INTERIOR_SOLO ? 2.5 : 1);
    const ratio = Math.min(1, tope / n);
    if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: ["casco", "cubierta", "vidrios"].includes(base(mesh.getName())) ? 0.004 : ["tapizado", "almohadon"].includes(base(mesh.getName())) ? 0.003 : 0.005, lockBorder: false });
  }
}
// UV por caja después de simplificar (antes, cada triángulo con vértices
// propios impedía simplificar). Se reescriben posiciones, normales e índices.
for (const mesh of gdoc.getRoot().listMeshes()) {
  if (!CON_TEXTURA.has(base(mesh.getName()))) continue;
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute("POSITION"), Nn = prim.getAttribute("NORMAL"), I = prim.getIndices();
    const g = { pos: [], nor: [], idx: [] };
    for (let i = 0; i < P.getCount(); i++) { g.pos.push(...P.getElement(i, [])); g.nor.push(...(Nn ? Nn.getElement(i, []) : [0, 1, 0])); }
    for (let i = 0; i < I.getCount(); i++) g.idx.push(I.getScalar(i));
    const r = uvCaja(g);
    P.setArray(new Float32Array(r.pos));
    if (Nn) Nn.setArray(new Float32Array(r.nor));
    I.setArray(new Uint32Array(r.idx));
    prim.setAttribute("TEXCOORD_0", gdoc.createAccessor().setType("VEC2").setArray(new Float32Array(r.uv)).setBuffer(buf));
  }
}
await gdoc.transform(weld());
// Las UV quedan en float: están en metros (fuera de 0..1) y la cuantización las recortaría.
await gdoc.transform(prune({ keepLeaves: true, keepAttributes: true }), quantize({ pattern: /^(POSITION|NORMAL)$/ }));
gdoc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
await io.write(salidaGlb, gdoc);
const final = await io.read(salidaGlb);
final.getRoot().listMeshes().forEach(m => { const p = m.listPrimitives()[0]; console.error(`→ ${m.getName()}: ${p.getIndices().getCount() / 3} triángulos`); });
console.error("glb:", (fs.statSync(salidaGlb).size / 1e6).toFixed(2), "MB");
