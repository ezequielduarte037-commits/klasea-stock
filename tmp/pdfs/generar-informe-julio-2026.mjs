import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";

const root = "C:/klasea-stock";
const source = path.join(root, "informe-julio-2026-v1.md");
const outputDir = path.join(root, "output", "pdf");
const output = path.join(outputDir, "informe-julio-2026.pdf");
fs.mkdirSync(outputDir, { recursive: true });

const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
const pageW = pdf.internal.pageSize.getWidth();
const pageH = pdf.internal.pageSize.getHeight();
const margin = 21;
const navy = [15, 35, 63];
const blue = [34, 96, 161];
const ink = [23, 32, 47];
const muted = [89, 102, 120];
let y = margin;
let page = 1;

function clean(value = "") {
  return String(value)
    .replace(/\*\*/g, "")
    .replace(/[—–]/g, "-")
    .replace(/→/g, "->")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function drawK(cx, cy, size, color) {
  pdf.setDrawColor(...color);
  pdf.setLineWidth(size * 0.07);
  pdf.circle(cx, cy, size / 2);
  pdf.setLineWidth(size * 0.095);
  pdf.line(cx - size * 0.16, cy - size * 0.30, cx - size * 0.16, cy + size * 0.30);
  pdf.circle(cx - size * 0.16, cy, size * 0.15);
  pdf.line(cx - size * 0.04, cy, cx + size * 0.30, cy - size * 0.30);
  pdf.line(cx - size * 0.04, cy, cx + size * 0.30, cy + size * 0.30);
}

function header() {
  pdf.setDrawColor(216, 225, 235);
  pdf.setLineWidth(0.35);
  pdf.line(margin, 15, pageW - margin, 15);
  drawK(margin + 4, 9.5, 6, blue);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...navy);
  pdf.setFontSize(8.5);
  pdf.text("KLASE A", margin + 10, 11.5);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...muted);
  pdf.text("Informe de trabajo - Julio 2026", pageW - margin, 11.5, { align: "right" });
}

function footer() {
  pdf.setDrawColor(216, 225, 235);
  pdf.setLineWidth(0.25);
  pdf.line(margin, pageH - 14, pageW - margin, pageH - 14);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...muted);
  pdf.setFontSize(8);
  pdf.text("Sistema de gestión del astillero", margin, pageH - 8.5);
  pdf.text(String(page), pageW - margin, pageH - 8.5, { align: "right" });
}

function newPage() {
  footer();
  pdf.addPage();
  page += 1;
  header();
  y = 27;
}

function ensure(height) {
  if (y + height <= pageH - 21) return;
  newPage();
}

function paragraph(text, { size = 10.7, color = ink, leading = 5.25, indent = 0, bold = false, gap = 4 } = {}) {
  pdf.setFont("helvetica", bold ? "bold" : "normal");
  pdf.setTextColor(...color);
  pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(clean(text), pageW - margin * 2 - indent);
  ensure(lines.length * leading + gap);
  pdf.text(lines, margin + indent, y, { lineHeightFactor: leading / (size * 0.3528) });
  y += lines.length * leading + gap;
}

function labeledParagraph(line) {
  const hit = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
  if (!hit) return paragraph(line);
  paragraph(`${hit[1]}:`, { bold: true, gap: 1.2 });
  paragraph(hit[2], { gap: 4 });
}

function heading(text, level) {
  const isSection = level === 2;
  const size = isSection ? 20 : 13.2;
  const leading = isSection ? 8 : 6;
  ensure((isSection ? 18 : 12) + leading);
  if (isSection) {
    pdf.setDrawColor(...blue);
    pdf.setLineWidth(1.1);
    pdf.line(margin, y, margin + 19, y);
    y += 8;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...navy);
  pdf.setFontSize(size);
  const lines = pdf.splitTextToSize(clean(text), pageW - margin * 2);
  pdf.text(lines, margin, y, { lineHeightFactor: leading / (size * 0.3528) });
  y += lines.length * leading + (isSection ? 8 : 4.5);
}

function bullet(text, ordered = false, number = "") {
  const marker = ordered ? `${number}.` : "-";
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...blue);
  pdf.setFontSize(10.5);
  ensure(7);
  pdf.text(marker, margin + 2, y);
  paragraph(text, { indent: 9, gap: 2.7, size: 10.5, leading: 5.15 });
}

function table(rows) {
  const leftW = 43;
  const rightW = pageW - margin * 2 - leftW;
  const rowPad = 3.2;
  rows.forEach((cells, index) => {
    const left = clean(cells[0]);
    const right = clean(cells[1]);
    pdf.setFontSize(8.8);
    const leftLines = pdf.splitTextToSize(left, leftW - rowPad * 2);
    const rightLines = pdf.splitTextToSize(right, rightW - rowPad * 2);
    const h = Math.max(leftLines.length, rightLines.length) * 4.3 + rowPad * 2;
    ensure(h + 0.5);
    pdf.setFillColor(index === 0 ? 229 : 247, index === 0 ? 236 : 249, index === 0 ? 244 : 252);
    pdf.rect(margin, y, leftW, h, "F");
    pdf.setFillColor(255, 255, 255);
    pdf.rect(margin + leftW, y, rightW, h, "F");
    pdf.setDrawColor(209, 220, 232);
    pdf.setLineWidth(0.25);
    pdf.rect(margin, y, leftW + rightW, h);
    pdf.line(margin + leftW, y, margin + leftW, y + h);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(...navy);
    pdf.text(leftLines, margin + rowPad, y + rowPad + 3.1, { lineHeightFactor: 4.3 / (8.8 * 0.3528) });
    pdf.setFont("helvetica", index === 0 ? "bold" : "normal");
    pdf.setTextColor(...ink);
    pdf.text(rightLines, margin + leftW + rowPad, y + rowPad + 3.1, { lineHeightFactor: 4.3 / (8.8 * 0.3528) });
    y += h;
  });
  y += 6;
}

function cover(title, month) {
  pdf.setFillColor(...navy);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.setFillColor(...blue);
  pdf.rect(0, 0, 8, pageH, "F");
  drawK(pageW / 2, 73, 35, [255, 255, 255]);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(25);
  const titleLines = pdf.splitTextToSize(clean(title), 148);
  pdf.text(titleLines, pageW / 2, 128, { align: "center", lineHeightFactor: 1.17 });
  pdf.setDrawColor(99, 148, 202);
  pdf.setLineWidth(0.8);
  pdf.line(pageW / 2 - 25, 157, pageW / 2 + 25, 157);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(211, 226, 243);
  pdf.setFontSize(14);
  pdf.text(clean(month), pageW / 2, 173, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("Sistema de gestión del astillero", pageW / 2, 251, { align: "center" });
}

const lines = fs.readFileSync(source, "utf8").split(/\r?\n/);
const title = (lines.find((line) => line.startsWith("# ")) || "# Informe de trabajo").slice(2);
const month = (lines.find((line) => line.startsWith("## ")) || "## Julio 2026").slice(3);
cover(title, month);
pdf.addPage();
pdf.setPage(2);
page = 2;
header();
y = 27;

let tableRows = [];
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index].trim();
  if (!line || line === "***" || line === "##") {
    if (tableRows.length) { table(tableRows); tableRows = []; }
    continue;
  }
  if (line.startsWith("|")) {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    tableRows.push(cells);
    continue;
  }
  if (tableRows.length) { table(tableRows); tableRows = []; }
  if (line.startsWith("# ")) continue;
  if (line.startsWith("## ")) {
    const value = line.slice(3);
    if (value !== month) heading(value, 2);
    continue;
  }
  if (line.startsWith("### ")) { heading(line.slice(4), 3); continue; }
  const numbered = line.match(/^(\d+)\.\s+(.+)$/);
  if (numbered) { bullet(numbered[2], true, numbered[1]); continue; }
  if (line.startsWith("* ")) { bullet(line.slice(2)); continue; }
  labeledParagraph(line);
}
if (tableRows.length) table(tableRows);
footer();
pdf.setPage(2);
header();
console.log(`tracked pages: ${page}; actual pages: ${pdf.getNumberOfPages()}`);
pdf.save(output);
console.log(output);
