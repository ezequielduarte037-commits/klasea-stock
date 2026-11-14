import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { EmptyState } from "@/components/ui/motion";
import { useToast } from "@/components/ui/Toast";
import { FORMAS_ENTREGA, crearConsumible } from "@/features/consumibles/api";
import { interpretarContenido } from "@/features/consumibles/precios/normalizarLista";
import { descRenglon, filtrarRenglones, formaEntregaSugerida, UNIDADES_ENTREGA } from "./reglas";
import { vincularRenglon } from "./catalogoApi";
import { PrecioRenglon } from "./ConciliarRebollar";

/**
 * Dar de alta como consumible un producto de la lista que el pañol todavía no
 * tiene (por ejemplo, una medida nueva de tornillo). Queda vinculado a su
 * renglón desde el primer día, con costo.
 */

function unidadSugerida(r) {
  const { unidad, granel } = interpretarContenido(r.descripcion);
  // "x Kg" o "x Litro" a granel: se entrega en esa unidad. Un envase, por pieza.
  if (granel) return unidad;
  return unidad === "par" ? "par" : "unidad";
}

function FormAlta({ renglon, rubros, proveedorNombre, onListo, onCancelar }) {
  const toast = useToast();
  const [desc, setDesc] = useState(() => descRenglon(renglon).replace(" · ", " "));
  const [rubroId, setRubroId] = useState("");
  const [unidad, setUnidad] = useState(() => unidadSugerida(renglon));
  const nombreRubro = rubros.find((r) => r.id === rubroId)?.nombre ?? null;
  const [forma, setForma] = useState(() => formaEntregaSugerida(renglon.descripcion));
  const [guardando, setGuardando] = useState(false);

  const alta = async () => {
    if (!desc.trim()) return toast.error("Falta la descripción.");
    if (!rubroId) return toast.error("Elegí el rubro.");
    setGuardando(true);
    try {
      const { material } = await crearConsumible({
        descripcion: desc.trim(),
        unidad,
        categoriaId: rubroId,
        proveedor: proveedorNombre,
        config: { forma_entrega: forma },
      });
      try {
        await vincularRenglon({ renglon, materialId: material.id, unidadEntrega: unidad, proveedorNombre });
        toast.success(`${desc.trim()} ya es un consumible.`);
      } catch (e) {
        toast.warning(`Se dio de alta, pero no quedó vinculado: ${e?.message || "error"}`);
      }
      onListo();
    } catch (e) {
      toast.error(e?.message || "No se pudo dar de alta.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="cat-alta">
      <label className="cat-campo">
        <span>Descripción en el pañol</span>
        <input className="ui-input" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </label>
      <div className="cat-fila3">
        <label className="cat-campo">
          <span>Rubro</span>
          <select
            className="ui-input"
            value={rubroId}
            onChange={(e) => {
              setRubroId(e.target.value);
              const n = rubros.find((r) => r.id === e.target.value)?.nombre;
              setForma(formaEntregaSugerida(renglon.descripcion, n));
            }}
          >
            <option value="">Elegí…</option>
            {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
        <label className="cat-campo">
          <span>Se entrega por</span>
          <select className="ui-input" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {UNIDADES_ENTREGA.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </label>
        <label className="cat-campo">
          <span>Forma de entrega</span>
          <select className="ui-input" value={forma} onChange={(e) => setForma(e.target.value)}>
            {Object.entries(FORMAS_ENTREGA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      {nombreRubro && <small className="cat-dim">Queda en {nombreRubro}, marcado para que Compras lo revise.</small>}
      <div className="cat-alta-pie">
        <button type="button" className="ui-btn ui-btn-fantasma" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button type="button" className="ui-btn ui-btn-primario" onClick={alta} disabled={guardando}>
          {guardando ? "Dando de alta…" : "Dar de alta"}
        </button>
      </div>
    </div>
  );
}

export default function ActivarRebollar({ lista, rubros, puedeActivar, onActivado }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(null);
  const libres = useMemo(() => (lista?.items ?? []).filter((r) => !r.material_id), [lista]);

  if (!lista) {
    return <EmptyState title="Todavía no hay lista de Rebollar cargada" subtitle="Cuando se cargue vas a poder activar productos de la lista como consumibles." />;
  }
  const visibles = texto.trim() ? filtrarRenglones(libres, texto, 60) : libres.slice(0, 60);

  return (
    <div className="cat-activar">
      <div className="cat-buscador">
        <Search size={16} />
        <input className="ui-input" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={`Buscar entre ${libres.length} productos de la lista que el pañol no tiene`} />
      </div>
      {!puedeActivar && <p className="cat-aviso">Dar de alta desde la lista lo pueden hacer admin, Compras y Técnica.</p>}
      {!visibles.length ? (
        <EmptyState title="Sin resultados" subtitle="Probá con otra palabra o con el código de Rebollar." />
      ) : (
        <ul className="cat-conc-lista">
          {visibles.map((r) => (
            <li key={r.id} className="cat-conc-fila ui-card">
              <div className="cat-act-fila">
                <span className="cat-mono cat-cod">{r.codigo}</span>
                <span className="cat-sug-desc">{descRenglon(r)}</span>
                <PrecioRenglon r={r} />
                {puedeActivar && abierto !== r.id && (
                  <button type="button" className="ui-btn ui-btn-suave cat-btn-chico" onClick={() => setAbierto(r.id)}>
                    <Plus size={15} /> Activar
                  </button>
                )}
              </div>
              {abierto === r.id && (
                <FormAlta
                  renglon={r}
                  rubros={rubros}
                  proveedorNombre={lista.proveedor_nombre}
                  onCancelar={() => setAbierto(null)}
                  onListo={() => { setAbierto(null); onActivado(); }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {!texto.trim() && libres.length > visibles.length && (
        <p className="cat-dim cat-mas">Se muestran los primeros {visibles.length}. Buscá para encontrar el resto.</p>
      )}
    </div>
  );
}
