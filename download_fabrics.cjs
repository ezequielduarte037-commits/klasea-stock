const https = require('https');
const fs = require('fs');

const images = [
  { name: 'fabric-plata.jpg', url: 'https://images.unsplash.com/photo-1620002093390-1c5c56d7df1c?w=400&fit=crop' },
  { name: 'fabric-carbon.jpg', url: 'https://images.unsplash.com/photo-1594818898109-44704fb548f6?w=400&fit=crop' },
  { name: 'fabric-hitch.jpg', url: 'https://images.unsplash.com/photo-1582218047970-87a71a067167?w=400&fit=crop' },
  { name: 'fabric-hielo.jpg', url: 'https://images.unsplash.com/photo-1616428616480-1a76c8c45d31?w=400&fit=crop' },
  { name: 'fabric-beige.jpg', url: 'https://images.unsplash.com/photo-1582218048259-715bd5b6e22f?w=400&fit=crop' },
  { name: 'canvas-gris.jpg', url: 'https://images.unsplash.com/photo-1605648819586-1052fb58f625?w=400&fit=crop' },
  { name: 'canvas-negro.jpg', url: 'https://images.unsplash.com/photo-1597083658518-e3dfbf53b0e1?w=400&fit=crop' },
  { name: 'canvas-beige.jpg', url: 'https://images.unsplash.com/photo-1589139265147-38eebff50d88?w=400&fit=crop' }
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

Promise.all(images.map(img => new Promise((resolve, reject) => {
  https.get(img.url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
    if (res.statusCode !== 200) {
      reject(`Failed ${img.name}: ${res.statusCode}`);
      return;
    }
    const file = fs.createWriteStream(basePath + img.name);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded: ${img.name}`);
      resolve();
    });
  }).on('error', err => reject(err));
}))).then(() => console.log('All done')).catch(console.error);
