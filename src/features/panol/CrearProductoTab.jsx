import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, PackagePlus } from "lucide-react";
import { C } from "@/theme";
import { crearMaterialRapido, fetchCategorias, fetchProveedores, normalizeUnidadMedida, uploadMaterialImage } from "@/features/materiales/api";
import { fetchPanolCatalogMini } from "@/features/panol/panolApi";
import { materialMatchScore, topMaterialMatches } from "@/features/panol/materialMatch";

// Pestaña de creación de producto para el pañol. El producto va al CATÁLOGO COMPLETO
// (panol_materiales, sin revisar) — NO entra en la lista matriz de ningún barco.
// Después compras/técnica decide si lo suben a la matriz como estándar.

const INP = { width: "100%", boxSizing: "border-box", background: C.panelSolid, border: `1px solid ${C.border}`, color: C.text, borderRadius: 9, padding: "9px 11px", fontSize: 13, fontFamily: C.sans, outline: "none" };
const LBL = { fontSize: 10, color: C.dim, fontWeight: 850, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4, display: "block" };

function norm(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

function codeKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function materialCodeKeys(material = {}) {
  return [
    material.codigo,
    material.codigo_barra,
    ...(Array.isArray(material.codigos_barra) ? material.codigos_barra.map((row) => row?.codigo || row) : []),
  ].map(codeKey).filter(Boolean);
}

// Similitud entre lo que se está por crear y un material del catálogo (0-100).
// Detecta duplicados aunque no sean idénticos (palabras compartidas + código/barcode).
function simScore(desc, codigo, material) {
  if (!norm(desc) && !norm(codigo)) return 0;
  return materialMatchScore(material, { descripcion: desc, codigo });
}

// Coincidencias EN VIVO mientras se escribe: por descripción (simScore) y además por
// código / código de barra, aunque todavía no haya descripción cargada.
function matchDuplicados(desc, cod, catalog) {
  return topMaterialMatches(catalog, { descripcion: desc, codigo: cod }, 6, 42)
    .map((material) => ({ m: material, s: material._score }));
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
  const [catalogo, setCatalogo] = useState([]); // catálogo completo para detectar duplicados (en vivo + al crear)
  const [ultimos, setUltimos] = useState([]);
  const [duplicateReview, setDuplicateReview] = useState(null);

  // Detección de duplicados EN VIVO: debounce para no recalcular sobre todo el catálogo en cada tecla.
  const [dupQuery, setDupQuery] = useState({ desc: "", cod: "" });
  useEffect(() => {
    const t = setTimeout(() => setDupQuery({ desc: descripcion, cod: codigo }), 200);
    return () => clearTimeout(t);
  }, [descripcion, codigo]);
  useEffect(() => { setDuplicateReview(null); }, [descripcion, codigo]);
  const duplicados = useMemo(() => matchDuplicados(dupQuery.desc, dupQuery.cod, catalogo), [dupQuery, catalogo]);

  const imgPreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ""), [imageFile]);
  useEffect(() => { if (!imgPreview) return undefined; return () => URL.revokeObjectURL(imgPreview); }, [imgPreview]);

  useEffect(() => {
    fetchCategorias().then((c) => setCategorias(c ?? [])).catch(() => setCategorias([]));
    fetchProveedores().then((p) => setProveedores(p ?? [])).catch(() => setProveedores([]));
    fetchPanolCatalogMini({ q: "", limit: 5000 }).then((rows) => setCatalogo(rows ?? [])).catch(() => setCatalogo([]));
  }, []);

  function addVariante() {
    const names = varDraft.split(/[\n;]+/).flatMap((s) => s.split(/\s*\/\s*/)).map((s) => s.trim()).filter(Boolean);
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
    setDuplicateReview(null);
  }

  async function crear(forceDuplicate = false) {
    const desc = descripcion.trim();
    if (!desc) { toast?.warning("Poné una descripción."); return; }
    if (desc.length < 4) { toast?.warning("Descripción muy corta. Agregá marca, medida o modelo."); return; }
    if (!categoriaId) { toast?.warning("Elegí un rubro."); return; }
    if (saving) return;

    // Un código COMPLETO idéntico sí bloquea. Prefijos, descripciones y similitudes
    // únicamente advierten: pueden ser productos legítimamente diferentes.
    const cod = codigo.trim();
    try {
      let cat = catalogo;
      if (!cat.length) {
        cat = (await fetchPanolCatalogMini({ q: "", limit: 5000 })) ?? [];
        setCatalogo(cat);
      }
      const candidatos = cat
        .map((m) => ({ m, s: simScore(desc, cod, m) }))
        .filter((x) => x.s >= 42)
        .sort((a, b) => b.s - a.s)
        .slice(0, 4);
      const wantedCode = codeKey(cod);
      const exactCode = wantedCode
        ? cat.find((material) => materialCodeKeys(material).includes(wantedCode))
        : null;
      if (exactCode) {
        toast?.warning(`El código completo ${cod} ya pertenece a "${exactCode.descripcion}". Cambiá el código o usá ese producto.`);
        return;
      }
      if (candidatos.length && !forceDuplicate) {
        setDuplicateReview({
          description: desc,
          code: cod,
          candidates: candidatos,
        });
        toast?.warning("Encontramos productos parecidos. Revisalos y confirmá una segunda vez si realmente es uno nuevo.");
        return;
      }
    } catch { /* si falla la comparación, seguimos y creamos */ }

    setDuplicateReview(null);
    setSaving(true);
    try {
      let mat = await crearMaterialRapido({
        descripcion: desc,
        categoriaId,
        unidadMedida: normalizeUnidadMedida(unidad, "unidad"),
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
      setCatalogo((prev) => [{ id: mat.id, descripcion: desc, codigo: cod, proveedor, codigo_barra: "", codigos_barra: [] }, ...prev]);
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

          {/* Duplicados EN VIVO: aparece mientras escriben descripción o código, antes de crear. */}
          {duplicados.length > 0 && (
            <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, borderRadius: 12, padding: "10px 12px", display: "grid", gap: 7 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, fontWeight: 900, color: C.violet, textTransform: "uppercase", letterSpacing: 0.5 }}>
                <AlertTriangle size={13} /> Ojo · {duplicados.length} posible{duplicados.length === 1 ? "" : "s"} duplicado{duplicados.length === 1 ? "" : "s"} en el catálogo
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                {duplicados.map(({ m, s }) => {
                  const tag = s >= 105
                    ? { t: "IGUAL", c: C.red, bg: C.redL, br: C.redB }
                    : s >= 88
                      ? { t: "MUY PARECIDO", c: C.violet, bg: C.violetL, br: C.violetB }
                      : { t: "PARECIDO", c: C.dim, bg: C.panel, br: C.border };
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.text, padding: "6px 9px", background: C.panelSolid, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 900, color: tag.c, background: tag.bg, border: `1px solid ${tag.br}`, borderRadius: 999, padding: "2px 7px", letterSpacing: 0.4 }}>{tag.t}</span>
                      <span style={{ fontWeight: 750, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{m.descripcion}</span>
                      {m.codigo && <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 11, flexShrink: 0 }}>· {m.codigo}</span>}
                      {m.proveedor && <span style={{ color: C.dim, fontSize: 11, marginLeft: "auto", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: isMobile ? 90 : 140 }}>{m.proveedor}</span>}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10.5, color: C.dim }}>Si es lo mismo, no lo crees de nuevo — buscalo directo al ingresar. Si es distinto, aclará marca / medida / modelo para diferenciarlo.</div>
            </div>
          )}

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
              <input value={unidad} onChange={(e) => setUnidad(e.target.value)} onBlur={(e) => setUnidad(normalizeUnidadMedida(e.target.value, "unidad"))} placeholder="unidad, metro, kg, litro..." style={INP} />
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
          <label style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer", padding: "9px 11px", borderRadius: 9, border: `1px solid ${esConsumible ? C.violetB : C.border}`, background: esConsumible ? C.violetL : C.panelSolid }}>
            <input type="checkbox" checked={esConsumible} onChange={(e) => setEsConsumible(e.target.checked)} style={{ width: 17, height: 17, cursor: "pointer" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 850, color: esConsumible ? C.violet : C.text }}>Es consumible</div>
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
                    <div key={v} style={{ display: "grid", gridTemplateColumns: "minmax(64px,0.9fr) minmax(80px,1fr) 104px 62px minmax(120px,1fr) 28px", gap: 6, alignItems: "center" }}>
                      <span style={{ color: C.violet, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 999, padding: "3px 9px", fontSize: 11, fontWeight: 850, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
                      <input value={p.codigo ?? ""} onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), codigo: e.target.value } }))} placeholder="Código" style={{ ...INP, padding: "6px 8px", fontSize: 12, fontFamily: C.mono }} />
                      <input value={p.precio ?? ""} inputMode="decimal" onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), precio: e.target.value } }))} placeholder="Precio" style={{ ...INP, padding: "6px 8px", fontSize: 12, fontFamily: C.mono }} />
                      <select value={p.moneda || "ARS"} onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || {}), moneda: e.target.value } }))} style={{ ...INP, padding: "6px 4px", fontSize: 12, cursor: "pointer" }}><option value="ARS">ARS</option><option value="USD">USD</option></select>
                      <input value={p.imagen_url ?? ""} onChange={(e) => setVariantesPrecios((m) => ({ ...m, [v]: { ...(m[v] || { moneda: "ARS" }), imagen_url: e.target.value } }))} placeholder="URL foto/plano" style={{ ...INP, padding: "6px 8px", fontSize: 12 }} />
                      <button type="button" title="Quitar" onClick={() => { setVariantes((l) => l.filter((x) => x !== v)); setVariantesPrecios((m) => { const c = { ...m }; delete c[v]; return c; }); }} style={{ border: "none", background: "transparent", color: C.red, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <input value={varDraft} onChange={(e) => setVarDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVariante(); } if (e.key === "," || e.code === "Comma") e.stopPropagation(); }} placeholder="Ej: 23L / 48L / LG. Enter agrega." style={{ ...INP, flex: 1 }} />
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

          {duplicateReview ? (
            <div style={{ border: `1px solid ${C.violetB}`, background: C.violetL, borderRadius: 12, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
                <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: "grid", placeItems: "center", color: C.violet, background: C.panelSolid, border: `1px solid ${C.violetB}` }}><AlertTriangle size={15} /></span>
                <span>
                  <b style={{ display: "block", color: C.text, fontSize: 12.5 }}>Advertencia final · 2 de 2</b>
                  <span style={{ display: "block", color: C.muted, fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>Antes de crear “{duplicateReview.description}”, confirmá que no sea ninguno de estos productos. Un prefijo parecido ya no bloquea la creación.</span>
                </span>
              </div>
              <div style={{ display: "grid", gap: 5 }}>
                {duplicateReview.candidates.map(({ m, s }) => (
                  <div key={m.id} style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.panelSolid }}>
                    <span style={{ minWidth: 0, flex: 1, color: C.text, fontSize: 11.5, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.descripcion}</span>
                    {m.codigo && <span style={{ color: C.dim, fontFamily: C.mono, fontSize: 10.5, whiteSpace: "nowrap" }}>{m.codigo}</span>}
                    <span style={{ color: C.violet, fontSize: 9, fontWeight: 950, textTransform: "uppercase", whiteSpace: "nowrap" }}>{s >= 105 ? "Mismo nombre" : s >= 88 ? "Muy parecido" : "Parecido"}</span>
                  </div>
                ))}
              </div>
              <div style={{ color: C.dim, fontSize: 10.5 }}>El único bloqueo definitivo es un código completo o código de barras idéntico.</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setDuplicateReview(null)} disabled={saving} style={{ border: `1px solid ${C.border}`, background: C.panelSolid, color: C.muted, borderRadius: 9, padding: "9px 13px", cursor: "pointer", fontSize: 12.5, fontWeight: 850 }}>Volver a revisar</button>
                <button type="button" onClick={() => crear(true)} disabled={saving} style={{ border: `1px solid ${C.violetB}`, background: C.violet, color: "#fff", borderRadius: 9, padding: "9px 14px", cursor: saving ? "default" : "pointer", fontSize: 12.5, fontWeight: 950, display: "inline-flex", alignItems: "center", gap: 7, opacity: saving ? .6 : 1 }}><PackagePlus size={15} /> {saving ? "Creando..." : "Crear igualmente"}</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
              <button type="button" onClick={limpiar} style={{ border: `1px solid ${C.border}`, background: "transparent", color: C.dim, borderRadius: 9, padding: "10px 16px", cursor: "pointer", fontSize: 13, fontWeight: 800 }}>Limpiar</button>
              <button type="button" onClick={() => crear(false)} disabled={saving || !descripcion.trim() || !categoriaId} style={{ border: "none", background: saving || !descripcion.trim() || !categoriaId ? C.panel2 : C.green, color: saving || !descripcion.trim() || !categoriaId ? C.dim : "#fff", borderRadius: 9, padding: "10px 18px", cursor: saving ? "default" : "pointer", fontSize: 13.5, fontWeight: 950, display: "flex", alignItems: "center", gap: 7 }}>
                <PackagePlus size={16} /> {saving ? "Creando..." : "Crear producto"}
              </button>
            </div>
          )}
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
