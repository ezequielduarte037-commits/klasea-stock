/**
 * Maqueta3D.jsx — "La Maqueta" (v14)
 * ─────────────────────────────────────────────────────────────────────────────
 * El galpón como maqueta holográfica 3D (react-three-fiber):
 *   · Cada puesto es un volumen extruido a la ALTURA REAL aproximada del casco
 *     de su línea — se ve de inmediato que un K64 no entra en un puesto de K37.
 *   · El PNG del plano técnico de cada línea se proyecta en el piso del puesto
 *     (blending aditivo: el negro desaparece, quedan las líneas del plano).
 *   · Columna de luz volumétrica por estado (azul = en curso, altura ∝ avance;
 *     violeta pulsante = pausada; verde = terminada; roja = cancelada).
 *   · Cámara cenital con órbita limitada (7°→35°): se lee siempre como plano.
 *   · SIMULACIÓN TEMPORAL: los barcos cuya fecha_fin_estimada ya pasó se hunden
 *     (damp) y el puesto queda libre en wireframe cyan.
 *
 * Interacción: hover → tooltip DOM del padre · click → menú Etapas/Memoria o
 * asignar (si libre) · click derecho → menú radial. La EDICIÓN de layout no
 * vive acá: vive en la vista 2D (el padre la conmuta).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { MapControls, Html, Edges, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { ZONAS, WALLS, BOAT_IMGS } from "@/features/obras/mapa/mapData";

/* Colores de estado (literales: la maqueta es siempre oscura; mismo set que LEGEND) */
const ESTADO_COLOR={activa:"#3b82f6",pausada:"#a78bfa",terminada:"#10b981",cancelada:"#ef4444"};
const COLOR_LIBRE="#67e8f9";

/* Altura aproximada del casco por línea (unidades del plano; ~3u por pie).
   Es representación visual, no dato de ingeniería. */
const ALTURA_CASCO={k37:30,k42:34,k43:30,k52:42,k55:50,k64:56,k85:70};

/* Altura de la columna de luz según estado y avance */
const colZ=(obra)=>{
  if(!obra) return 0;
  if(obra.estado==="pausada")   return 170;
  if(obra.estado==="terminada") return 60;
  if(obra.estado==="cancelada") return 45;
  return 90+Math.min(100,obra._pct??0)*0.9; // activa: 90..180
};

/* plano (0..1900, 0..840) → mundo (x,z) centrado en origen */
const toWorld=(x,y)=>[x-950,y-420];

/* ── Piso: retícula fina (líneas reales, sin texturas) ─────────────────── */
function GridPiso(){
  const geo=useMemo(()=>{
    const pts=[];
    for(let x=-950;x<=950;x+=100){ pts.push(x,0,-420, x,0,420); }
    for(let z=-420;z<=420;z+=84){ pts.push(-950,0,z, 950,0,z); }
    const g=new THREE.BufferGeometry();
    g.setAttribute("position",new THREE.Float32BufferAttribute(pts,3));
    return g;
  },[]);
  return(
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#141b29" transparent opacity={0.85} depthWrite={false}/>
    </lineSegments>
  );
}

/* ── Suelo + zonas + paredes del galpón ────────────────────────────────── */
function GalponBase(){
  return(
    <group>
      {/* losa */}
      <mesh position={[0,-3,0]}>
        <boxGeometry args={[1908,6,848]}/>
        <meshStandardMaterial color="#0a0d13" roughness={0.85} metalness={0.25}/>
      </mesh>
      <GridPiso/>
      {/* zonas como películas de color tenue */}
      {ZONAS.map(z=>{
        const [cx,cz]=toWorld(z.x+z.w/2,z.y+z.h/2);
        return(
          <mesh key={z.id} position={[cx,0.4,cz]} rotation={[-Math.PI/2,0,0]}>
            <planeGeometry args={[z.w,z.h]}/>
            <meshBasicMaterial color={z.bc||"#334155"} transparent opacity={z.bc?0.09:0.045} depthWrite={false}/>
          </mesh>
        );
      })}
      {/* paredes extruidas bajas */}
      {WALLS.map(([x1,y1,x2,y2],i)=>{
        const [wx1,wz1]=toWorld(x1,y1),[wx2,wz2]=toWorld(x2,y2);
        const mx=(wx1+wx2)/2, mz=(wz1+wz2)/2;
        const len=Math.hypot(wx2-wx1,wz2-wz1);
        const rotY=-Math.atan2(wz2-wz1,wx2-wx1);
        return(
          <mesh key={i} position={[mx,9,mz]} rotation={[0,rotY,0]}>
            <boxGeometry args={[len,18,5]}/>
            <meshStandardMaterial color="#131c2a" emissive="#24344d" emissiveIntensity={0.18} roughness={0.6} metalness={0.3}/>
          </mesh>
        );
      })}
    </group>
  );
}

/* ── Un puesto: hit-area + volumen de casco + PNG en el piso + columna ── */
function Puesto3D({p,obra,salio,pasadoPlazo,onHover,onOut,onClickPuesto,onContextPuesto}){
  const grp=useRef(null);
  const volMat=useRef(null);
  const colMat=useRef(null);
  const estado=obra?.estado??null;
  const color=estado?ESTADO_COLOR[estado]??ESTADO_COLOR.activa:COLOR_LIBRE;
  const altura=ALTURA_CASCO[p.tipo]??42;
  const [wx,wz]=toWorld(p.cx,p.cy);
  const libre=!obra||salio;
  const cZ=colZ(obra);
  const esPausada=estado==="pausada";

  /* Hundir/emerger con damp (simulación temporal) + pulso de pausadas */
  useFrame((state,dt)=>{
    if(grp.current){
      const targetY=salio?-(altura+cZ+80):0;
      grp.current.position.y=THREE.MathUtils.damp(grp.current.position.y,targetY,4,dt);
    }
    if(esPausada&&!salio){
      const t=state.clock.elapsedTime;
      if(volMat.current) volMat.current.emissiveIntensity=0.32+0.26*Math.sin(t*2.4);
      if(colMat.current) colMat.current.opacity=0.10+0.07*Math.sin(t*2.4);
    }
  });

  const isVertical=p.h>p.w;
  const imgW=Math.max(p.w,p.h), imgH=Math.min(p.w,p.h);
  const imgSrc=BOAT_IMGS[p.tipo]??BOAT_IMGS.k52;

  return(
    <group position={[wx,0,wz]} rotation={[0,-(p.rot||0)*Math.PI/180,0]}>
      <group ref={grp}>
        {/* hit-area transparente: cubre puesto + columna */}
        <mesh position={[0,(Math.max(altura,cZ))/2,0]}
          onPointerOver={e=>{e.stopPropagation();onHover(p,e);}}
          onPointerOut={e=>{e.stopPropagation();onOut(p);}}
          onClick={e=>{if(e.delta<6){e.stopPropagation();onClickPuesto(p,e);}}}
          onContextMenu={e=>{e.stopPropagation();e.nativeEvent.preventDefault();onContextPuesto(p,e);}}>
          <boxGeometry args={[p.w,Math.max(altura,cZ)+8,p.h]}/>
          <meshBasicMaterial transparent opacity={0} depthWrite={false}/>
        </mesh>

        {libre?(
          /* ── PUESTO LIBRE: volumen wireframe cyan (el espacio que ofrece) ── */
          <mesh position={[0,altura/2,0]}>
            <boxGeometry args={[p.w*0.86,altura,p.h*0.9]}/>
            <meshBasicMaterial color={COLOR_LIBRE} transparent opacity={0.05} depthWrite={false}/>
            <Edges scale={1.001} color={COLOR_LIBRE}/>
          </mesh>
        ):(
          <>
            {/* ── Volumen del casco (extrusión real) ── */}
            <mesh position={[0,altura/2,0]}>
              <boxGeometry args={[p.w*0.72,altura,p.h*0.86]}/>
              <meshStandardMaterial
                ref={volMat}
                color="#0b1424"
                emissive={pasadoPlazo?"#ef4444":color}
                emissiveIntensity={pasadoPlazo?0.55:0.38}
                transparent opacity={0.55} depthWrite={false}
                roughness={0.35} metalness={0.2}/>
              <Edges scale={1.002} color={pasadoPlazo?"#ef4444":color}/>
            </mesh>
            {/* ── PNG del plano en el piso del puesto ── */}
            <PlanoPNG src={imgSrc} w={imgW} h={imgH} vertical={isVertical}/>
            {/* ── Columna de luz volumétrica ── */}
            <mesh position={[0,cZ/2,0]}>
              <cylinderGeometry args={[p.w*0.17,p.w*0.22,cZ,16,1,true]}/>
              <meshBasicMaterial ref={colMat} color={pasadoPlazo?"#ef4444":color} transparent opacity={0.10}
                blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide}/>
            </mesh>
            <mesh position={[0,cZ/2,0]}>
              <cylinderGeometry args={[2.2,2.2,cZ,8,1,true]}/>
              <meshBasicMaterial color={pasadoPlazo?"#ef4444":color} transparent opacity={0.55}
                blending={THREE.AdditiveBlending} depthWrite={false}/>
            </mesh>
            <mesh position={[0,cZ,0]}>
              <sphereGeometry args={[4,12,12]}/>
              <meshBasicMaterial color={pasadoPlazo?"#ef4444":color}/>
            </mesh>
            {/* ── Chip código + % (DOM, siempre legible) ── */}
            <Html center distanceFactor={1250} position={[0,cZ+34,0]} zIndexRange={[20,0]}
              style={{pointerEvents:"none"}}>
              <div style={{
                padding:"3px 9px",borderRadius:7,
                background:"rgba(5,7,13,0.85)",border:`1px solid ${color}88`,
                color:"#f4f6fb",fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,
                whiteSpace:"nowrap",textAlign:"center",lineHeight:1.25,
              }}>
                {obra.codigo}
                <div style={{fontSize:8.5,color,fontWeight:700}}>{obra._pct??0}%{pasadoPlazo?" · PASADA":""}</div>
              </div>
            </Html>
          </>
        )}
      </group>
    </group>
  );
}

/* ── PNG del plano técnico acostado en el piso del puesto ─────────────── */
function PlanoPNG({src,w,h,vertical}){
  const tex=useTexture(src);
  tex.colorSpace=THREE.SRGBColorSpace;
  return(
    <mesh position={[0,0.8,0]} rotation={[-Math.PI/2,0,vertical?Math.PI/2:0]}>
      <planeGeometry args={[w,h]}/>
      <meshBasicMaterial map={tex} transparent opacity={0.85}
        blending={THREE.AdditiveBlending} depthWrite={false}/>
    </mesh>
  );
}

/* ── Rig de cámara: vuela el target al puesto enfocado (sin tocar zoom) ── */
function CameraRig({focus}){
  const controls=useThree(s=>s.controls);
  const target=useRef(new THREE.Vector3(0,0,0));
  useFrame((_,dt)=>{
    if(!controls) return;
    if(focus) target.current.set(focus[0],0,focus[1]);
    else target.current.set(0,0,0);
    controls.target.x=THREE.MathUtils.damp(controls.target.x,target.current.x,5,dt);
    controls.target.y=THREE.MathUtils.damp(controls.target.y,target.current.y,5,dt);
    controls.target.z=THREE.MathUtils.damp(controls.target.z,target.current.z,5,dt);
    controls.update();
  });
  return null;
}

/* ══════════════════════════════════════════════════════════════════════ */
export default function Maqueta3D({puestos,obraByPuesto,salioSet,pasadoSet,focusedPuesto,onHover,onOut,onClickPuesto,onContextPuesto,onPointerMissed}){
  const focus=focusedPuesto?toWorld(focusedPuesto.cx,focusedPuesto.cy):null;
  return(
    <Canvas dpr={[1,1.5]} camera={{position:[0,1150,820],fov:38,near:10,far:6000}}
      gl={{antialias:true}} style={{position:"absolute",inset:0}}
      onPointerMissed={onPointerMissed}>
      <color attach="background" args={["#07080c"]}/>
      <fog attach="fog" args={["#07080c",1900,4300]}/>
      <ambientLight intensity={0.38}/>
      <directionalLight position={[700,1200,500]} intensity={0.55} color="#dfe9ff"/>
      <MapControls makeDefault enableDamping dampingFactor={0.08}
        minDistance={420} maxDistance={2600}
        minPolarAngle={0.12} maxPolarAngle={0.62}
        panSpeed={0.9} zoomSpeed={0.9}/>
      <CameraRig focus={focus}/>
      <GalponBase/>
      {puestos.map(p=>(
        <Puesto3D key={p.id} p={p}
          obra={obraByPuesto[p.id]??null}
          salio={salioSet?.has(p.id)??false}
          pasadoPlazo={pasadoSet?.has(p.id)??false}
          onHover={onHover} onOut={onOut}
          onClickPuesto={onClickPuesto} onContextPuesto={onContextPuesto}/>
      ))}
    </Canvas>
  );
}
