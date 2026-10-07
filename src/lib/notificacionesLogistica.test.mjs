import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audienciaLogistica,
  cargarAvisosLogistica,
  esCoordinadorLogistica,
  detalleLogistica,
  notificacionLogistica,
} from "./notificacionesLogistica.js";

const yo = "00000000-0000-4000-8000-000000000001";
const otro = "00000000-0000-4000-8000-000000000002";
const fecha = "2026-10-05T12:00:00Z";
const nueva = (extra = {}) => ({
  id: "viaje-1", clase: "solicitud_logistica", estado: "solicitado",
  created_by: otro, updated_by: otro, created_at: fecha, updated_at: fecha,
  carga: "Tubos PRFV", obra: "K52", ...extra,
});
const perfil = (role, extra = {}) => ({ id: yo, role, ...extra });

test("Admin y Compras reciben solicitudes nuevas de otros usuarios", () => {
  for (const p of [perfil("admin"), perfil("compras"), perfil("tecnica", { is_admin: true })]) {
    assert.equal(esCoordinadorLogistica(p), true);
    assert.deepEqual(audienciaLogistica(nueva(), p), { ok: true, why: "cola-logistica" });
  }
});

test("la fecha aceptada vuelve a la cola de coordinación", () => {
  const row = nueva({ estado: "fecha_aceptada", aceptado_at: fecha, aceptado_por: otro });
  for (const role of ["admin", "compras"]) {
    const aviso = notificacionLogistica(row, perfil(role));
    assert.equal(aviso.titulo, "El solicitante aceptó la fecha");
    assert.equal(aviso.requiereAccion, true);
    assert.equal(aviso.gravedad, "warning");
  }
});

test("todos los solicitantes reciben propuestas y confirmaciones propias hechas por otra persona", () => {
  for (const role of ["tecnica", "administracion", "admin", "compras"]) {
    for (const estado of ["fecha_propuesta", "confirmado"]) {
      assert.equal(audienciaLogistica(nueva({ created_by: yo, estado }), perfil(role)).ok, true);
    }
  }
});

test("Técnica y Administración reciben la agenda confirmada sin recibir propuestas ajenas", () => {
  for (const role of ["tecnica", "administracion"]) {
    for (const estado of ["solicitado", "fecha_aceptada", "fecha_propuesta"]) {
      assert.equal(audienciaLogistica(nueva({ estado }), perfil(role)).ok, false);
    }
    for (const estado of ["confirmado", "realizado", "cancelado"]) {
      const row = nueva({ estado, confirmado_at: fecha });
      assert.deepEqual(audienciaLogistica(row, perfil(role)), { ok: true, why: "agenda-operativa" });
      assert.equal(notificacionLogistica(row, perfil(role)).requiereAccion, false);
    }
    // Cancelada o cerrada sin haberse confirmado nunca: no estaba en su agenda.
    for (const estado of ["realizado", "cancelado"]) {
      assert.equal(audienciaLogistica(nueva({ estado }), perfil(role)).ok, false);
    }
  }
  assert.equal(audienciaLogistica(nueva({ created_by: null }), perfil("admin")).ok, true);
});

test("Admin recibe todos los tipos de cambio ajenos, sin pedirle responder propuestas de otros", () => {
  for (const p of [perfil("admin"), perfil("tecnica", { is_admin: true })]) {
    for (const estado of ["solicitado", "fecha_aceptada", "fecha_propuesta", "confirmado", "realizado", "cancelado"]) {
      const aviso = notificacionLogistica(nueva({ estado }), p);
      assert.ok(aviso, estado);
      assert.equal(aviso.requiereAccion, ["solicitado", "fecha_aceptada"].includes(estado));
      if (estado === "fecha_propuesta") assert.equal(aviso.gravedad, "info");
    }
  }
  assert.equal(audienciaLogistica(nueva({ estado: "confirmado" }), perfil("compras")).ok, true);
});

test("crear o confirmar un movimiento propio no genera un aviso para su autor", () => {
  for (const estado of ["solicitado", "confirmado"]) {
    assert.equal(audienciaLogistica(nueva({ estado, created_by: yo, updated_by: yo }), perfil("admin")).ok, false);
  }
  assert.equal(audienciaLogistica(nueva({ updated_by: yo }), perfil("compras")).ok, false);
});

test("la acción específica conserva su autor aunque el solicitante edite luego otros datos", () => {
  const row = nueva({
    created_by: yo, estado: "confirmado", confirmado_at: fecha, confirmado_por: otro,
    updated_by: yo, updated_at: "2026-10-05T14:00:00Z",
  });
  const aviso = notificacionLogistica(row, perfil("tecnica"));
  assert.ok(aviso);
  assert.equal(aviso.fecha, fecha);
  assert.equal(aviso.titulo, "Movimiento confirmado");
  assert.equal(aviso.requiereAccion, false);
  assert.equal(aviso.gravedad, "success");
});

test("se omiten acciones propias y se conservan las de autor desconocido", () => {
  const row = nueva({ created_by: yo, estado: "fecha_propuesta", propuesta_at: fecha });
  assert.equal(audienciaLogistica({ ...row, propuesta_por: yo }, perfil("admin")).ok, false);
  assert.equal(audienciaLogistica({ ...row, propuesta_por: null, updated_by: yo }, perfil("admin")).ok, true);
});

test("cada aviso abre el movimiento y muestra su tipo de cambio sin depender del rol", () => {
  const aviso = notificacionLogistica(nueva({ created_by: yo, estado: "fecha_propuesta" }), perfil("compras"));
  assert.equal(aviso.clave, "logistica:viaje-1");
  assert.equal(aviso.ruta, "/calendario?open=viaje-1");
  assert.equal(aviso.titulo, "Nueva propuesta de fecha");
  assert.equal(aviso.detalle, "Tubos PRFV · K52");
});

test("clientes y cuentas sin ID no reciben avisos; Compras sigue cierres ajenos", () => {
  assert.equal(audienciaLogistica(nueva(), { role: "admin" }).ok, false);
  assert.equal(audienciaLogistica(nueva(), perfil("cliente", { is_admin: true })).ok, false);
  for (const estado of ["realizado", "cancelado"]) {
    assert.equal(audienciaLogistica(nueva({ estado }), perfil("compras")).ok, true);
  }
});

// Cliente que interpreta los filtros: comprueba la consulta y la audiencia juntas.
function clientDe(rows, error = null) {
  const consultas = [];
  return {
    consultas,
    from(tabla) {
      assert.equal(tabla, "calendario_eventos");
      const filtros = [];
      const consulta = { filtros };
      consultas.push(consulta);
      const query = {
        select(campos) { consulta.campos = campos; return query; },
        eq(campo, valor) { filtros.push((row) => row[campo] === valor); return query; },
        in(campo, valores) { filtros.push((row) => valores.includes(row[campo])); return query; },
        gte(campo, valor) { filtros.push((row) => row[campo] >= valor); return query; },
        or(expresion) {
          if (expresion === `created_by.neq.${yo},created_by.is.null`) {
            filtros.push((row) => row.created_by == null || row.created_by !== yo);
          } else {
            const match = /^updated_at\.gte\.([^,]+),fecha\.gte\.(.+)$/.exec(expresion);
            assert.ok(match, expresion);
            filtros.push((row) => row.updated_at >= match[1] || row.fecha >= match[2]);
          }
          return query;
        },
        order(campo, opciones) { consulta.orden = [campo, opciones]; return query; },
        limit(valor) { consulta.limite = valor; return query; },
        then(resolve, reject) {
          const data = rows.filter((row) => filtros.every((fn) => fn(row)))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, consulta.limite);
          return Promise.resolve({ data, error: typeof error === "function" ? error(consulta) : error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

test("la consulta carga tanto la cola de Admin como propuestas y confirmaciones propias", async () => {
  const rows = [
    nueva(),
    nueva({ id: "aceptada", estado: "fecha_aceptada", aceptado_por: otro, aceptado_at: fecha }),
    nueva({ id: "propuesta", created_by: yo, estado: "fecha_propuesta", propuesta_por: otro, propuesta_at: fecha }),
    nueva({ id: "confirmada", created_by: yo, estado: "confirmado", confirmado_por: otro, confirmado_at: fecha }),
    nueva({ id: "manual-propio", created_by: yo, updated_by: yo, estado: "confirmado" }),
    nueva({ id: "otra-clase", clase: "produccion" }),
    nueva({ id: "terminado", estado: "realizado" }),
  ];
  for (const p of [perfil("admin"), perfil("compras"), perfil("tecnica", { is_admin: true })]) {
    const client = clientDe(rows);
    const avisos = await cargarAvisosLogistica(client, p, Date.parse("2026-10-05T16:00:00Z"));
    assert.deepEqual(avisos.map((row) => row.id).sort(), ["aceptada", "confirmada", "propuesta", "terminado", "viaje-1"]);
    assert.equal(client.consultas.length, 4);
    assert.match(client.consultas[0].campos, /updated_by/);
    assert.match(client.consultas[0].campos, /confirmado_at/);
  }
});

test("Admin ve cambios recientes de otros sin llenar la campana de viajes históricos", async () => {
  const rows = [
    nueva({ id: "confirmado-ajeno", estado: "confirmado", confirmado_at: fecha, confirmado_por: otro }),
    nueva({ id: "realizado", estado: "realizado" }),
    nueva({ id: "cancelado", estado: "cancelado" }),
    nueva({ id: "historico", estado: "confirmado", updated_at: "2026-08-05T12:00:00Z" }),
  ];
  const avisos = await cargarAvisosLogistica(clientDe(rows), perfil("admin"), Date.parse("2026-10-05T16:00:00Z"));
  assert.deepEqual(avisos.map((row) => row.id).sort(), ["cancelado", "confirmado-ajeno", "realizado"]);
});

test("confirmaciones propias recientes no desplazan solicitudes pendientes ajenas", async () => {
  const recientes = Array.from({ length: 30 }, (_, i) => nueva({
    id: `confirmada-${i}`, created_by: yo, estado: "confirmado", updated_at: "2026-10-05T14:00:00Z",
  }));
  const data = await cargarAvisosLogistica(clientDe([...recientes, nueva()]), perfil("admin"));
  assert.ok(data.some((row) => row.id === "viaje-1"));
});

test("Técnica consulta lo propio y agenda común; perfiles sin acceso no consultan", async () => {
  const client = clientDe([
    nueva(), nueva({ id: "mio", created_by: yo, estado: "confirmado" }),
    nueva({ id: "hidrogrua-ajena", estado: "confirmado", tipo_transporte: "hidrogrua" }),
  ]);
  assert.deepEqual((await cargarAvisosLogistica(client, perfil("tecnica"))).map((row) => row.id).sort(), ["hidrogrua-ajena", "mio"]);
  assert.equal(client.consultas.length, 3);
  const sinAcceso = clientDe([]);
  assert.deepEqual(await cargarAvisosLogistica(sinAcceso, perfil("cliente")), []);
  assert.deepEqual(await cargarAvisosLogistica(sinAcceso, { role: "admin" }), []);
  assert.equal(sinAcceso.consultas.length, 0);
});

test("un error de consulta se propaga y no se convierte en una lista vacía", async () => {
  const error = { code: "42501", message: "permission denied" };
  await assert.rejects(cargarAvisosLogistica(clientDe([], error), perfil("admin")), (e) => e === error);
});

test("la hidrogrúa ajena informa recursos, horario y recorrido a Técnica", () => {
  const row = nueva({
    estado: "confirmado", carga: "Descarga perfiles", fecha: "2026-10-07", hora: "09:30:00",
    transportes: [{ tipo: "hidrogrua", cantidad: 2 }, { tipo: "camion", cantidad: 1 }],
    paradas: [{ tipo: "origen", lugar: "Galpón Pampa" }, { tipo: "destino", lugar: "Obra K52" }],
  });
  const aviso = notificacionLogistica(row, perfil("tecnica"));
  assert.equal(detalleLogistica(row, Date.parse("2026-01-01T12:00:00Z")), "Descarga perfiles · K52 · 07/10 09:30 · Hidrogrúa ×2 + Camión · Galpón Pampa → Obra K52");
  assert.equal(detalleLogistica(row, Date.parse("2026-10-07T12:00:00Z")), "Descarga perfiles · K52 · Hoy 09:30 · Hidrogrúa ×2 + Camión · Galpón Pampa → Obra K52");
  // Pasada la medianoche UTC todavía es el día anterior en Buenos Aires.
  assert.match(detalleLogistica(row, Date.parse("2026-10-07T02:00:00Z")), /Mañana 09:30/);
  assert.equal(aviso.why, "agenda-operativa");
  assert.equal(aviso.requiereAccion, false);
});

test("la fecha aceptada muestra la propuesta vigente y un horario ausente se aclara", () => {
  assert.match(detalleLogistica(nueva({
    estado: "fecha_aceptada", fecha: "2026-10-07", fecha_confirmada: "2026-10-02",
    fecha_propuesta: "2026-10-09", hora_propuesta: "10:00:00",
  }), Date.parse("2026-01-01T12:00:00Z")), /09\/10 10:00/);
  assert.match(detalleLogistica(nueva({ fecha: "2026-10-07" }), Date.parse("2026-01-01T12:00:00Z")), /07\/10 · horario a coordinar/);
});

test("editar costos no renueva la versión ni reemplaza al autor de un aviso", () => {
  for (const estado of ["solicitado", "realizado", "cancelado"]) {
    const row = nueva({
      estado, logistica_notificada_at: fecha, logistica_notificada_por: otro, logistica_cambio: estado,
      updated_at: "2026-10-07T13:00:00Z", updated_by: yo,
    });
    const aviso = notificacionLogistica(row, perfil("admin"));
    assert.ok(aviso);
    assert.equal(aviso.fecha, fecha);
    assert.equal(notificacionLogistica({ ...row, logistica_notificada_por: yo }, perfil("admin")), null);
  }
});

test("una reprogramación conserva la entidad y anuncia la nueva fecha", () => {
  const row = nueva({
    estado: "confirmado", logistica_notificada_at: "2026-10-07T13:00:00Z",
    logistica_notificada_por: otro, logistica_cambio: "reprogramado",
    fecha: "2026-10-09", fecha_confirmada: "2026-10-10", hora: "07:00:00", hora_confirmada: "08:00:00",
  });
  const aviso = notificacionLogistica(row, perfil("tecnica"));
  assert.equal(aviso.titulo, "Movimiento reprogramado");
  assert.equal(aviso.clave, "logistica:viaje-1");
  // Lo confirmado manda, como en el calendario y en el push.
  assert.match(detalleLogistica(row, Date.parse("2026-01-01T12:00:00Z")), /10\/10 08:00/);
});

test("la agenda conserva movimientos futuros y usa el día de Buenos Aires", async () => {
  const vieja = "2026-08-05T12:00:00Z";
  const rows = [
    nueva({ id: "hoy-local", estado: "confirmado", fecha: "2026-10-07", created_at: vieja, updated_at: vieja }),
    nueva({ id: "futuro", estado: "confirmado", fecha: "2026-11-02", created_at: vieja, updated_at: vieja }),
    nueva({ id: "costo-antiguo", estado: "cancelado", fecha: "2026-08-06", updated_at: "2026-10-07T13:00:00Z",
      logistica_notificada_at: vieja, logistica_notificada_por: otro, logistica_cambio: "cancelado" }),
  ];
  const data = await cargarAvisosLogistica(clientDe(rows), perfil("tecnica"), Date.parse("2026-10-08T01:00:00Z"));
  assert.deepEqual(data.map((row) => row.id).sort(), ["futuro", "hoy-local"]);
});

test("hitos operativos del calendario comparten audiencia; una reunión no crea aviso logístico", async () => {
  const rows = [
    nueva({ id: "desmolde", clase: "evento", tipo: "desmolde", estado: "confirmado" }),
    nueva({ id: "reunion", clase: "evento", tipo: "reunion", estado: "confirmado" }),
  ];
  const data = await cargarAvisosLogistica(clientDe(rows), perfil("tecnica"));
  assert.deepEqual(data.map((row) => row.id), ["desmolde"]);
  assert.equal(notificacionLogistica(data[0], perfil("tecnica")).titulo, "Desmolde programado");
});

test("antes de migrar las marcas mantiene la consulta legacy sin ocultar errores de permisos", async () => {
  const client = clientDe([nueva()], (consulta) => consulta.campos.includes("logistica_notificada_at")
    ? { code: "42703", message: "column calendario_eventos.logistica_notificada_at does not exist" } : null);
  assert.deepEqual((await cargarAvisosLogistica(client, perfil("admin"))).map((row) => row.id), ["viaje-1"]);
  assert.equal(client.consultas.length, 8);
  const permissionError = { code: "42501", message: "permission denied" };
  const denegado = clientDe([], permissionError);
  await assert.rejects(cargarAvisosLogistica(denegado, perfil("tecnica")), (error) => error === permissionError);
  assert.equal(denegado.consultas.length, 3);
});
