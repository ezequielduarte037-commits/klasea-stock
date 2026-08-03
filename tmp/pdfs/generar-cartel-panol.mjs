import fs from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";

const root = "C:/klasea-stock";
const outDir = path.join(root, "output", "pdf");
fs.mkdirSync(outDir, { recursive: true });

const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
const width = pdf.internal.pageSize.getWidth();
const height = pdf.internal.pageSize.getHeight();

const ink = [18, 29, 44];
const brand = [28, 74, 122];
const pale = [217, 231, 246];

pdf.setFillColor(250, 251, 253);
pdf.rect(0, 0, width, height, "F");

// Banda institucional: identifica quién emite el comunicado sin competir
// con el mensaje operativo.
pdf.setFillColor(...brand);
pdf.rect(0, 0, 76, height, "F");
const logoX = 38;
const logoY = 45;
pdf.setDrawColor(255, 255, 255);
pdf.setLineWidth(1.1);
pdf.circle(logoX, logoY, 15);
pdf.setLineWidth(1.6);
pdf.line(logoX - 4.5, logoY - 9, logoX - 4.5, logoY + 9);
pdf.circle(logoX - 4.5, logoY, 4.6);
pdf.line(logoX - 1.6, logoY, logoX + 9, logoY - 9);
pdf.line(logoX - 1.6, logoY, logoX + 9, logoY + 9);

pdf.setTextColor(255, 255, 255);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(12);
pdf.text("OFICINA", logoX, 148, { align: "center" });
pdf.text("TÉCNICA", logoX, 156, { align: "center" });
pdf.setFont("helvetica", "normal");
pdf.setTextColor(...pale);
pdf.setFontSize(7.7);
pdf.text("COORDINACIÓN DE", logoX, 171, { align: "center" });
pdf.text("MATERIALES", logoX, 177, { align: "center" });

const bodyX = 103;
pdf.setTextColor(...brand);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(10);
pdf.text("COMUNICADO OPERATIVO", bodyX, 37);

pdf.setTextColor(...ink);
pdf.setFontSize(42);
pdf.text("PAÑOL", bodyX, 72);
pdf.text("CERRADO", bodyX, 102);

pdf.setTextColor(...brand);
pdf.setFontSize(28);
pdf.text("Todos los días · 15 a 16 hs.", bodyX, 125);

pdf.setDrawColor(188, 204, 222);
pdf.setLineWidth(0.45);
pdf.line(bodyX, 139, width - 28, 139);

pdf.setTextColor(...ink);
pdf.setFont("helvetica", "normal");
pdf.setFontSize(15);
pdf.text("Durante este horario no se realizan entregas.", bodyX, 157);
pdf.text("Se reciben exclusivamente hojas de pedido.", bodyX, 169);

pdf.setFillColor(234, 241, 249);
pdf.roundedRect(bodyX, 181, 157, 15, 2.5, 2.5, "F");
pdf.setTextColor(...brand);
pdf.setFont("helvetica", "bold");
pdf.setFontSize(9.3);
pdf.text("URGENCIAS DE MATERIALES: CONSULTAR EN OFICINA TÉCNICA", bodyX + 78.5, 190.5, { align: "center" });

const outPath = path.join(outDir, "cartel-panol-cerrado-15-a-16.pdf");
pdf.save(outPath);
console.log(outPath);
