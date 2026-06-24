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
  const html = await fetchRaw('https://grevy.com.ar/');
  const matches = [...html.matchAll(/href=["']([^"']+\/categoria[^\/"']*\/[^\/"']+\/)["']/g)];
  const urls = [...new Set(matches.map(m => m[1]))];
  console.log("Grevy Categories:");
  urls.forEach(u => console.log(u));
}
run();
