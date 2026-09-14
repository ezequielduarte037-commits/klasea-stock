const fs = require("fs");
const line = fs.readFileSync("C:/Users/ezequ/.cursor/projects/c-klasea-stock/agent-transcripts/137d2a55-a107-4477-8c17-6963c577822f/137d2a55-a107-4477-8c17-6963c577822f.jsonl","utf8").split(/\n/).find(l => l.includes("hafele-24665709") || l.includes("246.65.709") && l.includes("Invoke-WebRequest"));
const hits = [];
for (const l of fs.readFileSync("C:/Users/ezequ/.cursor/projects/c-klasea-stock/agent-transcripts/137d2a55-a107-4477-8c17-6963c577822f/137d2a55-a107-4477-8c17-6963c577822f.jsonl","utf8").split(/\n/)) {
  if (!l.includes("246.65.709") && !l.includes("hafele-246") && !l.includes("24665709")) continue;
  const urls = [...l.matchAll(/https?:[^\\"\s]+246[^\\"\s]*/g)].map(m=>m[0]);
  if (urls.length) hits.push(...urls);
}
fs.writeFileSync("tmp/_hafele_urls.json", JSON.stringify([...new Set(hits)].slice(0,50), null, 2));
console.log("urls", [...new Set(hits)].slice(0,30));
