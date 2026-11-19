import test from "node:test";
import assert from "node:assert/strict";
import { claveJornada, filasAusentesDelRango } from "./presentismoRango.js";

test("distingue las ausencias de las fichadas y conserva la justificación por fecha", () => {
  const emp = { id: "1", sede: "Pampa", activo: true, ficha: true };
  const dias = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"];
  const justificacion = { empleado_id: emp.id, fecha: dias[2], motivo: "Reposo" };
  const filas = filasAusentesDelRango({
    dias,
    empleados: [emp],
    marcaciones: [
      { emp, fecha: dias[0], sede: "Chubut", entrada: "07:00" },
      { emp: { id: "2" }, fecha: dias[1], entrada: "07:00" },
      { emp, fecha: dias[3], salida: "16:00" },
    ],
    justificaciones: new Map([[claveJornada(emp.id, dias[2]), justificacion]]),
  });
  assert.deepEqual(filas.map((r) => [r.fecha, r.ausencia, r.marcacion, r.justificacion]), [
    [dias[1], true, null, null],
    [dias[2], true, null, justificacion],
  ]);
});

test("incluye a quien no fichó en todo el rango si está activo y tiene presentismo", () => {
  const dias = ["2026-11-03"];
  const filas = filasAusentesDelRango({
    dias,
    empleados: [{ id: "1" }, { id: "2", activo: false }, { id: "3", ficha: false }],
    marcaciones: [],
    justificaciones: new Map(),
  });
  assert.deepEqual(filas.map((r) => [r.emp.id, r.fecha]), [["1", dias[0]]]);
});
