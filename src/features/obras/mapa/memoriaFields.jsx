/* Campos / iconos / plantillas de la Memoria Descriptiva. Extraído de MapaProduccion.jsx */
/* ── Inline SVG icons (16×16, stroke=currentColor) ── */
const IC = {
  user:    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>,
  hardhat:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 17h20v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2z"/><path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z"/><line x1="12" y1="3" x2="12" y2="12"/></svg>,
  engine: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="8" width="20" height="10" rx="2"/><path d="M6 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="8" y1="12" x2="8" y2="16"/><line x1="16" y1="12" x2="16" y2="16"/></svg>,
  bolt:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  wood:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="6" width="18" height="12" rx="1"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="9" y1="6" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="18"/></svg>,
  floor:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>,
  palette:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="8" cy="10" r="1.5" fill="currentColor"/><circle cx="12" cy="7" r="1.5" fill="currentColor"/><circle cx="16" cy="10" r="1.5" fill="currentColor"/><path d="M12 22c0-4 4-6 4-10"/></svg>,
  ship:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20"/><path d="M5 20V10l7-7 7 7v10"/><line x1="12" y1="3" x2="12" y2="20"/></svg>,
  signal: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/></svg>,
  door:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><line x1="2" y1="20" x2="22" y2="20"/><circle cx="15" cy="13" r="1" fill="currentColor"/></svg>,
  sofa:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 9V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v2"/><path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5"/><path d="M4 11a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2H4v-2z"/><line x1="4" y1="18" x2="4" y2="20"/><line x1="20" y1="18" x2="20" y2="20"/></svg>,
  brush:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18.37 2.63L14 7l-1.59-1.59a2 2 0 0 0-2.82 0L8 7l9 9 1.59-1.59a2 2 0 0 0 0-2.82L17 10l4.37-4.37a2.12 2.12 0 0 0-3-3z"/><path d="M9 8c-2 3-4 3.5-7 4l8 10c2-1 6-5 6-7"/></svg>,
  notes:  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  pencil: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  save:   <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  print:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>,
  check:  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  satellite:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.31"/><path d="M17.7 6.3a8 8 0 0 1 0 11.31"/><path d="M3.05 9A13 13 0 0 0 3 12"/><path d="M21 12a13 13 0 0 0-.05-3"/></svg>,
  anchor: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="22"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>,
  teca:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8C8 10 5.9 16.17 3.82 19"/><path d="M12 3a4 4 0 0 0-4 4c0 1.5.5 3 2 4"/><path d="M21 3a9 9 0 0 1-9 9"/><circle cx="12" cy="20" r="2"/></svg>,
  msgcircle:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  plus:   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
  x:      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  gear:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
};

/* ─── HELPER: deriva el tipo de línea desde puesto o código de obra ─────────
   Retorna: "k37" | "k42" | "k43" | "k52" | "k55" | "k64" | "k85" | "kH" | "default"
─────────────────────────────────────────────────────────────────────────────── */
function getLineaTipo(obra, puesto) {
  if (puesto?.tipo) return puesto.tipo;
  if (obra?.codigo) {
    if (/^H/i.test(obra.codigo)) return "kH";
    const m = obra.codigo.match(/^(\d+)/);
    if (m) return `k${m[1]}`;
  }
  return "default";
}

/* ─── CATÁLOGO COMPLETO DE CAMPOS (todos los posibles) ─────────────────────
   Cada entrada es un descriptor de campo. Los tipos de línea usan subsets.
─────────────────────────────────────────────────────────────────────────────── */
const _F = {
  // ── Identificación
  propietario:        { key:"propietario",   label:"Propietario",               icon:IC.user,     col:1, section:"Identificación" },
  constructor:        { key:"constructor",   label:"Constructor",               icon:IC.hardhat,  col:2, section:"Identificación" },
  nombre_barco:       { key:"nombre_barco",  label:"Nombre del barco",          icon:IC.ship,     col:1, section:"Identificación", wide:true },
  // ── Estructura
  motorizacion:       { key:"motorizacion",  label:"Motorización",              icon:IC.engine,   col:1, section:"Estructura" },
  color_casco:        { key:"color_casco",   label:"Color / Fondo de casco",    icon:IC.brush,    col:2, section:"Estructura" },
  grupo_electrogeno:  { key:"grupo_electrogeno", label:"Grupo Electrógeno",     icon:IC.bolt,     col:1, section:"Estructura" },
  cabina:             { key:"cabina",        label:"Cabina / Tipo",             icon:IC.ship,     col:2, section:"Estructura" },
  // ── Interiores
  madera_muebles:     { key:"madera_muebles", label:"Muebles / Enchapado",      icon:IC.wood,    col:1, section:"Interiores" },
  piso:               { key:"piso",          label:"Piso",                      icon:IC.floor,    col:2, section:"Interiores" },
  alfombra:           { key:"alfombra",      label:"Alfombra",                  icon:IC.floor,    col:1, section:"Interiores" },
  // Mesadas — versión simple (k37/k42/k43) y versión completa (k52+)
  color_mesadas:      { key:"color_mesadas", label:"Mesadas baño / cocina",     icon:IC.palette,  col:1, section:"Interiores", wide:true },
  color_mesadas_full: { key:"color_mesadas", label:"Mesadas baño / cocina / cockpit", icon:IC.palette, col:1, section:"Interiores", wide:true },
  // ── Tapicería — descriptores base (las plantillas sobreescriben el label con spread)
  tapiceria_mamparos: { key:"tapiceria_mamparos",  label:"Mamparos",            icon:IC.sofa,     col:1, section:"Tapicería" },
  tapiceria_dinette:  { key:"tapiceria_dinette",   label:"Dinette / Sillón popa", icon:IC.sofa,   col:2, section:"Tapicería" },
  tapiceria_respaldos:{ key:"tapiceria_respaldos", label:"Respaldos / Bandeau", icon:IC.sofa,     col:1, section:"Tapicería" },
  tapiceria_exterior: { key:"tapiceria_exterior",  label:"Exterior",            icon:IC.sofa,     col:2, section:"Tapicería" },
  color_acolchados:   { key:"color_acolchados",    label:"Acolchados",          icon:IC.sofa,     col:1, section:"Tapicería" },
  color_cerramientos: { key:"color_cerramientos",  label:"Cerramientos",        icon:IC.door,     col:2, section:"Tapicería" },
  // ── Lonería
  loneria_toldo_proa: { key:"loneria_toldo_proa",  label:"Toldo rebatible proa", icon:IC.ship,    col:1, section:"Lonería" },
  loneria_cobertor:   { key:"loneria_cobertor",    label:"Cobertor / Lona",      icon:IC.ship,    col:2, section:"Lonería" },
  loneria_otros:      { key:"loneria_otros",        label:"Cerramientos / tambucho / otros", icon:IC.notes, col:1, section:"Lonería", wide:true },
  // ── Electrónica
  electronica:        { key:"electronica",  label:"Electrónica (GPS, plotters)", icon:IC.signal,  col:1, section:"Electrónica", wide:true },
  audio:              { key:"audio",        label:"Audio (int/ext, parlantes, subw.)", icon:IC.signal, col:1, section:"Electrónica", wide:true },
  // ── Equipamiento — selector teca
  teca_tipo:          { key:"teca_tipo",    label:"Cubierta cockpit",            icon:IC.teca,     col:1, section:"Equipamiento", type:"selector",
                        opts:[{val:null,label:"—"},{val:"teca",label:"Teca"},{val:"infinity",label:"Infinity"}], color:"#d4b483" },
  // ── Equipamiento — TV (solo kH)
  tv_camarote:        { key:"tv_camarote", label:"TV Camarote Popa",            icon:IC.notes,    col:1, section:"Equipamiento" },
  tv_cockpit:         { key:"tv_cockpit",  label:"TV Cockpit",                  icon:IC.notes,    col:2, section:"Equipamiento" },
  // ── Adicionales — texto libre
  adicionales:        { key:"adicionales", label:"Adicionales / Notas técnicas", icon:IC.notes,   col:1, section:"Adicionales", wide:true },
  // ── Equipamiento — toggles (se muestran como pills en el header del HUD)
  starlink:           { key:"starlink",           label:"Starlink",            icon:IC.satellite, col:1, section:"Equipamiento", type:"toggle", color:"#a5b4fc" },
  sternthruster:      { key:"sternthruster",      label:"Sternthruster",       icon:IC.anchor,    col:2, section:"Equipamiento", type:"toggle", color:"#7dd3fc" },
  fabricadora_hielo:  { key:"fabricadora_hielo",  label:"Fabricadora de hielo",icon:IC.bolt,      col:1, section:"Equipamiento", type:"toggle", color:"#86efac" },
  radar:              { key:"radar",              label:"Radar",               icon:IC.signal,    col:2, section:"Equipamiento", type:"toggle", color:"#fca5a5" },
  pluma:              { key:"pluma",              label:"Pluma",               icon:IC.anchor,    col:1, section:"Equipamiento", type:"toggle", color:"#fcd34d" },
  mesa_fly:           { key:"mesa_fly",           label:"Mesa Fly",            icon:IC.ship,      col:2, section:"Equipamiento", type:"toggle", color:"#c4b5fd" },
  aire_acondicionado: { key:"aire_acondicionado", label:"Aire Acondicionado",  icon:IC.bolt,      col:1, section:"Equipamiento", type:"toggle", color:"#67e8f9" },
  calefactor:         { key:"calefactor",         label:"Calefactor",          icon:IC.bolt,      col:2, section:"Equipamiento", type:"toggle", color:"#fda4af" },
  bow_thruster:       { key:"bow_thruster",       label:"Bow Thruster",        icon:IC.anchor,    col:1, section:"Equipamiento", type:"toggle", color:"#93c5fd" },
  plotter:            { key:"plotter",            label:"Plotter",             icon:IC.signal,    col:2, section:"Equipamiento", type:"toggle", color:"#d9f99d" },
  faro:               { key:"faro",               label:"Faro",                icon:IC.bolt,      col:1, section:"Equipamiento", type:"toggle", color:"#fef08a" },
  flaps:              { key:"flaps",              label:"Flaps",               icon:IC.anchor,    col:2, section:"Equipamiento", type:"toggle", color:"#e9d5ff" },
  // NOTA: "planchada" eliminado — no tiene contexto suficiente. Documentar en "adicionales".
};

/* ─── PLANTILLAS POR LÍNEA DE PRODUCCIÓN ─────────────────────────────────────
   Basadas en las memorias descriptivas reales de cada línea.
   Los templates usan spread ({..._F.campo, label:"nuevo label"}) para adaptar
   etiquetas sin cambiar la clave SQL del campo.
─────────────────────────────────────────────────────────────────────────────── */
const MEMORIA_FIELDS_BY_TIPO = {

  // ── K37: Express Sport Cruiser ─────────────────────────────────────────────
  // Open / Soft-Top. Fuera de borda o inboard pequeño.
  // Sin alfombra, cerramientos simples, tapicería básica.
  k37: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.color_mesadas, label:"Mesadas baño / cocina / exterior" },
    // Tapicería — estructura abierta, sin techos interiores complejos
    { ..._F.tapiceria_mamparos, label:"Interior (mamparos)" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos / respaldos)" },
    { ..._F.tapiceria_respaldos, label:"Bandeau / Respaldos" },
    { ..._F.tapiceria_dinette, label:"Sillón camarote popa" },
    _F.color_acolchados,
    // Lonería
    _F.loneria_toldo_proa, _F.loneria_cobertor,
    { ..._F.loneria_otros, label:"Otros lonería (tambucho, cobertor...)" },
    // Electrónica
    _F.electronica, _F.audio,
    // Equipamiento
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo, _F.radar,
    _F.adicionales,
  ],

  // ── K42: Open / Hard-Top Runabout ─────────────────────────────────────────
  // Inboard mediano. Agrega cerramientos, pluma, dinette, tapicería más compleja.
  k42: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.color_mesadas, label:"Mesadas baño / cocina / exterior" },
    // Tapicería — tiene cerramientos y más sectores
    { ..._F.color_cerramientos, label:"Color cerramientos", col:1 },
    _F.color_acolchados,
    { ..._F.tapiceria_mamparos, label:"Interior / Paneles salón" },
    { ..._F.tapiceria_exterior, label:"Exterior (patas, arco, techo)" },
    { ..._F.tapiceria_dinette, label:"Cama / Bandeau / Sillones" },
    { ..._F.tapiceria_respaldos, label:"Respaldos" },
    // Lonería
    _F.loneria_toldo_proa, _F.loneria_cobertor,
    { ..._F.loneria_otros, label:"Cerramientos / tambucho / cobertor" },
    // Electrónica
    _F.electronica, _F.audio,
    // Equipamiento
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo, _F.radar, _F.pluma,
    _F.adicionales,
  ],

  // ── K43: Utilitario / Fishing ──────────────────────────────────────────────
  // Sin cabina formal. Tapicería funcional.
  k43: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno,
    _F.madera_muebles, _F.piso,
    { ..._F.color_mesadas, label:"Mesadas baño / cocina" },
    // Tapicería
    { ..._F.tapiceria_mamparos, label:"Mamparos / Interior" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeau" },
    { ..._F.tapiceria_exterior, label:"Exterior / Triángulos" },
    _F.color_acolchados,
    // Lonería
    _F.loneria_toldo_proa,
    { ..._F.loneria_otros, label:"Otros lonería" },
    // Electrónica
    _F.electronica, _F.audio,
    // Equipamiento
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo, _F.radar, _F.pluma,
    _F.adicionales,
  ],

  // ── K52: Motor Cruiser Cabina ──────────────────────────────────────────────
  // Cabina completa con baño, cocina, camarotes. Tapicería y lonería extensa.
  k52: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.alfombra, label:"Alfombra (viene / No va)" },
    _F.color_mesadas_full,
    // Tapicería — más detallada
    { ..._F.tapiceria_mamparos, label:"Mamparos" },
    { ..._F.tapiceria_dinette, label:"Techos int. / Dinette salón" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeus / Tiras" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos, puffs, techos)" },
    _F.color_acolchados,
    { ..._F.color_cerramientos, label:"Color cerramientos / paneles patas techo", col:1, wide:true },
    // Lonería — cerramientos y tambucho como un campo combinado
    { ..._F.loneria_toldo_proa, label:"Toldo rebatible en solarium de proa" },
    { ..._F.loneria_cobertor, label:"Cobertor / lona" },
    { ..._F.loneria_otros, label:"Cerramiento popa / proa / tambucho / mosquitero" },
    // Electrónica
    _F.electronica, _F.audio,
    // Equipamiento
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo,
    _F.radar, _F.pluma,
    _F.adicionales,
  ],

  // ── K55: Sport Cruiser 55' ─────────────────────────────────────────────────
  // Como K52 + Mesa Fly.
  k55: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.alfombra, label:"Alfombra (viene / No va)" },
    _F.color_mesadas_full,
    { ..._F.tapiceria_mamparos, label:"Mamparos" },
    { ..._F.tapiceria_dinette, label:"Techos int. / Dinette salón" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeus / Tiras" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos, puffs, techos)" },
    _F.color_acolchados,
    { ..._F.color_cerramientos, label:"Cerramientos / paneles patas techo", col:1, wide:true },
    { ..._F.loneria_toldo_proa, label:"Toldo rebatible en solarium de proa" },
    { ..._F.loneria_cobertor, label:"Cobertor / lona" },
    { ..._F.loneria_otros, label:"Cerramiento popa / proa / tambucho / mosquitero" },
    _F.electronica, _F.audio,
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo,
    _F.radar, _F.pluma, _F.mesa_fly,
    _F.adicionales,
  ],

  // ── K64: Yate Largo ───────────────────────────────────────────────────────
  // Como K55 + Aire Acondicionado + Calefactor + Bow Thruster.
  k64: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.alfombra, label:"Alfombra (viene / No va)" },
    _F.color_mesadas_full,
    { ..._F.tapiceria_mamparos, label:"Mamparos" },
    { ..._F.tapiceria_dinette, label:"Techos int. / Dinette salón" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeus / Tiras" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos, puffs, techos)" },
    _F.color_acolchados,
    { ..._F.color_cerramientos, label:"Cerramientos / paneles patas techo", col:1, wide:true },
    { ..._F.loneria_toldo_proa, label:"Toldo rebatible en solarium de proa" },
    { ..._F.loneria_cobertor, label:"Cobertor / lona" },
    { ..._F.loneria_otros, label:"Cerramiento popa / proa / tambucho / mosquitero" },
    _F.electronica, _F.audio,
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo,
    _F.radar, _F.pluma, _F.mesa_fly,
    _F.aire_acondicionado, _F.calefactor, _F.bow_thruster,
    _F.adicionales,
  ],

  // ── K85: La más grande ────────────────────────────────────────────────────
  // Como K64 + Plotter.
  k85: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.alfombra, label:"Alfombra (viene / No va)" },
    _F.color_mesadas_full,
    { ..._F.tapiceria_mamparos, label:"Mamparos" },
    { ..._F.tapiceria_dinette, label:"Techos int. / Dinette salón" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeus / Tiras" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos, puffs, techos)" },
    _F.color_acolchados,
    { ..._F.color_cerramientos, label:"Cerramientos / paneles patas techo", col:1, wide:true },
    { ..._F.loneria_toldo_proa, label:"Toldo rebatible en solarium de proa" },
    { ..._F.loneria_cobertor, label:"Cobertor / lona" },
    { ..._F.loneria_otros, label:"Cerramiento popa / proa / tambucho / mosquitero" },
    _F.electronica, _F.audio,
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo,
    _F.radar, _F.pluma, _F.mesa_fly,
    _F.aire_acondicionado, _F.calefactor, _F.bow_thruster, _F.plotter,
    _F.adicionales,
  ],

  // ── kH: Husky ─────────────────────────────────────────────────────────────
  // Electrónica extendida + TVs + climate + faro + flaps.
  kH: [
    _F.propietario, _F.constructor,
    _F.motorizacion, _F.color_casco, _F.grupo_electrogeno, _F.cabina,
    _F.madera_muebles, _F.piso,
    { ..._F.alfombra, label:"Alfombra (viene / No va)" },
    _F.color_mesadas_full,
    { ..._F.tapiceria_mamparos, label:"Mamparos" },
    { ..._F.tapiceria_dinette, label:"Techos int. / Dinette salón" },
    { ..._F.tapiceria_respaldos, label:"Respaldos / Bandeus / Tiras" },
    { ..._F.tapiceria_exterior, label:"Exterior (asientos, puffs, techos)" },
    _F.color_acolchados,
    { ..._F.color_cerramientos, label:"Cerramientos / paneles patas techo", col:1, wide:true },
    { ..._F.loneria_toldo_proa, label:"Toldo rebatible en solarium de proa" },
    { ..._F.loneria_cobertor, label:"Cobertor / lona" },
    { ..._F.loneria_otros, label:"Cerramiento popa / proa / tambucho / mosquitero" },
    _F.electronica, _F.audio,
    _F.tv_camarote, _F.tv_cockpit,
    _F.teca_tipo, _F.starlink, _F.sternthruster, _F.fabricadora_hielo,
    _F.radar, _F.pluma, _F.mesa_fly,
    _F.aire_acondicionado, _F.calefactor, _F.bow_thruster, _F.plotter, _F.faro, _F.flaps,
    _F.adicionales,
  ],
};
// Fallback genérico si el tipo no se reconoce → usa perfil K52
MEMORIA_FIELDS_BY_TIPO.default = MEMORIA_FIELDS_BY_TIPO.k52;

export { IC, getLineaTipo, MEMORIA_FIELDS_BY_TIPO };
