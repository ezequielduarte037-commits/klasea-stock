/* ═══════════════════════════════════════════════════════════════
   Configurador · agua
   El mar: una malla densa que sigue a la cámara, olas de Gerstner en el
   vértice, la estela (forma y espuma) y un sombreado propio:
   · Reflejo del cielo y del barco ubicado de verdad: cada ondita refleja
     hacia donde apunta su inclinación, y lo que está cerca del agua (el
     casco) se corre menos que el cielo. Así el casco se refleja nítido
     junto a la flotación y se quiebra en vetas más lejos.
   · Fresnel del agua (2 %), el azul del fondo, la luz que atraviesa las
     crestas a contraluz y destellos del sol que se abren con la distancia.
   · Espuma: el campo de la estela (estela.js) dice cuánta hay; el dibujo
     (grumos de encaje, ambiente.js) se corta según ese espesor: densa y
     blanca al salir de las hélices, encaje después, hilos al final.
   Escala: 1 unidad ≈ 1,36 m. Proa +x, babor −z.
═══════════════════════════════════════════════════════════════ */
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { OLAS_GLSL, uniformsOlas, mallaAgua } from "./olas";

/* Forma de la estela (la usan el vértice y el píxel). */
const ESTELA_GLSL = /* glsl */`
  uniform sampler2D anchoCasco;
  uniform float cascoX0; uniform float cascoX1; uniform float anchoMax;
  uniform float popa; uniform float mangaPopa; uniform float velocidad;
  uniform sampler2D estelaTex; uniform vec4 estelaDom; uniform float estelaDesfase;
  // Medio ancho del casco en la flotación a la altura x.
  float anchoEn( float x ) {
    float fx = ( x - cascoX0 ) / ( cascoX1 - cascoX0 );
    return ( anchoMax > 0.0 && fx > 0.0 && fx < 1.0 ) ? texture2D( anchoCasco, vec2( fx, 0.5 ) ).r * anchoMax : 0.0;
  }
  // Velocidad (0 a 1) que traía el barco cuando el agua de x pasó por su popa.
  float historia( float x ) {
    float u = ( x + estelaDesfase - estelaDom.x ) / ( estelaDom.y - estelaDom.x );
    return ( u > 0.0 && u < 1.0 ) ? texture2D( estelaTex, vec2( u, 0.5 ) ).a * smoothstep( 0.0, 0.2, u ) : 0.0;
  }
  // Alto del agua que mueve el barco: ola de proa pegada al casco, seno y
  // lomo detrás del espejo y las olas divergentes de la V (ángulo de
  // Kelvin) con sus crestas escalonadas. Las de popa quedan donde el barco
  // pasó (historia): crecen detrás al zarpar y se apagan al detenerse.
  float alturaEstela( vec2 p, float hist, float wC ) {
    float az = abs( p.y );
    float h = 0.0;
    if ( wC > 0.02 && velocidad > 0.01 ) {
      float fx = ( p.x - cascoX0 ) / ( cascoX1 - cascoX0 );
      float dC = max( az - wC, 0.0 );
      h += 0.16 * velocidad * smoothstep( 0.35, 0.75, fx ) * exp( -dC / 0.45 ) * ( 1.0 - smoothstep( 0.8, 0.95, fx ) );
    }
    float dx = popa - p.x;
    if ( dx > 0.0 && hist > 0.003 ) {
      float abre = mangaPopa * 0.85 + dx * 0.05;
      float lado = az / max( abre, 0.01 );
      h -= 0.1 * exp( -dx / 1.6 ) * exp( -lado * lado * 1.5 ) * hist;
      h += 0.17 * exp( -( dx - 3.2 ) * ( dx - 3.2 ) / 7.0 ) * exp( -lado * lado * 1.2 ) * hist;
      float lineaV = mangaPopa * 0.95 + dx * 0.34;
      float t = ( az - lineaV ) / ( 0.32 + dx * 0.035 );
      float brazo = exp( -t * t * 2.2 ) - 0.4 * exp( -( t + 1.4 ) * ( t + 1.4 ) * 2.2 );
      h += 0.2 * exp( -dx / 32.0 ) * smoothstep( 0.0, 2.0, dx ) * brazo * ( 0.72 + 0.28 * sin( dx * 1.15 - az * 0.5 ) ) * hist;
    }
    return h;
  }
`;

const VERTICE = /* glsl */`
  uniform vec2 avance;
  attribute float pasoMalla;
  varying vec4 worldPosition;
  varying vec3 vNormalOla;
  varying float vAltura;
  ${ESTELA_GLSL}
  #include <common>
  #include <fog_pars_vertex>
  #include <shadowmap_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  ${OLAS_GLSL}
  void main() {
    vec4 wp = modelMatrix * vec4( position, 1.0 );
    float apagado = 1.0 - smoothstep( 120.0, 420.0, distance( wp.xz, cameraPosition.xz ) );
    // Junto al casco el mar se calma un poco (el barco lo "aplana"): las
    // crestas no suben a la planchada.
    float wC = anchoEn( wp.x );
    apagado *= wC > 0.02 ? mix( 0.6, 1.0, smoothstep( 0.0, 1.4, abs( wp.z ) - wC ) ) : 1.0;
    vec3 n;
    vec3 d = gerstner( wp.xz + avance, apagado, pasoMalla, n );
    vAltura = d.y;
    d.y += alturaEstela( wp.xz, historia( wp.x ), wC );
    wp.xyz += d;
    vNormalOla = n;
    worldPosition = wp;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <beginnormal_vertex>
    #include <defaultnormal_vertex>
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
    #include <shadowmap_vertex>
  }
`;

const FRAGMENTO = /* glsl */`
  uniform sampler2D mirrorSampler;
  uniform float alpha;
  uniform float time;
  uniform float size;
  uniform sampler2D normalSampler;
  uniform vec3 sunColor;
  uniform vec3 sunDirection;
  uniform vec3 eye;
  uniform vec3 waterColor;
  uniform mat4 textureMatrix;
  uniform vec2 avance;
  uniform float reflejo;
  uniform float oleaje;
  uniform float fuerzaOla;
  uniform float crestas;
  uniform vec3 colorSSS;
  uniform sampler2D ruidoEspuma;
  uniform vec3 luzEspuma;
  uniform vec3 colorAireada;
  uniform float subacuatica;
  uniform vec3 colorSub;
  varying vec4 worldPosition;
  varying vec3 vNormalOla;
  varying float vAltura;
  ${ESTELA_GLSL}

  #include <common>
  #include <packing>
  #include <bsdfs>
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>
  #include <shadowmask_pars_fragment>

  // Relieve fino del mapa de normales (el de Water: dos escalas de rizos y
  // dos muy grandes que lo varían).
  vec4 getNoise( vec2 uv ) {
    vec2 uv0 = ( uv / 103.0 ) + vec2( time / 17.0, time / 29.0 );
    vec2 uv1 = uv / 107.0 - vec2( time / -19.0, time / 31.0 );
    vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
    vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
    vec4 noise = texture2D( normalSampler, uv0 ) + texture2D( normalSampler, uv1 ) +
      texture2D( normalSampler, uv2 ) + texture2D( normalSampler, uv3 );
    return noise * 0.5 - 1.0;
  }

  // Campo de la estela en p (se apaga contra los bordes de la simulación).
  vec4 estelaEn( vec2 p ) {
    vec2 su = vec2( ( p.x + estelaDesfase - estelaDom.x ) / ( estelaDom.y - estelaDom.x ), ( p.y - estelaDom.z ) / ( estelaDom.w - estelaDom.z ) );
    if ( su.x <= 0.0 || su.x >= 1.0 || su.y <= 0.0 || su.y >= 1.0 ) return vec4( 0.0 );
    vec4 s = texture2D( estelaTex, su );
    float borde = smoothstep( 0.0, 0.3, su.x ) * ( 1.0 - smoothstep( 0.8, 1.0, abs( su.y * 2.0 - 1.0 ) ) );
    return vec4( s.rgb * borde, s.a );
  }

  // Distancia horizontal al casco (una caja alrededor de la flotación).
  float distCasco( vec2 p ) {
    vec2 c = vec2( ( popa - 0.6 + cascoX1 ) * 0.5, 0.0 );
    vec2 h = vec2( ( cascoX1 - popa + 0.6 ) * 0.5, max( anchoMax, 0.5 ) );
    vec2 d = abs( p - c ) - h;
    return length( max( d, 0.0 ) ) + min( max( d.x, d.y ), 0.0 );
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 haciaOjo = eye - worldPosition.xyz;
    float dist = length( haciaOjo );
    vec3 ojo = haciaOjo / dist;
    vec2 bp = worldPosition.xz;
    vec2 fp = bp + avance;
    float az = abs( bp.y );
    float wC = anchoEn( bp.x );
    float dC = az - wC;
    float dx = popa - bp.x;

    // ── Estela: el campo simulado y la forma de sus olas (normal por píxel:
    //    las crestas de la V quedan nítidas aunque la malla sea rala).
    vec4 sim = estelaEn( bp );
    float hist = historia( bp.x );
    float he = alturaEstela( bp, hist, wC );
    float ex = alturaEstela( bp + vec2( 0.08, 0.0 ), hist, wC ) - he;
    float ez = alturaEstela( bp + vec2( 0.0, 0.08 ), hist, wC ) - he;
    vec3 nOla = normalize( vNormalOla + vec3( -ex, 0.0, -ez ) / 0.08 );

    // ── Rizos del viento, y otros más finos cerca de la cámara.
    vec4 rz = getNoise( fp * size );
    vec2 rizo = rz.xy * 1.5;
    float cerca = 1.0 - smoothstep( 4.0, 36.0, dist );
    if ( cerca > 0.001 ) {
      vec2 uvC = fp * size;
      vec4 c1 = texture2D( normalSampler, uvC / 17.0 + vec2( time / 6.0, -time / 8.5 ) );
      vec4 c2 = texture2D( normalSampler, uvC / 23.0 - vec2( time / 9.5, time / 7.0 ) );
      rizo += ( c1.xy + c2.xy - 1.0 ) * 0.8 * cerca;
    }
    // La estela vieja alisa el agua (la franja lisa que deja un barco); la
    // recién revuelta la pica.
    float revuelta = smoothstep( 0.4, 1.0, sim.b );
    float lisa = clamp( sim.g * 0.8 - sim.b, 0.0, 1.0 ) * 0.5;
    vec3 n = normalize( nOla + vec3( rizo.x, 0.0, rizo.y ) * oleaje * ( 1.0 - lisa ) );
    if ( revuelta > 0.01 ) {
      float t1 = texture2D( ruidoEspuma, fp * 0.8 + vec2( time * 0.05, 0.0 ) ).r;
      float t2 = texture2D( ruidoEspuma, fp * 0.55 - vec2( 0.0, time * 0.06 ) ).r;
      n = normalize( n + vec3( t1 - 0.5, 0.0, t2 - 0.5 ) * 1.4 * revuelta );
    }

    // ── Reflejo: lo que ve cada inclinación. Para el cielo (lejos) el
    //    corrimiento es el ángulo entero; para el casco (cerca) es menor.
    vec3 V = -ojo;
    vec3 R0 = vec3( V.x, -V.y, V.z );
    vec3 R = reflect( V, n );
    R.y = max( R.y, 0.02 );
    float sC = max( distCasco( bp ), 0.0 ) + 0.3;
    vec4 mq = textureMatrix * vec4( worldPosition.xyz + ( R - R0 ) * dist * sC / ( sC + dist ), 1.0 );
    // (si el rayo se fuera detrás de la cámara del reflejo, el agua plana)
    if ( mq.w < 0.05 ) mq = textureMatrix * worldPosition;
    vec2 rUv = clamp( mq.xy / mq.w, 0.0, 1.0 );
    float rr = 0.0022;
    vec3 cielo = ( texture2D( mirrorSampler, rUv ).rgb * 2.0
      + texture2D( mirrorSampler, rUv + vec2( rr, 0.0 ) ).rgb + texture2D( mirrorSampler, rUv - vec2( rr, 0.0 ) ).rgb
      + texture2D( mirrorSampler, rUv + vec2( 0.0, rr * 2.5 ) ).rgb + texture2D( mirrorSampler, rUv - vec2( 0.0, rr * 2.5 ) ).rgb ) / 6.0;
    float cosT = clamp( dot( ojo, n ), 0.0, 1.0 );
    float fres = reflejo + ( 1.0 - reflejo ) * pow( 1.0 - cosT, 5.0 );

    // ── El agua desde adentro: azul del fondo, más oscuro a la sombra del
    //    barco y pegado al casco, y verde agua en las crestas a contraluz.
    float sombra = getShadowMask();
    vec3 cuerpo = waterColor * ( 0.6 + 0.4 * cosT );
    vec3 haciaSol = normalize( vec3( sunDirection.x, 0.0, sunDirection.z ) + vec3( 0.0, 1e-4, 0.0 ) );
    float contraluz = pow( max( 0.0, dot( normalize( vec3( -ojo.x, 0.0, -ojo.z ) + vec3( 0.0, 1e-4, 0.0 ) ), haciaSol ) ), 3.0 );
    cuerpo += colorSSS * contraluz * smoothstep( -0.02, 0.12 * fuerzaOla, vAltura + he ) * ( 0.6 + 1.6 * ( 1.0 - n.y ) );
    float sombraCasco = wC > 0.02 ? ( 1.0 - smoothstep( -0.05, 0.7, dC ) ) * 0.35 * ( 1.0 - velocidad * 0.5 ) : 0.0;
    cuerpo *= ( 1.0 - sombraCasco ) * ( 0.7 + 0.3 * sombra );

    // ── Espuma. Dibujos que viajan con el agua: el encaje en dos escalas,
    //    burbujas finas, manchas grandes, mármol (agua aireada) y vetas
    //    estiradas en el sentido de la marcha.
    vec2 uvA = fp * 0.27 + vec2( time * 0.011, 0.0 );
    float pA = texture2D( ruidoEspuma, uvA ).b;
    float pB = texture2D( ruidoEspuma, fp * 0.105 + vec2( 0.37, time * 0.006 ) ).b;
    float fino = texture2D( ruidoEspuma, fp * 1.9 + vec2( time * 0.03 ) ).r;
    vec4 lento = texture2D( ruidoEspuma, fp * 0.05 + vec2( 0.0, time * 0.003 ) );
    float vetas = texture2D( ruidoEspuma, fp * vec2( 0.05, 0.6 ) + vec2( 0.0, time * 0.01 ) ).r;
    float patron = mix( pA, pB, 0.38 ) + ( fino - 0.5 ) * 0.12;
    // Espesor: lo que dejó el barco, el borde en reposo y crestas con viento.
    float esp = sim.r * ( 0.8 + 0.45 * vetas ) + sim.g * ( 0.06 + 0.26 * lento.g ) * ( 0.6 + 0.8 * vetas );
    float contacto = wC > 0.02 ? ( 1.0 - smoothstep( 0.0, 0.08 + 0.06 * fino, dC ) ) * step( -0.06, dC ) * ( 1.0 - velocidad ) * 0.55 : 0.0;
    // Con viento rompen las crestas más altas: manchas blancas sueltas.
    float cresta = crestas * smoothstep( 0.7, 1.05, vAltura / ( 0.14 * fuerzaOla ) ) * smoothstep( 0.55, 0.85, lento.g ) * smoothstep( 0.3, 0.7, pB );
    // Las olas de popa rompen cerca del barco (crestas blancas sueltas);
    // más lejos son sólo lomos de agua.
    float crestaEstela = smoothstep( 0.07, 0.16, he ) * hist * ( 1.0 - smoothstep( 5.0, 16.0, dx ) ) * smoothstep( 0.3, 0.75, lento.g * 0.6 + pB * 0.6 ) * 0.6;
    // Aun la espuma más densa deja ver algún agujero.
    esp = min( esp + contacto + cresta * 0.45 + crestaEstela, 0.95 );
    float corte = 1.0 - esp;
    float borde = smoothstep( corte, corte + 0.09, patron );
    // La espuma fina deja ver el agua; la gruesa es blanca y opaca.
    float grueso = smoothstep( corte, corte + 0.4, patron );
    float cubre = borde * ( 0.55 + 0.45 * grueso ) * smoothstep( 0.02, 0.12, esp );
    // Agua aireada: las burbujas bajo la superficie la vuelven turquesa lechoso.
    float aire = clamp( sim.b * 1.15, 0.0, 1.0 ) * ( 0.5 + 0.7 * lento.a ) * ( 0.8 + 0.4 * vetas );
    cuerpo = mix( cuerpo, colorAireada * ( 0.75 + 0.5 * pA ), clamp( aire, 0.0, 1.0 ) * 0.75 );

    // ── Destellos del sol: finos cerca; lejos, donde los rizos ya no se
    //    distinguen, se abren en un camino de brillos.
    vec3 Rs = reflect( -sunDirection, n );
    float alinea = max( dot( ojo, Rs ), 0.0 );
    float brillo = mix( 900.0, 140.0, smoothstep( 10.0, 280.0, dist ) );
    vec3 destello = sunColor * pow( alinea, brillo ) * ( brillo + 8.0 ) / 54.0;

    vec3 color = mix( cuerpo, cielo, fres ) + destello * sombra * ( 0.3 + 0.7 * fres ) * ( 1.0 - cubre );
    // Luces subacuáticas: el agua de popa se ilumina desde abajo.
    if ( subacuatica > 0.001 ) {
      float lx = bp.x - ( popa - 0.35 );
      float brilloSub = exp( -( lx * lx * 0.9 + ( az - 0.55 ) * ( az - 0.55 ) * 1.6 ) );
      color += colorSub * brilloSub * subacuatica * 2.4 * ( 1.0 - cubre * 0.6 );
    }
    // La espuma tiene volumen: grumos (de unos 5 cm) con su lado al sol y su
    // lado en sombra. La pendiente sale del mismo dibujo, muestreado al lado.
    float hx = texture2D( ruidoEspuma, uvA + vec2( 0.04 * 0.27, 0.0 ) ).b - pA;
    float hz = texture2D( ruidoEspuma, uvA + vec2( 0.0, 0.04 * 0.27 ) ).b - pA;
    vec3 nE = normalize( n + vec3( -hx, 0.0, -hz ) * 1.6 );
    float grumo = clamp( ( dot( nE, sunDirection ) - dot( n, sunDirection ) ) / max( sunDirection.y, 0.35 ), -1.0, 1.0 );
    vec3 colEsp = luzEspuma * ( 0.88 + 0.22 * grumo ) * mix( 0.55, 1.0, sombra ) * ( 0.8 + 0.2 * grueso ) * ( 0.88 + 0.12 * vetas );
    color = mix( color, colEsp, cubre );
    gl_FragColor = vec4( color, alpha );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/* El agua con su material. flot: el casco en la flotación (anchoFlotacion);
   anchoTex: su ancho como textura; estela: la simulación (estela.js). */
export function crearAgua({ normales, ruido, flot, anchoTex, estela, chico }) {
  // El reflejo con la forma de la pantalla (en un celular parado, un
  // cuadrado de 512 dejaba el reflejo del casco escalonado).
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const lado = v => Math.round(THREE.MathUtils.clamp(v * dpr * 0.6, 512, 1536));
  const malla = mallaAgua(chico ? 220 : 340);
  const agua = new Water(malla.geo, {
    textureWidth: lado(window.innerWidth), textureHeight: lado(window.innerHeight), waterNormals: normales,
    sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x06222c, fog: true,
  });
  agua.rotation.x = -Math.PI / 2;
  agua.frustumCulled = false;
  // Recibe la sombra del barco.
  agua.receiveShadow = true;
  agua.userData.paso = malla.paso;
  const u = agua.material.uniforms;
  // El reflejo en HDR: el cielo junto al sol y las nubes iluminadas brillan
  // también en el agua (el resplandor los abre).
  u.mirrorSampler.value.type = THREE.HalfFloatType;
  Object.assign(u, uniformsOlas(), {
    avance: { value: new THREE.Vector2() },
    // Fresnel del agua real (2 %): oscura mirando hacia abajo, espejo en el horizonte.
    reflejo: { value: 0.02 }, oleaje: { value: 0.95 }, crestas: { value: 0 }, colorSSS: { value: new THREE.Color("#1f8a7c") },
    ruidoEspuma: { value: ruido }, anchoCasco: { value: anchoTex },
    cascoX0: { value: flot.x0 }, cascoX1: { value: flot.x1 }, anchoMax: { value: anchoTex ? flot.max : 0 },
    popa: { value: flot.popa }, mangaPopa: { value: flot.mangaPopa }, velocidad: { value: 0 },
    estelaTex: { value: estela.textura }, estelaDom: { value: estela.dominio }, estelaDesfase: { value: 0 },
    luzEspuma: { value: new THREE.Color(1, 1, 1) }, colorAireada: { value: new THREE.Color("#3a8f8c") },
    subacuatica: { value: 0 }, colorSub: { value: new THREE.Color("#2f8dff") },
  });
  u.size.value = 4;
  agua.material.vertexShader = VERTICE;
  agua.material.fragmentShader = FRAGMENTO;
  return agua;
}
