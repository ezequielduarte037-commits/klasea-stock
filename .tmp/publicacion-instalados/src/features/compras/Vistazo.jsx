import { useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Paperclip } from "lucide-react";
import { fetchRequestItems, ITEM_STATUSES, normalizePurchaseRequestAttachments } from "./purchaseRequestsApi";
import { ITEM_TONOS, RaizCompras, estadoDe, textoPlano } from "./modulo";

// Vistazo de un pedido al pasar el mouse: fotos, archivos e ítems sin tener
// que entrar. Los ítems se bajan la primera vez y se guardan un par de minutos.
const cache = new Map();
const VIDA_MS = 2 * 60 * 1000;
const ANCHO = 360;

function itemsEnCache(id) {
  const c = cache.get(id);
  return c && Date.now() - c.at < VIDA_MS ? c.rows : null;
}

function esImagen(a) {
  const tipo = String(a?.type || "").toLowerCase();
  if (tipo.startsWith("image/")) return true;
  const ext = /\.(jpe?g|png|webp|gif|bmp|avif)(\?|#|$)/i;
  return ext.test(String(a?.name || "")) || ext.test(String(a?.url || ""));
}

export default function VistazoPedido({ request, rect }) {
  const raiz = useContext(RaizCompras);
  const [items, setItems] = useState(() => itemsEnCache(request.id));

  useEffect(() => {
    if (itemsEnCache(request.id)) return undefined;
    let vivo = true;
    fetchRequestItems(request.id)
      .then((rows) => { cache.set(request.id, { at: Date.now(), rows }); if (vivo) setItems(rows); })
      .catch(() => { if (vivo) setItems([]); });
    return () => { vivo = false; };
  }, [request.id]);

  const adjuntos = normalizePurchaseRequestAttachments(request);
  const fotos = [
    ...adjuntos.filter(esImagen).map((a) => ({ url: a.url, nombre: a.name })),
    // La "foto" de un ítem a veces es un plano (.dxf): sólo van las imágenes.
    ...(items || []).filter((it) => /^https?:\/\//i.test(it.image_url || "") && esImagen({ url: it.image_url })).map((it) => ({ url: it.image_url, nombre: it.description })),
  ].slice(0, 6);
  const archivos = adjuntos.filter((a) => !esImagen(a));
  const resumen = textoPlano(request.description);
  const e = estadoDe(request.status);

  // A la derecha de la tarjeta si entra; si no, a la izquierda; si tampoco, abajo.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = rect.right + 12;
  let top = Math.max(12, Math.min(rect.top, vh - 460));
  if (left + ANCHO > vw - 8) left = rect.left - ANCHO - 12;
  if (left < 8) {
    left = Math.max(8, Math.min(rect.left, vw - ANCHO - 8));
    top = Math.min(rect.bottom + 8, vh - 300);
  }

  const contenido = (
    <div className="cmp-vistazo" role="tooltip" style={{ left, top, width: ANCHO }} data-tono={e.tono}>
      <div className="cmp-vistazo-cab">
        <span className="cmp-estado" data-tono={e.tono}>{e.label}</span>
        <b>{request.title}</b>
      </div>

      {fotos.length > 0 && (
        <div className="cmp-vistazo-fotos">
          {fotos.map((f, i) => <img key={`${f.url}-${i}`} src={f.url} alt={f.nombre || ""} loading="lazy" />)}
        </div>
      )}

      {archivos.length > 0 && (
        <div className="cmp-vistazo-arch">
          <Paperclip size={13} />
          <span>{archivos.length === 1 ? archivos[0].name : `${archivos.length} archivos: ${archivos.slice(0, 3).map((a) => a.name).join(", ")}${archivos.length > 3 ? "…" : ""}`}</span>
        </div>
      )}

      {items == null ? (
        <p className="cmp-ayuda">Trayendo los ítems…</p>
      ) : items.length ? (
        <div className="cmp-vistazo-items">
          <div className="cmp-rotulo">Ítems · {items.length}</div>
          {items.slice(0, 8).map((it) => {
            const st = ITEM_STATUSES.find((s) => s.value === it.status) || ITEM_STATUSES[0];
            return (
              <div key={it.id} className="it" data-tono={ITEM_TONOS[it.status] || "neutro"} title={st.label}>
                <i />
                <span className="d">{it.description}</span>
                {(it.quantity || it.unit) && <span className="c">{it.quantity} {it.unit}</span>}
              </div>
            );
          })}
          {items.length > 8 && <p className="cmp-ayuda">y {items.length - 8} más</p>}
        </div>
      ) : resumen ? (
        <div className="cmp-vistazo-desc"><FileText size={13} /><span>{resumen.slice(0, 280)}{resumen.length > 280 ? "…" : ""}</span></div>
      ) : (
        <p className="cmp-ayuda">Sin ítems ni descripción.</p>
      )}
    </div>
  );
  return createPortal(contenido, raiz || document.body);
}
