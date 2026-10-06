import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audienciaLogistica,
  cargarAvisosLogistica,
  esCoordinadorLogistica,
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

test("un usuario sin coordinación sólo recibe cambios de sus propias solicitudes", () => {
  for (const role of ["tecnica", "administracion"]) {
    for (const estado of ["solicitado", "fecha_aceptada", "fecha_propuesta", "confirmado"]) {
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
  assert.equal(audienciaLogistica(nueva({ estado: "confirmado" }), perfil("compras")).ok, false);
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

test("clientes y cuentas sin ID no reciben avisos; Compras no recibe cierres ajenos", () => {
  assert.equal(audienciaLogistica(nueva(), { role: "admin" }).ok, false);
  assert.equal(audienciaLogistica(nueva(), perfil("cliente", { is_admin: true })).ok, false);
  for (const estado of ["realizado", "cancelado"]) {
    assert.equal(audienciaLogistica(nueva({ estado }), perfil("compras")).ok, false);
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
          assert.equal(expresion, `created_by.neq.${yo},created_by.is.null`);
          filtros.push((row) => row.created_by == null || row.created_by !== yo);
          return query;
        },
        order(campo, opciones) { consulta.orden = [campo, opciones]; return query; },
        limit(valor) { consulta.limite = valor; return query; },
        then(resolve, reject) {
          const data = rows.filter((row) => filtros.every((fn) => fn(row)))
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, consulta.limite);
          return Promise.resolve({ data, error }).then(resolve, reject);
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
    const admin = p.role === "admin" || p.is_admin;
    assert.deepEqual(avisos.map((row) => row.id).sort(), admin
      ? ["aceptada", "confirmada", "propuesta", "terminado", "viaje-1"]
      : ["aceptada", "confirmada", "propuesta", "viaje-1"]);
    assert.equal(client.consultas.length, admin ? 3 : 2);
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

test("Técnica consulta sólo lo propio y perfiles sin acceso no consultan", async () => {
  const client = clientDe([
    nueva(), nueva({ id: "mio", created_by: yo, estado: "confirmado" }),
  ]);
  assert.deepEqual((await cargarAvisosLogistica(client, perfil("tecnica"))).map((row) => row.id), ["mio"]);
  assert.equal(client.consultas.length, 1);
  const sinAcceso = clientDe([]);
  assert.deepEqual(await cargarAvisosLogistica(sinAcceso, perfil("cliente")), []);
  assert.deepEqual(await cargarAvisosLogistica(sinAcceso, { role: "admin" }), []);
  assert.equal(sinAcceso.consultas.length, 0);
});

test("un error de consulta se propaga y no se convierte en una lista vacía", async () => {
  const error = { code: "42501", message: "permission denied" };
  await assert.rejects(cargarAvisosLogistica(clientDe([], error), perfil("admin")), (e) => e === error);
});
