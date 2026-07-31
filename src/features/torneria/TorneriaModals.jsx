import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Archive, Check, FileText, FileUp, Link2, Loader2, PackageOpen, PackageSearch, Plus,
  Search, Trash2, Truck,
} from "lucide-react";
import { C } from "@/theme";
import { buscarMateriales } from "@/features/produccion/catalogoBusquedaApi";
import {
  Field, Modal,
} from "./torneriaUi";
import { operationDestinationLabel } from "./torneriaLabels";
import {
  BUTTON, DANGER_BUTTON, INPUT, PRIMARY_BUTTON,
} from "./torneriaStyles";

const nowLocal = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

const PURCHASE_STATES = [
  ["pendiente_solicitud", "Por solicitar"],
  ["solicitado", "Solicitado"],
  ["comprado", "Comprado"],
  ["recibido_astillero", "En astillero"],
  ["no_aplica", "No aplica"],
];

export function CrearProcesoModal({
  obras,
  plantillas,
  procesos,
  onClose,
  onCreate,
}) {
  const usadas = useMemo(() => new Set(procesos.map((row) => row.obra_id)), [procesos]);
  const disponibles = useMemo(
    () => obras.filter((obra) => !usadas.has(obra.id)),
    [obras, usadas],
  );
  const [obraId, setObraId] = useState(disponibles[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const obra = disponibles.find((row) => row.id === obraId);
  const plantilla = plantillas.find((row) => row.linea_id === obra?.linea_id);

  async function submit() {
    if (!obraId || !plantilla) return;
    setSaving(true);
    try {
      await onCreate({ obraId, plantillaId: plantilla.id });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Nuevo seguimiento"
      subtitle="La obra recibe una copia editable del circuito correspondiente a su línea."
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={!obraId || !plantilla || saving}
            style={{ ...PRIMARY_BUTTON, opacity: !obraId || !plantilla || saving ? 0.5 : 1 }}
          >
            {saving ? <Loader2 className="spin" size={15} /> : <Plus size={15} />}
            Crear seguimiento
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 14 }}>
        <Field label="Obra">
          <select value={obraId} onChange={(event) => setObraId(event.target.value)} style={INPUT}>
            {!disponibles.length && <option value="">No hay obras disponibles</option>}
            {disponibles.map((row) => (
              <option key={row.id} value={row.id}>
                {row.codigo} · {row.linea_nombre || "Sin línea"}
              </option>
            ))}
          </select>
        </Field>

        {obra && plantilla ? (
          <div style={{
            display: "grid",
            gap: 5,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${C.blueB}`,
            background: C.blueL,
          }}>
            <div style={{ color: C.blue, fontSize: 12, fontWeight: 850 }}>
              Plantilla {plantilla.linea?.nombre || obra.linea_nombre}
            </div>
            <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.5 }}>
              {plantilla.descripcion}
            </div>
          </div>
        ) : obra ? (
          <div style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${C.redB}`,
            background: C.redL,
            color: C.red,
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            La línea {obra.linea_nombre || "sin asignar"} todavía no tiene una plantilla de Tornería.
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export function ProcesoModal({ proceso, onClose, onSave }) {
  const [form, setForm] = useState({
    nombre: proceso.nombre || "",
    estado: proceso.estado || "activo",
    taller_torneria: proceso.taller_torneria || "Tornería",
    taller_plegadora: proceso.taller_plegadora || "Plegadora",
    responsable: proceso.responsable || "",
    notas: proceso.notas || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Editar seguimiento"
      subtitle={`${proceso.obra?.codigo || "Obra"} · los cambios quedan en el historial.`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || !form.nombre.trim()} style={PRIMARY_BUTTON}>
            {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
            Guardar
          </button>
        </>
      )}
    >
      <div className="tor-form-grid">
        <Field label="Nombre" full>
          <input value={form.nombre} onChange={(event) => set("nombre", event.target.value)} style={INPUT} />
        </Field>
        <Field label="Estado">
          <select value={form.estado} onChange={(event) => set("estado", event.target.value)} style={INPUT}>
            <option value="borrador">Borrador</option>
            <option value="activo">Activo</option>
            <option value="pausado">Pausado</option>
            <option value="completado">Completado</option>
            <option value="cancelado">Cancelado</option>
          </select>
        </Field>
        <Field label="Responsable">
          <input value={form.responsable} onChange={(event) => set("responsable", event.target.value)} style={INPUT} />
        </Field>
        <Field label="Taller de Tornería">
          <input value={form.taller_torneria} onChange={(event) => set("taller_torneria", event.target.value)} style={INPUT} />
        </Field>
        <Field label="Plegadora">
          <input value={form.taller_plegadora} onChange={(event) => set("taller_plegadora", event.target.value)} style={INPUT} />
        </Field>
        <Field label="Notas" full>
          <textarea
            value={form.notas}
            onChange={(event) => set("notas", event.target.value)}
            rows={4}
            style={{ ...INPUT, resize: "vertical" }}
          />
        </Field>
      </div>
    </Modal>
  );
}

function CatalogSearch({ selected, onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setRows([]);
      return undefined;
    }
    let alive = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await buscarMateriales({ q, limit: 30 });
        if (alive) setRows(result);
      } finally {
        if (alive) setLoading(false);
      }
    }, 220);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, q]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button type="button" onClick={() => setOpen((value) => !value)} style={{
        ...BUTTON,
        width: "100%",
        justifyContent: "flex-start",
        minHeight: 46,
        color: selected ? C.green : C.muted,
        borderColor: selected ? C.greenB : C.border,
        background: selected ? C.greenL : C.panel,
      }}>
        <Link2 size={15} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected
            ? `${selected.codigo ? `${selected.codigo} · ` : ""}${selected.descripcion}`
            : "Vincular con un ítem del catálogo"}
        </span>
      </button>
      {open && (
        <div style={{
          display: "grid",
          gap: 8,
          padding: 10,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          background: C.panel,
        }}>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: 14, color: C.dim }} />
            <input
              autoFocus
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="Buscar descripción o código…"
              style={{ ...INPUT, paddingLeft: 34 }}
            />
          </div>
          <div style={{ maxHeight: 210, overflowY: "auto", display: "grid", gap: 4 }}>
            {loading && (
              <div style={{ display: "flex", gap: 8, justifyContent: "center", padding: 18, color: C.dim, fontSize: 12 }}>
                <Loader2 className="spin" size={15} /> Buscando…
              </div>
            )}
            {!loading && q.trim().length >= 2 && !rows.length && (
              <div style={{ padding: 18, textAlign: "center", color: C.dim, fontSize: 12 }}>
                Sin coincidencias
              </div>
            )}
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => {
                  onSelect(row);
                  setOpen(false);
                }}
                style={{
                  display: "grid",
                  gap: 2,
                  width: "100%",
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: `1px solid ${C.border}`,
                  background: C.panelSolid,
                  color: C.text,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 800 }}>{row.descripcion}</span>
                <span style={{ color: C.dim, fontSize: 10.5 }}>
                  {[row.codigo, row.proveedor, row.unidad].filter(Boolean).join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function ItemModal({ item, proceso, onClose, onSave, onArchive }) {
  const isNew = !item?.id;
  const [catalog, setCatalog] = useState(item?.material ?? null);
  const [alcance, setAlcance] = useState("obra");
  const [planos, setPlanos] = useState(() => Array.isArray(item?.planos) ? item.planos : []);
  const [archivosNuevos, setArchivosNuevos] = useState([]);
  const [form, setForm] = useState({
    grupo: item?.grupo || "Otros",
    descripcion: item?.descripcion || "",
    cantidad: item?.cantidad ?? 1,
    unidad: item?.unidad || "unidad",
    proveedor_compra: item?.proveedor_compra || "",
    material_id: item?.material_id || "",
    compra_estado: item?.compra_estado || "pendiente_solicitud",
    solicitado_por_torneria: item?.solicitado_por_torneria !== false,
    requiere_confirmacion: !!item?.requiere_confirmacion,
    alerta: item?.alerta || "",
    notas: item?.notas || "",
    es_resultado: !!item?.es_resultado,
    resultado_de: Array.isArray(item?.resultado_de) ? item.resultado_de : [],
  });
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  function pickMaterial(material) {
    setCatalog(material);
    setForm((prev) => ({
      ...prev,
      material_id: material.id,
      descripcion: prev.descripcion || material.descripcion,
      proveedor_compra: prev.proveedor_compra || material.proveedor,
      unidad: prev.unidad || material.unidad,
    }));
  }

  async function submit() {
    if (!form.descripcion.trim() || Number(form.cantidad) <= 0) return;
    setSaving(true);
    try {
      await onSave({
        alcance,
        planosExistentes: planos,
        archivosNuevos,
        fields: {
          ...form,
          material_id: form.es_resultado ? null : form.material_id || null,
          cantidad: Number(form.cantidad),
          proveedor_compra: form.es_resultado ? null : form.proveedor_compra.trim() || null,
          solicitado_por_torneria: form.es_resultado ? false : form.solicitado_por_torneria,
          compra_estado: form.es_resultado ? "no_aplica" : form.compra_estado,
          alerta: form.alerta.trim() || null,
          notas: form.notas.trim() || null,
        },
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Agregar material" : "Editar material"}
      subtitle={`${proceso.obra?.codigo || "Obra"} · cada cambio queda asociado al usuario.`}
      onClose={onClose}
      width={720}
      footer={(
        <>
          {!isNew && (
            <button type="button" onClick={() => onArchive(alcance)} style={{ ...DANGER_BUTTON, marginRight: "auto" }}>
              <Archive size={14} /> Archivar
            </button>
          )}
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !form.descripcion.trim() || Number(form.cantidad) <= 0}
            style={PRIMARY_BUTTON}
          >
            {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
            Guardar
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 6,
          padding: 5,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          background: C.panel,
        }}>
          {[
            [false, "Material comprado", "Se compra y después se envía a Tornería o Plegadora."],
            [true, "Conjunto resultante", "Se arma con otros materiales del proceso."],
          ].map(([value, title, hint]) => {
            const active = form.es_resultado === value;
            return (
              <button
                key={title}
                type="button"
                onClick={() => setForm((prev) => ({
                  ...prev,
                  es_resultado: value,
                  compra_estado: value ? "no_aplica" : prev.compra_estado === "no_aplica" ? "pendiente_solicitud" : prev.compra_estado,
                  solicitado_por_torneria: value ? false : prev.solicitado_por_torneria,
                  requiere_confirmacion: value ? true : prev.requiere_confirmacion,
                  alerta: value && !prev.alerta ? "Definí y confirmá la cantidad del conjunto resultante." : prev.alerta,
                }))}
                style={{
                  display: "grid",
                  gap: 2,
                  minWidth: 0,
                  padding: "9px 10px",
                  borderRadius: 9,
                  border: `1px solid ${active ? C.blueB : "transparent"}`,
                  background: active ? C.blueL : "transparent",
                  color: active ? C.blue : C.dim,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: C.sans,
                }}
              >
                <span style={{ fontSize: 11.5, fontWeight: 850 }}>{title}</span>
                <span style={{ fontSize: 9.5, lineHeight: 1.35 }}>{hint}</span>
              </button>
            );
          })}
        </div>

        <section style={{
          display: "grid",
          gap: 9,
          padding: 12,
          borderRadius: 12,
          border: `1px solid ${alcance === "linea" ? C.violetB : C.border}`,
          background: alcance === "linea" ? C.violetL : C.panel,
        }}>
          <div>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Aplicar este cambio en</div>
            <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.45, marginTop: 2 }}>
              Los estados de compra y recepción siempre siguen siendo propios de cada obra.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 6 }}>
            {[
              ["obra", "Sólo esta obra", proceso.obra?.codigo || "Obra actual"],
              ["linea", "Toda la línea", proceso.obra?.linea_nombre || "Línea de producción"],
            ].map(([value, title, detail]) => {
              const active = alcance === value;
              const disabled = value === "linea" && !proceso.plantilla_id;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setAlcance(value)}
                  style={{
                    display: "grid",
                    gap: 3,
                    minWidth: 0,
                    padding: "9px 10px",
                    borderRadius: 9,
                    border: `1px solid ${active ? (value === "linea" ? C.violetB : C.blueB) : C.border}`,
                    background: active ? (value === "linea" ? C.panel : C.blueL) : C.panelSolid,
                    color: active ? (value === "linea" ? C.violet : C.blue) : C.dim,
                    opacity: disabled ? 0.45 : 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    textAlign: "left",
                    fontFamily: C.sans,
                  }}
                >
                  <span style={{ fontSize: 11.5, fontWeight: 900 }}>{title}</span>
                  <span style={{ fontSize: 9.5, lineHeight: 1.35 }}>{detail}</span>
                </button>
              );
            })}
          </div>
          {alcance === "linea" && (
            <div style={{
              display: "flex",
              gap: 7,
              alignItems: "flex-start",
              color: C.violet,
              fontSize: 10.5,
              lineHeight: 1.4,
            }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              Actualiza la plantilla para obras futuras y las obras activas de esta línea.
            </div>
          )}
        </section>

        {!form.es_resultado && <CatalogSearch selected={catalog} onSelect={pickMaterial} />}

        {form.es_resultado && (
          <div style={{
            display: "grid",
            gap: 9,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${C.blueB}`,
            background: C.blueL,
          }}>
            <div>
              <div style={{ color: C.blue, fontSize: 12, fontWeight: 850 }}>Materiales que forman el conjunto</div>
              <div style={{ color: C.muted, fontSize: 10.5, lineHeight: 1.4, marginTop: 2 }}>
                Al completar esos recorridos, este será el ítem que viaje en la etapa siguiente.
              </div>
            </div>
            <div style={{ display: "grid", gap: 5, maxHeight: 190, overflowY: "auto" }}>
              {(proceso.items || [])
                .filter((row) => row.id !== item?.id && row.activo !== false && !row.es_resultado)
                .map((row) => {
                  const checked = form.resultado_de.includes(row.clave);
                  return (
                    <label key={row.id} style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "7px 9px",
                      borderRadius: 8,
                      border: `1px solid ${checked ? C.blueB : C.border}`,
                      background: checked ? C.panel : C.panelSolid,
                      color: checked ? C.text : C.muted,
                      cursor: "pointer",
                      fontSize: 11.5,
                      fontWeight: 750,
                    }}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => set("resultado_de", checked
                          ? form.resultado_de.filter((key) => key !== row.clave)
                          : [...form.resultado_de, row.clave])}
                      />
                      {row.descripcion}
                    </label>
                  );
                })}
            </div>
          </div>
        )}

        <div className="tor-form-grid">
          <Field label="Descripción" full>
            <input value={form.descripcion} onChange={(event) => set("descripcion", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Grupo">
            <input value={form.grupo} onChange={(event) => set("grupo", event.target.value)} style={INPUT} />
          </Field>
          {!form.es_resultado && (
            <Field label="Proveedor de compra">
              <input value={form.proveedor_compra} onChange={(event) => set("proveedor_compra", event.target.value)} style={INPUT} />
            </Field>
          )}
          <Field label="Cantidad">
            <input type="number" min="0.01" step="0.01" value={form.cantidad} onChange={(event) => set("cantidad", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Unidad">
            <input value={form.unidad} onChange={(event) => set("unidad", event.target.value)} style={INPUT} />
          </Field>
          {!form.es_resultado && (
            <>
              <Field label="Seguimiento de compra">
                <select value={form.compra_estado} onChange={(event) => set("compra_estado", event.target.value)} style={INPUT}>
                  {PURCHASE_STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </Field>
              <Field label="Solicitado por">
                <select
                  value={form.solicitado_por_torneria ? "torneria" : "astillero"}
                  onChange={(event) => set("solicitado_por_torneria", event.target.value === "torneria")}
                  style={INPUT}
                >
                  <option value="torneria">Tornería</option>
                  <option value="astillero">Astillero</option>
                </select>
              </Field>
            </>
          )}
          <Field label="Alerta de confirmación" full>
            <label style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              minHeight: 42,
              color: C.muted,
              fontSize: 12,
            }}>
              <input
                type="checkbox"
                checked={form.requiere_confirmacion}
                onChange={(event) => set("requiere_confirmacion", event.target.checked)}
              />
              Exigir confirmación antes de enviarlo
            </label>
          </Field>
          {form.requiere_confirmacion && (
            <Field label="Mensaje de alerta" full>
              <input value={form.alerta} onChange={(event) => set("alerta", event.target.value)} style={INPUT} />
            </Field>
          )}
          <Field label="Notas" full>
            <textarea value={form.notas} onChange={(event) => set("notas", event.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} />
          </Field>
        </div>

        <section style={{
          display: "grid",
          gap: 9,
          padding: 12,
          borderRadius: 12,
          border: `1px solid ${(planos.length || archivosNuevos.length) ? C.blueB : C.border}`,
          background: C.panel,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            <span style={{
              width: 32,
              height: 32,
              display: "grid",
              placeItems: "center",
              borderRadius: 9,
              border: `1px solid ${C.blueB}`,
              background: C.blueL,
              color: C.blue,
              flexShrink: 0,
            }}>
              <FileText size={15} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Planos del material</div>
              <div style={{ color: C.dim, fontSize: 10.5, lineHeight: 1.45, marginTop: 2 }}>
                PDF, DXF, DWG, STEP, imágenes o cualquier archivo técnico. Se adjuntan automáticamente al pedido de Compras.
              </div>
            </div>
          </div>

          {!!planos.length && (
            <div style={{ display: "grid", gap: 5 }}>
              {planos.map((plano, index) => (
                <div key={plano.path || plano.url || index} style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1fr) auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 9px",
                  borderRadius: 9,
                  border: `1px solid ${C.border}`,
                  background: C.panelSolid,
                }}>
                  <a
                    href={plano.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      minWidth: 0,
                      color: C.blue,
                      fontSize: 11,
                      fontWeight: 800,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plano.name || `Plano ${index + 1}`}
                  </a>
                  <button
                    type="button"
                    onClick={() => setPlanos((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    aria-label={`Quitar ${plano.name || "plano"}`}
                    style={{ ...DANGER_BUTTON, minHeight: 29, padding: "3px 7px" }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {!!archivosNuevos.length && (
            <div style={{ color: C.green, fontSize: 10.5, fontWeight: 800 }}>
              {archivosNuevos.length} archivo{archivosNuevos.length === 1 ? "" : "s"} nuevo{archivosNuevos.length === 1 ? "" : "s"} listo{archivosNuevos.length === 1 ? "" : "s"} para subir.
            </div>
          )}

          <label style={{
            ...BUTTON,
            justifyContent: "flex-start",
            minHeight: 42,
            borderStyle: "dashed",
            color: C.blue,
          }}>
            <FileUp size={15} />
            Agregar planos
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.dxf,.dwg,.step,.stp,.iges,.igs,.zip,.rar"
              onChange={(event) => setArchivosNuevos(Array.from(event.target.files || []))}
              style={{ display: "none" }}
            />
          </label>
        </section>
      </div>
    </Modal>
  );
}

export function OperacionModal({ operacion, proceso, onClose, onSave, onArchive }) {
  const isNew = !operacion?.id;
  const [form, setForm] = useState({
    clave: operacion?.clave || "",
    grupo: operacion?.grupo || "Otros",
    nombre: operacion?.nombre || "",
    tipo: operacion?.tipo || "torneria",
    viaje: operacion?.viaje ?? 1,
    origen: operacion?.origen || "Astillero",
    destino: operacion?.destino || "",
    descripcion: operacion?.descripcion || "",
    depende_de: operacion?.depende_de || [],
    orden: operacion?.orden ?? ((proceso.operaciones?.length || 0) + 1) * 10,
    activa: operacion?.activa !== false,
  });
  const [components, setComponents] = useState(() => new Map(
    (operacion?.componentes || []).map((row) => [
      row.item_id,
      Number(row.cantidad_requerida) || Number(row.item?.cantidad) || 1,
    ]),
  ));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  function toggleItem(item) {
    setComponents((prev) => {
      const next = new Map(prev);
      if (next.has(item.id)) next.delete(item.id);
      else next.set(item.id, Number(item.cantidad) || 1);
      return next;
    });
  }

  async function submit() {
    if (!form.nombre.trim() || !components.size) return;
    setSaving(true);
    try {
      await onSave({
        fields: form,
        componentes: [...components.entries()].map(([item_id, cantidad_requerida]) => ({
          item_id,
          cantidad_requerida,
        })),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isNew ? "Agregar paso al circuito" : "Editar paso"}
      subtitle="Podés cambiar el destino, el orden, las dependencias y las piezas que viajan juntas."
      onClose={onClose}
      width={760}
      footer={(
        <>
          {!isNew && (
            <button type="button" onClick={onArchive} style={{ ...DANGER_BUTTON, marginRight: "auto" }}>
              <Archive size={14} /> Archivar
            </button>
          )}
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || !form.nombre.trim() || !components.size} style={PRIMARY_BUTTON}>
            {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />} Guardar
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 18 }}>
        <div className="tor-form-grid">
          <Field label="Nombre" full>
            <input value={form.nombre} onChange={(event) => set("nombre", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Grupo">
            <input value={form.grupo} onChange={(event) => set("grupo", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Origen">
            <input
              value={form.origen}
              onChange={(event) => set("origen", event.target.value)}
              placeholder="Astillero o Proveedor"
              style={INPUT}
            />
          </Field>
          <Field label="Destino externo">
            <input value={form.destino} onChange={(event) => set("destino", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Tipo">
            <select value={form.tipo} onChange={(event) => set("tipo", event.target.value)} style={INPUT}>
              <option value="torneria">Tornería</option>
              <option value="plegadora">Plegadora</option>
              <option value="astillero">Astillero</option>
              <option value="otro">Otro</option>
            </select>
          </Field>
          <Field label="Viaje">
            <input type="number" min="1" value={form.viaje} onChange={(event) => set("viaje", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Orden">
            <input type="number" value={form.orden} onChange={(event) => set("orden", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Depende de">
            <select
              multiple
              value={form.depende_de}
              onChange={(event) => set("depende_de", [...event.target.selectedOptions].map((option) => option.value))}
              style={{ ...INPUT, minHeight: 96 }}
            >
              {(proceso.operaciones || [])
                .filter((row) => row.id !== operacion?.id && row.activa !== false)
                .map((row) => <option key={row.id} value={row.clave}>{row.nombre}</option>)}
            </select>
          </Field>
          <Field label="Descripción" full>
            <textarea value={form.descripcion} onChange={(event) => set("descripcion", event.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} />
          </Field>
        </div>

        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ color: C.text, fontSize: 12, fontWeight: 850 }}>Piezas de este paso</div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Marcá qué materiales viajan juntos.</div>
            </div>
            <span style={{ color: C.blue, fontSize: 11, fontWeight: 850 }}>{components.size} seleccionadas</span>
          </div>
          <div style={{ display: "grid", gap: 5, maxHeight: 270, overflowY: "auto" }}>
            {(proceso.items || []).filter((item) => item.activo !== false).map((item) => {
              const selected = components.has(item.id);
              return (
                <div key={item.id} style={{
                  display: "grid",
                  gridTemplateColumns: "auto minmax(0,1fr) 88px",
                  gap: 9,
                  alignItems: "center",
                  padding: 9,
                  borderRadius: 10,
                  border: `1px solid ${selected ? C.blueB : C.border}`,
                  background: selected ? C.blueL : C.panel,
                }}>
                  <button type="button" onClick={() => toggleItem(item)} style={{
                    width: 28,
                    height: 28,
                    display: "grid",
                    placeItems: "center",
                    borderRadius: 8,
                    border: `1px solid ${selected ? C.blue : C.border2}`,
                    background: selected ? C.blue : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                  }}>
                    {selected && <Check size={14} />}
                  </button>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: C.text, fontSize: 12, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.descripcion}
                    </div>
                    <div style={{ color: C.dim, fontSize: 10.5 }}>{item.grupo}</div>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    disabled={!selected}
                    value={components.get(item.id) ?? item.cantidad}
                    onChange={(event) => setComponents((prev) => {
                      const next = new Map(prev);
                      next.set(item.id, event.target.value);
                      return next;
                    })}
                    style={{ ...INPUT, minHeight: 34, padding: "5px 8px", opacity: selected ? 1 : 0.4 }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function MovimientoModal({
  operacion,
  movimiento,
  tipoInicial = null,
  dependenciasPendientes,
  onClose,
  onSave,
  onDelete,
  onDeleteFile,
}) {
  const isEdit = !!movimiento?.id;
  const initialType = movimiento?.tipo || tipoInicial || (operacion.estado === "pendiente" ? "salida" : "recepcion");
  const existingQty = new Map((movimiento?.items || []).map((row) => [
    row.operacion_item_id,
    Number(row.cantidad),
  ]));
  const [form, setForm] = useState({
    tipo: initialType,
    fecha: movimiento?.fecha ? new Date(movimiento.fecha).toISOString().slice(0, 16) : nowLocal(),
    responsable: movimiento?.responsable || "",
    destino: movimiento?.destino || operacion.destino || "",
    remito: movimiento?.remito || "",
    notas: movimiento?.notas || "",
  });
  const [quantities, setQuantities] = useState(() => new Map(
    operacion.componentes.map((row) => {
      const remaining = initialType === "salida"
        ? Math.max(0, Number(row.cantidad_requerida) - Number(row.cantidad_enviada))
        : Math.max(0, Number(row.cantidad_enviada) - Number(row.cantidad_recibida));
      return [row.id, existingQty.get(row.id) ?? remaining];
    }),
  ));
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  function changeType(tipo) {
    set("tipo", tipo);
    if (!isEdit) {
      setQuantities(new Map(operacion.componentes.map((row) => [
        row.id,
        tipo === "salida"
          ? Math.max(0, Number(row.cantidad_requerida) - Number(row.cantidad_enviada))
          : Math.max(0, Number(row.cantidad_enviada) - Number(row.cantidad_recibida)),
      ])));
    }
  }

  const payloadItems = [...quantities.entries()]
    .map(([operacion_item_id, cantidad]) => ({ operacion_item_id, cantidad: Number(cantidad) }))
    .filter((row) => row.cantidad > 0);

  async function submit() {
    if (!payloadItems.length) return;
    setSaving(true);
    try {
      await onSave({ ...form, items: payloadItems, files });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`${isEdit ? "Editar" : "Registrar"} ${form.tipo === "salida" ? "salida" : "recepción"}`}
      subtitle={`${operacion.nombre} · admite cantidades parciales.`}
      onClose={onClose}
      width={720}
      footer={(
        <>
          {isEdit && (
            <button type="button" onClick={onDelete} style={{ ...DANGER_BUTTON, marginRight: "auto" }}>
              <Trash2 size={14} /> Eliminar
            </button>
          )}
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button type="button" onClick={submit} disabled={saving || !payloadItems.length} style={PRIMARY_BUTTON}>
            {saving ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
            Guardar movimiento
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {form.tipo === "salida" && dependenciasPendientes.length > 0 && (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: 12,
            borderRadius: 12,
            border: `1px solid ${C.redB}`,
            background: C.redL,
            color: C.red,
            fontSize: 12,
            lineHeight: 1.45,
          }}>
            <AlertTriangle size={17} style={{ flexShrink: 0 }} />
            <div>
              <b>Hay pasos anteriores sin completar.</b>
              <div style={{ marginTop: 2 }}>{dependenciasPendientes.map((row) => row.nombre).join(", ")}.</div>
              <div style={{ marginTop: 4 }}>Podés continuar; la excepción quedará registrada.</div>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {[
            ["salida", `${operacion.origen || "Astillero"} → ${operationDestinationLabel(operacion)}`],
            ["recepcion", `${operationDestinationLabel(operacion)} → Astillero`],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeType(value)}
              style={{
                ...BUTTON,
                color: form.tipo === value ? C.blue : C.dim,
                borderColor: form.tipo === value ? C.blueB : C.border,
                background: form.tipo === value ? C.blueL : C.panel,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="tor-form-grid">
          <Field label="Fecha y hora">
            <input type="datetime-local" value={form.fecha} onChange={(event) => set("fecha", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Responsable">
            <input value={form.responsable} onChange={(event) => set("responsable", event.target.value)} style={INPUT} />
          </Field>
          <Field label={form.tipo === "salida" ? "Destino del envío" : "Origen del regreso"}>
            <input value={form.destino} onChange={(event) => set("destino", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Remito">
            <input value={form.remito} onChange={(event) => set("remito", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Observaciones" full>
            <textarea value={form.notas} onChange={(event) => set("notas", event.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} />
          </Field>
        </div>

        <div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 850 }}>Cantidades</div>
            <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>Cargá solamente lo que sale o vuelve en este movimiento.</div>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            {operacion.componentes.map((row) => (
              <div key={row.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 92px",
                gap: 10,
                alignItems: "center",
                padding: 10,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: C.panel,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: C.text, fontSize: 12, fontWeight: 800 }}>
                    {row.item?.descripcion || "Pieza"}
                  </div>
                  <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
                    Requerido {row.cantidad_requerida} · enviado {row.cantidad_enviada} · recibido {row.cantidad_recibida}
                  </div>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={quantities.get(row.id) ?? ""}
                  onChange={(event) => setQuantities((prev) => {
                    const next = new Map(prev);
                    next.set(row.id, event.target.value);
                    return next;
                  })}
                  style={INPUT}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          <label style={{
            ...BUTTON,
            justifyContent: "flex-start",
            minHeight: 48,
            borderStyle: "dashed",
          }}>
            <FileUp size={16} />
            Adjuntar fotos, remitos o documentos
            <input
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              style={{ display: "none" }}
            />
          </label>
          {!!files.length && (
            <div style={{ color: C.green, fontSize: 11, fontWeight: 750 }}>
              {files.length} archivo{files.length === 1 ? "" : "s"} listo{files.length === 1 ? "" : "s"} para subir
            </div>
          )}
          {!!movimiento?.archivos?.length && (
            <div style={{ display: "grid", gap: 5 }}>
              {movimiento.archivos.map((archivo) => (
                <div key={archivo.id} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: 8,
                  borderRadius: 9,
                  border: `1px solid ${C.border}`,
                  background: C.panel,
                }}>
                  <a href={archivo.url} target="_blank" rel="noreferrer" style={{
                    flex: 1,
                    minWidth: 0,
                    color: C.blue,
                    fontSize: 11,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {archivo.nombre}
                  </a>
                  <button type="button" onClick={() => onDeleteFile(archivo)} style={{ ...DANGER_BUTTON, minHeight: 30, padding: "4px 8px" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function FleteModal({
  tipo,
  selecciones,
  onClose,
  onSave,
}) {
  const isOutbound = tipo === "salida";
  const destinos = useMemo(() => [...new Set(
    (selecciones || [])
      .map((row) => operationDestinationLabel(row.operation))
      .filter(Boolean),
  )], [selecciones]);
  const [form, setForm] = useState({
    fecha: nowLocal(),
    responsable: "",
    destino: destinos.length === 1 ? destinos[0] : "Varios destinos",
    remito: "",
    notas: "",
  });
  const [quantities, setQuantities] = useState(() => new Map(
    (selecciones || []).map((row) => [row.component.id, Number(row.cantidad) || 0]),
  ));
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const finalSelections = (selecciones || [])
    .map((row) => ({ ...row, cantidad: Number(quantities.get(row.component.id)) || 0 }))
    .filter((row) => row.cantidad > 0);

  async function submit() {
    if (!finalSelections.length) return;
    setSaving(true);
    try {
      await onSave({ ...form, tipo, selecciones: finalSelections });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isOutbound ? "Registrar flete de salida" : "Registrar retiro conjunto"}
      subtitle={`${finalSelections.length} ${finalSelections.length === 1 ? "material seleccionado" : "materiales seleccionados"} · un solo viaje logístico.`}
      onClose={onClose}
      width={760}
      footer={(
        <>
          <button type="button" onClick={onClose} style={BUTTON}>Cancelar</button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !finalSelections.length}
            style={{ ...PRIMARY_BUTTON, opacity: saving || !finalSelections.length ? 0.55 : 1 }}
          >
            {saving
              ? <Loader2 className="spin" size={15} />
              : isOutbound ? <Truck size={15} /> : <PackageOpen size={15} />}
            {isOutbound ? "Confirmar salida" : "Confirmar recepción"}
          </button>
        </>
      )}
    >
      <div style={{ display: "grid", gap: 16 }}>
        {destinos.length > 1 && (
          <div style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 9,
            padding: 11,
            borderRadius: 11,
            border: `1px solid ${C.violetB}`,
            background: C.violetL,
            color: C.violet,
            fontSize: 11.5,
            lineHeight: 1.45,
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <div>
              Este recorrido incluye {destinos.join(" y ")}. Podés registrarlo como un mismo flete con varias paradas.
            </div>
          </div>
        )}

        <div className="tor-form-grid">
          <Field label="Fecha y hora">
            <input type="datetime-local" value={form.fecha} onChange={(event) => set("fecha", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Responsable / transportista">
            <input value={form.responsable} onChange={(event) => set("responsable", event.target.value)} style={INPUT} />
          </Field>
          <Field label={isOutbound ? "Destino del recorrido" : "Origen del retiro"}>
            <input value={form.destino} onChange={(event) => set("destino", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Remito">
            <input value={form.remito} onChange={(event) => set("remito", event.target.value)} style={INPUT} />
          </Field>
          <Field label="Observaciones" full>
            <textarea value={form.notas} onChange={(event) => set("notas", event.target.value)} rows={2} style={{ ...INPUT, resize: "vertical" }} />
          </Field>
        </div>

        <div style={{ display: "grid", gap: 7 }}>
          <div>
            <div style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>Carga del flete</div>
            <div style={{ color: C.dim, fontSize: 10.5, marginTop: 2 }}>
              Revisá las cantidades. Cada obra conservará su movimiento y su historial por separado.
            </div>
          </div>
          {(selecciones || []).map((row) => {
            const item = row.component.item;
            return (
              <div key={row.component.id} style={{
                display: "grid",
                gridTemplateColumns: "minmax(0,1fr) 96px",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 11,
                border: `1px solid ${C.border}`,
                background: C.panel,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <span style={{ color: C.text, fontSize: 12, fontWeight: 900 }}>
                      {row.process?.obra?.codigo || row.process?.nombre}
                    </span>
                    <span style={{ color: C.dim, fontSize: 10 }}>
                      {operationDestinationLabel(row.operation)}
                    </span>
                  </div>
                  <div style={{ color: C.muted, fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item?.descripcion || "Material"} · {row.operation?.nombre}
                  </div>
                </div>
                <div>
                  <input
                    type="number"
                    min="0"
                    max={row.cantidad}
                    step="0.01"
                    value={quantities.get(row.component.id) ?? ""}
                    onChange={(event) => setQuantities((current) => {
                      const next = new Map(current);
                      next.set(row.component.id, event.target.value);
                      return next;
                    })}
                    aria-label={`Cantidad de ${item?.descripcion || "material"}`}
                    style={{ ...INPUT, minHeight: 36, padding: "6px 8px" }}
                  />
                  <div style={{ color: C.dim, fontSize: 9, marginTop: 3, textAlign: "right" }}>
                    máx. {row.cantidad} {item?.unidad || ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export function EmptyCatalogHint() {
  return (
    <div style={{
      display: "grid",
      placeItems: "center",
      gap: 8,
      padding: 24,
      borderRadius: 14,
      border: `1px dashed ${C.border2}`,
      color: C.dim,
      textAlign: "center",
    }}>
      <PackageSearch size={24} />
      <div style={{ fontSize: 12 }}>Todavía no hay materiales para mostrar.</div>
    </div>
  );
}
