// Rhino (.3dm) → .glb de una pieza suelta para el visor de piezas
// (/pieza/:token, src/features/piezas): un techo, una consola, un molde.
// La pieza se arma por partes, cada una con las capas del .3dm que le tocan;
// el visor las muestra con su nombre y deja prender y apagar cada una. Sale en
// metros con los ejes del recorrido (proa +x, arriba +y, estribor +z) y con las
// aristas de cada superficie, para leer la forma como en Rhino.
//
// Usa las mallas de render que guarda Rhino (el .3dm tiene que estar guardado
// con ellas, no con "Guardar pequeño").
//
// Uso (mismas dependencias que rhino-a-glb.mjs, instaladas aparte):
//   node scripts/pieza-a-glb.mjs pieza.3dm scripts/piezas/k43-soft-top.json public/piezas/<token>.glb
// El nombre del .glb es el token del link: https://klasea-stock.vercel.app/pieza/<token>.
// Para una pieza nueva: un .json como el del soft top y un token al azar, con
// el modelo adelante para reconocerlo (k43-soft-top-<8 letras o números>).
import rhino3dm from "rhino3dm";
import fs from "node:fs";
import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weld, simplifyPrimitive, quantize, dedup, prune } from "@gltf-transform/functions";
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";

const [,, entrada, configJson, salidaGlb] = process.argv;
const config = JSON.parse(fs.readFileSync(configJson, "utf8"));
const rh = await rhino3dm();
const doc = rh.File3dm.fromByteArray(new Uint8Array(fs.readFileSync(entrada)));
const objs = doc.objects(), capas = doc.layers();

// Rhino (x adelante, y babor, z arriba, mm) → three (x proa, y arriba, z estribor, m)
const T = p => [p[0] / 1000, p[2] / 1000, -p[1] / 1000];
const TN = n => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[2] / l, -n[1] / l]; };

// Cada parte toma las capas cuya ruta completa coincide con "capas". Con
// "grabados" (un color), las superficies sin espesor de esas capas (los
// rótulos que la CNC graba en las costillas) van aparte, como parte@grabado,
// para dibujarlas encima de la cara donde están.
const malla = () => ({ pos: [], nor: [], idx: [] });
const partes = config.partes.map(p => ({ ...p, re: new RegExp(p.capas, "i"), sup: malla(), gra: malla(), lin: [] }));
const plana = b => Math.min(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) < 0.5;

function agregarMalla(mesh, g) {
  const base = g.pos.length / 3;
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
}

// Aristas de la superficie, muestreadas cada ~2 cm (las rectas, en sus puntas).
function agregarAristas(brep, lin) {
  const edges = brep.edges();
  for (let i = 0; i < edges.count; i++) {
    const e = edges.get(i), [d0, d1] = e.domain;
    const a = e.pointAt(d0), b = e.pointAt(d1), m = e.pointAt((d0 + d1) / 2);
    const recta = Math.hypot(...[0, 1, 2].map(k => m[k] - (a[k] + b[k]) / 2)) < 0.05;
    let largo = 0, ant = a;
    for (let k = 1; k <= 16; k++) { const q = e.pointAt(d0 + (d1 - d0) * k / 16); largo += Math.hypot(q[0] - ant[0], q[1] - ant[1], q[2] - ant[2]); ant = q; }
    const n = recta ? 1 : Math.max(2, Math.min(200, Math.ceil(largo / 20)));
    ant = T(a);
    for (let k = 1; k <= n; k++) {
      const q = T(e.pointAt(d0 + (d1 - d0) * k / n));
      lin.push(...ant, ...q);
      ant = q;
    }
  }
}

// Caras repetidas: el .3dm trae caras copiadas a otra capa (en el soft top,
// la mitad de estribor del techo también está en la de pintura negra) y las
// dos copias titilan una sobre otra. Se queda la de la parte que va primero
// en la lista. Se comparan por la caja de su malla (al milímetro).
const cajasVistas = [];
function cajaMalla(m) {
  const vs = m.vertices(), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < vs.count; k++) { const v = vs.get(k); for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], v[j]); max[j] = Math.max(max[j], v[j]); } }
  return [...min, ...max];
}
const repetida = c => cajasVistas.some(o => o.every((v, j) => Math.abs(v - c[j]) < 1));

let sinMalla = 0, repetidas = 0;
const vistos = new Set();
for (const p of partes) for (let i = 0; i < objs.count; i++) {
  const o = objs.get(i), geo = o.geometry(), tipo = geo.constructor.name;
  if (tipo !== "Brep" && tipo !== "Mesh" && tipo !== "Extrusion") continue;
  const capa = capas.get(o.attributes().layerIndex).fullPath, b = geo.getBoundingBox();
  if (partes.find(x => x.re.test(capa)) !== p) continue;
  // Superficies duplicadas en el .3dm (misma caja, misma capa) pelean en pantalla.
  const firma = `${capa}|${tipo}|${b.min.map(v => v.toFixed(1))}|${b.max.map(v => v.toFixed(1))}`;
  if (vistos.has(firma)) continue;
  vistos.add(firma);
  const grabado = p.grabados && plana(b);
  const g = grabado ? p.gra : p.sup;
  if (tipo === "Mesh") { agregarMalla(geo, g); continue; }
  const m = tipo === "Extrusion" ? geo.getMesh(rh.MeshType.Any) : null;
  const brep = tipo === "Extrusion" ? geo.toBrep(true) : geo;
  let nuevas = 0;
  if (tipo === "Extrusion") { if (m) { agregarMalla(m, g); nuevas++; } else sinMalla++; }
  else {
    const caras = brep.faces();
    for (let k = 0; k < caras.count; k++) {
      const mc = caras.get(k).getMesh(rh.MeshType.Any);
      if (!mc) { sinMalla++; continue; }
      const c = cajaMalla(mc);
      if (!grabado && repetida(c)) { repetidas++; continue; }
      if (!grabado) cajasVistas.push(c);
      agregarMalla(mc, g);
      nuevas++;
    }
  }
  if (!grabado && nuevas) agregarAristas(brep, p.lin);
}
if (repetidas) console.error(`${repetidas} caras repetidas en otra parte (quedó la primera)`);
if (sinMalla) console.error(`ojo: ${sinMalla} caras sin malla de render (guardar el .3dm con mallas)`);

// ── glTF ──
const lineal = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = hex => [1, 3, 5].map(i => lineal(parseInt(hex.slice(i, i + 2), 16) / 255));
const gdoc = new Document();
const buf = gdoc.createBuffer();
const escena = gdoc.createScene("pieza");
const triangulos = (g, color, opacidad) => {
  const material = gdoc.createMaterial().setBaseColorFactor([...rgb(color), opacidad ?? 1]).setDoubleSided(true);
  if (opacidad != null) material.setAlphaMode("BLEND");
  return gdoc.createPrimitive()
    .setAttribute("POSITION", gdoc.createAccessor().setType("VEC3").setArray(new Float32Array(g.pos)).setBuffer(buf))
    .setAttribute("NORMAL", gdoc.createAccessor().setType("VEC3").setArray(new Float32Array(g.nor)).setBuffer(buf))
    .setIndices(gdoc.createAccessor().setType("SCALAR").setArray(new Uint32Array(g.idx)).setBuffer(buf))
    .setMaterial(material);
};
for (const p of partes) {
  if (!p.sup.idx.length) { console.error(`${p.id}: vacía (ninguna capa coincide con ${p.capas})`); continue; }
  const mesh = gdoc.createMesh(p.id).addPrimitive(triangulos(p.sup, p.color, p.opacidad));
  if (p.lin.length) mesh.addPrimitive(gdoc.createPrimitive().setMode(1)
    .setAttribute("POSITION", gdoc.createAccessor().setType("VEC3").setArray(new Float32Array(p.lin)).setBuffer(buf))
    .setMaterial(gdoc.createMaterial().setBaseColorFactor([0, 0, 0, 1])));
  escena.addChild(gdoc.createNode(p.id).setMesh(mesh));
  if (p.gra.idx.length) escena.addChild(gdoc.createNode(`${p.id}@grabado`).setMesh(gdoc.createMesh(`${p.id}@grabado`).addPrimitive(triangulos(p.gra, p.grabados))));
  console.error(`${p.id}: ${p.sup.idx.length / 3} triángulos, ${p.lin.length / 6} segmentos de arista${p.gra.idx.length ? `, ${p.gra.idx.length / 3} triángulos grabados` : ""}`);
}
// Lo que el visor necesita para presentar la pieza: título y partes, en orden.
escena.setExtras({
  pieza: {
    titulo: config.titulo, modelo: config.modelo, codigo: config.codigo,
    partes: partes.filter(p => p.sup.idx.length).map(({ id, nombre, color, opacidad, metal, grabados, visible = true }) => ({ id, nombre, color, opacidad, metal, grabados, visible })),
  },
});

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await gdoc.transform(dedup(), weld());
// Tope de triángulos por parte (para que abra rápido en el celular).
for (const mesh of gdoc.getRoot().listMeshes()) {
  const p = partes.find(x => x.id === mesh.getName().split("@")[0]);
  const prim = mesh.listPrimitives()[0];
  const ratio = Math.min(1, (p.tope ?? 60000) / (prim.getIndices().getCount() / 3));
  if (ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.002, lockBorder: true });
}
await gdoc.transform(prune({ keepLeaves: true, keepAttributes: true }), quantize({ pattern: /^(POSITION|NORMAL)$/ }));
gdoc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
await io.write(salidaGlb, gdoc);
const final = await io.read(salidaGlb);
final.getRoot().listMeshes().forEach(m => {
  const [s, l] = m.listPrimitives();
  console.error(`→ ${m.getName()}: ${s.getIndices().getCount() / 3} triángulos${l ? `, ${(l.getIndices()?.getCount() ?? l.getAttribute("POSITION").getCount()) / 2} segmentos` : ""}`);
});
console.error("glb:", (fs.statSync(salidaGlb).size / 1e6).toFixed(2), "MB");
