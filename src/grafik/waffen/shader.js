// ZWECK: Shader der Flak-Effekte (Leuchtspur, Glühen = Mündungsblitz + Detonationskern, Rauchwolke mit Fake-Licht).
// LIEFERT: spurMaterial(), gluehMaterial(), rauchMaterial() → THREE.ShaderMaterial (gemeinsame Uniform uPixel)
// REGEL: Alle Effekte sind Billboards auf InstancedBufferGeometry (ein Draw-Call je Art), Welt-Koordinaten in den
//        Attributen, Mesh im Ursprung. HDR gedeckelt (min 30), pow nur mit max(basis, 0). Kein Licht in der Szene nötig.
import * as THREE from 'three';

/** Weltmeter je Bildschirmpixel in 1 m Entfernung (vom Grafikmodul jedes Bild gesetzt). */
export const uPixel = { value: 0.001 };

const additiv = { side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending };

// ---------- Leuchtspur: Band zwischen Schweif und Kopf, zur Kamera gedreht ----------
export function spurMaterial() {
  return new THREE.ShaderMaterial({
    ...additiv,
    uniforms: { uPixel, uBreite: { value: 0.7 } },
    vertexShader: /* glsl */`
      attribute vec3 aKopf; attribute vec3 aSchweif; attribute float aHell;
      uniform float uPixel; uniform float uBreite;
      varying vec2 vUv; varying float vHell;
      void main() {
        vec3 p = mix(aSchweif, aKopf, position.y);
        vec3 achse = aKopf - aSchweif + vec3(0.0, 1e-4, 0.0);
        vec3 zurKam = cameraPosition - p;
        vec3 seite = normalize(cross(achse, zurKam) + vec3(1e-6));
        // WARUM Mindestbreite + Helligkeit x Flaechenverhaeltnis: ferne Spuren duenner als 1 px blinken sonst unter Bloom
        float b = max(uBreite, 1.5 * uPixel * length(zurKam));
        vHell = aHell * uBreite / b;
        p += seite * position.x * b * 0.5;
        vUv = position.xy;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying float vHell;
      void main() {
        float quer = max(1.0 - abs(vUv.x), 0.0);
        float laengs = pow(max(vUv.y, 0.0), 1.6);
        vec3 farbe = mix(vec3(1.0, 0.42, 0.10), vec3(1.0, 0.85, 0.55), laengs * quer) * vHell * quer * quer * laengs;
        gl_FragColor = vec4(min(farbe, vec3(30.0)), 1.0);
      }`,
  });
}

// ---------- Glühen: runder additiver Fleck (Blitz, Kern) ----------
export function gluehMaterial() {
  return new THREE.ShaderMaterial({
    ...additiv,
    uniforms: { uPixel },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aGroesse; attribute vec3 aFarbe;
      uniform float uPixel;
      varying vec2 vUv; varying vec3 vFarbe;
      void main() {
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        float r = min(aGroesse, 300.0 * uPixel * max(-mv.z, 0.0)); // <= 300 px Bildschirmradius (Ueberzeichnen)
        mv.xy += position.xy * r;
        vUv = position.xy; vFarbe = aFarbe;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vFarbe;
      void main() {
        float d = length(vUv);
        float f = max(1.0 - d, 0.0);
        f = f * f * (0.35 + 0.65 * f * f); // heller Kern, weicher Saum
        gl_FragColor = vec4(min(vFarbe * f, vec3(30.0)), 1.0);
      }`,
  });
}

// ---------- Rauch: dunkle Kugel mit Fake-Beleuchtung (Lichtsetzer, Frühwarnung R6) ----------
export function rauchMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.DoubleSide, transparent: true, depthWrite: false, depthTest: true,
    // vormultipliertes Alpha: Farbe·a + Ziel·(1 − a)
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, premultipliedAlpha: true,
    uniforms: { uPixel, uSonne: { value: new THREE.Vector3(0, 0, 1) } },
    vertexShader: /* glsl */`
      attribute vec3 aPos; attribute float aRadius; attribute float aAlpha; attribute float aGlut; attribute float aSaat;
      uniform float uPixel;
      varying vec2 vUv; varying float vAlpha; varying float vGlut; varying float vSaat;
      void main() {
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        float dist = max(-mv.z, 0.0);
        float r = min(aRadius, 300.0 * uPixel * dist);
        // WARUM ausblenden nahe der Kamera: eine Wolke, die das Bild fuellt, kostet viel Fuellrate und verdeckt alles
        vAlpha = aAlpha * smoothstep(aRadius * 0.6 + 3.0, aRadius * 1.6 + 30.0, dist);
        mv.xy += position.xy * r;
        vUv = position.xy; vGlut = aGlut; vSaat = aSaat;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSonne; // Sonnenrichtung im Kamera-Raum
      varying vec2 vUv; varying float vAlpha; varying float vGlut; varying float vSaat;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float rausch(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        float r2 = dot(vUv, vUv);
        if (r2 >= 1.0 || vAlpha <= 0.002) discard;
        // zwei Rauschzugriffe (Lichtsetzer: <= 2) -> Klumpen am Rand und in der Normale
        float n1 = rausch(vUv * 2.6 + vSaat * 17.0), n2 = rausch(vUv * 6.3 - vSaat * 9.0);
        float rs = n1 * 0.65 + n2 * 0.35 - 0.5;
        vec3 n = normalize(vec3(vUv + rs * 0.5, sqrt(1.0 - r2)));
        float dichte = 1.0 - smoothstep(0.25, 1.0, sqrt(r2) + rs * 0.55); // WARUM so: smoothstep mit edge0 > edge1 ist in GLSL undefiniert
        float wrap = clamp((dot(n, uSonne) + 0.5) / 1.5, 0.0, 1.0);
        vec3 farbe = vec3(0.2, 0.19, 0.18) * (wrap * 4.0 * 0.8 + 0.05);             // Albedo 0,2 x Wrap x 4
        farbe += vec3(1.0, 0.93, 0.82) * 0.8 * pow(max(1.0 - n.z, 0.0), 2.0) * max(-uSonne.z, 0.0); // Silberrand Gegenlicht
        farbe += vec3(4.5, 1.7, 0.45) * vGlut * pow(max(n.z, 0.0), 3.0) * (0.6 + n1);              // Innenglut 0,4 s
        float a = dichte * vAlpha;
        gl_FragColor = vec4(min(farbe, vec3(30.0)) * a, a);
      }`,
  });
}
