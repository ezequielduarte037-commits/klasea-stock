const https = require('https');
const fs = require('fs');

function fetchJson(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { resolve(null); }
      });
    }).on('error', reject);
  });
}

function fetchRaw(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function searchImage(query) {
  // First get the vqd token
  const html = await fetchRaw(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`, { 'User-Agent': 'Mozilla/5.0' });
  const vqdMatch = html.match(/vqd=["']([^"']+)["']/);
  if (!vqdMatch) return null;
  const vqd = vqdMatch[1];

  // Search images
  const url = `https://duckduckgo.com/i.js?q=${encodeURIComponent(query)}&o=json&vqd=${vqd}&f=,,,&p=1`;
  const json = await fetchJson(url, { 'User-Agent': 'Mozilla/5.0' });
  if (json && json.results && json.results.length > 0) {
    return json.results[0].image;
  }
  return null;
}

const terms = [
  { name: 'fabric-shani.jpg', q: 'Spradling Silvertex Ice swatch texture' },
  { name: 'fabric-bhanu.jpg', q: 'Spradling Silvertex Sterling swatch texture' },
  { name: 'fabric-charcoal.jpg', q: 'Spradling Silvertex Carbon swatch texture' },
  { name: 'fabric-black.jpg', q: 'Spradling Silvertex Jet swatch texture' },
  { name: 'fabric-pearl.jpg', q: 'Spradling Silvertex Plata swatch texture' },
  { name: 'fabric-navy.jpg', q: 'Spradling Silvertex Sapphire swatch texture' },
  { name: 'canvas-black.jpg', q: 'Sunbrella Canvas Black fabric texture' },
  { name: 'canvas-charcoal.jpg', q: 'Sunbrella Canvas Charcoal fabric texture' },
  { name: 'canvas-grey.jpg', q: 'Sunbrella Canvas Heather Beige fabric texture' },
  { name: 'canvas-white.jpg', q: 'Sunbrella Canvas Natural fabric texture' },
  { name: 'canvas-beige.jpg', q: 'Sunbrella Canvas Antique Beige fabric texture' }
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

function download(url, dest) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) {
        // follow redirect?
        if(res.statusCode === 301 || res.statusCode === 302) {
          return download(res.headers.location, dest).then(resolve);
        }
        return resolve(false);
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    }).on('error', () => resolve(false));
  });
}

async function run() {
  for (const item of terms) {
    console.log(`Searching: ${item.q}`);
    const url = await searchImage(item.q);
    if (url) {
      console.log(`Found: ${url}`);
      const success = await download(url, basePath + item.name);
      console.log(`Downloaded ${item.name}: ${success}`);
    } else {
      console.log(`Failed to find ${item.name}`);
    }
    // wait 1s to avoid rate limits
    await new Promise(r => setTimeout(r, 1000));
  }
}
run();
