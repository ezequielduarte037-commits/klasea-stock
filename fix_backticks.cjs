const fs = require('fs');

function fix(file) {
  let c = fs.readFileSync(file, 'utf8');
  // Remove \ before `
  c = c.replace(/\\`/g, '`');
  fs.writeFileSync(file, c);
}

fix('src/features/muebles/tabs/ProduccionTab.jsx');
fix('src/features/muebles/tabs/StockTab.jsx');
console.log("Fixed backticks");
