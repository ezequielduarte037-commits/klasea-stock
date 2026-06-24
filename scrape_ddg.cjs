const https = require('https');
const fs = require('fs');

async function searchDDG(query) {
  return new Promise((resolve) => {
    https.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // DuckDuckGo html search results contain images in <img class="result__icon__img" src="...">
        // Actually, let's search lite.duckduckgo.com or just duckduckgo image search
        const match = data.match(/src="\/\/external-content\.duckduckgo\.com\/iu\/\?u=([^&]+)/);
        if (match && match[1]) {
          resolve(decodeURIComponent(match[1]));
        } else {
          resolve(null);
        }
      });
    });
  });
}

const terms = [
  { name: 'fabric-shani.jpg', q: 'Spradling Silvertex Ice texture swatch high res' },
  { name: 'fabric-bhanu.jpg', q: 'Spradling Silvertex Sterling texture swatch' },
  { name: 'fabric-charcoal.jpg', q: 'Spradling Silvertex Carbon texture swatch' },
  { name: 'fabric-black.jpg', q: 'Spradling Silvertex Jet texture swatch' },
  { name: 'fabric-pearl.jpg', q: 'Spradling Silvertex Pearl texture swatch' },
  { name: 'fabric-navy.jpg', q: 'Spradling Silvertex Sapphire texture swatch' },
  { name: 'canvas-black.jpg', q: 'Sunbrella Canvas Black 5408-0000 texture swatch' },
  { name: 'canvas-charcoal.jpg', q: 'Sunbrella Canvas Charcoal 54048-0000 texture swatch' },
  { name: 'canvas-grey.jpg', q: 'Sunbrella Canvas Heather Beige texture swatch' },
  { name: 'canvas-white.jpg', q: 'Sunbrella Canvas Natural texture swatch' },
  { name: 'canvas-beige.jpg', q: 'Sunbrella Canvas Antique Beige texture swatch' }
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

function download(url, dest) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : require('http');
    lib.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode !== 200) return resolve(false);
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    }).on('error', () => resolve(false));
  });
}

async function run() {
  for (const item of terms) {
    console.log(`Searching: ${item.q}`);
    const url = await searchDDG(item.q);
    if (url) {
      console.log(`Found URL: ${url}`);
      const success = await download(url, basePath + item.name);
      console.log(`Downloaded ${item.name}: ${success}`);
    } else {
      console.log(`No URL found for ${item.name}`);
    }
  }
}
run();
