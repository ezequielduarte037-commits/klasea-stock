// Hojas de la memoria para imprimir y pegar en el pizarrón del galpón (van
// varias en fila, una por barco de la línea).
//
// Se leen de lejos: el número de barco grande, la fecha de actualización a la
// vista, cada definición en una ficha con su muestra, lo que falta definir bien
// marcado, los equipos con tilde y los adicionales con una casilla para tildar
// a mano cuando se colocan. Lo que viene de serie no se imprime (es igual en
// todos los barcos de la línea), salvo que este barco lo cambie. Una hoja A4
// vertical por barco; funciona en blanco y negro.
import logoK from "@/assets/logos/logo-k.png";
import { SECCIONES, avanceDe, cambioDeSerie, estaDefinido, modeloDeObra } from "./campos";
import { mostrar } from "./decisiones";
import { traerAdicionalesObra, traerExclusionesObra, traerOpcionesLinea } from "./memoriasApi";

function esc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Las muestras usan rutas del sitio ("url(/assets/…)"); la ventana nueva las
// necesita completas.
function absoluta(tex) {
  return String(tex || "").replace(/url\((['"]?)(\/[^)'"]+)\1\)/g, (_, q, ruta) => `url(${q}${window.location.origin}${ruta}${q})`);
}

function precargar(texs) {
  const urls = [...new Set(texs.flatMap((t) => [...String(t || "").matchAll(/url\((['"]?)([^)'"]+)\1\)/g)].map((m) => m[2])))];
  return Promise.race([
    Promise.all(urls.map((u) => new Promise((ok) => { const img = new Image(); img.onload = ok; img.onerror = ok; img.src = u; }))),
    new Promise((ok) => setTimeout(ok, 2500)),
  ]);
}

const SI = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const NO = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';

const CSS = `
  @page { size: A4; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body {
    font-family: "Outfit", "Segoe UI", system-ui, sans-serif; color: #0f172a; font-size: 10.5pt; line-height: 1.3;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .mono { font-family: "JetBrains Mono", ui-monospace, monospace; }
  .hoja { width: 192mm; break-after: page; }
  .hoja:last-child { break-after: auto; }
  @media screen { body { background: #e2e8f0; padding: 14mm 0; } .hoja { margin: 0 auto 26mm; background: #fff; outline: 9mm solid #fff; box-shadow: 0 0 0 9mm #fff, 0 4px 22px 9mm rgba(15,23,42,.14); } }

  .banda { display: flex; align-items: center; gap: 10px; padding: 1.5mm 3.5mm; border-radius: 2.5mm; background: #0f172a; color: #fff; }
  .banda img { height: 5mm; }
  .banda .t { font-size: 7.5pt; font-weight: 600; letter-spacing: .24em; text-transform: uppercase; }
  .banda .f { margin-left: auto; font-size: 8pt; font-weight: 600; }
  .banda .f span { opacity: .7; font-weight: 500; }

  .portada { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 7mm; align-items: end; padding: 3.5mm 1mm 3mm; border-bottom: 2px solid #0f172a; }
  .codigo { font-size: 46pt; font-weight: 700; letter-spacing: -.04em; line-height: .86; }
  .linea { margin-top: 2mm; display: inline-block; padding: .5mm 2.6mm; border: 1.3px solid #0f172a; border-radius: 99px; font-size: 8.5pt; font-weight: 600; }
  .cliente { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1.2mm 4mm; align-items: baseline; }
  .cliente dt { font-size: 6.5pt; font-weight: 600; letter-spacing: .16em; text-transform: uppercase; color: #64748b; }
  .cliente dd { margin: 0; font-size: 12pt; font-weight: 700; line-height: 1.15; }
  .cliente dd.vacio { height: 5.5mm; border-bottom: 1px solid #94a3b8; }

  .estado { display: flex; align-items: center; gap: 4mm; margin-top: 2.4mm; }
  .barra { flex: 0 0 42mm; height: 2mm; border-radius: 99px; background: #e2e8f0; overflow: hidden; }
  .barra i { display: block; height: 100%; background: #0f172a; border-radius: inherit; }
  .estado .txt { font-size: 8.5pt; font-weight: 600; }
  .marca-falta { display: inline-block; width: 3.4mm; height: 3.4mm; margin: 0 .5mm 0 1mm; vertical-align: -.5mm; border: 1.4px dashed #64748b; border-radius: .8mm; background: repeating-linear-gradient(135deg, #fff 0 1mm, #e2e8f0 1mm 2mm); }

  section { margin-top: 3mm; break-inside: avoid; }
  h2 { display: flex; align-items: center; gap: 3mm; margin: 0 0 1.5mm; font-size: 8pt; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
  h2::after { content: ""; flex: 1; height: 1.5px; background: #0f172a; }
  h2 small { font-size: 7.5pt; font-weight: 600; letter-spacing: .08em; color: #64748b; text-transform: none; order: 2; }

  .celdas { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1.5mm; }
  .celda { display: flex; align-items: center; gap: 2.2mm; min-height: 10.5mm; padding: 1.4mm 2.2mm; border: 1.2px solid #cbd5e1; border-radius: 2mm; break-inside: avoid; }
  .celda.ancha { grid-column: span 2; }
  .celda.toda { grid-column: 1 / -1; }
  .celda .sw { width: 8mm; height: 8mm; flex-shrink: 0; border-radius: 1.6mm; border: 1px solid #94a3b8; }
  .celda .tx { min-width: 0; }
  .celda .et { line-height: 1.15; font-size: 6.5pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  .celda .va { margin-top: .4mm; font-size: 10.5pt; font-weight: 700; line-height: 1.2; white-space: pre-line; }
  .celda.lista .va { font-size: 9pt; font-weight: 600; line-height: 1.3; }
  .celda .sub { margin-top: .4mm; font-size: 8.5pt; font-weight: 600; color: #334155; }
  .celda .nota { margin-top: .4mm; font-size: 8pt; color: #475569; font-style: italic; }
  .celda.pendiente { align-items: stretch; min-height: 13mm; border: 1.3px dashed #64748b; }
  .celda.pendiente .tx { display: flex; flex-direction: column; flex: 1; }
  .renglon { flex: 1; min-height: 5.5mm; border-bottom: 1px solid #94a3b8; }
  .celda.no .va { color: #64748b; font-weight: 600; }
  .celda.serie { background: #f8fafc; }
  .lugares { display: grid; gap: .8mm; margin-top: .6mm; }
  .lugar { display: grid; grid-template-columns: 15mm 5mm minmax(0, 1fr); align-items: end; gap: 2mm; font-size: 9.5pt; font-weight: 700; }
  .lugar small { font-size: 7.5pt; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: #64748b; }
  .lugar .sw { width: 5mm; height: 5mm; border-radius: 1mm; border: 1px solid #94a3b8; }
  .lugar em { display: block; height: 4.5mm; border-bottom: 1px solid #94a3b8; }

  .grupo-eq { display: grid; grid-template-columns: 32mm minmax(0, 1fr); gap: 3mm; align-items: start; padding: 1.2mm 0; border-bottom: 1px solid #e2e8f0; }
  .grupo-eq:last-child { border-bottom: 0; }
  .grupo-eq .rot { padding-top: 1.2mm; font-size: 6.5pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #64748b; }
  .chips { display: flex; flex-wrap: wrap; gap: 1.3mm; }
  .chip { display: inline-flex; align-items: center; gap: 1.4mm; padding: .6mm 2.6mm; border: 1.2px solid #0f172a; border-radius: 99px; font-size: 9pt; font-weight: 600; }
  .chip.serie { border-color: #cbd5e1; background: #f1f5f9; }
  .chip.fuera { border-style: dashed; border-color: #94a3b8; color: #64748b; text-decoration: line-through; }
  .chip.vacio { border-style: dashed; border-color: #94a3b8; color: #94a3b8; }
  .chip.vacio::before { content: ""; width: 3.2mm; height: 3.2mm; border: 1.4px solid #94a3b8; border-radius: .8mm; }

  .notas { padding: 1.6mm 2.6mm; border-left: 3px solid #0f172a; background: #f8fafc; font-size: 9pt; white-space: pre-line; margin-bottom: 2.2mm; }
  section.larga { break-inside: auto; }
  table.adic.dos td.sep, table.adic.dos th.sep { width: 5mm; border: 0; }
  table.adic.dos { font-size: 8.5pt; }
  tr.sigue th { padding: 0 0 1mm; border: 0; font-size: 8pt; color: #0f172a; letter-spacing: .1em; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  th { padding: 1.2mm 2mm; border-bottom: 1.5px solid #0f172a; font-size: 7pt; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: #64748b; text-align: left; }
  td { padding: 1.1mm 1.8mm; border-bottom: 1px solid #e2e8f0; vertical-align: middle; }
  tr { break-inside: avoid; }
  td.caja { width: 7mm; }
  td.caja i { display: block; width: 4mm; height: 4mm; border: 1.5px solid #0f172a; border-radius: .8mm; }
  td.cant { width: 10mm; text-align: right; font-weight: 700; }
  td.est { width: 24mm; font-size: 8.5pt; font-weight: 600; color: #475569; }
  td.est.ok { color: #0f172a; }

  .amano { margin-top: 3mm; }
  .amano .renglones { background: repeating-linear-gradient(to bottom, transparent 0 7.4mm, #94a3b8 7.4mm 7.6mm); min-height: 15mm; }
  .pie { display: flex; justify-content: flex-end; gap: 6mm; margin-top: 2mm; padding-top: 2mm; border-top: 1px solid #cbd5e1; font-size: 8pt; color: #64748b; }
`;

function celda(campo, datos, linea, clases = "") {
  const v = mostrar(campo, datos[campo.key], linea);
  const nota = campo.serie ? "" : String(datos[`${campo.key}_obs`] || "").trim();
  const et = `<div class="et">${esc(campo.label)}</div>`;
  if (v.estado === "vacio") return `<div class="celda pendiente ${clases}"><div class="tx">${et}<div class="renglon"></div></div></div>`;
  if (v.filas) {
    const filas = v.filas.map((f) => `<div class="lugar"><small>${esc(f.label)}</small>${f.tex ? `<span class="sw" style="background:${esc(absoluta(f.tex))}"></span>` : "<span></span>"}${f.texto ? esc(f.texto) : "<em></em>"}</div>`).join("");
    return `<div class="celda ancha ${clases}"><div class="tx" style="flex:1">${et}<div class="lugares">${filas}</div>${nota ? `<div class="nota">${esc(nota)}</div>` : ""}</div></div>`;
  }
  const sw = v.tex ? `<span class="sw" style="background:${esc(absoluta(v.tex))}"></span>` : "";
  const estado = v.estado === "no" ? "no" : v.estado === "serie" ? "serie" : "";
  const texto = v.estado === "no" ? `${NO} ${esc(v.texto)}` : esc(v.texto);
  return `<div class="celda ${estado} ${clases}">${sw}<div class="tx">${et}<div class="va">${texto}</div>${v.sub ? `<div class="sub">${esc(v.sub)}</div>` : ""}${nota ? `<div class="nota">${esc(nota)}</div>` : ""}</div></div>`;
}

function seccionEquipos(campos, datos, linea, excluidos, opciones) {
  const preguntar = campos.filter((c) => !c.serie && !c.opcion && (!c.extra || estaDefinido(c, datos[c.key])));
  const bloques = [];
  // De lo de serie sólo lo que cambia en este barco (otro modelo, no lo lleva).
  const cambios = campos.filter((c) => c.serie).map((c) => {
    const cambio = cambioDeSerie(c, datos);
    const fuera = (c.serieId && excluidos?.has(c.serieId)) || /^\s*no lleva\s*$/i.test(cambio || "");
    if (fuera) return `<span class="chip fuera">${NO} ${esc(c.label)}</span>`;
    return cambio ? `<span class="chip">${esc(c.label)}: <b>${esc(cambio)}</b></span>` : null;
  }).filter(Boolean);
  if (cambios.length) {
    bloques.push(`<div class="grupo-eq"><div class="rot">Cambia sobre lo de serie</div><div class="chips">${cambios.join("")}</div></div>`);
  }
  // De las opciones de la línea, sólo lo que difiere de lo de serie.
  const suma = (opciones || []).filter((o) => o.activo && !o.porDefecto);
  const saca = (opciones || []).filter((o) => !o.activo && o.porDefecto);
  if (suma.length || saca.length) {
    bloques.push(`<div class="grupo-eq"><div class="rot">Opciones de la ${esc(linea)}</div><div class="chips">${[
      ...suma.map((o) => `<span class="chip">${SI} ${esc(o.nombre)}</span>`),
      ...saca.map((o) => `<span class="chip fuera">${NO} ${esc(o.nombre)}</span>`),
    ].join("")}</div></div>`);
  }
  if (preguntar.length) {
    bloques.push(`<div class="grupo-eq"><div class="rot">Pedidos para este barco</div><div class="chips">${preguntar.map((c) => {
      const v = datos[c.key];
      if (v === true) return `<span class="chip">${SI} ${esc(c.label)}${datos[`${c.key}_obs`] ? ` · ${esc(datos[`${c.key}_obs`])}` : ""}</span>`;
      if (v === false) return `<span class="chip fuera">${NO} ${esc(c.label)}</span>`;
      return `<span class="chip vacio">${esc(c.label)}</span>`;
    }).join("")}</div></div>`);
  }
  return bloques.join("");
}

function seccionAdicionales(datos, adicionales) {
  const partes = [];
  const notas = String(datos.adicionales || "").trim();
  if (notas) partes.push(`<div class="notas">${esc(notas)}</div>`);
  if (adicionales.length) {
    // Con muchos, dos por renglón (se leen en columna). Si la lista sigue en
    // otra hoja, se repiten los títulos de la tabla.
    const cols = adicionales.length > 8 ? 2 : 1;
    const mitad = Math.ceil(adicionales.length / cols);
    const item = (a) => a ? `<td class="caja"><i></i></td>
        <td>${esc(a.descripcion)}${a.tipo === "opcional" ? ' <small style="color:#64748b">(opcional)</small>' : ""}</td>
        <td class="cant mono">${esc(a.cantidad || 1)}</td>
        <td class="est${a.estado.tono === "verde" ? " ok" : ""}">${esc(a.estado.label)}</td>` : '<td colspan="4"></td>';
    const cabeza = '<th></th><th>Adicional</th><th style="text-align:right">Cant.</th><th>Estado</th>';
    const filas = Array.from({ length: mitad }, (_, i) => `<tr>${item(adicionales[i])}${cols === 2 ? `<td class="sep"></td>${item(adicionales[i + mitad])}` : ""}</tr>`).join("");
    partes.push(`<table class="adic${cols === 2 ? " dos" : ""}">
      <thead>
        <tr>${cabeza}${cols === 2 ? `<th class="sep"></th>${cabeza}` : ""}</tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>`);
  }
  return partes.join("");
}

// Lo que la hoja necesita además de la memoria: adicionales de la obra,
// opciones de la línea y materiales sacados de su lista.
async function extrasDe(obra, excluidos) {
  const [adic, opc, exc] = await Promise.allSettled([
    traerAdicionalesObra(obra.id),
    traerOpcionesLinea(modeloDeObra(obra), obra.id),
    excluidos ? Promise.resolve(excluidos) : traerExclusionesObra(obra.id),
  ]);
  return {
    adicionales: adic.status === "fulfilled" ? adic.value : [],
    opciones: opc.status === "fulfilled" ? opc.value.opciones : [],
    excluidos: exc.status === "fulfilled" ? exc.value : new Set(),
  };
}

function texsDe(campos, datos, linea) {
  return campos.map((c) => mostrar(c, datos[c.key], linea)).flatMap((v) => [v.tex, ...(v.filas || []).map((f) => f.tex)]).filter(Boolean).map(absoluta);
}

function fecha(valor) {
  return new Date(valor).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function armarHoja({ obra, linea, campos, datos, excluidos, adicionales, opciones, actualizada, quien }) {
  const avance = avanceDe(campos, datos);
  const bloques = [];
  for (const seccion of SECCIONES) {
    if (seccion.key === "cliente" || seccion.key === "loneria") continue;
    const juntas = seccion.key === "tapiceria" ? ["tapiceria", "loneria"] : [seccion.key];
    const titulo = seccion.key === "tapiceria" ? "Tapicería y lonería" : seccion.label;
    const propios = campos.filter((c) => juntas.includes(c.seccion));
    if (seccion.key === "equipos") {
      const html = seccionEquipos(propios, datos, linea, excluidos, opciones);
      if (html) bloques.push(`<section><h2>${esc(seccion.label)}</h2>${html}</section>`);
      continue;
    }
    if (seccion.key === "adicionales") {
      const html = seccionAdicionales(datos, adicionales);
      if (html) bloques.push(`<section class="larga"><h2>Adicionales</h2>${html}</section>`);
      continue;
    }
    const visibles = propios.filter((c) => (!c.extra || estaDefinido(c, datos[c.key])) && mostrar(c, datos[c.key], linea).estado !== "serie");
    if (!visibles.length) continue;
    const celdas = visibles.map((c) => celda(c, datos, linea, c.tipo === "lista" ? "lista" : "")).join("");
    bloques.push(`<section><h2>${esc(titulo)}</h2><div class="celdas">${celdas}</div></section>`);
  }

  const dato = (titulo, valor) => `<dt>${titulo}</dt><dd class="${valor ? "" : "vacio"}">${valor ? esc(valor) : ""}</dd>`;
  const hoy = fecha(Date.now());
  const cuando = actualizada ? fecha(actualizada) : null;
  const pct = avance.total ? Math.round((avance.hechos / avance.total) * 100) : 0;

  return `<div class="hoja">
    <div class="banda"><img src="${esc(window.location.origin + logoK)}" alt="Klase A"><span class="t">Memoria descriptiva</span><span class="f">${cuando ? `Actualizada el ${cuando}${quien ? ` <span>· ${esc(quien)}</span>` : ""}` : "Sin cambios cargados"}</span></div>
    <div class="portada">
      <div>
        <div class="codigo mono">${esc(obra.codigo)}</div>
        <span class="linea">${esc(linea)}</span>
      </div>
      <div>
        <dl class="cliente">
          ${dato("Propietario", datos.propietario)}
          ${dato("Barco", datos.nombre_barco ? `“${datos.nombre_barco}”` : "")}
          ${dato("Constructor", datos.constructor)}
        </dl>
        <div class="estado">
          <span class="barra"><i style="width:${pct}%"></i></span>
          <span class="txt">${avance.hechos} de ${avance.total} definidos${avance.faltan.length ? ` · <span class="marca-falta"></span> ${avance.faltan.length} a definir` : " · completa"}</span>
        </div>
      </div>
    </div>
    ${bloques.join("")}
    <div class="amano"><div class="renglones"></div></div>
    <div class="pie"><span>Klase A · ${esc(obra.codigo)} · impresa el ${hoy}</span></div>
  </div>`;
}

// Escribe las hojas en la ventana y abre el diálogo de impresión. Cada hoja
// tiene que entrar en una página: si se pasa, se achica lo justo.
function escribir(win, titulo, hojas) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>${CSS}</style></head><body>
    ${hojas.join("")}
    <script>
      function ajustar() {
        const mm = document.createElement("div");
        mm.style.height = "279mm"; mm.style.position = "absolute"; mm.style.visibility = "hidden";
        document.body.appendChild(mm);
        const alto = mm.getBoundingClientRect().height;
        mm.remove();
        document.querySelectorAll(".hoja").forEach((h) => {
          h.style.zoom = "";
          const renglones = h.querySelector(".amano .renglones");
          if (renglones) renglones.style.height = "";
          const sobra = alto - h.scrollHeight - 4;
          if (renglones && sobra > 0) renglones.style.height = (renglones.getBoundingClientRect().height + sobra) + "px";
          const propio = h.scrollHeight;
          const factor = (alto / propio) * 0.985;
          // Achicar un poco sí; más que eso deja la letra chica: mejor otra hoja.
          if (propio > alto && factor >= 0.8) h.style.zoom = String(factor);
        });
      }
      const listo = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      Promise.race([listo, new Promise((ok) => setTimeout(ok, 2500))]).then(() => {
        ajustar();
        setTimeout(() => window.print(), 300);
      });
    </script>
  </body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// La hoja de un barco (desde su ficha).
export async function imprimirMemoria({ obra, linea, campos, datos, excluidos, actualizada, quien }) {
  // La ventana se abre en el clic (después de esperar datos el navegador la bloquea).
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return false;
  win.document.write("<p style='font-family:system-ui;padding:24px;color:#555'>Armando la hoja…</p>");
  const extras = await extrasDe(obra, excluidos);
  await precargar(texsDe(campos, datos, linea));
  escribir(win, `Memoria ${obra.codigo}`, [armarHoja({ obra, linea, campos, datos, actualizada, quien, ...extras })]);
  return true;
}

// Las hojas de varios barcos juntas (una línea entera para el pizarrón).
// fichas: [{ obra, linea, campos, datos, fila }] como las arma la portada.
export async function imprimirMemorias(fichas, { titulo, perfiles } = {}) {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return false;
  win.document.write(`<p style='font-family:system-ui;padding:24px;color:#555'>Armando ${fichas.length} hojas…</p>`);
  const extras = await Promise.all(fichas.map((f) => extrasDe(f.obra)));
  await precargar(fichas.flatMap((f) => texsDe(f.campos, f.datos, f.linea)));
  const hojas = fichas.map((f, i) => armarHoja({
    obra: f.obra,
    linea: f.linea,
    campos: f.campos,
    datos: f.datos,
    actualizada: f.fila?.updated_at || null,
    quien: f.fila?.updated_by ? perfiles?.get(f.fila.updated_by) : null,
    ...extras[i],
  }));
  escribir(win, titulo || "Memorias", hojas);
  return true;
}
