// Separa los errores de lint nuevos de los que ya tenía el repositorio.
//
// Compara cada archivo con su versión en BASE (por defecto HEAD) y muestra sólo
// los errores que aparecieron con los cambios. Sirve porque `npm run lint`
// arrastra errores viejos y así no se ve si una modificación agregó alguno.
//
//   node scripts/comparar-lint.mjs src/features/x/Pantalla.jsx src/…
//   git diff --name-only -- src | node scripts/comparar-lint.mjs --stdin
//   BASE=957e460a node scripts/comparar-lint.mjs --stdin < lista.txt
//
// Sin archivos no revisa nada y termina con error, para que un "sin errores"
// nunca salga de no haber mirado.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const raiz = process.cwd();
const require = createRequire(path.join(raiz, "package.json"));
const { ESLint } = require("eslint");
const eslint = new ESLint({ cwd: raiz });
const base = process.env.BASE || "HEAD";

let archivos = process.argv.slice(2);
if (archivos[0] === "--stdin") {
  archivos = readFileSync(0, "utf8").split(/\r?\n/);
}
archivos = archivos.map((a) => a.trim()).filter((a) => /\.(jsx?|mjs)$/.test(a));
if (!archivos.length) {
  console.error("Sin archivos .js/.jsx para comparar.");
  process.exit(2);
}

const clave = (m) => `${m.ruleId}|${(m.message.match(/'([^']+)'/) || [])[1] || ""}`;

function contar(mensajes) {
  const mapa = new Map();
  for (const m of mensajes) {
    if (m.severity !== 2) continue;
    const k = clave(m);
    mapa.set(k, (mapa.get(k) || 0) + 1);
  }
  return mapa;
}

let nuevosTotal = 0;
let revisados = 0;
for (const rel of archivos) {
  const abs = path.join(raiz, rel);
  let texto;
  try {
    texto = readFileSync(abs, "utf8");
  } catch {
    continue; // archivo borrado
  }
  let antes = null;
  try {
    antes = execFileSync("git", ["show", `${base}:${rel.replace(/\\/g, "/")}`], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch {
    antes = null; // archivo nuevo
  }
  const [ahora] = await eslint.lintText(texto, { filePath: abs });
  const conteoAhora = contar(ahora.messages);
  const conteoAntes = antes === null ? new Map() : contar((await eslint.lintText(antes, { filePath: abs }))[0].messages);
  revisados += 1;

  const nuevos = [];
  for (const [k, n] of conteoAhora) {
    const diferencia = n - (conteoAntes.get(k) || 0);
    if (diferencia > 0) nuevos.push(`${k} ×${diferencia}`);
  }
  if (nuevos.length) {
    nuevosTotal += nuevos.length;
    const lineas = ahora.messages
      .filter((m) => m.severity === 2 && nuevos.some((n) => n.startsWith(`${clave(m)} `)))
      .map((m) => m.line);
    console.log(`${rel}: ${nuevos.join(", ")}  (líneas ${[...new Set(lineas)].join(", ")})`);
  }
}

console.log(`\nArchivos revisados: ${revisados}`);
if (nuevosTotal) {
  console.log(`${nuevosTotal} tipos de error nuevos respecto de ${base}`);
  process.exit(1);
}
console.log(`Sin errores nuevos respecto de ${base}`);
