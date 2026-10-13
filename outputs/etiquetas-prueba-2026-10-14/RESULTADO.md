# Prueba de etiquetas de Consumibles

Impresora instalada: **P1S Label Printer**, controlador **P1 Label Printer** de **DeTong, Shanghai, Inc.**, puerto **USB004**, resolución **203 × 203 ppp**. El paquete se obtuvo del fabricante y su firma Authenticode se verificó como válida.

Paquete: [DeTong P1 Series Windows Driver 3.2.2026.0812](https://detonger.com/driver/exe/DeTong_P1_Series_Windows_Driver_3.2.2026.0812.exe). El controlador registrado declara DriverVer 05/08/2026, 2.1.2026.0508 en su INF.

Con autorización del usuario se fijó **D 40 x 30 mm** como papel predeterminado de la P1S. Windows pasó la impresora predeterminada a P1S al usarla; el usuario pidió conservarla así. Resolución y márgenes físicos del driver: 203 ppp, 0 mm. No se modificaron opciones del sensor, desplazamiento ni tipo de separación.

## Productos seleccionados

Consulta de lectura con `npx --no-install supabase db query --linked -o json -f select-five-products.sql`. Se seleccionaron cinco materiales distintos activos con movimiento `retiro`, sin anulación, de origen `mostrador` o `solicitud`, y código de etiqueta existente. No había códigos de diez caracteres entre los candidatos elegibles.

| Código | Nombre vigente | Cantidad de retiros | Último retiro, Buenos Aires |
|---|---|---:|---|
| L0072 | LIJA IMPORTADA NO PAST #400 | 2 | 13/10/2026 09:00:55 |
| L0021 | LIJA A/AGUA AA MICROGRANO#1200 | 1 | 13/10/2026 09:00:55 |
| L0019 | LIJA AL AGUA AA #600 | 2 | 13/10/2026 09:00:55 |
| P0001 | PAÑO LUSTRE PICO ROJO | 1 | 13/10/2026 09:00:55 |
| L0023 | LIJA A/AGUA AA MICROGRANO#2000 | 1 | 13/10/2026 09:00:55 |

## Archivo e impresión

Se renderizó el componente real `PaginaEtiquetas` con `FORMATOS.termica`, `contenidoEtiqueta`, `react-dom/server` y esbuild. Se usaron el CSS del componente, la regla global `box-sizing: border-box` de `src/index.css` y el mismo enlace de Google Fonts de `index.html`. Chrome confirmó la carga de Outfit y JetBrains Mono.

El PDF final contiene **cinco páginas de 40 × 30 mm**. Chrome trunca las dimensiones a centésimas de pulgada: se corrigieron solamente las cajas de página del PDF, conservando los gráficos originales sin escala. Las cinco páginas se rasterizaron a **320 × 240 píxeles** a 203 ppp. Se verificó que las cajas del QR y las barras estén completas dentro de cada página.

La impresión usó **Windows PrintDocument** con la impresora explícita, el papel del driver D 40 x 30 mm, una copia por página, márgenes cero y `DrawImageUnscaled`. No fue necesario enviar comandos TSPL/ZPL. El lenguaje nativo del equipo no se confirmó.

Las 46 pruebas de `etiquetasCore.test.mjs` pasaron. Los hashes de los cuatro archivos de etiquetas con cambios previos permanecen iguales a los capturados al inicio de la prueba. No se escribieron datos de Consumibles ni se marcó ninguna etiqueta como impresa en la app; no se hicieron commits ni push.

## Problema observado y corrección

Los dos primeros intentos de L0072 salieron recortados. La foto y la comparación de geometría demostraron que el HTML de prueba había omitido la regla global de la app que hace que el relleno se incluya en las medidas. Sin ella, la etiqueta ocupaba **42,991 × 32,395 mm** y se cortaban QR y barras dentro de la página de 40 × 30. Se corrigió solamente el generador de prueba en esta carpeta.

El usuario confirmó que **L0072 corregida salió completa, centrada y en una sola etiqueta** y autorizó las otras cuatro. Se enviaron una L0021, una L0019, una P0001 y una L0023; las llamadas de impresión terminaron sin errores y la cola quedó vacía. La lectura física con el lector corresponde al usuario.

## Uso cotidiano desde la app

1. En Consumibles → Etiquetas, elegir **Térmica 40 × 30**.
2. Elegir la impresora **P1S Label Printer** y el papel **D 40 x 30 mm**.
3. Orientación vertical, márgenes **Ninguno**, escala **100 %**, sin ajustar a la página; desactivar encabezados y pies.
4. En Etiquetas → Prueba, leer las barras y el QR de cada etiqueta. Los códigos esperados son **L0072, L0021, L0019, P0001 y L0023**; ambos símbolos de cada producto deben devolver el mismo código y la app debe reconocerlo.

## Archivos

- [PDF de cinco etiquetas](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiquetas-5.pdf)
- [L0072](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiqueta-1.png)
- [L0021](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiqueta-2.png)
- [L0019](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiqueta-3.png)
- [P0001](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiqueta-4.png)
- [L0023](C:/klasea-stock/outputs/etiquetas-prueba-2026-10-14/etiqueta-5.png)

Se conservaron las consultas, bitmaps, archivos originales de diagnóstico y resultados de cada envío para poder revisar la prueba.
