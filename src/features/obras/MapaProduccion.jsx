import { C } from "@/theme";
/**
 * MapaProduccion.jsx  v12 — "PNG Blueprint Edition"
 * ─────────────────────────────────────────────────────────────────────────────
 * MAPEO DE PLANOS REALES (PNG fondo negro, blend: screen):
 *   k37  Express Sport Cruiser  → líneas cyan
 *   k42  Open Sport Runabout    → líneas cyan
 *   k43  Utility / Fishing      → líneas naranja/dorado
 *   k52  Motor Cruiser Cabina   → líneas verde
 *   k55  Sport Cruiser 55'      → líneas blanco/plata
 *   k64  Yate Clásico Largo     → líneas rosa/lila
 *
 * FEATURES v12 (= v11 + PNGs reales):
 *  ① Menú Radial Contextual (click derecho)
 *  ② Command Palette ⌘K
 *  ③ Modo Cinemático / Foco (F)
 *  ④ Ping Sonar en obras pausadas
 *  ⑤ Radar HUD minimap
 *  ⑥ Keyboard shortcuts (E R ± F Esc ⌘K)
 *  ⑦ Center-on-puesto desde palette
 *  ⑧ PNG blend-mode screen (fondo negro = transparente)
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from "react";
import { useResponsive } from "@/hooks/useResponsive";
import { createPortal } from "react-dom";
import GalponPampa from "@/features/obras/GalponPampa";
import { GLASS, VB_W, VB_H, KPI_W, KPI_W_COLLAPSED, ZONAS, WALLS, BOAT_IMGS, genId, PUESTOS_INITIAL, LEGEND, dedupPuestos, syncNextNMapa, resetNextN, LS_KEY } from "@/features/obras/mapa/mapData";
import { loadMemoriasFromSupabase, saveMemoriaToSupabase, subscribeMemorias } from "@/features/obras/mapa/persistence";
import { AddObraModal, RadialMenu, CommandPalette, CinematicCallouts, CinematicCards, FieldBox, MemoriaHUD, RadarHUD, KPIPanel } from "@/features/obras/mapa/components";


export default function MapaProduccion({obras=[],onPuestoClick,onAsignarObra,onChangeEstado,esGestion=false,sharedPuestos,onSaveLayout,sharedNotas,onSaveNotas,sharedMemorias,onSaveMemorias,onAsignarObraPampa,onDesasignarObraPampa}){
  const { isMobile } = useResponsive();
  const svgRef=useRef(null);
  const vpRef=useRef({x:0,y:0,scale:1});
  const [vp,setVp]=useState({x:0,y:0,scale:1});
  // FUENTE ÚNICA DE VERDAD: la DB (mapa_config.puestos vía sharedPuestos).
  // Mientras la DB carga (sharedPuestos === null) mostramos el layout semilla
  // PUESTOS_INITIAL. NO usamos localStorage como fuente: causaba que un equipo
  // viera su layout cacheado y nunca se sincronizara con el de la DB.
  const [puestos,setPuestos]=useState(()=>{
    const src=sharedPuestos&&sharedPuestos.length>0?sharedPuestos:PUESTOS_INITIAL;
    const deduped=dedupPuestos(src);
    syncNextNMapa(deduped);
    return deduped;
  });
  const [notasExtra,setNotasExtra]=useState(()=>sharedNotas??{});
  // Memorias: única fuente de verdad = tabla obra_memorias. Arrancamos vacío y
  // cargamos desde Supabase al montar (sin mergear localStorage ni mapa_config).
  const [memoriasEdit,setMemoriasEdit]=useState({});

  useEffect(()=>{
    const reload=()=>loadMemoriasFromSupabase().then(mems=>{
      if(Object.keys(mems).length>0) setMemoriasEdit(mems);
    });
    reload();
    // Realtime: si otro usuario edita una memoria, se recarga en vivo.
    const unsub=subscribeMemorias(reload);
    return unsub;
  },[]);
  const [hovered,setHovered]=useState(null);
  const [tooltip,setTooltip]=useState(null);
  const [activeView,setActiveView]=useState("mapa"); // "mapa" | "pampa"
  const [editMode,setEditMode]=useState(false);
  const [addObraFor,setAddObraFor]=useState(null);
  const [confirmDel,setConfirmDel]=useState(null);
  const [isDragging,setIsDragging]=useState(false);
  const [clickMenu,setClickMenu]=useState(null); // {puestoId, x, y}
  const [kpiCollapsed,setKpiCollapsed]=useState(false);
  const [obraDragPos,setObraDragPos]=useState(null);
  const [obraDragOver,setObraDragOver]=useState(null);
  const [newPuestoSize,setNewPuestoSize]=useState("mediano");
  const [containerSize,setContainerSize]=useState({w:0,h:0});
  const [contextMenu,setContextMenu]=useState(null);
  const [cmdPaletteOpen,setCmdPaletteOpen]=useState(false);
  const [focusedPuesto,setFocusedPuesto]=useState(null);
  const dragRef=useRef(null);
  const obraDragOverRef=useRef(null);
  const stateRef=useRef({});
  const puestoDragLiveRef=useRef(null); // posición en vivo del puesto arrastrado (sin setState)
  const dragRafRef=useRef(null);        // RAF handle para throttle de setPuestoDragLive
  const [puestoDragLive,setPuestoDragLive]=useState(null); // {id,cx,cy} — solo el barco arrastrado
  const [pendingAssignments,setPendingAssignments]=useState({}); // { [puestoId]: obraId } — tracking optimista hasta que Supabase confirme

  // Ref para distinguir actualizaciones externas (sharedPuestos) de las del usuario
  // Evita el loop: addPuesto → onSaveLayout → setMapaPuestos → sharedPuestos → setPuestos → onSaveLayout → ...
  const isExternalSyncRef = useRef(false);

  useEffect(()=>{stateRef.current={editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos,clickMenu};},[editMode,cmdPaletteOpen,focusedPuesto,addObraFor,confirmDel,contextMenu,hovered,puestos,clickMenu]);
  useEffect(()=>{vpRef.current=vp;},[vp]);
  // Persistir layout SOLO en la DB (mapa_config vía onSaveLayout). Sin localStorage.
  useEffect(()=>{
    if(!isExternalSyncRef.current) onSaveLayout?.(puestos);
    isExternalSyncRef.current=false; // resetear siempre después de chequear
  },[puestos]);
  // Persistir notas en la DB
  useEffect(()=>{ onSaveNotas?.(notasExtra); },[notasExtra]);
  // Las memorias se persisten directo en la tabla obra_memorias desde
  // handleSaveMemoria (saveMemoriaToSupabase). NO escribimos a mapa_config.memorias
  // (legacy) ni a localStorage para evitar fuentes de verdad en conflicto.

  function handleSaveMemoria(obraOrPuestoId, fields) {
    const obra = obras.find(o => o.id === obraOrPuestoId || o.codigo === obraOrPuestoId);
    const codigo = obra?.codigo ?? obraOrPuestoId;
    const obraId = obra?.id ?? null;
    // Indexar por codigo Y por id para que los lookups funcionen en ambos sentidos
    setMemoriasEdit(prev=>({
      ...prev,
      ...(obraId ? {[obraId]: fields} : {}),
      [codigo]: fields,
    }));
    saveMemoriaToSupabase(obraId, codigo, fields);
  }

  const [layoutSaved, setLayoutSaved] = useState(false);

  function handleSaveLayoutClick() {
    onSaveLayout?.(puestos);
    setLayoutSaved(true);
    setTimeout(()=>setLayoutSaved(false), 2500);
  }
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    const update=()=>setContainerSize({w:el.clientWidth,h:el.clientHeight});
    update(); window.addEventListener("resize",update);
    return()=>window.removeEventListener("resize",update);
  },[]);

  useLayoutEffect(()=>{
    const fit=()=>{
      const el=svgRef.current; if(!el) return;
      const {width,height}=el.getBoundingClientRect();
      if(!width||!height) return;
      // Descontar el panel KPI para que el mapa quede centrado en el espacio útil
      const panelW = kpiCollapsed ? KPI_W_COLLAPSED : KPI_W;
      const usableW = width - panelW;
      const scale=Math.min(usableW*0.965/VB_W,height*0.965/VB_H);
      const next={x:(usableW-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};
      vpRef.current=next; setVp(next);
    };
    fit(); const t=setTimeout(fit,150); return()=>clearTimeout(t);
  },[kpiCollapsed]);

  const obraByPuesto=useMemo(()=>{
    const m={};
    // Detectar colisiones: si dos obras tienen el mismo puesto_mapa,
    // prevalece la que tiene updated_at más reciente (o la última del array como fallback).
    obras.forEach(o=>{
      if(!o.puesto_mapa) return;
      const existing=m[o.puesto_mapa];
      if(existing){
        // Colisión detectada — loguear para debug y conservar la más reciente
        console.warn(
          `[MapaProduccion] Colisión en puesto "${o.puesto_mapa}": obras "${existing.codigo}" y "${o.codigo}" apuntan al mismo puesto. `+
          `Conservando "${o.updated_at>=existing.updated_at?o.codigo:existing.codigo}". `+
          `Ejecutá la query de limpieza SQL para resolverlo definitivamente.`
        );
        // Conservar la más reciente por updated_at; si no hay updated_at, prevalece la última
        if(o.updated_at && existing.updated_at && o.updated_at < existing.updated_at) return;
      }
      m[o.puesto_mapa]=o;
    });
    // Aplicar asignaciones pendientes (optimistic update)
    Object.entries(pendingAssignments).forEach(([pId,oId])=>{
      if(!m[pId]){
        const obra=obras.find(o=>o.id===oId);
        if(obra) m[pId]={...obra,puesto_mapa:pId};
      }
    });
    return m;
  },[obras,pendingAssignments]);
  const stats=useMemo(()=>({total:puestos.length,ocupados:puestos.filter(p=>obraByPuesto[p.id]).length,libres:puestos.filter(p=>!obraByPuesto[p.id]).length}),[obraByPuesto,puestos]);

  const onWheel=useCallback(e=>{
    e.preventDefault();
    const rect=svgRef.current?.getBoundingClientRect(); if(!rect) return;
    const mx=e.clientX-rect.left, my=e.clientY-rect.top, f=e.deltaY<0?1.15:0.85;
    setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:mx-(mx-v.x)*(ns/v.scale),y:my-(my-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
  },[]);
  useEffect(()=>{const el=svgRef.current;if(!el)return;el.addEventListener("wheel",onWheel,{passive:false});return()=>el.removeEventListener("wheel",onWheel);},[onWheel]);

  /* ── Soporte táctil: pan (1 dedo) + pinch-zoom (2 dedos) ──────────────────
     Mirror de la lógica de wheel/pan pero con touch events. No hace
     preventDefault en touchstart para no romper los taps en los puestos;
     solo lo hace cuando hay movimiento real (pan) o pinch. */
  useEffect(()=>{
    const el=svgRef.current; if(!el) return;
    let mode=null; let last={x:0,y:0}; let startDist=0; let startScale=1; let center={x:0,y:0};
    const dist=(a,b)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
    const onStart=(e)=>{
      if(e.touches.length===1){ mode="pan"; last={x:e.touches[0].clientX,y:e.touches[0].clientY}; }
      else if(e.touches.length>=2){
        mode="pinch"; startDist=dist(e.touches[0],e.touches[1]); startScale=vpRef.current.scale;
        const r=el.getBoundingClientRect();
        center={x:(e.touches[0].clientX+e.touches[1].clientX)/2-r.left, y:(e.touches[0].clientY+e.touches[1].clientY)/2-r.top};
      }
    };
    const onMove=(e)=>{
      // Si hay un puesto/obra en arrastre, NO paneamos el mapa (lo maneja el drag).
      if(dragRef.current && dragRef.current.type && dragRef.current.type!=="pan") return;
      if(mode==="pan"&&e.touches.length===1){
        const t=e.touches[0]; const dx=t.clientX-last.x, dy=t.clientY-last.y;
        if(Math.abs(dx)+Math.abs(dy)>2){ e.preventDefault(); last={x:t.clientX,y:t.clientY};
          setVp(v=>{const n={...v,x:v.x+dx,y:v.y+dy};vpRef.current=n;return n;}); }
      } else if(mode==="pinch"&&e.touches.length>=2){
        e.preventDefault();
        if(!startDist) return;
        const d=dist(e.touches[0],e.touches[1]);
        const ns=Math.min(8,Math.max(0.15,startScale*(d/startDist)));
        const mx=center.x,my=center.y;
        setVp(v=>{const next={x:mx-(mx-v.x)*(ns/v.scale),y:my-(my-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
      }
    };
    const onEnd=(e)=>{
      if(e.touches.length===0) mode=null;
      else if(e.touches.length===1){ mode="pan"; last={x:e.touches[0].clientX,y:e.touches[0].clientY}; }
    };
    el.addEventListener("touchstart",onStart,{passive:true});
    el.addEventListener("touchmove",onMove,{passive:false});
    el.addEventListener("touchend",onEnd,{passive:true});
    return()=>{ el.removeEventListener("touchstart",onStart); el.removeEventListener("touchmove",onMove); el.removeEventListener("touchend",onEnd); };
  },[]);

  // En pantallas chicas el panel KPI (240px) tapa el mapa → arrancar colapsado.
  useEffect(()=>{ if(isMobile) setKpiCollapsed(true); },[isMobile]);

  const zoomBtn=useCallback((f)=>{
    const rect=svgRef.current?.getBoundingClientRect();if(!rect)return;
    const cx=rect.width/2,cy=rect.height/2;
    setVp(v=>{const ns=Math.min(8,Math.max(0.15,v.scale*f));const next={x:cx-(cx-v.x)*(ns/v.scale),y:cy-(cy-v.y)*(ns/v.scale),scale:ns};vpRef.current=next;return next;});
  },[]);

  const resetVp=useCallback(()=>{
    const el=svgRef.current;if(!el)return;
    const {width,height}=el.getBoundingClientRect();
    const panelW = kpiCollapsed ? KPI_W_COLLAPSED : KPI_W;
    const usableW = width - panelW;
    const scale=Math.min(usableW*0.92/VB_W,height*0.92/VB_H);
    const next={x:(usableW-VB_W*scale)/2,y:(height-VB_H*scale)/2,scale};
    vpRef.current=next;setVp(next);
  },[kpiCollapsed]);

  const centerOnPuesto=useCallback((p)=>{
    const el=svgRef.current;if(!el)return;
    const {width,height}=el.getBoundingClientRect();
    const scale=Math.min(Math.min(width,height)*0.38/Math.max(p.w,p.h),2.2);
    const next={x:width/2-p.cx*scale,y:height/2-p.cy*scale,scale};
    vpRef.current=next;setVp(next);
  },[]);

  /* Keyboard shortcuts */
  useEffect(()=>{
    const handler=(e)=>{
      const st=stateRef.current;
      if((e.metaKey||e.ctrlKey)&&e.key==="k"){e.preventDefault();setCmdPaletteOpen(v=>!v);return;}
      if(e.key==="Escape"){
        if(st.contextMenu){setContextMenu(null);return;}
        if(st.cmdPaletteOpen){setCmdPaletteOpen(false);return;}
        if(st.addObraFor){setAddObraFor(null);return;}
        if(st.confirmDel){setConfirmDel(null);return;}
        if(st.focusedPuesto){setFocusedPuesto(null);return;}
        setClickMenu(null);
        return;
      }
      if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA") return;
      if(st.addObraFor||st.confirmDel||st.cmdPaletteOpen) return;
      if(e.key==="e"||e.key==="E") setEditMode(v=>!v);
      if(e.key==="r"||e.key==="R") resetVp();
      if(e.key==="+"||e.key==="=") zoomBtn(1.3);
      if(e.key==="-") zoomBtn(0.77);
      if((e.key==="f"||e.key==="F")&&st.hovered){
        const p=stateRef.current.puestos?.find?.(x=>x.id===st.hovered)??null;
        if(p){ setFocusedPuesto(p.id); centerOnPuesto(p); }
      }
    };
    window.addEventListener("keydown",handler);
    return()=>window.removeEventListener("keydown",handler);
  },[resetVp,zoomBtn]);

  const startPan=useCallback(e=>{if(e.button!==0)return;dragRef.current={type:"pan",lastX:e.clientX,lastY:e.clientY,vx:0,vy:0,startX:e.clientX,startY:e.clientY,moved:false};setIsDragging(true);},[]);
  const startPuestoDrag=useCallback((e,p)=>{
    const touch=e.touches?.[0];
    if(!touch && e.button!==0)return;  // mouse: solo botón izquierdo. touch: siempre
    e.stopPropagation();
    const cx0=touch?touch.clientX:e.clientX, cy0=touch?touch.clientY:e.clientY;
    if(editMode){dragRef.current={type:"puesto",puestoId:p.id,startCX:p.cx,startCY:p.cy,startX:cx0,startY:cy0,moved:false};setIsDragging(true);return;}
    const obra=obraByPuesto[p.id];
    if(obra){dragRef.current={type:"obra",obra,puesto:p,fromId:p.id,startX:cx0,startY:cy0,lastX:cx0,lastY:cy0,moved:false};obraDragOverRef.current=null;setIsDragging(true);}
    else{dragRef.current={type:"empty",puestoId:p.id,startX:cx0,startY:cy0,moved:false};setIsDragging(true);}
  },[editMode,obraByPuesto]);

  useEffect(()=>{
    if(!isDragging)return;
    document.body.style.cursor="grabbing";
    const pt=ev=>ev.touches?.[0]??ev.changedTouches?.[0]??ev;
    const onMove=ev=>{
      const d=dragRef.current;if(!d)return;
      const e=pt(ev);
      if(Math.hypot(e.clientX-d.startX,e.clientY-d.startY)>4)d.moved=true;
      // En touch, mientras arrastramos evitamos el scroll de la página.
      if(ev.touches&&d.moved&&ev.cancelable)ev.preventDefault();
      if(d.type==="pan"){const dx=e.clientX-d.lastX,dy=e.clientY-d.lastY;d.vx=dx;d.vy=dy;d.lastX=e.clientX;d.lastY=e.clientY;setVp(v=>{const n={...v,x:v.x+dx,y:v.y+dy};vpRef.current=n;return n;});}
      else if(d.type==="puesto"&&d.moved){
        /* FIX: guardamos la posición en un ref y usamos RAF para actualizar
           solo el estado chico "puestoDragLive" (sin tocar el array puestos).
           Así React re-renderiza un solo barco y los demás no tirilan. */
        const v=vpRef.current;
        const cx=d.startCX+(e.clientX-d.startX)/v.scale;
        const cy=d.startCY+(e.clientY-d.startY)/v.scale;
        puestoDragLiveRef.current={id:d.puestoId,cx,cy};
        if(!dragRafRef.current){
          dragRafRef.current=requestAnimationFrame(()=>{
            dragRafRef.current=null;
            const pos=puestoDragLiveRef.current;
            if(pos)setPuestoDragLive({...pos});
          });
        }
      }
      else if(d.type==="obra"){
        setObraDragPos({x:e.clientX,y:e.clientY});
        // En touch no hay hover: detectamos el puesto debajo del dedo con elementFromPoint.
        if(ev.touches){
          const el=document.elementFromPoint(e.clientX,e.clientY);
          const pid=el?.getAttribute?.("data-pid")||null;
          if(pid&&pid!==d.fromId){ if(obraDragOverRef.current!==pid){obraDragOverRef.current=pid;setObraDragOver(pid);} }
          else if(!pid&&obraDragOverRef.current){ obraDragOverRef.current=null;setObraDragOver(null); }
        }
      }
    };
    const onUp=ev=>{
      // En touch, frenar los eventos de mouse sintéticos (evita doble apertura).
      if(ev&&ev.changedTouches&&ev.cancelable)ev.preventDefault();
      const d=dragRef.current;document.body.style.cursor="";
      if(dragRafRef.current){cancelAnimationFrame(dragRafRef.current);dragRafRef.current=null;}
      if(d?.type==="pan"){let vx=d.vx,vy=d.vy;const step=()=>{vx*=0.85;vy*=0.85;if(Math.abs(vx)<0.3&&Math.abs(vy)<0.3)return;setVp(v=>{const n={...v,x:v.x+vx,y:v.y+vy};vpRef.current=n;return n;});requestAnimationFrame(step);};requestAnimationFrame(step);}
      else if(d?.type==="puesto"){
        /* Commiteamos la posición final al array puestos UNA SOLA VEZ al soltar */
        const pos=puestoDragLiveRef.current;
        if(pos){setPuestos(prev=>prev.map(p=>p.id===pos.id?{...p,cx:pos.cx,cy:pos.cy}:p));}
        puestoDragLiveRef.current=null;
        setPuestoDragLive(null);
      }
      else if(d?.type==="obra"){if(!d.moved){handlePuestoClick(d.puesto,d.startX,d.startY);}else{const target=obraDragOverRef.current;if(target&&d.obra&&onAsignarObra)onAsignarObra(target,d.obra.id);}obraDragOverRef.current=null;setObraDragPos(null);setObraDragOver(null);}
      else if(d?.type==="empty"&&!d?.moved){setAddObraFor(d.puestoId);}
      setIsDragging(false);dragRef.current=null;
    };
    window.addEventListener("mousemove",onMove);window.addEventListener("mouseup",onUp);
    window.addEventListener("touchmove",onMove,{passive:false});window.addEventListener("touchend",onUp);
    return()=>{
      window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);
      window.removeEventListener("touchmove",onMove);window.removeEventListener("touchend",onUp);
    };
  },[isDragging,onAsignarObra,onPuestoClick]);

  function addPuesto(){
    const v=vpRef.current,rect=svgRef.current?.getBoundingClientRect();
    const cx=rect?(rect.width/2-v.x)/v.scale:VB_W/2,cy=rect?(rect.height/2-v.y)/v.scale:VB_H/2;
    const sizes={chico:{w:60,h:112,tipo:"k37"},mediano:{w:80,h:155,tipo:"k42"},utility:{w:75,h:158,tipo:"k43"},grande:{w:94,h:185,tipo:"k52"},crucero:{w:110,h:228,tipo:"k55"},xl:{w:128,h:285,tipo:"k64"},k85:{w:180,h:360,tipo:"k85"}};
    setPuestos(prev=>{const id=genId();return[...prev,{id,label:id.replace("puesto-",""),cx,cy,rot:0,...sizes[newPuestoSize]}];});
  }
  // Iguala el tamaño de todos los puestos al canónico de su tipo de barco
  // (mantiene posición y rotación). Arregla que K52 "iguales" se vean distintos.
  function normalizarTamanos(){
    const CANON={k37:{w:60,h:112},k42:{w:80,h:155},k43:{w:75,h:158},k52:{w:94,h:185},k55:{w:110,h:228},k64:{w:128,h:285},k85:{w:180,h:360}};
    setPuestos(prev=>prev.map(p=>{const s=CANON[p.tipo];return s?{...p,w:s.w,h:s.h}:p;}));
  }
  function removePuesto(id){setPuestos(prev=>prev.filter(p=>p.id!==id));setConfirmDel(null);}
  function toggleRot(id){setPuestos(prev=>prev.map(p=>p.id===id?{...p,rot:(p.rot+90)%360}:p));}
  function resetLayout(){if(!window.confirm("¿Resetear el layout al estado original? Se perderán todas las posiciones personalizadas."))return;localStorage.removeItem(LS_KEY);resetNextN();setPuestos(PUESTOS_INITIAL);}
  async function handleModalAssign(pId,oId){
    if(!onAsignarObra)return;
    // Verificación extra: asegurarse de que la obra no esté ya asignada a otro puesto
    const obraAAsignar=obras.find(o=>o.id===oId);
    if(obraAAsignar?.puesto_mapa && obraAAsignar.puesto_mapa!==pId){
      console.warn(
        `[MapaProduccion] La obra "${obraAAsignar.codigo}" ya tiene puesto_mapa="${obraAAsignar.puesto_mapa}". `+
        `Se va a reasignar a "${pId}". El backend debe limpiar el puesto anterior.`
      );
    }
    // Marcar optimistamente ANTES del await
    setPendingAssignments(prev=>({...prev,[pId]:oId}));
    try{
      await onAsignarObra(pId,oId);
    }catch(err){
      console.error("[MapaProduccion] Error al asignar obra:",err);
      // Si falla, revertir el optimista
      setPendingAssignments(prev=>{const n={...prev};delete n[pId];return n;});
    }finally{
      setAddObraFor(null);
    }
  }
  // Limpiar pendientes cuando obras se actualiza (Supabase confirmó)
  useEffect(()=>{
    if(!Object.keys(pendingAssignments).length)return;
    setPendingAssignments(prev=>{
      const updated={...prev};let changed=false;
      Object.entries(prev).forEach(([pId])=>{
        if(obras.some(o=>o.puesto_mapa===pId)){delete updated[pId];changed=true;}
      });
      return changed?updated:prev;
    });
  },[obras]);
  function handlePuestoClick(p,screenX,screenY){
    if(editMode)return;
    const obra=obraByPuesto[p.id];
    if(!obra){ setAddObraFor(p.id); return; }
    // Mini selector: Etapas | Memoria
    setClickMenu({puestoId:p.id,x:screenX??window.innerWidth/2,y:screenY??window.innerHeight/2});
  }
  const handleContextMenu=useCallback((e,p)=>{e.preventDefault();e.stopPropagation();setContextMenu({x:e.clientX,y:e.clientY,puestoId:p.id});setTooltip(null);},[]);
  const handlePaletteAction=useCallback((item)=>{
    if(item.type==="action"){if(item.id==="reset-view")resetVp();else if(item.id==="toggle-edit")setEditMode(v=>!v);else if(item.id==="zoom-in")zoomBtn(1.3);else if(item.id==="zoom-out")zoomBtn(0.77);}
    else if(item.type==="puesto-libre"){centerOnPuesto(item.p);setAddObraFor(item.p.id);}
    else if(item.type==="obra-libre"){const libre=puestos.find(p=>!obraByPuesto[p.id]);if(libre){centerOnPuesto(libre);setAddObraFor(libre.id);}}
    else if(item.type==="obra-asignada"&&item.p){centerOnPuesto(item.p);setFocusedPuesto(item.p.id);}
  },[resetVp,zoomBtn,centerOnPuesto,puestos,obraByPuesto]);

  // Sincronizar notas desde prop externo cuando cambia
  useEffect(()=>{ if(sharedNotas) setNotasExtra(sharedNotas); },[sharedNotas]);
  // Sincronizar puestos desde Supabase cuando cambia
  useEffect(()=>{
    if(sharedPuestos&&sharedPuestos.length>0){
      const deduped=dedupPuestos(sharedPuestos);
      syncNextNMapa(deduped);
      isExternalSyncRef.current=true; // evita que el useEffect[puestos] llame onSaveLayout → loop
      setPuestos(deduped);
    }
  },[sharedPuestos]);
  // Sincronizar memorias desde Supabase cuando cambia
  // Supabase es fuente de verdad — no sobrescribir con sharedMemorias (mapa_config legacy)

  function handleAddNota(obraId, nota) {
    if(!obraId) return;
    setNotasExtra(prev=>({ ...prev, [obraId]:[...(prev[obraId]??[]), nota] }));
  }
  function handleDeleteNota(obraId, notaId) {
    setNotasExtra(prev=>({ ...prev, [obraId]:(prev[obraId]??[]).filter(n=>n.id!==notaId) }));
  }
  const gsz=60*vp.scale;
  const gsx=((vp.x%gsz)+gsz)%gsz, gsy=((vp.y%gsz)+gsz)%gsz;
  const focusedP=focusedPuesto?puestos.find(p=>p.id===focusedPuesto):null;
  // Derivado sincrónico — si focusedP no existe, tratamos el foco como inactivo
  // Esto evita el render intermedio con pantalla negra cuando el estado es inválido
  const activeFocusId = focusedP ? focusedPuesto : null;
  const focusedObra=focusedP?obraByPuesto[focusedP.id]:null;
  const focusedOC=C.obra[focusedObra?.estado??"vacio"];
  const ctxPuesto=contextMenu?puestos.find(p=>p.id===contextMenu.puestoId):null;
  const ctxObra=ctxPuesto?obraByPuesto[ctxPuesto.id]:null;
  const nonFocusedPuestos=focusedPuesto?puestos.filter(p=>p.id!==focusedPuesto):puestos;

  const renderBoat=(p)=>{
    /* FIX: si este barco está siendo arrastrado, usamos la posición en vivo
       del ref en lugar de la del array (que no cambia durante el drag) */
    if(puestoDragLive?.id===p.id) p={...p,cx:puestoDragLive.cx,cy:puestoDragLive.cy};
    const obra=obraByPuesto[p.id],oC=C.obra[obra?.estado??"vacio"];
    const isHov=hovered===p.id,isEmpty=!obra,isAct=obra?.estado==="activa",isPaused=obra?.estado==="pausada";
    const canDrop=!!obraDragPos&&isEmpty&&p.id!==dragRef.current?.fromId;
    const isDrop=obraDragOver===p.id;
    const sc=(isHov&&!editMode&&!isDragging)?1.03:1;
    const imgSrc=BOAT_IMGS[p.tipo]??BOAT_IMGS.k52;
    const ix=p.cx-p.w/2, iy=p.cy-p.h/2;
    const clipId=`clip-${p.id}`;

    /* ── Orientación correcta para PNGs horizontales en puestos verticales ──
       Todos los PNG son horizontales (proa a la izquierda).
       Si el puesto es vertical (h > w), rotamos la imagen 90° sobre su centro
       para que encaje sin deformarse.
       width  del <image> = lado largo  = Math.max(p.w, p.h)
       height del <image> = lado corto  = Math.min(p.w, p.h)
       x      del <image> = p.cx - Math.max(p.w, p.h) / 2
       y      del <image> = p.cy - Math.min(p.w, p.h) / 2
       Usamos preserveAspectRatio="none" para que llene exactamente la caja.
    ─────────────────────────────────────────────────────────────────────── */
    const isVertical = p.h > p.w;
    const imgW = Math.max(p.w, p.h);
    const imgH = Math.min(p.w, p.h);
    const imgX = p.cx - imgW / 2;
    const imgY = p.cy - imgH / 2;
    const imgRot = isVertical ? `rotate(90,${p.cx},${p.cy})` : undefined;

    const glowFilter=isEmpty
      ? "none"
      : isHov
        ? `drop-shadow(0 0 16px ${oC.glow}) drop-shadow(0 0 6px ${oC.glow}) drop-shadow(0 6px 14px rgba(0,0,0,0.95))`
        : `drop-shadow(0 0 6px ${oC.glow}90) drop-shadow(0 4px 10px rgba(0,0,0,0.85))`;

    /* Helper que devuelve el <image> listo, con orientación corregida.
       La rotación va en un <g> contenedor — más fiable cross-browser que
       poner transform directo en <image> (especialmente en puestos verticales). */
    const BoatImage = ({opacity=1, dx=0, dy=0, blur=false}) => {
      const img = (
        <image
          href={imgSrc}
          x={imgX+dx} y={imgY+dy} width={imgW} height={imgH}
          preserveAspectRatio="none"
          opacity={opacity}
          draggable={false}
          style={{pointerEvents:"none", userSelect:"none", mixBlendMode:"screen",
                  ...(blur?{filter:"blur(4px)"}:{})}}
        />
      );
      /* Para puestos verticales envolvemos en un <g> que rota 90°.
         Esto evita bugs de renderizado SVG con transform en <image>. */
      return isVertical
        ? <g transform={imgRot}>{img}</g>
        : img;
    };

    /* Posición del bloque info (pill + barra) — debajo de la caja, siempre horizontal.
       Usamos la transformación inversa a p.rot para anular la rotación del <g> padre.
       FIX: Considera la rotación real del barco (p.rot) para posicionar el número debajo de la popa. */
    const isRotatedVertical = (p.rot || 0) % 180 !== 0;
    const bottomOffset = isRotatedVertical ? p.w / 2 + 18 : p.h / 2 + 18;
    const infoY = p.cy + bottomOffset;

    return(
      <g key={p.id} transform={`rotate(${p.rot||0},${p.cx},${p.cy})`}
        style={{cursor:editMode?"grab":canDrop?"copy":"pointer"}}
        onMouseDown={e=>startPuestoDrag(e,p)}
        onTouchStart={e=>startPuestoDrag(e,p)}
        onMouseEnter={()=>{setHovered(p.id);if(canDrop){obraDragOverRef.current=p.id;setObraDragOver(p.id);}}}
        onMouseLeave={()=>{setHovered(null);setTooltip(null);if(obraDragOverRef.current===p.id){obraDragOverRef.current=null;setObraDragOver(null);}}}
        onMouseMove={e=>!obraDragPos&&setTooltip({cx:e.clientX,cy:e.clientY,puesto:p})}
        onClick={e=>{if(dragRef.current&&!dragRef.current.moved){e.stopPropagation();handlePuestoClick(p,e.clientX,e.clientY);}}}
        onContextMenu={e=>handleContextMenu(e,p)}>
      {/* Rect transparente de hit-area — único elemento que captura eventos del mouse */}
      <rect x={ix} y={iy} width={p.w} height={p.h} fill="transparent" data-pid={p.id} style={{cursor:"inherit"}}/>
      <g transform={sc!==1?`translate(${p.cx*(1-sc)},${p.cy*(1-sc)}) scale(${sc})`:undefined} style={{transition:"transform 0.2s cubic-bezier(0.175,0.885,0.32,1.275)"}}>

          {/* Sonar ping para pausadas */}
          {isPaused&&(
            <g style={{pointerEvents:"none", userSelect:"none"}}>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1.5" style={{animation:"sonarPing 2.8s ease-out infinite"}}/>
              <circle cx={p.cx} cy={p.cy} r="0" fill="none" stroke="#f59e0b" strokeWidth="1"   style={{animation:"sonarPing 2.8s ease-out 0.9s infinite"}}/>
              <g transform={`translate(${p.cx+p.w*0.28},${p.cy-p.h*0.52})`}>
                <circle r="8" fill="rgba(245,158,11,0.9)" stroke="rgba(0,0,0,0.5)" strokeWidth="1.5"/>
                <text textAnchor="middle" dominantBaseline="middle" y="0.5" fill="#000" fontSize="9" fontWeight="800" fontFamily="system-ui" style={{pointerEvents:"none",userSelect:"none"}}>!</text>
              </g>
            </g>
          )}

          {isEmpty?(
            /* ── PUESTO VACÍO ── */
            <g style={{pointerEvents:"none", userSelect:"none"}} clipPath={`url(#${clipId})`}>
              <BoatImage opacity={0.60}/>
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.06}
                fill="none" stroke="var(--border-2)" strokeWidth="1.2"
                strokeDasharray="6 4" style={{animation:"scan-line 15s linear infinite"}}/>
              <path d={`M${p.cx-10},${p.cy} L${p.cx+10},${p.cy} M${p.cx},${p.cy-10} L${p.cx},${p.cy+10}`}
                stroke="rgba(255,255,255,0.35)" strokeWidth="1.2"/>
              {canDrop&&<text x={p.cx} y={p.cy} textAnchor="middle" dominantBaseline="middle" fill="rgba(167,139,250,0.9)" fontSize={Math.min(p.w,p.h)*0.35} fontWeight="300">⊕</text>}
              {canDrop&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08}
                fill="rgba(167,139,250,0.04)" stroke="#a78bfa" strokeWidth="1.5"
                strokeDasharray="8 6" style={{animation:"dash-run .5s linear infinite"}}/>}
            </g>
          ):(
            /* ── PUESTO OCUPADO ── */
            <g style={{pointerEvents:"none", userSelect:"none"}}>
              {/* Halo de línea — si tiene _lineaColor, se superpone en ese color */}
              {obra._lineaColor && (
                <rect x={ix-7} y={iy-7} width={p.w+14} height={p.h+14}
                  rx={Math.min(p.w,p.h)*0.12} fill="none"
                  stroke={obra._lineaColor} strokeWidth="1.2"
                  style={{ strokeOpacity: isHov ? 0.6 : 0.25,
                    transition:"stroke-opacity 0.3s",
                    animation:"line-breathe 4s ease-in-out infinite" }}/>
              )}
              {/* Halo ambiente permanente */}
              <rect x={ix-5} y={iy-5} width={p.w+10} height={p.h+10} rx={Math.min(p.w,p.h)*0.10}
                fill="none" stroke={oC.glow} strokeWidth="1.5"
                strokeOpacity={isHov ? 0.5 : 0.18}
                style={{
                  transition:"stroke-opacity 0.3s ease",
                  animation: isAct ? "halo-breathe 3.5s ease-in-out infinite" : undefined
                }}/>

              {/* Sombra desplazada — solo en hover */}
              {isHov&&<g clipPath={`url(#${clipId})`}>
                <BoatImage opacity={0.18} dx={3} dy={4} blur={false}/>
              </g>}
              {/* Imagen principal con glow de estado */}
              <g style={{filter:glowFilter, transition:"filter 0.25s ease"}} clipPath={`url(#${clipId})`}>
                <BoatImage opacity={1}/>
              </g>
              {/* Shimmer visible — pulsa entre transparente y blanco suave con screen blend */}
              {isAct&&(
                <g clipPath={`url(#${clipId})`} style={{pointerEvents:"none"}}>
                  <rect
                    x={ix} y={iy} width={p.w} height={p.h}
                    style={{
                      fill:"rgba(255,255,255,0)",
                      mixBlendMode:"screen",
                      animation:`shimmerScan 6s ease-in-out infinite`,
                      animationDelay:`${((p.id.charCodeAt(p.id.length-1)||0)*0.55)%5}s`,
                    }}
                  />
                </g>
              )}
              {/* Tint de color de estado */}
              <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.05}
                fill={oC.glow} fillOpacity={isHov?0.15:0.07}
                style={{mixBlendMode:"screen",transition:"fill-opacity 0.2s"}}/>
              {isHov&&<rect x={ix-1} y={iy-1} width={p.w+2} height={p.h+2} rx={Math.min(p.w,p.h)*0.06}
                fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>}
              {isHov&&<rect x={ix-6} y={iy-6} width={p.w+12} height={p.h+12} rx={Math.min(p.w,p.h)*0.08}
                fill="none" stroke={oC.glow} strokeWidth="1.5" strokeOpacity="0.5"
                filter={`url(#gl-${obra.estado})`}/>}

              {/* ── INFO BLOCK: pill + barra ──
                  Contra-rotado respecto a p.rot para que siempre quede horizontal.
                  Posicionado DEBAJO del bounding box del puesto. */}
              <g transform={`rotate(${-(p.rot||0)},${p.cx},${p.cy})`}>
                <g transform={`translate(${p.cx},${infoY})`}>
                  {(()=>{
                    const codigo=obra.codigo??"";
                    const minSide=Math.min(p.w,p.h);
                    const pillW=Math.max(60, Math.min(codigo.length*9+24, minSide*1.12));
                    const pillH=24; const fs=Math.max(11,Math.min(16, pillW/(Math.max(codigo.length,1)*0.62+1)));
                    const bw=Math.min(minSide*0.72,88), bh=3;
                    return(<>
                      {/* Pill código — con indicador de color de línea */}
                      <rect x={-pillW/2} y={-pillH/2} width={pillW} height={pillH} rx={pillH/2}
                        fill="rgba(4,4,10,0.92)" stroke={`${oC.glow}55`} strokeWidth="1"
                        style={{filter:"drop-shadow(0 2px 5px rgba(0,0,0,0.85))"}}/>
                      {/* dot de color de línea si existe */}
                      {obra._lineaColor && (
                        <circle cx={-pillW/2+8} cy={0} r="3"
                          fill={obra._lineaColor}
                          style={{filter:`drop-shadow(0 0 4px ${obra._lineaColor})`}}/>
                      )}
                      <text x={obra._lineaColor ? 4 : 0} y={1} textAnchor="middle" dominantBaseline="middle"
                        fill="#fff" fontSize={fs} fontFamily={C.mono} fontWeight="800" letterSpacing="0.8"
                        style={{userSelect:"none"}}>{codigo}</text>
                      {/* Barra de progreso — debajo de la pill */}
                      <rect x={-bw/2} y={pillH/2+4} width={bw} height={bh} rx="1.5" fill="rgba(0,0,0,0.6)"/>
                      <rect x={-bw/2} y={pillH/2+4} width={bw*(obra._pct??0)/100} height={bh} rx="1.5"
                        fill={oC.glow} style={{filter:`drop-shadow(0 0 3px ${oC.glow})`}}/>
                    </>);
                  })()}
                </g>
              </g>

              {/* sin beacon dots — el halo-breathe del ring ya indica activa */}
            </g>
          )}

          {/* ── EDIT MODE OVERLAY ── */}
          {editMode&&(<>
            <rect x={ix} y={iy} width={p.w} height={p.h} rx={Math.min(p.w,p.h)*0.07} fill="rgba(251,191,36,0.06)" stroke="rgba(251,191,36,0.38)" strokeWidth="1.3" strokeDasharray="4 3" style={{pointerEvents:"none"}}/>
            {/* Botón ELIMINAR — esquina sup. izquierda, contra-rotado */}
            <g transform={`rotate(${-(p.rot||0)},${ix+11},${iy+11})`} style={{cursor:"pointer"}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setConfirmDel(p.id);}}>
              <circle cx={ix+11} cy={iy+11} r="10" fill="rgba(239,68,68,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="12" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>×</text>
            </g>
            {/* Botón ROTAR — esquina sup. derecha, contra-rotado */}
            <g transform={`rotate(${-(p.rot||0)},${ix+p.w-11},${iy+11})`} style={{cursor:"pointer"}} onMouseDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();toggleRot(p.id);}}>
              <circle cx={ix+p.w-11} cy={iy+11} r="10" fill="rgba(251,191,36,0.93)" stroke="rgba(0,0,0,0.4)" strokeWidth="1"/>
              <text x={ix+p.w-11} y={iy+12} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="11" fontFamily="system-ui" fontWeight="700" style={{userSelect:"none"}}>↻</text>
            </g>
          </>)}
        </g>
      </g>
    );
  };


  return(
    // El mapa es un "blueprint": las PNG de los barcos usan mixBlendMode:"screen"
    // (negro = transparente), por lo que SIEMPRE necesita fondo oscuro. Si dejáramos
    // C.bg, en modo claro el fondo se vuelve #f4f5f7 y el blend lava todo a blanco.
    <div style={{width:"100%",height:"100%",position:"relative",overflow:"hidden",fontFamily:C.sans,background:"#09090b"}}>
      {activeView === "pampa" ? (
        <GalponPampa
          obras={obras}
          onBack={()=>setActiveView("mapa")}
          MemoriaHUD={MemoriaHUD}
          esGestion={esGestion}
          onAsignarObra={onAsignarObraPampa}
          onChangeEstado={onChangeEstado}
          onPuestoClick={onPuestoClick}
          sharedPuestos={null}
          onSaveLayout={onAsignarObraPampa?undefined:undefined}
          sharedNotas={notasExtra}
          onSaveNotas={nts=>setNotasExtra(nts)}
          sharedMemorias={memoriasEdit}
          onSaveMemorias={mems=>setMemoriasEdit(mems)}
        />
      ) : (
      <>
      <style>{`
        @keyframes pulse-r  {0%{r:0;opacity:0.8;stroke-width:2}70%{r:36;opacity:0;stroke-width:0}100%{r:40;opacity:0}}
        @keyframes beacon   {0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.5;transform:scale(0.85)}}
        @keyframes dash-run {to{stroke-dashoffset:-32}}
        @keyframes scan-line{0%{stroke-dashoffset:100}100%{stroke-dashoffset:0}}
        @keyframes fadeUp   {from{opacity:0;transform:translateY(8px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes fadeIn   {from{opacity:0}to{opacity:1}}
        @keyframes sonarPing{0%{r:0;opacity:0.7;stroke-width:2}80%{r:48;opacity:0;stroke-width:0.5}100%{r:52;opacity:0}}
        @keyframes radialPop{from{opacity:0;transform:scale(0.15)}to{opacity:1;transform:scale(1)}}
        @keyframes focusIn      {from{opacity:0}to{opacity:1}}
        @keyframes focusBracket {from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes focusScan    {from{stroke-dashoffset:0}to{stroke-dashoffset:-160}}
        @keyframes dimIn        {from{opacity:0}to{opacity:1}}
        @keyframes halo-breathe {0%,100%{stroke-opacity:0.14}50%{stroke-opacity:0.35}}
        @keyframes line-breathe {0%,100%{stroke-opacity:0.25} 50%{stroke-opacity:0.55}}
        @keyframes kpi-slideIn  {from{opacity:0;transform:translateY(12px) scale(0.97)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes shimmerScan  {0%,100%{fill:rgba(255,255,255,0)}48%,52%{fill:rgba(255,255,255,0.13)}}
        .glass-btn{background:var(--panel);border:1px solid var(--panel-2);color:${C.t1};transition:all 0.2s;}
        .glass-btn:hover{background:var(--panel-2);color:${C.t0};border-color:var(--border-2);}
      `}</style>

      <svg ref={svgRef} style={{position:"absolute",inset:0,width:"100%",height:"100%",display:"block",cursor:isDragging?"grabbing":"grab"}} onMouseDown={startPan} onContextMenu={e=>e.preventDefault()}>
        <defs>
          {["activa","pausada","terminada","cancelada"].map(k=>(
            <filter key={k} id={`gl-${k}`} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur1"/>
              <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur2"/>
              <feMerge><feMergeNode in="blur2"/><feMergeNode in="blur1"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          ))}
          <filter id="sh" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="rgba(0,0,0,0.85)"/></filter>
          {/* ClipPaths por puesto para recortar el PNG sobredimensionado */}
          {puestos.map(p=>{
            const lx = puestoDragLive?.id===p.id ? puestoDragLive.cx : p.cx;
            const ly = puestoDragLive?.id===p.id ? puestoDragLive.cy : p.cy;
            return(
              <clipPath key={`clip-${p.id}`} id={`clip-${p.id}`}>
                <rect x={lx-p.w/2} y={ly-p.h/2} width={p.w} height={p.h} rx={p.w*0.05}/>
              </clipPath>
            );
          })}
          <pattern id="dotGrid" x={gsx} y={gsy} width={gsz} height={gsz} patternUnits="userSpaceOnUse">
            <path d={`M ${gsz} 0 L 0 0 0 ${gsz}`} fill="none" stroke="var(--panel)" strokeWidth="0.5"/>
          </pattern>
          <linearGradient id="hl" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.15"/>
            <stop offset="40%"  stopColor="#ffffff" stopOpacity="0.02"/>
            <stop offset="100%" stopColor="#000000" stopOpacity="0.30"/>
          </linearGradient>

        </defs>
        <rect width="100%" height="100%" fill={C.bg}/>
        <rect width="100%" height="100%" fill="none" stroke="none"/>
        <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>
          <rect x="5" y="5" width={VB_W-10} height={VB_H-10} rx="8" fill="rgba(255,255,255,0.01)" stroke="var(--border-2)" strokeWidth="2"/>
          {ZONAS.map(z=>{const bc=z.bc||"var(--border-2)";return(
            <g key={z.id}>
              <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="4" fill={`rgba(255,255,255,${z.dim?0.01:0.02})`} stroke={bc} strokeOpacity={z.bc?0.8:0.4} strokeWidth={z.bc?1.5:1} strokeDasharray={z.dashed?"8 6":"none"}/>
              <text x={z.x+z.w/2} y={z.y+z.h/2-(z.label.split("\n").length-1)*6} textAnchor="middle" fill={z.bc?bc:"rgba(255,255,255,0.4)"} fontSize={z.small?"7":"9"} fontFamily={C.sans} fontWeight={z.bc?"600":"500"} letterSpacing="1" style={{userSelect:"none",pointerEvents:"none"}}>
                {z.label.split("\n").map((l,i)=><tspan key={i} x={z.x+z.w/2} dy={i===0?0:12}>{l}</tspan>)}
              </text>
            </g>
          );})}
          {WALLS.map(([x1,y1,x2,y2],i)=><line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--border)" strokeWidth="1.5"/>)}

          <g style={{opacity:(activeFocusId&&focusedP)?0.10:1,transition:"opacity 0.4s ease",pointerEvents:(activeFocusId&&focusedP)?"none":"auto"}}>
            {(activeFocusId?puestos.filter(p=>p.id!==activeFocusId):puestos).map(p=>renderBoat(p))}
          </g>

          {activeFocusId&&focusedP&&(<>
            <rect x={-9999} y={-9999} width={29999} height={29999} fill="rgba(0,0,0,0.68)" style={{pointerEvents:"all",cursor:"default",animation:"dimIn 0.35s ease both"}} onClick={()=>setFocusedPuesto(null)}/>
            <g style={{pointerEvents:"auto"}}>{renderBoat(focusedP)}</g>
            <CinematicCallouts p={focusedP} obra={focusedObra} oC={focusedOC} memoriaOverride={memoriasEdit[focusedObra?.codigo] ?? memoriasEdit[focusedObra?.id] ?? memoriasEdit[focusedP.id]} vp={vp} containerSize={containerSize}/>
          </>)}
        </g>
      </svg>

      {/* MEMORIA DESCRIPTIVA HUD — portal a document.body para escapar overflow:hidden */}
      {activeFocusId&&focusedP&&createPortal(
        <MemoriaHUD
          obra={focusedObra??null}
          puesto={focusedP}
          oC={focusedOC}
          memoriaOverride={memoriasEdit[focusedObra?.codigo] ?? memoriasEdit[focusedObra?.id] ?? memoriasEdit[focusedP.id]}
          onSaveMemoria={handleSaveMemoria}
          notas={focusedObra?.id ? (notasExtra[focusedObra.id]??[]) : (notasExtra[focusedP.id]??[])}
          onAddNota={handleAddNota}
          onDeleteNota={handleDeleteNota}
          onClose={()=>setFocusedPuesto(null)}
        />,
        document.body
      )}
      {activeFocusId&&focusedP&&(
        <CinematicCards
          p={focusedP} obra={focusedObra} oC={focusedOC}
          memoriaOverride={memoriasEdit[focusedObra?.codigo] ?? memoriasEdit[focusedObra?.id] ?? memoriasEdit[focusedP.id]}
          vp={vp} svgRef={svgRef} containerSize={containerSize}
        />
      )}

      {/* TOP BAR */}
      <div style={{position:"absolute",top:10,left:10,right:isMobile?46:210,zIndex:10,display:"flex",alignItems:"center",gap:6,pointerEvents:"none",flexWrap:isMobile?"wrap":"nowrap"}}>
        <div style={{display:"flex",gap:5,pointerEvents:"auto"}}>
          {[{v:stats.total,l:"Total",c:C.t0},{v:stats.ocupados,l:"Ocupados",c:"#60a5fa"},{v:stats.libres,l:"Libres",c:"#34d399"}].map(({v,l,c})=>(
            <div key={l} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 16px",borderRadius:8,...GLASS}}>
              <span style={{fontFamily:C.mono,fontSize:18,fontWeight:800,color:c,textShadow:`0 0 12px ${c}40`}}>{v}</span>
              <span style={{fontSize:10,letterSpacing:1.3,textTransform:"uppercase",color:C.t2,fontWeight: 700}}>{l}</span>
            </div>
          ))}
        </div>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:isMobile?8:16,alignItems:"center",pointerEvents:"auto",...GLASS,borderRadius:12,padding:isMobile?"6px 8px":"8px 12px",flexWrap:isMobile?"wrap":"nowrap"}}>
          <div style={{display:isMobile?"none":"flex",gap:12,paddingRight:16,borderRight:`1px solid ${C.b0}`}}>
            {LEGEND.map(({key,color,isWire})=>(
              <div key={key} style={{display:"flex",alignItems:"center",gap:6}}>
                <div style={{width:10,height:10,borderRadius:isWire?2:5,background:isWire?"transparent":color,border:`1.5px solid ${color}`,boxShadow:isWire?"none":`0 0 10px ${color}80`}}/>
                <span style={{fontSize:11,color:C.t1,fontWeight: 700,letterSpacing:0.5}}>{C.obra[key].label}</span>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            {/* Vista Pampa */}
            <button className="glass-btn" onClick={()=>setActiveView(v=>v==="pampa"?"mapa":"pampa")}
              style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:C.sans,fontWeight: 700,display:"flex",alignItems:"center",gap:6,
                background:activeView==="pampa"?"rgba(245,158,11,0.15)":"",
                borderColor:activeView==="pampa"?"rgba(245,158,11,0.5)":""}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={activeView==="pampa"?"#fbbf24":"currentColor"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
                <line x1="9" y1="7" x2="9" y2="9"/>
                <line x1="15" y1="7" x2="15" y2="9"/>
              </svg>
              <span style={{color:activeView==="pampa"?"#fbbf24":""}}>Pampa</span>
            </button>
            <button className="glass-btn" onClick={()=>setEditMode(v=>!v)} style={{padding:"8px 16px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:C.sans,fontWeight: 700,display:"flex",alignItems:"center",gap:6,background:editMode?"rgba(251,191,36,0.15)":"",borderColor:editMode?"rgba(251,191,36,0.4)":""}}>
              <span style={{color:editMode?"#fbbf24":""}}>{editMode?"● Editando Layout":"◩ Editar Layout"}</span>
            </button>
            <button className="glass-btn" onClick={()=>setCmdPaletteOpen(true)} style={{padding:"8px 14px",borderRadius:8,cursor:"pointer",fontSize:12,fontFamily:C.sans,fontWeight: 700,display:"flex",alignItems:"center",gap:8}}>
              <span>⌘</span>
              <span style={{color:C.t2,fontFamily:C.mono,fontSize:11,background:"var(--panel)",border:`1px solid ${C.b0}`,padding:"1px 6px",borderRadius:5}}>K</span>
            </button>
            {editMode&&(
              <div style={{display:"flex",gap:4,alignItems:"center",background:"rgba(0,0,0,0.3)",borderRadius:8,padding:"4px",border:"1px solid rgba(16,185,129,0.3)"}}>
                {[{key:"chico",l:"37'"},{key:"mediano",l:"42'"},{key:"utility",l:"43'"},{key:"grande",l:"52'"},{key:"crucero",l:"55'"},{key:"xl",l:"64'"},{key:"k85",l:"85'"}].map(({key,l})=>(
                  <button key={key} onClick={()=>setNewPuestoSize(key)} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontFamily:C.mono,fontWeight: 700,border:"none",background:newPuestoSize===key?"rgba(16,185,129,0.2)":"transparent",color:newPuestoSize===key?"#34d399":C.t2,transition:"all .2s"}}>{l}</button>
                ))}
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={addPuesto} style={{padding:"4px 12px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,border:"none",background:"#10b981",color:"#000",boxShadow:"0 4px 12px rgba(16,185,129,0.4)"}}>+ Agregar</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={normalizarTamanos} title="Pone todos los barcos del mismo tipo al mismo tamaño" style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight:700,border:"1px solid rgba(99,102,241,0.35)",background:"rgba(99,102,241,0.1)",color:"#a5b4fc"}}>⇲ Igualar tamaños</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={resetLayout} style={{padding:"4px 10px",borderRadius:6,cursor:"pointer",fontSize:11,fontWeight: 700,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#f87171"}}>↺ Reset</button>
                <div style={{width:1,height:16,background:C.b1,margin:"0 4px"}}/>
                <button onClick={handleSaveLayoutClick} style={{padding:"4px 14px",borderRadius:6,cursor:"pointer",fontSize:12,fontWeight:700,border:`1px solid ${layoutSaved?"rgba(16,185,129,0.5)":"rgba(99,102,241,0.4)"}`,background:layoutSaved?"rgba(16,185,129,0.15)":"rgba(99,102,241,0.15)",color:layoutSaved?"#34d399":"#a5b4fc",transition:"all 0.3s",display:"flex",alignItems:"center",gap:5}}>
                  {layoutSaved ? <>✓ Guardado</> : <>💾 Guardar para todos</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ZOOM */}
      <div style={{position:"absolute",bottom:24,right:24,zIndex:10,display:"flex",gap:16,alignItems:"flex-end"}}>
        <div style={{display:"flex",flexDirection:"column",gap:6,...GLASS,padding:"6px",borderRadius:12}}>
          {[{i:"+",f:()=>zoomBtn(1.3)},{i:"−",f:()=>zoomBtn(0.77)},{i:"⌂",f:resetVp}].map(({i,f})=>(
            <button key={i} className="glass-btn" onClick={f} style={{width:36,height:36,borderRadius:8,fontSize:i==="⌂"?16:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",paddingBottom:i==="+"?2:0}}>{i}</button>
          ))}
          <div style={{marginTop:4,textAlign:"center",fontFamily:C.mono,fontSize:11,color:C.t1,fontWeight: 700}}>{Math.round(vp.scale*100)}%</div>
        </div>
      </div>

      <RadarHUD puestos={puestos} obraByPuesto={obraByPuesto} vp={vp} containerW={containerSize.w} containerH={containerSize.h}/>
      <KPIPanel obras={obras} puestos={puestos} obraByPuesto={obraByPuesto} memoriasEdit={memoriasEdit}
        collapsed={kpiCollapsed} onCollapse={setKpiCollapsed}
        onDesasignar={(obraId)=>onChangeEstado?.(obraId,"desasignar")}
        onFocusPuesto={(codigo)=>{
          const obra=obras.find(o=>o.codigo===codigo);
          if(!obra?.puesto_mapa) return;
          const p=puestos.find(x=>x.id===obra.puesto_mapa);
          if(p){centerOnPuesto(p);setFocusedPuesto(p.id);}
        }}/>

      {/* TOOLTIP */}
      {tooltip&&!obraDragPos&&!focusedPuesto&&(()=>{
        const obra=obraByPuesto[tooltip.puesto.id],oC=C.obra[obra?.estado??"vacio"];
        const rect=svgRef.current?.getBoundingClientRect();if(!rect)return null;
        const tx=Math.min(tooltip.cx-rect.left+24,rect.width-310),ty=Math.max(24,Math.min(tooltip.cy-rect.top-24,rect.height-220));
        const hasFicha=obra&&(obra.propietario||obra.motores||obra.grupo_electrogeno||obra.teca_cockpit||obra.madera_muebles||obra.color_casco);
        const SpecRow=({label,val})=>val?(<div style={{display:"flex",gap:6,alignItems:"baseline"}}><span style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:1,textTransform:"uppercase",fontFamily:C.mono,minWidth:46,flexShrink:0}}>{label}</span><span style={{fontSize:12,color:"rgba(255,255,255,0.7)",lineHeight:1.3}}>{val}</span></div>):null;
        return(
          <div style={{position:"absolute",left:tx,top:ty,zIndex:20,...GLASS,borderRadius:12,padding:"16px",minWidth:250,maxWidth:310,pointerEvents:"none",animation:"fadeUp 0.15s cubic-bezier(0.16,1,0.3,1)"}}>
            {/* Header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:hasFicha?10:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <div style={{width:10,height:10,borderRadius:5,background:oC.glow,boxShadow:obra?`0 0 12px ${oC.glow}`:"none"}}/>
                <span style={{fontFamily:C.mono,fontSize:15,color:C.t0,fontWeight:700}}>{obra?obra.codigo:`Puesto ${tooltip.puesto.label}`}</span>
                {obra?.tipo_cabina&&<span style={{fontSize:10,letterSpacing:1,color:"rgba(255,255,255,0.3)",background:"var(--panel-2)",padding:"1px 5px",borderRadius:3}}>{obra.tipo_cabina}</span>}
              </div>
              <span style={{fontSize:10,letterSpacing:1.1,textTransform:"uppercase",color:oC.glow,fontWeight: 700,background:`${oC.glow}15`,padding:"2px 6px",borderRadius:4}}>{oC.label}</span>
            </div>

            {/* Propietario / Constructor */}
            {obra?.propietario&&(
              <div style={{fontSize:12,color:C.t0,marginBottom:8,fontWeight: 700,display:"flex",alignItems:"center",gap:5}}>
                <span style={{display:"flex",alignItems:"center",color:C.t2,flexShrink:0}}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg></span>
                <span>{obra.propietario}</span>
                {obra.constructor&&<span style={{color:C.t2,fontWeight: 700,fontSize:11}}>· {obra.constructor}</span>}
              </div>
            )}
            {obra?.descripcion&&!obra?.propietario&&<div style={{fontSize:13,color:C.t1,marginBottom:10,lineHeight:1.5}}>{obra.descripcion}</div>}

            {/* Ficha técnica */}
            {hasFicha&&(
              <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10,paddingBottom:10,borderBottom:"1px solid var(--panel-2)"}}>
                <SpecRow label="Motor"  val={obra.motores}/>
                <SpecRow label="Chapa"  val={obra.madera_muebles}/>
                <SpecRow label="Casco"  val={obra.color_casco}/>
                {/* Badges de equipamiento */}
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:3}}>
                  {obra.grupo_electrogeno&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(245,158,11,0.12)",color:"#fcd34d",border:"1px solid rgba(245,158,11,0.2)"}}>{obra.grupo_electrogeno_det||"Grupo elect."}</span>}
                  {obra.teca_cockpit&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(180,140,60,0.12)",color:"#d4b483",border:"1px solid rgba(180,140,60,0.2)"}}>{obra.teca_cockpit_det||"Teca/Infinity"}</span>}
                  {obra.starlink&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(99,102,241,0.12)",color:"#a5b4fc",border:"1px solid rgba(99,102,241,0.2)"}}>Starlink</span>}
                  {obra.sternthruster&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:4,background:"rgba(56,189,248,0.12)",color:"#7dd3fc",border:"1px solid rgba(56,189,248,0.2)"}}>Stern</span>}
                </div>
              </div>
            )}

            {/* Progreso */}
            {obra?(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontFamily:C.mono,color:C.t1}}>
                  <span>Progreso</span><span style={{color:oC.glow,fontWeight:700}}>{obra._pct??0}%</span>
                </div>
                <div style={{width:"100%",height:4,background:"var(--panel-2)",borderRadius:2,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${obra._pct??0}%`,background:oC.glow,boxShadow:`0 0 10px ${oC.glow}`}}/>
                </div>
                <div style={{fontSize:11,color:C.t2,marginTop:4}}>Click-derecho → menú · F → enfocar</div>
              </div>
            ):<div style={{fontSize:12,color:C.t2}}>{editMode?"✦ Arrastrá, ↻ rotar, × eliminar":"✦ Click para asignar · F para enfocar"}</div>}
          </div>
        );
      })()}

      {/* DRAG GHOST */}
      {obraDragPos&&dragRef.current?.obra&&(()=>{
        const {obra}=dragRef.current,oC=C.obra[obra.estado]??C.obra.vacio;
        const rect=svgRef.current?.getBoundingClientRect();if(!rect)return null;
        return(<div style={{position:"absolute",left:obraDragPos.x-rect.left-80,top:obraDragPos.y-rect.top-30,zIndex:50,pointerEvents:"none",...GLASS,borderColor:oC.glow,borderRadius:12,padding:"12px 20px",boxShadow:`0 16px 32px rgba(0,0,0,0.6),0 0 0 1px ${oC.glow} inset,0 0 20px ${oC.glow}40`}}>
          <div style={{fontSize:10,color:oC.glow,letterSpacing:1.3,textTransform:"uppercase",marginBottom:4,fontWeight: 700}}>Reubicando</div>
          <div style={{fontFamily:C.mono,fontSize:16,color:C.t0,fontWeight:800}}>{obra.codigo}</div>
          <div style={{fontSize:12,color:C.t1,marginTop:6}}>{obraDragOver?"↓ Soltar para asignar":"Buscando puesto libre..."}</div>
        </div>);
      })()}

      {/* STATUS BAR */}
      <div style={{position:"absolute",bottom:16,left:"50%",transform:"translateX(-50%)",zIndex:5,pointerEvents:"none",userSelect:"none"}}>
        {focusedPuesto?(
          <div style={{padding:"8px 24px",borderRadius:30,background:"rgba(59,130,246,0.12)",border:"1px solid rgba(59,130,246,0.35)",fontSize:12,color:"#60a5fa",letterSpacing:1.2,fontWeight: 700,backdropFilter:"blur(8px)"}}>
            ◎ MODO FOCO — Click en área oscura o <span style={{fontFamily:C.mono,background:"rgba(96,165,250,0.15)",padding:"1px 6px",borderRadius:4}}>Esc</span> para salir
          </div>
        ):editMode?(
          <div style={{padding:"8px 24px",borderRadius:30,background:"rgba(251,191,36,0.12)",border:"1px solid rgba(251,191,36,0.4)",fontSize:12,color:"#fbbf24",letterSpacing:1.1,fontWeight: 700,backdropFilter:"blur(8px)"}}>
            ✏️ MODO EDICIÓN — <span style={{fontFamily:C.mono,background:"rgba(251,191,36,0.15)",padding:"1px 5px",borderRadius:4}}>E</span> para salir
          </div>
        ):(
          <div style={{display:"flex",gap:12,alignItems:"center",padding:"6px 18px",borderRadius:30,background:"rgba(0,0,0,0.4)",border:`1px solid ${C.b0}`,backdropFilter:"blur(8px)"}}>
            {[["RUEDA","Zoom"],["DRAG","Pan"],["CLICK","Gestionar"],["CLICK-DER","Menú Radial"],["F","Enfocar"],["⌘K","Buscar"]].map(([key,label])=>(
              <span key={key} style={{fontSize:10,color:C.t2,letterSpacing:1.1}}>
                <span style={{fontFamily:C.mono,color:C.t1,background:"var(--panel)",padding:"1px 5px",borderRadius:4,fontSize:10}}>{key}</span>{" "}{label}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* CLICK MENU — selector rápido Etapas | Memoria */}
      {clickMenu&&(()=>{
        const p2=puestos.find(x=>x.id===clickMenu.puestoId);
        const o2=p2?obraByPuesto[p2.id]:null;
        if(!o2) return null;
        const oC2=C.obra[o2.estado??"vacio"];
        return(
          <div style={{position:"fixed",inset:0,zIndex:800}} onClick={()=>setClickMenu(null)}>
            <div style={{
              position:"fixed",
              left:Math.min(clickMenu.x-80,window.innerWidth-200),
              top:Math.max(clickMenu.y-80,8),
              zIndex:801,
              background:"rgba(6,6,14,0.97)",
              backdropFilter:"blur(24px)",
              WebkitBackdropFilter:"blur(24px)",
              border:`1px solid var(--border)`,
              borderRadius:14,
              padding:"8px",
              display:"flex",
              flexDirection:"column",
              gap:4,
              boxShadow:`0 16px 40px rgba(0,0,0,0.8), 0 0 0 1px ${oC2.glow}18`,
              animation:"fadeUp 0.15s cubic-bezier(0.22,1,0.36,1)",
              minWidth:172,
              fontFamily:C.sans,
            }} onClick={e=>e.stopPropagation()}>
              {/* Header */}
              <div style={{padding:"6px 10px 8px",borderBottom:"1px solid var(--panel-2)",marginBottom:2}}>
                <div style={{display:"flex",alignItems:"center",gap:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:oC2.glow,boxShadow:`0 0 8px ${oC2.glow}`}}/>
                  <span style={{fontFamily:C.mono,fontSize:14,fontWeight:800,color:"var(--text)",letterSpacing:0.3}}>{o2.codigo}</span>
                </div>
                {o2.propietario&&<div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2,paddingLeft:14}}>{o2.propietario}</div>}
              </div>
              {/* Botón Etapas */}
              <button onClick={()=>{setClickMenu(null);onPuestoClick?.({puesto:p2,obra:o2});}} style={{
                display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                borderRadius:9,border:"1px solid var(--panel-2)",
                background:"var(--panel)",cursor:"pointer",
                fontFamily:C.sans,textAlign:"left",transition:"all 0.12s",
              }}
                onMouseEnter={e=>{e.currentTarget.style.background="rgba(96,165,250,0.1)";e.currentTarget.style.borderColor="rgba(96,165,250,0.3)";}}
                onMouseLeave={e=>{e.currentTarget.style.background="var(--panel)";e.currentTarget.style.borderColor="var(--panel-2)";}}>
                <div style={{width:28,height:28,borderRadius:8,background:"rgba(96,165,250,0.12)",border:"1px solid rgba(96,165,250,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round">
                    <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Etapas</div>
                  <div style={{fontSize:10,color:"var(--border-3)",marginTop:1}}>Progreso y tareas</div>
                </div>
              </button>
              {/* Botón Memoria */}
              <button onClick={()=>{setClickMenu(null);setFocusedPuesto(p2.id);centerOnPuesto(p2);}} style={{
                display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                borderRadius:9,border:"1px solid var(--panel-2)",
                background:"var(--panel)",cursor:"pointer",
                fontFamily:C.sans,textAlign:"left",transition:"all 0.12s",
              }}
                onMouseEnter={e=>{e.currentTarget.style.background=`${oC2.glow}15`;e.currentTarget.style.borderColor=`${oC2.glow}35`;}}
                onMouseLeave={e=>{e.currentTarget.style.background="var(--panel)";e.currentTarget.style.borderColor="var(--panel-2)";}}>
                <div style={{width:28,height:28,borderRadius:8,background:`${oC2.glow}15`,border:`1px solid ${oC2.glow}25`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={oC2.glow} strokeWidth="1.8" strokeLinecap="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--text)"}}>Memoria</div>
                  <div style={{fontSize:10,color:"var(--border-3)",marginTop:1}}>Ficha descriptiva</div>
                </div>
              </button>
            </div>
          </div>
        );
      })()}

      {/* RADIAL MENU */}
      {contextMenu&&ctxPuesto&&(
        <RadialMenu x={contextMenu.x} y={contextMenu.y} puesto={ctxPuesto} obra={ctxObra} editMode={editMode}
          onClose={()=>setContextMenu(null)}
          onAssign={()=>setAddObraFor(ctxPuesto.id)}
          onFocus={()=>{setFocusedPuesto(ctxPuesto.id);centerOnPuesto(ctxPuesto);}}
          onDetail={()=>ctxObra&&onPuestoClick?.({puesto:ctxPuesto,obra:ctxObra})}
          onChangeEstado={onChangeEstado}
          onDelete={()=>setConfirmDel(ctxPuesto.id)}/>
      )}

      {/* COMMAND PALETTE */}
      {cmdPaletteOpen&&(
        <CommandPalette obras={obras} puestos={puestos} obraByPuesto={obraByPuesto}
          onClose={()=>setCmdPaletteOpen(false)} onAction={handlePaletteAction}/>
      )}

      {/* ADD OBRA MODAL */}
      {addObraFor&&(
        <AddObraModal puestoId={addObraFor} puestos={puestos} obras={obras}
          assignedObraIds={new Set(Object.values(obraByPuesto).map(o=>o.id))}
          pendingObraIds={Object.values(pendingAssignments)}
          onAssign={handleModalAssign} onClose={()=>setAddObraFor(null)}/>
      )}

      {/* CONFIRM DELETE */}
      {confirmDel&&(
        <div style={{position:"fixed",inset:0,zIndex:1200,background:"var(--overlay-strong)",display:"flex",alignItems:"center",justifyContent:"center",backdropFilter:"blur(4px)"}} onClick={()=>setConfirmDel(null)}>
          <div style={{...GLASS,border:"1px solid rgba(239,68,68,0.4)",borderRadius:16,padding:"24px",width:320,animation:"fadeUp 0.15s ease",boxShadow:"0 24px 48px rgba(0,0,0,0.9),0 0 0 1px rgba(239,68,68,0.2) inset"}} onClick={e=>e.stopPropagation()}>
            <div style={{width:40,height:40,borderRadius:20,background:"rgba(239,68,68,0.15)",display:"flex",alignItems:"center",justifyContent:"center",color:"#ef4444",fontSize:20,marginBottom:16,border:"1px solid rgba(239,68,68,0.3)"}}>!</div>
            <div style={{fontSize:16,color:C.t0,fontWeight:600,marginBottom:8}}>Eliminar Puesto</div>
            <div style={{fontSize:14,color:C.t1,marginBottom:16,lineHeight:1.5}}>¿Eliminar el puesto <strong style={{color:C.t0}}>{confirmDel}</strong>?</div>
            {obraByPuesto[confirmDel]&&<div style={{fontSize:13,color:"#f59e0b",marginBottom:24,padding:"10px 12px",borderRadius:8,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)"}}>La obra asignada quedará sin puesto en el plano.</div>}
            <div style={{display:"flex",gap:12}}>
              <button onClick={()=>setConfirmDel(null)} className="glass-btn" style={{flex:1,padding:"10px",borderRadius:8,cursor:"pointer",fontSize:14,fontWeight:600}}>Cancelar</button>
              <button onClick={()=>removePuesto(confirmDel)} style={{flex:1,padding:"10px",borderRadius:8,border:"none",background:"#ef4444",color:"#fff",cursor:"pointer",fontSize:14,fontWeight:600,boxShadow:"0 4px 12px rgba(239,68,68,0.4)"}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </>
    )}
  </div>
  );
}
