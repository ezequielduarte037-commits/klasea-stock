const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

function readEnv(p) {
  try {
    return Object.fromEntries(
      fs
        .readFileSync(p, "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
        }),
    );
  } catch {
    return {};
  }
}

async function main() {
  const env = { ...readEnv(".env"), ...readEnv(".env.backup.local"), ...process.env };
  const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const sources = JSON.parse(fs.readFileSync("scripts/catalog-image-curated.sources.json", "utf8"));

  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await sb
      .from("panol_materiales")
      .select("id,codigo,descripcion,proveedor,imagen_url,activo")
      .eq("activo", true)
      .range(from, from + 999);
    if (error) throw error;
    if (!data?.length) break;
    all = all.concat(data);
    if (data.length < 1000) break;
    from += 1000;
  }

  const withImg = all.filter((m) => m.imagen_url && String(m.imagen_url).trim());
  const noImg = all.filter((m) => !(m.imagen_url && String(m.imagen_url).trim()));

  const brands = [
    "Garmin",
    "Victron",
    "Quick",
    "Maxwell",
    "Whale",
    "Jabsco",
    "Perko",
    "BGH",
    "Samsung",
    "Lewmar",
    "Delta",
    "Autoterm",
    "Fusion",
    "JL",
    "Marinco",
    "Volvo",
    "Piazza",
    "Hafele",
    "Häfele",
    "Clevers",
    "Seaflo",
    "Lenco",
    "Bennett",
    "Orbis",
    "Iveco",
  ];
  const byBrand = {};
  for (const b of brands) {
    const hits = noImg.filter((m) =>
      `${m.descripcion || ""} ${m.proveedor || ""} ${m.codigo || ""}`.toLowerCase().includes(b.toLowerCase()),
    );
    if (hits.length) byBrand[b] = hits.length;
  }

  const withCode = noImg.filter((m) => m.codigo && String(m.codigo).trim()).length;
  const curatedPending = sources.entries.filter((e) => noImg.some((m) => m.id === e.materialId));

  // rough viability buckets
  const hardHints =
    /racor|buje|codo|tapa hembra|miniesfer|cinta|gen[eé]rico|como el|kit |sin obra|sopapa|herraje|resorte a gas|bisagra|funda para|panel bow|cable deriv|solenoide|multiplus|cyrix|argodiod|parmax|5gpm|thruster|thurster|malacate|footswitch|gpsmap b9|nmea|fusion apollo|jl audio|ve.?direct|volvo|iveco|orbis|h[aä]fele|6360|lenco|bennett/i;
  const likelyHard = noImg.filter((m) => hardHints.test(m.descripcion || "") || hardHints.test(m.codigo || ""));
  const maybeDoable = noImg.filter((m) => !likelyHard.includes(m));

  const report = {
    activos: all.length,
    conImagen: withImg.length,
    sinImagen: noImg.length,
    pctConImagen: Math.round((1000 * withImg.length) / all.length) / 10,
    manifiestoCuradoEntries: sources.entries.length,
    curadosAunSinImagenEnDB: curatedPending.length,
    sinImagenConCodigo: withCode,
    sinImagenSinCodigo: noImg.length - withCode,
    estimacionViableRestante: maybeDoable.length,
    estimacionDificilOInviable: likelyHard.length,
    sinImagenPorMarcaClave: byBrand,
    muestraSinImagen: noImg.slice(0, 40).map((m) => ({
      d: m.descripcion,
      code: m.codigo,
      prov: m.proveedor,
    })),
  };

  fs.writeFileSync(
    "tmp/_fotos_pendientes_informe.json",
    JSON.stringify(
      {
        ...report,
        todosSinImagen: noImg.map((m) => ({
          id: m.id,
          d: m.descripcion,
          code: m.codigo,
          prov: m.proveedor,
        })),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
