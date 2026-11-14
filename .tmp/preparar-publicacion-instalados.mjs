import fs from "node:fs";
import path from "node:path";

const dest = ".tmp/publicacion-instalados";
const files = [
  "src/features/materiales/MaterialesScreen.jsx",
  "src/features/materiales/api.js",
  "src/features/materiales/obra/ObraListaWorkspace.jsx",
  "src/features/panol/MapaPanolTab.jsx",
  "src/features/panol/StockPanolScreen.jsx",
  "src/features/panol/StockWmsPanel.jsx",
  "src/features/panol/mostrador/UltimosPanol.jsx",
  "src/features/panol/mostrador/mostradorPanolLogica.js",
  "src/features/panol/mostrador/mostradorPanolLogica.test.mjs",
  "src/features/panol/panolMovimientos.js",
  "src/features/panol/panolMovimientos.test.mjs",
  "src/features/panol/stockGrupos.js",
];
function section(source, start, end) {
  const from = source.indexOf(start);
  const until = source.indexOf(end, from + start.length);
  if (from < 0 || until < 0) throw Error(start + " or " + end);
  return source.slice(from, until);
}
for (const file of files) {
  const destination = path.join(dest, file);
  const base = fs.readFileSync(destination, "utf8").replaceAll("\r\n","\n");
  let edited = fs.readFileSync(file, "utf8").replaceAll("\r\n","\n");
  const restore = (start,end) => { edited = edited.replace(section(edited,start,end),section(base,start,end)); };
  const remove = line => {
    if (!edited.includes(line)) throw Error("Missing text: " + line);
    edited = edited.replace(line, "");
  };
  if (file.endsWith("/StockPanolScreen.jsx")) {
    restore('import { nombreDeMovimiento,', 'import { fetchCierresAbiertosPorObra');
    edited = edited.replace("rowHasRecordedEgreso, rowIsAnulado,","rowHasRecordedEgreso, rowIsAnulado, rowIsInstalled,");
    restore("function rowMovementKind(row)", "function cleanHumanField");
    edited = edited.replace("function rowMovementKind(row) {\n", 'function rowMovementKind(row) {\n  if (rowIsInstalled(row)) return "instalado";\n');
    remove("  const recepcion = rowRecepcionOriginal(m.row);\n");
    remove(edited.split("\n").find(line => line.includes("{recepcion && <span>Ingreso original")) + "\n");
  }
  if (file.endsWith("/StockWmsPanel.jsx")) {
    remove("  rowRecepcionOriginal,\n");
    restore("function rowDestinoMovimientoLabel", "function rowMovimientoRuta");
    remove("  const recepcion = rowRecepcionOriginal(row);\n");
    remove(edited.split("\n").find(line => line.includes("{recepcion && <span>Ingreso original")) + "\n");
  }
  if (file.endsWith("/stockGrupos.js")) {
    restore("export function rowIsReasignacionRetirada", "export function rowIsMovimientoEspejo");
    const start = '  const source = rowSource(row);';
    const currentKind = section(edited,"export function rowEgresoKind", "export function rowRecepcionOriginal");
    const oldKind = section(base,"export function rowEgresoKind","export function rowEgresoQuantity");
    edited = edited.replace(currentKind, oldKind.replace(start, '  if (rowIsInstalled(row)) return "instalado";\n' + start));
    edited = edited.replace(section(edited,"export function rowRecepcionOriginal", "export function rowEgresoQuantity"), "");
  }
  fs.writeFileSync(destination, edited, "utf8");
}
fs.writeFileSync(path.join(dest, "paths.json"), JSON.stringify(files));
