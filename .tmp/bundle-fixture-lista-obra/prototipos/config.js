// Configuración de la obra: condicionantes, adicionales y excluidos.
//
// Los condicionantes salen de `panol_matriz_condicionantes` (definidos por modelo)
// y `panol_obra_matriz_condicionantes` (el "lleva / no lleva" de cada obra).
// No los pude leer con la clave pública, así que los NOMBRES son de ejemplo.
// Los ítems que cada uno agrega o suma SÍ son los reales de la 37-40: por eso
// prender y apagar mueve los números de verdad.
//
//   agrega : el ítem existe sólo si el condicionante está prendido
//   suma   : el ítem existe siempre, pero el condicionante le suma cantidad
//   tipo   : motorizacion | equipamiento | configuracion | opcional_estandar

window.CONFIG = {
  // matriz_viva | lista_parcial | lista_fijada
  lista: "lista_fijada",

  condicionantes: [
    {
      id: "eje", nombre: "Línea de eje 2¼", tipo: "motorizacion", porDefecto: true, enObra: null,
      desc: "Bocina, sello, hélices y ánodos.",
      agrega: ["Hélices", "Ánodo eje 2 1/4", "Sello PSS para eje 2 1/4, tubo 3 1/2",
               "Buje de bronce 60mm ext x 40mm int", "Caño s/costura inox Sch.80, 3 nominal 600mm",
               "Hierro manchón Ø146mm x 155mm", "Barra 2 1/4 inox 316 L=3000mm"],
    },
    {
      id: "fdb", nombre: "Fuera de borda Mercury Verado 400", tipo: "motorizacion", porDefecto: false, enObra: true,
      desc: "Dos motores en el espejo.",
      agrega: ["Mercury Verado 400 fuera de borda"],
    },
    {
      id: "gen", nombre: "Grupo electrógeno 8 Kva", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Sleeper 8 Kva con toda su instalación de agua y combustible.",
      agrega: ["Grupo electrógeno Sleeper 8 Kva", "Water lock (generador)", "Seawater filter 19mm",
               "Non-return valve 3/4", "Expansion tank", "Electric fuel pump 12V", "Fuel-water separator",
               "Syphon breaker 19mm", "Exhaust hose 40mm (generador)", "Clamps 10-16mm (generador)",
               "Clamps 52-55mm (generador)", "Tornillos generador M8x25", "Remote control panel (generador)",
               "Inverter PMGi 10 (generador)", "Battery switch (generador)"],
    },
    {
      id: "bow", nombre: "Bowthruster 55 Kg", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Hélice de proa con túnel y comando táctil.",
      agrega: ["Bowthruster 55-12V 55Kg Craftsman", "Túnel bow thruster SE50 (140x1000x5.2mm)",
               "Panel touch control bowthruster · 8950G"],
    },
    {
      id: "ac", nombre: "Aire acondicionado", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Equipo frío/calor con ductos y rejillas.",
      agrega: ["Equipo FCF16 Classic dig. frío/calor", "Ducto aire AC 4 pulg.", "Ducto aire AC 6 pulg.",
               "Rejillas orientables negro 60mm", "Rejilla aluminio 14x6 retorno"],
    },
    {
      id: "cal", nombre: "Calefacción Autoterm", tipo: "equipamiento", porDefecto: false, enObra: true,
      desc: "Calefactor de aire 4000W con ductos.",
      agrega: ["Calefactor Autoterm Air 4D 12V 4000W", "Ducto calefacción 90mm", "Ducto calefacción 60mm"],
    },
    {
      id: "fon", nombre: "Fondeo eléctrico", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Malacate, cadena, ancla y catalina.",
      agrega: ["Malacate X1 500W · Lofrans", "Botón malacate Footswitch", "Térmica malacate 80A",
               "Cadena 6mm calibrada galvanizada", "Ancla Delta 16kg galvanizada",
               "Giratorio gusano cadena 6-8mm", "Catalina de fondeo · K55", "Sapito desagote ancla"],
    },
    {
      id: "gar", nombre: "Electrónica Garmin", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Plotter, VHF y antena.",
      agrega: ["Plotter", "VHF 110 Marine Audio Garmin", "Antena VHF Shakespeare plástico 5206-N"],
    },
    {
      id: "aud", nombre: "Audio y TV", tipo: "equipamiento", porDefecto: true, enObra: null,
      desc: "Consola, dos televisores y streaming.",
      agrega: ["Consola Pro FX6 V3T", "Adaptador Shure PS24US AC", "TV 32 Smart",
               "TV 24 · Noblex DB24X4000", "Soporte pared TV", "Chromecast ONN 4K"],
    },
    {
      id: "fla", nombre: "Flaps", tipo: "opcional_estandar", porDefecto: true, enObra: null,
      desc: "Trim tabs eléctricos.",
      agrega: ["Sistema de flaps 12V", "Sistema de flap 12x12 Bennet"],
    },
    {
      id: "star", nombre: "Starlink", tipo: "opcional_estandar", porDefecto: false, enObra: true,
      desc: "Antena mini con su kit.",
      agrega: ["Antena Starlink mini (kit)"],
    },
    {
      id: "hie", nombre: "Fabricadora de hielo", tipo: "opcional_estandar", porDefecto: false, enObra: true,
      desc: "",
      agrega: ["Fabricadora de hielo"],
    },
    {
      id: "vid", nombre: "Ventanas templadas laterales", tipo: "configuracion", porDefecto: true, enObra: null,
      desc: "Vidrio templado 10mm en lugar de acrílico.",
      agrega: ["VNA lat. derecha K37 63011", "VNA lateral der. K37 62539", "Ventana lat. der. estribor K37 62541"],
    },
    {
      id: "bat", nombre: "Segundo banco de baterías", tipo: "configuracion", porDefecto: false, enObra: null,
      desc: "Duplica el banco de servicio y su cableado.",
      suma: [["Baterías 12v 180Ah", 4], ["Cable 1x6 negro", 100], ["Base porta fusible NH-00 160", 2]],
    },
    {
      id: "tol", nombre: "Toldo de proa", tipo: "opcional_estandar", porDefecto: false, enObra: null,
      desc: "Todavía sin materiales cargados.",
      agrega: [],
    },
  ],

  // Sacados sólo de esta obra. Siguen en el catálogo y en la matriz K37.
  excluidos: [
    { fila: ["Heladera 12V 130L", null, "unidad", "Baron", "Electrodomésticos", 1, 0, 0, 0, 980, "USD"],
      motivo: "La pone el cliente" },
    { fila: ["Toldo bimini K37", null, "unidad", "Náutica Folino", "Carpintería y varios", 1, 0, 0, 0, 1250, "USD"],
      motivo: "Va con el toldo de proa, todavía sin definir" },
    { fila: ["Defensas blancas 25cm", null, "unidad", null, "Carpintería y varios", 6, 0, 0, 0, 28, "USD"],
      motivo: "Ya las tiene el cliente" },
  ],

  // Agregados sólo a esta obra: no están en la matriz K37.
  adicionales: [
    { fila: ["Portavasos inox doble", null, "unidad", "Baron", "Herrajes", 4, 0, 0, 0, 22, "USD"],
      motivo: "Pedido del cliente" },
    { fila: ["Ducha de popa con manguera 4m", null, "unidad", "Trimer", "Griferías", 1, 0, 0, 0, 96, "USD"],
      motivo: "Pedido del cliente" },
  ],
};
