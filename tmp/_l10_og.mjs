function meta(html, prop) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] || m?.[2] || null;
}

const urls = [
  "https://marinestore.co.uk/lewmar-delta-anchor-galvanized-10kg-57410-j160224.html",
  "https://marinestore.co.uk/lewmar-delta-anchor-galvanized-20kg-57420-j160224.html",
  "https://www.lewmar.com/delta-galvanised-anchor",
  "https://www.victronenergy.com/battery-isolators-and-combiners/argo-diode-battery-isolators",
  "https://www.mauripro.com/products/maxp19006",
  "https://nomadicsupply.com/marinco-6361crn-50a-125v-male-shore-power-plug/",
  "https://jimmygreen.com/product/lewmar-delta-anchor-galvanised/",
  "https://www.force4.co.uk/item/Lewmar/Delta-Anchor-Galvanised/6AY",
];

for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
    const h = await r.text();
    const imgs = [...h.matchAll(/https?:\/\/[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)]
      .map((m) => m[0])
      .filter((x) => /product|catalog|media|cdn|shop|delta|anchor|argod|maxwell|marinco|lewmar/i.test(x));
    console.log(
      JSON.stringify(
        {
          u: u.slice(0, 80),
          status: r.status,
          og: meta(h, "og:image"),
          title: (h.match(/<title[^>]*>([^<]+)/i) || [])[1]?.trim().slice(0, 80),
          has10: /10\s*kg|10kg|0057410|57410/i.test(h),
          has20: /20\s*kg|20kg|0057420|57420/i.test(h),
          has80: /80-2AC|Argodiode/i.test(h),
          imgs: [...new Set(imgs)].slice(0, 6),
        },
        null,
        2,
      ),
    );
  } catch (e) {
    console.log(JSON.stringify({ u, err: e.message }));
  }
}
