/* ═══════════════════════════════════════════════════════════════
   Configurador · estela
   La espuma que deja el barco, simulada en la GPU: nace donde el casco
   rompe el agua (costados, hélices, olas de popa), el agua la arrastra
   hacia atrás a la velocidad del barco, se abre hacia los costados y se
   disuelve de a poco. Así la estela crece detrás al zarpar y, al
   detenerse, queda flotando y se apaga sola (antes aparecía y
   desaparecía entera de golpe).
   Una textura en coordenadas del barco (proa +x; el agua corre hacia −x):
   R espuma fresca, G espuma vieja (encaje), B agua aireada y revuelta y
   A la velocidad que traía el barco cuando esa agua pasó por su popa
   (de ahí salen las olas de la estela en V).
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";

const FRAGMENTO = /* glsl */`
  uniform sampler2D previo;
  uniform sampler2D ruido;
  uniform sampler2D anchoCasco;
  uniform vec4 dominio;
  uniform vec2 texel;
  uniform float corrimiento;
  uniform float desfase;
  uniform float dt;
  uniform float paso;
  uniform float vel;
  uniform float velN;
  uniform vec2 avance;
  uniform float cascoX0; uniform float cascoX1; uniform float anchoMax;
  uniform float popa; uniform float mangaPopa;
  varying vec2 vUv;

  // Agua que corre pegada al casco en x (más donde se forma la ola de proa).
  float costado( float x, float az, float q ) {
    float fx = ( x - cascoX0 ) / ( cascoX1 - cascoX0 );
    float wC = ( anchoMax > 0.0 && fx > 0.0 && fx < 1.0 ) ? texture2D( anchoCasco, vec2( fx, 0.5 ) ).r * anchoMax : 0.0;
    if ( wC < 0.02 ) return 0.0;
    float dC = az - wC;
    float proa = smoothstep( 0.3, 0.72, fx );
    float banda = 0.08 + q * ( 0.18 + 0.4 * proa );
    // Al planear la proa sale del agua: ahí no hay espuma.
    return ( 1.0 - smoothstep( 0.0, banda, dC ) ) * step( -0.12, dC ) * q * ( 0.4 + 0.6 * proa ) * ( 1.0 - q * smoothstep( 0.74, 0.86, fx ) );
  }

  void main() {
    // Lugar de esta celda en el barco (el campo va "desfase" detrás del agua).
    vec2 p = vec2( mix( dominio.x, dominio.y, vUv.x ) - desfase, mix( dominio.z, dominio.w, vUv.y ) );
    vec2 fp = p + avance;
    float dx = popa - p.x;
    float az = abs( p.y );

    // 1. Arrastre: celdas enteras hacia popa (sin borronear), la estela se
    //    abre despacio hacia los costados y serpentea un poco con el agua.
    float abre = mix( 0.24, 0.08, smoothstep( 10.0, 60.0, dx ) ) * smoothstep( 0.5, 4.0, dx );
    float deriva = ( texture2D( ruido, fp * 0.021 ).g - 0.5 ) * 0.12;
    float z = p.y * ( 1.0 - abre * dt ) - deriva * dt;
    vec2 desde = vec2( vUv.x + corrimiento * texel.x, ( z - dominio.z ) / ( dominio.w - dominio.z ) );
    vec4 s = desde.x < 1.0 ? texture2D( previo, desde ) : vec4( 0.0 );
    // Al abrirse se diluye (la misma espuma en más agua).
    s.rgb *= 1.0 - min( abre * dt * 0.7, 0.5 );

    // 2. Envejece: la espuma fresca se rompe en espuma vieja (el encaje que
    //    queda flotando), que se disuelve mucho más lento.
    float pasa = s.r * ( 1.0 - exp( -dt / 0.9 ) );
    s.r -= pasa;
    s.g = s.g * exp( -dt / 16.0 ) + pasa * 0.6;
    s.b *= exp( -dt / 9.0 );
    s.a *= exp( -dt / 22.0 );

    // 3. Fuentes (sólo navegando). En este cuadro la celda vino de x + paso
    //    hasta x: se toma lo más fuerte de ese camino (y lo que envejeció
    //    desde ahí), así no quedan huecos aunque un cuadro dure mucho.
    float q = clamp( velN, 0.0, 1.0 );
    if ( q > 0.002 ) {
      vec4 n = texture2D( ruido, fp * 0.23 );
      float vetas = texture2D( ruido, fp * vec2( 0.03, 0.4 ) ).r;
      float porSeg = 1.0 / max( vel, 0.05 );
      // Costados: el agua que corre pegada al casco.
      float a = max( p.x, popa ), b = min( p.x + paso, cascoX1 );
      if ( a <= b ) {
        float m = ( a + b ) * 0.5;
        float lado = max( max( costado( a, az, q ) * exp( -( a - p.x ) * porSeg / 0.9 ),
          costado( m, az, q ) * exp( -( m - p.x ) * porSeg / 0.9 ) ), costado( b, az, q ) * exp( -( b - p.x ) * porSeg / 0.9 ) );
        s.r = max( s.r, lado * ( 0.5 + 0.75 * n.r ) );
        s.g = max( s.g, lado * 0.4 );
        s.b = max( s.b, lado * 0.55 );
      }
      // Espejo de popa: el agua de las hélices y la que se cierra detrás del
      // casco, blanca y revuelta, de todo el ancho de la popa.
      float dxP = clamp( 0.8, dx - paso, dx );
      if ( dxP > -0.2 && dxP < 2.2 ) {
        float ancho = mangaPopa * ( 0.9 + 0.08 * dxP ) * ( 0.85 + 0.3 * n.g );
        float chorro = ( 1.0 - smoothstep( ancho * 0.75, ancho * 1.1, az ) ) * smoothstep( -0.2, 0.25, dxP ) * ( 1.0 - smoothstep( 1.4, 2.2, dxP ) ) * q;
        float edad = ( dx - dxP ) * porSeg;
        s.r = max( s.r, chorro * ( 0.8 + 0.5 * vetas ) * exp( -edad / 0.9 ) );
        s.g = max( s.g, chorro * ( 0.7 + 0.45 * n.g ) * exp( -edad / 16.0 ) );
        s.b = max( s.b, chorro * exp( -edad / 9.0 ) );
      }
      // Olas de popa: al romper, sus crestas dejan espuma a su paso (se toma
      // el punto del camino donde la cresta cruzó esta celda).
      float dxL = clamp( ( az - mangaPopa * 0.95 ) / 0.34, dx - paso, dx );
      if ( dxL > 0.0 && dxL < 14.0 ) {
        float lineaV = mangaPopa * 0.95 + dxL * 0.34;
        float t = ( az - lineaV ) / ( 0.2 + dxL * 0.03 );
        float rompe = exp( -t * t * 2.5 ) * smoothstep( 0.0, 1.2, dxL ) * ( 1.0 - smoothstep( 4.0, 14.0, dxL ) ) * q * exp( -( dx - dxL ) * porSeg / 16.0 );
        s.g = max( s.g, rompe * 0.45 * smoothstep( 0.25, 0.75, n.b * 0.7 + n.r * 0.5 ) );
        s.b = max( s.b, rompe * 0.12 );
      }
    }
    // Historia: la velocidad del barco cuando esta agua pasó por su popa.
    if ( dx - paso < 0.3 ) s.a = q;
    gl_FragColor = vec4( s.r, min( s.g, 1.3 ), s.b, s.a );
  }
`;

/* renderer: el WebGLRenderer. flot: el casco en la flotación (anchoFlotacion).
   ruido: la textura del mar (ambiente.js). ancho: el ancho del casco como textura. */
export function crearEstela(renderer, flot, ruido, ancho, { chico = false } = {}) {
  const W = chico ? 512 : 1024, H = chico ? 256 : 512;
  // 120 unidades detrás de la popa (≈ 160 m) y 16 a cada lado.
  const dominio = new THREE.Vector4(flot.popa - 120, flot.x1 + 1.5, -16, 16);
  const texelX = (dominio.y - dominio.x) / W;
  const opciones = {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  };
  const destinos = [new THREE.WebGLRenderTarget(W, H, opciones), new THREE.WebGLRenderTarget(W, H, opciones)];
  const uniforms = {
    previo: { value: null }, ruido: { value: ruido }, anchoCasco: { value: ancho },
    dominio: { value: dominio }, texel: { value: new THREE.Vector2(1 / W, 1 / H) },
    corrimiento: { value: 0 }, desfase: { value: 0 }, dt: { value: 0 }, paso: { value: 0 }, vel: { value: 0 }, velN: { value: 0 }, avance: { value: new THREE.Vector2() },
    cascoX0: { value: flot.x0 }, cascoX1: { value: flot.x1 }, anchoMax: { value: ancho ? flot.max : 0 },
    popa: { value: flot.popa }, mangaPopa: { value: flot.mangaPopa },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }",
    fragmentShader: FRAGMENTO,
    depthTest: false, depthWrite: false,
  });
  const cuadro = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  cuadro.frustumCulled = false;
  const camara = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Las dos texturas empiezan en cero (agua sin espuma).
  const antes = renderer.getRenderTarget();
  const colorAntes = renderer.getClearColor(new THREE.Color());
  const alfaAntes = renderer.getClearAlpha();
  renderer.setClearColor(0x000000, 0);
  destinos.forEach(d => { renderer.setRenderTarget(d); renderer.clear(true, false, false); });
  renderer.setRenderTarget(antes);
  renderer.setClearColor(colorAntes, alfaAntes);

  let actual = 0, resto = 0;
  return {
    dominio,
    get textura() { return destinos[actual].texture; },
    // Lo que el agua ya avanzó y el campo todavía no (menos de una celda).
    get desfase() { return resto * texelX; },
    // vel: velocidad del barco (unidades/s); velN: la misma, 0 a 1 (crucero).
    actualizar(dt, vel, velN, avance) {
      resto += (vel * dt) / texelX;
      const corrimiento = Math.floor(resto);
      resto -= corrimiento;
      uniforms.previo.value = destinos[actual].texture;
      uniforms.corrimiento.value = corrimiento;
      uniforms.desfase.value = resto * texelX;
      uniforms.dt.value = Math.min(dt, 10);
      uniforms.paso.value = vel * dt;
      uniforms.vel.value = vel;
      uniforms.velN.value = velN;
      uniforms.avance.value.copy(avance);
      const previo = renderer.getRenderTarget();
      renderer.setRenderTarget(destinos[1 - actual]);
      renderer.render(cuadro, camara);
      renderer.setRenderTarget(previo);
      actual = 1 - actual;
    },
    dispose() {
      destinos.forEach(d => d.dispose());
      material.dispose();
      cuadro.geometry.dispose();
    },
  };
}
