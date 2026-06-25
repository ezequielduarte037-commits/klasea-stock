const fs = require('fs');

async function createSvg() {
  const img = fs.readFileSync('src/assets/logos/logo-k-cover.png');
  const b64 = img.toString('base64');
  
  // This SVG embeds the original logo but forces it to be a bright "azulcito" (#0088ff)
  // using an SVG filter that replaces the original color but keeps the alpha channel.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <filter id="azulcito">
      <!-- Mapea cualquier pixel opaco a azul brillante (R=0, G=0.5, B=1) -->
      <feColorMatrix type="matrix" values="
        0 0 0 0 0.0
        0 0 0 0 0.53
        0 0 0 0 1.0
        0 0 0 1 0" />
    </filter>
  </defs>
  <image href="data:image/png;base64,${b64}" width="256" height="256" filter="url(#azulcito)"/>
</svg>`;

  fs.writeFileSync('public/favicon.svg', svg);
  console.log("SVG created with blue filter!");
}

createSvg().catch(console.error);
