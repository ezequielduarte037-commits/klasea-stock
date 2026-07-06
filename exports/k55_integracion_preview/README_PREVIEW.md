# Preview integracion K55 desde Excel

Archivo: `D:\Descargas 2\K55 seguimiento (2).xlsx`  
Hoja: `K55_Listado_Stock`  
Filas con item: **324**

## Clasificacion

- STD: 261
- OBRA_ESPECIFICA: 39
- OPC: 15
- VAR: 7
- ADC: 1
- MIXTO: 1

## Salidas generadas iniciales

- `01_todas_las_filas_k55.csv`
- `02_std_preliminar_matriz_k55.csv`
- `03_std_a_revisar_antes_de_matriz.csv`
- `04_obra_especifica_no_matriz.csv`
- `05_opc_var_adc_fuera_de_matriz.csv`
- `06_dudas_para_esteban.csv`
- `07_duplicados_internos_excel.csv`

## Cruce contra catalogo vivo

- Catalogo usado: `C:\Users\Esteban\Downloads\Supabase Snippet Purchase requests dashboard filters (1).csv`
- Script: `scripts/k55-match-catalog-preview.mjs`
- `10_match_catalogo_preview.csv`: preview completo del match.
- `14_match_catalogo_preview_seguro.csv`: preview final con filtro conservador.
- `15_import_seguro_exactos_y_nuevos.csv`: filas efectivamente importables.
- `16_revisar_antes_de_importar.csv`: filas NO importadas, quedan para revision.

## Import aplicado

SQL aplicado en Supabase:

- `20_import_seguro_k55.sql`

Dry-run sin cambios:

- `20_import_seguro_k55_DRY_RUN.sql`

Resultado aplicado:

- 61 materiales existentes reusados por match exacto; solo se seteo cantidad K55.
- 136 materiales nuevos creados con `origen='import_k55_excel'`.
- 197 filas cargadas en `panol_material_modelo` para `modelo='55'` y `variante='standard'`.
- 127 filas quedaron fuera del import para revisar.

Correccion posterior por criterio mas amplio:

- `21_correccion_anodos_k55.sql`: se agregaron `Anodo escudo` K55=1 y `Anodo timon` K55=2 reutilizando materiales existentes.
- `22_import_todos_std_k55.sql`: se cargaron todas las filas STD del Excel aunque fueran posibles duplicados o tuvieran datos a revisar.
- `23_verificar_todos_std_k55.sql`: verificacion de cobertura final.

Resultado final STD:

- Filas STD del Excel: 261.
- Filas STD cubiertas con material y cantidad K55: 261.
- Sin material: 0.
- Sin cantidad K55: 0.
- Total actual en matriz K55 standard: 267, porque hay filas K55 existentes fuera del set STD importado.

Distribucion de lo pendiente:

- NO_MATRIZ: 63
- REVISAR_POSIBLE_DUPLICADO: 34
- REVISAR_ANTES_DE_MATRIZ: 26
- REVISAR_DUDA_CRITICA: 4

Verificacion post-import:

- `panol_materiales where origen='import_k55_excel'`: 136.
- `panol_material_modelo where modelo='55' and variante='standard'`: 197.

## Criterio usado

- EXACTO: se reusa el `material_id` existente y se actualiza solamente K55.
- NUEVO seguro: se crea material y se setea K55.
- PROBABLE, posible duplicado, OPC, VAR, ADC, SOLO BARCO o dudas de modelo/link: no se importan.
- Las observaciones de materiales nuevos se guardan en `notas`.
- Las observaciones de materiales reusados se agregan a `notas` con etiqueta `[K55 Excel fila X]` para no perder contexto.
- Filas sin rubro se asignaron a categoria generica y `revisado=false`.

## Flag True

- Filas con Flag=True: 16. Se ignoran para logica, quedan como dato original.

## Proveedores principales

- (sin proveedor): 166
- Flojumar: 64
- Casa Iriarte: 48
- Maxi Herrero: 14
- Trimer: 11
- Baron: 8
- MercadoLibre: 8
- Astillero: 2
- Parra: 1
- Rincon del Herraje: 1
- Tableros Costa: 1

## Rubros

- Sanitarios: 100
- Electricidad: 89
- (sin rubro): 65
- Mecanica: 46
- Carpinteria: 24
