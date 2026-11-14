import { useState } from "react";
import { Receipt } from "lucide-react";
import { Aviso, Modal } from "./ui";
import { fmtPesos } from "./modulo";
import { importeCompraValido } from "./costosCompra";

export default function CostosCompraModal({ request, items, soloPrecios, saving, error, onClose, onSave }) {
  const activos = items.filter((item) => item.status !== "cancelado");
  const [importes, setImportes] = useState(() => Object.fromEntries(activos.map((item) => [item.id,
    item.actual_amount ?? (items.length === 1 ? request.actual_amount : "") ?? "",
  ])));
  const [importeSinItems, setImporteSinItems] = useState(request.actual_amount ?? "");
  const completo = activos.length ? activos.every((item) => importeCompraValido(importes[item.id])) : importeCompraValido(importeSinItems);
  const total = activos.length
    ? activos.reduce((sum, item) => sum + (importeCompraValido(importes[item.id]) ? Math.round(Number(importes[item.id]) * 100) : 0), 0) / 100
    : Number(importeSinItems) || 0;

  function guardar(event) {
    event.preventDefault();
    if (!completo || saving) return;
    onSave({
      items: activos.map((item) => ({ id: item.id, actual_amount: Math.round(Number(importes[item.id]) * 100) / 100 })),
      actualAmount: total,
    });
  }

  return (
    <Modal
      icono={Receipt}
      tono="naranja"
      titulo={soloPrecios ? "Precios por ítem" : "Confirmar compra"}
      sub={soloPrecios ? "El total del pedido se calcula sumando los importes de los ítems." : "Completá el precio de cada ítem. Después se abre el aviso a pañol."}
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
        {activos.length ? <>
          <p className="cmp-ayuda">Ingresá el importe de cada renglón por toda la cantidad indicada. Los ítems cancelados no se incluyen.</p>
          {activos.length > 1 && !request.itemized_costs && request.actual_amount != null && (
            <Aviso tono="cian">El pedido tiene un total anterior de {fmtPesos(request.actual_amount)}. Completá el desglose por ítem; ese total no se reparte automáticamente.</Aviso>
          )}
          {activos.map((item, index) => (
            <label key={item.id} className="cmp-campo" style={{ gridColumn: "auto", padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
              <strong style={{ fontSize: 13, overflowWrap: "anywhere" }}>{item.description}</strong>
              <span>{item.quantity || "Sin cantidad indicada"} {item.unit || ""} · Importe del ítem $ *</span>
              <input
                className="ui-input num" type="number" inputMode="decimal" min="0.01" step="0.01" required
                aria-label={`Importe de ${item.description}`} autoFocus={index === 0} disabled={saving}
                value={importes[item.id]} placeholder="0,00"
                onChange={(event) => setImportes((prev) => ({ ...prev, [item.id]: event.target.value }))}
              />
            </label>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <b>{completo ? "Total del pedido" : "Subtotal cargado"}</b>
            <output aria-label="Total calculado" className="mono">{fmtPesos(total)}</output>
          </div>
          {!completo && <p className="cmp-ayuda">Falta cargar un importe mayor a cero en cada ítem para continuar.</p>}
        </> : (
          <label className="cmp-campo" style={{ gridColumn: "auto" }}>
            <span>Importe real total $ *</span>
            <input className="ui-input num" type="number" inputMode="decimal" min="0.01" step="0.01" required autoFocus
              disabled={saving} value={importeSinItems} onChange={(event) => setImporteSinItems(event.target.value)} />
            <small className="cmp-ayuda">Este pedido no tiene ítems cargados. El importe corresponde al pedido completo.</small>
          </label>
        )}
        {error && <Aviso>{error}</Aviso>}
      </form>
    </Modal>
  );
}
