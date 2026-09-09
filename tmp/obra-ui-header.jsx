      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18, padding: "8px 0 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ minWidth: 160 }}>
          <button type="button" onClick={onBack} style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", padding: "0 0 4px", fontSize: 11, fontFamily: C.sans }}>← {lineaNombre}</button>
          <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.2, fontWeight: 650, color: C.text }}>Obra {obra.codigo}</h2>
          <span style={{ fontSize: 11, color: C.muted }}>{kpis.items.toLocaleString("es-AR")} ítems · {snapshotStatus.label}</span>
        </div>
        <div style={{ display: "flex", flex: "1 1 auto", gap: 3, flexWrap: "wrap" }}>
          {[
            ["pendiente", "Por comprar", kpis.pendientes, C.blue],
            ["en_compras", "En compras", kpis.pedidos + kpis.comprados, C.cyan],
            ["falta_entregar", "Por entregar", kpis.enPanol, C.violet],
            ["egresado", "Entregados", kpis.egresados, C.green],
          ].map(([key, label, value, color]) => <button key={key} type="button" aria-pressed={estadoFilter === key} onClick={() => setEstadoFilter(estadoFilter === key ? "todos" : key)} style={{ border: "none", borderLeft: `1px solid ${C.border}`, borderBottom: `2px solid ${estadoFilter === key ? color : "transparent"}`, background: "transparent", textAlign: "left", padding: "4px 13px", cursor: "pointer", fontFamily: C.sans }}><span style={{ display: "block", fontSize: 11, color: C.muted }}>{label}</span><strong style={{ fontFamily: C.mono, fontSize: 18, fontWeight: 650, color }}>{value.toLocaleString("es-AR")}</strong></button>)}
        </div>
        <div style={{ fontSize: 11, color: C.muted, textAlign: "right" }}>
          <div>Valorización parcial</div>
          <div style={{ fontFamily: C.mono, color: C.text }}>{[kpis.usd ? fmtMoney(kpis.usd, "USD") : "", kpis.ars ? fmtMoney(kpis.ars, "ARS") : ""].filter(Boolean).join(" · ") || "Sin precios"}</div>
          <span>{kpis.items ? Math.round((kpis.items - kpis.sinPrecio) / kpis.items * 100) : 0}% con precio</span>
        </div>
      </header>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: "8px 0" }}>
        <button type="button" onClick={() => setObraPanel(obraPanel === "config" ? "" : "config")} aria-expanded={obraPanel === "config"} style={{ ...obraButton, color: obraPanel === "config" ? C.blue : C.muted }}><Settings2 size={13} />Configuración · {condicionantesActivos.length}/{condicionantesModelo.length}</button>
        <button type="button" onClick={() => setObraPanel(obraPanel === "excluidos" ? "" : "excluidos")} aria-expanded={obraPanel === "excluidos"} style={{ ...obraButton, color: C.muted }}>Excluidos · {exclusionesDetalle.length}</button>
        <button type="button" aria-pressed={tipoFilter === "addon"} onClick={() => setTipoFilter(tipoFilter === "addon" ? "todos" : "addon")} style={{ ...obraButton, color: tipoFilter === "addon" ? C.violet : C.muted }}>Adicionales · {addonStats.total}</button>
        {snapshotActivo && <button type="button" onClick={regenerarSnapshotObra} disabled={snapshotBusy} style={{ ...obraButton, color: C.muted }}><RefreshCw size={12} />Regenerar lista</button>}
        <div style={{ flex: 1 }} />
        <button type="button" onClick={() => { setEditingAddon(null); setAddonModalOpen(true); }} style={{ ...obraButton, color: C.blue, borderColor: C.blueB }}><Plus size={13} />Adicional</button>
        {obraPanel && <button type="button" onClick={() => setObraPanel("")} style={obraButton} aria-label="Cerrar configuración"><X size={13} /></button>}
      </div>
      {obraPanel === "config" && !condicionantesModelo.length && <div style={{ color: C.muted, padding: 12, fontSize: 12 }}>Esta línea no tiene condicionantes cargados.</div>}
