const COLOR = {
  navy: "17324D",
  blue: "2563EB",
  blueSoft: "DBEAFE",
  green: "15803D",
  greenSoft: "DCFCE7",
  cyan: "0891B2",
  cyanSoft: "CFFAFE",
  amber: "B45309",
  amberSoft: "FEF3C7",
  red: "B91C1C",
  redSoft: "FEE2E2",
  slate: "475569",
  slateSoft: "F1F5F9",
  border: "CBD5E1",
  white: "FFFFFF",
};

const borde = {
  top: { style: "thin", color: { rgb: COLOR.border } },
  bottom: { style: "thin", color: { rgb: COLOR.border } },
  left: { style: "thin", color: { rgb: COLOR.border } },
  right: { style: "thin", color: { rgb: COLOR.border } },
};

const estiloTitulo = {
  font: { bold: true, sz: 18, color: { rgb: COLOR.white } },
  fill: { patternType: "solid", fgColor: { rgb: COLOR.navy } },
  alignment: { vertical: "center", horizontal: "left" },
};

const estiloCabecera = {
  font: { bold: true, color: { rgb: COLOR.white } },
  fill: { patternType: "solid", fgColor: { rgb: COLOR.blue } },
  alignment: { vertical: "center", horizontal: "center", wrapText: true },
  border: borde,
};

function nombreSeguro(value) {
  return String(value || "planilla").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");
}

function aplicarEstilo(XLSX, hoja, rango, estilo) {
  const decoded = XLSX.utils.decode_range(rango);
  for (let row = decoded.s.r; row <= decoded.e.r; row += 1) {
    for (let col = decoded.s.c; col <= decoded.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (!hoja[address]) hoja[address] = { t: "s", v: "" };
      hoja[address].s = { ...(hoja[address].s || {}), ...estilo };
    }
  }
}

function estiloFilas(XLSX, hoja, desde, hasta, columnas) {
  for (let row = desde; row <= hasta; row += 1) {
    const fill = row % 2 === 0 ? COLOR.white : COLOR.slateSoft;
    for (let col = 0; col < columnas; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      if (!hoja[address]) continue;
      hoja[address].s = {
        ...(hoja[address].s || {}),
        fill: { patternType: "solid", fgColor: { rgb: fill } },
        border: borde,
        alignment: { vertical: "center", wrapText: col === 1 },
      };
      if (typeof hoja[address].v === "number") hoja[address].z = "#,##0.00";
    }
  }
}

function pintarEstado(hoja, address, tone) {
  if (!hoja[address]) return;
  const palette = tone === "green"
    ? [COLOR.green, COLOR.greenSoft]
    : tone === "cyan"
      ? [COLOR.cyan, COLOR.cyanSoft]
      : tone === "amber"
        ? [COLOR.amber, COLOR.amberSoft]
        : [COLOR.red, COLOR.redSoft];
  hoja[address].s = {
    ...(hoja[address].s || {}),
    font: { bold: true, color: { rgb: palette[0] } },
    fill: { patternType: "solid", fgColor: { rgb: palette[1] } },
  };
}

function origenLabel(fila) {
  const labels = { matriz: "Matriz", opcional: "Configuración", adicional: "Adicional", panol: "Desde pañol", fuera_matriz: "A revisar" };
  return (fila.origenes || []).map((origen) => labels[origen] || origen).join(" + ");
}

export async function exportarPlanillaXlsx({
  linea,
  obraSeleccionada,
  obras,
  grupos,
  cantidadComprar,
  catalogo = [],
}) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const filas = grupos.flatMap((grupo) => grupo.filas.map((fila) => ({ grupo: grupo.nombre, fila })));
  const catalogoPorId = new Map(catalogo.map((material) => [material.id, material]));
  const fecha = new Date();
  const alcance = obraSeleccionada?.codigo || "Todas las obras activas";

  const totalPendientes = filas.filter(({ fila }) => obras.some((obra) => Number(fila.porObra[obra.id]?.pendiente || 0) > 0)).length;
  const totalComprar = filas.filter(({ fila }) => Number(cantidadComprar(fila) || 0) > 0).length;
  const totalDefinir = filas.reduce((total, { fila }) => total + obras.filter((obra) => {
    const celda = fila.porObra[obra.id];
    return celda?.requiereProductoConcreto && !celda.productoDefinido;
  }).length, 0);

  const resumen = [
    [`PLANILLA DE ABASTECIMIENTO · ${linea}`],
    ["Alcance", alcance, "Exportado", fecha],
    [],
    ["Indicador", "Cantidad"],
    ["Materiales visibles", filas.length],
    ["Obras incluidas", obras.length],
    ["Materiales con faltantes", totalPendientes],
    ["Materiales que requieren compra", totalComprar],
    ["Productos matriz por definir", totalDefinir],
  ];
  const hojaResumen = XLSX.utils.aoa_to_sheet(resumen, { cellDates: true });
  hojaResumen["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
  hojaResumen["!cols"] = [{ wch: 34 }, { wch: 22 }, { wch: 28 }, { wch: 58 }];
  hojaResumen["!rows"] = [{ hpt: 30 }, { hpt: 21 }];
  aplicarEstilo(XLSX, hojaResumen, "A1:D1", estiloTitulo);
  aplicarEstilo(XLSX, hojaResumen, "A4:B4", estiloCabecera);
  XLSX.utils.book_append_sheet(workbook, hojaResumen, "Resumen");

  const cabeceraVista = ["Grupo", "Material", "Código", "Origen", "Unidad", "Stock libre", "Reservado", "A comprar"];
  for (const obra of obras) cabeceraVista.push(`${obra.codigo} necesita`, `${obra.codigo} entregado`, `${obra.codigo} en pañol`, `${obra.codigo} faltante`);
  const vista = [
    [`PLANILLA ${linea} · ${alcance}`],
    ["Exportado", fecha],
    [],
    cabeceraVista,
    ...filas.map(({ grupo, fila }) => [
      grupo,
      fila.descripcion,
      fila.codigo || "",
      origenLabel(fila),
      fila.unidad,
      Number(fila.enPanolLibre || 0),
      Number(fila.reservado || 0),
      Number(cantidadComprar(fila) || 0),
      ...obras.flatMap((obra) => {
        const celda = fila.porObra[obra.id];
        return celda ? [celda.requerido, celda.egresado, celda.enPanol, celda.pendiente] : ["No lleva", "", "", ""];
      }),
    ]),
  ];
  const hojaVista = XLSX.utils.aoa_to_sheet(vista, { cellDates: true });
  hojaVista["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: cabeceraVista.length - 1 } }];
  hojaVista["!cols"] = [
    { wch: 22 }, { wch: 44 }, { wch: 16 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ...obras.flatMap(() => [{ wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]),
  ];
  hojaVista["!autofilter"] = { ref: `A4:${XLSX.utils.encode_col(cabeceraVista.length - 1)}${vista.length}` };
  hojaVista["!freeze"] = { xSplit: 2, ySplit: 4, topLeftCell: "C5", activePane: "bottomRight", state: "frozen" };
  aplicarEstilo(XLSX, hojaVista, `A1:${XLSX.utils.encode_col(cabeceraVista.length - 1)}1`, estiloTitulo);
  aplicarEstilo(XLSX, hojaVista, `A4:${XLSX.utils.encode_col(cabeceraVista.length - 1)}4`, estiloCabecera);
  estiloFilas(XLSX, hojaVista, 4, vista.length - 1, cabeceraVista.length);
  XLSX.utils.book_append_sheet(workbook, hojaVista, "Vista por obra");

  const detalleHeader = ["Rubro", "Proveedor", "Material", "Código", "Origen", "Obra", "Necesita", "Base matriz", "Ajuste configuración", "Detalle configuración", "Entregado", "En pañol", "Faltante", "Unidad", "Stock libre", "Producto matriz", "Producto asignado"];
  const detalleRows = filas.flatMap(({ fila }) => obras.flatMap((obra) => {
    const celda = fila.porObra[obra.id];
    if (!celda) return [];
    const producto = celda.productoMaterialId ? catalogoPorId.get(celda.productoMaterialId) : null;
    return [[
      fila.rubro,
      fila.proveedor || "Sin proveedor",
      fila.descripcion,
      fila.codigo || "",
      origenLabel(fila),
      obra.codigo,
      celda.requerido,
      celda.baseRequerido ?? celda.requerido,
      celda.ajusteConfiguracion || 0,
      (celda.configuraciones || []).map((item) => `${item.nombre}: ${item.delta > 0 ? "+" : ""}${item.delta}`).join(" · "),
      celda.egresado,
      celda.enPanol,
      celda.pendiente,
      fila.unidad,
      fila.enPanolLibre,
      celda.requiereProductoConcreto ? (celda.productoDefinido ? "Definido" : "Falta definir") : "Producto directo",
      producto?.descripcion || "",
    ]];
  }));
  const detalle = [[`DETALLE AUDITABLE · ${linea}`], ["Alcance", alcance, "Exportado", fecha], [], detalleHeader, ...detalleRows];
  const hojaDetalle = XLSX.utils.aoa_to_sheet(detalle, { cellDates: true });
  hojaDetalle["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: detalleHeader.length - 1 } }];
  hojaDetalle["!cols"] = [{ wch: 20 }, { wch: 24 }, { wch: 42 }, { wch: 16 }, { wch: 20 }, { wch: 13 }, { wch: 11 }, { wch: 12 }, { wch: 15 }, { wch: 42 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 40 }];
  hojaDetalle["!autofilter"] = { ref: `A4:Q${detalle.length}` };
  hojaDetalle["!freeze"] = { xSplit: 3, ySplit: 4, topLeftCell: "D5", activePane: "bottomRight", state: "frozen" };
  aplicarEstilo(XLSX, hojaDetalle, "A1:Q1", estiloTitulo);
  aplicarEstilo(XLSX, hojaDetalle, "A4:Q4", estiloCabecera);
  estiloFilas(XLSX, hojaDetalle, 4, detalle.length - 1, detalleHeader.length);
  for (let index = 0; index < detalleRows.length; index += 1) {
    const excelRow = index + 5;
    const row = detalleRows[index];
    if (Number(row[10]) > 0) pintarEstado(hojaDetalle, `K${excelRow}`, "green");
    if (Number(row[11]) > 0) pintarEstado(hojaDetalle, `L${excelRow}`, "cyan");
    if (Number(row[12]) > 0) pintarEstado(hojaDetalle, `M${excelRow}`, "red");
    if (row[15] === "Falta definir") pintarEstado(hojaDetalle, `P${excelRow}`, "amber");
  }
  XLSX.utils.book_append_sheet(workbook, hojaDetalle, "Detalle");

  const definicionesRows = filas.flatMap(({ grupo, fila }) => obras.flatMap((obra) => {
    const celda = fila.porObra[obra.id];
    if (!celda?.requiereProductoConcreto || celda.productoDefinido) return [];
    return [[obra.codigo, grupo, fila.descripcion, fila.codigo || "", celda.requerido, fila.unidad, "Falta definir producto"]];
  }));
  if (definicionesRows.length) {
    const definicionesHeader = ["Obra", "Rubro / grupo", "Ítem matriz", "Código", "Cantidad", "Unidad", "Acción"];
    const definiciones = [
      [`PRODUCTOS MATRIZ POR DEFINIR · ${linea}`],
      ["Alcance", alcance, "Exportado", fecha],
      [],
      definicionesHeader,
      ...definicionesRows,
    ];
    const hojaDefiniciones = XLSX.utils.aoa_to_sheet(definiciones, { cellDates: true });
    hojaDefiniciones["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: definicionesHeader.length - 1 } }];
    hojaDefiniciones["!cols"] = [{ wch: 14 }, { wch: 24 }, { wch: 46 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 26 }];
    hojaDefiniciones["!autofilter"] = { ref: `A4:G${definiciones.length}` };
    hojaDefiniciones["!freeze"] = { ySplit: 4, topLeftCell: "A5", activePane: "bottomLeft", state: "frozen" };
    aplicarEstilo(XLSX, hojaDefiniciones, "A1:G1", estiloTitulo);
    aplicarEstilo(XLSX, hojaDefiniciones, "A4:G4", estiloCabecera);
    estiloFilas(XLSX, hojaDefiniciones, 4, definiciones.length - 1, definicionesHeader.length);
    for (let index = 0; index < definicionesRows.length; index += 1) {
      pintarEstado(hojaDefiniciones, `G${index + 5}`, "amber");
    }
    XLSX.utils.book_append_sheet(workbook, hojaDefiniciones, "Productos por definir");
  }

  workbook.Props = {
    Title: `Planilla de abastecimiento ${linea}`,
    Subject: alcance,
    Author: "Klase A",
    CreatedDate: fecha,
  };
  const fechaArchivo = fecha.toISOString().slice(0, 10);
  const filename = `Planilla_${nombreSeguro(linea)}_${nombreSeguro(obraSeleccionada?.codigo || "todas")}_${fechaArchivo}.xlsx`;
  const output = XLSX.write(workbook, { type: "array", bookType: "xlsx", compression: true, cellStyles: true });
  if (typeof document !== "undefined") {
    const blob = new Blob([output], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
  return { filename, materiales: filas.length, detalle: detalleRows.length, bytes: output.byteLength };
}
