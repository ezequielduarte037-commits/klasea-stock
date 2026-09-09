# Depuración de rubros

Generado el 09/09/2026 contra la base de producción. La migración es
`supabase/migrations/20260909120000_rubros_depuracion.sql` y **todavía no se corrió**.

## El árbol que queda

13 rubros de trabajo, el árbol de consumibles y una bolsa para lo que no se puede decidir:

| Rubro | Qué entra |
|---|---|
| Electricidad | Cableado, baterías, tableros, luces, fusibles, terminales |
| Electrónica | Garmin, plotters, VHF, antenas, parlantes, cámaras, sonda |
| Carpintería y alistamiento | Antes "Carpintería y varios". Muebles, tambuchos, tapas, cabos, anclas, matafuegos |
| Herrajes | Los herrajes chicos: bisagras, guías, picaportes, cerraduras, pistones, retenes |
| Herrería | Inoxidable grande y terminado: barandas, bitas, cornamusas, pasamanos, chapas, cortes |
| Sanitarios | Inodoros, bachas, lavatorios, sifones, bombas de agua |
| └ Griferías | Monocomandos, mezcladoras, duchadores |
| Vidrios | Parabrisas, ventanas, VNA, ojos de buey, claraboyas |
| Mecánica | Motores, hélices, ejes, flaps, bowthrusters, escapes, tanques |
| └ Broncería | Racores, niples, entrerroscas, cuplas, pasacascos |
| Maderas | Okumé, lenga, terciados, fórmica, teca, PVC espumado |
| Laminación | Resinas, gelcoat, mat, roving, coremat, airex, masillas |
| Electrodomésticos | Heladeras, TVs, microondas, anafes, calefactores, fabricadoras de hielo |
| Consumibles | Con sus 10 subrubros, sin cambios |
| A asignar | Antes "Sin categoría". Lo que no se pudo decidir por el nombre |

Griferías y Broncería quedan colgando de Sanitarios y Mecánica. En las listas se leen
como rubro propio; la jerarquía sirve para poder sumarlos al padre cuando hace falta.

## Qué se movió

**318 materiales.** Los 214 consumibles no se tocaron.

### Movidas obligadas (92)

Estaban sin rubro o en un rubro que se disuelve.

| De | A | Cant. | Ejemplos |
|---|---|---|---|
| Sin categoría | Carpintería y alistamiento | 18 | PARRILLA LEVY · PARRILLA KENYON |
| Sin categoría | Herrajes | 13 | ACCESORIO DE FIJACIÓN EN L PARA RESORTE HI · CIERRE PERKO GALLINA 1021DP PAR |
| Sin categoría | Broncería | 11 | RACOR MACHO 1/2 X 3/8 MANGUERA · Niple de reduccion 1/2 x 3/4 |
| Sin categoría | Electricidad | 10 | LUZ BANDA ATTWOOD INOX C/LEDS · Panel de control c/joystick craftsman bow/ |
| Tanques | Mecánica | 8 | Tanques de combustible con visor · Tanques de agua |
| Sin categoría | Griferías | 6 | Duchador de mano piazza negro · Griferia De Ducha Fv Libby Monocomando 108 |
| Sin categoría | Herrería | 6 | GANCHO INOXIDABLE PORTA DEFENSA · Porta caña inoxidable con tapa |
| Tapicería | Herrería | 6 | Soportes tapiceria flybridge · Soportes tapiceria banco cockpit |
| Sin categoría | Mecánica | 5 | Mercury Verado 400 Fuera de borda · Mercury Verado 300 |
| Sin categoría | Electrónica | 4 | Garmin Stereo Fusion MS-RA670 · Compas Ritchie Embutir Blanco 50w |
| Sin categoría | Electrodomésticos | 2 | Heladera BGH 312L · CALEFACTOR AUTOTERM ADAPT P/REJILLA D60 NE |
| Tanques | Sanitarios | 1 | Tapa tanque waste 1 1/2" cromada c/venteo |
| Sin categoría | Maderas | 1 | Formica Negro (L121) - Topmate |
| Sin categoría | Sanitarios | 1 | TOALLERO BARRAL LARGO EPUYEN 0164/L2 · CRO |

### Correcciones (226)

Estaban en un rubro que no corresponde. Sólo se aplicaron las que se deciden por una
marca, un código o una palabra que no significa otra cosa.

| De | A | Cant. | Ejemplos |
|---|---|---|---|
| Carpintería y varios | Vidrios | 67 | Ojo de buey · VNA LAT IZQ BABOR HUNTER 60733 |
| Electricidad | Electrónica | 25 | PLOTTER GARMIN ECHOMAP UHD2 72SV + TRANSDU · CHROMECAST ONN 4K |
| Carpintería y varios | Herrajes | 21 | PISTONES Linear TechLine LA36 - 6800N · Bisagra 38X38X2mm 4 Tornillos |
| Mecánica | Broncería | 15 | Entrerrosca 1 1/2" · Racor 1/4" a espiga 10 mm bronce |
| Carpintería y varios | Sanitarios | 10 | Rompe-Sifon 38mm=1 1/2" · Toallero Epuyén 0163/L2 |
| Herrería | Electricidad | 10 | Cable soldadura flex 1x50 · Caño corrugado flex 1/2" |
| Sanitarios | Broncería | 8 | RACOR 1/2 A 1/2 · PASACASCO 1" DORADO |
| Electrónica | Electrodomésticos | 8 | TV 55 QLED Q6F 4K Smart · SOPORTE ELEVADOR DE TV TVL3 médium (hasta  |
| Mecánica | Electricidad | 6 | TIRANFLEX (CABLE MORSE) IVECO · Control Malacate MAXWELL P102938 |
| Electricidad | Vidrios | 5 | Brazo y escobilla de limpiaparabrisa · Brazo y escobilla de limpiaparabrisa · 28´ |
| Herrería | Herrajes | 5 | BISAGRA BUTACA · Cierre levantapiso redondo inox c perno |
| Sanitarios | Griferías | 5 | MONOCOMANDO LAVATORIO FV EPUYEN 0181.02/L2 · Portarrollo FV Libby 167/39 |
| Electricidad | Mecánica | 4 | BOWTHRUSTER 3.7HP 62KG SLEIPNER · BOWTHRUSTER 4.6HP 73KG SLEIPNER |
| Electrónica | Electricidad | 4 | CABLE NMEA 2000 6' (1.83Mts) · CONTROL FLAP LENCO MASTER LED |
| Herrería | Mecánica | 3 | Tubo bowthruster D.int 185 mm, largo 1,40  · Tubo bowthruster D= 250mm, e= 9 mm, L = 1, |
| Electricidad | Electrodomésticos | 3 | HORNO MICROONDAS SAMSUNG MW7300B · HORNO MICROONDAS CON GRILL SAMSUNG MG22M80 |
| Herrería | Sanitarios | 3 | TOALLERO BARRAL FV DOMINIC 164R/85 · TOALLERO BARRAL LARGO EPUYEN 0164/L2 |
| Carpintería y varios | Herrería | 3 | Grillete omega 8mm · Ancla DELTA 40kg INOX |
| Carpintería y varios | Laminación | 2 | gelcoat matricero naranja · Gelcoat Pintura |
| Electrónica | Mecánica | 2 | Termica malacate 80A · LLAVE DE MOTOR - MERCURY |
| Herrajes | Mecánica | 2 | Sistema FLAP 24 x 12" Doble estacion · Sistema FLAP 24 x 12" Doble estacion · Sis |
| Sanitarios | Electricidad | 2 | Precintos 35cm (bolsa) · Plaquetas p/precintos |
| Carpintería y varios | Broncería | 2 | Rejilla - Bronce - Perko 330DP1CHR (2 1/2" · Rejilla - Bronce - Perko 330DP2CHR (3 1/4" |
| Griferías | Sanitarios | 2 | Bomba p/duchador agua de rio · BACHA DE VIDRIO REDONDA |
| Carpintería y varios | Electrónica | 2 | Plotter GPSMAP 1223xsv Garmin · Piloto automatico (KIT) K55 |
| Mecánica | Herrería | 1 | Corte chapa 1/4" inox 316 según plano "Pat |
| Electricidad | Sanitarios | 1 | CONTROL DE INODORO SEAFLO |
| Mecánica | Sanitarios | 1 | SYPHON BREAKER 19MM (CORTA SIFON) |
| Laminación | Mecánica | 1 | TUNEL BOW THRUSTER 250 X 9MM K55 |
| Carpintería y varios | Electricidad | 1 | Control FLAP segunda estacion Lenco |
| Carpintería y varios | Maderas | 1 | MESA DE TECA |
| Herrería | Electrónica | 1 | HERRAJE DE STARLINK |

## Lo que quedó a asignar (16)

No se puede decidir por el nombre. Van a **A asignar** para que alguien los mire:

- Sellador  _(estaba en Tanques)_
- Pintura sintetica negra  _(estaba en Sin categoría)_
- Goma p/hidrocarburos 3 mm  _(estaba en Tanques)_
- Sellador · Threebond  _(estaba en Tanques)_
- Buje de reduccion 2 x 1/2 plastico  _(estaba en Sin categoría)_
- Tanque acumulador presion Flojet-Jabsco  _(estaba en Tanques)_
- TAPA HEMBRA 1/2 FUNDIDO  _(estaba en Sin categoría)_
- Soporte plastico filtro agua  _(estaba en Sin categoría)_
- TERMOTANQUE KUUMA 06 GALONES 240V  _(estaba en Sin categoría)_
- Valvula 1/2 Codo salida flex.  _(estaba en Sin categoría)_
- Cinta aluminio reforzada para aislantes  _(estaba en Sin categoría)_
- AISLANTE COMPOSITE CHICA 122x61x3  _(estaba en Sin categoría)_
- Botella Transparente  _(estaba en Sin categoría)_
- INVER/CARG.MUL.1600W,12V-80A  _(estaba en Sin categoría)_
- Plancha de Stickers  _(estaba en Sin categoría)_
- Manguera de venteo 19mm int.  _(estaba en Tanques)_

Cuatro de esos parecen consumibles y no están marcados como tales: los dos selladores,
la goma para hidrocarburos y la pintura sintética. Marcarlos con `es_consumible` los
manda solos al árbol de consumibles.

## Lo que decidí y podés dar vuelta

- **Tapicería se disuelve.** Sus 6 ítems eran "Soportes tapicería banco proa / cockpit /
  flybridge": son soportes de metal, no tapizado. Van a Herrería.
- **Tanques se disuelve.** Era hijo de Mecánica con 14 ítems mezclados — tapas, venteos,
  visores, mangueras, selladores. Van a Mecánica, Sanitarios y A asignar.
- **Electrodomésticos queda** como rubro propio, con sus 53 ítems.
- Las palabras genéricas (`motor`, `bomba`, `escalera`, `luz`, `cabo`, `cadena`) sólo se
  usaron para lo que había que mover sí o sí. No se usaron para corregir un rubro que
  alguien ya había elegido a mano.

## Lo que no es un rubro

"Baron / varios" no es un rubro: es un **proveedor**. Hay 8 proveedores con barra que
vienen del mismo Excel:

Baron/Trimer · Janored/2001 · Janored/2001/Cambre · Riedel/Plaquimet · Plaquimet/ADS ·
ADS/All Built · All Built/ADS · Mercoglass/Favicur

Esa es otra limpieza. Ahora que un material puede tener varios proveedores de verdad,
cada una de esas barras se puede partir en dos proveedores reales. Decime y lo armo.

## Cómo queda

**15 rubros en las listas generales**, contra las 27 categorías de hoy:

| Rubro | Materiales |
|---|---|
| Electricidad | 361 |
| Mecánica | 225 |
| Consumibles | 219 |
| Herrería | 168 |
| Broncería | 153 |
| Sanitarios | 147 |
| Herrajes | 126 |
| Carpintería y alistamiento | 124 |
| Electrónica | 113 |
| Vidrios | 91 |
| Electrodomésticos | 66 |
| Griferías | 49 |
| Laminación | 25 |
| A asignar | 16 |
| Maderas | 12 |
| **Total** | **1.895** |

Entrando a Consumibles la división sigue entera: Fijaciones 57, Lijas y abrasivos 45,
Mechas 40, Químicos y adhesivos 17, Cintas y film 14, Herramientas menores 11,
Pintura y aplicación 10, EPP 7, Limpieza y descarte 6, Hojas caladora y serrucho 6.

## El cambio en el código

`rubroDeLista(categorias, categoriaId)` en `src/features/materiales/api.js` es la regla:
sube a Consumibles cualquier subrubro de consumibles, y deja el nombre propio a todo lo
demás. Acepta el array de `fetchCategorias`, un `Map` por id o el índice `{ porId }`.

Se usa en los cinco puntos donde `MaterialesScreen` arma la fila de una lista, y en
`rubroDeMaterial` de `costoBarcoApi.js`.

**Costos cambia de comportamiento.** Antes subía hasta la categoría raíz, así que
Broncería contaba dentro de Mecánica y Griferías dentro de Sanitarios. Ahora cuentan
solas, como en el resto del sistema. Si preferís verlas sumadas al padre en el resumen de
costos, se separa la regla en dos y se deja esa pantalla como estaba.
