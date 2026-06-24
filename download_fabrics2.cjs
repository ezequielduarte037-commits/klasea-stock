const https = require('https');
const fs = require('fs');

const images = [
  // Fabrics
  { name: 'fabric-shani.jpg', url: 'https://images.unsplash.com/photo-1620002093390-1c5c56d7df1c?w=400&fit=crop' },
  { name: 'fabric-bhanu.jpg', url: 'https://images.unsplash.com/photo-1618220179428-22790b46a0eb?w=400&fit=crop' }, // White/Grey fabric
  { name: 'fabric-charcoal.jpg', url: 'https://images.unsplash.com/photo-1594818898109-44704fb548f6?w=400&fit=crop' },
  { name: 'fabric-black.jpg', url: 'https://images.unsplash.com/photo-1605648819586-1052fb58f625?w=400&fit=crop' },
  { name: 'fabric-pearl.jpg', url: 'https://images.unsplash.com/photo-1605648819586-1052fb58f625?w=400&fit=crop' }, // Same for now
  { name: 'fabric-navy.jpg', url: 'https://images.unsplash.com/photo-1618220179428-22790b46a0eb?w=400&fit=crop' }, // We'll just tint it via css if needed, or use a jeans texture
  
  // Canvas
  { name: 'canvas-black.jpg', url: 'https://images.unsplash.com/photo-1597083658518-e3dfbf53b0e1?w=400&fit=crop' },
  { name: 'canvas-charcoal.jpg', url: 'https://images.unsplash.com/photo-1594818898109-44704fb548f6?w=400&fit=crop' },
  { name: 'canvas-grey.jpg', url: 'https://images.unsplash.com/photo-1605648819586-1052fb58f625?w=400&fit=crop' },
  { name: 'canvas-white.jpg', url: 'https://images.unsplash.com/photo-1618220179428-22790b46a0eb?w=400&fit=crop' },
  { name: 'canvas-beige.jpg', url: 'https://images.unsplash.com/photo-1589139265147-38eebff50d88?w=400&fit=crop' }
];

const basePath = 'd:/proyectos/klasea-stock/src/assets/textures/';

Promise.all(images.map(img => new Promise((resolve) => {
  https.get(img.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
    if (res.statusCode !== 200) {
      console.log(`Failed ${img.name}: ${res.statusCode}`);
      resolve(); // ignore failures
      return;
    }
    const file = fs.createWriteStream(basePath + img.name);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log(`Downloaded: ${img.name}`);
      resolve();
    });
  }).on('error', err => {
    console.error(err);
    resolve();
  });
}))).then(() => console.log('All done'));
