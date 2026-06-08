const pptxgen = require("pptxgenjs");
const path = require("path");

const BASE = "D:\\proyectos\\klasea-stock";
const WM = path.join(BASE, "_wm.png");
const K_WHITE = path.join(BASE, "_k_white.png");
const K_NAVY = path.join(BASE, "_k_navy.png");

// ── Paleta ────────────────────────────────────────────────────────────────────
const NAVY="1E3A5F", NAVY_DK="15263D", AZUL="2563EB", AZULB="3B82F6", AZULC="EFF6FF";
const BG="FFFFFF", CARD="F6F8FB", GRIST="64748B", GRISB="E2E8F0", NEGRO="0F172A";
const VERDE="15803D", VERDE_BG="DCFCE7", AMBAR="B45309", AMBAR_BG="FEF3C7", AZUL_BG="DBEAFE";
const HF="Trebuchet MS", BFt="Calibri";

const pres = new pptxgen();
pres.defineLayout({ name:"W", width:13.333, height:7.5 });
pres.layout = "W";
pres.author = "Astillero Klase A";
pres.title = "Klasea Stock — Presentación";
const PW=13.333, PH=7.5, M=0.6;

const shadow = () => ({ type:"outer", color:"94A3B8", blur:9, offset:3, angle:90, opacity:0.25 });

function cornerK(s){ s.addImage({ path:K_NAVY, x:PW-0.95, y:0.45, w:0.42, h:0.42 }); }

function title(s, t){
  s.addText(t, { x:M, y:0.42, w:PW-2*M-0.6, h:0.7, fontFace:HF, fontSize:30, bold:true, color:NAVY, align:"left", valign:"middle", margin:0 });
}

function chip(s, x, y, w, text, fg, bg){
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h:0.32, fill:{color:bg}, line:{type:"none"}, rectRadius:0.16 });
  s.addText(text, { x, y, w, h:0.32, fontFace:BFt, fontSize:9.5, bold:true, color:fg, align:"center", valign:"middle", margin:0 });
}

// Slide con captura de pantalla enmarcada (barra de ventana + sombra)
function showcase(titulo, caption, img, iw, ih){
  const s = pres.addSlide(); s.background={color:BG}; cornerK(s);
  s.addText(titulo, { x:M, y:0.40, w:9, h:0.52, fontFace:HF, fontSize:26, bold:true, color:NAVY, valign:"middle", margin:0 });
  s.addText(caption, { x:M, y:0.95, w:11.5, h:0.3, fontFace:BFt, fontSize:13.5, color:GRIST, valign:"middle", margin:0 });
  // área disponible para la imagen
  const maxW = 11.7, maxH = 5.0, topY = 1.68, barH = 0.32;
  const r = iw/ih;
  let w = maxW, h = w/r;
  if (h > maxH){ h = maxH; w = h*r; }
  const x = (PW - w)/2;
  const y = topY + (maxH - h)/2;
  // barra de ventana (estilo navegador) arriba de la captura
  s.addShape(pres.shapes.RECTANGLE, { x, y:y-barH, w, h:barH, fill:{color:"E9EDF3"}, line:{color:GRISB,width:0.75}, shadow:{ type:"outer", color:"94A3B8", blur:10, offset:3, angle:90, opacity:0.30 } });
  ["EF6A5E","F5BD4F","61C554"].forEach((c,i)=> s.addShape(pres.shapes.OVAL, { x:x+0.14+i*0.18, y:y-barH+0.105, w:0.11, h:0.11, fill:{color:c}, line:{type:"none"} }));
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x:x+0.78, y:y-barH+0.06, w:Math.min(4.2,w-1.2), h:0.2, fill:{color:"FFFFFF"}, line:{color:GRISB,width:0.5}, rectRadius:0.1 });
  s.addText("klasea-stock.vercel.app", { x:x+0.92, y:y-barH+0.04, w:4, h:0.24, fontFace:BFt, fontSize:8.5, color:GRIST, valign:"middle", margin:0 });
  // captura
  s.addImage({ path:img, x, y, w, h, line:{color:GRISB,width:0.75} });
  return s;
}

// ══ SLIDE 1 — PORTADA ══════════════════════════════════════════════════════════
let s = pres.addSlide(); s.background={color:NAVY};
s.addShape(pres.shapes.RECTANGLE,{x:0,y:0,w:PW,h:1.9,fill:{color:NAVY_DK},line:{type:"none"}});
{ const ww=4.4, wh=ww*359/1199; s.addImage({ path:WM, x:(PW-ww)/2, y:1.55, w:ww, h:wh }); }
s.addText("KLASEA STOCK", { x:0, y:3.05, w:PW, h:1.0, fontFace:HF, fontSize:56, bold:true, color:"FFFFFF", align:"center", charSpacing:1 });
s.addText("Sistema de Gestión Interna del Astillero", { x:0, y:4.25, w:PW, h:0.5, fontFace:BFt, fontSize:21, color:"CDDDF5", align:"center" });
s.addText("Astillero Klase A   ·   Junio 2026", { x:0, y:4.95, w:PW, h:0.4, fontFace:BFt, fontSize:14, color:"8AA2C2", align:"center" });
s.addText("Presentación interna  ·  Confidencial", { x:0, y:6.85, w:PW, h:0.3, fontFace:BFt, fontSize:11, color:"6B86A8", align:"center" });

// ══ SLIDE 2 — EL PROBLEMA ══════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"El problema que resolvimos");
s.addText("La operación dependía de información fragmentada y procesos manuales.", { x:M, y:1.2, w:PW-2*M, h:0.4, fontFace:BFt, fontSize:15, color:GRIST, align:"left" });
const colW=5.85, cardY=2.0, cardH=4.7, lx=M, rx=6.88;
// ANTES (gris)
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:lx,y:cardY,w:colW,h:cardH,fill:{color:CARD},line:{color:GRISB,width:1},rectRadius:0.1,shadow:shadow()});
s.addText("ANTES", { x:lx+0.35, y:cardY+0.3, w:colW-0.7, h:0.45, fontFace:HF, fontSize:18, bold:true, color:GRIST, charSpacing:2 });
s.addText([
  {text:"Pedidos por WhatsApp, sin registro ni seguimiento", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"Ingresos y egresos anotados en papel o en Excel", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"Para saber el estado de un barco había que preguntar", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"Sin aviso cuando llegaba un material pedido", options:{bullet:{indent:18}}},
],{ x:lx+0.35, y:cardY+1.0, w:colW-0.7, h:cardH-1.3, fontFace:BFt, fontSize:14.5, color:NEGRO, valign:"top" });
// AHORA (navy)
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:rx,y:cardY,w:colW,h:cardH,fill:{color:NAVY},line:{type:"none"},rectRadius:0.1,shadow:shadow()});
s.addShape(pres.shapes.RECTANGLE,{x:rx,y:cardY,w:0.09,h:cardH,fill:{color:AZULB},line:{type:"none"}});
s.addText("AHORA", { x:rx+0.35, y:cardY+0.3, w:colW-0.7, h:0.45, fontFace:HF, fontSize:18, bold:true, color:"FFFFFF", charSpacing:2 });
s.addText([
  {text:"Pedidos centralizados, con seguimiento de estado", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"920 movimientos digitales, trazables por obra", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"Mapa de producción en tiempo real", options:{bullet:{indent:18}, breakLine:true, paraSpaceAfter:14}},
  {text:"Notificaciones automáticas a compras", options:{bullet:{indent:18}}},
],{ x:rx+0.35, y:cardY+1.0, w:colW-0.7, h:cardH-1.3, fontFace:BFt, fontSize:14.5, color:"E8EEF7", valign:"top" });

// ══ SLIDE 3 — QUÉ ES ═══════════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"¿Qué es Klasea Stock?");
s.addText([
  {text:"Un sistema de gestión interna hecho ", options:{}},
  {text:"a medida", options:{bold:true, color:AZUL}},
  {text:" para el Astillero Klase A.", options:{}},
],{ x:M, y:1.35, w:PW-2*M, h:0.9, fontFace:HF, fontSize:26, color:NAVY, align:"left", valign:"middle" });
const feats=[["En la nube","Accesible desde PC, tablet y celular. Sin instalación de ningún tipo."],
            ["A medida","Cada módulo refleja exactamente cómo trabaja el astillero."],
            ["En tiempo real","Todos los cambios se sincronizan al instante entre los usuarios."]];
const fW=3.84, fH=3.2, fY=2.9, gap=(PW-2*M-3*fW)/2;
feats.forEach((f,i)=>{
  const x=M+i*(fW+gap);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:fY,w:fW,h:fH,fill:{color:CARD},line:{color:GRISB,width:1},rectRadius:0.1,shadow:shadow()});
  s.addShape(pres.shapes.OVAL,{x:x+0.4,y:fY+0.4,w:0.85,h:0.85,fill:{color:NAVY},line:{type:"none"}});
  s.addText(String(i+1),{x:x+0.4,y:fY+0.4,w:0.85,h:0.85,fontFace:HF,fontSize:26,bold:true,color:"FFFFFF",align:"center",valign:"middle",margin:0});
  s.addText(f[0],{x:x+0.4,y:fY+1.5,w:fW-0.8,h:0.5,fontFace:HF,fontSize:19,bold:true,color:NAVY});
  s.addText(f[1],{x:x+0.4,y:fY+2.05,w:fW-0.8,h:1.0,fontFace:BFt,fontSize:14,color:GRIST,valign:"top"});
});

// ══ SLIDE 4 — MÓDULOS ══════════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"Módulos del sistema");
const mods=[
  ["Obras & Gantt","Etapas y tareas por barco","prod"],
  ["Mapa de Producción","Qué barco en qué puesto","prod"],
  ["Pañol / Inventario","Ingresos y egresos por obra","prod"],
  ["Madera","Stock de maderas y pedidos","prod"],
  ["Compras","Pedidos con seguimiento de estado","prod"],
  ["Bot de WhatsApp","Pedidos desde el celular","prod"],
  ["Laminación","Materiales y pedidos del área","adop"],
  ["Fechas de producción","Eventos según el desmolde","nuevo"],
  ["Planificación","Timeline, avisos y órdenes","prod"],
  ["Marmolería & Muebles","Materiales por especialidad","prod"],
];
const chipMap={prod:["En producción",VERDE,VERDE_BG], adop:["En adopción",AMBAR,AMBAR_BG], nuevo:["Nuevo",AZUL,AZUL_BG]};
const mW=5.85, mH=0.86, mY0=1.55, mGapY=0.96, mLx=M, mRx=6.88;
mods.forEach((mod,i)=>{
  const col=i%2, row=Math.floor(i/2);
  const x = col===0?mLx:mRx, y=mY0+row*mGapY;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w:mW,h:mH,fill:{color:CARD},line:{color:GRISB,width:1},rectRadius:0.08,shadow:shadow()});
  s.addShape(pres.shapes.RECTANGLE,{x,y,w:0.07,h:mH,fill:{color:AZULB},line:{type:"none"}});
  s.addText(mod[0],{x:x+0.28,y:y+0.12,w:3.4,h:0.34,fontFace:HF,fontSize:14.5,bold:true,color:NAVY,margin:0,valign:"middle"});
  s.addText(mod[1],{x:x+0.28,y:y+0.46,w:3.9,h:0.3,fontFace:BFt,fontSize:11.5,color:GRIST,margin:0,valign:"middle"});
  const c=chipMap[mod[2]];
  chip(s, x+mW-1.62, y+(mH-0.32)/2, 1.45, c[0], c[1], c[2]);
});

// ══ SLIDES — EL SISTEMA EN PANTALLA (capturas reales) ══════════════════════════
const P = "D:\\proyectos\\klasea-stock\\screenshots\\";
showcase("Mapa de Producción", "El plano del galpón en tiempo real: qué barco está en cada puesto.", P+"mapa.png", 1623, 847);
showcase("Obras — avance por barco", "Etapas y tareas de cada barco, con porcentaje de avance.", P+"obras.png", 1647, 460);
showcase("Compras — solicitudes", "Todos los pedidos en un tablero, con estado, prioridad y obra.", P+"compras_lista.png", 1669, 929);
showcase("Compras — tablero operativo", "Embudo de estados, urgentes y tiempos: la salud de compras de un vistazo.", P+"compras_dash.png", 1650, 942);
showcase("Pañol — movimientos", "Ingresos y egresos de materiales por obra, con recepción de pedidos.", P+"panol.png", 1636, 932);

// ══ SLIDE 5 — MÉTRICAS ═════════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"Métricas de uso real — Pañol & Madera");
s.addText("Datos reales del sistema al 5 de junio de 2026", { x:M, y:1.15, w:PW-2*M, h:0.35, fontFace:BFt, fontSize:14, italic:true, color:GRIST });
const stats=[["920","Movimientos registrados"],["766","Egresos a obras"],["154","Ingresos recibidos"],["59","Obras con actividad"]];
const nW=2.84, nH=2.9, nY=2.0, nGap=(PW-2*M-4*nW)/3;
stats.forEach((st,i)=>{
  const x=M+i*(nW+nGap);
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y:nY,w:nW,h:nH,fill:{color:AZULC},line:{color:AZULB,width:1.25},rectRadius:0.1,shadow:shadow()});
  s.addText(st[0],{x,y:nY+0.45,w:nW,h:1.5,fontFace:HF,fontSize:66,bold:true,color:AZUL,align:"center",valign:"middle",margin:0});
  s.addText(st[1],{x:x+0.2,y:nY+1.95,w:nW-0.4,h:0.7,fontFace:BFt,fontSize:14.5,color:NAVY,align:"center",valign:"top"});
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:M,y:5.35,w:PW-2*M,h:0.95,fill:{color:NAVY},line:{type:"none"},rectRadius:0.1});
s.addText([
  {text:"72", options:{bold:true,color:AZULB,fontSize:22}},
  {text:" movimientos en los últimos 7 días        ", options:{color:"E8EEF7"}},
  {text:"25", options:{bold:true,color:AZULB,fontSize:22}},
  {text:" materiales distintos trackeados", options:{color:"E8EEF7"}},
],{ x:M, y:5.35, w:PW-2*M, h:0.95, fontFace:BFt, fontSize:16, align:"center", valign:"middle" });

// ══ SLIDE 6 — BOT WHATSAPP ═════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"El bot de WhatsApp");
s.addText("Pedidos a compras desde el celular, en lenguaje natural. Sin abrir ninguna app.", { x:M, y:1.18, w:PW-2*M, h:0.4, fontFace:BFt, fontSize:15, color:GRIST });
// izquierda: pasos
const steps=["El operario manda un mensaje","El bot pregunta sólo lo que falta","Se crea el pedido automáticamente","Compras recibe notificación por email","Queda registrado con foto y seguimiento"];
const stX=M, stY0=2.05, stGap=0.92;
steps.forEach((t,i)=>{
  const y=stY0+i*stGap;
  s.addShape(pres.shapes.OVAL,{x:stX,y:y,w:0.55,h:0.55,fill:{color:AZUL},line:{type:"none"}});
  s.addText(String(i+1),{x:stX,y:y,w:0.55,h:0.55,fontFace:HF,fontSize:18,bold:true,color:"FFFFFF",align:"center",valign:"middle",margin:0});
  s.addText(t,{x:stX+0.78,y:y,w:5.1,h:0.55,fontFace:BFt,fontSize:15,color:NEGRO,valign:"middle",margin:0});
});
// derecha: chat
const chX=7.0, chW=5.73, chY=2.0, chH=4.55;
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:chX,y:chY,w:chW,h:chH,fill:{color:"ECE5DD"},line:{type:"none"},rectRadius:0.1,shadow:shadow()});
function bubble(yy, txt, mine, hh){
  const bw=4.35;
  const bx = mine ? chX+chW-bw-0.25 : chX+0.25;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:bx,y:yy,w:bw,h:hh,fill:{color: mine?"DCF8C6":"FFFFFF"},line:{type:"none"},rectRadius:0.08,shadow:shadow()});
  s.addText(txt,{x:bx+0.18,y:yy,w:bw-0.36,h:hh,fontFace:BFt,fontSize:12.5,color:"111B21",valign:"middle",margin:2});
}
bubble(chY+0.3, "Necesito 6 tubos de No Más Clavos para el K52", true, 0.85);
bubble(chY+1.3, "Anotado. ¿Prioridad alta, media o baja?", false, 0.55);
bubble(chY+2.05, "Alta", true, 0.45);
bubble(chY+2.65, "Listo. Pedido creado y compras notificado.", false, 0.7);
s.addText("Entiende texto, fotos y audios.", {x:chX,y:chY+3.55,w:chW,h:0.5,fontFace:BFt,fontSize:12,italic:true,color:NAVY,align:"center"});

// ══ SLIDE 7 — SEGURIDAD ════════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"Seguridad, roles y acceso");
const roles=[
  ["Gestión / Admin","Acceso completo a todos los módulos y configuración"],
  ["Compras","Pedidos, órdenes de compra y proveedores"],
  ["Pañol","Registro de movimientos y recepción de pedidos"],
  ["Laminación","Materiales y pedidos propios del área"],
  ["Encargado de obra","Seguimiento de su barco y pedidos a compras"],
  ["Consulta","Mapa de producción y estado de obras (sólo lectura)"],
];
const rW=5.85, rH=1.05, rY0=1.5, rGapY=1.15, rLx=M, rRx=6.88;
roles.forEach((r,i)=>{
  const col=i%2, row=Math.floor(i/2);
  const x=col===0?rLx:rRx, y=rY0+row*rGapY;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x,y,w:rW,h:rH,fill:{color:CARD},line:{color:GRISB,width:1},rectRadius:0.08,shadow:shadow()});
  s.addShape(pres.shapes.RECTANGLE,{x,y,w:0.07,h:rH,fill:{color:NAVY},line:{type:"none"}});
  s.addText(r[0],{x:x+0.3,y:y+0.13,w:rW-0.6,h:0.4,fontFace:HF,fontSize:15,bold:true,color:NAVY,margin:0,valign:"middle"});
  s.addText(r[1],{x:x+0.3,y:y+0.52,w:rW-0.6,h:0.42,fontFace:BFt,fontSize:12.5,color:GRIST,margin:0,valign:"middle"});
});
s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:M,y:6.55,w:PW-2*M,h:0.62,fill:{color:AZULC},line:{color:AZULB,width:1},rectRadius:0.08});
s.addText("100% en la nube   ·   Sin instalación   ·   Sincronización en tiempo real", {x:M,y:6.55,w:PW-2*M,h:0.62,fontFace:BFt,fontSize:14,bold:true,color:NAVY,align:"center",valign:"middle"});

// ══ SLIDE 8 — PRÓXIMOS PASOS ═══════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:BG}; cornerK(s); title(s,"Próximos pasos");
const next=[
  ["Bot WhatsApp","Comprensión de pedidos con IA avanzada","Alta"],
  ["Fechas de producción","Completar tiempos por modelo de barco","Alta"],
  ["Calendario","Integrar desmoldes con la planificación de compras","Alta"],
  ["Laminación","Adopción completa del módulo por el área","Media"],
  ["Mobile","Optimización para celular en todos los módulos","Media"],
  ["Reportes","Exportación a Excel / PDF de movimientos","Media"],
];
const xW=PW-2*M, xH=0.78, xY0=1.55, xGap=0.9;
next.forEach((n,i)=>{
  const y=xY0+i*xGap;
  s.addShape(pres.shapes.ROUNDED_RECTANGLE,{x:M,y,w:xW,h:xH,fill:{color:CARD},line:{color:GRISB,width:1},rectRadius:0.08,shadow:shadow()});
  s.addText(n[0],{x:M+0.3,y:y,w:3.5,h:xH,fontFace:HF,fontSize:15.5,bold:true,color:NAVY,valign:"middle",margin:0});
  s.addText(n[1],{x:M+4.0,y:y,w:6.6,h:xH,fontFace:BFt,fontSize:13.5,color:GRIST,valign:"middle",margin:0});
  const alta = n[2]==="Alta";
  chip(s, M+xW-1.55, y+(xH-0.32)/2, 1.25, n[2], alta?VERDE:AMBAR, alta?VERDE_BG:AMBAR_BG);
});

// ══ SLIDE 9 — CIERRE ═══════════════════════════════════════════════════════════
s = pres.addSlide(); s.background={color:NAVY};
s.addShape(pres.shapes.RECTANGLE,{x:0,y:6.85,w:PW,h:0.65,fill:{color:NAVY_DK},line:{type:"none"}});
s.addImage({ path:K_WHITE, x:(PW-1.1)/2, y:0.95, w:1.1, h:1.1 });
s.addText("Un sistema propio, ya en uso,\nque crece con el astillero.", { x:1, y:2.4, w:PW-2, h:1.5, fontFace:HF, fontSize:34, bold:true, color:"FFFFFF", align:"center", valign:"middle", lineSpacingMultiple:1.05 });
const rem=[["Hecho a medida","para Klase A"],["En producción","con datos reales"],["Escalable","y moderno"]];
const remW=3.4, remGap=(PW-2*1-3*remW)/2;
rem.forEach((r,i)=>{
  const x=1+i*(remW+remGap), y=4.5;
  s.addText([{text:r[0]+"\n",options:{bold:true,color:AZULB,fontSize:17}},{text:r[1],options:{color:"CDDDF5",fontSize:14}}],
    {x,y,w:remW,h:0.9,fontFace:BFt,align:"center",valign:"middle"});
});
s.addText("Klasea Stock  ·  2026", { x:0, y:6.85, w:PW, h:0.65, fontFace:BFt, fontSize:12, color:"8AA2C2", align:"center", valign:"middle" });

pres.writeFile({ fileName: path.join(BASE, "klasea-stock-presentacion.pptx") }).then(f=>console.log("OK:", f));
