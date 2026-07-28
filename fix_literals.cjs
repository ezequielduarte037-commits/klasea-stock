const fs = require('fs');

function fix(file) {
  let c = fs.readFileSync(file, 'utf8');
  // Remove \ before $
  c = c.replace(/\\\$/g, '$');
  // Also remove \ before ` if any (but probably not needed since it's valid JS)
  // Wait, let's just replace the exact line to be safe.
  fs.writeFileSync(file, c);
}

fix('src/features/muebles/tabs/ProduccionTab.jsx');
fix('src/features/muebles/tabs/StockTab.jsx');
console.log("Fixed backslashes");
