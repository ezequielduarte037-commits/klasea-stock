import { COLA_KEY, leerCola } from "./mostradorLogica.js";

const DB_NOMBRE = "klasea.consumibles.mostrador";

/**
 * Cada operación ocupa un registro. La lectura y la modificación van en la
 * misma transacción: una pestaña nunca reemplaza la cola completa de otra.
 * Se resuelve recién en oncomplete, porque onsuccess de put no prueba que el
 * navegador haya podido confirmar la escritura (cuota, disco, modo privado).
 */
export function crearAlmacenOperaciones(indexedDB = globalThis.indexedDB) {
  let conexion;
  function abrir() {
    if (!indexedDB) return Promise.reject(new Error("Este navegador no puede guardar retiros en el equipo."));
    if (!conexion) conexion = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NOMBRE, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore("operaciones", { keyPath: "id" });
        store.createIndex("borradorId", "borradorId", { unique: true });
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => { req.result.close(); conexion = null; };
        resolve(req.result);
      };
      req.onerror = () => { conexion = null; reject(req.error); };
      req.onblocked = () => { conexion = null; reject(new Error("Cerrá las otras pestañas para abrir el almacenamiento del mostrador.")); };
    });
    return conexion;
  }

  async function transaccion(modo, accion) {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      // strict pide durabilidad antes de avisar éxito donde el navegador la admite.
      let tx;
      try { tx = db.transaction("operaciones", modo, { durability: "strict" }); }
      catch { tx = db.transaction("operaciones", modo); }
      let resultado;
      let causa;
      tx.oncomplete = () => resolve(resultado);
      tx.onabort = () => reject(causa ?? tx.error ?? new Error("No se pudo guardar la operación."));
      tx.onerror = () => { /* onabort informa el resultado de toda la transacción */ };
      const store = tx.objectStore("operaciones");
      const listo = (valor) => { resultado = valor; };
      const fallar = (error) => { causa = error; tx.abort(); };
      try { accion(store, listo, fallar); } catch (e) { fallar(e); }
    });
  }

  return {
    listar: () => transaccion("readonly", (s, listo) => {
      const req = s.getAll(); req.onsuccess = () => listo(req.result);
    }),
    guardar: (envio) => transaccion("readwrite", (s, listo) => {
      const req = s.index("borradorId").get(envio.borradorId);
      req.onsuccess = () => {
        if (req.result) { listo(req.result); return; }
        s.add(envio); listo(envio);
      };
    }),
    actualizar: (id, cambiar) => transaccion("readwrite", (s, listo, fallar) => {
      const req = s.get(id);
      req.onsuccess = () => {
        try {
          const siguiente = cambiar(req.result);
          if (!siguiente) throw new Error("No encuentro la operación guardada.");
          s.put(siguiente); listo(siguiente);
        } catch (e) { fallar(e); }
      };
    }),
  };
}

export const almacenOperaciones = crearAlmacenOperaciones();

/** Primero se copia, después se retira la cola vieja; un corte no pierde filas. */
export async function migrarColaAnterior(almacen, storage) {
  if (!storage) return;
  const texto = storage.getItem(COLA_KEY);
  if (!texto) return;
  const original = JSON.parse(texto);
  const cola = leerCola(storage);
  if (!Array.isArray(original) || cola.length !== original.length) throw new Error("La cola anterior necesita revisión: conservamos los datos originales.");
  for (const e of cola) await almacen.guardar({ ...e, borradorId: `anterior:${e.id}`, estado: "incierto", fueIncierto: true, finalizada: true });
  // Otra pestaña puede estar terminando la migración: nunca se borra una versión distinta.
  if (storage.getItem(COLA_KEY) === texto) storage.removeItem(COLA_KEY);
}
