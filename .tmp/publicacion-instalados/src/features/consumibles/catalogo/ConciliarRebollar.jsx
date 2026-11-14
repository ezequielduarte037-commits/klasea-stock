import { useMemo, useState } from "react";
import { Check, Link2, Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/motion";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { fmtPesos } from "@/features/consumibles/api";
import { useVerPrecios } from "../verPrecios";
import { fusionarConsumibles, reactivarFueraDeRebollar } from "./catalogoApi";
import { pendientesConCandidatos, prepararDestinos } from "./conciliacion";
import { descRenglon, filtrarPorTexto } from "./reglas";

export function PrecioRenglon({ r }) {
  const verPrecios = useVerPrecios();
  if (!verPrecios) return null;
  return (
    <span className="cat-mono cat-precio">
      {r.costo_ars != null ? fmtPesos(r.costo_ars) : "—"}
      {r.moneda === "USD" && <small> (US$ {String(r.precio).replace(".", ",")})</small>}
      {r.unidad_compra && (r.unidad_compra !== "unidad" || Number(r.contenido) !== 1) && (
        <small> / {Number(r.contenido) !== 1 ? `${String(r.contenido).replace(".", ",")} ` : ""}{r.unidad_compra}</small>
      )}
    </span>
  );
}

/** Los viejos fuera de lista se fusionan en un producto existente o vuelven como otro proveedor. */
export default function ConciliarRebollar({ catalogo, lista, historial, errorLista, puedeConciliar, onResuelto }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [ocupado, setOcupado] = useState(null);
  const [buscando, setBuscando] = useState(null);
  const [texto, setTexto] = useState("");
  const [resueltos, setResueltos] = useState([]);
  const destinos = useMemo(() => prepararDestinos(catalogo, lista), [catalogo, lista]);
  const pendientes = useMemo(() => pendientesConCandidatos(catalogo, destinos, historial.retiros ?? {})
    .filter((p) => !resueltos.includes(p.item.id)), [catalogo, destinos, historial.retiros, resueltos]);
  const encontrados = useMemo(() => filtrarPorTexto(destinos, texto,
    (r) => `${r.codigo} ${r.descripcion} ${r.medida ?? ""} ${r.material.alias ?? ""} ${r.material.codigoEtiqueta ?? ""}`, 20), [destinos, texto]);

  const resolver = async (item, renglon = null) => {
    if (!puedeConciliar || ocupado) return;
    setOcupado(item.id);
    try {
      const ok = await confirm({
        title: renglon ? "¿Es el mismo producto?" : "¿Darlo de alta fuera de Rebollar?",
        message: renglon
          ? `“${item.descripcion}” se fusiona en “${renglon.material.descripcion}” (${renglon.material.codigoEtiqueta ?? renglon.codigo}). El nombre viejo pasa al alias, junto con sus códigos de barras. El historial queda en el producto viejo.`
          : `“${item.descripcion}” vuelve al catálogo y al mostrador con la nota “Otro proveedor”. Conserva su historial y recibe un nuevo código KA.`,
        confirmLabel: renglon ? "Fusionar" : "Dar de alta igual",
      });
      if (!ok) return;
      if (renglon) await fusionarConsumibles(item.id, renglon.material_id);
      else await reactivarFueraDeRebollar(item.id);
      // Una respuesta exitosa resuelve la fila aunque la recarga falle después.
      setResueltos((ids) => [...ids, item.id]);
      setBuscando(null);
      setTexto("");
      toast.success(renglon ? `${item.descripcion} fusionado en ${renglon.material.descripcion}.` : `${item.descripcion} vuelve al catálogo como “Otro proveedor”.`);
      await onResuelto();
    } catch (e) {
      toast.error(e?.message || "No se pudo resolver el producto.");
    } finally {
      setOcupado(null);
    }
  };

  const filaDestino = (item, r, puntaje) => (
    <li key={r.id}>
      <span className="cat-mono cat-cod">{r.material.codigoEtiqueta ?? "—"} · {r.codigo}</span>
      <span className="cat-sug-desc">
        {descRenglon(r)}
        {r.material.alias && <small className="cat-alias">Alias: {r.material.alias}</small>}
      </span>
      <PrecioRenglon r={r} />
      <span className="cat-mono cat-dim cat-pct" title="Parecido en el nombre; revisá la medida y la presentación">
        {puntaje == null ? "" : `${Math.round(puntaje * 100)}%`}
      </span>
      {puedeConciliar && (
        <button type="button" className="ui-btn ui-btn-suave cat-btn-chico" disabled={!!ocupado} onClick={() => resolver(item, r)}>
          <Check size={15} /> Es el mismo que…
        </button>
      )}
    </li>
  );

  return (
    <div className="cat-conciliar">
      <div className="cat-resumen">
        <span><b>{pendientes.length}</b> consumibles viejos fuera de Rebollar</span>
        <span className="cat-dim">Primero los más retirados · historial de ambas sedes</span>
      </div>
      <p className="cat-dim cat-sin-sug">Revisá medida, grano y presentación antes de fusionar. Las sugerencias solo comparan nombres.</p>
      {!puedeConciliar && <p className="cat-aviso">Admin, Compras y Técnica pueden resolverlos. Vos podés ver los candidatos y buscar en la lista.</p>}
      {historial.error && (
        <div className="cat-aviso" role="alert">
          No se pudo traer el historial: {historial.error}. Por ahora se muestran por nombre, sin contar retiros.
          <button type="button" className="ui-btn ui-btn-fantasma cat-btn-chico" onClick={onResuelto} disabled={!!ocupado}>Reintentar</button>
        </div>
      )}
      {(!lista || errorLista) && (
        <div className="cat-aviso" role="alert">
          {errorLista ? `No se pudo traer la lista: ${errorLista}.` : "No hay lista de Rebollar disponible."} Los candidatos aparecen al cargarla.
          <button type="button" className="ui-btn ui-btn-fantasma cat-btn-chico" onClick={onResuelto} disabled={!!ocupado}>Volver a traer</button>
        </div>
      )}
      {!pendientes.length ? (
        <EmptyState title="Nada para conciliar" subtitle="No quedan consumibles dados de baja por estar fuera de la lista de Rebollar." />
      ) : (
        <ul className="cat-conc-lista">
          {pendientes.map(({ item, sug, retiros }) => (
            <li key={item.id} className="cat-conc-fila ui-card" aria-busy={ocupado === item.id}>
              <div className="cat-conc-cab">
                <div>
                  <b>{item.descripcion}</b>
                  <div className="cat-dim">{item.rubro ?? "Sin rubro"} · {item.unidad}</div>
                  {item.alias && <small className="cat-alias">Alias: {item.alias}</small>}
                </div>
                <span className="ui-chip cat-chip-historial">
                  {historial.retiros == null ? "Historial sin cargar" : <><b className="cat-mono">{retiros}</b> {retiros === 1 ? "retiro" : "retiros"}</>}
                </span>
              </div>
              {sug.length ? (
                <ul className="cat-sug">{sug.map((s) => filaDestino(item, s.renglon, s.puntaje))}</ul>
              ) : (
                <p className="cat-dim cat-sin-sug">Sin candidatos sugeridos. Buscá en la lista para revisar si tiene par.</p>
              )}
              {buscando === item.id ? (
                <div className="cat-buscar-otro">
                  <div className="cat-buscador">
                    <Search size={16} />
                    <input className="ui-input" autoFocus aria-label={`Buscar un producto para ${item.descripcion}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, alias o código de Rebollar" />
                  </div>
                  {!!encontrados.length && <ul className="cat-sug">{encontrados.map((r) => filaDestino(item, r))}</ul>}
                  {texto.trim() && !encontrados.length && <p className="cat-dim cat-sin-sug">No hay productos con esa búsqueda.</p>}
                  {encontrados.length === 20 && <p className="cat-dim cat-sin-sug">Se muestran hasta 20 resultados. Agregá una palabra o una medida para afinar.</p>}
                  <button type="button" className="ui-btn ui-btn-fantasma cat-btn-chico" onClick={() => { setBuscando(null); setTexto(""); }}>Cerrar búsqueda</button>
                </div>
              ) : (
                <button type="button" className="ui-btn ui-btn-fantasma cat-btn-chico" disabled={!destinos.length || !!ocupado} onClick={() => { setBuscando(item.id); setTexto(""); }}>
                  <Link2 size={15} /> Buscar otro producto de Rebollar
                </button>
              )}
              {puedeConciliar && (
                <button type="button" className="ui-btn ui-btn-suave cat-btn-fuera" disabled={!!ocupado} onClick={() => resolver(item)}>
                  <Plus size={16} /> No está en Rebollar: darlo de alta igual
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}