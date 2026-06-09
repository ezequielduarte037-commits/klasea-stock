import { useEffect, useMemo, useState } from "react";
import {
  Check,
  DollarSign,
  ExternalLink,
  Link2,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ship,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import {
  addRequestItem,
  createAdditionalBoard,
  createAdditionalItem,
  createPurchaseRequest,
  deleteAdditionalBoard,
  deleteAdditionalItem,
  fetchAdditionalBoards,
  fetchAdditionalItems,
  fetchRequestItems,
  ITEM_STATUSES,
  notifyComprasEmail,
  REQUEST_PRIORITIES,
  updateAdditionalItem,
} from "@/features/compras/purchaseRequestsApi";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useResponsive } from "@/hooks/useResponsive";
import { C } from "@/theme";

const emptyRow = {
  entry_date: new Date().toISOString().slice(0, 10),
  provider: "",
  detail: "",
  amount: "",
  notes: "",
};

const emptyRequest = {
  detail: "",
  provider: "",
  amount: "",
  priority: "media",
  needed_at: "",
};

const labelStyle = {
  color: C.dim,
  fontSize: 10,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  fontWeight: 800,
  marginBottom: 5,
};

const inputStyle = {
  width: "100%",
  background: C.panel,
  border: `1px solid ${C.border}`,
  color: C.text,
  borderRadius: 7,
  padding: "8px 9px",
  outline: "none",
  fontSize: 13,
  fontFamily: C.sans,
};

function money(value) {
  if (value === null || value === undefined || value === "") return "-";
  return `$${Number(value || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value) {
  return `$${Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
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

function looksAdditional(request) {
  const text = `${request?.source || ""} ${request?.title || ""} ${stripHtml(request?.description || "")}`.toLowerCase();
  return text.includes("adicional");
}

function rowFromRequest(request) {
  const desc = stripHtml(request.description);
  return {
    purchase_request_id: request.id,
    entry_date: request.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    provider: request.proveedor || "",
    detail: desc ? `${request.title} - ${desc}`.slice(0, 260) : request.title,
    amount: request.actual_amount ?? request.estimated_amount ?? null,
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
    item.link_url || null,
  ].filter(Boolean);

  return {
    purchase_request_id: request.id,
    entry_date: request.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    provider: request.proveedor || "",
    detail: item.description,
    amount: null,
    notes: meta.join(" / ") || "Item vinculado desde pedido de compras",
  };
}

function buildDescription(board, form) {
  const parts = [
    `<p><strong>Adicional para ${escapeHtml(board.name)}</strong></p>`,
    `<p>${escapeHtml(form.detail)}</p>`,
  ];
  if (form.provider) parts.push(`<p>Proveedor: ${escapeHtml(form.provider)}</p>`);
  if (form.amount) parts.push(`<p>Importe estimado: ${escapeHtml(money(form.amount))}</p>`);
  return parts.join("");
}

function toneButton(color, active = false) {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: `1px solid ${active ? color + "66" : C.border}`,
    background: active ? `${color}14` : C.panel,
    color: active ? color : C.muted,
    borderRadius: 7,
    padding: "7px 10px",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 800,
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
    borderRadius: 7,
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
      <div style={{ color, fontFamily: C.mono, fontSize: 18, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
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
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
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

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [boardRows, itemRows] = await Promise.all([
        fetchAdditionalBoards(),
        fetchAdditionalItems(),
      ]);
      setBoards(boardRows);
      setItems(itemRows);
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
      const stat = map.get(item.board_id) || { count: 0, total: 0, pending: 0 };
      stat.count += 1;
      if (item.amount === null || item.amount === undefined) stat.pending += 1;
      stat.total += Number(item.amount || 0);
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

  const selected = boards.find((board) => board.id === selectedId) || null;
  const selectedItems = useMemo(
    () => items.filter((item) => item.board_id === selectedId),
    [items, selectedId],
  );
  const linkedRequestIds = useMemo(
    () => new Set(items.map((item) => item.purchase_request_id).filter(Boolean)),
    [items],
  );

  const pendingRequests = useMemo(() => {
    if (!selected) return [];
    return requests
      .filter((request) => looksAdditional(request) && !linkedRequestIds.has(request.id))
      .sort((a, b) => {
        const aMatch = selected.project_id && a.project_id === selected.project_id ? 0 : 1;
        const bMatch = selected.project_id && b.project_id === selected.project_id ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      })
      .slice(0, 8);
  }, [linkedRequestIds, requests, selected]);

  const totals = useMemo(() => {
    const total = selectedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const month = selectedItems
      .filter((item) => item.entry_date?.slice(0, 7) === currentMonth)
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const pending = selectedItems.filter((item) => item.amount === null || item.amount === undefined).length;
    return { total, month, pending, count: selectedItems.length };
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
      amount: item.amount ?? "",
      notes: item.notes || "",
    });
  }

  async function handleSaveEdit(itemId) {
    if (!editForm.detail.trim()) return;
    try {
      const saved = await updateAdditionalItem(itemId, editForm);
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
      await deleteAdditionalItem(item.id);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      toast.success("Renglon eliminado.");
    } catch (err) {
      toast.error(err.message || "No se pudo eliminar.");
    }
  }

  async function handleLinkRequest(request) {
    if (!selected) return;
    try {
      const requestItems = await fetchRequestItems(request.id);
      const rows = requestItems.length > 0
        ? requestItems.map((item) => rowFromRequestItem(request, item))
        : [rowFromRequest(request)];
      const saved = await Promise.all(rows.map((row) => createAdditionalItem({
        ...row,
        board_id: selected.id,
      })));
      setItems((prev) => [...saved, ...prev]);
      toast.success(requestItems.length > 0
        ? `${saved.length} items sumados a adicionales.`
        : "Pedido sumado a adicionales.");
    } catch (err) {
      toast.error(err.message || "No se pudo vincular el pedido.");
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
        },
        ccUserIds: [],
        photoFile: null,
      });

      await addRequestItem(request.id, {
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
      });

      setItems((prev) => [item, ...prev]);
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

  const panelGrid = isMobile ? "1fr" : "280px minmax(0, 1fr)";

  if (loading) {
    return (
      <div style={{ minHeight: 260, display: "grid", placeItems: "center", color: C.dim, fontSize: 13 }}>
        <span style={{ display: "inline-block", width: 16, height: 16, border: `2px solid ${C.border2}`, borderTopColor: C.amber, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
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
    <div style={{ display: "grid", gridTemplateColumns: panelGrid, gap: 14, minHeight: 0 }}>
      <aside style={{ display: "grid", gap: 10, alignContent: "start", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, display: "grid", placeItems: "center", background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}33` }}>
            <Table2 size={15} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: C.text, fontSize: 14, fontWeight: 900 }}>Adicionales</div>
            <div style={{ color: C.dim, fontSize: 11, fontFamily: C.mono }}>{boards.length} tablas</div>
          </div>
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
              <div style={{ color: C.text, fontSize: 13, fontWeight: 850 }}>Nueva tabla</div>
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
          {filteredBoards.map((board) => {
            const active = board.id === selectedId;
            const stat = statsByBoard.get(board.id) || { count: 0, total: 0, pending: 0 };
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => setSelectedId(board.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 8,
                  textAlign: "left",
                  border: `1px solid ${active ? C.amber + "66" : C.border}`,
                  background: active ? `${C.amber}10` : C.panel,
                  borderRadius: 8,
                  color: C.text,
                  padding: "9px 10px",
                  cursor: "pointer",
                  minWidth: 0,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {board.name}
                  </span>
                  <span style={{ display: "block", marginTop: 2, color: C.dim, fontSize: 11 }}>
                    {board.project?.codigo || "Sin obra"} / {stat.count} items
                  </span>
                </span>
                <span style={{ color: stat.total > 0 ? C.green : C.dim, fontFamily: C.mono, fontSize: 12, fontWeight: 900, whiteSpace: "nowrap" }}>
                  {compactMoney(stat.total)}
                </span>
              </button>
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
              <div style={{ width: 34, height: 34, borderRadius: 8, display: "grid", placeItems: "center", background: C.panel, border: `1px solid ${C.border}`, color: C.amber }}>
                <Ship size={17} />
              </div>
              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
                <div style={{ color: C.text, fontSize: 18, fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {selected.name}
                </div>
                <div style={{ color: C.dim, fontSize: 12 }}>
                  {selected.project?.codigo ? `Obra ${selected.project.codigo}` : "Barco sin obra vinculada"}
                </div>
              </div>
              <button type="button" onClick={() => setShowRequestForm((v) => !v)} style={toneButton(C.amber, showRequestForm)}>
                <PackagePlus size={13} /> Pedido
              </button>
              <button type="button" title="Eliminar tabla" onClick={handleDeleteBoard} style={iconButton(C.red)}>
                <Trash2 size={13} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
              <StatBox label="Total" value={compactMoney(totals.total)} color={C.green} />
              <StatBox label="Este mes" value={compactMoney(totals.month)} color={C.amber} />
              <StatBox label="Renglones" value={totals.count} color={C.text} />
              <StatBox label="Sin importe" value={totals.pending} color={totals.pending ? C.red : C.green} />
            </div>

            {showRequestForm && (
              <form onSubmit={handleCreateRequest} style={{ display: "grid", gap: 9, border: `1px solid ${C.amber}33`, background: `${C.amber}0d`, borderRadius: 8, padding: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) 150px 130px 120px", gap: 8 }}>
                  <input value={requestForm.detail} onChange={(e) => setRequestForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle del adicional" style={inputStyle} />
                  <input value={requestForm.provider} onChange={(e) => setRequestForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
                  <input value={requestForm.amount} onChange={(e) => setRequestForm((f) => ({ ...f, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Importe" style={inputStyle} />
                  <select value={requestForm.priority} onChange={(e) => setRequestForm((f) => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                    {REQUEST_PRIORITIES.map((priority) => (
                      <option key={priority.value} value={priority.value}>{priority.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <input value={requestForm.needed_at} onChange={(e) => setRequestForm((f) => ({ ...f, needed_at: e.target.value }))} type="date" style={{ ...inputStyle, width: 150 }} />
                  <button type="submit" disabled={savingRequest || !requestForm.detail.trim()} style={{ ...toneButton(C.amber, true), opacity: savingRequest || !requestForm.detail.trim() ? 0.55 : 1 }}>
                    <PackagePlus size={13} /> Crear pedido
                  </button>
                </div>
              </form>
            )}

            <form onSubmit={handleAddRow} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "118px 160px minmax(180px, 1fr) 130px auto", gap: 7, border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, padding: 10 }}>
              <input type="date" value={rowForm.entry_date} onChange={(e) => setRowForm((f) => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
              <input value={rowForm.provider} onChange={(e) => setRowForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
              <input value={rowForm.detail} onChange={(e) => setRowForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle extra" style={inputStyle} />
              <div style={{ position: "relative" }}>
                <DollarSign size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: C.dim }} />
                <input value={rowForm.amount} onChange={(e) => setRowForm((f) => ({ ...f, amount: e.target.value }))} type="number" min="0" step="0.01" placeholder="Importe" style={{ ...inputStyle, paddingLeft: 26 }} />
              </div>
              <button type="submit" disabled={savingRow || !rowForm.detail.trim()} title="Agregar" style={{ ...toneButton(C.blue, true), opacity: savingRow || !rowForm.detail.trim() ? 0.55 : 1 }}>
                <Plus size={13} /> Agregar
              </button>
            </form>

            <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, background: C.panel, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: 760 }}>
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "110px 150px minmax(220px, 1fr) 130px 88px",
                    gap: 10,
                    padding: "8px 10px",
                    borderBottom: `1px solid ${C.border}`,
                    color: C.dim,
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1.1,
                    fontWeight: 850,
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
                    return (
                      <div key={item.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "110px 150px minmax(220px, 1fr) 130px 88px",
                          gap: 10,
                          alignItems: "center",
                          padding: "9px 10px",
                          color: C.muted,
                          fontSize: 13,
                        }}>
                          <span style={{ fontFamily: C.mono, color: C.dim }}>{formatDate(item.entry_date)}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.provider || "-"}</span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ color: C.text, fontWeight: 750 }}>{item.detail}</span>
                            {item.purchase_request_id && (
                              <button type="button" onClick={() => onSelectRequest?.(item.purchase_request_id)} style={{ marginLeft: 7, border: "none", background: "transparent", color: C.blue, cursor: "pointer", padding: 0, verticalAlign: "middle" }} title="Abrir pedido">
                                <ExternalLink size={12} />
                              </button>
                            )}
                            {item.notes && <span style={{ display: "block", color: C.dim, fontSize: 11, marginTop: 2 }}>{item.notes}</span>}
                          </span>
                          <span style={{ textAlign: "right", color: item.amount ? C.green : C.dim, fontFamily: C.mono, fontWeight: 900 }}>
                            {money(item.amount)}
                          </span>
                          <span style={{ display: "flex", gap: 5, justifyContent: "flex-end" }}>
                            <button type="button" onClick={() => editing ? setEditingId(null) : startEdit(item)} title="Editar" style={iconButton(editing ? C.blue : C.dim)}>
                              {editing ? <X size={12} /> : <Pencil size={12} />}
                            </button>
                            <button type="button" onClick={() => handleDeleteRow(item)} title="Eliminar" style={iconButton(C.red)}>
                              <Trash2 size={12} />
                            </button>
                          </span>
                        </div>
                        {editing && (
                          <div style={{ display: "grid", gridTemplateColumns: "110px 150px minmax(220px, 1fr) 130px auto", gap: 7, padding: "0 10px 10px", background: C.panel2 }}>
                            <input type="date" value={editForm.entry_date} onChange={(e) => setEditForm((f) => ({ ...f, entry_date: e.target.value }))} style={inputStyle} />
                            <input value={editForm.provider} onChange={(e) => setEditForm((f) => ({ ...f, provider: e.target.value }))} placeholder="Proveedor" style={inputStyle} />
                            <input value={editForm.detail} onChange={(e) => setEditForm((f) => ({ ...f, detail: e.target.value }))} placeholder="Detalle" style={inputStyle} />
                            <input type="number" min="0" step="0.01" value={editForm.amount} onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))} placeholder="Importe" style={inputStyle} />
                            <button type="button" onClick={() => handleSaveEdit(item.id)} style={toneButton(C.green, true)}>
                              <Check size={13} /> Guardar
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {pendingRequests.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ ...labelStyle, marginBottom: 0 }}>Pedidos de adicionales sin tabla</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {pendingRequests.map((request) => (
                    <div key={request.id} style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 1fr) auto auto",
                      gap: 8,
                      alignItems: "center",
                      border: `1px solid ${C.border}`,
                      background: C.panel,
                      borderRadius: 8,
                      padding: "9px 10px",
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ color: C.text, fontSize: 13, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {request.title}
                        </div>
                        <div style={{ color: C.dim, fontSize: 11 }}>
                          {request.project?.codigo || "Sin obra"} / {request.proveedor || "Sin proveedor"} / {money(request.actual_amount ?? request.estimated_amount)}
                        </div>
                      </div>
                      <button type="button" onClick={() => handleLinkRequest(request)} style={toneButton(C.blue)}>
                        <Link2 size={13} /> Sumar
                      </button>
                      <button type="button" onClick={() => onSelectRequest?.(request.id)} style={iconButton(C.blue)} title="Abrir pedido">
                        <ExternalLink size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
