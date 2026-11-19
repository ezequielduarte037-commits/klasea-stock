import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { Aviso, Modal } from "./ui";
import { fmtPesos } from "./modulo";
import { centavosCompra, importeCompraValido, importeDeReferencia, importeGuardadoCompra } from "./costosCompra";
import { fetchReferenciasCompra } from "./purchaseRequestsApi";

export default function CostosCompraModal({ request, items, soloPrecios, saving, error, onClose, onSave }) {
  const activos = items.filter((item) => item.status !== "cancelado");
  const [editados, setEditados] = useState({});
  const [totalEditado, setTotalEditado] = useState(null);
  const [consulta, setConsulta] = useState(null);
  const [pendientes] = useState(() => soloPrecios ? [] : activos.filter((item) => (
    item.material_id && importeGuardadoCompra(request, item, items.length) === ""
  )));

  useEffect(() => {
    if (!pendientes.length) return;
    let vigente = true;
    fetchReferenciasCompra(request.id, pendientes).then(
      (resultado) => { if (vigente) setConsulta(resultado); },
      () => { if (vigente) setConsulta({ consultaIncompleta: true }); },
    );
    return () => { vigente = false; };
  }, [request.id, pendientes]);

  const buscando = pendientes.length > 0 && !consulta;
  const filas = activos.map((item) => {
    const guardado = importeGuardadoCompra(request, item, items.length);
    const referencia = consulta?.referencias?.[item.id];
    const sugerido = guardado === "" ? importeDeReferencia(referencia, consulta?.cotizacion) : guardado;
    const editado = editados[item.id];
    return { item, guardado, referencia, sugerido, valor: editado ?? sugerido, importe: editado || sugerido };
  });
  const totalGuardado = importeCompraValido(request.actual_amount) ? request.actual_amount : "";
  const importeSinItems = totalEditado || totalGuardado;
  const completo = filas.length ? filas.every(({ importe }) => importeCompraValido(importe)) : importeCompraValido(importeSinItems);
  const total = filas.length
    ? filas.reduce((sum, { importe }) => sum + (importeCompraValido(importe) ? centavosCompra(importe) : 0), 0) / 100
    : centavosCompra(importeSinItems) / 100;

  function guardar(event) {
    event.preventDefault();
    if (!completo || saving) return;
    onSave({
      items: filas.map(({ item, importe }) => ({ id: item.id, actual_amount: centavosCompra(importe) / 100 })),
      actualAmount: total,
    });
  }

  return (
    <Modal
      icono={Receipt}
      tono="naranja"
      titulo={soloPrecios ? "Precios por ítem" : "Confirmar compra"}
      sub={soloPrecios ? "El total del pedido se calcula sumando los importes de los ítems." : "Revisá los importes y completá los que faltan. Después se abre el aviso a pañol."}
      bloqueado={saving}
      onCerrar={onClose}
      pie={<>
        <button type="button" className="ui-btn ui-btn-fantasma" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="submit" form="costos-compra" className="ui-btn ui-btn-primario" disabled={saving || !completo}>
          {saving ? "Guardando…" : soloPrecios ? "Guardar precios" : "Confirmar y avisar a pañol"}
        </button>
      </>}
    >
      <form id="costos-compra" onSubmit={guardar} style={{ display: "grid", gap: 14 }}>
        {filas.length ? <>
          <p className="cmp-ayuda">Cada importe cubre toda la cantidad del renglón.</p>
          {filas.length > 1 && !request.itemized_costs && totalGuardado !== "" && (
            <Aviso tono="cian">El pedido tiene un total anterior de {fmtPesos(totalGuardado)}. Revisá el desglose por ítem.</Aviso>
          )}
          {buscando && <p className="cmp-ayuda" role="status">Buscando precios guardados…</p>}
          {consulta?.consultaIncompleta && <Aviso tono="cian">La consulta de precios quedó incompleta. Podés cargar los importes que falten.</Aviso>}
          {filas.map(({ item, guardado, referencia, sugerido, valor }, index) => (
            <label key={item.id} className="cmp-campo" style={{ gridColumn: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
              <strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>{item.description}</strong>
              <span>{item.quantity || "Sin cantidad indicada"} {item.unit || ""} · Importe del ítem ${sugerido === "" ? " *" : ""}</span>
              <input
                className="ui-input num" type="number" inputMode="decimal" min="0.01" step="0.01" required={sugerido === ""}
                aria-label={`Importe de ${item.description}`} autoFocus={index === 0} disabled={saving}
                value={valor} placeholder={sugerido === "" ? "0,00" : fmtPesos(sugerido)}
                onChange={(event) => setEditados((prev) => ({ ...prev, [item.id]: event.target.value }))}
              />
              {guardado !== "" && <small className="cmp-ayuda">Importe guardado en el pedido · {fmtPesos(guardado)}</small>}
              {guardado === "" && referencia && <small className="cmp-ayuda">
                {referencia.origen} · {referencia.moneda === "USD" ? `US${fmtPesos(referencia.precio)}` : fmtPesos(referencia.precio)} por {referencia.unidad}
                {referencia.moneda === "USD" && (consulta.cotizacion
                  ? ` · Dólar oficial vendedor ${fmtPesos(consulta.cotizacion.venta)}${consulta.cotizacion.origen === "viejo" ? " (última cotización guardada)" : ""}`
                  : " · Cargá el importe en pesos")}
              </small>}
            </label>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <b>{completo ? "Total del pedido" : "Subtotal cargado"}</b>
            <output aria-label="Total calculado" className="mono">{fmtPesos(total)}</output>
          </div>
          {!completo && !buscando && <p className="cmp-ayuda">Completá los importes pendientes para continuar.</p>}
        </> : (
          <label className="cmp-campo" style={{ gridColumn: "auto" }}>
            <span>Importe real total ${totalGuardado === "" ? " *" : ""}</span>
            <input className="ui-input num" type="number" inputMode="decimal" min="0.01" step="0.01" required={totalGuardado === ""} autoFocus
              disabled={saving} value={totalEditado ?? totalGuardado} placeholder={totalGuardado === "" ? "0,00" : fmtPesos(totalGuardado)}
              onChange={(event) => setTotalEditado(event.target.value)} />
            <small className="cmp-ayuda">Este pedido no tiene ítems cargados. El importe corresponde al pedido completo.</small>
          </label>
        )}
        {error && <Aviso>{error}</Aviso>}
      </form>
    </Modal>
  );
}
