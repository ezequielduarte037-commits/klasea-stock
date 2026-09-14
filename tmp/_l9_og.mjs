const urls = [
  "https://tiribellihogar.com.ar/microondas-bgh-silver-digital-23-lt-011069",
  "https://tiribellihogar.com.ar/heladera-bgh-dark-inox-c-dispenser-inverter-012100",
  "https://www.hendel.com/heladera-no-frost-bgh-brt330-i2a-inox-combi.html",
  "https://palmerpower.com/perko-0577g00chr-fig-0577-2-hose-straight-neck-vented-deck-fill-gas-chrome-cap/",
];

function metaContent(html, property) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1] || m?.[2] || null;
}

for (const u of urls) {
  const r = await fetch(u, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
  const h = await r.text();
  console.log(
    JSON.stringify(
      {
        url: u,
        status: r.status,
        final: r.url,
        og: metaContent(h, "og:image"),
        title: (h.match(/<title[^>]*>([^<]+)/i)?.[1] || "").trim().slice(0, 80),
      },
      null,
      2,
    ),
  );
}
