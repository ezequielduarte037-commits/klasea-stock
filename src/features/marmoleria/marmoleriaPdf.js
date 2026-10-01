import { jsPDF } from "jspdf";

/**
 * Lista de piezas para pasarle a la marmolería: todo lo que tiene plantilla
 * enviada (o vuelve para rehacer), agrupado por barco y ambiente, con la piedra
 * de cada pieza.
 *
 * Se dibuja a mano en vez de con autoTable porque lo que importa acá es dónde
 * se corta la hoja: un barco no se parte si entra entero en una hoja, y si es
 * tan largo que se parte igual, la hoja siguiente repite el barco, las columnas
 * y el ambiente. Con autoTable la fila que caía sola en la hoja nueva no decía
 * de qué barco ni de qué ambiente era.
 *
 * Es la lista y nada más: sin columna de estado (eran todas "Enviado") ni
 * fecha de regreso. Lo que la marmolería necesita mirar es la piedra, así que
 * va en tinta y no en gris, y la que falta se marca "A confirmar" en rojo.
 */

const NAVY = [14, 54, 83];
const INK = [45, 48, 54];
const MUTED = [108, 117, 132];
const FAINT = [150, 157, 168];
const RULE = [214, 220, 228];
const HAIR = [233, 236, 241];
const RED = [168, 50, 63];
const RED_SOFT = [250, 236, 238];
const CYAN = [14, 116, 144];
const CYAN_SOFT = [228, 243, 247];

const MARGEN = 40;
const PIE = 46;
const ARRIBA_CONTINUACION = 46;

const SIN_PIEDRA = "A confirmar";

const limpiar = (valor) => String(valor ?? "").replace(/\s+/g, " ").trim();

const clave = (valor) =>
  limpiar(valor)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const comparar = (a, b) =>
  String(a).localeCompare(String(b), "es-AR", { sensitivity: "base", numeric: true });

const capitalizar = (texto) => (texto ? texto[0].toLocaleUpperCase("es-AR") + texto.slice(1) : texto);

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function hoyISO() {
  const hoy = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}`;
}

export function fechaLarga(iso) {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "";
}

const fechaCorta = (iso) => {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a.slice(2)}` : "—";
};

/**
 * Las piedras se cargan a mano y la misma aparece escrita de varias formas
 * ("Purastone travertino navona     " y "Purastone Travertino Navona"). En la
 * lista tiene que figurar una sola vez y siempre igual, o la marmolería cuenta
 * dos piedras donde hay una. Gana la escritura con más palabras en mayúscula y,
 * si empatan, la más usada.
 */
export function nombresDePiedra(piezas) {
  const variantes = new Map();
  for (const pieza of piezas) {
    const texto = limpiar(pieza.color);
    if (!texto) continue;
    const k = clave(texto);
    const conteo = variantes.get(k) ?? new Map();
    conteo.set(texto, (conteo.get(texto) ?? 0) + 1);
    variantes.set(k, conteo);
  }
  const mayusculas = (texto) => texto.split(" ").filter((p) => /^\p{Lu}/u.test(p)).length;
  const nombres = new Map();
  for (const [k, conteo] of variantes) {
    const [ganadora] = [...conteo.entries()].sort(
      (a, b) => mayusculas(b[0]) - mayusculas(a[0]) || b[1] - a[1],
    );
    nombres.set(k, ganadora[0]);
  }
  return nombres;
}

/**
 * Pasa las piezas sueltas a la forma de la lista: barcos > ambientes > piezas.
 * Separado del dibujo para poder probarlo.
 */
export function armarListado(piezas, { lineaDe = () => "" } = {}) {
  const piedras = nombresDePiedra(piezas);
  const porBarco = new Map();

  for (const p of piezas) {
    const codigo = limpiar(p.codigo_barco) || "Sin barco";
    const barco = porBarco.get(codigo) ?? { codigo, linea: limpiar(lineaDe(p)), piezas: [] };
    if (!barco.linea) barco.linea = limpiar(lineaDe(p));
    const prioridad = limpiar(p.prioridad);
    barco.piezas.push({
      ambiente: capitalizar(limpiar(p.sector)) || "Sin ambiente",
      pieza: capitalizar(limpiar(p.pieza)) || "Sin nombre",
      piedra: piedras.get(clave(p.color)) ?? "",
      fecha: String(p.fecha_envio || "").slice(0, 10),
      rehacer: p.estado === "Rehacer",
      opcional: !!p.opcional,
      urgencia: prioridad === "Urgente" || prioridad === "Alta" ? prioridad : "",
      observaciones: limpiar(p.observaciones),
    });
    porBarco.set(codigo, barco);
  }

  const barcos = [...porBarco.values()]
    .sort((a, b) => comparar(a.codigo, b.codigo))
    .map((barco) => {
      const porAmbiente = new Map();
      for (const pieza of barco.piezas) {
        const k = clave(pieza.ambiente);
        const ambiente = porAmbiente.get(k) ?? { nombre: pieza.ambiente, piezas: [] };
        ambiente.piezas.push(pieza);
        porAmbiente.set(k, ambiente);
      }
      const ambientes = [...porAmbiente.values()]
        .sort((a, b) => comparar(a.nombre, b.nombre))
        .map((a) => ({ ...a, piezas: a.piezas.sort((x, y) => comparar(x.pieza, y.pieza)) }));
      const fechas = [...new Set(barco.piezas.map((p) => p.fecha).filter(Boolean))].sort();
      return {
        codigo: barco.codigo,
        linea: barco.linea,
        total: barco.piezas.length,
        rehacer: barco.piezas.filter((p) => p.rehacer).length,
        fechas,
        ambientes,
      };
    });

  return { barcos, total: piezas.length };
}

/** Texto de la cabecera de cada barco: modelo, cantidad y cuándo se mandó. */
function detalleBarco(barco) {
  const partes = [];
  if (barco.linea) partes.push(barco.linea);
  partes.push(plural(barco.total, "pieza", "piezas"));
  if (barco.rehacer) partes.push(`${barco.rehacer} a rehacer`);
  const { fechas } = barco;
  if (fechas.length === 1) {
    partes.push(`plantillas enviadas el ${fechaLarga(fechas[0])}`);
  } else if (fechas.length > 1) {
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
    partes.push(
      `plantillas enviadas del ${mismoAnio ? fechaLarga(desde).slice(0, 5) : fechaLarga(desde)} al ${fechaLarga(hasta)}`,
    );
  }
  return partes.join("  ·  ");
}

/**
 * Arma el PDF y lo devuelve sin guardar.
 *
 * @param {object} opciones
 * @param {object[]} opciones.piezas  filas de marm_unidad_piezas con codigo_barco
 * @param {(pieza: object) => string} [opciones.lineaDe]  nombre del modelo (K37…)
 * @param {{dataUrl: string, aspect?: number} | null} [opciones.logo]
 * @param {string} [opciones.fecha]  ISO; por defecto hoy
 */
export function construirPdfMarmoleria({ piezas, lineaDe, logo = null, fecha = hoyISO() }) {
  const listado = armarListado(piezas, { lineaDe });
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const anchoHoja = doc.internal.pageSize.getWidth();
  const altoHoja = doc.internal.pageSize.getHeight();
  const ancho = anchoHoja - MARGEN * 2;
  const fondo = altoHoja - PIE;
  const titulo = "Piezas en marmolería";
  const hoy = fechaLarga(fecha);

  const fuente = (estilo, tam, color) => {
    doc.setFont("helvetica", estilo);
    doc.setFontSize(tam);
    doc.setTextColor(...color);
  };
  const texto = (contenido, x, y, extra = {}) => doc.text(contenido, x, y, { baseline: "top", ...extra });
  // Para renglones con tamaños distintos lado a lado: con "top" cada tamaño
  // queda a otra altura; sobre la línea de base quedan parejos.
  const renglon = (contenido, x, y, extra = {}) => doc.text(contenido, x, y, { baseline: "alphabetic", ...extra });
  const trazo = (x1, y1, x2, y2, color, grosor) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(grosor);
    doc.line(x1, y1, x2, y2);
  };
  const etiqueta = (contenido, x, y, { align } = {}) => {
    fuente("bold", 7, MUTED);
    const mayus = contenido.toUpperCase();
    const espacio = 0.6;
    // jsPDF no cuenta el espaciado entre letras al alinear a la derecha, y la
    // etiqueta se pasaba del margen: se corre a mano.
    const desde = align === "right" ? x - doc.getTextWidth(mayus) - espacio * mayus.length : x;
    texto(mayus, desde, y, { charSpace: espacio });
  };

  // ── Encabezados ─────────────────────────────────────────────────────────
  const encabezadoPrimera = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, anchoHoja, 6, "F");
    if (logo?.dataUrl) {
      const w = 26;
      doc.addImage(logo.dataUrl, "PNG", anchoHoja - MARGEN - w, 30, w, w * (logo.aspect || 1), undefined, "FAST");
    }
    fuente("bold", 19, INK);
    texto(titulo, MARGEN, 34);
    fuente("normal", 10, MUTED);
    const datos = [
      "Klase A Yachts",
      hoy,
      `${plural(listado.total, "pieza", "piezas")} en ${plural(listado.barcos.length, "barco", "barcos")}`,
    ];
    texto(datos.join("  ·  "), MARGEN, 59);
    return 88;
  };

  const encabezadoContinuacion = () => {
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, anchoHoja, 4, "F");
    fuente("bold", 8.5, NAVY);
    texto(`${titulo}  ·  ${hoy}`, MARGEN, 20);
    return ARRIBA_CONTINUACION;
  };

  const nuevaHoja = () => {
    doc.addPage();
    return encabezadoContinuacion();
  };

  let y = encabezadoPrimera();

  // ── Barcos ──────────────────────────────────────────────────────────────
  const LH = 12.5; // renglón a 10 pt
  const PAD = 6;
  const ALTO_CABECERA_BARCO = 44;

  const columnasDe = (conFecha) => {
    const ambiente = { x: MARGEN, w: conFecha ? 118 : 128 };
    const pieza = { x: ambiente.x + ambiente.w, w: conFecha ? 172 : 190 };
    const fechaCol = conFecha ? { x: MARGEN + ancho - 52, w: 52 } : null;
    const piedra = { x: pieza.x + pieza.w, w: (fechaCol ? fechaCol.x : MARGEN + ancho) - (pieza.x + pieza.w) };
    return { ambiente, pieza, piedra, fecha: fechaCol };
  };

  const marcasDe = (pieza) => {
    const marcas = [];
    if (pieza.rehacer) marcas.push({ texto: "Rehacer", color: RED, fondo: RED_SOFT });
    if (pieza.urgencia === "Urgente") marcas.push({ texto: "Urgente", color: RED, fondo: RED_SOFT });
    if (pieza.urgencia === "Alta") marcas.push({ texto: "Prioridad alta", color: CYAN, fondo: CYAN_SOFT });
    if (pieza.opcional) marcas.push({ texto: "Opcional", color: MUTED, fondo: [241, 243, 246] });
    return marcas;
  };

  /** Mide (y si `dibujar`, dibuja) una fila. Devuelve su alto. */
  const fila = (pieza, cols, { ambiente = "", dibujar = false, top = 0 } = {}) => {
    const anchoTexto = (col) => col.w - 10;

    fuente("bold", 9.5, INK);
    const lineasAmbiente = ambiente ? doc.splitTextToSize(ambiente, anchoTexto(cols.ambiente)) : [];
    fuente("normal", 10, INK);
    const lineasPieza = doc.splitTextToSize(pieza.pieza, anchoTexto(cols.pieza));
    const lineasPiedra = doc.splitTextToSize(pieza.piedra || SIN_PIEDRA, anchoTexto(cols.piedra));
    fuente("italic", 8.5, MUTED);
    const lineasObs = pieza.observaciones ? doc.splitTextToSize(pieza.observaciones, anchoTexto(cols.pieza)) : [];
    const marcas = marcasDe(pieza);

    const altoPieza = lineasPieza.length * LH + (marcas.length ? 15 : 0) + lineasObs.length * 10.5;
    const alto = PAD * 2 + Math.max(lineasAmbiente.length * LH, altoPieza, lineasPiedra.length * LH);
    if (!dibujar) return alto;

    // Todas las columnas comparten la línea de base del primer renglón.
    const base = top + PAD + 9.8;
    if (lineasAmbiente.length) {
      fuente("bold", 9.5, INK);
      renglon(lineasAmbiente, cols.ambiente.x, base, { lineHeightFactor: LH / 9.5 });
    }
    fuente("normal", 10, INK);
    renglon(lineasPieza, cols.pieza.x, base, { lineHeightFactor: LH / 10 });
    const ultima = base + (lineasPieza.length - 1) * LH;
    let siguiente = ultima + 11;
    if (marcas.length) {
      const arriba = ultima + 5;
      let x = cols.pieza.x;
      for (const marca of marcas) {
        fuente("bold", 6.8, marca.color);
        const mayus = marca.texto.toUpperCase();
        const w = doc.getTextWidth(mayus) + 0.5 * mayus.length + 8;
        doc.setFillColor(...marca.fondo);
        doc.roundedRect(x, arriba, w, 11, 2, 2, "F");
        renglon(mayus, x + 4, arriba + 7.9, { charSpace: 0.5 });
        x += w + 4;
      }
      siguiente = arriba + 11 + 9.5;
    }
    if (lineasObs.length) {
      fuente("italic", 8.5, MUTED);
      renglon(lineasObs, cols.pieza.x, siguiente, { lineHeightFactor: 10.5 / 8.5 });
    }
    if (pieza.piedra) fuente("normal", 10, INK);
    else fuente("bold", 9.5, RED);
    renglon(lineasPiedra, cols.piedra.x, base, { lineHeightFactor: LH / 10 });
    if (cols.fecha) {
      fuente("normal", 9, MUTED);
      renglon(fechaCorta(pieza.fecha), cols.fecha.x + cols.fecha.w, base, { align: "right" });
    }
    return alto;
  };

  const cabeceraBarco = (barco, cols, { continua = false } = {}) => {
    fuente("bold", 16, NAVY);
    renglon(barco.codigo, MARGEN, y + 15);
    const anchoCodigo = doc.getTextWidth(barco.codigo);
    fuente("normal", 9.5, MUTED);
    const detalle = continua
      ? "continúa"
      : doc.splitTextToSize(detalleBarco(barco), ancho - anchoCodigo - 12)[0];
    renglon(detalle, MARGEN + anchoCodigo + 10, y + 15);
    trazo(MARGEN, y + 23, MARGEN + ancho, y + 23, NAVY, 1.1);
    etiqueta("Ambiente", cols.ambiente.x, y + 32);
    etiqueta("Pieza", cols.pieza.x, y + 32);
    etiqueta("Piedra", cols.piedra.x, y + 32);
    if (cols.fecha) etiqueta("Envío", cols.fecha.x + cols.fecha.w, y + 32, { align: "right" });
    trazo(MARGEN, y + 44, MARGEN + ancho, y + 44, RULE, 0.6);
    y += ALTO_CABECERA_BARCO;
  };

  listado.barcos.forEach((barco, indice) => {
    const cols = columnasDe(barco.fechas.length > 1);
    const filas = barco.ambientes.flatMap((ambiente) =>
      ambiente.piezas.map((pieza, i) => ({ pieza, ambiente: ambiente.nombre, abre: i === 0 })),
    );
    const altos = filas.map((f) => fila(f.pieza, cols, { ambiente: f.abre ? f.ambiente : "" }));
    const altoBarco = ALTO_CABECERA_BARCO + altos.reduce((t, a) => t + a, 0);
    const espacioHojaNueva = fondo - ARRIBA_CONTINUACION;

    if (indice > 0) y += 22;
    // Entero en lo que queda de esta hoja, o entero en la siguiente. Solo si no
    // entra ni en una hoja vacía se empieza acá, y únicamente si al menos el
    // título y tres piezas quedan juntos.
    const minimo = ALTO_CABECERA_BARCO + altos.slice(0, 3).reduce((t, a) => t + a, 0);
    if (y + altoBarco > fondo && (altoBarco <= espacioHojaNueva || y + minimo > fondo)) {
      y = nuevaHoja();
    }

    cabeceraBarco(barco, cols);
    filas.forEach((f, i) => {
      let conAmbiente = f.abre;
      let alto = altos[i];
      if (y + alto > fondo) {
        y = nuevaHoja();
        cabeceraBarco(barco, cols, { continua: true });
        // En la hoja nueva el ambiente se repite: sin él la fila no dice dónde va.
        conAmbiente = true;
        alto = fila(f.pieza, cols, { ambiente: f.ambiente });
      }
      if (i > 0 && f.abre) trazo(MARGEN, y, MARGEN + ancho, y, RULE, 0.6);
      else if (i > 0 && !conAmbiente) trazo(cols.pieza.x, y, MARGEN + ancho, y, HAIR, 0.5);
      fila(f.pieza, cols, { ambiente: conAmbiente ? f.ambiente : "", dibujar: true, top: y });
      y += alto;
    });
    trazo(MARGEN, y, MARGEN + ancho, y, RULE, 0.6);
  });

  // ── Pie con "Página n de N" (recién ahora se sabe N) ───────────────────
  const hojas = doc.getNumberOfPages();
  for (let n = 1; n <= hojas; n += 1) {
    doc.setPage(n);
    fuente("normal", 7.5, FAINT);
    texto(`Klase A Yachts  ·  ${titulo}  ·  ${hoy}`, MARGEN, altoHoja - 26);
    texto(`Página ${n} de ${hojas}`, anchoHoja - MARGEN, altoHoja - 26, { align: "right" });
  }

  return doc;
}

export function nombreArchivoMarmoleria(fecha = hoyISO()) {
  return `Marmoleria-${fecha}.pdf`;
}
