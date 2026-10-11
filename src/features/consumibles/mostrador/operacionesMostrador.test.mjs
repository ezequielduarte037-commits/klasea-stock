import test from "node:test";
import assert from "node:assert/strict";
import { conTimeout, evaluarCupo, problemasDelCarrito, retirosPendientesDe, separarRafaga } from "./mostradorLogica.js";
import {
  consultaVigente, consumirRafaga, corregirRechazo, crearOperacion, fechaRequiereRevision,
  finalizarOperacion, limpiarCanjes, pendientesVisibles, puedeEditar, reclamarOperacion,
  reconciliarHoy, recuperarOperacion, resolverOperacion, tokenConsulta, transicionControl,
} from "./operacionesMostrador.js";
import { cerrarOperacion, procesarOperacion, revisarOperacion } from "./mostradorEnvios.js";
import { migrarColaAnterior } from "./mostradorPersistencia.js";
import { COLA_KEY } from "./mostradorLogica.js";

const AHORA = Date.parse("2026-10-13T10:00:00Z");
const nueva = (id = "L") => crearOperacion({ id, borradorId: "carrito:" + id, tipo: "retiro", creadoAt: new Date(AHORA).toISOString(),
  filas: [{ id: "fila:" + id, tipo: "retiro", sede: "Chubut", material_id: "disco", empleado_id: "A", cantidad: -1, lote: id }],
  borrador: { persona: { id: "A" }, destino: { tipo: "obra", obraId: "obra:A" }, carrito: [{ materialId: "disco", cantidad: 1 }] } });
const control = () => ({ carritoId: "carrito:L", pedido: 1, paso: "firmar", guardando: false, operacionId: null, auto: true });

// El adaptador serializa cada cambio como lo hace la transacción de IndexedDB;
// permite forzar errores y respuestas tardías sin escribir en Supabase.
function almacenMemoria(iniciales = [nueva()]) {
  const datos = new Map(iniciales.map((e) => [e.id, structuredClone(e)]));
  let serie = Promise.resolve();
  return {
    datos,
    listar: async () => [...datos.values()].map((e) => structuredClone(e)),
    guardar: async (e) => {
      const anterior = [...datos.values()].find((v) => v.borradorId === e.borradorId);
      if (anterior) return structuredClone(anterior);
      datos.set(e.id, structuredClone(e)); return structuredClone(e);
    },
    actualizar(id, cambiar) {
      const siguiente = serie.then(() => {
        const e = cambiar(structuredClone(datos.get(id)));
        datos.set(id, structuredClone(e)); return structuredClone(e);
      });
      serie = siguiente.catch(() => {});
      return siguiente;
    },
  };
}
const dependencias = (almacen, extras = {}) => ({ almacen, token: "pestaña:A", online: true, ahora: () => AHORA,
  enviar: async () => [], consultar: async () => [], ...extras });

test("la operación congela filas, ids, firmante, destino y hora antes del envío", () => {
  const e = nueva();
  const copia = crearOperacion(e);
  e.filas[0].id = "otro"; e.borrador.persona.id = "B";
  assert.equal(copia.filas[0].id, "fila:L");
  assert.equal(copia.filas[0].created_at, "2026-10-13T10:00:00.000Z");
  assert.equal(copia.borrador.persona.id, "A");
  assert.equal(copia.borrador.destino.obraId, "obra:A");
});

test("F5 recupera la misma operación y una marca terminada invalida el borrador", () => {
  const e = nueva();
  assert.equal(recuperarOperacion([e], e.borradorId, "Chubut").id, "L");
  const terminada = finalizarOperacion(e);
  assert.equal(recuperarOperacion([terminada], e.borradorId, "Chubut").finalizada, true);
  assert.equal(recuperarOperacion([terminada], "nuevo", "Chubut"), null);
});

test("al volver sin sessionStorage se encuentra una operación sin terminar por sede", () => {
  const e = nueva();
  assert.equal(recuperarOperacion([e], "nueva-pestaña", "Chubut").id, e.id);
  assert.equal(recuperarOperacion([e], "nueva-pestaña", "Pampa"), null);
});

test("el cierre confirma la marca y quita el borrador antes de entregar el resultado", async () => {
  const almacen = almacenMemoria();
  let quitado = false;
  const resultado = await cerrarOperacion("L", { almacen, borrarBorrador: () => {
    assert.equal(almacen.datos.get("L").finalizada, true); quitado = true;
  } });
  assert.equal(quitado, true); assert.equal(resultado.finalizada, true);
});

test("un fallo de persistencia al terminar no habilita el resultado de éxito", async () => {
  let quitado = false;
  await assert.rejects(cerrarOperacion("L", { almacen: { actualizar: async () => { throw Error("disco lleno"); } },
    borrarBorrador: () => { quitado = true; } }), /disco lleno/);
  assert.equal(quitado, false);
});

test("un borrador que no se pudo retirar tampoco muestra el resultado", async () => {
  await assert.rejects(cerrarOperacion("L", { almacen: almacenMemoria(), borrarBorrador: () => { throw Error("almacenamiento bloqueado"); } }), /bloqueado/);
});

test("otra tarjeta corta el automático e invalida la consulta anterior", () => {
  const antes = control();
  const token = tokenConsulta(antes);
  const despues = transicionControl(antes, { tipo: "tarjeta" });
  assert.equal(despues.auto, false);
  assert.equal(consultaVigente(despues, token), false);
});

test("confirmar invalida las consultas y bloquea cambios, Escape y nuevas tarjetas", () => {
  const antes = control(); const token = tokenConsulta(antes);
  const cerrado = transicionControl(antes, { tipo: "confirmar" });
  assert.equal(consultaVigente(cerrado, token), false);
  assert.equal(puedeEditar(cerrado), false);
  for (const evento of [{ tipo: "tarjeta" }, { tipo: "paso", paso: "marcar" }, { tipo: "identificar", auto: true }]) {
    assert.equal(transicionControl(cerrado, evento), cerrado);
  }
});

test("una operación persistida no vuelve a ser editable al terminar la espera", () => {
  const c = transicionControl(transicionControl(control(), { tipo: "confirmar" }), { tipo: "persistida", id: "L" });
  const fallida = transicionControl(c, { tipo: "error" });
  assert.equal(fallida.guardando, false); assert.equal(puedeEditar(fallida), false);
  assert.equal(fallida.operacionId, "L");
});

test("Listo rechaza una identificación tardía; el siguiente carrito tiene otro id", () => {
  const token = tokenConsulta(control());
  const listo = transicionControl(control(), { tipo: "terminar" });
  assert.equal(consultaVigente(listo, token), false);
  const siguiente = transicionControl(listo, { tipo: "empezar", id: "B" });
  assert.equal(siguiente.carritoId, "B"); assert.equal(siguiente.auto, false);
  assert.equal(siguiente.operacionId, null); assert.equal(consultaVigente(siguiente, token), false);
});

test("vaciar, cancelar y cambiar de paso invalidan las lecturas pendientes", () => {
  const c = control(); const token = tokenConsulta(c);
  for (const evento of [{ tipo: "empezar", id: "vacío" }, { tipo: "paso", paso: "marcar" }]) {
    assert.equal(consultaVigente(transicionControl(c, evento), token), false);
  }
});

test("KA0002 se consume aunque el campo de piezas lo haya saneado como 0002", () => {
  const teclas = [..."KA0002"].map((k, i) => ({ k, t: i * 10 }));
  assert.deepEqual(consumirRafaga(teclas, "0002", "37", separarRafaga), { codigo: "KA0002", previo: "37" });
});

test("un escaneo sobre el panel de la balanza no aplica la pesada anterior", () => {
  const teclas = [..."KA0002"].map((k, i) => ({ k, t: i * 10 }));
  assert.equal(consumirRafaga(teclas, "", "", separarRafaga).codigo, "KA0002");
  assert.equal(consumirRafaga([{ k: "2", t: 0 }], "2", "", separarRafaga), null);
});

test("las lecturas pendientes vencen y el cupo sin verificar pide autorización", async () => {
  await assert.rejects(conTimeout(new Promise(() => {}), 5), (e) => e.esTimeout);
  const exc = evaluarCupo([{ materialId: "disco", cantidad: 1 }], new Map([["disco", { config: { cupo_diario: 2 } }]]), new Map(), { incierto: true });
  assert.equal(exc[0].incierto, true);
});

test("dos pestañas no reclaman a la vez ni pisan el resultado con respuestas tardías", () => {
  const a = reclamarOperacion(nueva(), "A", AHORA);
  assert.equal(reclamarOperacion(a, "B", AHORA), a);
  const b = reclamarOperacion(a, "B", AHORA + 46_000);
  assert.equal(resolverOperacion(b, "A", { enviado: true }), b);
  assert.equal(resolverOperacion(b, "B", { enviado: true }).estado, "enviado");
});

test("los envíos de dos carritos quedan conservados aunque se resuelvan juntos", async () => {
  const almacen = almacenMemoria([nueva("A"), nueva("B")]);
  await Promise.all([procesarOperacion("A", dependencias(almacen)), procesarOperacion("B", dependencias(almacen, { token: "B" }))]);
  assert.equal(almacen.datos.size, 2);
  assert.ok([...almacen.datos.values()].every((e) => e.estado === "enviado"));
});

test("un doble envío concurrente reclama una sola vez y usa los ids originales", async () => {
  const almacen = almacenMemoria(); let enviados = 0;
  const enviar = async (filas) => { enviados += 1; assert.equal(filas[0].id, "fila:L"); };
  await Promise.all([procesarOperacion("L", dependencias(almacen, { enviar })), procesarOperacion("L", dependencias(almacen, { enviar, token: "B" }))]);
  assert.equal(enviados, 1);
});

test("sin red queda pendiente, un timeout queda incierto y un constraint rechazado", async () => {
  for (const [online, error, esperado] of [[false, null, "pendiente"], [true, { esTimeout: true, message: "lento" }, "incierto"], [true, { code: "23514", message: "constraint" }, "rechazado"]]) {
    const almacen = almacenMemoria();
    const e = await procesarOperacion("L", dependencias(almacen, { online, enviar: async () => { throw error; } }));
    assert.equal(e.estado, esperado);
  }
});

test("un rechazo definitivo no se vuelve a enviar ni por el reloj ni por reintento", async () => {
  const rechazado = { ...nueva(), estado: "rechazado" };
  let intentos = 0;
  const almacen = almacenMemoria([rechazado]);
  await procesarOperacion("L", dependencias(almacen, { enviar: async () => { intentos += 1; } }));
  assert.equal(intentos, 0); assert.equal(almacen.datos.get("L").estado, "rechazado");
});

test("una fecha mayor a 72 h queda suspendida con la fecha real intacta", async () => {
  const e = nueva(); e.creadoAt = "2026-10-10T09:00:00Z"; e.filas[0].created_at = e.creadoAt;
  assert.equal(fechaRequiereRevision(e, AHORA), true);
  let enviado = false;
  const resultado = await procesarOperacion("L", dependencias(almacenMemoria([e]), { enviar: async () => { enviado = true; } }));
  assert.equal(resultado.estado, "vencido"); assert.equal(enviado, false);
  assert.equal(resultado.filas[0].created_at, "2026-10-10T09:00:00Z");
});

test("si vence mientras se consultan los ids, tampoco se manda con otra fecha", async () => {
  const almacen = almacenMemoria(); let ahora = AHORA; let enviados = 0;
  const resultado = await procesarOperacion("L", dependencias(almacen, {
    ahora: () => ahora, consultar: async () => { ahora += 73 * 60 * 60_000; return []; }, enviar: async () => { enviados += 1; },
  }));
  assert.equal(resultado.estado, "vencido"); assert.equal(enviados, 0);
});

test("si los ids ya estaban registrados después de un timeout, no se insertan otra vez", async () => {
  const almacen = almacenMemoria([{ ...nueva(), estado: "incierto" }]); let enviados = 0;
  const resultado = await procesarOperacion("L", dependencias(almacen, { consultar: async () => [{ id: "fila:L" }], enviar: async () => { enviados += 1; } }));
  assert.equal(resultado.estado, "enviado"); assert.equal(enviados, 0);
});

test("un fallo del commit local después de la respuesta remota no muestra éxito", async () => {
  const base = almacenMemoria(); let n = 0;
  const almacen = { actualizar: (id, f) => { n += 1; if (n === 3) return Promise.reject(Error("disco lleno")); return base.actualizar(id, f); } };
  await assert.rejects(procesarOperacion("L", dependencias(almacen)), /disco lleno/);
  assert.equal(base.datos.get("L").estado, "incierto");
});

test("reconciliar por id conserva el cupo cuando la cola pasa a enviada", () => {
  const e = nueva();
  const antes = reconciliarHoy([], [e]);
  const enviado = { ...e, estado: "enviado" };
  assert.equal(pendientesVisibles([enviado]).length, 0);
  assert.deepEqual(reconciliarHoy([], [enviado]), antes);
  assert.equal(reconciliarHoy(e.filas, [enviado]).length, 1);
});

test("el día argentino usa ambos límites y no el huso horario del equipo", () => {
  const e = nueva(); e.filas[0].empleado_id = "A"; e.filas[0].created_at = "2026-10-14T03:00:00Z";
  assert.equal(retirosPendientesDe([e], "A", "2026-10-13T03:00:00Z", "2026-10-14T03:00:00Z").length, 0);
});

test("regularizar un rechazo exige comprobar ausencia y conserva el original", async () => {
  const e = { ...nueva(), estado: "rechazado", error: "sector incorrecto" };
  const almacen = almacenMemoria([e]);
  let consultado = false;
  const cambios = { sector: "Pintura", motivo: "Destino equivocado" };
  const resultado = await revisarOperacion("L", cambios, dependencias(almacen, { consultar: async () => { consultado = true; return []; } }));
  assert.equal(consultado, true); assert.equal(resultado.estado, "pendiente");
  assert.equal(resultado.filas[0].id, e.filas[0].id);
  assert.equal(resultado.filas[0].created_at, e.filas[0].created_at);
  assert.deepEqual(resultado.historial[0].filas, e.filas);
});

test("la corrección se rechaza si ya hay alguna fila, hubo incertidumbre o venció", () => {
  const e = { ...nueva(), estado: "rechazado" };
  const cambios = { sector: "Pintura", motivo: "Corrección" };
  assert.throws(() => corregirRechazo(e, cambios, [{ id: "fila:L" }], AHORA), /registradas/);
  assert.throws(() => corregirRechazo({ ...e, fueIncierto: true }, cambios, [], AHORA), /original/);
  assert.throws(() => corregirRechazo(e, cambios, [], AHORA + 73 * 60 * 60_000), /fecha/);
});

test("una revisión con los ids existentes reconcilia hasta un retiro vencido", async () => {
  const almacen = almacenMemoria([{ ...nueva(), estado: "vencido" }]);
  const resultado = await revisarOperacion("L", null, dependencias(almacen, { consultar: async () => [{ id: "fila:L" }] }));
  assert.equal(resultado.estado, "enviado");
});

test("pasar a devolución elimina canje y autorización y deja de validarlos", () => {
  const c = [{ key: "disco", materialId: "disco", cantidad: 1, canje: "sin_usado", autorizaCanje: "" }];
  assert.equal(problemasDelCarrito(c).length, 1);
  assert.equal(problemasDelCarrito(c, new Map(), "devolucion").length, 0);
  const dev = limpiarCanjes(c, "devolucion");
  assert.equal(dev[0].canje, null); assert.equal(dev[0].autorizaCanje, ""); assert.equal(c[0].canje, "sin_usado");
});

test("migrar la cola vieja no borra el original si falla guardar en IndexedDB", async () => {
  const texto = JSON.stringify([nueva()]); let borrado = false;
  const storage = { getItem: () => texto, removeItem: (key) => { assert.equal(key, COLA_KEY); borrado = true; } };
  await assert.rejects(migrarColaAnterior({ guardar: async () => { throw Error("sin espacio"); } }, storage), /sin espacio/);
  assert.equal(borrado, false);
});

test("el disco que falla antes del primer envío impide llamar a la red", async () => {
  let enviados = 0;
  await assert.rejects(procesarOperacion("L", dependencias({ actualizar: async () => { throw Error("sin espacio"); } },
    { enviar: async () => { enviados += 1; } })), /sin espacio/);
  assert.equal(enviados, 0);
});

test("una consulta tardía no envía filas si otra pestaña tomó el candado", async () => {
  const almacen = almacenMemoria(); let enviados = 0;
  const resultado = await procesarOperacion("L", dependencias(almacen, {
    consultar: async () => { await almacen.actualizar("L", (e) => reclamarOperacion(e, "B", AHORA + 46_000)); return []; },
    enviar: async () => { enviados += 1; },
  }));
  assert.equal(resultado.candado.token, "B"); assert.equal(enviados, 0);
});

test("un intento recuperado tras cierre conserva incertidumbre aunque luego lo rechacen", () => {
  const recuperada = { ...nueva(), estado: "incierto", candado: { token: "viejo", hasta: AHORA - 1 } };
  const intento = reclamarOperacion(recuperada, "nuevo", AHORA);
  const resultado = resolverOperacion(intento, "nuevo", { error: { code: "23503", message: "constraint" } });
  assert.equal(resultado.estado, "rechazado"); assert.equal(resultado.fueIncierto, true);
  assert.throws(() => corregirRechazo(resultado, { sector: "Pintura", motivo: "Revisión" }, [], AHORA), /original/);
});

test("la copia enviada no vuelve a consumir cupo si el registro fue anulado", () => {
  const e = { ...nueva(), estado: "enviado" };
  const anulada = { ...e.filas[0], anulado_at: "2026-10-13T11:00:00Z" };
  assert.deepEqual(reconciliarHoy([], [e], [anulada]), []);
  assert.deepEqual(reconciliarHoy(e.filas, [e], [anulada]), []);
});
