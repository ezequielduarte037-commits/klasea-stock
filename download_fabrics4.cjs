const https = require('https');
const fs = require('fs');

const ids = [
  { name: 'fabric-shani.jpg', id: 'mSvwOq01dKQ' }, // light fabric
  { name: 'fabric-bhanu.jpg', id: 'g6L-XzVzY10' }, // grey fabric
  { name: 'fabric-charcoal.jpg', id: '44704fb548f6' }, // dark carbon (from previous success 1594818898109-44704fb548f6)
  { name: 'fabric-black.jpg', id: 'M-mH4U8eSgY' }, // dark fabric
  { name: 'fabric-pearl.jpg', id: 'mE7Oubn2_7s' }, // pearl/silver fabric
  { name: 'fabric-navy.jpg', id: 'Tf7KzI2zXh8' }, // blue fabric
  { name: 'canvas-black.jpg', id: 'UoO7E2vB-nQ' }, // black canvas
  { name: 'canvas-charcoal.jpg', id: '1uVYDKxVWsY' }, // charcoal canvas
  { name: 'canvas-grey.jpg', id: 'Y8lCoTRgHPE' }, // grey canvas
  { name: 'canvas-white.jpg', id: 'zE7e5oXbH5Q' }, // white canvas
  { name: 'canvas-beige.jpg', id: 'yX9eU5C1w0s' } // beige canvas
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

function download(id, dest) {
  return new Promise((resolve) => {
    // Unsplash direct download URL
    const url = `https://unsplash.com/photos/${id}/download?force=true`;
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, (res2) => {
          if (res2.statusCode !== 200) return resolve(false);
          const file = fs.createWriteStream(dest);
          res2.pipe(file);
          file.on('finish', () => { file.close(); resolve(true); });
        });
        return;
      }
      resolve(false);
    }).on('error', () => resolve(false));
  });
}

async function run() {
  for (const item of ids) {
    const success = await download(item.id, basePath + item.name);
    console.log(`${item.name}: ${success ? 'OK' : 'FAIL'}`);
  }
}
run();
