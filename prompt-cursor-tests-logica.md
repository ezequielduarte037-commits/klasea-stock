# Tarea para Cursor: tests de la lógica que ya funciona

Fecha: 18/11/2026. Leé antes `CURSOR.md`.

El objetivo es dejar escrito, con tests, cómo funcionan hoy ocho archivos de lógica pura. Así, si alguien los cambia y rompe algo, salta el test. **No hay que cambiar nada de la app.**

## Qué podés tocar y qué no

- **Sólo creás archivos nuevos `*.test.mjs`**, al lado del archivo que prueban (por ejemplo `normalizarLista.js` → `normalizarLista.test.mjs`).
- **No modifiques ningún `.js`/`.jsx` de `src/`**, ni siquiera para "arreglar" un import o un error que encuentres. Tampoco `package.json`: no agregues Vitest, Jest ni otras dependencias.
- No te conectes a Supabase ni escribas datos en producción. Estos archivos no lo necesitan.
- No hagas commits. Hay otros agentes trabajando en el repo y yo reviso y commiteo.

## Cómo se escriben los tests en este repo

Ya hay 58 archivos de tests (por ejemplo `src/features/compras/adicionalesPdf.test.mjs` y `src/features/panol/stockGrupos.test.mjs`). Usá el mismo estilo:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { factorCompra } from "./normalizarLista.js";

test("caja x 100 unidades: el factor es 100", () => {
  assert.equal(factorCompra({ unidadEntrega: "unidad", unidadCompra: "unidad", contenido: 100 }), 100);
});
```

- El nombre de cada test es **una frase en castellano que dice la regla del negocio**, no el nombre de la función. Por ejemplo: «si piden un viernes, retiran el lunes», no «diaRetiroDefault caso 3».
- Los datos de prueba son inventados y cortos. Nada de nombres reales de empleados.
- Las fechas van fijas y con zona explícita (por ejemplo `new Date("2026-11-20T18:30:00-03:00")`). Nunca `new Date()` sin argumentos: el test tiene que dar lo mismo en cualquier PC y a cualquier hora.
- Para `materialesParser.js` armá la planilla en memoria con `XLSX.utils` (`xlsx` ya está instalado). No leas archivos del disco.

Para correrlos (Node 24, en Windows):

```
node --test --test-isolation=none <archivos>
```

## Los ocho archivos (en este orden)

Todos se pueden importar directo con Node, sin alias `@/`. Ya lo probé.

1. **`src/features/consumibles/precios/normalizarLista.js`** — convierte la lista de precios de Rebollar. Es el más importante. En la lista real vienen pesos y dólares mezclados, unidades pegadas al texto ("UREICAxKG", "THREEBONDx100ml", "x100unid"), y hubo factores de compra mal cargados. Probá `normalizarMoneda`, `normalizarCondicion` (+IVA y Final: en los dos el costo sin IVA es el precio), `interpretarContenido`, `normalizarUnidad`, `factorCompra` (incluido cuándo devuelve `null`), `costoUnitario`, `encontrarEncabezado`, `normalizarRenglon` con y sin dólar, y `compararListas`.
2. **`src/features/consumibles/precios/preciosLogica.js`** — quién puede gestionar precios, formato de pesos y porcentajes, `mismoProveedor`, `listaAnterior`, `heredarMateriales`, `problemasRenglon`.
3. **`src/features/consumibles/catalogo/emparejar.js`** — empareja consumibles del catálogo con renglones de la lista. Probá que el candidato correcto sale primero, que los empates se resuelven por tamaño (`porTamano`) y que debajo de `minimo` no propone nada.
4. **`src/features/consumibles/lista/listaLib.js`** — la lista del día siguiente del pañol. Reglas: si piden un viernes retiran el lunes, si es sábado también el lunes, y nunca se ofrece retirar un sábado o un domingo. Después de las 15:00 (hora de Argentina) llega tarde, y 15:00 en punto todavía no. Probá también `buscarConsumibles` (tildes y mayúsculas no importan) y `fmtCant`.
5. **`src/features/obras/fechasEngine.js`** — días de producción. Probá que `addProductionDays` saltea los períodos no laborables, `normalizeNonWorkingPeriods`, `nonWorkingDaysCount`, `getDesmoldeReference` y `getProductionStageSchedule` con una obra de ejemplo.
6. **`src/features/panol/carpetaRemitos.js`** — en qué carpeta física va cada remito (por obra, varias obras, o proveedores). Probá el largo máximo (`MAX_NOMBRE_CARPETA`), los caracteres que no van en un nombre de carpeta (`carpetaParaDisco`) y `destinosDeRemito`.
7. **`src/features/search/searchText.js`** — el buscador. Probá `normalize` (tildes, mayúsculas), `tokenize`, `tokenVariants` (plurales), `cleanIlike` (que no se cuelen `%` ni `_`) y que `rankRows` ordena bien y respeta `limit` y `minRatio`.
8. **`src/features/materiales/materialesParser.js`** — lee la planilla de la matriz de materiales (modelos 37, 52 y 55). Probá `norm`, `normalizeDescription`, `toBomMap` con la variante `standard` y con `linea_eje`, `varianteDeModelo`, `csvCell` (comillas, comas y saltos de línea) y un `parseMaterialesWorkbook` chico armado en memoria.

Si te quedás sin tiempo, mejor cuatro archivos bien cubiertos que ocho a medias.

## Si un test revela algo que parece un error

**No cambies el código, y tampoco escribas el test para que pase con lo que parece mal.** Escribilo con lo que debería dar, marcalo `test.todo("…")` o con `{ todo: true }` y anotalo en el informe. Esos casos los decidimos nosotros: a veces lo que parece un error es una regla del negocio.

## Línea de base

Hoy hay 558 tests: pasan 556 y **ya fallaban 2** en `src/lib/notificacionesLogistica.test.mjs`. Esos dos no son tuyos: no los toques.

## Para dar por terminado

1. `node --test --test-isolation=none <tus archivos>` sin ningún fallo (los `todo` no cuentan como fallo).
2. `npx eslint <tus archivos>` sin errores.
3. Escribí `docs/tests/informe-cursor.md` con:
   - los archivos de test que creaste y cuántos tests tiene cada uno;
   - las funciones de cada archivo que no probaste, y por qué;
   - **los casos dudosos o que parecen errores**, cada uno con la entrada, lo que da hoy y lo que esperabas;
   - el comando exacto para correrlos.
