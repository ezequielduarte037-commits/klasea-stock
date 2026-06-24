const https = require('https');
const fs = require('fs');

const images = [
  { name: 'fabric-shani.jpg', url: 'https://loremflickr.com/400/400/fabric,white?random=1' },
  { name: 'fabric-bhanu.jpg', url: 'https://loremflickr.com/400/400/fabric,grey?random=2' },
  { name: 'fabric-charcoal.jpg', url: 'https://loremflickr.com/400/400/fabric,dark?random=3' },
  { name: 'fabric-black.jpg', url: 'https://loremflickr.com/400/400/fabric,black?random=4' },
  { name: 'fabric-pearl.jpg', url: 'https://loremflickr.com/400/400/fabric,silver?random=5' },
  { name: 'fabric-navy.jpg', url: 'https://loremflickr.com/400/400/fabric,blue?random=6' },
  
  { name: 'canvas-black.jpg', url: 'https://loremflickr.com/400/400/canvas,black?random=7' },
  { name: 'canvas-charcoal.jpg', url: 'https://loremflickr.com/400/400/canvas,dark?random=8' },
  { name: 'canvas-grey.jpg', url: 'https://loremflickr.com/400/400/canvas,grey?random=9' },
  { name: 'canvas-white.jpg', url: 'https://loremflickr.com/400/400/canvas,white?random=10' },
  { name: 'canvas-beige.jpg', url: 'https://loremflickr.com/400/400/canvas,beige?random=11' }
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

function download(url, dest) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return download(res.headers.location, dest).then(resolve);
      }
      if (res.statusCode !== 200) {
        console.log(`Failed ${dest}: ${res.statusCode}`);
        resolve();
        return;
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded: ${dest}`);
        resolve();
      });
    }).on('error', err => {
      console.error(err);
      resolve();
    });
  });
}

Promise.all(images.map(img => download(img.url, basePath + img.name)))
  .then(() => console.log('All done'));
