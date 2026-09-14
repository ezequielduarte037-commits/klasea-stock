const fs = require("fs");
const j = JSON.parse(fs.readFileSync("tmp/_fotos_pendientes_informe.json", "utf8"));
const sources = JSON.parse(fs.readFileSync("scripts/catalog-image-curated.sources.json", "utf8"));
const no = j.todosSinImagen;

const pending = sources.entries.filter((e) => no.some((m) => m.id === e.materialId));
console.log("curated_pending", pending.map((e) => ({ model: e.model, id: e.materialId })));

const branded =
  /garmin|victron|quick|maxwell|whale|jabsco|perko|bgh|samsung|lewmar|delta|autoterm|fusion|jl audio|marinco|volvo|piazza|hafele|häfele|clevers|seaflo|lenco|bennett|orbis|iveco|kohinoor|aquafax|matromarine|pss|epuyén|epuyen|stereo|plotter|\btv\b|heladera|microondas|ancla|bomba|thruster|thurster|malacate|footswitch|nmea|ve.?direct|argodiod|multiplus|cyrix|par-?max|parmax|garmin/i;
const fabricacion =
  /corte |chapa |brida |niple |bulón|bulon|mecha |cable soldadura|cableado |hierro |inox 316|plegadora|famiq|manchón|manchon|plantilla|\"u\" de hierro/i;
const fittings = /racor|codo|buje|entrerrosca|tapa hembra|miniesfer|manguera|adaptador m |vme|tee |uni[oó]n/i;

const brandish = no.filter((m) => branded.test(m.d || "") || branded.test(m.code || "") || branded.test(m.prov || ""));
const fab = no.filter((m) => fabricacion.test(m.d || "") || fabricacion.test(m.prov || ""));
const fit = no.filter((m) => fittings.test(m.d || ""));
const ids = new Set([...brandish, ...fab, ...fit].map((x) => x.id));

console.log(
  JSON.stringify(
    {
      sinImagen: no.length,
      marcaOProductoCatalogable: brandish.length,
      fabricacionCortesInox: fab.length,
      fittingsGenericos: fit.length,
      resto: no.length - ids.size,
      marcaSample: brandish.slice(0, 30).map((x) => x.d),
    },
    null,
    2,
  ),
);
