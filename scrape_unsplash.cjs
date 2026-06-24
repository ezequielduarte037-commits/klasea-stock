const https = require('https');
const fs = require('fs');

async function searchUnsplash(query) {
  return new Promise((resolve) => {
    https.get(`https://unsplash.com/s/photos/${encodeURIComponent(query)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const matches = [...data.matchAll(/https:\/\/images\.unsplash\.com\/photo-[a-zA-Z0-9\-]+[^"]+/g)];
        const urls = matches.map(m => m[0].split('?')[0] + '?w=400&fit=crop').filter((v, i, a) => a.indexOf(v) === i);
        resolve(urls);
      });
    });
  });
}

async function run() {
  const urls = await searchUnsplash('seamless fabric texture');
  console.log("Found URLs:");
  urls.slice(0, 15).forEach(u => console.log(u));
}
run();
