// ZWECK: Der Weltraum-Hintergrund: Nebel und Milchstraßenband, Sterne, Sonne, ein Gasriese.
// LIEFERT: SONNE_RICHTUNG (Welt, zeigt zur Sonne) · erstelleHimmel({ sterne }) → { gruppe, folge(kameraPos), pixel(v) }
// REGEL: Die Gruppe wandert jedes Bild mit der Kamera mit (folge) → alles darin ist „unendlich weit weg“,
//        keine Parallaxe, auch nach vielen Kilometern Flug. Alles ohne Tiefenschreiben/-test, vor dem Rest gezeichnet.
// WARUM ein Gasriese: der leere Raum braucht einen großen, ruhigen Bezugspunkt für Richtung und Lage.
import * as THREE from 'three';
import { zufall } from './zufall.js';

// WARUM diese Lage: Sonne seitlich-vorn → Schiff mit harter Licht/Schatten-Kante aus der Verfolgersicht;
// Planet vorn-rechts fast quer zur Sonne → Halbplanet mit Tag-Nacht-Grenze statt flacher „Vollmond“.
export const SONNE_RICHTUNG = new THREE.Vector3(0.85, 0.38, 0.3).normalize();
const PLANET_RICHTUNG = new THREE.Vector3(-0.5, -0.12, 1).normalize();
const BAND = new THREE.Vector3(0.35, 0.88, -0.3).normalize(); // Normale der Milchstraßen-Ebene
const R_HIMMEL = 25000;

// Wert-Rauschen in GLSL (für Nebel und Planet). WARUM eigenes: kein Zusatz nötig, am Himmel reicht diese Güte.
const GLSL_RAUSCHEN = /* glsl */`
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rausch(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++){ s += a * rausch(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
`;

function nebelMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false,
    uniforms: { band: { value: BAND } },
    vertexShader: /* glsl */`varying vec3 vR; void main(){ vR = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 band; varying vec3 vR;
      ${GLSL_RAUSCHEN}
      void main(){
        vec3 d = normalize(vR);
        float b = dot(d, band);
        float wolke = fbm(d * 2.2);
        float fein = fbm(d * 7.0 + wolke * 1.5);
        // Milchstraße: helles Band mit dunklen Staubbahnen
        float bandHell = exp(-b * b / 0.018) * (0.55 + 0.6 * fein);
        float staub = smoothstep(0.45, 0.75, fbm(d * 5.0 + 3.0)) * exp(-b * b / 0.004);
        bandHell *= 1.0 - 0.8 * staub;
        // Farbnebel: kalt blau-grau und rostig — passt zum industriellen Look, nicht bunt
        float n1 = smoothstep(0.42, 0.85, wolke + 0.25 * fein);
        float n2 = smoothstep(0.55, 0.9, fbm(d * 1.6 + 9.0));
        vec3 c = vec3(0.004, 0.005, 0.009);
        c += vec3(0.018, 0.022, 0.035) * n1;
        c += vec3(0.035, 0.014, 0.006) * n2 * (0.4 + fein);
        c += vec3(0.030, 0.028, 0.026) * bandHell;
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
}

function sterne(pixel) {
  const rnd = zufall(4711);
  const N = 14000;
  const pos = new Float32Array(N * 3), farbe = new Float32Array(N * 3), groesse = new Float32Array(N);
  const v = new THREE.Vector3();
  const FARBEN = [[0.65, 0.75, 1.0], [0.85, 0.9, 1.0], [1, 1, 1], [1, 0.93, 0.8], [1, 0.8, 0.6], [1, 0.62, 0.45]];
  for (let i = 0; i < N; i++) {
    // gleichverteilt auf der Kugel
    const u = rnd() * 2 - 1, w = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    v.set(r * Math.cos(w), u, r * Math.sin(w));
    if (i % 3 === 0) v.addScaledVector(BAND, -v.dot(BAND) * (0.75 + 0.24 * rnd())).normalize(); // Häufung im Band
    v.multiplyScalar(R_HIMMEL * 0.96);
    pos.set([v.x, v.y, v.z], i * 3);
    const m = Math.pow(rnd(), 9);                          // wenige helle, sehr viele schwache
    const hell = 0.08 + 0.25 * rnd() + 5 * m;
    const f = FARBEN[Math.floor(rnd() * FARBEN.length)];
    farbe.set([f[0] * hell, f[1] * hell, f[2] * hell], i * 3);
    groesse[i] = 1.3 + 1.6 * Math.pow(m, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('farbe', new THREE.BufferAttribute(farbe, 3));
  g.setAttribute('groesse', new THREE.BufferAttribute(groesse, 1));
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, transparent: false, // WARUM false: „transparent“ wird NACH dem Schiff gezeichnet und läge ohne Tiefentest darüber (Spieltest R1)
    uniforms: { pixel },
    vertexShader: /* glsl */`
      attribute vec3 farbe; attribute float groesse; uniform float pixel; varying vec3 vF;
      void main(){ vF = farbe; gl_PointSize = groesse * pixel; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vF;
      void main(){ vec2 p = gl_PointCoord - 0.5; float a = exp(-dot(p, p) * 18.0); gl_FragColor = vec4(vF * a, 1.0); }`,
  });
  const p = new THREE.Points(g, mat);
  p.frustumCulled = false;
  return p;
}

function sonnenTextur() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const k = c.getContext('2d');
  const g = k.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.035, 'rgba(255,255,255,1)');
  g.addColorStop(0.06, 'rgba(255,240,215,0.35)');
  g.addColorStop(0.2, 'rgba(255,220,180,0.06)');
  g.addColorStop(1, 'rgba(255,200,160,0)');
  k.fillStyle = g; k.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function sonne() {
  const mat = new THREE.SpriteMaterial({ map: sonnenTextur(), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: false }); // WARUM false: siehe Sterne
  mat.color.setRGB(40, 37, 33); // HDR: Kern deutlich über der Bloom-Schwelle
  const s = new THREE.Sprite(mat);
  s.position.copy(SONNE_RICHTUNG).multiplyScalar(R_HIMMEL * 0.9);
  s.scale.setScalar(R_HIMMEL * 0.9 * 0.5);
  return s;
}

function planet() {
  const D = R_HIMMEL * 0.8, R = D * 0.2;
  const mat = new THREE.ShaderMaterial({
    depthWrite: false, depthTest: false,
    uniforms: { sonne: { value: SONNE_RICHTUNG } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vL; varying vec3 vW;
      void main(){
        vN = normalize(mat3(modelMatrix) * normal);
        vL = normal;                                   // lokale Richtung für die Bänder
        vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 sonne; varying vec3 vN; varying vec3 vL; varying vec3 vW;
      ${GLSL_RAUSCHEN}
      void main(){
        vec3 n = normalize(vN);
        vec3 l = normalize(vL);
        float wirbel = fbm(l * 3.0) - 0.5;
        float breite = l.y + wirbel * 0.12 + (fbm(l * 9.0) - 0.5) * 0.03;
        float baender = fbm(vec3(breite * 14.0, 0.0, 0.0)) ;
        vec3 c = mix(vec3(0.30, 0.20, 0.12), vec3(0.58, 0.44, 0.30), smoothstep(0.3, 0.7, baender));
        c = mix(c, vec3(0.22, 0.27, 0.32), smoothstep(0.55, 0.8, fbm(vec3(breite * 5.0, 1.0, 2.0))));
        c *= 0.6;
        float licht = dot(n, sonne);
        float tag = smoothstep(-0.08, 0.35, licht) * max(licht + 0.1, 0.0);
        vec3 v = normalize(cameraPosition - vW);
        float rand = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = c * tag * 1.1;
        col += vec3(0.25, 0.32, 0.45) * rand * smoothstep(-0.25, 0.4, licht) * 0.8; // dünne Atmosphäre am Rand
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), mat);
  m.position.copy(PLANET_RICHTUNG).multiplyScalar(D);
  m.rotation.set(0.35, 0.4, 0.2); // geneigte Achse → schräge Bänder
  m.frustumCulled = false;
  return m;
}

export function erstelleHimmel({ sterne: mitSternen = true } = {}) {
  const gruppe = new THREE.Group();
  gruppe.name = 'himmel';
  const pixel = { value: 1 };
  const nebel = new THREE.Mesh(new THREE.SphereGeometry(R_HIMMEL, 64, 32), nebelMaterial());
  nebel.frustumCulled = false;
  nebel.renderOrder = -10;
  gruppe.add(nebel);
  if (mitSternen) { const s = sterne(pixel); s.renderOrder = -9; gruppe.add(s); }
  const so = sonne(); so.renderOrder = -8; gruppe.add(so);
  const pl = planet(); pl.renderOrder = -7; gruppe.add(pl);
  return {
    gruppe,
    folge(kameraPos) { gruppe.position.copy(kameraPos); },
    pixel(v) { pixel.value = v; },
  };
}
