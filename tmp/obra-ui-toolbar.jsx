      <div style={{ display: "grid", gap: 8, padding: "4px 0 10px" }}>
        <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
          <div style={{ position: "relative", flex: "1 1 250px", minWidth: 160 }}>
            <Search aria-hidden="true" size={14} style={{ position: "absolute", top: "50%", left: 10, transform: "translateY(-50%)", color: C.muted }} />
            <BuscadorDiferido value={q} onChange={setQ} placeholder="Buscar material, código o proveedor" style={{ ...INP, width: "100%", boxSizing: "border-box", paddingLeft: 32, height: 34, borderRadius: 6, fontSize: 12 }} />
          </div>
          <select aria-label="Estado del material" value={estadoFilter} onChange={(event) => setEstadoFilter(event.target.value)} style={obraSelect}>
            {recepcionFilterOptions(kpis).map(([key, label]) => <option key={key} value={key} style={OPT_ST}>{label}</option>)}
          </select>
          <select aria-label="Agrupar materiales" value={groupBy} onChange={(event) => setGroupBy(event.target.value)} style={obraSelect}>
            <option value="rubro" style={OPT_ST}>Por rubro</option><option value="proveedor" style={OPT_ST}>Por proveedor</option><option value="etapa" style={OPT_ST}>Por etapa</option><option value="tipo" style={OPT_ST}>Por tipo</option>
          </select>
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(!filtersOpen)} style={{ ...obraButton, color: activeObraFilterCount ? C.blue : C.muted }}><SlidersHorizontal size={13} />Filtros{activeObraFilterCount ? ` · ${activeObraFilterCount}` : ""}</button>
          {!!activeObraFilterCount && <button type="button" onClick={() => { setQ(""); setProveedorFilter(""); setRubroFilter(""); setTipoFilter("todos"); setEstadoFilter("todos"); setEtapaFilter("todos"); }} style={obraButton}>Limpiar filtros</button>}
        </div>
        {filtersOpen && <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <select aria-label="Proveedor" value={proveedorFilter} onChange={(event) => setProveedorFilter(event.target.value)} style={{ ...obraSelect, maxWidth: "100%" }}><option value="" style={OPT_ST}>Todos los proveedores</option>{facets.proveedores.map((name) => <option key={name} value={name} style={OPT_ST}>{name}</option>)}</select>
          <select aria-label="Tipo de material" value={tipoFilter} onChange={(event) => setTipoFilter(event.target.value)} style={obraSelect}>{[["todos", "Todos los tipos"], ["base", "Base"], ["addon", "Adicionales"], ["condicionante", "Condicionantes"], ["linea_eje", "Línea eje"], ["variante", "Variantes"], ["sin_precio", "Sin precio"], ["revisar", "A revisar"]].map(([key, label]) => <option key={key} value={key} style={OPT_ST}>{label}</option>)}</select>
          <select aria-label="Etapa de compra" value={etapaFilter} onChange={(event) => setEtapaFilter(event.target.value)} disabled={!!etapasObraError} style={{ ...obraSelect, maxWidth: "100%" }}><option value="todos" style={OPT_ST}>Todas las etapas · {rows.length}</option><option value="sin_asignar" style={OPT_ST}>Sin asignar · {sinAsignarCount}</option>{etapasObra.map((etapa) => <option key={etapa.id} value={etapa.id} style={OPT_ST}>{etapa.nombre} · {etapaStats.get(etapa.id) || 0}{etapa.fecha_compra ? ` · ${String(etapa.fecha_compra).slice(0, 10)}` : ""}</option>)}</select>
        </div>}
        {etapasObraError && <div role="alert" style={{ fontSize: 12, color: C.red }}>{etapasObraError} <button type="button" onClick={cargarEtapasObra} style={obraButton}>Reintentar etapas</button></div>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", padding: "7px 9px", border: `1px solid ${selected.size ? C.blueB : C.border}`, borderRadius: 6, background: selected.size ? C.blueL : C.panel }}>
          <span style={{ flex: "1 1 180px", fontSize: 12, color: C.text }}>{selected.size ? `${orderRows.length} seleccionados en el filtro` : `${orderRows.length} ítems del filtro`}{selected.size > orderRows.length ? ` · ${selected.size - orderRows.length} fuera del filtro` : ""}</span>
          {!!selected.size && <button type="button" onClick={() => setSelected(new Set())} style={obraButton}>Limpiar selección</button>}
          <select aria-label="Tipo de pedido" value={pedidoObraTipo || ""} onChange={(event) => setPedidoObraTipo(event.target.value || null)} style={obraSelect}><option value="" style={OPT_ST}>Tipo de pedido</option><option value="stock" style={OPT_ST}>Stock</option><option value="estandar" style={OPT_ST}>Estándar</option><option value="adicional" style={OPT_ST}>Adicional</option></select>
          <button type="button" onClick={copiarOrden} disabled={!orderRows.length} style={obraButton}><Copy size={13} />{copied ? "Copiado" : "Copiar OC"}</button>
          <button type="button" onClick={abrirAvisoPanol} disabled={!orderRows.length || !!actionBusy || snapshotBusy} style={obraButton}><PackagePlus size={13} />{actionBusy === "panol" ? "Preparando…" : "Avisar a pañol"}</button>
          <button type="button" onClick={confirmarPedidoACompras} disabled={!orderRows.length || !!actionBusy || snapshotBusy} style={{ ...obraButton, background: C.blue, color: "var(--on-accent, #fff)", borderColor: C.blue }}><ShoppingCart size={13} />{actionBusy === "compras" ? "Creando…" : "Pedir a compras"}</button>
        </div>
        {flowMsg && <div role={flowMsg.type === "err" ? "alert" : "status"} style={{ fontSize: 12, color: flowMsg.type === "err" ? C.red : C.green, padding: "7px 9px", border: `1px solid ${flowMsg.type === "err" ? C.redB : C.greenB}`, borderRadius: 6 }}>{flowMsg.text}</div>}
      </div>
      <ObraListaTable
        key={obra.id}
        groups={groupedRows} allRows={rows} rubro={rubroFilter} onRubro={setRubroFilter}
        filterKey={JSON.stringify([obra.id, deferredQ, proveedorFilter, rubroFilter, tipoFilter, estadoFilter, etapaFilter, groupBy])}
        selected={selected} onSelectionChange={setSelected} getRowView={getObraRowView} onOpen={openObraDetail} detailId={openActionsRowId}
        onImageUploaded={async () => { await onChanged?.(); await cargarSnapshot(); }}
      />
      {detailRow && <ObraItemDrawer
        row={detailRow} view={getObraRowView(detailRow)} obraLabel={`${obra.codigo} · ${lineaNombre}`} tab={detailTab} onTab={setDetailTab}
        onClose={closeObraDetail} suspendEscape={!!(addonModalOpen || reassignAddon || pedidoConfirm || panolPrefill)}
        onPrevious={detailIndex > 0 ? () => setOpenActionsRowId(visibleRows[detailIndex - 1].id) : null}
        onNext={detailIndex >= 0 && detailIndex < visibleRows.length - 1 ? () => setOpenActionsRowId(visibleRows[detailIndex + 1].id) : null}
        renderContent={renderObraDetail}
        footer={<div style={{ display: "flex", gap: 6 }}><button type="button" onClick={() => setDetailTab("compras")} style={{ ...obraButton, flex: 1, background: C.blueL, color: C.blue, borderColor: C.blueB }}>Estado y recepción</button><button type="button" onClick={() => setDetailTab("mas")} style={obraButton}>Más acciones</button></div>}
      />}
