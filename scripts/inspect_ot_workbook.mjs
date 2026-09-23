import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const [inputPath, previewDir] = process.argv.slice(2);
if (!inputPath || !previewDir) {
  throw new Error("Usage: inspect_ot_workbook.mjs <input.xlsx> <preview-dir>");
}

await fs.mkdir(previewDir, { recursive: true });
const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({
  kind: "workbook,sheet,table,definedName,drawing",
  maxChars: 12000,
  tableMaxRows: 12,
  tableMaxCols: 14,
  tableMaxCellChars: 120,
});
console.log("=== OVERVIEW ===");
console.log(overview.ndjson);

const sheets = workbook.worksheets.items;
for (const sheet of sheets) {
  const used = sheet.getUsedRange();
  console.log(`=== SHEET ${sheet.name} USED ${used?.address ?? "none"} ===`);
  if (used) {
    const region = await workbook.inspect({
      kind: "table,formula,computedStyle",
      sheetId: sheet.name,
      range: used.address,
      maxChars: 14000,
      tableMaxRows: 80,
      tableMaxCols: 20,
      tableMaxCellChars: 160,
      options: { maxResults: 200 },
    });
    console.log(region.ndjson);
  }

  const preview = await workbook.render({
    sheetName: sheet.name,
    autoCrop: "all",
    scale: 1.5,
    format: "png",
  });
  const safeName = sheet.name.replace(/[<>:"/\\|?*]/g, "_");
  await fs.writeFile(`${previewDir}/${safeName}.png`, new Uint8Array(await preview.arrayBuffer()));
}
