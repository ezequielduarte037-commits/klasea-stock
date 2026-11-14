import { useEffect, useState } from "react";
import { supabase } from "@/supabaseClient";

// Empleados activos de RRHH para elegir "quién retira" sin tipear el nombre de
// cero (Laminación Pampa y Chubut, Maderas). Se trae una vez por sesión.
//
// Pañol, Oficina, Técnica y Administración pueden leer rrhh_empleados; si un
// usuario no puede, la lista queda vacía y el campo sigue siendo texto libre.

let pedido = null;

async function traer() {
  const conOficio = await supabase
    .from("rrhh_empleados")
    .select("id,nombre,dni,sede,fecha_baja,oficio:rrhh_oficios(nombre)")
    .eq("activo", true)
    .order("nombre");
  const { data, error } = conOficio.error
    ? await supabase.from("rrhh_empleados").select("id,nombre,dni,sede").eq("activo", true).order("nombre")
    : conOficio;
  if (error) throw error;
  return (data ?? []).filter((e) => !e.fecha_baja && String(e.nombre || "").trim());
}

export function cargarEmpleadosRrhh() {
  if (!pedido) {
    pedido = traer().catch(() => {
      pedido = null; // que el próximo intento vuelva a probar
      return [];
    });
  }
  return pedido;
}

export function useEmpleadosRrhh() {
  const [empleados, setEmpleados] = useState([]);
  useEffect(() => {
    let vivo = true;
    cargarEmpleadosRrhh().then((lista) => { if (vivo) setEmpleados(lista); });
    return () => { vivo = false; };
  }, []);
  return empleados;
}

// Para comparar nombres sin que molesten tildes, mayúsculas ni espacios.
export function normNombre(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function empleadoPorNombre(empleados, nombre) {
  const n = normNombre(nombre);
  return n ? empleados.find((e) => normNombre(e.nombre) === n) ?? null : null;
}
