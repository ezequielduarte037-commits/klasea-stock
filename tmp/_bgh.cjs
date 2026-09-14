const fs=require("fs");
async function main(){
  const u="https://www.dricco.com.ar/microondas-bgh-b223ds20i-eco/p";
  const r=await fetch(u,{headers:{"user-agent":"Mozilla/5.0"}});
  const t=await r.text();
  console.log("status",r.status,"ean",t.includes("7796885495101"),"BGH",/bgh/i.test(t),"B223",/B223DS20/i.test(t));
  const imgs=[...t.matchAll(/https:\/\/[^\s\"']+\.(?:jpg|jpeg|png|webp)/gi)].map(m=>m[0]);
  const prod=imgs.filter(x=>/microondas|bgh|b223|arquivos|ids\//i.test(x));
  console.log([...new Set(prod)].slice(0,15));
  fs.writeFileSync("tmp/_bgh_imgs.json",JSON.stringify({ean:t.includes("7796885495101"),imgs:[...new Set(prod)].slice(0,20)},null,2));
}
main().catch(e=>{console.error(e);process.exit(1);});
