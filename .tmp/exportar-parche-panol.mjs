import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = ".tmp/publicacion-instalados";
const paths = JSON.parse(readFileSync(root + "/paths.json","utf8")).filter(path => path.startsWith("src/features/panol/"));
const patch = paths.map(path => {
  const base = spawnSync("git", ["show", "HEAD:" + path], { encoding: "buffer", maxBuffer: 4 * 1024 * 1024 });
  if (base.status !== 0) throw new Error("No se pudo leer " + path);
  const temporary = root + "/original.txt";
  writeFileSync(temporary, base.stdout);
  const result = spawnSync("git", ["diff", "--no-index", "--no-color", "--", temporary, root + "/" + path], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  if (result.status !== 1) throw new Error("No se pudo preparar " + path);
  return result.stdout.replace(/^diff --git .*$/m, "diff --git a/" + path + " b/" + path)
    .replace(/^--- .*$/m, "--- a/" + path)
    .replace(/^\+\+\+ .*$/m, "+++ b/" + path);
}).join("");
writeFileSync(".tmp/panol-instalados.patch", patch);
