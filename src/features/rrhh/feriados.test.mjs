import assert from "node:assert/strict";
import { test } from "node:test";
import { cargarFeriadosAnio, esCierre, estadoDiaEspecial, normalizarFeriados } from "./feriados.js";

test("aplica el feriado en su fecha efectiva y deja los días turísticos a criterio de RRHH", () => {
  const lista = normalizarFeriados(2026, [
    { fecha: "2026-01-01", nombre: "Año Nuevo", tipo: "inamovible" },
    { fecha: "2026-11-23", nombre: "Día de la Soberanía Nacional", tipo: "trasladable" },
    { fecha: "2026-12-07", nombre: "Puente turístico no laborable", tipo: "puente" },
  ]);

  const dias = new Map(lista.map((dia) => [dia.fecha, dia]));
  assert.equal(esCierre(dias.get("2026-01-01"), new Set()), true);
  assert.equal(esCierre(dias.get("2026-11-20"), new Set()), false);
  assert.equal(esCierre(dias.get("2026-11-23"), new Set()), true);
  assert.equal(estadoDiaEspecial(dias.get("2026-11-23"), true, true), "Feriado trabajado · fichada incompleta");
  assert.equal(esCierre(dias.get("2026-12-07"), new Set()), false);
  assert.equal(esCierre(dias.get("2026-12-07"), new Set(["2026-12-07"])), true);
  assert.equal(estadoDiaEspecial(dias.get("2026-12-07")), "Día no laborable");
});

test("corrige el feriado de octubre de 2025 según la fecha oficial", () => {
  const dias = normalizarFeriados(2025, [
    { fecha: "2025-01-01", nombre: "Año Nuevo", tipo: "inamovible" },
    { fecha: "2025-10-10", nombre: "Puente turístico no laborable", tipo: "puente" },
    { fecha: "2025-10-12", nombre: "Día del Respeto a la Diversidad Cultural", tipo: "trasladable" },
  ]);
  assert.equal(dias.find((dia) => dia.fecha === "2025-10-10").tipo, "feriado");
  assert.equal(dias.some((dia) => dia.fecha === "2025-10-12"), false);
});

test("aplica los feriados del 9 y el 11 de noviembre a las sedes bonaerenses", () => {
  const lista = normalizarFeriados(2026, [
    { fecha: "2026-01-01", nombre: "Año Nuevo", tipo: "inamovible" },
    { fecha: "2026-11-09", nombre: "Visita del papa León XIV", tipo: "inamovible" },
  ]);
  const dias = new Map(lista.map((dia) => [dia.fecha, dia]));
  assert.equal(esCierre(dias.get("2026-11-09")), true);
  assert.equal(esCierre(dias.get("2026-11-10")), false);
  assert.equal(esCierre(dias.get("2026-11-11")), true);
  assert.match(dias.get("2026-11-11").nombre, /Provincia de Buenos Aires/);
});

test("ante una caída de la API usa las fechas verificadas de 2026", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Sin conexión"); });
  const dias = await cargarFeriadosAnio(2026);
  assert.equal(dias.find((dia) => dia.fecha === "2026-11-09").tipo, "feriado");
  assert.equal(dias.find((dia) => dia.fecha === "2026-11-11").tipo, "feriado");
  assert.equal(dias.find((dia) => dia.fecha === "2026-11-23").tipo, "feriado");
  assert.equal(dias.find((dia) => dia.fecha === "2026-12-07").tipo, "no_laborable");
  assert.equal(dias.find((dia) => dia.fecha === "2026-12-08").tipo, "feriado");
  await assert.rejects(cargarFeriadosAnio(2027), /Sin conexión/);
});
