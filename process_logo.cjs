const Jimp = require('jimp');

async function processLogo() {
  const image = await Jimp.read('src/assets/logos/logo-k-cover.png');
  const bgColor = image.getPixelColor(0, 0); // Assume top-left is background

  const targetR = 0;
  const targetG = 150;
  const targetB = 255; // Bright blue

  image.scan(0, 0, image.bitmap.width, image.bitmap.height, function(x, y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];
    
    // Check if pixel is close to background color
    const bgR = Jimp.intToRGBA(bgColor).r;
    const bgG = Jimp.intToRGBA(bgColor).g;
    const bgB = Jimp.intToRGBA(bgColor).b;
    
    const dist = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
    
    if (dist < 30) {
      // It's background -> transparent
      this.bitmap.data[idx + 3] = 0; // Alpha = 0
    } else {
      // It's logo -> tint bright blue but keep intensity for anti-aliasing
      // Let's just force the color to bright blue, but keep original alpha
      this.bitmap.data[idx + 0] = targetR;
      this.bitmap.data[idx + 1] = targetG;
      this.bitmap.data[idx + 2] = targetB;
      // If it's an edge pixel, its distance is mid-range, we should probably scale alpha
      // but simple is fine for a favicon
    }
  });

  await image.writeAsync('public/favicon.png');
  console.log("Processed logo successfully!");
}

processLogo().catch(console.error);
