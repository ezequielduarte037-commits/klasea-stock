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
//   VIDRIOS=public/models/k43.glb PERFIL=interior node --max-old-space-size=12000 scripts/rhino-a-glb.mjs k43-interior.3dm public/models/k43-interior.glb 40
//   (VIDRIOS: el exterior ya exportado, para recortar el forro del casco frente a las ventanas)
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
// PERFIL=interior: modelo del interior solo, con más detalle (se mira de cerca).
// El cielorraso y lo que cuelga de él van en piezas aparte ("techo" y "…@techo"):
// el recorrido mira desde arriba y las oculta; el configurador, desde adentro.
const INTERIOR_SOLO = process.env.PERFIL === "interior";
// Las persianas de las ventanas del casco vienen cerradas (pilas de listones):
// desde adentro eran rayas y tapaban el mar.
if (INTERIOR_SOLO) SALTEAR.push(/BLINDFOLDS/i);
// PERFIL=exterior: el interior va en su propio .glb, acá no se exporta.
if (process.env.PERFIL === "exterior") SALTEAR.push(/^INTERIOR/i, /^LEATHER$/i, /^INOX$/i, /^BLACK-PAINT$/i, /^COUNTERTOP$/i, /^COMPANIONWAY DOOR$/i);
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
// Interior visto desde adentro: la capa sola no alcanza, el material de render
// del .3dm dice de qué es cada pieza (la puerta de la bajada es de vidrio, la
// heladera de acero cepillado, el piso del baño de gelcoat, los herrajes negros).
const grupoInterior = (capa, mat, b) => {
  // Spots embutidos: el aro (negro o de acero) y la luz; los paneles de LED
  // del techo del comedor, aparte (la web los prende con otra intensidad).
  if (/QUICK AG1K/i.test(capa)) return /INOX/i.test(mat) ? "acero@techo" : "herraje@techo";
  if (/::LED$/i.test(capa)) return Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1]) > 200 ? "difusor@techo" : "spot@techo";
  if (/::CIELING-PANELS$/i.test(capa)) return "panel@techo";
  if (/::CIELING$/i.test(capa)) return "techo";
  if (/LEWMAR FLUSH HATCH/i.test(capa)) return b.max[2] - b.min[2] < 35 && b.max[0] - b.min[0] > 600 ? "vidrios@techo" : "herraje@techo";
  // La cortina de la escotilla, cerrada: en el modelo exterior la cubierta no
  // tiene el agujero y por el vidrio se veía su cara de abajo.
  if (/OSCURANTE/i.test(capa)) return "techo";
  if (/SHOWER PAINI/i.test(capa)) return "cromo@techo";
  if (/::TV/i.test(capa)) return "tv";
  if (/^COMPANIONWAY DOOR$/i.test(capa) && /GLASS/i.test(mat)) return "vidrios";
  if (/::FLOOR$/i.test(capa) && /GELCOAT/i.test(mat)) return "gelcoat";
  if (/CORIAN/i.test(mat)) return "piedra";
  // Pasamanos (capa INOX) pulidos; heladera, bisagras y grifería, cepillados.
  if (/INOX/i.test(mat) && !/^INOX$/i.test(capa)) return "acero";
  if (/BLACK-METAL/i.test(mat)) return "herraje";
  return null;
};

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
// Copia en espejo (babor ↔ estribor): para piezas que en el .3dm están de un
// solo lado. El espejo invierte el sentido de los triángulos.
function agregarMallaEspejo(mesh, grupo) {
  const g = G(grupo), base = g.pos.length / 3;
  const vs = mesh.vertices(), fs_ = mesh.faces(), ns = mesh.normals();
  const conNormales = ns.count === vs.count;
  for (let k = 0; k < vs.count; k++) {
    const p = vs.get(k);
    g.pos.push(...T([p[0], -p[1], p[2]]));
    const n = conNormales ? ns.get(k) : [0, 0, 1];
    g.nor.push(...TN([n[0], -n[1], n[2]]));
  }
  for (let k = 0; k < fs_.count; k++) {
    const [a, b, c, d] = fs_.get(k);
    g.idx.push(base + a, base + c, base + b);
    if (c !== d) g.idx.push(base + a, base + d, base + c);
  }
}

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

// Cara vertical que mira hacia el costado y está en la parte más de afuera.
function caraLateral(m, ext) {
  const v = m.vertices(), fc = m.faces();
  let n = [0, 0, 0], suma = 0;
  for (let t = 0; t < fc.count; t++) {
    const q = fc.get(t), a = v.get(q[0]), b = v.get(q[1]), c = v.get(q[2]);
    n = n.map((x, k) => x + cross(sub(b, a), sub(c, a))[k]);
  }
  for (let j = 0; j < v.count; j++) suma += Math.abs(v.get(j)[1]);
  return Math.abs(n[1]) / (Math.hypot(...n) || 1) > 0.85 && suma / v.count > ext - 60;
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
// Bloques (InstanceReference): su geometría vive en la definición (en el
// .3dm, en la capa Default y en el origen); se copia con la transformación de
// cada inserción. Así entra, por ejemplo, el ancla con su rodillo de proa.
const idefs = doc.instanceDefinitions();
function expandirBloque(ref, xf, profundidad = 0) {
  const def = idefs.findId(ref.parentIdefId);
  if (!def || profundidad > 4) return [];
  const t = xf ? rh.Transform.multiply(xf, ref.xform) : ref.xform;
  return def.getObjectIds().flatMap(id => {
    const ob = objs.findId(id);
    if (!ob) return [];
    const g = ob.geometry();
    if (g.constructor.name === "InstanceReference") return expandirBloque(g, t, profundidad + 1);
    const copia = g.duplicate();
    copia.transform(t);
    return [copia];
  });
}
const elementos = [];
const materiales = doc.materials();
// Material de render: el del objeto o el de su capa.
const materialDe = a => {
  const i = a.materialSource?.value === 1 ? a.materialIndex : capas.get(a.layerIndex).renderMaterialIndex;
  return i >= 0 && i < materiales.count ? materiales.get(i).name || "" : "";
};
for (let i = 0; i < objs.count; i++) {
  const o = objs.get(i), geo = o.geometry(), tipo = geo.constructor.name;
  const capa = capas.get(o.attributes().layerIndex).fullPath, mat = materialDe(o.attributes());
  if (tipo === "InstanceReference") {
    if (!SALTEAR.some(r => r.test(capa))) expandirBloque(geo).forEach(g => elementos.push({ geo: g, capa, mat }));
  } else elementos.push({ geo, capa, mat });
}
for (let i = 0; i < elementos.length; i++) {
  const { geo, capa, mat } = elementos[i], tipo = geo.constructor.name;
  if (tipo !== "Brep" && tipo !== "Mesh" && tipo !== "Extrusion") continue;
  if (SALTEAR.some(r => r.test(capa))) continue;
  let grupo = (INTERIOR_SOLO && grupoInterior(capa, mat, geo.getBoundingBox())) || grupoDe(capa);
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
  // Los balcones vienen dos veces: abiertos y cerrados. La copia abierta gira
  // sobre la bisagra en la web; la cerrada se exporta aparte (grupo@lado-cerrado)
  // y es la que se ve en reposo: girar la abierta deja rendijas de hasta 6 cm
  // (las dos copias no coinciden exacto) y quedaba un agujero en la popa.
  const cerrado = balconCerrado(capa, geo) ? (geo.getBoundingBox().max[1] > 0 ? "@babor-cerrado" : "@estribor-cerrado") : "";
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
    // Tapa de la esquina de popa junto al balcón: en el .3dm está sólo a babor
    // y a estribor quedaba un agujero. Se copia en espejo.
    if (/EXTERIOR DESIGN::HULL$/i.test(capa) && bb0.min[0] > -250 && bb0.max[0] < 150 && bb0.min[1] > 1650 && bb0.max[1] < 2000 && bb0.min[2] > 1000 && bb0.max[2] < 1400) {
      caraMallas.forEach(m => agregarMallaEspejo(m, grupo));
    }
    if (cerrado) {
      // Cerrado, la cara que mira hacia afuera es el costado del casco.
      let ext = 0;
      caraMallas.forEach(m => { const v = m.vertices(); for (let j = 0; j < v.count; j++) ext = Math.max(ext, Math.abs(v.get(j)[1])); });
      caraMallas.forEach(m => agregarMalla(m, (grupo !== "teca" && caraLateral(m, ext) ? "casco" : grupo) + cerrado));
    } else caraMallas.forEach(m => agregarMalla(m, grupoCara(m) + lado));
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
  if (i % 400 === 0) process.stderr.write(`\r${i}/${elementos.length} · ${caras} caras · ${tris} tri · ${((Date.now() - t0) / 1000).toFixed(0)} s   `);
}
console.error(`\ndescartados ${descartados} · caras ${caras} · planas ${planas} · con respaldo ${fallas} · triángulos ${tris} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
// Tapas del cielorraso del K43, donde desde adentro se veía la cubierta del
// modelo exterior (en mm del .3dm, cara hacia abajo):
// · Camarote de popa: hueco a lo ancho que sube hacia el asiento del cockpit;
//   el piso del cockpit lo cruza. A ras, medio milímetro por encima (donde se
//   superpone con el cielorraso, no pelean).
// · Escotilla del comedor: la cubierta no tiene el agujero y la cortina del
//   .3dm es sólo el marco; va la cortina cerrada.
const TAPAS = [
  [[5100, -974, 1465.2], [5496, -974, 1478.8], [5496, 974, 1478.8], [5100, 974, 1465.2]],
  [[9590, -255, 2340], [10110, -255, 2340], [10110, 255, 2340], [9590, 255, 2340]],
];
if (INTERIOR_SOLO && /int43/i.test(entrada)) for (const tapa of TAPAS) {
  const g = G("techo"), b = g.pos.length / 3;
  for (const p of tapa) { g.pos.push(...T(p)); g.nor.push(0, -1, 0); }
  g.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
}
// Ventanas del casco: el forro del .3dm (HULL-OFFSET) pasa entero por delante
// de los vidrios y desde adentro no se veía afuera. Con VIDRIOS=<.glb exterior
// del mismo barco> se saca lo que tapa un vidrio (a menos de 15 cm siguiendo la
// normal). Los triángulos del borde se cortan donde termina el vidrio (el
// forro no se simplifica después: correría el borde del corte).
if (INTERIOR_SOLO && process.env.VIDRIOS && grupos.forro) {
  await MeshoptDecoder.ready;
  const ext = await new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder }).read(process.env.VIDRIOS);
  const vidrios = [];
  for (const node of ext.getRoot().listNodes()) {
    if (node.getName() !== "vidrios" || !node.getMesh()) continue;
    const W = node.getWorldMatrix();
    const v = (P, i) => { const p = P.getElement(i, []); return [0, 1, 2].map(k => W[k] * p[0] + W[4 + k] * p[1] + W[8 + k] * p[2] + W[12 + k]); };
    for (const prim of node.getMesh().listPrimitives()) {
      const P = prim.getAttribute("POSITION"), I = prim.getIndices();
      for (let i = 0; i < I.getCount(); i += 3) vidrios.push([v(P, I.getScalar(i)), v(P, I.getScalar(i + 1)), v(P, I.getScalar(i + 2))]);
    }
  }
  // Grilla de 20 cm con cada vidrio en las celdas que toca (agrandado el alcance).
  const D = 0.15, CELDA = 0.2, grilla = new Map();
  const celda = (x, y, z) => `${Math.floor(x / CELDA)},${Math.floor(y / CELDA)},${Math.floor(z / CELDA)}`;
  for (const t of vidrios) {
    const lo = [0, 1, 2].map(k => Math.floor((Math.min(t[0][k], t[1][k], t[2][k]) - D) / CELDA));
    const hi = [0, 1, 2].map(k => Math.floor((Math.max(t[0][k], t[1][k], t[2][k]) + D) / CELDA));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const k = `${x},${y},${z}`;
      (grilla.get(k) || grilla.set(k, []).get(k)).push(t);
    }
  }
  // Rayo contra un triángulo (Möller–Trumbore), con un margen mínimo para que
  // un punto sobre la arista entre dos triángulos del vidrio no se escape.
  const rayo = (o, d, [a, b, c]) => {
    const e1 = sub(b, a), e2 = sub(c, a), p = cross(d, e2), det = dot(e1, p);
    if (Math.abs(det) < 1e-12) return Infinity;
    const s = sub(o, a), u = dot(s, p) / det;
    if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
    const q = cross(s, e1), w = dot(d, q) / det;
    if (w < -1e-6 || u + w > 1 + 1e-6) return Infinity;
    const t = dot(e2, q) / det;
    return t > 0 ? t : Infinity;
  };
  const tapa = (p, n) => (grilla.get(celda(...p)) || []).some(t => rayo(p, n, t) < D || rayo(p, n.map(x => -x), t) < D);
  const mezcla = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
  const unidad = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  // Dónde termina el vidrio sobre la arista a→b (los extremos de lados distintos).
  const borde = (a, b, na, nb, n) => {
    const ta = tapa(a, n);
    let lo = 0, hi = 1;
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (tapa(mezcla(a, b, m), n) === ta) lo = m; else hi = m; }
    const t = (lo + hi) / 2;
    return [mezcla(a, b, t), unidad(mezcla(na, nb, t))];
  };
  const f = grupos.forro, nuevo = { pos: [], nor: [], idx: [] };
  const poner = (P, N) => { const b = nuevo.pos.length / 3; P.forEach((p, k) => { nuevo.pos.push(...p); nuevo.nor.push(...N[k]); }); nuevo.idx.push(b, b + 1, b + 2); };
  let cortados = 0;
  const partir = (P, N, nivel) => {
    const c = cross(sub(P[1], P[0]), sub(P[2], P[0])), l = Math.hypot(...c);
    if (!l) return;
    const n = c.map(x => x / l), centro = [0, 1, 2].map(k => (P[0][k] + P[1][k] + P[2][k]) / 3);
    const m = [...P, centro].map(p => tapa(p, n));
    const iguales = m[0] === m[1] && m[1] === m[2];
    const largo = Math.max(...[0, 1, 2].map(k => Math.hypot(...sub(P[k], P[(k + 1) % 3]))));
    // Los grandes, o con una punta del vidrio adentro sin tocar los vértices: en cuatro.
    if (m.some(x => x !== m[0]) && nivel < 3 && (largo > 0.05 || iguales)) {
      const M = [0, 1, 2].map(k => mezcla(P[k], P[(k + 1) % 3], 0.5)), NM = [0, 1, 2].map(k => unidad(mezcla(N[k], N[(k + 1) % 3], 0.5)));
      partir([P[0], M[0], M[2]], [N[0], NM[0], NM[2]], nivel + 1);
      partir([M[0], P[1], M[1]], [NM[0], N[1], NM[1]], nivel + 1);
      partir([M[2], M[1], P[2]], [NM[2], NM[1], N[2]], nivel + 1);
      partir([M[0], M[1], M[2]], [NM[0], NM[1], NM[2]], nivel + 1);
      return;
    }
    if (iguales) { if (!m[0]) poner(P, N); return; }
    // Un vértice de un lado y dos del otro: el borde del vidrio cruza las dos
    // aristas del que está solo. Queda su triángulo o el cuadrilátero de los otros.
    const i = m[0] !== m[1] && m[0] !== m[2] ? 0 : m[1] !== m[0] && m[1] !== m[2] ? 1 : 2, j = (i + 1) % 3, k = (i + 2) % 3;
    const [pj, nj] = borde(P[i], P[j], N[i], N[j], n), [pk, nk] = borde(P[i], P[k], N[i], N[k], n);
    cortados++;
    if (!m[i]) poner([P[i], pj, pk], [N[i], nj, nk]);
    else { poner([pj, P[j], P[k]], [nj, N[j], N[k]]); poner([pj, P[k], pk], [nj, N[k], nk]); }
  };
  for (let i = 0; i < f.idx.length; i += 3) {
    const ids = [f.idx[i], f.idx[i + 1], f.idx[i + 2]];
    partir(ids.map(k => f.pos.slice(k * 3, k * 3 + 3)), ids.map(k => f.nor.slice(k * 3, k * 3 + 3)), 0);
  }
  grupos.forro = nuevo;
  console.error(`ventanas: ${vidrios.length} triángulos de vidrio; forro ${f.idx.length / 3} → ${nuevo.idx.length / 3} triángulos (${cortados} cortados en el borde)`);
}

// ── glTF ──
const gdoc = new Document();
const buf = gdoc.createBuffer();
const escena = gdoc.createScene("barco");
for (const [id, c] of Object.entries(cajasAncla)) {
  const centro = T([(c.min[0] + c.max[0]) / 2, (c.min[1] + c.max[1]) / 2, (c.min[2] + c.max[2]) / 2]);
  escena.addChild(gdoc.createNode(`ancla:${id}`).setTranslation(centro));
}
if (Object.keys(grupos).some(n => /@(babor|estribor)/.test(n))) for (const [lado, b] of Object.entries(BISAGRAS))
  escena.addChild(gdoc.createNode(`bisagra:${lado}`).setTranslation(T(b.p)).setExtras({ angulo: b.angulo }));
console.error("anclas:", Object.keys(cajasAncla).join(", ") || "ninguna");
const COLORES = { casco: [1, 1, 1, 1], cubierta: [0.95, 0.95, 0.94, 1], interior: [0.85, 0.85, 0.83, 1], detalle: [0.3, 0.3, 0.3, 1], vidrios: [0.1, 0.1, 0.1, 0.5], fondo: [0.15, 0.15, 0.15, 1], teca: [0.55, 0.4, 0.27, 1], cromo: [0.8, 0.8, 0.8, 1], tapizado: [0.9, 0.88, 0.84, 1], negro: [0.05, 0.05, 0.05, 1], techo: [0.96, 0.95, 0.93, 1], panel: [0.85, 0.84, 0.82, 1], tv: [0.03, 0.03, 0.03, 1], herraje: [0.08, 0.08, 0.08, 1], gelcoat: [0.95, 0.95, 0.93, 1], acero: [0.78, 0.79, 0.8, 1] };
// UV por caja: cada triángulo se proyecta según hacia dónde mira (pisos desde
// arriba, paredes de frente o de costado). Así la veta y las tablas no se
// estiran en las caras verticales. Sólo en los grupos que llevan textura.
const CON_TEXTURA = new Set(["teca", "tapizado", "almohadon", "madera", "piso", "tela", "piedra", "panel"]);
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
const TOPE = { casco: 45000, cubierta: 35000, negro: 80000, cromo: 40000, acrilico: 20000, tapizado: 110000, almohadon: 40000, interior: 30000, vidrios: 8000, teca: 12000, fondo: 6000, detalle: 12000, madera: 35000, piso: 8000, tela: 30000, forro: 32000, techo: 10000, panel: 6000, tv: 2000, herraje: 12000, gelcoat: 3000, acero: 8000, piedra: 5000, loza: 10000 };
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
