import { useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { fmtNum } from "@/features/laminacion/obras";
import ArmarPedido from "../pedidos/ArmarPedido";
import BarcosPorPedir from "../pedidos/BarcosPorPedir";
import ListaPedidos from "../pedidos/ListaPedidos";
import ParaReponer from "../pedidos/ParaReponer";
import { conMaterialEnStock } from "../pedidos/borrador";
import { conListaDeObra, listaDeObra, renglonesDeLista } from "../pedidos/listasMuebles";

function irAlArmado() {
  document.getElementById("mad-armar-pedido")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Pedidos de maderas: qué reponer y qué barcos faltan → armar el pedido →
// seguir lo pedido.
export default function PedidosTab({
  materiales, movimientos, stockPorMaterial, enCaminoPorMaterial, obras, pedidos, estadoCompras, muebles, puedeGestionar,
  borrador, setBorrador, recienCreado,
  onGenerar, onCerrar, onReabrir, onEliminar, onQuitarRenglon, onEnviarACompras, onIrIngresos,
}) {
  const toast = useToast();

  const esperando = pedidos.filter((p) => p.estadoVisto.clave === "pendiente" || p.estadoVisto.clave === "parcial");
  const sinCompras = esperando.filter((p) => !p.purchase_request_id).length;

  function agregarAlPedido(mat, cantidad) {
    setBorrador((b) => conMaterialEnStock(b, mat, cantidad));
    toast.info(`${mat.nombre}: ${fmtNum(cantidad)} ${mat.unidad_medida} al stock del pedido.`);
    irAlArmado();
  }

  // La lista estándar de una obra (de Muebles), lista para el pedido.
  const listaEstandar = useCallback((obra) => {
    const lista = listaDeObra(obra, muebles);
    if (!lista) return null;
    return { renglones: renglonesDeLista(lista, materiales), fuente: lista.fuente };
  }, [muebles, materiales]);

  function cargarLista(obra, renglones) {
    const lista = listaEstandar(obra);
    setBorrador((b) => conListaDeObra(b, obra.valor, renglones, lista?.fuente || ""));
    toast.info(`Lista de ${obra.codigo} cargada: revisá las cantidades antes de mandar.`);
    irAlArmado();
  }

  return (
    <>
      <div className="lam-cab">
        <div className="lam-titulos">
          <div className="lam-eyebrow">Maderas · Compras</div>
          <h1 className="lam-h1">Pedidos de <span className="acento">madera</span></h1>
          <p className="lam-sub">
            {esperando.length
              ? <><b className="mono">{esperando.length}</b> {esperando.length === 1 ? "pedido esperando mercadería" : "pedidos esperando mercadería"}</>
              : "No hay pedidos esperando mercadería"}
            {sinCompras > 0 && <> · <b className="mono">{sinCompras}</b> sin mandar a Compras</>}
          </p>
        </div>
      </div>

      <BarcosPorPedir
        obras={obras}
        pedidos={pedidos}
        muebles={muebles}
        materiales={materiales}
        borrador={borrador}
        puedeGestionar={puedeGestionar}
        onCargar={cargarLista}
      />

      <ParaReponer
        materiales={materiales}
        movimientos={movimientos}
        stockPorMaterial={stockPorMaterial}
        enCaminoPorMaterial={enCaminoPorMaterial}
        onAgregar={agregarAlPedido}
      />

      <ArmarPedido
        materiales={materiales}
        stockPorMaterial={stockPorMaterial}
        enCaminoPorMaterial={enCaminoPorMaterial}
        obras={obras}
        puedeGestionar={puedeGestionar}
        borrador={borrador}
        setBorrador={setBorrador}
        listaEstandar={listaEstandar}
        onGenerar={onGenerar}
      />

      <ListaPedidos
        pedidos={pedidos}
        obras={obras}
        estadoCompras={estadoCompras}
        puedeGestionar={puedeGestionar}
        recienCreado={recienCreado}
        onCerrar={onCerrar}
        onReabrir={onReabrir}
        onEliminar={onEliminar}
        onQuitarRenglon={onQuitarRenglon}
        onEnviarACompras={onEnviarACompras}
        onIrIngresos={onIrIngresos}
      />
    </>
  );
}
