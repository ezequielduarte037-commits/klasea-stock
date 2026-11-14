import test from "node:test";
import assert from "node:assert/strict";
import { eliminarFotoPieza, FOTO_MAX_BYTES, subirFotoPieza } from "./piezasLaminacionFotosApi.js";

const pieza = { pieza_id:"9/2", num:9 };
const file = { name:"pieza.jpg", type:"image/jpeg", size:4096 };
function cliente({ uploadError, insertError, signedError, deleteError, removeError } = {}) {
  const calls = [];
  let registro;
  const storage = {
    upload: async (path, original, options) => { calls.push(["upload", path, original, options]); return { error:uploadError }; },
    remove: async paths => { calls.push(["remove", paths]); return { error:removeError }; },
    createSignedUrl: async path => { calls.push(["sign", path]); return { data:signedError ? null : { signedUrl:"https://storage.test/foto" }, error:signedError }; },
  };
  const client = {
    auth:{ getSession:async () => ({ data:{ session:{ user:{ id:"operador" } } } }) },
    storage:{ from:bucket => { assert.equal(bucket, "piezas-laminacion"); return storage; } },
    from:table => {
      assert.equal(table, "piezas_laminacion_imagenes");
      const query = {
        insert: row => { registro = row; calls.push(["insert", row]); return query; },
        delete: () => { calls.push(["delete"]); return query; },
        eq: (key, value) => { calls.push(["eq", key, value]); return query; },
        select: () => query,
        single: async () => ({ data:{ id:"foto-1", ...registro }, error:registro ? insertError : deleteError }),
      };
      return query;
    },
  };
  return { client, calls };
}
const cargar = (client, original=file) => subirFotoPieza(client, { obraId:"obra-1", lineaKey:"k52", pieza, file:original });

test("conserva el original y vincula la foto a la obra y a la unidad exacta", async () => {
  const { client, calls } = cliente();
  const foto = await cargar(client);
  assert.equal(calls[0][2], file);
  assert.equal(calls[0][3].upsert, false);
  assert.match(foto.storage_path, /^obra-1\/k52\/9_2\/[\w-]+\.jpg$/);
  assert.equal(foto.pieza_id, "9/2"); assert.equal(foto.obra_id, "obra-1");
  assert.equal(foto.url, "https://storage.test/foto");
  const otra = await cargar(client);
  assert.notEqual(foto.storage_path, otra.storage_path);
});
test("rechaza archivos no visibles, vacíos o demasiado grandes antes de subir", async () => {
  const { client, calls } = cliente();
  for (const original of [{ ...file, type:"image/heic" }, { ...file, size:0 }, { ...file, size:FOTO_MAX_BYTES+1 }]) {
    await assert.rejects(cargar(client, original));
  }
  assert.deepEqual(calls, []);
});
test("un error de almacenamiento no registra una referencia rota", async () => {
  const { client, calls } = cliente({ uploadError:{ message:"Sin permiso" } });
  await assert.rejects(cargar(client), /Sin permiso/);
  assert.deepEqual(calls.map(c => c[0]), ["upload"]);
});
test("limpia el archivo si no pudo registrar la foto", async () => {
  const { client, calls } = cliente({ insertError:{ message:"Sin permiso" } });
  await assert.rejects(cargar(client), /guardar la referencia/);
  assert.equal(calls.at(-1)[0], "remove");
  assert.equal(calls.at(-1)[1][0], calls[0][1]);
});
test("una falla de vista previa conserva la referencia ya guardada para reintentar", async () => {
  const { client, calls } = cliente({ signedError:{ message:"Red" } });
  const foto = await cargar(client);
  assert.equal(foto.id, "foto-1"); assert.equal(foto.url, null);
  assert.ok(!calls.some(c => c[0] === "remove"));
});
test("un borrado denegado conserva el archivo original", async () => {
  const { client, calls } = cliente({ deleteError:{ message:"Sin permiso" } });
  await assert.rejects(eliminarFotoPieza(client, { id:"foto-1", storage_path:"obra/foto.jpg" }), /quitar la foto/);
  assert.ok(!calls.some(c => c[0] === "remove"));
});
test("quita solo la foto elegida y comunica una limpieza de archivo pendiente", async () => {
  const { client, calls } = cliente({ removeError:{ message:"Red" } });
  const aviso = await eliminarFotoPieza(client, { id:"foto-1", storage_path:"obra/foto.jpg" });
  assert.deepEqual(calls, [["delete"], ["eq", "id", "foto-1"], ["remove", ["obra/foto.jpg"]]]);
  assert.match(aviso, /Se quitó la referencia/);
});
