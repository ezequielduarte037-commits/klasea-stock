const fs=require("fs");
const p="C:/Users/ezequ/.cursor/projects/c-klasea-stock/agent-transcripts/137d2a55-a107-4477-8c17-6963c577822f/137d2a55-a107-4477-8c17-6963c577822f.jsonl";
const lines=fs.readFileSync(p,"utf8").split(/\n/);
const out=[];
for (const l of lines) {
  if (!/246\.65\.709|24665709|hafele-246/i.test(l)) continue;
  const urls=[...l.matchAll(/https?:[^\\"'\s]+/g)].map(m=>m[0]).filter(u=>/hafele|246|herraje|magnet|reten/i.test(u));
  if (urls.length) out.push({urls: [...new Set(urls)].slice(0,20), snip: l.slice(0,200)});
}
fs.writeFileSync("tmp/_haf_scan.json", JSON.stringify(out.slice(-15),null,2));
console.log(JSON.stringify(out.slice(-8),null,2));
