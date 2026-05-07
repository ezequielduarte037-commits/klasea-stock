import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

function roundedBox(w, h, d, color, roughness = 0.42, metalness = 0.18) {
  const geo = new THREE.BoxGeometry(w, h, d, 6, 2, 6);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    envMapIntensity: 0.7,
  });
  return new THREE.Mesh(geo, mat);
}

function buildYacht() {
  const yacht = new THREE.Group();
  yacht.rotation.y = -0.35;

  const hull = roundedBox(5.8, 0.62, 1.28, 0xf2eee4, 0.36, 0.12);
  hull.scale.set(1, 1, 1);
  hull.position.y = 0.08;
  hull.castShadow = true;
  hull.receiveShadow = true;
  yacht.add(hull);

  const bow = new THREE.Mesh(
    new THREE.ConeGeometry(0.66, 1.42, 4, 1, false),
    new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.34, metalness: 0.12 })
  );
  bow.rotation.z = Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.x = 3.18;
  bow.position.y = 0.08;
  bow.castShadow = true;
  yacht.add(bow);

  const stern = roundedBox(0.64, 0.54, 1.24, 0xe7ded0, 0.36, 0.12);
  stern.position.set(-3.06, 0.1, 0);
  stern.castShadow = true;
  yacht.add(stern);

  const deck = roundedBox(4.55, 0.16, 1.06, 0x171b20, 0.5, 0.08);
  deck.position.set(-0.32, 0.49, 0);
  deck.castShadow = true;
  yacht.add(deck);

  const cabin = roundedBox(2.55, 0.68, 0.9, 0xf8f4ea, 0.32, 0.1);
  cabin.position.set(-0.16, 0.91, 0);
  cabin.castShadow = true;
  yacht.add(cabin);

  const windshield = roundedBox(1.58, 0.34, 0.94, 0x111827, 0.22, 0.28);
  windshield.position.set(0.58, 1.16, 0);
  windshield.rotation.z = -0.12;
  windshield.castShadow = true;
  yacht.add(windshield);

  const hardtop = roundedBox(2.18, 0.12, 1.02, 0xd8c3a5, 0.28, 0.28);
  hardtop.position.set(-0.14, 1.42, 0);
  hardtop.castShadow = true;
  yacht.add(hardtop);

  const railMat = new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.2, metalness: 0.72 });
  [-0.62, 0.62].forEach((z) => {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 5.2, 16), railMat);
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0.14, 0.8, z);
    yacht.add(rail);
  });

  const platform = roundedBox(0.92, 0.08, 1.32, 0xd8c3a5, 0.3, 0.18);
  platform.position.set(-3.58, 0.28, 0);
  yacht.add(platform);

  const glow = new THREE.PointLight(0xd8c3a5, 0.9, 4.5);
  glow.position.set(0.8, 1.2, 1.4);
  yacht.add(glow);

  return yacht;
}

export default function Yacht3DViewer({ compact = false }) {
  const mountRef = useRef(null);
  const frameRef = useRef(null);
  const modeRef = useRef("auto");
  const [mode, setMode] = useState("auto");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x020617, 7, 15);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(4.9, 2.25, 4.7);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const yacht = buildYacht();
    scene.add(yacht);

    const ambient = new THREE.HemisphereLight(0xfff6e8, 0x111827, 1.45);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(4.8, 96),
      new THREE.MeshStandardMaterial({
        color: 0x080b10,
        roughness: 0.7,
        metalness: 0.22,
        transparent: true,
        opacity: 0.74,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.36;
    floor.receiveShadow = true;
    scene.add(floor);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.95, 0.01, 10, 140),
      new THREE.MeshBasicMaterial({ color: 0xd8c3a5, transparent: true, opacity: 0.32 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.28;
    scene.add(ring);

    let dragging = false;
    let lastX = 0;

    const resize = () => {
      const w = mount.clientWidth || 420;
      const h = mount.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const onPointerDown = (event) => {
      dragging = true;
      lastX = event.clientX;
      modeRef.current = "manual";
      setMode("manual");
      mount.setPointerCapture?.(event.pointerId);
    };
    const onPointerMove = (event) => {
      if (!dragging) return;
      const dx = event.clientX - lastX;
      yacht.rotation.y += dx * 0.008;
      lastX = event.clientX;
    };
    const onPointerUp = () => {
      dragging = false;
    };

    mount.addEventListener("pointerdown", onPointerDown);
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerup", onPointerUp);
    mount.addEventListener("pointerleave", onPointerUp);
    window.addEventListener("resize", resize);
    resize();

    const clock = new THREE.Clock();
    const animate = () => {
      const elapsed = clock.getElapsedTime();
      if (!dragging && modeRef.current === "auto") yacht.rotation.y += 0.0035;
      yacht.position.y = Math.sin(elapsed * 1.2) * 0.035;
      ring.rotation.z = elapsed * 0.18;
      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
      mount.removeEventListener("pointerdown", onPointerDown);
      mount.removeEventListener("pointermove", onPointerMove);
      mount.removeEventListener("pointerup", onPointerUp);
      mount.removeEventListener("pointerleave", onPointerUp);
      renderer.dispose();
      scene.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((mat) => mat.dispose());
          else obj.material.dispose();
        }
      });
      renderer.domElement.remove();
    };
  }, []);

  return (
    <div className={`yacht3d ${compact ? "compact" : ""}`}>
      <div className="yacht3d-head">
        <span>K52 HT 3D</span>
        <button type="button" onClick={() => setMode((v) => {
          const next = v === "auto" ? "manual" : "auto";
          modeRef.current = next;
          return next;
        })}>
          {mode === "auto" ? "AUTO" : "MANUAL"}
        </button>
      </div>
      <div ref={mountRef} className="yacht3d-canvas" />
      <div className="yacht3d-foot">
        <span>Arrastrar para rotar</span>
        <span>Modelo conceptual</span>
      </div>
    </div>
  );
}
