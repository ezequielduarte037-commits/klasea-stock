const fs = require('fs');
const img = fs.readFileSync('src/assets/logos/logo-k.png');
const b64 = img.toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="#0f172a"/>
  <image href="data:image/png;base64,${b64}" x="32" y="32" width="192" height="192"/>
</svg>`;
fs.writeFileSync('public/favicon.svg', svg);
console.log("Favicon SVG created successfully!");
