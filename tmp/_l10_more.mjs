const fs = require("fs");
const { spawnSync } = require("child_process");

function meta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] || m?.[2] || null;
}

const urls = [
  "https://www.lewmar.com/delta-stainless-steel-anchor",
  "https://jimmygreen.com/product/lewmar-delta-anchor-stainless-steel/",
  "https://www.quickitaly.com/en/products/manoeuvring-systems/dc-thrusters/btq-250/",
  "https://damarine.com.cy/products/dc-thruster-btq-250-o-250-mm-double-counter-rotating-propellers-boat-length-from-13-21-m/",
  "https://www.victronenergy.com/battery-isolators-and-combiners/argo-diode-battery-isolators",
];

const out = [];
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
    const h = await r.text();
    const imgs = [...h.matchAll(/https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
      .map((m) => m[0])
      .filter((x) => /product|catalog|media|cdn|upload|delta|btq|thruster|argod/i.test(x));
    out.push({
      u,
      status: r.status,
      og: meta(h, "og:image"),
      title: (h.match(/<title[^>]*>([^<]+)/i) || [])[1]?.trim().slice(0, 90),
      tokens: {
        Delta: /Delta/i.test(h),
        stainless: /stainless|inox|Duplex/i.test(h),
        "40": /40\s*kg|40kg|0057340/i.test(h),
        BTQ: /BTQ\s*250|6\.5|6500|12\s*V/i.test(h),
        "80-2AC": /80-2AC/i.test(h),
      },
      imgs: [...new Set(imgs)].slice(0, 8),
    });
  } catch (e) {
    out.push({ u, err: e.message });
  }
}
fs.writeFileSync("tmp/_l10_more.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

// download previews
const downloads = [
  ["tmp/lote10-preview/delta-galv.jpg", "https://marinestore.co.uk/mm5/graphics/00000002/9/afl0057406-lewmar-delta-anchor-galvanized-800.jpg"],
  ["tmp/lote10-preview/delta-lewmar.jpg", "https://www.lewmar.com/media/catalog/product/cache/1c9ca138f77cde26968ee9db7205ceaa/n/e/new.delta.galvanised.anchor.white.1500x1500.jpg"],
  ["tmp/lote10-preview/delta-jg.jpg", "https://jimmygreen.com/app/uploads/2020/11/17751-Lewmar-Delta-Anchor-Galvanised.jpg"],
  ["tmp/lote10-preview/argodiode.png", "https://www.victronenergy.com/upload/products/158_410_20170712114447.png"],
];
for (const [path, url] of downloads) {
  spawnSync("curl.exe", ["-L", "-A", "Mozilla/5.0", "-o", path, url], { stdio: "inherit" });
}
