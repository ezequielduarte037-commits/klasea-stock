import { useMemo, useState } from "react";
import { PackagePlus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { crearConsumible, nuevoId } from "@/features/consumibles/api";
import Hoja from "./Hoja";
import { UNIDADES, coincideBusqueda, itemDesdeAlta, normalizarTexto } from "./conteoCalculos";

/**
 * HojaAlta — "Agregar un producto que no está". Lo usa el pañolero contando:
 * encuentra algo en el estante que el sistema no tiene, lo da de alta en dos
 * toques y lo cuenta en el momento. Queda `revisado = false` para que Compras
 * lo mire después (lo hace crearConsumible).
 *
 * Antes de crear muestra los parecidos: el duplicado ("Tornillo 6x1" y
 * "tornillo 6 x 1") es el error más probable con dos personas contando.
 */

export default function HojaAlta({ textoInicial = "", catalogo = [], rubros = [], raizId = null, rubroInicial = "", onCerrar, onCreado, onElegirExistente }) {
  const toast = useToast();
  const [descripcion, setDescripcion] = useState(textoInicial);
  const [unidad, setUnidad] = useState("unidad");
  const [categoriaId, setCategoriaId] = useState(rubroInicial);
  const [ubicacion, setUbicacion] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Un id por alta: si se reintenta después de un corte, el RPC no duplica el producto.
  const [idAlta] = useState(() => nuevoId());

  const parecidos = useMemo(() => {
    const q = normalizarTexto(descripcion);
    if (q.length < 3) return [];
    const todas = catalogo.filter((i) => coincideBusqueda(i, q));
    if (todas.length) return todas.slice(0, 4);
    const primera = q.split(" ")[0];
    return primera.length >= 3 ? catalogo.filter((i) => coincideBusqueda(i, primera)).slice(0, 4) : [];
  }, [descripcion, catalogo]);

  const crear = async () => {
    if (guardando) return;
    const desc = descripcion.trim().replace(/\s+/g, " ");
    if (desc.length < 3) {
      toast.warning("Escribí qué es (al menos 3 letras).");
      return;
    }
    setGuardando(true);
    try {
      const ubic = ubicacion.trim().toUpperCase() || null;
      const creado = await crearConsumible({
        id: idAlta,
        descripcion: desc,
        unidad,
        categoriaId: categoriaId || raizId || null,
        ubicacion: ubic,
      });
      const rubro = rubros.find((r) => r.id === categoriaId)?.nombre ?? (raizId ? "Consumibles" : null);
      toast.success(`Agregado: ${desc}. Ahora contalo.`);
      onCreado?.(itemDesdeAlta(creado, { rubro, ubicacion: ubic }), categoriaId);
    } catch (err) {
      toast.error(`No se pudo agregar: ${err.message || err}`);
      setGuardando(false);
    }
  };

  return (
    <Hoja
      abierta
      clase="cnt"
      titulo="Agregar un producto que no está"
      sub="Queda marcado para que Compras lo revise."
      onCerrar={guardando ? undefined : onCerrar}
      ancho={480}
      pie={(
        <>
          <button type="button" className="ui-btn" onClick={onCerrar} disabled={guardando}>Cancelar</button>
          <button type="button" className="ui-btn ui-btn-primario" onClick={crear} disabled={guardando || descripcion.trim().length < 3}>
            <PackagePlus size={17} /> {guardando ? "Agregando…" : "Agregar y contar"}
          </button>
        </>
      )}
    >
      <fieldset className="cnt-alta" disabled={guardando} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <label className="cnt-lbl" htmlFor="cnt-alta-desc">Qué es</label>
        <input
          id="cnt-alta-desc"
          className="ui-input"
          value={descripcion}
          autoFocus
          maxLength={120}
          placeholder="Ej.: Tornillo autoperforante 8 x 1"
          onChange={(e) => setDescripcion(e.target.value)}
        />

        {parecidos.length > 0 && (
          <div className="cnt-parecidos">
            <div className="cnt-parecidos-tit">¿Es alguno de estos? Tocalo y lo contás.</div>
            {parecidos.map((p) => (
              <button key={p.id} type="button" className="cnt-parecido" onClick={() => onElegirExistente?.(p)}>
                <span className="cnt-parecido-desc">{p.descripcion}</span>
                <span className="cnt-parecido-meta">{[p.codigoEtiqueta, p.rubro, p.ubicacion].filter(Boolean).join(" · ")}</span>
              </button>
            ))}
          </div>
        )}

        <span className="cnt-lbl">Se cuenta por</span>
        <div className="cnt-chips-unidad" role="radiogroup" aria-label="Unidad">
          {UNIDADES.map((u) => (
            <button key={u} type="button" role="radio" aria-checked={unidad === u} className={`cnt-opcion${unidad === u ? " is-activa" : ""}`} onClick={() => setUnidad(u)}>
              {u}
            </button>
          ))}
        </div>

        <label className="cnt-lbl" htmlFor="cnt-alta-rubro">Rubro</label>
        <select id="cnt-alta-rubro" className="ui-input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Consumibles (sin rubro)</option>
          {rubros.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>

        <label className="cnt-lbl" htmlFor="cnt-alta-ubic">Ubicación <span className="cnt-opcional">(si la sabés)</span></label>
        <input
          id="cnt-alta-ubic"
          className="ui-input cnt-ubic-input"
          value={ubicacion}
          placeholder="C2-03"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={20}
          onChange={(e) => setUbicacion(e.target.value.toUpperCase())}
        />
      </fieldset>
    </Hoja>
  );
}
