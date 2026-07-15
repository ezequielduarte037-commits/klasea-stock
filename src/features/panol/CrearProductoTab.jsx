import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, PackagePlus } from "lucide-react";
import { C } from "@/theme";
import { crearMaterialRapido, fetchCategorias, fetchProveedores, uploadMaterialImage } from "@/features/materiales/api";
import { fetchPanolCatalogMini } from "@/features/panol/panolApi";

// Pestaña de creación de producto para el pañol. El producto va al CATÁLOGO COMPLETO
// (panol_materiales, sin revisar) — NO entra en la lista matriz de ningún barco.
// Después compras/técnica decide si lo suben a la matriz como estándar.

const INP = { width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" };
const LBL = { fontSize: 10, color: C.dim, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4, display: "block" };

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

const STOP = new Set(["de", "del", "con", "para", "por", "los", "las", "una", "que", "la", "el", "y", "o", "a", "en", "un", "sin"]);
function tokensOf(s) {
  return norm(s).split(" ").filter((t) => t.length > 2 && !STOP.has(t));
}

// Similitud entre lo que se está por crear y un material del catálogo (0-100).
// Detecta duplicados aunque no sean idénticos (palabras compartidas + código/barcode).
function simScore(desc, codigo, material) {
  const a = norm(desc);
  const bDesc = norm(material.descripcion);
  if (!a || !bDesc) return 0;
  const codA = norm(codigo);
  const codB = norm(material.codigo);
  const barcode = norm([material.codigo_barra, ...(material.codigos_barra || []).map((x) => x.codigo)].filter(Boolean).join(" "));
  if (codA && codB && codA === codB) return 100;
  if (codA && barcode && barcode.includes(codA)) return 100;
  if (a === bDesc) return 100;
  if (bDesc.includes(a) || a.includes(bDesc)) return 88;
  const at = tokensOf(desc);
  if (!at.length) return 0;
  const bText = norm([material.descripcion, material.proveedor].filter(Boolean).join(" "));
  const shared = at.filter((t) => bText.includes(t)).length;
  if (shared === at.length) return 80;
  if (shared >= 3) return 70;
  if (shared >= 2) return 60;
  if (shared >= 1 && at.length <= 2) return 52;
  return 0;
}

export default function CrearProductoTab({ isMobile = false, toast }) {
  const [categorias, setCategorias] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [saving, setSaving] = useState(false);

  const [descripcion, setDescripcion] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [unidad, setUnidad] = useState("unidad");
  const [proveedor, setProveedor] = useState("");
  const [codigo, setCodigo] = useState("");
  const [precio, setPrecio] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [notas, setNotas] = useState("");
  const [variantes, setVariantes] = useState([]);
  const [variantesPrecios, setVariantesPrecios] = useState({});
  const [varDraft, setVarDraft] = useState("");
  const [esConsumible, setEsConsumible] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const imgRef = useRef(null);
  const catalogRef = useRef([]); // catálogo completo para detectar duplicados
  const [ultimos, setUltimos] = useState([]);

  const imgPreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ""), [imageFile]);
  useEffect(() => { if (!imgPreview) return undefined; return () => URL.revokeObjectURL(imgPreview); }, [imgPreview]);

  useEffect(() => {
    fetchCategorias().then((c) => setCategorias(c ?? [])).catch(() => setCategorias([]));
    fetchProveedores().then((p) => setProveedores(p ?? [])).catch(() => setProveedores([]));
    fetchPanolCatalogMini({ q: "", limit: 5000 }).then((rows) => { catalogRef.current = rows ?? []; }).catch(() => { catalogRef.current = []; });
  }, []);

  function addVariante() {
    const names = varDraft.split(/[,\n;/]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    setVariantes((list) => {
      const seen = new Set(list.map((x) => x.toLowerCase()));
      const next = [...list];
      for (const n of names) if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); next.push(n); }
      return next;
    });
    setVarDraft("");
  }

  function limpiar() {
    setDescripcion(""); setCategoriaId(""); setUnidad("unidad"); setProveedor(""); setCodigo("");
    setPrecio(""); setMoneda("ARS"); setNotas(""); setVariantes([]); setVariantesPrecios({}); setVarDraft(""); setEsConsumible(false); setImageFile(null);
  }

  async function crear() {
    const desc = descripcion.trim();
    if (!desc) { toast?.warning("Poné una descripción."); return; }
    if (desc.length < 4) { toast?.warning("Descripción muy corta. Agregá marca, medida o modelo."); return; }
    if (!categoriaId) { toast?.warning("Elegí un rubro."); return; }
    if (saving) return;

    // Anti-duplicado: comparar por SIMILITUD contra el catálogo (no solo coincidencia exacta),
    // así detecta duplicados aunque la descripción no sea idéntica o compartan el código.
    const cod = codigo.trim();
    try {
      let cat = catalogRef.current;
      if (!cat.length) {
        cat = (await fetchPanolCatalogMini({ q: "", limit: 5000 })) ?? [];
        catalogRef.current = cat;
      }
      const candidatos = cat
        .map((m) => ({ m, s: simScore(desc, cod, m) }))
        .filter((x) => x.s >= 55)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);
      const exacto = candidatos.find((c) => c.s >= 100);
      if (exacto) {
        toast?.warning(`Ya existe: "${exacto.m.descripcion}"${exacto.m.codigo ? ` · ${exacto.m.codigo}` : ""}. No se creó de nuevo — usalo al ingresar.`);
        return;
      }
      if (candidatos.length) {
        const lista = candidatos.map((c) => `• ${c.m.descripcion}${c.m.codigo ? ` (${c.m.codigo})` : ""}`).join("\n");
        const ok = window.confirm(
          `⚠ Puede que este producto YA EXISTA en el catálogo:\n\n${lista}\n\n¿Igual querés crear "${desc}"?\n\n• Cancelar = NO crear (usá el que ya está al ingresar)\n• Aceptar = crear igual`,
        );
        if (!ok) return;
      }
    } catch { /* si falla la comparación, seguimos y creamos */ }

    setSaving(true);
    try {
      let mat = await crearMaterialRapido({
        descripcion: desc,
        categoriaId,
        unidadMedida: unidad || "unidad",
        proveedor,
        codigo,
        precioUnitario: precio === "" ? null : precio,
        moneda,
        notas,
        variantes,
        variantesPrecios,
        esConsumible,
      });
      if (imageFile) {
        try { await uploadMaterialImage(mat.id, imageFile); } catch { /* la foto no frena la creación */ }
      }
      // Sumo el nuevo material al catálogo en memoria para detectar recreaciones inmediatas.
      catalogRef.current = [{ id: mat.id, descripcion: desc, codigo: cod, proveedor, codigo_barra: "", codigos_barra: [] }, ...catalogRef.current];
      setUltimos((prev) => [{ id: mat.id, descripcion: desc, codigo: cod, ts: Date.now() }, ...prev].slice(0, 8));
      toast?.success(`✓ Producto creado en el catálogo. Ya lo podés ingresar.`);
      limpiar();
    } catch (err) {
      toast?.error(err.message || "No se pudo crear el producto.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 12 : "16px 18px 28px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, display: "grid", placeItems: "center", background: C.blueL, border: `1px solid ${C.blueB}`, color: C.blue, flexShrink: 0 }}><PackagePlus size={20} /></div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 950, color: C.text }}>Crear producto nuevo</div>
            <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>Va al catálogo completo. No entra en la lista matriz de ningún barco — después compras/técnica decide si lo suben como estándar.</div>
          </div>
        </div>

        <div style={{ border: `1px solid ${C.border}`, background: C.panelSolid, borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
          <div>
            <label style={LBL}>Descripción *</label>
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder='Completa: marca, medida, modelo (ej: "Caja ducha Rule 800 GPH")' style={INP} autoFocus />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LBL}>Rubro *</label>
              <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} style={{ ...INP, cursor: "pointer" }}>
                <option value="">- Elegí un rubro -</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Unidad</label>
              <input value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="unidad, mt, kg, litro..." style={INP} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
            <div>
              <label style={LBL}>Proveedor</label>
              <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} placeholder="Proveedor (opcional)" list="crearprod-prov" style={INP} />
              <datalist id="crearprod-prov">{proveedores.map((p) => <option key={p.id || p.nombre} value={p.nombre || p} />)}</datalist>
            </div>
            <div>
              <label style={LBL}>Código de ítem</label>
              <input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="Código interno/proveedor (opcional)" style={{ ...INP, fontFamily: C.mono }} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 2fr", gap: 10 }}>
            <div>
              <label style={LBL}>Precio</label>
              <input value={precio} onChange={(e) => setPrecio(e.target.value)} inputMode="decimal" placeholder="Precio (opcional)" style={{ ...INP, fontFamily: C.mono }} />
            </div>
            <div>
              <label style={LBL}>Moneda</label>
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)} style={{ ...INP, cursor: "pointer" }}><option value="ARS">ARS</option><option value="USD">USD</option></select>
            </div>
            <div />
          </div>

          {/* Es consumible */}
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "9px 11px", borderRadius: 9, border: `1px solid ${esConsumible ? C.amberB : C.border}`, background: esConsumible ? C.amberL : C.panelSolid }}>
            <input type="checkbox" checked={esConsumible} onChange={(e) => setEsConsumible(e.target.checked)} style={{ width: 17, height: 17, cursor: "pointer" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 850, color: esConsumible ? C.amber : C.text }}>Es consumible</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 1 }}>Tornillos, lijas, acetona, etc. Va al fondo del catálogo, no molesta en la matriz del barco.</div>
            </div>
          </label>

          {/* Variantes con código y precio */}
          <div>
            <label style={LBL}>Variantes / marcas (con código y precio)</label>
            {variantes.length > 0 && (
              <div style={{ display: "grid", gap: 5, marginBottom: 6 }}>
                {variantes.map((v) => {
                  const p = variantesPrecios[v] || {};
                  return (
                    <div key={v} style={{ display: "grid", gridTemplateColumns: "minmax(64px,0.9fr) minmax(80px,1fr) 104px 62px 28px", gap: 6, alignItems: "center" }}>
                      <span style={{ color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                      <input value={p.codigo ?? ""} onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), codigo: e.target.value } }))} placeholder="Código" style={{ ...INP, padding: "6px 8px", fontSize: 12, fontFamily: C.mono }} />
                      <input value={p.precio ?? ""} inputMode="decimal" onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), precio: e.target.value } }))} placeholder="Precio" style={{ ...INP, padding: "6px 8px", fontSize: 12, fontFamily: C.mono }} />
                      <select value={p.moneda || "ARS"} onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || {}), moneda: e.target.value } }))} style={{ ...INP, padding: "6px 4px", fontSize: 12, cursor: "pointer" }}><option value="ARS">ARS</option><option value="USD">USD</option></select>
                      <button type="button" title="Quitar" onClick={() => { setVariantes((l) => l.filter((x) => x !== v)); setVariantesPrecios((m) => { const c = { ...m }; delete c[v]; return c; }); }} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={varDraft} onChange={(e) => setVarDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariante(); } }} placeholder="Ej: 23L, 48L / LG, Samsung" style={{ ...INP, flex: 1 }} />
              <button type="button" onClick={addVariante} disabled={!varDraft.trim()} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.violet, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800, opacity: varDraft.trim() ? 1 : 0.5 }}>+ Variante</button>
            </div>
          </div>

          {/* Foto */}
          <div>
            <label style={LBL}>Foto del producto</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 56, height: 56, borderRadius: 9, border: `1px solid ${C.border}`, background: C.panel, overflow: "hidden", display: "grid", placeItems: "center", flexShrink: 0 }}>
                {imgPreview ? <img src={imgPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImagePlus size={18} color={C.dim} />}
              </div>
              <button type="button" onClick={() => imgRef.current?.click()} style={{ border: `1px solid ${C.border}`, background: C.panel, color: C.blue, borderRadius: 8, padding: "8px 12px", cursor: "pointer", fontSize: 12.5, fontWeight: 800 }}>{imageFile ? "Cambiar foto" : "Elegir / sacar foto"}</button>
              {imageFile && <button type="button" onClick={() => setImageFile(null)} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 12.5, fontWeight: 800 }}>Quitar</button>}
              <input ref={imgRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => { setImageFile(e.target.files?.[0] || null); e.target.value = ""; }} />
            </div>
          </div>

          <div>
            <label style={LBL}>Observaciones (opcional)</label>
            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Notas sobre el producto..." style={{ ...INP, resize: "vertical" }} />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" onClick={limpiar} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>Limpiar</button>
            <button type="button" onClick={crear} disabled={saving || !descripcion.trim() || !categoriaId} style={{ border: "none", background: saving || !descripcion.trim() || !categoriaId ? C.panel2 : C.green, color: saving || !descripcion.trim() || !categoriaId ? C.dim : "#fff", borderRadius: 9, padding: "10px 18px", cursor: saving ? "default" : "pointer", fontSize: 13.5, fontWeight: 950, display: "flex", alignItems: "center", gap: 7 }}>
              <PackagePlus size={16} /> {saving ? "Creando..." : "Crear producto"}
            </button>
          </div>
        </div>

        {ultimos.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, background: C.panel, borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: C.dim, fontWeight: 850, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Creados recién (ya podés ingresarlos)</div>
            <div style={{ display: "grid", gap: 5 }}>
              {ultimos.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, padding: "6px 9px", background: C.panelSolid, borderRadius: 8 }}>
                  <span style={{ color: C.green, fontWeight: 900 }}>✓</span>
                  <span style={{ fontWeight: 700 }}>{u.descripcion}</span>
                  {u.codigo && <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11 }}>· {u.codigo}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
