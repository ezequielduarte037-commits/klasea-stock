const SEPARADOR = " · ";
const limpiar = (valor) => String(valor || "").trim().replace(/\s+/g, " ");
const clave = (valor) => limpiar(valor).toLocaleLowerCase("es");

/** Conserva los borradores anteriores, que guardaban una única obra. */
export function restaurarDestinosPedido(form = {}, projects = []) {
  if (Array.isArray(form.destinos)) {
    return { ...form, project_id: "", destinos: form.destinos, destino: form.destino || "" };
  }
  const obra = projects.find((p) => p.id === form.project_id);
  const valor = obra?.codigo || form.destino || "";
  return {
    ...form,
    project_id: "",
    destinos: form.project_id ? [{ valor, obra_id: form.project_id }] : [],
    destino: form.project_id && (!obra || clave(form.destino) === clave(obra.codigo)) ? "" : form.destino || "",
  };
}

export function agregarDestinoPedido(destinos = [], valor, obra = null) {
  const texto = limpiar(obra?.codigo || valor);
  if (!texto || destinos.some((d) => (obra?.id && d.obra_id === obra.id) || clave(d.valor) === clave(texto))) return destinos;
  return [...destinos, { valor: texto, obra_id: obra?.id || null }];
}

/** Usa las columnas existentes: obra única vinculada o destinos múltiples en la cabecera. */
export function destinoPedidoParaGuardar(form = {}, projects = []) {
  const normalizado = restaurarDestinosPedido(form, projects);
  const destinos = normalizado.destinos.reduce((lista, d) => {
    const obra = projects.find((p) => p.id === d.obra_id);
    return agregarDestinoPedido(lista, obra?.codigo || d.valor, d.obra_id ? { id: d.obra_id, codigo: obra?.codigo || d.valor } : null);
  }, []);
  const completos = agregarDestinoPedido(destinos, normalizado.destino);
  const unica = completos.length === 1 && completos[0].obra_id;
  return {
    project_id: unica ? completos[0].obra_id : null,
    destino: unica ? null : completos.map((d) => d.valor).join(SEPARADOR) || null,
  };
}

/** Coincidencia exacta por código: K52-1 no coincide con K52-10. */
export function pedidoIncluyeObra(request, obra) {
  if (!obra) return false;
  if (request.project_id === obra.id) return true;
  const codigo = clave(obra.codigo);
  return !!codigo && String(request.destino || "").split(SEPARADOR).some((d) => clave(d) === codigo);
}
