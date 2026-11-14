import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/supabaseClient";
import { useToast } from "@/components/ui/Toast";
import { buscarObra, claveObra, desmoldeDe, diasHasta, esDestinoStock } from "../obras";
import ArmarPedido from "../pedidos/ArmarPedido";
import ListaPedidos from "../pedidos/ListaPedidos";
import ProximosDesmoldes from "../pedidos/ProximosDesmoldes";
import Sugerencias from "../pedidos/Sugerencias";

export default function PedidosTab({
  sede, materiales, movimientos, pedidos, stockPorMaterial, obras, obraMateriales, stockLabel, puedeGestionar,
  onGenerarOrden, onEstadoPedido, onEliminarPedido, onEliminarOrden, onEnviarACompras, onIrIngresos,
}) {
  const toast = useToast();
  const [plantillas, setPlantillas] = useState([]);
  const [destino, setDestino] = useState("");
  const [plantillaId, setPlantillaId] = useState("");
  const [extraItems, setExtraItems] = useState([]);

  useEffect(() => {
    let activo = true;
    supabase
      .from("linea_plantillas")
      .select("id, linea, nombre, descripcion, activa")
      .eq("activa", true)
      .order("linea")
      .then(({ data }) => {
        if (!activo) return;
        setPlantillas((data ?? []).map((p) => ({ ...p, label: p.nombre ? `${p.linea} · ${p.nombre}` : p.linea })));
      });
    return () => { activo = false; };
  }, []);

  const obra = buscarObra(obras, destino);
  const otrosDestinos = useMemo(() => [{ valor: stockLabel, label: stockLabel, detalle: "pedido para el stock del galpón" }], [stockLabel]);

  // Elegir la obra arma el resto: plantilla de su línea y fecha de desmolde.
  function elegirDestino(valor, obraElegida) {
    setDestino(valor);
    if (esDestinoStock(valor)) {
      setPlantillaId("");
      return;
    }
    const o = obraElegida ?? buscarObra(obras, valor);
    if (o?.linea) {
      const plantilla = plantillas.find((p) => String(p.linea).toUpperCase() === String(o.linea).toUpperCase());
      setPlantillaId(plantilla ? String(plantilla.id) : "");
    }
  }

  function armarPara(o) {
    elegirDestino(o.valor, o);
    document.getElementById("lam-armar-pedido")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function agregarSugerido(materialId, cantidad) {
    setExtraItems((prev) => {
      const i = prev.findIndex((e) => e.material_id === materialId);
      if (i >= 0) return prev.map((e, k) => (k === i ? { ...e, cantidad } : e));
      return [...prev, { uid: `extra-${Date.now()}`, material_id: materialId, cantidad }];
    });
    if (!destino) setDestino(stockLabel);
    const mat = materiales.find((m) => String(m.id) === String(materialId));
    toast.info(`${mat?.nombre ?? "Material"} agregado al pedido${destino ? "" : ` (para ${stockLabel})`}.`);
    document.getElementById("lam-armar-pedido")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Resumen para el encabezado: cada número una sola vez.
  const resumen = useMemo(() => {
    const abiertos = pedidos.filter((p) => p.estado === "pendiente" && !p.archivado_at).length;
    const conPedido = new Set(pedidos.filter((p) => !p.archivado_at && p.estado !== "cancelado").map((p) => buscarObra(obras, p.obra_destino)?.clave ?? claveObra(p.obra_destino)));
    const sinPedidoPronto = obras.filter((o) => {
      if (o.estado === "terminada") return false;
      const d = diasHasta(desmoldeDe(o));
      return d != null && d >= 0 && d <= 60 && !conPedido.has(o.clave);
    }).length;
    return { abiertos, sinPedidoPronto };
  }, [pedidos, obras]);

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Laminación · {sede}</div>
          <h1 className="lam-h1">Pedidos de <span className="acento">material</span></h1>
          <p className="lam-sub">
            <b className="mono">{resumen.abiertos}</b> {resumen.abiertos === 1 ? "material pedido sin recibir" : "materiales pedidos sin recibir"}
            {resumen.sinPedidoPronto > 0 && <> · <b className="mono">{resumen.sinPedidoPronto}</b> {resumen.sinPedidoPronto === 1 ? "obra desmolda" : "obras desmoldan"} en los próximos 60 días sin pedido</>}
          </p>
        </div>
      </div>

      <ProximosDesmoldes obras={obras} pedidos={pedidos} destinoActual={destino} puedeGestionar={puedeGestionar} onArmar={armarPara} />

      <ArmarPedido
        materiales={materiales}
        stockPorMaterial={stockPorMaterial}
        obras={obras}
        destino={destino}
        obra={obra}
        onElegirDestino={elegirDestino}
        otrosDestinos={otrosDestinos}
        plantillas={plantillas}
        plantillaId={plantillaId}
        onPlantilla={setPlantillaId}
        extraItems={extraItems}
        setExtraItems={setExtraItems}
        onGenerarOrden={onGenerarOrden}
        puedeGestionar={puedeGestionar}
      />

      <Sugerencias
        materiales={materiales}
        movimientos={movimientos}
        stockPorMaterial={stockPorMaterial}
        obras={obras}
        obraMateriales={obraMateriales}
        onAgregar={agregarSugerido}
      />

      <ListaPedidos
        sede={sede}
        pedidos={pedidos}
        obras={obras}
        stockLabel={stockLabel}
        puedeGestionar={puedeGestionar}
        onEstadoPedido={onEstadoPedido}
        onEliminarPedido={onEliminarPedido}
        onEliminarOrden={onEliminarOrden}
        onEnviarACompras={onEnviarACompras}
        onIrIngresos={onIrIngresos}
      />
    </>
  );
}
