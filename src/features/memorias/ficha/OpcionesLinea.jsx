// Opciones de la línea (los condicionantes de la matriz: radar, hard top, motor
// Iveco…). Prenderlas o apagarlas cambia la lista de materiales de la obra,
// igual que en Materiales. Si la memoria dice otra cosa, se avisa.
import { useCallback, useEffect, useState } from "react";
import { ListChecks, MessageSquareWarning } from "lucide-react";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cambiarOpcionLinea, traerOpcionesLinea } from "../memoriasApi";
import { memoriaSobreOpcion } from "../campos";

export default function OpcionesLinea({ obra, modelo, linea, datos }) {
  const toast = useToast();
  const confirmar = useConfirm();
  const [opciones, setOpciones] = useState(null);
  const [tocando, setTocando] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const { opciones: lista } = await traerOpcionesLinea(modelo, obra.id);
      setOpciones(lista);
    } catch {
      setOpciones([]);
    }
  }, [modelo, obra.id]);

  useEffect(() => {
    const t = setTimeout(() => void cargar(), 0);
    return () => clearTimeout(t);
  }, [cargar]);

  if (!opciones?.length) return null;

  async function cambiar(op) {
    const activo = !op.activo;
    const ok = await confirmar({
      title: `${activo ? "Sumar" : "Sacar"} “${op.nombre}” en ${obra.codigo}`,
      message: activo
        ? `La lista de materiales de la obra pasa a incluir lo que lleva “${op.nombre}”. Compras y Materiales lo van a ver.`
        : `La lista de materiales de la obra deja de incluir lo que lleva “${op.nombre}”. Compras y Materiales lo van a ver.`,
      confirmLabel: activo ? "Sumar a la obra" : "Sacar de la obra",
    });
    if (!ok) return;
    setTocando(op.id);
    try {
      await cambiarOpcionLinea(obra.id, op.id, activo);
      setOpciones((prev) => prev.map((o) => (o.id === op.id ? { ...o, activo, tocada: true } : o)));
      toast.success(`Lista de ${obra.codigo} actualizada: ${activo ? "con" : "sin"} ${op.nombre}.`);
    } catch (e) {
      toast.error(e?.message || "No se pudo cambiar la opción.");
    } finally {
      setTocando(null);
    }
  }

  return (
    <div className="mem-opciones">
      <div className="mem-opciones-cab">
        <ListChecks size={16} style={{ color: "var(--blue)" }} />
        <b>Opciones de la {linea}</b>
        <small>Cambian la lista de materiales de la obra</small>
      </div>
      {opciones.map((op) => {
        const dice = memoriaSobreOpcion(op.nombre, datos);
        const choca = (dice === "si" && !op.activo) || (dice === "no" && op.activo);
        const detalle = [
          op.porDefecto ? `De serie en la ${linea}` : "Opcional",
          op.items ? `${op.items} material${op.items === 1 ? "" : "es"}` : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={op.id} className="mem-opcion">
            <button
              type="button"
              role="switch"
              aria-checked={op.activo}
              aria-label={op.nombre}
              className={`mem-switch${op.activo ? " on" : ""}`}
              disabled={tocando === op.id}
              onClick={() => void cambiar(op)}
            />
            <div className="mem-opcion-txt">
              <b>{op.nombre}</b>
              <small>{detalle}</small>
              {choca && (
                <div className="mem-opcion-aviso">
                  <MessageSquareWarning size={13} />
                  {dice === "si" ? "La memoria dice que lo lleva" : "La memoria dice que no lo lleva"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
