import { useRef, useState } from "react";
import { Barcode, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { agregarCodigoBarra, quitarCodigoBarra } from "./catalogoApi";

/**
 * Códigos de barra del fabricante de un consumible (la cinta, el aerosol, la
 * caja de guantes): aparte de la etiqueta propia. Se pueden cargar varios por
 * producto —cambia de marca o de presentación— y el lector del mostrador, de
 * Ingresos y de Pedidos los reconoce igual que la etiqueta.
 *
 * Se guarda al toque, sin esperar al botón Guardar de la ficha.
 */
export default function CodigosDeBarra({ item, puedeEditar, onCambio }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [codigos, setCodigos] = useState(() => item.codigosBarra ?? []);
  const [nuevo, setNuevo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const actualizar = (lista) => {
    setCodigos(lista);
    onCambio?.(lista);
  };

  const agregar = async () => {
    const codigo = nuevo.trim();
    if (!codigo || ocupado) return;
    setOcupado(true);
    try {
      await agregarCodigoBarra(item.id, codigo);
      actualizar([...codigos, codigo]);
      setNuevo("");
      toast.success(`Código ${codigo} cargado.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo cargar el código.");
    } finally {
      setOcupado(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const quitar = async (codigo) => {
    if (ocupado) return;
    setOcupado(true);
    try {
      await quitarCodigoBarra(item.id, codigo);
      actualizar(codigos.filter((c) => c !== codigo));
    } catch (e) {
      toast.error(e?.message || "No se pudo sacar el código.");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section>
      <h4>Códigos de barra del producto</h4>
      {codigos.length ? (
        <ul className="cat-barras">
          {codigos.map((c) => (
            <li key={c}>
              <Barcode size={14} aria-hidden="true" />
              <span className="cat-mono">{c}</span>
              {puedeEditar && (
                <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => quitar(c)} disabled={ocupado} aria-label={`Sacar el código ${c}`} title="Sacar este código">
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="cat-dim cat-barras-vacio">Sin códigos de barra. La etiqueta propia ({item.codigoEtiqueta ?? "sin código"}) se lee igual.</p>
      )}
      {puedeEditar && (
        <div className="cat-barras-alta">
          <input
            ref={inputRef}
            className="ui-input cat-mono"
            value={nuevo}
            placeholder="Escaneá el código de la caja o escribilo"
            autoComplete="off"
            enterKeyHint="done"
            onChange={(e) => setNuevo(e.target.value)}
            // El lector tipea el código y manda Enter: que no dispare el Guardar de la ficha.
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } }}
            disabled={ocupado}
            aria-label="Nuevo código de barra"
          />
          <button type="button" className="ui-btn" onClick={agregar} disabled={ocupado || !nuevo.trim()}>
            <Plus size={15} /> Agregar
          </button>
        </div>
      )}
      <small className="cat-dim">Se puede cargar más de uno (otra marca u otra presentación). Se guarda al agregarlo.</small>
    </section>
  );
}
