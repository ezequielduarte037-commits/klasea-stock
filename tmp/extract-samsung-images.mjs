async function inspect(url) {
  const response = await fetch(url, { headers: { "user-agent": "KlaseA/1.0" } });
  const html = await response.text();
  const og = html.match(/property=["']og:image["'] content=["']([^"']+)["']/i);
  console.log("URL", url);
  console.log("og", og?.[1] ?? null);
  const gallery = [...html.matchAll(/https:\/\/images\.samsung\.com\/is\/image\/samsung\/p6pim\/ar\/[^"'\\\s]+/g)]
    .map((match) => match[0])
    .filter((value) => value.includes("gallery") && value.includes("1164_776"));
  console.log("gallery", [...new Set(gallery)].slice(0, 5));
}

await inspect("https://www.samsung.com/ar/refrigerators/bottom-mount-freezer/rb31fsrndsa-328l-silver-rb31fsrndsa-b3/");
await inspect("https://www.samsung.com/ar/microwave-ovens/grill/mq8000m-mg22m8054ak-bg/");

const matro = await fetch("https://www.maranautica.es/deposito-aguas-residuales-iso-8099-103lt-12v", {
  headers: { "user-agent": "KlaseA/1.0" },
});
const matroHtml = await matro.text();
console.log("matromarine?", /matromarine/i.test(matroHtml), "103?", /103/.test(matroHtml));
