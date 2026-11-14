import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Star, Trash2 } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { deleteMaterialImage, setMainMaterialImage, uploadMaterialImage } from "@/features/materiales/api";

/**
 * Fotos de un consumible. Usa la misma galería que Materiales
 * (`panol_material_imagenes` + carpeta `panol-materiales`), así una foto
 * cargada acá también se ve en el resto del sistema. La principal es
 * `panol_materiales.imagen_url`: la que muestra la botonera del mostrador.
 *
 * Se guarda al subir, sin esperar al botón Guardar de la ficha: una foto
 * sacada con el celular frente al estante no tiene que perderse si alguien
 * cierra la ficha.
 */
export default function FotosProducto({ materialId, principal, puedeEditar, onPrincipal }) {
  const toast = useToast();
  const [fotos, setFotos] = useState([]);
  const [actual, setActual] = useState(principal ?? null);
  const [subiendo, setSubiendo] = useState(false);
  const archivoRef = useRef(null);
  const camaraRef = useRef(null);

  const cargar = useCallback(async () => {
    const { data, error } = await supabase
      .from("panol_material_imagenes")
      .select("id,url,nombre,created_at")
      .eq("material_id", materialId)
      .order("created_at", { ascending: false });
    if (!error) setFotos(data ?? []);
  }, [materialId]);

  useEffect(() => { cargar(); }, [cargar]);

  const subir = async (lista) => {
    const archivos = [...(lista ?? [])].filter((f) => f.type?.startsWith("image/"));
    if (!archivos.length) return;
    setSubiendo(true);
    try {
      let ultima = null;
      for (const archivo of archivos) {
        const fila = await uploadMaterialImage(materialId, archivo);
        ultima = fila?.url ?? ultima;
      }
      // uploadMaterialImage deja la última subida como principal.
      if (ultima) {
        setActual(ultima);
        onPrincipal?.(ultima);
      }
      await cargar();
      toast.success(archivos.length === 1 ? "Foto guardada." : `${archivos.length} fotos guardadas.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo subir la foto.");
    } finally {
      setSubiendo(false);
      if (archivoRef.current) archivoRef.current.value = "";
      if (camaraRef.current) camaraRef.current.value = "";
    }
  };

  const hacerPrincipal = async (url) => {
    try {
      await setMainMaterialImage(materialId, url);
      setActual(url);
      onPrincipal?.(url);
    } catch (e) {
      toast.error(e?.message || "No se pudo cambiar la foto principal.");
    }
  };

  const borrar = async (foto) => {
    try {
      await deleteMaterialImage(foto.id, foto.url);
      // Si era la principal, pasa a serlo la más nueva que quede (o ninguna).
      if (foto.url === actual) {
        const siguiente = fotos.find((f) => f.id !== foto.id)?.url ?? null;
        await supabase.from("panol_materiales").update({ imagen_url: siguiente }).eq("id", materialId);
        setActual(siguiente);
        onPrincipal?.(siguiente);
      }
      await cargar();
    } catch (e) {
      toast.error(e?.message || "No se pudo borrar la foto.");
    }
  };

  return (
    <div className="cat-fotos">
      <div className="cat-foto-principal">
        {actual
          ? <img src={actual} alt="Foto principal del producto" />
          : <span className="cat-dim">Sin foto</span>}
      </div>
      {fotos.length > 1 && (
        <div className="cat-fotos-tira" role="list" aria-label="Otras fotos">
          {fotos.map((f) => (
            <div key={f.id} className={`cat-foto-mini${f.url === actual ? " is-principal" : ""}`} role="listitem">
              <img src={f.url} alt={f.nombre || "Foto del producto"} />
              {puedeEditar && (
                <div className="cat-foto-acciones">
                  {f.url !== actual && (
                    <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => hacerPrincipal(f.url)} aria-label="Usar como principal" title="Usar como principal">
                      <Star size={14} />
                    </button>
                  )}
                  <button type="button" className="ui-btn ui-btn-fantasma ui-btn-icono" onClick={() => borrar(f)} aria-label="Borrar foto" title="Borrar foto">
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {fotos.length === 1 && puedeEditar && (
        <button type="button" className="ui-btn ui-btn-fantasma cat-btn-chico" onClick={() => borrar(fotos[0])}>
          <Trash2 size={14} /> Borrar foto
        </button>
      )}
      {puedeEditar && (
        <div className="cat-fotos-botones">
          <button type="button" className="ui-btn ui-btn-suave cat-btn-chico" disabled={subiendo} onClick={() => camaraRef.current?.click()}>
            <Camera size={15} /> Sacar foto
          </button>
          <button type="button" className="ui-btn ui-btn-suave cat-btn-chico" disabled={subiendo} onClick={() => archivoRef.current?.click()}>
            <ImagePlus size={15} /> {subiendo ? "Subiendo…" : "Subir fotos"}
          </button>
          <input ref={camaraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => subir(e.target.files)} />
          <input ref={archivoRef} type="file" accept="image/*" multiple hidden onChange={(e) => subir(e.target.files)} />
        </div>
      )}
    </div>
  );
}
