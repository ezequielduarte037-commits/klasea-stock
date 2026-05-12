/**
 * Yacht3DViewer — KLASE A
 * Visor de modelos 3D en GLB con Three.js / React Three Fiber
 *
 * DEPENDENCIAS (instalar una sola vez):
 *   npm install three @react-three/fiber @react-three/drei
 *
 * UBICAR MODELOS EN:
 *   public/models/k52.glb   ← OJO: debe llamarse k52.glb (con la "k")
 *   public/models/k46.glb
 *   ... etc
 *
 * VERIFICAR que el archivo existe abriendo en el browser:
 *   http://localhost:5173/models/k52.glb  → debe descargarse
 *
 * UBICACIÓN DE ESTE ARCHIVO:
 *   src/components/Yacht3DViewer.jsx
 */

import React, { useRef, useState, Suspense, useEffect, Component } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import {
  OrbitControls,
  useGLTF,
  Environment,
  ContactShadows,
  PerspectiveCamera,
} from "@react-three/drei";

/* ─── Mapeo modelo_barco (Supabase) → archivo GLB en /public/models/ ─── */
// ⚠️ El nombre aquí debe coincidir EXACTAMENTE con el valor en Supabase
// Revisá con: console.log(cliente?.modelo_barco)
const MODEL_MAP = {
  "K52 HT": "/models/k52.glb",
  "K52":    "/models/k52.glb",
  "K46":    "/models/k46.glb",
  "K38":    "/models/k38.glb",
};
const FALLBACK_MODEL = "/models/k52.glb";

/* ─── Error Boundary para capturar errores de carga del GLB ─── */
class ModelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("[Yacht3DViewer] Error cargando modelo GLB:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <mesh>
          {/* Cubo de placeholder si falla la carga */}
          <boxGeometry args={[2, 0.5, 4]} />
          <meshStandardMaterial color="#334155" wireframe />
        </mesh>
      );
    }
    return this.props.children;
  }
}

/* ─── Componente interno: carga y renderiza el GLB ─── */
function YachtModel({ url, autoRotate }) {
  const groupRef = useRef();
  const { scene } = useGLTF(url);

  // ── Auto-centrar y escalar el modelo según su bounding box real ──
  useEffect(() => {
    if (!scene) return;

    const box = new THREE.Box3().setFromObject(scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    // Escalar para que entre en un cubo de 4 unidades
    const scale = 4 / maxDim;
    scene.scale.setScalar(scale);

    // Recentrar en el origin después de escalar
    const boxScaled = new THREE.Box3().setFromObject(scene);
    const centerScaled = boxScaled.getCenter(new THREE.Vector3());
    const sizeScaled = boxScaled.getSize(new THREE.Vector3());

    scene.position.x -= centerScaled.x;
    scene.position.z -= centerScaled.z;
    // Apoyar el modelo sobre Y=0
    scene.position.y -= (centerScaled.y - sizeScaled.y / 2);
  }, [scene]);

  useFrame((_, delta) => {
    if (autoRotate && groupRef.current) {
      groupRef.current.rotation.y += delta * 0.35;
    }
  });

  useEffect(() => {
    return () => {
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
    };
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

/* ─── Pantalla de carga ─── */
function Loader() {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 14, background: "transparent", pointerEvents: "none",
    }}>
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(216,195,161,0.15)" strokeWidth="2"/>
        <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(216,195,161,0.7)" strokeWidth="2"
          strokeDasharray="30 65" strokeLinecap="round"
          style={{ transformOrigin: "center", animation: "spin 1s linear infinite" }}/>
      </svg>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase",
        color: "rgba(216,195,161,0.55)",
      }}>
        CARGANDO MODELO
      </span>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </div>
  );
}

/* ─── Estado de error visible en el UI ─── */
function ErrorState({ modelUrl }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 10,
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      gap: 10, padding: 24, pointerEvents: "none",
    }}>
      <span style={{ fontSize: 22, opacity: .5 }}>⚓</span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, letterSpacing: ".2em", textTransform: "uppercase",
        color: "rgba(239,68,68,0.7)", textAlign: "center",
      }}>
        MODELO NO ENCONTRADO
      </span>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 8, color: "rgba(148,163,184,0.5)", textAlign: "center",
        letterSpacing: ".08em",
      }}>
        Verificá que existe: {modelUrl}
      </span>
    </div>
  );
}

/* ─── Componente principal exportado ─── */
export default function Yacht3DViewer({ compact = false, modelName }) {
  // ── DEBUG: descomentá esta línea si el modelo no aparece ──
  // console.log("[Yacht3DViewer] modelName recibido:", modelName, "→ url:", MODEL_MAP[modelName] || FALLBACK_MODEL);

  const modelUrl = MODEL_MAP[modelName] || FALLBACK_MODEL;
  const [autoRotate, setAutoRotate] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const controlsRef = useRef();

  // ── Eliminamos el fetch HEAD que bloqueaba el canvas en Windows/Vite ──
  // El ModelErrorBoundary captura cualquier error de carga del GLB
  useEffect(() => {
    setLoaded(false);
    setLoadError(false);
  }, [modelUrl]);

  function handleResetCamera() {
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }

  return (
    <div className={`yacht3d${compact ? " compact" : ""}`}
      style={{ position: "relative" }}>

      {/* ── Header ── */}
      <div className="yacht3d-head">
        <span>{modelName || "K52 HT"}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleResetCamera} title="Resetear cámara" style={{ fontSize: 9 }}>
            ⟳ RESET
          </button>
          <button
            onClick={() => setAutoRotate((r) => !r)}
            title={autoRotate ? "Pausar rotación" : "Activar rotación"}
            style={{ fontSize: 9 }}>
            {autoRotate ? "⏸ PAUSA" : "▶ ROTAR"}
          </button>
        </div>
      </div>

      {/* ── Canvas 3D ── */}
      <div className="yacht3d-canvas" style={{ position: "relative" }}>
        {!loaded && !loadError && <Loader />}
        {loadError && <ErrorState modelUrl={modelUrl} />}

        {!loadError && (
          <Canvas
            shadows
            style={{ width: "100%", height: "100%", background: "transparent" }}
            gl={{ antialias: true, alpha: true }}
            onCreated={() => setLoaded(true)}
          >
            <PerspectiveCamera makeDefault position={[5, 2.5, 7]} fov={42} />

            <ambientLight intensity={0.55} />
            <directionalLight
              position={[6, 10, 6]}
              intensity={1.4}
              castShadow
              shadow-mapSize={[1024, 1024]}
            />
            <directionalLight position={[-4, 4, -4]} intensity={0.4} color="#a8c4e0" />
            <pointLight position={[0, 6, 0]} intensity={0.3} color="#d8c3a5" />

            <Suspense fallback={null}>
              <ModelErrorBoundary>
                <YachtModel url={modelUrl} autoRotate={autoRotate} />
              </ModelErrorBoundary>
              <Environment preset="sunset" />
              <ContactShadows
                position={[0, -1.05, 0]}
                opacity={0.28}
                scale={14}
                blur={2.5}
                far={4}
                color="#020617"
              />
            </Suspense>

            <OrbitControls
              ref={controlsRef}
              enableZoom={true}
              enablePan={false}
              zoomSpeed={0.7}
              rotateSpeed={0.55}
              minDistance={2}
              maxDistance={18}
              minPolarAngle={Math.PI / 10}
              maxPolarAngle={Math.PI / 2.1}
              onStart={() => setAutoRotate(false)}
            />
          </Canvas>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="yacht3d-foot">
        <span>ARRASTRAR · ROTAR &nbsp;|&nbsp; SCROLL · ZOOM</span>
        <span style={{ opacity: 0.5 }}>GLB</span>
      </div>
    </div>
  );
}

/* ─── Precargar modelos ─── */
Object.values(MODEL_MAP).forEach((url) => {
  try { useGLTF.preload(url); } catch (_) { /* ignora si no existe aún */ }
});
