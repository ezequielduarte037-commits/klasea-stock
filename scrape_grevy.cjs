const https = require('https');

function fetchRaw(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const html = await fetchRaw('https://grevy.com.ar/categoria-producto/nautica/');
  const matches = [...html.matchAll(/src=["'](https:\/\/grevy\.com\.ar\/wp-content\/uploads\/[^\s"']+-\d+x\d+\.(?:jpg|png))["']/g)];
  const urls = matches.map(m => m[1]);
  // filter unique
  const uniqueUrls = [...new Set(urls)];
  console.log("Grevy Images:");
  uniqueUrls.slice(0, 20).forEach(u => console.log(u));
}
run();
