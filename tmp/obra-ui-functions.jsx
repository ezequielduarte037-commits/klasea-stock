  const obraButton = { ...BTN, minHeight: isMobile ? 44 : 32, padding: "5px 9px", borderRadius: 6, fontSize: 12, fontWeight: 550, boxShadow: "none", background: C.panelSolid, color: C.text };
  const obraSelect = { ...INP, height: isMobile ? 44 : 34, minWidth: 0, width: "auto", maxWidth: isMobile ? "100%" : 240, borderRadius: 6, fontSize: 12, padding: "5px 8px" };
  const activeObraFilterCount = [proveedorFilter, rubroFilter, estadoFilter !== "todos", tipoFilter !== "todos", etapaFilter !== "todos", q.trim()].filter(Boolean).length;
  const detailRow = visibleRows.find((row) => row.id === openActionsRowId) || rows.find((row) => row.id === openActionsRowId);
  const detailIndex = visibleRows.findIndex((row) => row.id === openActionsRowId);

  function openObraDetail(row, trigger) {
    detailTriggerRef.current = trigger;
    setDetailTab("resumen");
    setOpenActionsRowId(row.id);
  }
  const closeObraDetail = useCallback(() => setOpenActionsRowId(""), []);
  useEffect(() => {
    if (!detailRow && detailTriggerRef.current) {
      detailTriggerRef.current.focus?.({ preventScroll: true });
      detailTriggerRef.current = null;
    }
  }, [detailRow]);

  function getObraRowView(row) {
    const cant = cantidadesDeFila(row);
    const estado = estadoObraForRow(row);
    const partial = (estado !== "egresado" && row.recepcion_estado === "parcial") || (cant.entregado > 0 && cant.entregado < cant.necesita);
    const meta = recepcionMetaForRow(row);
    const status = partial ? { label: "Parcial", color: C.violet, bg: C.violetL, border: C.violetB, title: `Recibido ${fmtQtyCorto(cant.panol)} · entregado ${fmtQtyCorto(cant.entregado)}` } : { ...meta, label: estado === "pedido" ? "Pedido" : estado === "egresado" ? "Entregado" : meta.label };
    const material = row.material || materialById.get(row.materialId);
    const rowImageUrl = row.producto?.imagen_url || materialVariantImageUrl(material, row.variante) || String(row.imagen_url || material?.imagen_url || material?.imagenes?.[0]?.url || "").trim();
    const action = accionDeFila(row);
    return {
      status, cant,
      needed: qtyText(row.cantidad, row.unidad), received: fmtQtyCorto(cant.panol), delivered: fmtQtyCorto(cant.entregado),
      quantityTitle: `Necesario ${fmtQtyCorto(cant.necesita)} · recibido ${fmtQtyCorto(cant.panol)} · entregado ${fmtQtyCorto(cant.entregado)}`,
      imageMaterial: { ...(row.producto || material || {}), imagen_url: rowImageUrl, descripcion: row.variante ? `${row.descripcion} · ${row.variante}` : row.descripcion },
      uploadMaterial: row.producto?.id ? row.producto : material,
      origin: row.bucket?.key === "addon" ? "Adicional" : snapshotOnlyForRow(row) ? "Fuera de matriz" : "",
      issue: action.trabado ? action.texto : row.review?.flag ? "A revisar" : "",
    };
  }

  function renderObraDetail(row, tab) {
    const view = getObraRowView(row);
    const cant = view.cant;
    const materialForRow = row.material || materialById.get(row.materialId);
    const editableAddon = addonForVisibleRow(row);
    const addonPromotion = editableAddon ? addonPromotionMeta(editableAddon) : null;
    const snapshotOnly = snapshotOnlyForRow(row);
    const snapshotPromotion = snapshotOnly ? snapshotPromotionMeta(row, materialForRow) : null;
    const editingMaterial = editingMaterialRowId === row.id;
    const etapasRow = etapasDeRow(row);
    const miniBtn = { ...obraButton, minHeight: isMobile ? 44 : 32 };
    const stockLibreInfo = stockLibreMap.get(stockLibreKeyForRow(row));
    if (tab === "resumen") return <div style={{ display: "grid", gap: 14, fontSize: 12 }}>
      {[["Rubro", row.rubro || "Sin rubro"], ["Proveedor", row.proveedor || "Sin proveedor"], ["Código", row.codigo || "Sin código"], ["Origen", row.bucket?.label || "Matriz"]].map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: C.muted }}>{label}</span><span style={{ textAlign: "right", color: C.text }}>{value}</span></div>)}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><span style={{ color: C.muted }}>Precio unitario</span><span style={{ fontFamily: C.mono }}>{row.precio.amount ? row.precio.text : "Sin precio"}</span>{materialForRow && !editableAddon && <button type="button" aria-label="Editar precio en catálogo" onClick={() => { setEditingMaterialRowId(row.id); setDetailTab("mas"); }} style={obraButton}><Pencil size={13} /></button>}</div>
      <div style={{ paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "grid", gap: 10 }}>
        <strong style={{ fontWeight: 650 }}>Cantidades</strong>
        {[["Necesario", cant.necesita], ["Recibido", cant.panol], ["Entregado", cant.entregado], ["Por comprar", cant.faltaComprar], ["Por entregar", cant.faltaEntregar]].map(([label, value]) => <div key={label} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: C.muted }}>{label}</span><span style={{ fontFamily: C.mono }}>{qtyText(value, row.unidad)}</span></div>)}
        <DesgloseCantidad row={row} />
        {row.cantidadOrigenEtapa && <span style={{ color: C.blue }}>Cantidad de esta etapa</span>}
      </div>
      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: C.muted }}>Stock libre</span><span style={{ fontFamily: C.mono }}>{stockLibreLoading ? "Cargando…" : stockLibreInfo ? qtyText(stockLibreInfo.cantidad, stockLibreInfo.unidad) : "Sin disponibilidad informada"}</span></div>
      <StockLibreChip info={stockLibreInfo} loading={stockLibreLoading} />
      <div aria-label="Estado actual del abastecimiento" style={{ display: "flex", gap: 4, padding: "12px 0" }}>{[["pedido", "Pedido"], ["comprado", "Comprado"], ["en_panol", "En pañol"], ["egresado", "Entregado"]].map(([key, label]) => <div key={key} style={{ flex: 1, textAlign: "center", color: estadoObraForRow(row) === key ? C.blue : C.muted, borderTop: `2px solid ${estadoObraForRow(row) === key ? C.blue : C.border}`, paddingTop: 7, fontSize: 11 }}>{label}{estadoObraForRow(row) === key ? " · actual" : ""}</div>)}</div>
      {view.issue && <div style={{ color: C.red }}>{view.issue}</div>}
      {row.obs && <div style={{ color: C.muted, lineHeight: 1.5 }}>{row.obs}</div>}
      {!!row.condicionantes?.length && <div style={{ display: "grid", gap: 5 }}><strong>Condicionantes</strong>{row.condicionantes.map((item) => <span key={`${item.id}-${item.condicionante}`} style={{ color: item.delta < 0 ? C.red : C.violet }}>{item.condicionante}: {item.label}</span>)}</div>}
      {productSpecEntries(row.especificaciones).map((item) => <div key={item.key}><span style={{ color: C.muted }}>{item.label}: </span>{item.value}</div>)}
      {(row.esRequisito || row.source === "matriz") && <ProductoAsignadoControl row={row} materiales={materiales} compatibles={productosCompatiblesPorRequisito.get(row.requisitoMaterialId || row.materialId) || []} busy={productoBusy === row.id || snapshotBusy} obraCodigo={obra?.codigo || "esta obra"} linea={linea} specOnly={!row.esRequisito} onSave={cambiarProductoRow} />}
      <RecepcionDetalle row={row} />
    </div>;
    if (tab === "compras") return <div style={{ display: "grid", gap: 20 }}>
      <div><strong style={{ fontSize: 12 }}>Estado y regularización</strong><div style={{ marginTop: 10 }}><ObraEstadoControl key={row.id} row={row} busy={estadoBusy === row.id || snapshotBusy} onChange={regularizarEstadoRow} /></div></div>
      <EtapaCompraEditor row={row} etapas={etapasObra} asignaciones={etapasRow} busy={asignarEtapaBusy === row.id} error={etapasObraError} onSave={(payload) => guardarEtapaMaterial(row, payload)} />
      <RecepcionDetalle row={row} />
      {(row.purchase_request_id || row.recepcion_envio?.titulo) && <div style={{ fontSize: 12, color: C.muted, overflowWrap: "anywhere" }}>{row.purchase_request_id ? `Pedido vinculado: ${row.purchase_request_id}` : ""}{row.recepcion_envio?.titulo ? ` · ${row.recepcion_envio.titulo}` : ""}</div>}
    </div>;
    return <div style={{ display: "grid", gap: 14 }}>
      {/* Existing actions and their guards are inserted here without rewriting handlers. */}
      __EXISTING_MORE_ACTIONS__
      __EXISTING_MATERIAL_EDITOR__
    </div>;
  }
