import { armarItemsLista, fechaValida, mismoProveedor, numeroPrecio, ordenarListas, planDeCostos, problemasRenglon } from "./preciosLogica.js";

async function traerTodo(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

const mensaje = (error) => error?.message || "No se pudo completar la operación.";

// Se inyecta el cliente para probar fallas y reintentos sin tocar Supabase.
export function crearPreciosRepositorio(cliente, asegurarConfig) {
  async function exigirManager() {
    const { data, error } = await cliente.auth.getUser();
    if (error) throw error;
    if (!data?.user?.id) throw new Error("Volvé a iniciar sesión para gestionar precios.");
    const permiso = await cliente.rpc("is_panol_manager", { p_uid: data.user.id });
    if (permiso.error) throw permiso.error;
    if (permiso.data !== true) throw new Error("Solo administración, Compras y Técnica pueden gestionar precios.");
  }

  async function fetchListas() {
    const listas = await traerTodo(() => cliente.from("consumibles_listas")
      .select("*,items:consumibles_lista_items(count)")
      .order("vigente_desde", { ascending: false }).order("created_at", { ascending: false }).order("id"));
    const autores = new Map();
    const ids = [...new Set(listas.map((l) => l.created_by).filter(Boolean))];
    // El historial sigue disponible si el perfil de un autor no es visible por
    // RLS; se conserva su identificador en lugar de atribuirlo a otra persona.
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await cliente.from("profiles").select("id,username").in("id", ids.slice(i, i + 200));
      if (!error) for (const autor of data ?? []) autores.set(autor.id, autor.username);
    }
    return listas.map((l) => ({ ...l, renglones: l.items?.[0]?.count ?? 0,
      autor: autores.get(l.created_by) || (l.created_by ? `Usuario ${l.created_by.slice(0, 8)}` : "Carga inicial") })).sort(ordenarListas);
  }

  function fetchItems(listaId) {
    return traerTodo(() => cliente.from("consumibles_lista_items").select("*").eq("lista_id", listaId).order("codigo").order("id"));
  }

  async function fetchHistorial(codigo, proveedor) {
    const filas = await traerTodo(() => cliente.from("consumibles_lista_items")
      .select("*,lista:consumibles_listas!inner(*)").eq("codigo", codigo).order("lista_id").order("id"));
    return filas.filter((r) => mismoProveedor(r.lista, proveedor))
      .sort((a, b) => -ordenarListas(a.lista, b.lista));
  }

  async function guardarLista({ cabecera, renglones, anterior }) {
    await exigirManager();
    if (!cabecera.id || !String(cabecera.proveedor_nombre || "").trim() || !fechaValida(cabecera.vigente_desde)) throw new Error("Completá proveedor y fecha de vigencia antes de guardar.");
    if (cabecera.dolar_vendedor != null && !(numeroPrecio(cabecera.dolar_vendedor) > 0)) throw new Error("Cargá un dólar vendedor válido.");
    if (!renglones.length || renglones.some((r) => problemasRenglon(r).length)) throw new Error("Corregí los renglones con problemas antes de guardar.");
    if (new Set(renglones.map((r) => r.codigo)).size !== renglones.length) throw new Error("La lista tiene códigos repetidos.");
    const items = armarItemsLista(renglones, cabecera.id, anterior);
    // Los UUID de la cabecera se conservan al reintentar. Si una respuesta se
    // pierde, no se crea una segunda foto de la misma importación.
    const alta = await cliente.from("consumibles_listas").upsert(cabecera, { onConflict: "id", ignoreDuplicates: true });
    if (alta.error) {
      const error = new Error(mensaje(alta.error));
      // Una respuesta perdida puede haber dejado la cabecera grabada. El
      // formulario conserva el UUID y el contenido también en este caso.
      error.cargaPendiente = true;
      throw error;
    }
    const carga = await cliente.from("consumibles_lista_items").upsert(items, { onConflict: "lista_id,codigo", ignoreDuplicates: true });
    if (!carga.error) return cabecera.id;
    // Sin RPC transaccional, la cabecera y los ítems son dos pedidos. Antes de
    // borrar nuestra cabecera verificamos si el segundo pedido sí llegó.
    try {
      const grabados = await fetchItems(cabecera.id);
      const codigos = new Set(grabados.map((r) => r.codigo));
      if (grabados.length === items.length && items.every((r) => codigos.has(r.codigo))) return cabecera.id;
    } catch { /* sin conexión: el reintento conserva el mismo UUID */ }
    const limpieza = await cliente.from("consumibles_listas").delete().eq("id", cabecera.id).select("id");
    const pendiente = limpieza.error || !limpieza.data?.length;
    const error = new Error(`${mensaje(carga.error)}${pendiente ? " No pude confirmar la limpieza de la carga: reintentá con esta misma vista previa." : " La lista incompleta se retiró; podés reintentar."}`);
    error.cargaPendiente = !!pendiente;
    throw error;
  }

  async function prepararCostos(listaId) {
    const items = await fetchItems(listaId);
    const ids = [...new Set(items.map((r) => r.material_id).filter(Boolean))];
    const configs = [];
    const materiales = [];
    for (let i = 0; i < ids.length; i += 200) {
      const lote = ids.slice(i, i + 200);
      const resultados = await Promise.all([
        cliente.from("consumibles_config").select("material_id,factor_compra").in("material_id", lote),
        cliente.from("panol_materiales").select("id,es_consumible").in("id", lote),
      ]);
      for (const r of resultados) if (r.error) throw r.error;
      configs.push(...(resultados[0].data ?? []));
      materiales.push(...(resultados[1].data ?? []));
    }
    return planDeCostos(items, configs, materiales);
  }

  async function aplicarCostos(listaId, plan, alAvanzar = () => {}) {
    await exigirManager();
    const fresco = await prepararCostos(listaId);
    const firma = (p) => JSON.stringify(p.actualizaciones.map((r) => [r.material_id, r.costo_lista_item_id, r.costo_unitario_ars, r.factor_compra]));
    if (fresco.repetidos.length || firma(fresco) !== firma(plan)) throw new Error("Cambiaron los vínculos o los factores de compra. Revisá la cantidad y confirmá de nuevo.");
    const fecha = new Date().toISOString();
    let actualizados = 0;
    for (const fila of fresco.actualizaciones) {
      try {
        await asegurarConfig(fila.material_id);
        let consulta = cliente.from("consumibles_config").update({
          costo_unitario_ars: fila.costo_unitario_ars,
          costo_lista_item_id: fila.costo_lista_item_id,
          costo_actualizado_at: fecha,
        }).eq("material_id", fila.material_id);
        // No usamos un factor que Catálogo cambió mientras estaba abierto el
        // diálogo: se frena y se vuelve a calcular con la ficha actual.
        consulta = fila.factor_compra == null ? consulta.is("factor_compra", null) : consulta.eq("factor_compra", fila.factor_compra);
        const { error } = await consulta.select("material_id").single();
        if (error) throw error;
        actualizados += 1;
        alAvanzar(actualizados, fresco.actualizaciones.length);
      } catch (causa) {
        const error = new Error(`Se actualizaron ${actualizados} de ${fresco.actualizaciones.length} consumibles. ${mensaje(causa)} Volvé a revisar y reintentá los costos.`);
        error.actualizados = actualizados;
        throw error;
      }
    }
    return actualizados;
  }

  return { fetchListas, fetchItems, fetchHistorial, guardarLista, prepararCostos, aplicarCostos };
}
