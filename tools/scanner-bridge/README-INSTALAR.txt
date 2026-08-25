KLASE A - SCANNER DE REMITOS PARA PANOL
=======================================

ANTES DE EMPEZAR
1. Conecta la Pantum M6559NW por USB a la PC de Panol.
2. Enciende la impresora.
3. Copia esta carpeta completa a esa PC. No ejecutes desde dentro del ZIP.

INSTALACION
1. Hace doble click en INSTALAR-EN-PANOL.cmd.
2. Acepta el permiso de administrador.
3. Si se abre Pantum, elegi instalacion por USB y termina el asistente.
4. Espera hasta ver INSTALACION TERMINADA.

VINCULACION (UNA SOLA VEZ)
1. Abri el acceso del Escritorio: Klase A - Escanear remitos.
2. Abri: Klase A - Codigo scanner.
3. Copia el codigo de 16 caracteres y pegalo en la pantalla.
4. Apreta Vincular.

DONDE ESTA EL CODIGO
%LOCALAPPDATA%\KlaseA\Scanner\codigo-vinculacion.txt

USO DIARIO
- Desde Panol > Remitos: escaneo general.
- Desde Panol > Recepcion > abrir un aviso: Escanear remito y cruzarlo
  directamente con los productos pendientes de ese aviso.
- La IA propone coincidencias. El stock no cambia hasta que una persona revisa
  y confirma.

SI ALGO NO FUNCIONA
Abri el acceso: Klase A - Diagnostico scanner.
Saca una foto del resultado y del ultimo error.

NO HACE FALTA INSTALAR PANTUM OCR
La lectura la hace la IA de Klase A. El paquete instala solamente el driver
oficial, NAPS2 y Node.js, que son los componentes necesarios.
