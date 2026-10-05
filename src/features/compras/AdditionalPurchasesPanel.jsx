import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  DollarSign,
  FileDown,
  ExternalLink,
  ListOrdered,
  Paperclip,
  Link2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ship,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import {
  addRequestItem,
  createAdditionalBoard,
  createAdditionalItem,
  createPurchaseRequest,
  deleteAdditionalBoard,
  deleteAdditionalItem,
  descargarAdjuntoAdicional,
  fetchAdditionalBoards,
  fetchAdditionalItems,
  fetchAllRequestItems,
  fetchRequestItems,
  ITEM_STATUSES,
  normalizarDesglose,
  notifyComprasEmail,
  quitarAdjuntoAdicional,
  REQUEST_PRIORITIES,
  subirAdjuntoAdicional,
  updateAdditionalItem,
  verAdjuntoAdicional,
} from "@/features/compras/purchaseRequestsApi";
import {
  construirDetalleAdicionales,
  diferenciaDesglose,
  leerDesglose,
  nombreArchivoDetalle,
  sumaDesglose,
} from "@/features/compras/adicionalesPdf";
import { loadMemoriasFromSupabase } from "@/features/obras/mapa/persistence";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useResponsive } from "@/hooks/useResponsive";
import logoKUrl from "@/assets/logos/logo-k.png";
import { StatStrip } from "@/features/compras/comprasUI";
import { C } from "@/theme";
import { Cabecera } from "./ui";

const emptyRow = {
  entry_date: new Date().toISOString().slice(0, 10),
  provider: "",
  detail: "",
  cantidad: "",
  amount: "",
  currency: "ARS",
  notes: "",
};

const emptyRequest = {
  detail: "",
  provider: "",
  amount: "",
  currency: "ARS",
  priority: "media",
  needed_at: "",
};

const CURRENCIES = [
  { value: "ARS", label: "ARS", pdfLabel: "Importe (ARS)" },
  { value: "USD", label: "USD", pdfLabel: "Precio (USD)" },
];

const labelStyle = {
  color: C.dim,
  fontSize: 11,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  fontWeight: 600,
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  background: C.panel,
  border: `1px solid ${C.border2}`,
  color: C.text,
  borderRadius: 10,
  padding: "8px 11px",
  outline: "none",
  fontSize: 13,
  fontFamily: C.sans,
};

function currencyOf(value) {
  return value === "USD" ? "USD" : "ARS";
}

function money(value, currency = "ARS") {
  if (value === null || value === undefined || value === "") return "-";
  const formatted = Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currencyOf(currency) === "USD" ? `USD ${formatted}` : `$ ${formatted}`;
}

function compactMoney(value, currency = "ARS") {
  const formatted = Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
  return currencyOf(currency) === "USD" ? `USD ${formatted}` : `$${formatted}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function splitNoteLinks(value) {
  const links = [];
  const text = String(value || "")
    .replace(/https?:\/\/\S+/g, (raw) => {
      const clean = raw.replace(/[),.;]+$/g, "");
      if (isHttpUrl(clean)) links.push(clean);
      return "";
    })
    .replace(/\s*\/\s*\/\s*/g, " / ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*\/\s*$/g, "")
    .trim();
  return { text, links };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function boardMatchValues(board) {
  const raw = unique([
    board?.project?.codigo,
    board?.project?.descripcion,
    board?.name,
  ]);
  const text = raw.map(normalizeText).filter((value) => value.length >= 3);
  const compact = unique(raw.flatMap((value) => {
    const key = compactKey(value);
    const withoutK = key.replace(/^k(?=\d)/, "");
    return [key, withoutK];
  })).filter((value) => value.length >= 4);
  return { text, compact };
}

function requestItemsText(requestItems = []) {
  return requestItems.map((item) => [
    item.description,
    item.destination,
    item.notes,
    item.quantity,
    item.unit,
    item.link_url,
  ].filter(Boolean).join(" ")).join(" ");
}

function requestSearchText(request, requestItems = []) {
  return normalizeText([
    request?.source,
    request?.source_ref,
    request?.title,
    stripHtml(request?.description),
    request?.project?.codigo,
    request?.project?.descripcion,
    request?.proveedor,
    requestItemsText(requestItems),
  ].filter(Boolean).join(" "));
}

function requestCompactText(request, requestItems = []) {
  return compactKey([
    request?.source_ref,
    request?.title,
    stripHtml(request?.description),
    request?.project?.codigo,
    request?.project?.descripcion,
    requestItemsText(requestItems),
  ].filter(Boolean).join(" "));
}

function itemMatchesBoard(item, board) {
  const { text, compact } = boardMatchValues(board);
  const haystack = normalizeText([item?.destination, item?.description, item?.notes].filter(Boolean).join(" "));
  const compactHaystack = compactKey([item?.destination, item?.description, item?.notes].filter(Boolean).join(" "));
  return text.some((value) => haystack.includes(value))
    || compact.some((value) => compactHaystack.includes(value));
}

function requestMatchesBoard(request, board, requestItems = []) {
  if (!board) return false;
  if (board.project_id && request?.project_id === board.project_id) return true;
  if (requestItems.some((item) => itemMatchesBoard(item, board))) return true;

  const { text, compact } = boardMatchValues(board);
  const haystack = requestSearchText(request, requestItems);
  const compactHaystack = requestCompactText(request, requestItems);
  return text.some((value) => haystack.includes(value))
    || compact.some((value) => compactHaystack.includes(value));
}

function scopedRequestItems(request, board, requestItems = []) {
  if (!requestItems.length) return requestItems;
  const matchedItems = requestItems.filter((item) => itemMatchesBoard(item, board));
  if (matchedItems.length > 0) return matchedItems;
  if (board?.project_id && request?.project_id === board.project_id) return requestItems;
  return requestItems;
}

function additionalHint(request, requestItems = []) {
  const text = requestSearchText(request, requestItems);
  if (/\badicional(?:es)?\b/.test(text)) return "Adicional";
  if (/\b(audio|parlante(?:s)?|subwoofer|subw|woofer|estereo|stereo|sonido|amplificador|bafle|radio)\b/.test(text)) return "Audio";
  return "";
}

function looksAdditional(request, requestItems = []) {
  return !!additionalHint(request, requestItems);
}

function memoriaForBoard(board, memorias) {
  if (!board) return null;
  return memorias?.[board.project?.codigo]
    || memorias?.[board.project_id]
    || memorias?.[board.name]
    || null;
}

function rowFromRequest(request) {
  const desc = stripHtml(request.description);
  return {
    purchase_request_id: request.id,
    entry_date: request.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    provider: request.proveedor || "",
    detail: desc ? `${request.title} - ${desc}`.slice(0, 260) : request.title,
    amount: request.actual_amount ?? request.estimated_amount ?? null,
    currency: "ARS",
    link_url: request.source_url || null,
    notes: "Vinculado desde pedido de compras",
  };
}

function rowFromRequestItem(request, item) {
  const quantity = [item.quantity, item.unit].filter(Boolean).join(" ");
  const statusLabel = ITEM_STATUSES.find((status) => status.value === item.status)?.label || item.status || "Sin estado";
  const meta = [
    quantity || null,
    `Estado: ${statusLabel}`,
    item.destination ? `Destino: ${item.destination}` : null,
    item.notes || null,
  ].filter(Boolean);

  return {
    purchase_request_id: request.id,
    purchase_request_item_id: item.id,
    entry_date: request.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    provider: request.proveedor || "",
    detail: item.description,
    amount: null,
    currency: "ARS",
    link_url: item.link_url || null,
    notes: meta.join(" / ") || "Item vinculado desde pedido de compras",
  };
}

function buildDescription(board, form) {
  const parts = [
    `<p><strong>Adicional para ${escapeHtml(board.name)}</strong></p>`,
    `<p>${escapeHtml(form.detail)}</p>`,
  ];
  if (form.provider) parts.push(`<p>Proveedor: ${escapeHtml(form.provider)}</p>`);
  if (form.amount) parts.push(`<p>Importe estimado: ${escapeHtml(money(form.amount, form.currency))}</p>`);
  return parts.join("");
}

function toneButton(color, active = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: `1px solid ${active ? color + "66" : C.border}`,
    background: active ? `color-mix(in srgb, ${color} 12%, transparent)` : C.panel,
    color: active ? color : C.muted,
    borderRadius: 10,
    padding: "7px 12px",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    fontFamily: C.sans,
    whiteSpace: "nowrap",
  };
}

function iconButton(color = C.dim) {
  return {
    width: 30,
    height: 30,
    display: "grid",
    placeItems: "center",
    border: `1px solid ${C.border}`,
    background: C.panel,
    color,
    borderRadius: 9,
    cursor: "pointer",
    flexShrink: 0,
  };
}

function StatBox({ label, value, color = C.text }) {
  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      background: C.panel,
      padding: "10px 12px",
      minWidth: 0,
    }}>
      <div style={{ ...labelStyle, marginBottom: 4 }}>{label}</div>
      <div style={{ color, fontFamily: C.mono, fontSize: 18, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

function ItemMeta({ notes, linkUrl }) {
  const { text, links } = splitNoteLinks(notes);
  const allLinks = [
    ...(isHttpUrl(linkUrl) ? [linkUrl] : []),
    ...links,
  ].filter((url, index, list) => list.indexOf(url) === index);

  if (!text && allLinks.length === 0) return null;

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", color: C.dim, fontSize: 11, marginTop: 2, minWidth: 0 }}>
      {text && (
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>
          {text}
        </span>
      )}
      {allLinks.map((url, index) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          title={url}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            color: C.cyan,
            textDecoration: "none",
            fontWeight: 650,
            whiteSpace: "nowrap",
          }}
        >
          <Link2 size={10} />
          {index === 0 ? "Enlace" : `Enlace ${index + 1}`}
        </a>
      ))}
    </span>
  );
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// El logo-k.png es la "K" blanca sobre fondo NEGRO → en un PDF blanco se ve como
// un cuadrado negro. Lo recoloreamos: trazos claros → navy, fondo oscuro → transparente.
async function loadNavyLogo() {
  const img = await loadImage(logoKUrl);
  if (!img) return null;
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const cvs = document.createElement("canvas");
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, w, h);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (lum > 90) { px[i] = 14; px[i + 1] = 54; px[i + 2] = 83; px[i + 3] = 255; } // K → navy
      else { px[i + 3] = 0; } // fondo → transparente
    }
    ctx.putImageData(data, 0, 0);
    return cvs.toDataURL("image/png");
  } catch {
    return null;
  }
}

function descargarArchivo(bytes, nombre) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Lo que tiene un renglón además del detalle: el desglose en comprobantes y
 * el PDF con las copias. Se ve en la tabla para saber qué va a ir de anexo en
 * el informe, y avisa si el desglose no suma lo mismo que el renglón.
 */
function RowExtras({ item, onVerAdjunto }) {
  const desglose = leerDesglose(item.desglose);
  if (!desglose && !item.adjunto_path) return null;
  const diferencia = diferenciaDesglose(item);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 10px", marginTop: 4, fontSize: 11, color: C.dim }}>
      {desglose && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ListOrdered size={11} />
          {desglose.comprobantes.length} comprobante{desglose.comprobantes.length === 1 ? "" : "s"} · suman {money(sumaDesglose(desglose), item.currency)}
          {diferencia !== 0 && item.amount != null && (
            <span style={{ color: C.red, fontWeight: 650 }}>· no coincide con el importe</span>
          )}
        </span>
      )}
      {item.adjunto_path && (
        <button
          type="button"
          onClick={() => onVerAdjunto(item)}
          title="Ver el PDF (link temporal, sólo para mirarlo desde acá)"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, border: "none", background: "transparent", padding: 0, color: C.blue, cursor: "pointer", fontSize: 11, fontFamily: C.sans }}
        >
          <Paperclip size={11} />
          {item.adjunto_nombre || "Comprobantes"}{item.adjunto_paginas ? ` · ${item.adjunto_paginas} hojas` : ""}
        </button>
      )}
    </div>
  );
}

/**
 * Desglose de un renglón en comprobantes (número, fecha, importe y hoja del
 * PDF adjunto donde está la copia). En el informe va como anexo y cada
 * comprobante abre su copia.
 */
function DesgloseEditor({ value, onChange, item, amount, currency, isMobile, busy, onSubir, onQuitar, onVer }) {
  const desglose = value || { emisor: "", comprobantes: [] };
  const comprobantes = desglose.comprobantes || [];
  const set = (patch) => onChange({ ...desglose, ...patch });
  const setComprobante = (i, patch) => set({ comprobantes: comprobantes.map((c, k) => (k === i ? { ...c, ...patch } : c)) });
  const suma = comprobantes.reduce((t, c) => t + (Number(String(c.importe ?? "").replace(",", ".")) || 0), 0);
  const importe = amount === "" || amount == null ? null : Number(amount);
  const coincide = importe != null && Math.abs(suma - importe) < 0.005;
  const columnas = isMobile ? "1fr 1fr" : "minmax(130px, 1fr) 136px 130px 64px 30px";

  return (
    <div style={{ gridColumn: "1 / -1", display: "grid", gap: 7, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.text, fontSize: 12, fontWeight: 700 }}>
          <ListOrdered size={13} /> Desglose para el cliente
        </span>
        <span style={{ color: C.dim, fontSize: 11 }}>
          Los comprobantes que forman este renglón. Van como anexo en el informe.
        </span>
      </div>
      <input
        value={desglose.emisor || ""}
        onChange={(e) => set({ emisor: e.target.value })}
        placeholder="Emisor de los comprobantes (opcional)"
        style={inputStyle}
      />
      {comprobantes.map((c, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: columnas, gap: 6 }}>
          <input value={c.numero || ""} onChange={(e) => setComprobante(i, { numero: e.target.value })} placeholder="Comprobante" style={inputStyle} />
          <input type="date" value={c.fecha || ""} onChange={(e) => setComprobante(i, { fecha: e.target.value })} style={inputStyle} />
          <input type="number" step="0.01" min="0" value={c.importe ?? ""} onChange={(e) => setComprobante(i, { importe: e.target.value })} placeholder="Importe" style={inputStyle} />
          <input
            type="number" min="1" step="1" value={c.pagina ?? ""}
            onChange={(e) => setComprobante(i, { pagina: e.target.value })}
            placeholder="Hoja" title="Hoja del PDF adjunto donde está la copia"
            style={{ ...inputStyle, textAlign: "center" }}
          />
          <button type="button" title="Quitar comprobante" onClick={() => set({ comprobantes: comprobantes.filter((_, k) => k !== i) })} style={iconButton(C.red)}>
            <X size={12} />
          </button>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => set({ comprobantes: [...comprobantes, { numero: "", fecha: "", importe: "", pagina: item.adjunto_path ? comprobantes.length + 1 : "" }] })}
          style={toneButton(C.blue, false)}
        >
          <Plus size={12} /> Comprobante
        </button>
        {comprobantes.length > 0 && (
          <span style={{ fontSize: 12, color: C.muted, fontFamily: C.mono }}>
            Suman {money(suma, currency)}
            {importe == null
              ? ""
              : coincide
                ? <span style={{ color: C.green }}> · coincide con el importe</span>
                : <span style={{ color: C.red }}> · el renglón dice {money(importe, currency)}</span>}
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
        {item.adjunto_path ? (
          <>
            <button type="button" onClick={() => onVer(item)} style={{ ...toneButton(C.blue, false), maxWidth: "100%" }} title="Ver el PDF">
              <Paperclip size={12} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.adjunto_nombre || "Comprobantes"}{item.adjunto_paginas ? ` · ${item.adjunto_paginas} hojas` : ""}
              </span>
            </button>
            <button type="button" disabled={busy} onClick={() => onQuitar(item)} style={{ ...toneButton(C.red, false), opacity: busy ? 0.55 : 1 }}>
              <Trash2 size={12} /> Quitar PDF
            </button>
          </>
        ) : (
          <label style={{ ...toneButton(C.blue, false), cursor: busy ? "default" : "pointer", opacity: busy ? 0.55 : 1 }}>
            <Paperclip size={12} /> {busy ? "Subiendo…" : "Adjuntar PDF con las copias"}
            <input
              type="file"
              accept="application/pdf"
              disabled={busy}
              onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) onSubir(item, file); }}
              style={{ display: "none" }}
            />
          </label>
        )}
        <span style={{ color: C.dim, fontSize: 11 }}>
          Queda privado: se ve desde Compras y dentro del informe, nunca con un link abierto.
        </span>
      </div>
    </div>
  );
}

export default function AdditionalPurchasesPanel({ profile, projects = [], requests = [], onSelectRequest, onRequestCreated }) {
  const { isMobile } = useResponsive();
  const toast = useToast();
  const confirm = useConfirm();
  const [boards, setBoards] = useState([]);
  const [items, setItems] = useState([]);
  const [requestItems, setRequestItems] = useState([]);
  const [memorias, setMemorias] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // Las tablas vacías arrancan plegadas: son la mitad de la lista y no tienen
  // nada que mirar. Se abren cuando hace falta cargarles algo.
  const [verVacias, setVerVacias] = useState(false);
  // El cajón de pedidos para sumar: se abre cuando se va a usar, no siempre.
  const [verCandidatos, setVerCandidatos] = useState(false);
  const seleccionadaRef = useCallback((nodo) => {
    // Sólo dentro del rail: `scrollIntoView` sube por los ancestros hasta
    // encontrar algo que scrollee, y si el rail no scrollea mueve la página
    // entera dejando el contenido de la derecha fuera de la vista.
    const rail = nodo?.closest?.("aside");
    if (!nodo || !rail || rail.scrollHeight <= rail.clientHeight) return;
    const arriba = nodo.offsetTop - rail.offsetTop;
    if (arriba < rail.scrollTop || arriba + nodo.offsetHeight > rail.scrollTop + rail.clientHeight) {
      rail.scrollTop = arriba - rail.clientHeight / 2 + nodo.offsetHeight / 2;
    }
  }, []);
  const [requestSearch, setRequestSearch] = useState("");
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [boardProjectId, setBoardProjectId] = useState("");
  const [boardName, setBoardName] = useState("");
  const [boardNotes, setBoardNotes] = useState("");
  const [savingBoard, setSavingBoard] = useState(false);
  const [rowForm, setRowForm] = useState(emptyRow);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyRow);
  const [savingRow, setSavingRow] = useState(false);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [savingRequest, setSavingRequest] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);
  // Los renglones sin importe van en su propia sección del informe; para
  // mandarle al cliente sólo lo que se cobra, se sacan.
  const [incluirSinImporte, setIncluirSinImporte] = useState(true);
  const [adjuntoBusyId, setAdjuntoBusyId] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [boardRows, itemRows, purchaseItemRows, memoriaRows] = await Promise.all([
        fetchAdditionalBoards(),
        fetchAdditionalItems(),
        fetchAllRequestItems(),
        loadMemoriasFromSupabase(),
      ]);
      setBoards(boardRows);
      setItems(itemRows);
      setRequestItems(purchaseItemRows);
      setMemorias(memoriaRows);
      setSelectedId((prev) => prev && boardRows.some((b) => b.id === prev) ? prev : boardRows[0]?.id || null);
    } catch (err) {
      setError(err.message || "No se pudo cargar adicionales.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const statsByBoard = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const stat = map.get(item.board_id) || { count: 0, totalArs: 0, totalUsd: 0, pending: 0 };
      stat.count += 1;
      if (item.amount === null || item.amount === undefined) stat.pending += 1;
      if (currencyOf(item.currency) === "USD") stat.totalUsd += Number(item.amount || 0);
      else stat.totalArs += Number(item.amount || 0);
      map.set(item.board_id, stat);
    }
    return map;
  }, [items]);

  const filteredBoards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter((board) =>
      `${board.name || ""} ${board.project?.codigo || ""} ${board.notes || ""}`.toLowerCase().includes(q),
    );
  }, [boards, search]);

  /**
   * Las tablas en dos montones: las que tienen algo cargado y las vacías.
   *
   * Venían en el orden en que las devuelve la base, que no es ninguno: veintiún
   * renglones iguales mezclando códigos de obra, nombres de barco y cosas como
   * "Respaldo Rebatible", con la mitad en cero. Encontrar una era leerlas todas.
   *
   * Las que tienen plata van primero y de mayor a menor, porque el sentido de
   * esta pantalla es cuánto se le sumó a cada barco.
   */
  const boardsPorEstado = useMemo(() => {
    const conDatos = [];
    const vacias = [];
    for (const board of filteredBoards) {
      const stat = statsByBoard.get(board.id) || { count: 0, totalArs: 0, totalUsd: 0 };
      (stat.count > 0 || stat.totalArs > 0 || stat.totalUsd > 0 ? conDatos : vacias).push({ board, stat });
    }
    const porPlata = (a, b) => (b.stat.totalArs - a.stat.totalArs)
      || (b.stat.totalUsd - a.stat.totalUsd)
      || (b.stat.count - a.stat.count)
      || String(a.board.name || "").localeCompare(String(b.board.name || ""), "es", { numeric: true });
    const porNombre = (a, b) => String(a.board.name || "").localeCompare(String(b.board.name || ""), "es", { numeric: true });
    return { conDatos: conDatos.sort(porPlata), vacias: vacias.sort(porNombre) };
  }, [filteredBoards, statsByBoard]);

  const selected = boards.find((board) => board.id === selectedId) || null;
  const selectedItems = useMemo(
    () => items.filter((item) => item.board_id === selectedId),
    [items, selectedId],
  );
  const itemsByRequest = useMemo(() => {
    const map = new Map();
    for (const item of requestItems) {
      if (!item.request_id) continue;
      const list = map.get(item.request_id) || [];
      list.push(item);
      map.set(item.request_id, list);
    }
    return map;
  }, [requestItems]);
  const linkedRequestIds = useMemo(
    () => new Set(selectedItems.map((item) => item.purchase_request_id).filter(Boolean)),
    [selectedItems],
  );
  const linkedRequestItemIds = useMemo(
    () => new Set(selectedItems.map((item) => item.purchase_request_item_id).filter(Boolean)),
    [selectedItems],
  );

  const boardRequests = useMemo(() => {
    if (!selected) return [];
    const q = normalizeText(requestSearch);
    const compactQ = compactKey(requestSearch);
    return requests
      .map((request) => {
        const allItems = itemsByRequest.get(request.id) || [];
        const scopedItems = scopedRequestItems(request, selected, allItems);
        return { request, allItems, scopedItems };
      })
      .filter(({ request, allItems }) => requestMatchesBoard(request, selected, allItems))
      .filter(({ request, scopedItems }) => {
        if (!q) return true;
        const haystack = requestSearchText(request, scopedItems);
        const compactHaystack = requestCompactText(request, scopedItems);
        return haystack.includes(q) || (compactQ.length >= 3 && compactHaystack.includes(compactQ));
      })
      .sort((a, b) => {
        const aLinked = a.scopedItems.length > 0
          ? a.scopedItems.every((item) => linkedRequestItemIds.has(item.id))
          : linkedRequestIds.has(a.request.id);
        const bLinked = b.scopedItems.length > 0
          ? b.scopedItems.every((item) => linkedRequestItemIds.has(item.id))
          : linkedRequestIds.has(b.request.id);
        if (aLinked !== bLinked) return aLinked - bLinked;

        const aHint = looksAdditional(a.request, a.scopedItems) ? 0 : 1;
        const bHint = looksAdditional(b.request, b.scopedItems) ? 0 : 1;
        if (aHint !== bHint) return aHint - bHint;

        return new Date(b.request.created_at || 0) - new Date(a.request.created_at || 0);
      });
  }, [itemsByRequest, linkedRequestIds, linkedRequestItemIds, requestSearch, requests, selected]);

  const selectedMemoria = useMemo(() => memoriaForBoard(selected, memorias), [memorias, selected]);
  const selectedAudio = String(selectedMemoria?.audio || "").trim();
  const audioAlreadyAdded = useMemo(() => {
    if (!selectedAudio) return false;
    const audioText = normalizeText(selectedAudio);
    return selectedItems.some((item) =>
      normalizeText(item.detail).includes("audio")
      && (
        normalizeText(item.notes).includes("memoria descriptiva")
        || normalizeText(item.detail).includes(audioText.slice(0, 40))
      ),
    );
  }, [selectedAudio, selectedItems]);

  const totals = useMemo(() => {
    const totalArs = selectedItems
      .filter((item) => currencyOf(item.currency) === "ARS")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalUsd = selectedItems
      .filter((item) => currencyOf(item.currency) === "USD")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const monthArs = selectedItems
      .filter((item) => item.entry_date?.slice(0, 7) === currentMonth && currencyOf(item.currency) === "ARS")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const monthUsd = selectedItems
      .filter((item) => item.entry_date?.slice(0, 7) === currentMonth && currencyOf(item.currency) === "USD")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = selectedItems.filter((item) => item.amount === null || item.amount === undefined).length;
    return { totalArs, totalUsd, monthArs, monthUsd, pending, count: selectedItems.length };
  }, [selectedItems]);

  function projectById(id) {
    return projects.find((project) => project.id === id) || null;
  }

  async function handleCreateBoard(e) {
    e.preventDefault();
    const project = projectById(boardProjectId);
    const name = (boardName.trim() || project?.codigo || "").trim();
    if (!name) {
      toast.warning("Elegir barco o escribir un nombre.");
      return;
    }

    const existing = boards.find((board) =>
      (boardProjectId && board.project_id === boardProjectId) ||
      board.name?.trim().toLowerCase() === name.toLowerCase(),
    );
    if (existing) {
      setSelectedId(existing.id);
      setShowBoardForm(false);
      toast.success("Tabla existente seleccionada.");
      return;
    }

    setSavingBoard(true);
    try {
      const board = await createAdditionalBoard({
        name,
        project_id: boardProjectId || null,
        notes: boardNotes,
      });
      setBoards((prev) => [board, ...prev]);
      setSelectedId(board.id);
      setBoardProjectId("");
      setBoardName("");
      setBoardNotes("");
      setShowBoardForm(false);
      toast.success("Tabla creada.");
    } catch (err) {
      toast.error(err.message || "No se pudo crear la tabla.");
    } finally {
      setSavingBoard(false);
    }
  }

  async function handleDeleteBoard() {
    if (!selected) return;
    const ok = await confirm({
      title: "Eliminar tabla",
      message: `Se borra la tabla ${selected.name} y sus renglones.`,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteAdditionalBoard(selected.id);
      setBoards((prev) => prev.filter((board) => board.id !== selected.id));
      setItems((prev) => prev.filter((item) => item.board_id !== selected.id));
      setSelectedId(boards.find((board) => board.id !== selected.id)?.id || null);
      toast.success("Tabla eliminada.");
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar la tabla.");
    }
  }

  async function handleAddRow(e) {
    e.preventDefault();
    if (!selected || !rowForm.detail.trim()) return;
    setSavingRow(true);
    try {
      const item = await createAdditionalItem({ ...rowForm, board_id: selected.id });
      setItems((prev) => [item, ...prev]);
      setRowForm(emptyRow);
      toast.success("Renglon agregado.");
    } catch (err) {
      toast.error(err.message || "No se pudo guardar el renglon.");
    } finally {
      setSavingRow(false);
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditForm({
      entry_date: item.entry_date || "",
      provider: item.provider || "",
      detail: item.detail || "",
      cantidad: item.cantidad ?? "",
      amount: item.amount ?? "",
      currency: currencyOf(item.currency),
      notes: item.notes || "",
      desglose: leerDesglose(item.desglose) ?? { emisor: "", comprobantes: [] },
    });
  }

  async function handleSaveEdit(itemId) {
    if (!editForm.detail.trim()) return;
    const original = items.find((item) => item.id === itemId);
    const patch = { ...editForm };
    // El desglose sólo viaja si cambió: así editar un renglón no depende de
    // que la columna exista y no se pisa lo que cargó otro.
    const desgloseNuevo = normalizarDesglose(editForm.desglose);
    if (JSON.stringify(desgloseNuevo) === JSON.stringify(normalizarDesglose(leerDesglose(original?.desglose)))) delete patch.desglose;
    else patch.desglose = desgloseNuevo;
    try {
      const saved = await updateAdditionalItem(itemId, patch);
      setItems((prev) => prev.map((item) => item.id === itemId ? saved : item));
      setEditingId(null);
      toast.success("Renglon actualizado.");
    } catch (err) {
      toast.error(err.message || "No se pudo actualizar el renglon.");
    }
  }

  async function handleDeleteRow(item) {
    const ok = await confirm({
      title: "Eliminar renglon",
      message: item.detail,
      confirmLabel: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteAdditionalItem(item.id, { adjuntoPath: item.adjunto_path });
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      toast.success("Renglon eliminado.");
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar.");
    }
  }

  async function handleLinkRequest(request, scopedItems = null) {
    if (!selected) return;
    try {
      const itemsForRequest = Array.isArray(scopedItems) ? scopedItems : await fetchRequestItems(request.id);
      const linkedItemIds = new Set(selectedItems.map((item) => item.purchase_request_item_id).filter(Boolean));
      const missingItems = itemsForRequest.filter((item) => !linkedItemIds.has(item.id));
      const alreadyLinkedFallback = itemsForRequest.length === 0
        && selectedItems.some((item) => item.purchase_request_id === request.id);

      if ((itemsForRequest.length > 0 && missingItems.length === 0) || alreadyLinkedFallback) {
        toast.warning("Ese pedido ya esta sumado en esta tabla.");
        return;
      }

      const rows = itemsForRequest.length > 0
        ? missingItems.map((item) => rowFromRequestItem(request, item))
        : [rowFromRequest(request)];
      const saved = await Promise.all(rows.map((row) => createAdditionalItem({
        ...row,
        board_id: selected.id,
      })));
      setItems((prev) => [...saved, ...prev]);
      toast.success(rows.length > 1
        ? `${saved.length} items sumados a adicionales.`
        : "Pedido sumado a adicionales.");
    } catch (err) {
      toast.error(err.message || "No se pudo vincular el pedido.");
    }
  }

  async function handleAddAudioMemory() {
    if (!selected || !selectedAudio || audioAlreadyAdded) return;
    try {
      const item = await createAdditionalItem({
        board_id: selected.id,
        entry_date: new Date().toISOString().slice(0, 10),
        provider: "",
        detail: `Audio - ${selectedAudio}`.slice(0, 260),
        amount: null,
        currency: "ARS",
        notes: "Sugerido desde memoria descriptiva del barco. Compras define si corresponde como adicional.",
      });
      setItems((prev) => [item, ...prev]);
      toast.success("Audio sumado a la tabla de adicionales.");
    } catch (err) {
      toast.error(err.message || "No se pudo sumar el audio.");
    }
  }

  async function handleExpandLinkedRow(row) {
    if (!selected || !row.purchase_request_id || !row.request) return;
    try {
      const requestItems = await fetchRequestItems(row.purchase_request_id);
      if (requestItems.length === 0) {
        toast.warning("Ese pedido no tiene items para desglosar.");
        return;
      }
      const saved = await Promise.all(requestItems.map((item) => createAdditionalItem({
        ...rowFromRequestItem(row.request, item),
        board_id: selected.id,
      })));
      await deleteAdditionalItem(row.id);
      setItems((prev) => [
        ...saved,
        ...prev.filter((item) => item.id !== row.id),
      ]);
      toast.success(`${saved.length} items desglosados.`);
    } catch (err) {
      toast.error(err.message || "No se pudieron desglosar los items.");
    }
  }

  async function handleCreateRequest(e) {
    e.preventDefault();
    if (!selected || !requestForm.detail.trim()) return;
    setSavingRequest(true);
    try {
      const request = await createPurchaseRequest({
        form: {
          title: `Adicionales - ${selected.name}`,
          description: buildDescription(selected, requestForm),
          priority: requestForm.priority,
          project_id: selected.project_id || "",
          needed_at: requestForm.needed_at,
          source: "adicionales",
          source_ref: selected.id,
          es_adicional: true,
        },
        ccUserIds: [],
        photoFile: null,
      });

      const createdRequestItem = await addRequestItem(request.id, {
        description: requestForm.detail.trim(),
        quantity: null,
        unit: "adicional",
        destination: selected.name,
        notes: requestForm.provider ? `Proveedor sugerido: ${requestForm.provider.trim()}` : null,
      });

      const item = await createAdditionalItem({
        board_id: selected.id,
        purchase_request_id: request.id,
        entry_date: new Date().toISOString().slice(0, 10),
        provider: requestForm.provider,
        detail: requestForm.detail,
        amount: requestForm.amount,
        currency: requestForm.currency,
      });

      setItems((prev) => [item, ...prev]);
      setRequestItems((prev) => [createdRequestItem, ...prev]);
      setRequestForm(emptyRequest);
      setShowRequestForm(false);
      onRequestCreated?.();
      notifyComprasEmail({
        type: "new_request",
        requestId: request.id,
        requestTitle: request.title,
        changedBy: profile?.id,
        createdByName: profile?.username || "Compras",
        source: "adicionales",
      });
      toast.success("Pedido de adicionales creado.");
    } catch (err) {
      toast.error(err.message || "No se pudo crear el pedido.");
    } finally {
      setSavingRequest(false);
    }
  }

  async function handleSubirAdjunto(item, file) {
    setAdjuntoBusyId(item.id);
    try {
      // Se cuentan las hojas antes de subir: si el PDF no se puede leer acá,
      // tampoco se va a poder anexar al informe.
      let paginas;
      try {
        const { PDFDocument } = await import("pdf-lib");
        paginas = (await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })).getPageCount();
      } catch {
        throw new Error("No se pudo leer el PDF. Puede estar dañado o protegido con contraseña.");
      }
      const saved = await subirAdjuntoAdicional(item, file, { paginas });
      setItems((prev) => prev.map((row) => row.id === item.id ? saved : row));
      toast.success(`PDF adjunto (${paginas} hoja${paginas === 1 ? "" : "s"}).`);
    } catch (err) {
      toast.error(err.message || "No se pudo subir el PDF.");
    } finally {
      setAdjuntoBusyId(null);
    }
  }

  async function handleQuitarAdjunto(item) {
    const ok = await confirm({
      title: "Quitar PDF",
      message: `Se borra ${item.adjunto_nombre || "el PDF adjunto"}. El desglose queda.`,
      confirmLabel: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    setAdjuntoBusyId(item.id);
    try {
      const saved = await quitarAdjuntoAdicional(item);
      setItems((prev) => prev.map((row) => row.id === item.id ? saved : row));
      toast.success("PDF quitado.");
    } catch (err) {
      toast.error(err.message || "No se pudo quitar el PDF.");
    } finally {
      setAdjuntoBusyId(null);
    }
  }

  async function handleVerAdjunto(item) {
    // La pestaña se abre antes de pedir el link: si se abre después del
    // await, el navegador la toma como ventana emergente y la bloquea.
    const ventana = window.open("about:blank", "_blank");
    try {
      const url = await verAdjuntoAdicional(item.adjunto_path);
      if (ventana) ventana.location.href = url;
      else window.location.assign(url);
    } catch (err) {
      ventana?.close();
      toast.error(err.message || "No se pudo abrir el PDF.");
    }
  }

  async function handleExportReport() {
    if (!selected) return;
    if (selectedItems.length === 0) {
      toast.warning("No hay renglones para exportar.");
      return;
    }
    setExportingReport(true);
    try {
      // Estado y cantidad de la línea de compra como están hoy, no como
      // quedaron escritos en las notas cuando se vinculó el renglón.
      const compraPorId = new Map(requestItems.map((it) => [it.id, { estado: it.status, cantidad: it.quantity, unidad: it.unit }]));
      const adjuntos = new Map();
      for (const item of selectedItems) {
        if (!item.adjunto_path || !leerDesglose(item.desglose) || item.amount == null) continue;
        try {
          adjuntos.set(item.id, await descargarAdjuntoAdicional(item.adjunto_path));
        } catch {
          toast.warning(`No se pudo bajar el PDF de "${item.detail}": el anexo sale sin las copias.`);
        }
      }
      const { bytes, avisos } = await construirDetalleAdicionales({
        board: selected,
        rows: selectedItems,
        compraDe: (item) => compraPorId.get(item.purchase_request_item_id) ?? null,
        incluirSinImporte,
        logo: await loadNavyLogo(),
        adjuntos,
      });
      descargarArchivo(bytes, nombreArchivoDetalle(selected));
      avisos.forEach((aviso) => toast.warning(aviso));
      toast.success("Informe exportado.");
    } catch (err) {
      toast.error(err.message || "No se pudo exportar el informe.");
    } finally {
      setExportingReport(false);
    }
  }

  const panelGrid = isMobile ? "1fr" : "auto minmax(0, 1fr)";

  if (loading) {
    return (
      <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: C.dim, fontSize: 13 }}>
        <span style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${C.border2}`, borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ border: `1px solid ${C.red}44`, background: `${C.red}12`, color: C.red, borderRadius: 8, padding: 14, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  return (
    <>
    <Cabecera
      eyebrow="Compras · Gastos"
      titulo="Adicionales por"
      acento="obra"
      sub={<>Lo que se compra fuera de la matriz de cada barco · <b className="mono">{boards.length}</b> tablas</>}
    />
    <div className="cmp-adic" style={{ display: "grid", gridTemplateColumns: panelGrid, gap: 14, minHeight: 0 }}>
      {/* El rail scrollea solo. Con veintiún tablas estiraba el alto de la
          página, así que al bajar para ver una tabla del final también se iba
          de pantalla el contenido de la derecha. */}
      <aside className="cmp-adic-rail" style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0, maxHeight: "calc(100vh - 210px)", overflowY: "auto", paddingRight: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ color: C.dim, fontSize: 11, fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase" }}>Tablas</div>
          <span style={{ flex: 1 }} />
          <button type="button" title="Recargar" onClick={load} style={iconButton(C.dim)}>
            <RefreshCw size={13} />
          </button>
        </div>

        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar tabla..." style={{ ...inputStyle, paddingLeft: 28 }} />
        </div>

        {!showBoardForm ? (
          <button type="button" onClick={() => setShowBoardForm(true)} style={toneButton(C.blue)}>
            <Plus size={13} /> Nueva tabla
          </button>
        ) : (
          <form onSubmit={handleCreateBoard} style={{ display: "grid", gap: 8, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 700 }}>Nueva tabla</div>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => setShowBoardForm(false)} style={{ ...iconButton(C.dim), width: 26, height: 26 }}>
                <X size={12} />
              </button>
            </div>
            <div>
              <div style={labelStyle}>Barco existente</div>
              <select value={boardProjectId} onChange={(e) => setBoardProjectId(e.target.value)} style={inputStyle}>
                <option value="">Sin vincular</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>{project.codigo}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={labelStyle}>Nombre / alias</div>
              <input value={boardName} onChange={(e) => setBoardName(e.target.value)} placeholder={boardProjectId ? projectById(boardProjectId)?.codigo : "Ej: K37-38"} style={inputStyle} />
            </div>
            <textarea value={boardNotes} onChange={(e) => setBoardNotes(e.target.value)} placeholder="Notas" rows={2} style={{ ...inputStyle, resize: "vertical" }} />
            <button type="submit" disabled={savingBoard} style={{ ...toneButton(C.blue, true), opacity: savingBoard ? 0.55 : 1 }}>
              <Check size={13} /> Guardar
            </button>
          </form>
        )}

        <div style={{ display: "grid", gap: 6 }}>
          {[
            { clave: "conDatos", titulo: "Con adicionales", lista: boardsPorEstado.conDatos },
            { clave: "vacias", titulo: "Sin cargar", lista: boardsPorEstado.vacias },
          ].map(({ clave, titulo, lista }) => {
            if (!lista.length) return null;
            const plegable = clave === "vacias";
            const abierto = !plegable || verVacias;
            return (
              <div key={clave} style={{ display: "grid", gap: 6 }}>
                <button
                  type="button"
                  onClick={plegable ? () => setVerVacias((v) => !v) : undefined}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "6px 4px 2px",
                    border: "none",
                    background: "transparent",
                    color: C.dim,
                    fontFamily: C.sans,
                    fontSize: 11,
                    fontWeight: 650,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    cursor: plegable ? "pointer" : "default",
                    textAlign: "left",
                  }}
                >
                  {titulo}
                  <span style={{ fontFamily: C.mono, letterSpacing: 0 }}>{lista.length}</span>
                  {plegable && (
                    <ChevronDown size={12} style={{ marginLeft: "auto", transform: abierto ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
                  )}
                </button>

                {abierto && lista.map(({ board, stat }) => {
                  const active = board.id === selectedId;
                  const conPlata = stat.totalArs > 0 || stat.totalUsd > 0;
                  return (
                    <button
                      key={board.id}
                      type="button"
                      // Al ordenar por plata la tabla seleccionada puede quedar
                      // muy abajo y fuera de la vista: el rail se abría sin
                      // mostrar cuál está abierta.
                      ref={active ? seleccionadaRef : null}
                      onClick={() => setSelectedId(board.id)}
                      style={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: "1fr auto",
                        gap: 8,
                        textAlign: "left",
                        border: `1px solid ${active ? C.blueB : C.border}`,
                        background: active ? C.blueL : C.panel,
                        boxShadow: "none",
                        borderRadius: 12,
                        color: C.text,
                        padding: active ? "10px 12px 10px 15px" : "10px 12px",
                        cursor: "pointer",
                        minWidth: 0,
                      }}
                    >
                      {active && (
                        <span style={{ position: "absolute", left: 0, top: 9, bottom: 9, width: 3, borderRadius: "0 3px 3px 0", background: C.blue }} />
                      )}
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                          {board.name}
                        </span>
                        <span style={{ display: "block", marginTop: 2, color: C.dim, fontSize: 11 }}>
                          {board.project?.codigo || "Sin obra"}
                          {stat.count > 0 ? ` · ${stat.count} ${stat.count === 1 ? "ítem" : "ítems"}` : ""}
                        </span>
                      </span>
                      {/* El "$0" iba en verde igual que un millón: los dos gritaban
                          lo mismo. Sin plata cargada no se muestra importe. */}
                      {conPlata && (
                        <span style={{ display: "grid", gap: 2, justifyItems: "end", alignContent: "center", color: C.green, fontFamily: C.mono, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                          <span>{compactMoney(stat.totalArs, "ARS")}</span>
                          {stat.totalUsd > 0 && <span>{compactMoney(stat.totalUsd, "USD")}</span>}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </aside>

      <section style={{ minWidth: 0, display: "grid", gap: 12, alignContent: "start" }}>
        {!selected ? (
          <div style={{ minHeight: 260, border: `1px dashed ${C.border}`, borderRadius: 8, display: "grid", placeItems: "center", color: C.dim, fontSize: 13 }}>
            Crear una tabla de adicionales
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue }}>
                <Ship size={18} />
              </div>
              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                <div style={{ color: C.text, fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selected.name}
                </div>
                <div style={{ color: C.dim, fontSize: 12 }}>
                  {selected.project?.codigo ? `Obra ${selected.project.codigo}` : "Barco sin obra vinculada"}
                </div>
              </div>
              <button type="button" onClick={() => setShowRequestForm((v) => !v)} style={toneButton(C.blue, true)}>
                <PackagePlus size={13} /> {showRequestForm ? "Cerrar pedido" : "Pedido"}
              </button>
              {totals.pending > 0 && (
                <label
                  title="Los renglones sin importe van en una sección aparte y nunca se suman al total"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C.muted, fontSize: 12, cursor: "pointer", userSelect: "none" }}
                >
                  <input type="checkbox" checked={incluirSinImporte} onChange={(e) => setIncluirSinImporte(e.target.checked)} />
                  Sin importe en el informe
                </label>
              )}
              <button
                type="button"
                onClick={handleExportReport}
                disabled={exportingReport || selectedItems.length === 0}
                style={{ ...toneButton(C.green, true), opacity: exportingReport || selectedItems.length === 0 ? 0.55 : 1, cursor: exportingReport || selectedItems.length === 0 ? "default" : "pointer" }}
              >
                <FileDown size={13} /> {exportingReport ? "Armando…" : "Informe"}
              </button>
              <button type="button" title="Eliminar tabla" onClick={handleDeleteBoard} style={iconButton(C.red)}>
                <Trash2 size={13} />
              </button>
            </div>

            {/* Eran seis tarjetas grandes, casi siempre en cero, ocupando una
                banda entera arriba de la tabla. Un total es un dato de
                referencia: va en una línea, y las monedas que están en cero no
                se muestran en vez de gritar "USD 0". */}
            <StatStrip items={[
              { label: "Total ARS", value: compactMoney(totals.totalArs, "ARS"), tone: totals.totalArs ? "ok" : "neutro" },
              totals.totalUsd ? { label: "Total USD", value: compactMoney(totals.totalUsd, "USD"), tone: "ok" } : null,
              { label: "Este mes", value: compactMoney(totals.monthArs, "ARS"), tone: "curso" },
              totals.monthUsd ? { label: "Mes USD", value: compactMoney(totals.monthUsd, "USD"), tone: "curso" } : null,
              { label: "Renglones", value: totals.count },
              totals.pending ? { label: "Sin importe", value: totals.pending, tone: "critico" } : null,
            ]} />

            {selectedAudio && (
              <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "auto minmax(0, 1fr) auto",
                gap: 10,
                alignItems: "center",
                border: `1px solid ${C.cyan}33`,
                background: `${C.cyan}0d`,
                borderRadius: 8,
                padding: "10px 12px",
                minWidth: 0,
              }}>
                <div style={{ width: 30, height: 30, borderRadius: 7, display: "grid", placeItems: "center", color: C.cyan, background: C.panel, border: `1px solid ${C.border}` }}>
                  <Volume2 size={14} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ ...labelStyle, marginBottom: 3 }}>Audio del barco</div>
                  <div style={{ color: C.text, fontSize: 13, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {selectedAudio}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={audioAlreadyAdded}
                  onClick={handleAddAudioMemory}
                  style={{ ...toneButton(C.cyan, !audioAlreadyAdded), opacity: audioAlreadyAdded ? 0.55 : 1, cursor: audioAlreadyAdded ? "default" : "pointer" }}
                >
                  <PackagePlus size={13} /> {audioAlreadyAdded ? "Sumado" : "Sumar"}
                </button>
              </div>
            )}

            {showRequestForm && (
              <form onSubmit={handleCreateRequest} style={{ display: "grid", gap: 9, border: `1px solid ${C.cyan}33`, background: `${C.cyan}0d`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 150px 120px 88px 120px", gap: 8 }}>
                  <input value={requestForm.detail} onChange={(e) => setRequestForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle del adicional" style={inputStyle} />
                  <input value={requestForm.provider} onChange={(e) => setRequestForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
                  <input value={requestForm.amount} onChange={(e) => setRequestForm((f) => ({ ...f, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Importe" style={inputStyle} />
                  <select value={requestForm.currency} onChange={(e) => setRequestForm((f) => ({ ...f, currency: e.target.value }))} style={inputStyle} title="Moneda">
                    {CURRENCIES.map((currency) => (
                      <option key={currency.value} value={currency.value}>{currency.label}</option>
                    ))}
                  </select>
                  <select value={requestForm.priority} onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                    {REQUEST_PRIORITIES.map((priority) => (
                      <option key={priority.value} value={priority.value}>{priority.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <input value={requestForm.needed_at} onChange={(e) => setRequestForm((f) => ({ ...f, needed_at: e.target.value }))} type="date" style={{ ...inputStyle, width: 150 }} />
                  <button type="submit" disabled={savingRequest || !requestForm.detail.trim()} style={{ ...toneButton(C.cyan, true), opacity: savingRequest || !requestForm.detail.trim() ? 0.55 : 1 }}>
                    <PackagePlus size={13} /> Crear pedido
                  </button>
                </div>
              </form>
            )}

            <form onSubmit={handleAddRow} className="cmp-adic-alta" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "112px 140px minmax(150px, 1fr) 62px 120px 78px auto", gap: 7, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: 10 }}>
              <input type="date" value={rowForm.entry_date} onChange={(e) => setRowForm((f) => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
              <input value={rowForm.provider} onChange={(e) => setRowForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
              <input value={rowForm.detail} onChange={(e) => setRowForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle extra" style={inputStyle} />
              <input value={rowForm.cantidad} onChange={(e) => setRowForm((f) => ({ ...f, cantidad: e.target.value }))} placeholder="Cant." title="Cantidad" style={{ ...inputStyle, textAlign: "center" }} />
              <div style={{ position: "relative" }}>
                <DollarSign size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                <input value={rowForm.amount} onChange={(e) => setRowForm((f) => ({ ...f, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Importe" style={{ ...inputStyle, paddingLeft: 26 }} />
              </div>
              <select value={rowForm.currency} onChange={(e) => setRowForm((f) => ({ ...f, currency: e.target.value }))} style={inputStyle} title="Moneda">
                {CURRENCIES.map((currency) => (
                  <option key={currency.value} value={currency.value}>{currency.label}</option>
                ))}
              </select>
              <button type="submit" disabled={savingRow || !rowForm.detail.trim()} title="Agregar" style={{ ...toneButton(C.blue, true), opacity: savingRow || !rowForm.detail.trim() ? 0.55 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </form>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "110px 150px minmax(220px, 1fr) 130px 124px",
                    gap: 10,
                    padding: "8px 10px",
                    borderBottom: `1px solid ${C.border}`,
                    color: C.dim,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1.1,
                    fontWeight: 700,
                  }}>
                    <span>Fecha</span>
                    <span>Proveedor</span>
                    <span>Detalle</span>
                    <span style={{ textAlign: "right" }}>Importe</span>
                    <span style={{ textAlign: "right" }}>Acciones</span>
                  </div>
                  {selectedItems.length === 0 ? (
                    <div style={{ padding: 22, color: C.dim, fontSize: 13, textAlign: "center" }}>
                      Sin renglones
                    </div>
                  ) : selectedItems.map((item) => {
                    const editing = editingId === item.id;
                    const canExpandLinkedRow = item.purchase_request_id
                      && selectedItems.filter((row) => row.purchase_request_id === item.purchase_request_id).length === 1;
                    return (
                      <div key={item.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "110px 150px minmax(220px, 1fr) 130px 124px",
                          gap: 10,
                          alignItems: "center",
                          padding: "9px 10px",
                          color: C.muted,
                          fontSize: 13,
                        }}>
                          <span style={{ fontFamily: C.mono, color: C.dim }}>{formatDate(item.entry_date)}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.provider || "-"}</span>
                          <span style={{ minWidth: 0 }}>
                            {item.cantidad != null && String(item.cantidad).trim() !== "" && (
                              <span style={{ color: C.blue, fontWeight: 650, marginRight: 6, fontFamily: C.mono }}>{String(item.cantidad).trim()}×</span>
                            )}
                            <span style={{ color: C.text, fontWeight: 650 }}>{item.detail}</span>
                            {item.purchase_request_id && (
                              <button type="button" onClick={() => onSelectRequest?.(item.purchase_request_id)} style={{ marginLeft: 7, border: "none", background: "transparent", color: C.blue, cursor: "pointer", padding: 0, verticalAlign: "middle" }} title="Abrir pedido">
                                <ExternalLink size={12} />
                              </button>
                            )}
                            <ItemMeta notes={item.notes} linkUrl={item.link_url} />
                            <RowExtras item={item} onVerAdjunto={handleVerAdjunto} />
                          </span>
                          <span style={{ textAlign: "right", color: item.amount !== null && item.amount !== undefined ? C.green : C.dim, fontFamily: C.mono, fontWeight: 700 }}>
                            {money(item.amount, item.currency)}
                          </span>
                          <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            {canExpandLinkedRow && (
                              <button type="button" onClick={() => handleExpandLinkedRow(item)} title="Desglosar items del pedido" style={iconButton(C.cyan)}>
                                <PackagePlus size={12} />
                              </button>
                            )}
                            <button type="button" onClick={() => editing ? setEditingId(null) : startEdit(item)} title="Editar" style={iconButton(editing ? C.blue : C.dim)}>
                              {editing ? <X size={12} /> : <Pencil size={12} />}
                            </button>
                            <button type="button" onClick={() => handleDeleteRow(item)} title="Eliminar" style={iconButton(C.red)}>
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </div>
                        {editing && (
                          <div className="cmp-adic-alta" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "108px 130px minmax(170px, 1fr) 60px 110px 78px auto", gap: 7, padding: "0 10px 10px", background: C.panel2 }}>
                            <input type="date" value={editForm.entry_date} onChange={(e) => setEditForm((f) => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
                            <input value={editForm.provider} onChange={(e) => setEditForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
                            <input value={editForm.detail} onChange={(e) => setEditForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle" style={inputStyle} />
                            <input value={editForm.cantidad} onChange={(e) => setEditForm((f) => ({ ...f, cantidad: e.target.value }))} placeholder="Cant." title="Cantidad" style={{ ...inputStyle, textAlign: "center" }} />
                            <input type="number" min="0" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Importe" style={inputStyle} />
                            <select value={editForm.currency} onChange={(e) => setEditForm((f) => ({ ...f, currency: e.target.value }))} style={inputStyle} title="Moneda">
                              {CURRENCIES.map((currency) => (
                                <option key={currency.value} value={currency.value}>{currency.label}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => handleSaveEdit(item.id)} style={toneButton(C.green, true)}>
                              <Check size={13} /> Guardar
                            </button>
                            <DesgloseEditor
                              value={editForm.desglose}
                              onChange={(desglose) => setEditForm((f) => ({ ...f, desglose }))}
                              item={item}
                              amount={editForm.amount}
                              currency={editForm.currency}
                              isMobile={isMobile}
                              busy={adjuntoBusyId === item.id}
                              onSubir={handleSubirAdjunto}
                              onQuitar={handleQuitarAdjunto}
                              onVer={handleVerAdjunto}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Esto NO es la tabla: es el cajón de donde se saca material para
                sumarle. Se llamaba "Pedidos de esta obra", que además de sonar
                igual que la tabla era mentira -la coincidencia es por ítems, así
                que aparecen pedidos de otras obras-. Y venía siempre abierto con
                dieciséis renglones abajo de una tabla de uno, así que la
                pantalla parecía ser esto. */}
            <div style={{ display: "grid", gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => setVerCandidatos((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    border: "none",
                    background: "transparent",
                    padding: 0,
                    color: C.muted,
                    fontFamily: C.sans,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  <ChevronDown size={13} style={{ transform: verCandidatos ? "rotate(180deg)" : "none", transition: "transform .16s" }} />
                  Pedidos que se pueden sumar
                  <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>{boardRequests.length}</span>
                </button>
                <span style={{ flex: 1 }} />
                {verCandidatos && (
                  <div style={{ position: "relative", width: isMobile ? "100%" : 260 }}>
                    <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim, pointerEvents: "none" }} />
                    <input
                      value={requestSearch}
                      onChange={(e) => setRequestSearch(e.target.value)}
                      placeholder="Buscar pedido o item..."
                      style={{ ...inputStyle, paddingLeft: 28 }}
                    />
                  </div>
                )}
              </div>

              {!verCandidatos ? null : boardRequests.length === 0 ? (
                <div style={{ border: `1px dashed ${C.border}`, borderRadius: 8, padding: 18, color: C.dim, fontSize: 13, textAlign: "center" }}>
                  Sin pedidos relacionados
                </div>
              ) : (
                <div style={{ display: "grid", gap: 6 }}>
                  {boardRequests.map(({ request, allItems, scopedItems }) => {
                    const linkedItemsCount = scopedItems.filter((item) => linkedRequestItemIds.has(item.id)).length;
                    const linked = scopedItems.length > 0
                      ? linkedItemsCount === scopedItems.length
                      : linkedRequestIds.has(request.id);
                    const partiallyLinked = scopedItems.length > 0 && linkedItemsCount > 0 && !linked;
                    const hint = additionalHint(request, scopedItems);
                    const visibleItems = scopedItems.slice(0, 3);
                    const hiddenItems = scopedItems.length - visibleItems.length;
                    return (
                      <div key={request.id} style={{
                        display: "grid",
                        gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto auto",
                        gap: 8,
                        alignItems: "center",
                        border: `1px solid ${hint ? C.cyan + "33" : C.border}`,
                        background: hint ? `${C.cyan}0a` : C.panel,
                        borderRadius: 8,
                        padding: "9px 10px",
                      }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                            <span style={{ color: C.text, fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
                              {request.title}
                            </span>
                            {hint && (
                              <span style={{
                                border: `1px solid ${C.cyan}44`,
                                color: C.cyan,
                                background: `${C.cyan}12`,
                                borderRadius: 999,
                                padding: "2px 7px",
                                fontSize: 10,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}>
                                {hint}
                              </span>
                            )}
                          </div>
                          <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>
                            {formatDate(request.created_at?.slice(0, 10))} / {request.project?.codigo || "Por items"} / {request.proveedor || "Sin proveedor"} / {money(request.actual_amount ?? request.estimated_amount)}
                          </div>
                          {visibleItems.length > 0 && (
                            <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                              {visibleItems.map((item) => (
                                <div key={item.id} style={{ color: C.muted, fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {[item.quantity, item.unit].filter(Boolean).join(" ")}
                                  {item.quantity || item.unit ? " / " : ""}
                                  {item.description}
                                  {item.destination ? ` / ${item.destination}` : ""}
                                </div>
                              ))}
                              {hiddenItems > 0 && (
                                <div style={{ color: C.dim, fontSize: 11 }}>
                                  +{hiddenItems} items mas
                                </div>
                              )}
                              {allItems.length !== scopedItems.length && (
                                <div style={{ color: C.cyan, fontSize: 11, fontWeight: 650 }}>
                                  {scopedItems.length} de {allItems.length} items coinciden con esta obra
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={linked}
                          onClick={() => handleLinkRequest(request, scopedItems)}
                          style={{ ...toneButton(linked ? C.green : C.blue, linked), opacity: linked ? 0.65 : 1, cursor: linked ? "default" : "pointer" }}
                        >
                          <Link2 size={13} /> {linked ? "Sumado" : partiallyLinked ? "Faltantes" : "Sumar"}
                        </button>
                        <button type="button" onClick={() => onSelectRequest?.(request.id)} style={iconButton(C.blue)} title="Abrir pedido">
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
    </>
  );
}
