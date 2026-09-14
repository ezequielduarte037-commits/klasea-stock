async function check(url, tokens) {
  const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0" }, redirect: "follow" });
  const h = await r.text();
  const missing = tokens.filter((t) => !h.toLowerCase().includes(t.toLowerCase()));
  const og =
    (h.match(/property=["']og:image["'][^>]*content=["']([^"']+)/i) ||
      h.match(/content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
      [])[1] || null;
  console.log(JSON.stringify({ url, status: r.status, missing, og }, null, 2));
}

await check("https://jimmygreen.com/product/lewmar-delta-anchor-stainless-steel/", [
  "Delta",
  "Stainless",
  "40",
]);
await check(
  "https://damarine.com.cy/products/dc-thruster-btq-250-o-250-mm-double-counter-rotating-propellers-boat-length-from-13-21-m/",
  ["Quick", "BTQ", "250", "6.5", "12"],
);
await check("https://marinestore.co.uk/lewmar-delta-anchor-galvanized-10kg-57410-j160224.html", [
  "Delta",
  "10",
  "Galvanized",
]);
