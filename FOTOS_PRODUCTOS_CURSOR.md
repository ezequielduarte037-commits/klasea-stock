# Guía para completar las fotos de productos con Cursor

Esta guía explica cómo continuar el trabajo de fotografías del catálogo de KlaseA sin degradar su calidad.

Antes de empezar, leé también [CURSOR.md](CURSOR.md) para entender el sistema, la arquitectura y las precauciones con los datos reales.

## Objetivo

Completar progresivamente `imagen_url` de los productos del catálogo de Pañol con fotografías útiles para reconocer cada artículo durante el trabajo diario.

La foto debe mostrar **el producto individual correspondiente**, preferentemente aislado y con buena definición. No buscamos decorar el catálogo ni completar un porcentaje a cualquier precio: buscamos que una persona pueda mirar la miniatura y reconocer qué pieza, equipo o material tiene delante.

## Criterio principal

> **Si no se puede demostrar con suficiente certeza que la imagen corresponde al producto, no se carga.**

Un producto sin foto es mejor que un producto con una foto incorrecta.

No usar:

- Una misma imagen genérica para artículos diferentes.
- Fotos creadas con IA o dibujos inventados.
- Imágenes de una categoría completa, como “cables”, “tornillos” o “herrajes”.
- Fotos ambientales donde el producto casi no se distingue.
- Logos de fabricantes o proveedores.
- Placeholders, iconos, renders sin relación comprobable o imágenes con texto grande de promoción.
- Una foto de otro modelo “parecido”.
- Imágenes obtenidas sólo por parecido visual sin evidencia textual.

## Qué imágenes sí son aceptables

### Nivel A — Exacta y oficial

La mejor opción. La página del fabricante confirma el código o modelo exacto y publica la foto utilizada.

Ejemplo:

```text
Catálogo: Garmin Stereo Fusion MS-RA60
Fuente: ficha oficial de Garmin para MS-RA60
Resultado: apto
```

### Nivel B — Exacta de distribuidor o comercio confiable

Es aceptable cuando no hay una ficha oficial accesible, pero la página de un distribuidor o comercio serio confirma claramente marca, modelo o código y la foto pertenece a esa misma ficha.

Ejemplo:

```text
Catálogo: HELADERA KOHINOOR KFA 3494/7 GRIS
Fuente: publicación comercial específica de KFA 3494/7 gris
Resultado: apto si texto e imagen confirman el modelo
```

### Nivel C — Artículo técnico sin marca o modelo comercial

Sólo es aceptable si la descripción define de forma inequívoca el objeto y sus características visibles coinciden: tipo, geometría, material, medida, cantidad de vías, conexión o terminación.

Por ejemplo, para una bisagra o un terminal se debe poder confirmar la forma y la medida relevante. “Bornera” o “cable” sin modelo, medida ni especificación no alcanza.

Ante la duda, clasificarlo como **inviable por ahora** y explicar qué dato falta.

## Orden recomendado de fuentes

1. Fabricante oficial.
2. Distribuidor oficial.
3. Sitio del proveedor que figura en KlaseA.
4. Comercio reconocido con una ficha específica y verificable.
5. Catálogo técnico o PDF oficial donde el modelo y la imagen estén asociados sin ambigüedad.

Evitar marketplaces con publicaciones cambiantes, páginas de resultados, Pinterest, redes sociales y sitios que mezclan variantes en una sola foto.

La búsqueda de Google o Bing sirve para encontrar la fuente, pero **la página de resultados no es la fuente**. Siempre abrir y validar la ficha final.

## Estado actual del trabajo

Los archivos existentes son:

- [catalog-image-curated.sources.json](scripts/catalog-image-curated.sources.json): manifiesto de fuentes curadas. Actualmente contiene 133 entradas.
- [catalog-image-curated.mjs](scripts/catalog-image-curated.mjs): valida las fuentes del manifiesto, descarga las imágenes y las carga de forma segura.
- [catalog-image-pilot.mjs](scripts/catalog-image-pilot.mjs): integración especializada para códigos oficiales de Barón.
- [catalog-image-pilot.sources.json](scripts/catalog-image-pilot.sources.json): fuentes del piloto inicial.
- [catalog-image-specific-candidates.mjs](scripts/catalog-image-specific-candidates.mjs): encuentra materiales sin imagen cuya descripción parece suficientemente específica.
- [catalog-image-source-inspect.mjs](scripts/catalog-image-source-inspect.mjs): inspecciona una ficha web y enumera posibles imágenes del producto.
- [catalog-image-propagate-identical.mjs](scripts/catalog-image-propagate-identical.mjs): propaga una imagen sólo entre descripciones normalizadas idénticas y sin conflictos.

No reemplazar estos scripts por una carga masiva improvisada. Mejorarlos es válido si se conserva la validación, el modo de simulación y la limpieza ante errores.

## Cómo está protegida la carga

El flujo actual:

1. Busca el producto por su `materialId` estable.
2. Comprueba que la descripción actual siga siendo la esperada.
3. Omite el producto si ya tiene imagen.
4. Abre la página de origen.
5. Confirma al menos dos tokens distintivos del producto.
6. Comprueba que la imagen configurada pertenece a esa ficha.
7. Descarga la imagen y valida su firma real como JPEG, PNG o WebP.
8. Rechaza archivos demasiado pequeños.
9. La copia al bucket `panol-materiales` de Supabase.
10. Registra la procedencia en `panol_material_imagenes`.
11. Actualiza `panol_materiales.imagen_url` únicamente si continuaba vacío.
12. Si algo falla, elimina la carga incompleta y no deja datos a medias.

La aplicación usa la copia de Supabase Storage; no depende de que el sitio externo permita hotlinking en el futuro.

## Flujo de trabajo recomendado

### 1. Revisar el repositorio

Antes de trabajar:

```bash
git status --short
```

No modificar ni revertir cambios ajenos. Para esta tarea, normalmente sólo hace falta tocar el manifiesto curado y, si realmente es necesario, sus scripts.

### 2. Obtener candidatos específicos

El selector es de sólo lectura. Prioriza descripciones con marcas, modelos o códigos reconocibles:

```bash
node scripts/catalog-image-specific-candidates.mjs --limit=80
```

También se puede enfocar una familia:

```bash
node scripts/catalog-image-specific-candidates.mjs --search=garmin --limit=50
node scripts/catalog-image-specific-candidates.mjs --search=kohinoor --limit=50
node scripts/catalog-image-specific-candidates.mjs --search=jabsco --limit=50
```

No asumir que todos los candidatos automáticos son aptos. El puntaje sólo ayuda a priorizar; no prueba identidad.

### 3. Investigar cada producto

Para cada candidato:

1. Copiar descripción, código, proveedor y `materialId`.
2. Separar marca, modelo, medida, tensión, color y variante.
3. Buscar primero una ficha oficial.
4. Confirmar que la ficha diga el mismo modelo o código.
5. Confirmar que no sea una página genérica para una familia de variantes.
6. Abrir la imagen principal y revisarla visualmente.
7. Comparar cualquier detalle visible con la descripción local.

Las búsquedas deben ser específicas. Ejemplos:

```text
"Kohinoor KFA 3494/7 gris"
"Fusion MS-RA60" site:garmin.com
"Jabsco Par-Max HD5 12V"
"R05899" site:baron.com.ar
```

No alcanza con que el título se parezca. El código o modelo exacto debe aparecer en la ficha fuente.

### 4. Inspeccionar técnicamente la fuente

El inspector ayuda a encontrar la imagen publicada dentro de una ficha:

```bash
node scripts/catalog-image-source-inspect.mjs --url=https://sitio/ficha-del-producto --token=MODELO
```

Revisar:

- `hasToken` debe ser `true`.
- `title` debe corresponder al artículo.
- `productImages` debe contener la imagen individual correcta.
- La imagen elegida debe verse antes de incorporarla.

El inspector sólo presenta candidatos; no reemplaza la revisión visual y semántica.

### 5. Incorporar una fuente al manifiesto

Agregar una entrada en `scripts/catalog-image-curated.sources.json`:

```json
{
  "materialId": "UUID-REAL-DEL-MATERIAL",
  "expectedDescription": "DESCRIPCIÓN EXACTA ACTUAL EN KLASEA",
  "model": "Marca y modelo legibles",
  "sourceName": "Fabricante o comercio",
  "sourcePage": "https://sitio/ficha-especifica",
  "sourceTokens": ["marca", "modelo-distintivo"],
  "imageUrl": "https://sitio/imagen-del-producto.jpg",
  "imageProof": "embedded"
}
```

Reglas para los campos:

- `materialId`: siempre usar el UUID real; nunca relacionar por nombre.
- `expectedDescription`: copiar exactamente el valor actual de la base.
- `model`: nombre humano y específico para los reportes.
- `sourceName`: organización que publica la ficha.
- `sourcePage`: ficha del producto, no inicio del sitio ni resultado de búsqueda.
- `sourceTokens`: como mínimo dos señales distintivas presentes en la ficha; evitar palabras genéricas como “bomba”, “acero” o “cable”.
- `imageUrl`: imagen exacta publicada por esa ficha.
- `imageProof`: usar `og` cuando `og:image` es la imagen principal exacta; usar `embedded` cuando la URL está publicada dentro del HTML de la ficha.

Cada `materialId` debe aparecer una sola vez en el manifiesto.

### 6. Ejecutar siempre una simulación

Sin `--apply`, el script valida pero no escribe:

```bash
node scripts/catalog-image-curated.mjs
```

Leer el informe completo. Una entrada apta debe aparecer como `validado`. Corregir u omitir las entradas cuya fuente haya cambiado, no confirme los tokens o no publique ya la misma imagen.

### 7. Aplicar solamente el lote validado

La siguiente orden escribe en el catálogo real:

```bash
node scripts/catalog-image-curated.mjs --apply
```

Ejecutarla sólo cuando:

- La persona usuaria haya autorizado aplicar las imágenes.
- El dry-run haya sido exitoso.
- Las imágenes nuevas hayan sido revisadas visualmente.
- Se haya confirmado que los productos todavía no tienen foto.

El script no sobrescribe una imagen existente. Si otra persona cargó una mientras se procesaba el lote, la nueva carga se cancela y se limpia.

### 8. Propagar únicamente identidades verdaderamente iguales

Primero simular:

```bash
node scripts/catalog-image-propagate-identical.mjs
```

Después de revisar cada grupo, se puede aplicar:

```bash
node scripts/catalog-image-propagate-identical.mjs --apply
```

Esto sólo es seguro cuando la descripción normalizada es idéntica y el grupo tiene una única imagen de origen. Aun así, revisar el informe antes de escribir. No ampliar la propagación a coincidencias aproximadas.

## Caso especial: productos Barón

Los productos Barón con códigos como `R05899` tienen un flujo especializado que confirma el mismo código en la página oficial y busca su imagen oficial.

Validar códigos concretos:

```bash
node scripts/catalog-image-pilot.mjs --codes=R05899,R05788
```

Aplicarlos después de revisar el informe:

```bash
node scripts/catalog-image-pilot.mjs --codes=R05899,R05788 --apply
```

El modo automático también existe, pero debe usarse con un lote acotado:

```bash
node scripts/catalog-image-pilot.mjs --auto-baron --limit=20 --attempts=100
```

Primero ejecutar sin `--apply`. Aplicar sólo las coincidencias únicas confirmadas por la fuente oficial.

## Tamaño de los lotes

Se puede investigar una cantidad grande de candidatos en una misma sesión, pero la aplicación debe dividirse en lotes revisables.

Recomendación:

- Preparar entre 20 y 40 candidatos específicos.
- Descartar inmediatamente los ambiguos.
- Revisar visualmente los que tengan fuente válida.
- Aplicar entre 10 y 25 fotos verificadas por lote.
- Emitir un reporte antes de continuar con el siguiente lote.

La meta no es hacer “una imagen por mensaje”, pero tampoco cargar cientos sin control. Cursor puede investigar varias familias en paralelo, siempre que la verificación final sea individual.

## Variantes

Si un registro agrupa varias variantes y éstas cambian visualmente, no asignar la foto de una variante al producto general.

Casos típicos:

- Colores diferentes.
- Medidas que cambian la forma o proporción.
- Modelos con conectores distintos.
- Productos agrupados bajo una descripción demasiado corta.

El piloto de Barón admite imágenes dentro de `variantes_precios`. Para otras fuentes, no improvisar una estructura nueva: revisar primero cómo consume las variantes [panolApi.js](src/features/panol/panolApi.js) y conservar compatibilidad con `imagen_url`/`imagenUrl` existentes.

## Cuándo declarar un producto inviable

Marcar como inviable por ahora cuando ocurra alguno de estos casos:

- La descripción es demasiado genérica.
- Falta marca, modelo, código o medida crítica.
- El código no tiene resultados confiables.
- Distintos productos comparten el mismo código textual.
- La ficha mezcla variantes y no permite asociar la foto correcta.
- Sólo aparecen imágenes de baja calidad, logos o fotos ambientales.
- Las fuentes encontradas se contradicen.
- La única opción sería inventar o generar una imagen.

No editar la descripción del catálogo para forzar una coincidencia durante esta tarea. Informar el dato faltante para que Pañol o Compras puedan completarlo.

## Control de calidad visual

Antes de aprobar cada foto, comprobar:

- Hay un solo producto principal o el contenido del kit está claramente representado.
- El objeto no está cortado de forma que impida reconocerlo.
- El fondo y el contraste permiten leerlo como miniatura.
- La resolución es suficiente.
- No es una miniatura de navegación ni un placeholder.
- No tiene una marca de agua invasiva.
- No muestra un modelo, color, tensión o conexión diferente.
- No repite por comodidad la foto de otro producto.

La interfaz usa `object-fit: contain`, por lo que suelen funcionar mejor las fotos de catálogo con el artículo centrado y fondo limpio.

## Seguridad y datos reales

Los scripts de aplicación usan credenciales privadas disponibles localmente. Nunca:

- Mostrar su valor en la terminal o en el chat.
- Copiarlas dentro de esta guía o del manifiesto.
- Confirmar archivos `.env` en Git.
- Ejecutar una actualización general por fuera de los scripts validados.
- Sobrescribir productos que ya tienen una foto revisada.
- Borrar imágenes o filas históricas para repetir un lote.

Las lecturas, búsquedas y dry-runs no modifican el catálogo. La opción `--apply` sí modifica Supabase y requiere especial cuidado.

## Reporte obligatorio de cada lote

Al finalizar, informar con este formato:

```text
Lote de fotos de catálogo

- Candidatos revisados: 30
- Fotos aplicadas: 18
- Ya tenían foto: 3
- Descartados por ambigüedad: 5
- Inviables por falta de datos: 4

Aplicados:
1. DESCRIPCIÓN — código — fuente
2. DESCRIPCIÓN — código — fuente

Inviables o pendientes:
1. DESCRIPCIÓN — falta modelo exacto
2. DESCRIPCIÓN — la fuente mezcla dos variantes

Verificación:
- Dry-run correcto
- Aplicación correcta
- Sin imágenes existentes sobrescritas
- Revisión visual realizada
```

Guardar además una lista clara de las descripciones y códigos que recibieron foto. El usuario debe poder preguntar después “¿a cuáles les agregaste imagen?” y obtener una respuesta exacta.

## Instrucción lista para pegar en Cursor

```text
Leé @CURSOR.md y @FOTOS_PRODUCTOS_CURSOR.md completos.

Quiero que continúes completando fotos del catálogo de productos. Trabajá sobre
productos activos que todavía no tengan imagen y priorizá descripciones con
marca, modelo, código o especificaciones suficientes. La fotografía debe ser
individual y corresponder al producto exacto; no uses imágenes genéricas, no
generes fotos con IA y no reutilices una foto para artículos sólo parecidos.

Usá los scripts y el manifiesto existentes. Investigá fuentes oficiales o fichas
comerciales específicas, verificá texto e imagen, revisá visualmente cada caso y
ejecutá primero el dry-run. No sobrescribas fotos existentes ni cambies datos del
producto para forzar coincidencias. Si un artículo no se puede identificar con
certeza, dejalo sin foto e informá qué dato falta.

Prepará un lote razonable, mostrame el informe del dry-run y pedime confirmación
antes de ejecutar cualquier comando con --apply. Al terminar, listá exactamente
todos los productos modificados y sus fuentes.
```

## Resultado esperado

El catálogo debe crecer más lentamente que con una carga genérica, pero cada nueva fotografía tiene que aportar reconocimiento real y confianza. El éxito no se mide sólo por cuántos productos tienen imagen, sino por cuántas de esas imágenes ayudan de verdad a encontrar y manipular el artículo correcto.

